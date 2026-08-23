import { LOCALE_LANG, type Locale } from "../../core/locales";
import { type PlaceCard, type PlaceLocation, type SearchInput } from "../../core/types";
import { type GoogleAdapterConfig } from "./config";
import { directPlaceToCard } from "./card-mapper";
import { EgressFailureError, isEgressFailure } from "./egress";
import { googleDeeplinks } from "./deeplinks";

export type FetchFn = typeof fetch;

function languageCode(locale?: Locale): string {
  if (!locale) return "en";
  return LOCALE_LANG[locale] ?? "en";
}

function buildSearchText(input: SearchInput, kind: "restaurant" | "place"): string {
  const parts: string[] = [];
  if (input.query?.trim()) parts.push(input.query.trim());
  else if (kind === "restaurant") parts.push("restaurant");
  if (input.address?.trim()) parts.push(input.address.trim());
  if (input.near) {
    parts.push(`near ${input.near.lat}, ${input.near.lng}`);
  }
  return parts.join(" ") || (kind === "restaurant" ? "restaurant" : "places");
}

async function fetchWithTimeout(
  fetchFn: FetchFn,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchFn(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (isEgressFailure(err)) throw new EgressFailureError();
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export type GoogleDirectClient = {
  searchRestaurants(input: SearchInput): Promise<PlaceCard[]>;
  searchPlaces(input: SearchInput): Promise<PlaceCard[]>;
  getDetails(nativeId: string): Promise<PlaceCard | null>;
  geocode(query: string, locale?: Locale): Promise<PlaceLocation & { address?: string }>;
  reverseGeocode(lat: number, lng: number): Promise<string>;
};

export function createGoogleDirectClient(
  config: GoogleAdapterConfig,
  fetchFn: FetchFn = fetch,
): GoogleDirectClient {
  const fieldMask = [
    "places.id",
    "places.displayName",
    "places.formattedAddress",
    "places.location",
    "places.rating",
    "places.primaryType",
    "places.types",
    "places.regularOpeningHours",
    "places.priceLevel",
    "places.photos",
  ].join(",");

  async function searchText(
    input: SearchInput,
    kind: "restaurant" | "place",
  ): Promise<PlaceCard[]> {
    if (!config.apiKey) throw new EgressFailureError("no_api_key");
    if (config.directForceFail) throw new EgressFailureError("force_fail");

    const body: Record<string, unknown> = {
      textQuery: buildSearchText(input, kind),
      languageCode: languageCode(input.locale),
    };
    if (kind === "place" && input.rankPreference) {
      // Google SearchTextRequest.RankPreference: RELEVANCE | DISTANCE only.
      const pref = input.rankPreference;
      if (pref === "RELEVANCE" || pref === "DISTANCE") {
        body.rankPreference = pref;
      }
    }
    if (input.near) {
      body.locationBias = {
        circle: {
          center: { latitude: input.near.lat, longitude: input.near.lng },
          radius: 5000,
        },
      };
    }

    const res = await fetchWithTimeout(
      fetchFn,
      `${config.placesBaseUrl}/places:searchText`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": config.apiKey,
          "X-Goog-FieldMask": fieldMask,
        },
        body: JSON.stringify(body),
      },
      config.requestTimeoutMs,
    );

    if (!res.ok) {
      if (isEgressFailure(null, res.status)) throw new EgressFailureError(`http_${res.status}`);
      throw new Error(`google_places_${res.status}`);
    }

    const json = (await res.json()) as { places?: unknown[] };
    const category = kind === "restaurant" ? "restaurant" : undefined;
    return (json.places ?? [])
      .map((p) => directPlaceToCard(p as Parameters<typeof directPlaceToCard>[0], category, config.apiKey))
      .filter((c): c is PlaceCard => c != null);
  }

  return {
    searchRestaurants: (input) => searchText(input, "restaurant"),
    searchPlaces: (input) => searchText(input, "place"),
    async getDetails(nativeId) {
      if (!config.apiKey) throw new EgressFailureError("no_api_key");
      if (config.directForceFail) throw new EgressFailureError("force_fail");

      const id = nativeId.startsWith("places/") ? nativeId : `places/${nativeId}`;
      const res = await fetchWithTimeout(
        fetchFn,
        `${config.placesBaseUrl}/${id}`,
        {
          headers: {
            "X-Goog-Api-Key": config.apiKey,
            "X-Goog-FieldMask": fieldMask.replace(/places\./g, ""),
          },
        },
        config.requestTimeoutMs,
      );

      if (res.status === 404) return null;
      if (!res.ok) {
        if (isEgressFailure(null, res.status)) throw new EgressFailureError(`http_${res.status}`);
        throw new Error(`google_details_${res.status}`);
      }

      const place = (await res.json()) as Parameters<typeof directPlaceToCard>[0];
      return directPlaceToCard(place, undefined, config.apiKey);
    },
    async geocode(query, locale) {
      if (!config.apiKey) throw new EgressFailureError("no_api_key");
      if (config.directForceFail) throw new EgressFailureError("force_fail");

      const url = new URL(`${config.geocodeBaseUrl}/maps/api/geocode/json`);
      url.searchParams.set("address", query);
      url.searchParams.set("key", config.apiKey);
      url.searchParams.set("language", languageCode(locale));

      const res = await fetchWithTimeout(fetchFn, url.toString(), {}, config.requestTimeoutMs);
      if (!res.ok) {
        if (isEgressFailure(null, res.status)) throw new EgressFailureError(`http_${res.status}`);
        throw new Error(`google_geocode_${res.status}`);
      }

      const json = (await res.json()) as {
        results?: { formatted_address?: string; geometry?: { location?: { lat?: number; lng?: number } } }[];
      };
      const first = json.results?.[0];
      const lat = first?.geometry?.location?.lat;
      const lng = first?.geometry?.location?.lng;
      if (lat == null || lng == null) throw new Error("google_geocode_empty");

      return {
        lat,
        lng,
        crs: "WGS84" as const,
        address: first?.formatted_address,
      };
    },
    async reverseGeocode(lat, lng) {
      if (!config.apiKey) throw new EgressFailureError("no_api_key");
      if (config.directForceFail) throw new EgressFailureError("force_fail");

      const url = new URL(`${config.geocodeBaseUrl}/maps/api/geocode/json`);
      url.searchParams.set("latlng", `${lat},${lng}`);
      url.searchParams.set("key", config.apiKey);

      const res = await fetchWithTimeout(fetchFn, url.toString(), {}, config.requestTimeoutMs);
      if (!res.ok) {
        if (isEgressFailure(null, res.status)) throw new EgressFailureError(`http_${res.status}`);
        throw new Error(`google_reverse_${res.status}`);
      }

      const json = (await res.json()) as { results?: { formatted_address?: string }[] };
      return json.results?.[0]?.formatted_address ?? `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    },
  };
}

export function directDeeplinks(
  card: PlaceCard,
): Record<string, string> {
  return googleDeeplinks(card.location, card.name);
}
