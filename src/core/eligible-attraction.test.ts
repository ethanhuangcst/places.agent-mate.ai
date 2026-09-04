import { describe, expect, it } from "vitest";
import {
  degradeMustInclude,
  filterEligibleAttractions,
  isEligibleAttraction,
  isIneligibleMustIncludeToken,
} from "./eligible-attraction";
import { type PlaceCard } from "./types";

function card(overrides: Partial<PlaceCard> & { name: string }): PlaceCard {
  return {
    provider: "GOOGLE_MAPS",
    location: { lat: 30.25, lng: 120.15, crs: "WGS84" },
    sources: [{ provider: "GOOGLE_MAPS", native_id: "n1", deeplinks: {} }],
    ...overrides,
  };
}

describe("TC-M22-84-01 isEligibleAttraction", () => {
  it("should_reject_when_name_is_collection_or_scenic_area", () => {
    expect(isEligibleAttraction(card({ name: "西湖十景" }))).toBe(false);
    expect(isEligibleAttraction(card({ name: "杭州西湖风景名胜区" }))).toBe(false);
    expect(isIneligibleMustIncludeToken("西湖十景")).toBe(true);
  });

  it("should_reject_when_coords_missing", () => {
    expect(
      isEligibleAttraction(
        card({ name: "雷峰塔", location: { lat: Number.NaN, lng: 120, crs: "WGS84" } }),
      ),
    ).toBe(false);
  });

  it("should_reject_when_card_is_a_restaurant", () => {
    expect(isEligibleAttraction(card({ name: "楼外楼", category: "restaurant" }))).toBe(false);
  });

  it("should_reject_when_sources_exist_without_native_id", () => {
    expect(
      isEligibleAttraction(
        card({
          name: "雷峰塔",
          sources: [{ provider: "GOOGLE_MAPS", native_id: "  ", deeplinks: {} }],
        }),
      ),
    ).toBe(false);
  });

  it("should_accept_when_slim_card_has_coords_and_venue_name", () => {
    expect(
      isEligibleAttraction({
        provider: "AMAP",
        name: "雷峰塔",
        location: { lat: 30.23, lng: 120.14, crs: "GCJ-02" },
        sources: [],
      }),
    ).toBe(true);
  });

  it("should_filter_pool_to_eligible_only", () => {
    const kept = filterEligibleAttractions([
      card({ name: "西湖十景" }),
      card({ name: "雷峰塔" }),
    ]);
    expect(kept.map((p) => p.name)).toEqual(["雷峰塔"]);
  });

  it("should_drop_collection_must_include_when_degrading", () => {
    const kept = degradeMustInclude(
      ["西湖十景", "雷峰塔"],
      [card({ name: "雷峰塔" })],
      (token, names) => names.some((n) => n.includes(token) || token.includes(n)),
    );
    expect(kept).toEqual(["雷峰塔"]);
  });
});
