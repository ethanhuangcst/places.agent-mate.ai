import { LOCALE_LANG, type Locale } from "../../core/locales";
import { type PlaceCard, type PlaceLocation, type SearchInput } from "../../core/types";
import { type GoogleAdapterConfig } from "./config";
import { workerPlaceToCard } from "./card-mapper";
import { googleDeeplinks } from "./deeplinks";
import { type FetchFn } from "./direct";
import { type DirectionsEta } from "./directions";
import { type TravelMode } from "../../core/itinerary-timed";
import { EgressFailureError, isEgressFailure } from "./egress";

type JsonRpcResponse = {
  result?: {
    tools?: { name: string }[];
    content?: { type: string; text?: string }[];
  };
  error?: { message?: string };
};

let cachedToolNames: string[] | null = null;

function languageCode(locale?: Locale): string {
  if (!locale) return "en";
  return LOCALE_LANG[locale]?.split("-")[0] ?? "en";
}

function regionCode(input: SearchInput): string | undefined {
  if (input.near && input.near.lat > 22 && input.near.lat < 23 && input.near.lng > 113 && input.near.lng < 115) {
    return "HK";
  }
  return undefined;
}

function buildTextQuery(input: SearchInput, kind: "restaurant" | "place"): string {
  const parts: string[] = [];
  if (input.query?.trim()) parts.push(input.query.trim());
  else parts.push(kind === "restaurant" ? "restaurants" : "places");
  if (input.near) {
    parts.push(`near (${input.near.lat}, ${input.near.lng})`);
  } else if (input.address?.trim()) {
    parts.push(input.address.trim());
  }
  return parts.join(" ");
}

export type GoogleMcpClient = {
  searchRestaurants(input: SearchInput): Promise<PlaceCard[]>;
  searchPlaces(input: SearchInput): Promise<PlaceCard[]>;
  getDetails(nativeId: string): Promise<PlaceCard | null>;
  geocode(query: string, locale?: Locale): Promise<PlaceLocation & { address?: string }>;
  reverseGeocode(lat: number, lng: number): Promise<string>;
  directions(input: { from: PlaceLocation; to: PlaceLocation; mode: TravelMode }): Promise<DirectionsEta | null>;
  /** Test hook: how many tools/call invocations */
  callCount: () => number;
};

export function createGoogleMcpClient(
  config: GoogleAdapterConfig,
  fetchFn: FetchFn = fetch,
): GoogleMcpClient {
  if (!config.mcpUrl || !config.mcpBearer) {
    throw new Error("GMAPS_MCP not configured");
  }

  let calls = 0;

  async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.requestTimeoutMs);
    try {
      return await fetchFn(url, { ...init, signal: controller.signal });
    } catch (err) {
      if (isEgressFailure(err)) throw new EgressFailureError();
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  async function rpc(method: string, params: Record<string, unknown>): Promise<JsonRpcResponse> {
    calls += 1;
    const res = await fetchWithTimeout(config.mcpUrl!, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.mcpBearer}`,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: calls, method, params }),
    });
    if (!res.ok) throw new Error(`gmaps_mcp_http_${res.status}`);
    return (await res.json()) as JsonRpcResponse;
  }

  async function ensureToolsListed(): Promise<void> {
    if (cachedToolNames) return;
    const res = await rpc("tools/list", {});
    cachedToolNames = (res.result?.tools ?? []).map((t) => t.name);
    if (!cachedToolNames.includes("search_places")) {
      throw new Error("gmaps_mcp_missing_search_places");
    }
  }

  async function callSearchPlaces(textQuery: string, input: SearchInput): Promise<PlaceCard[]> {
    await ensureToolsListed();
    const res = await rpc("tools/call", {
      name: "search_places",
      arguments: {
        text_query: textQuery,
        language_code: languageCode(input.locale),
        ...(regionCode(input) ? { region_code: regionCode(input) } : {}),
      },
    });
    if (res.error) throw new Error(res.error.message ?? "gmaps_mcp_error");

    const text = res.result?.content?.find((c) => c.type === "text")?.text;
    if (!text) return [];

    const parsed = JSON.parse(text) as { places?: unknown[] };
    const category = textQuery.toLowerCase().includes("restaurant") ? "restaurant" : "place";
    return (parsed.places ?? [])
      .map((p) => workerPlaceToCard(p as Parameters<typeof workerPlaceToCard>[0], category))
      .filter((c): c is PlaceCard => c != null);
  }

  return {
    callCount: () => calls,
    searchRestaurants: (input) => callSearchPlaces(buildTextQuery(input, "restaurant"), input),
    searchPlaces: (input) => callSearchPlaces(buildTextQuery(input, "place"), input),
    async getDetails(nativeId) {
      await ensureToolsListed();
      if (!cachedToolNames!.includes("resolve_names")) {
        return null;
      }
      const res = await rpc("tools/call", {
        name: "resolve_names",
        arguments: {
          queries: [{ text: nativeId }],
        },
      });
      const text = res.result?.content?.find((c) => c.type === "text")?.text;
      if (!text) return null;
      const parsed = JSON.parse(text) as { places?: unknown[] };
      const first = parsed.places?.[0];
      if (!first) return null;
      return workerPlaceToCard(first as Parameters<typeof workerPlaceToCard>[0]);
    },
    async geocode(query, locale) {
      const cards = await callSearchPlaces(`${query} coordinates`, { query, locale });
      const first = cards[0];
      if (!first) throw new Error("gmaps_mcp_geocode_empty");
      return { ...first.location, address: first.address ?? query };
    },
    async reverseGeocode(lat, lng) {
      const cards = await callSearchPlaces(`address at ${lat}, ${lng}`, {
        near: { lat, lng },
      });
      return cards[0]?.address ?? `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    },
    async directions(input) {
      await ensureToolsListed();
      if (!cachedToolNames!.includes("compute_routes")) return null;
      const travelMode = input.mode === "walk" ? "WALK" : "DRIVE";
      const res = await rpc("tools/call", {
        name: "compute_routes",
        arguments: {
          origin: { lat_lng: { latitude: input.from.lat, longitude: input.from.lng } },
          destination: { lat_lng: { latitude: input.to.lat, longitude: input.to.lng } },
          travel_mode: travelMode,
        },
      });
      if (res.error) return null;
      const text = res.result?.content?.find((c) => c.type === "text")?.text;
      if (!text) return null;
      try {
        const parsed = JSON.parse(text) as {
          routes?: { legs?: { duration?: string; distanceMeters?: number }[] }[];
        };
        const leg = parsed.routes?.[0]?.legs?.[0];
        if (!leg?.duration) return null;
        // Duration comes as "123s" string
        const seconds = parseInt(leg.duration.replace(/s$/, ""), 10);
        if (!Number.isFinite(seconds)) return null;
        return {
          duration_min: Math.round(seconds / 60),
          distance_m: leg.distanceMeters,
        };
      } catch {
        return null;
      }
    },
  };
}

/** Reset tool cache between tests. */
export function resetGoogleMcpToolCache(): void {
  cachedToolNames = null;
}

export function mcpDeeplinks(card: PlaceCard): Record<string, string> {
  return googleDeeplinks(card.location, card.name);
}
