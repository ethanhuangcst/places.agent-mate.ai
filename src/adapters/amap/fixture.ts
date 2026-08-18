import { type PlaceAdapter } from "../types";
import { mapsUrl } from "../fixtures";
import { type PlaceCard } from "../../core/types";

export const amapFixtureAdapter: PlaceAdapter = {
  id: "AMAP",
  async searchRestaurants(input) {
    if ((input.query ?? "").includes("__fail__")) throw new Error("fixture_fail");
    const card: PlaceCard = {
      provider: "AMAP",
      name: "太興燒味",
      address: "中環士丹利街",
      location: { lat: 22.2826, lng: 114.1553, crs: "GCJ-02" },
      category: "restaurant",
      sources: [
        {
          provider: "AMAP",
          native_id: "fixture_amap_taixing",
          deeplinks: mapsUrl({ lat: 22.2826, lng: 114.1553, crs: "GCJ-02" }, "太興燒味"),
        },
      ],
    };
    return [card];
  },
  async getDetails(nativeId) {
    if (nativeId !== "fixture_amap_taixing") return null;
    const [card] = await this.searchRestaurants({});
    return card ?? null;
  },
  async geocode(query) {
    return { lat: 22.28, lng: 114.16, crs: "GCJ-02", address: query };
  },
  async reverseGeocode(lat, lng) {
    return `${lng},${lat}`;
  },
  deeplinks(card) {
    return mapsUrl(card.location, card.name);
  },
};
