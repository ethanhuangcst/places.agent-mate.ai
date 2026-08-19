import { type PlaceAdapter } from "../types";
import {
  FIXTURE_AMAP_RESTAURANTS,
  FIXTURE_POIS,
  filterFixtureRestaurants,
  mapsUrl,
  resolveFixtureGeocode,
} from "../fixtures";
import { type PlaceCard } from "../../core/types";

export const amapFixtureAdapter: PlaceAdapter = {
  id: "AMAP",
  async searchRestaurants(input) {
    if ((input.query ?? "").includes("__fail__")) throw new Error("fixture_fail");
    const filtered = filterFixtureRestaurants(FIXTURE_AMAP_RESTAURANTS, input);
    return filtered;
  },
  async searchPlaces(input) {
    if ((input.query ?? "").includes("__fail__")) throw new Error("fixture_fail");
    const card: PlaceCard = {
      provider: "AMAP",
      name: "香港歷史博物館",
      address: "尖沙咀漆咸道南100號",
      location: { lat: 22.3019, lng: 114.1772, crs: "GCJ-02" },
      category: "museum",
      sources: [
        {
          provider: "AMAP",
          native_id: "fixture_amap_museum",
          deeplinks: mapsUrl({ lat: 22.3019, lng: 114.1772, crs: "GCJ-02" }, "香港歷史博物館"),
        },
      ],
    };
    const q = (input.query ?? "").toLowerCase();
    if (q.includes("__empty__")) return [];
    if (q && !card.name.includes(q) && q !== "museum") return [];
    return [card];
  },
  async getDetails(nativeId) {
    const fromRestaurants = FIXTURE_AMAP_RESTAURANTS.find((r) =>
      r.sources.some((s) => s.native_id === nativeId),
    );
    if (fromRestaurants) return fromRestaurants;
    if (nativeId === "fixture_amap_museum") {
      const [place] = await this.searchPlaces({});
      return place ?? null;
    }
    return null;
  },
  async geocode(query) {
    return resolveFixtureGeocode(query, "GCJ-02");
  },
  async reverseGeocode(lat, lng) {
    return `${lng},${lat}`;
  },
  deeplinks(card) {
    return mapsUrl(card.location, card.name);
  },
};
