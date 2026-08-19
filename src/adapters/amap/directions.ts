import { type PlaceLocation } from "../../core/types";
import { type TravelMode } from "../../core/itinerary-timed";
import { type AmapAdapterConfig } from "./config";
import { formatLngLat, parseLngLat } from "./card-mapper";

export type DirectionsEta = {
  duration_min: number;
  distance_m?: number;
};

export type FetchFn = typeof fetch;

type AmapDirJson = {
  status?: string;
  infocode?: string | number;
  route?: {
    paths?: { duration?: string | number; distance?: string | number }[];
    transits?: { duration?: string | number; walking_distance?: string | number }[];
  };
  locations?: string;
};

function assertOk(json: AmapDirJson): void {
  if (json.status === "1" && String(json.infocode) === "10000") return;
  throw new Error(`amap_directions_${json.infocode ?? json.status ?? "failed"}`);
}

function pathForMode(mode: TravelMode): string {
  if (mode === "walk") return "/v3/direction/walking";
  if (mode === "transit") return "/v3/direction/transit/integrated";
  return "/v3/direction/driving";
}

async function convertToGcj(
  config: AmapAdapterConfig,
  loc: PlaceLocation,
  fetchFn: FetchFn,
): Promise<{ lng: number; lat: number }> {
  if (loc.crs === "GCJ-02") return { lng: loc.lng, lat: loc.lat };
  if (!config.apiKey) throw new Error("amap_no_api_key");
  const url = new URL(`${config.baseUrl}/v3/assistant/coordinate/convert`);
  url.searchParams.set("key", config.apiKey);
  url.searchParams.set("locations", formatLngLat(loc.lng, loc.lat));
  url.searchParams.set("coordsys", "gps");
  const res = await fetchFn(url.toString());
  if (!res.ok) throw new Error(`amap_convert_http_${res.status}`);
  const json = (await res.json()) as AmapDirJson;
  assertOk(json);
  const parsed = parseLngLat(json.locations ?? "");
  if (!parsed) throw new Error("amap_convert_empty");
  return parsed;
}

export async function fetchAmapDirectionsEta(
  config: AmapAdapterConfig,
  input: { from: PlaceLocation; to: PlaceLocation; mode: TravelMode; city?: string },
  fetchFn: FetchFn = fetch,
): Promise<DirectionsEta | null> {
  if (!config.apiKey) return null;

  const from = await convertToGcj(config, input.from, fetchFn);
  const to = await convertToGcj(config, input.to, fetchFn);

  const url = new URL(`${config.baseUrl}${pathForMode(input.mode)}`);
  url.searchParams.set("key", config.apiKey);
  url.searchParams.set("origin", formatLngLat(from.lng, from.lat));
  url.searchParams.set("destination", formatLngLat(to.lng, to.lat));
  if (input.mode === "transit") {
    url.searchParams.set("city", input.city ?? "上海");
    url.searchParams.set("cityd", input.city ?? "上海");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.requestTimeoutMs);
  try {
    const res = await fetchFn(url.toString(), { signal: controller.signal });
    if (!res.ok) throw new Error(`amap_directions_http_${res.status}`);
    const json = (await res.json()) as AmapDirJson;
    assertOk(json);

    if (input.mode === "transit") {
      const transit = json.route?.transits?.[0];
      const seconds = Number(transit?.duration);
      if (!Number.isFinite(seconds) || seconds <= 0) return null;
      return {
        duration_min: Math.max(1, Math.round(seconds / 60)),
        distance_m: transit?.walking_distance
          ? Number(transit.walking_distance)
          : undefined,
      };
    }

    const path = json.route?.paths?.[0];
    const seconds = Number(path?.duration);
    if (!Number.isFinite(seconds) || seconds <= 0) return null;
    return {
      duration_min: Math.max(1, Math.round(seconds / 60)),
      distance_m: path?.distance != null ? Number(path.distance) : undefined,
    };
  } finally {
    clearTimeout(timer);
  }
}
