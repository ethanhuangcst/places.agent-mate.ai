import { LOCALE_LANG, type Locale } from "../../core/locales";
import { type PlaceCard, type PlaceLocation, type SearchInput } from "../../core/types";
import { type GeocodeHit, parseGoogleAddressComponents } from "../geocode-hit";
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
  // S8: do not append "near lat,lng" into textQuery — use locationRestriction / bias instead.
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
  suggestPlaces(input: SearchInput): Promise<PlaceCard[]>;
  getDetails(nativeId: string, locale?: Locale): Promise<PlaceCard | null>;
  geocode(query: string, locale?: Locale): Promise<GeocodeHit>;
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
      const placeRadius = Math.min(input.bias_radius_m ?? 5000, 50_000);
      const circle = {
        center: { latitude: input.near.lat, longitude: input.near.lng },
        radius: kind === "restaurant" ? 5000 : placeRadius,
      };
      // searchText locationRestriction only accepts rectangle, not circle (400 Unknown name "circle").
      body.locationBias = { circle };
      if (kind === "restaurant") {
        body.rankPreference = "DISTANCE";
      }
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

  async function suggestPlaces(input: SearchInput): Promise<PlaceCard[]> {
    if (!config.apiKey) throw new EgressFailureError("no_api_key");
    if (config.directForceFail) throw new EgressFailureError("force_fail");
    const text = (input.query ?? "").trim();
    if (!text) return [];

    const body: Record<string, unknown> = {
      input: text,
      languageCode: languageCode(input.locale),
    };
    if (input.near) {
      body.locationBias = {
        circle: {
          center: { latitude: input.near.lat, longitude: input.near.lng },
          radius: Math.min(input.bias_radius_m ?? 50_000, 50_000),
        },
      };
    }

    const res = await fetchWithTimeout(
      fetchFn,
      `${config.placesBaseUrl}/places:autocomplete`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": config.apiKey,
          "X-Goog-FieldMask":
            "suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat,suggestions.queryPrediction.text",
        },
        body: JSON.stringify(body),
      },
      config.requestTimeoutMs,
    );
    if (!res.ok) {
      if (isEgressFailure(null, res.status)) throw new EgressFailureError(`http_${res.status}`);
      throw new Error(`google_autocomplete_${res.status}`);
    }

    const json = (await res.json()) as {
      suggestions?: Array<{
        placePrediction?: {
          placeId?: string;
          text?: { text?: string };
          structuredFormat?: {
            mainText?: { text?: string };
            secondaryText?: { text?: string };
          };
        };
        queryPrediction?: { text?: { text?: string } };
      }>;
    };

    const cards: PlaceCard[] = [];
    for (const s of json.suggestions ?? []) {
      const pred = s.placePrediction;
      const name =
        pred?.structuredFormat?.mainText?.text?.trim() ||
        pred?.text?.text?.trim() ||
        s.queryPrediction?.text?.text?.trim() ||
        "";
      if (!name) continue;
      const address = pred?.structuredFormat?.secondaryText?.text?.trim() || pred?.text?.text?.trim();
      const placeId = pred?.placeId?.replace(/^places\//, "")?.trim();
      cards.push({
        provider: "GOOGLE_MAPS",
        name,
        ...(address ? { address } : {}),
        location: { lat: Number.NaN, lng: Number.NaN, crs: "WGS84" },
        category: "place",
        sources: [
          {
            provider: "GOOGLE_MAPS",
            native_id: placeId || `tip:${name}`,
            deeplinks: {},
          },
        ],
      });
    }
    return cards;
  }

  return {
    searchRestaurants: (input) => searchText(input, "restaurant"),
    searchPlaces: (input) => searchText(input, "place"),
    suggestPlaces,
    async getDetails(nativeId, locale?: Locale) {
      if (!config.apiKey) throw new EgressFailureError("no_api_key");
      if (config.directForceFail) throw new EgressFailureError("force_fail");

      const id = nativeId.startsWith("places/") ? nativeId : `places/${nativeId}`;
      const url = new URL(`${config.placesBaseUrl}/${id}`);
      url.searchParams.set("languageCode", languageCode(locale));
      const res = await fetchWithTimeout(
        fetchFn,
        url.toString(),
        {
          headers: {
            "X-Goog-Api-Key": config.apiKey,
            "X-Goog-FieldMask": fieldMask.replace(/places\./g, ""),
            "X-Goog-LanguageCode": languageCode(locale),
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

      type GeoRow = {
        formatted_address?: string;
        geometry?: { location?: { lat?: number; lng?: number } };
        address_components?: {
          long_name?: string;
          short_name?: string;
          types?: string[];
        }[];
      };

      async function fetchGeocodeJson(language: string): Promise<GeoRow | undefined> {
        const url = new URL(`${config.geocodeBaseUrl}/maps/api/geocode/json`);
        url.searchParams.set("address", query);
        url.searchParams.set("key", config.apiKey!);
        url.searchParams.set("language", language);
        const res = await fetchWithTimeout(fetchFn, url.toString(), {}, config.requestTimeoutMs);
        if (!res.ok) {
          if (isEgressFailure(null, res.status)) throw new EgressFailureError(`http_${res.status}`);
          throw new Error(`google_geocode_${res.status}`);
        }
        const json = (await res.json()) as { results?: GeoRow[] };
        return json.results?.[0];
      }

      const lang = languageCode(locale);
      const first = await fetchGeocodeJson(lang);
      const lat = first?.geometry?.location?.lat;
      const lng = first?.geometry?.location?.lng;
      if (lat == null || lng == null) throw new Error("google_geocode_empty");

      const admin = parseGoogleAddressComponents(first?.address_components);
      let cityEn: string | undefined;
      if (lang === "en") {
        cityEn = admin.city;
      } else {
        try {
          const enRow = await fetchGeocodeJson("en");
          cityEn = parseGoogleAddressComponents(enRow?.address_components).city;
        } catch {
          cityEn = undefined;
        }
      }

      const hit: GeocodeHit = {
        lat,
        lng,
        crs: "WGS84",
        address: first?.formatted_address,
        ...(admin.country ? { country: admin.country } : {}),
        ...(admin.city ? { city: admin.city } : {}),
      };
      if (cityEn && cityEn !== admin.city) hit.city_en = cityEn;
      else if (cityEn && lang === "en") {
        /* city already English — omit duplicate city_en */
      } else if (cityEn && !admin.city) {
        hit.city = cityEn;
      }
      return hit;
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
