import { type PlaceAdapter } from "../types";
import { FIXTURE_RESTAURANTS, fixtureById, mapsUrl } from "../fixtures";

export const googleFixtureAdapter: PlaceAdapter = {
  id: "GOOGLE_MAPS",
  async searchRestaurants(input) {
    const q = (input.query ?? "").toLowerCase();
    if (q.includes("__empty__")) return [];
    if (q.includes("__fail__")) {
      throw new Error("fixture_fail");
    }
    return FIXTURE_RESTAURANTS.filter((r) =>
      q ? r.name.toLowerCase().includes(q) || r.address?.toLowerCase().includes(q) : true,
    );
  },
  async getDetails(nativeId) {
    return fixtureById(nativeId) ?? null;
  },
  async geocode(query) {
    if (!query.trim()) throw new Error("empty");
    return { lat: 22.2819, lng: 114.158, crs: "WGS84" as const, address: query };
  },
  async reverseGeocode(lat, lng) {
    return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  },
  deeplinks(card) {
    return mapsUrl(card.location, card.name);
  },
};
