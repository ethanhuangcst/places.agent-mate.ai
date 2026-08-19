import { googleFixtureAdapter } from "./google/fixture";
import { getGoogleLiveAdapter } from "./google/live";
import { amapFixtureAdapter } from "./amap/fixture";
import { getAmapLiveAdapter } from "./amap/live";
import { type PlaceAdapter } from "./types";
import { type ProviderId } from "../core/providers";

export function getAdapter(id: ProviderId): PlaceAdapter | null {
  if (id === "GOOGLE_MAPS") {
    if (process.env.PLACES_VENDOR_MODE === "live") {
      return getGoogleLiveAdapter();
    }
    return googleFixtureAdapter;
  }
  if (id === "AMAP") {
    if (process.env.PLACES_VENDOR_MODE === "live") {
      return getAmapLiveAdapter();
    }
    return amapFixtureAdapter;
  }
  return null;
}
