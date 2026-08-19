import { describe, it, expect } from "vitest";
import { searchRestaurants, searchPlaces, getPlaceDetails, navigate, geocode } from "./tools";
import { isDiningCategory } from "../adapters/fixtures";

describe("searchRestaurants", () => {
  it("should_merge_google_and_amap_near_central_hk", async () => {
    const result = await searchRestaurants({
      query: "restaurant",
      near: { lat: 22.2819, lng: 114.158 },
      providers: ["Google Maps", "AMAP"],
      merge: true,
      locale: "EN",
    });
    expect(result.skipped).toEqual([]);
    expect(result.data.length).toBeGreaterThan(0);
    expect(result.data.some((c) => c.sources.some((s) => s.provider === "GOOGLE_MAPS"))).toBe(
      true,
    );
    expect(result.data.some((c) => c.sources.some((s) => s.provider === "AMAP"))).toBe(true);
    expect(result.outcomeKey).toBeUndefined();
  });

  it("should_return_fixture_restaurants_when_query_matches", async () => {
    const result = await searchRestaurants({
      query: "Yat",
      providers: ["GOOGLE_MAPS"],
      locale: "EN",
    });
    expect(result.data.length).toBeGreaterThan(0);
    expect(result.data[0]?.sources[0]?.provider).toBe("GOOGLE_MAPS");
    expect(result.outcomeKey).toBeUndefined();
  });

  it("should_return_empty_outcome_when_no_match", async () => {
    const result = await searchRestaurants({
      query: "__empty__",
      providers: ["GOOGLE_MAPS"],
    });
    expect(result.data).toEqual([]);
    expect(result.outcomeKey).toBe("errors.empty_results");
  });

  it("should_skip_with_reason_when_provider_fails", async () => {
    const result = await searchRestaurants({
      query: "__fail__",
      providers: ["GOOGLE_MAPS"],
    });
    expect(result.skipped.some((s) => s.reason_key === "errors.provider_failed")).toBe(
      true,
    );
  });

  it("should_find_japanese_restaurants_near_shanghai_aegean_via_amap", async () => {
    const geo = await geocode({
      query: "上海爱琴海购物公园",
      providers: ["AMAP"],
      locale: "CN",
    });
    expect(geo.data?.lat).toBeGreaterThan(30);
    expect(geo.data?.lng).toBeGreaterThan(121);
    const result = await searchRestaurants({
      query: "日料",
      near: { lat: geo.data!.lat, lng: geo.data!.lng },
      providers: ["AMAP"],
      locale: "CN",
    });
    expect(result.data.length).toBeGreaterThan(0);
    expect(result.data.every((c) => (c.address ?? "").includes("上海"))).toBe(true);
    expect(result.outcomeKey).toBeUndefined();
  });

  it("should_find_japanese_near_shanghai_aegean_via_google_default_provider", async () => {
    const geo = await geocode({ query: "上海爱琴海购物公园", locale: "CN" });
    expect(geo.data?.lat).toBeGreaterThan(30);
    const result = await searchRestaurants({
      query: "日料",
      near: { lat: geo.data!.lat, lng: geo.data!.lng },
      locale: "CN",
    });
    expect(result.data.length).toBeGreaterThan(0);
    expect(result.outcomeKey).toBeUndefined();
  });
});

