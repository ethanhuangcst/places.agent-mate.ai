import { type PlaceCard, type PlaceLocation, type SearchInput } from "../../core/types";
import { type AmapAdapterConfig } from "./config";
import { amapDeeplinks, amapPoiToCard, formatLngLat, parseLngLat, type AmapPoi } from "./card-mapper";
import { amapKeywords } from "./keywords";
import { isEgressFailure } from "../google/egress";

export type FetchFn = typeof fetch;

const DINING_TYPE = "050000";
const DINING_AROUND_RADIUS_M = "1000";
const PLACES_AROUND_RADIUS_M = "15000";
const PAGE_SIZE = "20";

type AmapJson = {
  status?: string;
  infocode?: string | number;
  info?: string;
  pois?: AmapPoi[] | string;
  geocodes?: { location?: string; formatted_address?: string }[] | string;
  locations?: string;
  regeocode?: { formatted_address?: string };
};

function asList<T>(value: T[] | string | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

function assertAmapOk(json: AmapJson, op: string): void {
  if (json.status === "1" && String(json.infocode) === "10000") return;
  throw new Error(`amap_${op}_${json.infocode ?? json.status ?? "failed"}`);
}

async function fetchWithTimeout(
  fetchFn: FetchFn,
  url: string,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchFn(url, { signal: controller.signal });
  } catch (err) {
    if (isEgressFailure(err)) throw new Error("amap_egress_failure");
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export type AmapDirectClient = {
  searchRestaurants(input: SearchInput): Promise<PlaceCard[]>;
  searchPlaces(input: SearchInput): Promise<PlaceCard[]>;
  getDetails(nativeId: string): Promise<PlaceCard | null>;
  geocode(query: string): Promise<PlaceLocation & { address?: string }>;
  reverseGeocode(lat: number, lng: number): Promise<string>;
};

export function createAmapDirectClient(
  config: AmapAdapterConfig,
  fetchFn: FetchFn = fetch,
): AmapDirectClient {
  function apiUrl(path: string, params: Record<string, string | undefined>): string {
    if (!config.apiKey) throw new Error("amap_no_api_key");
    const url = new URL(`${config.baseUrl}${path}`);
    url.searchParams.set("key", config.apiKey);
    for (const [k, v] of Object.entries(params)) {
      if (v != null && v !== "") url.searchParams.set(k, v);
    }
    return url.toString();
  }

  async function getJson(path: string, params: Record<string, string | undefined>): Promise<AmapJson> {
    const res = await fetchWithTimeout(
      fetchFn,
      apiUrl(path, params),
      config.requestTimeoutMs,
    );
    if (!res.ok) throw new Error(`amap_http_${res.status}`);
    return (await res.json()) as AmapJson;
  }

  async function convertGps(lng: number, lat: number): Promise<{ lng: number; lat: number }> {
    const json = await getJson("/v3/assistant/coordinate/convert", {
      locations: formatLngLat(lng, lat),
      coordsys: "gps",
    });
    assertAmapOk(json, "convert");
    const parsed = parseLngLat(json.locations ?? "");
    if (!parsed) throw new Error("amap_convert_empty");
    return parsed;
  }

  async function geocode(query: string): Promise<PlaceLocation & { address?: string }> {
    const json = await getJson("/v3/geocode/geo", { address: query });
    assertAmapOk(json, "geocode");
    const first = asList(json.geocodes)[0];
    const parsed = parseLngLat(first?.location ?? "");
    if (!parsed) throw new Error("amap_geocode_empty");
    return {
      lat: parsed.lat,
      lng: parsed.lng,
      crs: "GCJ-02",
      address: first?.formatted_address,
    };
  }

  async function resolveAroundPin(
    input: SearchInput,
  ): Promise<{ lng: number; lat: number } | null> {
    if (input.near) {
      if (input.near.crs === "GCJ-02") {
        return { lng: input.near.lng, lat: input.near.lat };
      }
      return convertGps(input.near.lng, input.near.lat);
    }
    if (input.address?.trim()) {
      const pin = await geocode(input.address.trim());
      return { lng: pin.lng, lat: pin.lat };
    }
    return null;
  }

  async function searchPois(
    input: SearchInput,
    dining: boolean,
  ): Promise<PlaceCard[]> {
    const keywords = amapKeywords(input);
    const pin = await resolveAroundPin(input);
    const types = dining ? DINING_TYPE : undefined;
    const json = pin
      ? await getJson("/v5/place/around", {
          location: formatLngLat(pin.lng, pin.lat),
          keywords,
          types,
          radius: dining ? DINING_AROUND_RADIUS_M : PLACES_AROUND_RADIUS_M,
          sortrule: "distance",
          page_size: PAGE_SIZE,
          show_fields: "business",
        })
      : await getJson("/v5/place/text", {
          keywords,
          types,
          page_size: PAGE_SIZE,
          show_fields: "business",
        });
    assertAmapOk(json, dining ? "restaurants" : "places");
    const category = dining ? "restaurant" : undefined;
    return asList(json.pois)
      .map((poi) => amapPoiToCard(poi, category))
      .filter((card): card is PlaceCard => card != null);
  }

  return {
    searchRestaurants: (input) => searchPois(input, true),
    searchPlaces: (input) => searchPois(input, false),
    async getDetails(nativeId) {
      const id = nativeId.trim();
      if (!id) return null;
      const json = await getJson("/v5/place/detail", {
        id,
        show_fields: "business",
      });
      assertAmapOk(json, "detail");
      const poi = asList(json.pois)[0];
      return poi ? amapPoiToCard(poi) : null;
    },
    geocode,
    async reverseGeocode(lat, lng) {
      const json = await getJson("/v3/geocode/regeo", {
        location: formatLngLat(lng, lat),
      });
      assertAmapOk(json, "regeo");
      return json.regeocode?.formatted_address ?? formatLngLat(lng, lat);
    },
  };
}

export { amapDeeplinks };
