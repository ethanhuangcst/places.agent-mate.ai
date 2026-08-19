import { type PlaceLocation } from "../../core/types";

export function googleDeeplinks(
  loc: PlaceLocation,
  name: string,
): Record<string, string> {
  const q = encodeURIComponent(`${loc.lat},${loc.lng}`);
  const nameQ = encodeURIComponent(name);
  return {
    google_web: `https://www.google.com/maps/search/?api=1&query=${q}`,
    google_app: `https://maps.google.com/?q=${q}`,
    amap_web: `https://uri.amap.com/marker?position=${loc.lng},${loc.lat}&name=${nameQ}`,
  };
}
