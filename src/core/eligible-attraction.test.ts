import { describe, expect, it } from "vitest";
import {
  degradeMustInclude,
  filterEligibleAttractions,
  isEligibleAttraction,
  isIneligibleMustIncludeToken,
  isNoiseCategory,
  isVagueAreaName,
  pickNominatedGroundCard,
  properNameTokens,
  sharedProperToken,
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

  it("should_accept_amap_scenic_child_and_unwrap_name", () => {
    const kept = filterEligibleAttractions([
      card({
        name: "杭州西湖风景名胜区-集贤亭",
        provider: "AMAP",
        sources: [{ provider: "AMAP", native_id: "B1", deeplinks: {} }],
      }),
      card({ name: "杭州西湖风景名胜区" }),
    ]);
    expect(kept.map((p) => p.name)).toEqual(["集贤亭"]);
  });

  it("should_reject_boat_dock_and_ticket_service_fragments", () => {
    expect(isEligibleAttraction(card({ name: "手划船停靠点", category: "attraction" }))).toBe(
      false,
    );
    expect(
      isEligibleAttraction(
        card({
          name: "西湖风景名胜区-手划船停靠点",
          provider: "AMAP",
          sources: [{ provider: "AMAP", native_id: "dock1", deeplinks: {} }],
        }),
      ),
    ).toBe(false);
    expect(isEligibleAttraction(card({ name: "雷峰塔景区售票处" }))).toBe(false);
    const kept = filterEligibleAttractions([
      card({ name: "西湖风景名胜区-手划船停靠点", category: "景点" }),
      card({ name: "断桥残雪", category: "attraction" }),
    ]);
    expect(kept.map((p) => p.name)).toEqual(["断桥残雪"]);
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

describe("pickNominatedGroundCard", () => {
  it("should_prefer_named_scenic_card_over_lodging_when_query_matches", () => {
    const picked = pickNominatedGroundCard("雷峰塔", [
      card({ name: "雷峰塔民宿", category: "酒店" }),
      card({ name: "雷峰塔景区", category: "风景名胜;国家级景点" }),
    ]);
    expect(picked?.name).toBe("雷峰塔景区");
  });

  it("should_skip_car_dealership_when_query_is_a_vague_lake", () => {
    const picked = pickNominatedGroundCard("西湖", [
      card({ name: "宾利杭州西湖旗舰中心", category: "汽车销售;4S店" }),
      card({ name: "西湖风景区湖滨公园", category: "风景名胜;公园广场;公园" }),
    ]);
    expect(picked).toBeUndefined();
  });

  it("should_skip_shop_category_when_query_is_a_lake", () => {
    const picked = pickNominatedGroundCard("西湖", [
      card({ name: "西湖眼镜(城站旗舰店)", category: "购物服务;专卖店;眼镜店" }),
    ]);
    expect(picked).toBeUndefined();
  });

  it("should_skip_lodging_when_all_hits_are_hotels", () => {
    const picked = pickNominatedGroundCard("灵隐寺", [
      card({ name: "灵隐寺度假别墅", category: "宾馆酒店" }),
    ]);
    expect(picked).toBeUndefined();
  });

  it("should_reject_bentley_flagship_via_noise_category", () => {
    expect(isNoiseCategory("汽车销售;4S店", "宾利杭州西湖旗舰中心")).toBe(true);
    const picked = pickNominatedGroundCard("宾利杭州西湖旗舰中心", [
      card({ name: "宾利杭州西湖旗舰中心", category: "汽车销售;4S店" }),
    ]);
    expect(picked).toBeUndefined();
  });
});

describe("isVagueAreaName", () => {
  it("should_reject_lake_district_and_keep_plaza_pinable", () => {
    expect(isVagueAreaName("西湖")).toBe(true);
    expect(isVagueAreaName("Alfama District")).toBe(true);
    expect(isVagueAreaName("钱江新城")).toBe(true);
    // Plaza / square names are specific visit pins — not vague-area endings.
    expect(isVagueAreaName("Praça do Comércio")).toBe(false);
    expect(isVagueAreaName("雷峰塔景区")).toBe(false);
  });
});

describe("sharedProperToken", () => {
  it("should_match_cross_language_alias_via_shared_proper_noun", () => {
    expect(sharedProperToken("Mosteiro dos Jerónimos", "Jerónimos Monastery")).toBe(true);
    expect(sharedProperToken("Torre de Belém", "Belém Tower")).toBe(true);
  });

  it("should_not_match_unrelated_same_type_places", () => {
    expect(sharedProperToken("Queluz National Palace", "Sintra National Palace")).toBe(false);
    expect(sharedProperToken("Tower of London", "Eiffel Tower")).toBe(false);
  });

  it("should_drop_short_and_venue_type_tokens", () => {
    expect(properNameTokens("Mosteiro dos Jerónimos").has("jerónimos")).toBe(true);
    expect(properNameTokens("Mosteiro dos Jerónimos").has("mosteiro")).toBe(false);
    expect(properNameTokens("Mosteiro dos Jerónimos").has("dos")).toBe(false);
  });

  it("should_ground_portuguese_alias_to_english_vendor_name", () => {
    const picked = pickNominatedGroundCard("Mosteiro dos Jerónimos", [
      card({ name: "Jerónimos Monastery", category: "Tourist attraction" }),
    ]);
    expect(picked?.name).toBe("Jerónimos Monastery");
  });
});
