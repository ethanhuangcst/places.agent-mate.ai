import { type PlaceLocation } from "../../core/types";
import { type TravelMode } from "../../core/itinerary-timed";
import { type GoogleAdapterConfig } from "./config";

export type DirectionsEta = {
  duration_min: number;
  distance_m?: number;
};

export type FetchFn = typeof fetch;

function modeParam(mode: TravelMode): string {
  if (mode === "walk") return "walking";
  if (mode === "transit") return "transit";
  return "driving";
}

export async function fetchGoogleDirectionsEta(
  config: GoogleAdapterConfig,
  input: { from: PlaceLocation; to: PlaceLocation; mode: TravelMode },
  fetchFn: FetchFn = fetch,
): Promise<DirectionsEta | null> {
  if (!config.apiKey || config.directForceFail) return null;
  const qs = new URLSearchParams({
    origin: `${input.from.lat},${input.from.lng}`,
    destination: `${input.to.lat},${input.to.lng}`,
    mode: modeParam(input.mode),
    key: config.apiKey,
  });
  const url = `${config.geocodeBaseUrl.replace(/\/+$/, "")}/maps/api/directions/json?${qs}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.requestTimeoutMs);
  try {
    const res = await fetchFn(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`google_directions_http_${res.status}`);
    const json = (await res.json()) as {
      status?: string;
      routes?: { legs?: { duration?: { value?: number }; distance?: { value?: number } }[] }[];
    };
    if (json.status && json.status !== "OK" && json.status !== "ZERO_RESULTS") {
      throw new Error(`google_directions_${json.status}`);
    }
    const leg = json.routes?.[0]?.legs?.[0];
    const seconds = leg?.duration?.value;
    if (seconds == null || !Number.isFinite(seconds)) return null;
    return {
      duration_min: Math.max(1, Math.round(seconds / 60)),
      distance_m: leg?.distance?.value,
    };
  } finally {
    clearTimeout(timer);
  }
}
