import { type PlaceAdapter } from "../types";
import {
  FIXTURE_POIS,
  FIXTURE_RESTAURANTS,
  filterFixtureRestaurants,
  fixtureById,
  mapsUrl,
  resolveFixtureGeocode,
} from "../fixtures";

export const googleFixtureAdapter: PlaceAdapter = {
  id: "GOOGLE_MAPS",
  async searchRestaurants(input) {
    const q = (input.query ?? "").toLowerCase();
    if (q.includes("__fail__")) {
      throw new Error("fixture_fail");
    }
    const filtered = filterFixtureRestaurants(FIXTURE_RESTAURANTS, input);
    return filtered.map((r) =>
      q.includes("__ta_fail__") ? { ...r, name: `${r.name} __ta_fail__` } : r,
    );
  },
  async searchPlaces(input) {
    const q = (input.query ?? "").toLowerCase();
    if (q.includes("__empty__")) return [];
    if (q.includes("__fail__")) {
      throw new Error("fixture_fail");
    }
    const pois = FIXTURE_POIS.filter((p) =>
      q ? p.name.toLowerCase().includes(q) || p.category?.includes(q) : true,
    );
    if (q.includes("museum") && pois.length === 0) {
      return FIXTURE_POIS.filter((p) => p.category === "museum");
    }
    return pois;
  },
  async getDetails(nativeId) {
    return fixtureById(nativeId) ?? null;
  },
  async geocode(query) {
    if (!query.trim()) throw new Error("empty");
    return resolveFixtureGeocode(query, "WGS84");
  },
  async reverseGeocode(lat, lng) {
    return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  },
  deeplinks(card) {
    return mapsUrl(card.location, card.name);
  },
};
