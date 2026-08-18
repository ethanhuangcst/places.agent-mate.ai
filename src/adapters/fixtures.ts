import { type PlaceCard, type PlaceLocation } from "../core/types";

function mapsUrl(loc: PlaceLocation, name: string): Record<string, string> {
  const q = encodeURIComponent(`${loc.lat},${loc.lng}`);
  const nameQ = encodeURIComponent(name);
  return {
    google_web: `https://www.google.com/maps/search/?api=1&query=${q}`,
    google_app: `https://maps.google.com/?q=${q}`,
    amap_web: `https://uri.amap.com/marker?position=${loc.lng},${loc.lat}&name=${nameQ}`,
  };
}

export const FIXTURE_RESTAURANTS: PlaceCard[] = [
  {
    provider: "GOOGLE_MAPS",
    name: "Yat Lok Roast Goose",
    address: "34-38 Stanley Street, Central, Hong Kong",
    location: { lat: 22.2826, lng: 114.1553, crs: "WGS84" },
    rating: 4.4,
    category: "restaurant",
    sources: [
      {
        provider: "GOOGLE_MAPS",
        native_id: "fixture_yat_lok",
        deeplinks: mapsUrl({ lat: 22.2826, lng: 114.1553, crs: "WGS84" }, "Yat Lok Roast Goose"),
      },
    ],
  },
  {
    provider: "GOOGLE_MAPS",
    name: "Tim Ho Wan",
    address: "Shop 12A, North Point, Hong Kong",
    location: { lat: 22.291, lng: 114.2, crs: "WGS84" },
    rating: 4.2,
    category: "restaurant",
    sources: [
      {
        provider: "GOOGLE_MAPS",
        native_id: "fixture_tim_ho_wan",
        deeplinks: mapsUrl({ lat: 22.291, lng: 114.2, crs: "WGS84" }, "Tim Ho Wan"),
      },
    ],
  },
];

export function fixtureById(id: string): PlaceCard | undefined {
  return FIXTURE_RESTAURANTS.find((r) => r.sources.some((s) => s.native_id === id));
}

export { mapsUrl };
