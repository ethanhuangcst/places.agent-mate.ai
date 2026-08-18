import { googleFixtureAdapter } from "./google/fixture";
import { amapFixtureAdapter } from "./amap/fixture";
import { type PlaceAdapter } from "./types";
import { type ProviderId } from "../core/providers";

export function getAdapter(id: ProviderId): PlaceAdapter | null {
  if (id === "GOOGLE_MAPS") return googleFixtureAdapter;
  if (id === "AMAP") return amapFixtureAdapter;
  return null;
}