describe("searchPlaces", () => {
  it("should_return_fixture_pois_when_query_matches_museum", async () => {
    const result = await searchPlaces({
      query: "museum",
      providers: ["GOOGLE_MAPS"],
      locale: "EN",
      near: { lat: 35.68, lng: 139.76 },
    });
    expect(result.data.length).toBeGreaterThan(0);
    expect(result.data.every((c) => !isDiningCategory(c.category))).toBe(true);
    expect(result.data[0]?.location.lat).toBeTypeOf("number");
    expect(result.outcomeKey).toBeUndefined();
  });

  it("should_not_return_dining_dominated_list_for_museum_keyword", async () => {
    const result = await searchPlaces({
      query: "museum",
      providers: ["GOOGLE_MAPS"],
    });
    const diningCount = result.data.filter((c) => isDiningCategory(c.category)).length;
    expect(diningCount).toBeLessThan(result.data.length || 1);
  });

  it("should_return_empty_outcome_when_no_match", async () => {
    const result = await searchPlaces({
      query: "__empty__",
      providers: ["GOOGLE_MAPS"],
    });
    expect(result.data).toEqual([]);
    expect(result.outcomeKey).toBe("errors.empty_results");
  });

  it("should_skip_with_reason_when_provider_fails", async () => {
    const result = await searchPlaces({
      query: "__fail__",
      providers: ["GOOGLE_MAPS"],
    });
    expect(result.skipped.some((s) => s.reason_key === "errors.provider_failed")).toBe(true);
  });

  it("should_skip_unsupported_provider_for_place_search", async () => {
    const result = await searchPlaces({
      query: "museum",
      providers: ["TRIPADVISOR"],
    });
    expect(result.data).toEqual([]);
    expect(
      result.skipped.some((s) => s.reason_key === "errors.capability_unsupported"),
    ).toBe(true);
  });

  it("should_merge_place_results_when_requested", async () => {
    const result = await searchPlaces({
      query: "museum",
      providers: ["GOOGLE_MAPS", "AMAP"],
      merge: true,
    });
    expect(result.data.length).toBeGreaterThan(0);
  });
});

describe("getPlaceDetails", () => {
  it("should_return_card_when_native_id_exists", async () => {
    const result = await getPlaceDetails({
      provider: "GOOGLE_MAPS",
      native_id: "fixture_yat_lok",
    });
    expect(result.data?.name).toContain("Yat Lok");
  });

  it("should_return_not_found_when_id_unknown", async () => {
    const result = await getPlaceDetails({
      provider: "GOOGLE_MAPS",
      native_id: "does-not-exist",
    });
    expect(result.data).toBeNull();
    expect(result.outcomeKey).toBe("errors.place_not_found");
  });
});

describe("navigate", () => {
  it("should_return_secret_free_deeplinks", async () => {
    const result = await navigate({
      native_id: "fixture_yat_lok",
      provider: "GOOGLE_MAPS",
    });
    const blob = JSON.stringify(result.data);
    expect(blob).not.toMatch(/AIza|amap.*key|api_key=/i);
    expect(result.data.google_web).toContain("google.com/maps");
  });
});

describe("geocode", () => {
  it("should_return_coordinates_for_address", async () => {
    const result = await geocode({
      query: "Central, Hong Kong",
      providers: ["GOOGLE_MAPS"],
    });
    expect(result.data?.lat).toBeTypeOf("number");
    expect(result.data?.lng).toBeTypeOf("number");
  });

  it("should_reverse_geocode_when_lat_lng_given", async () => {
    const result = await geocode({
      lat: 22.2819,
      lng: 114.158,
      providers: ["GOOGLE_MAPS"],
    });
    expect(result.data?.address).toBeTruthy();
  });

  it("should_skip_when_geocode_input_missing", async () => {
    const result = await geocode({ providers: ["GOOGLE_MAPS"] });
    expect(result.data).toBeNull();
    expect(result.skipped.some((s) => s.reason_key === "errors.provider_failed")).toBe(true);
  });
});

describe("navigate by coordinates", () => {
  it("should_build_deeplinks_from_lat_lng", async () => {
    const result = await navigate({
      lat: 22.28,
      lng: 114.16,
      name: "Central",
      provider: "GOOGLE_MAPS",
    });
    expect(result.data.google_web).toContain("google.com/maps");
  });
});

describe("search merge and tripadvisor skip", () => {
  it("should_merge_duplicate_names_across_providers", async () => {
    const result = await searchRestaurants({
      query: "Yat",
      providers: ["GOOGLE_MAPS", "AMAP"],
      merge: true,
    });
    expect(result.data.length).toBeGreaterThan(0);
  });
});
