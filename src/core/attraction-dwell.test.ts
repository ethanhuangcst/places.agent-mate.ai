import { describe, expect, it } from "vitest";
import {
  attractionDwellMinutes,
  clusterRoleForIndex,
  squeezeAttractionDwells,
} from "./attraction-dwell";
import { type PlaceCard } from "./types";

function card(
  name: string,
  opts?: { rating?: number; user_ratings_total?: number; category?: string },
): PlaceCard {
  return {
    provider: "GOOGLE_MAPS",
    name,
    location: { lat: 38.7, lng: -9.1, crs: "WGS84" },
    rating: opts?.rating,
    user_ratings_total: opts?.user_ratings_total,
    category: opts?.category,
    sources: [{ provider: "GOOGLE_MAPS", native_id: "n1", deeplinks: {} }],
  };
}

describe("attractionDwellMinutes (TC-M23-91-05)", () => {
  it("should_use_45_for_isolated_attraction", () => {
    expect(attractionDwellMinutes(card("Tower"), "isolated")).toBe(45);
  });

  it("should_use_60_when_rating_high_and_reviews_ge_200", () => {
    expect(
      attractionDwellMinutes(card("Icon", { rating: 4.7, user_ratings_total: 250 }), "isolated"),
    ).toBe(60);
  });

  it("should_use_60_for_museum_category", () => {
    expect(attractionDwellMinutes(card("MAAT", { category: "museum" }), "isolated")).toBe(60);
  });

  it("should_use_20_in_cluster_and_35_at_end", () => {
    expect(attractionDwellMinutes(card("A"), "in")).toBe(20);
    expect(attractionDwellMinutes(card("B"), "end")).toBe(35);
  });

  it("should_squeeze_dwells_down_to_floors", () => {
    const squeezed = squeezeAttractionDwells({
      dwells: [45, 45, 60],
      overtimeMin: 40,
    });
    expect(squeezed.every((d, i) => d <= [45, 45, 60][i]!)).toBe(true);
    expect(squeezed.every((d) => d >= 30)).toBe(true);
  });

  it("should_detect_cluster_roles_by_proximity", () => {
    const stops = [
      { kind: "attraction", location: { lat: 38.71, lng: -9.14 } },
      { kind: "attraction", location: { lat: 38.7105, lng: -9.1405 } },
      { kind: "attraction", location: { lat: 38.9, lng: -9.4 } },
    ];
    expect(clusterRoleForIndex(stops, 0)).toBe("in");
    expect(clusterRoleForIndex(stops, 1)).toBe("end");
    expect(clusterRoleForIndex(stops, 2)).toBe("isolated");
  });
});
