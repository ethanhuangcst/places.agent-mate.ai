import { describe, it, expect } from "vitest";
import { searchRestaurants, getPlaceDetails, navigate, geocode } from "./tools";

describe("searchRestaurants", () => {
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
});
