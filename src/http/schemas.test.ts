import { describe, expect, it } from "vitest";
import { arrangeDayBody, planItineraryBody } from "./schemas";

describe("arrangeDayBody date nullish (TC-M6-P0-01)", () => {
  const base = {
    candidates: { places: [{ name: "A" }], restaurants: [] },
    dayIndex: 1,
    locale: "CN" as const,
  };

  it("should_accept_when_date_omitted", () => {
    expect(arrangeDayBody.safeParse(base).success).toBe(true);
  });

  it("should_accept_when_date_is_null", () => {
    expect(arrangeDayBody.safeParse({ ...base, date: null }).success).toBe(true);
  });

  it("should_accept_when_date_is_string", () => {
    expect(arrangeDayBody.safeParse({ ...base, date: "2026-08-25" }).success).toBe(true);
  });
});

describe("ADR-040 party_size schema", () => {
  const arrangeBase = {
    candidates: { places: [{ name: "A" }], restaurants: [] },
    dayIndex: 1,
    locale: "EN" as const,
  };

  it("should_accept_party_size_1_to_20_on_arrange_day", () => {
    expect(arrangeDayBody.safeParse({ ...arrangeBase, party_size: 1 }).success).toBe(true);
    expect(arrangeDayBody.safeParse({ ...arrangeBase, party_size: 20 }).success).toBe(true);
  });

  it("should_reject_party_size_out_of_range_on_arrange_day", () => {
    expect(arrangeDayBody.safeParse({ ...arrangeBase, party_size: 0 }).success).toBe(false);
    expect(arrangeDayBody.safeParse({ ...arrangeBase, party_size: 21 }).success).toBe(false);
  });

  it("should_accept_must_include_and_day_theme_on_arrange_day_preferences", () => {
    expect(
      arrangeDayBody.safeParse({
        ...arrangeBase,
        preferences: {
          must_include: ["辛特拉", "卡斯凯什"],
          day_theme: "辛特拉一日游",
          spend_level: 2,
        },
        num_days: 4,
        spend_level: 3,
      }).success,
    ).toBe(true);
  });

  it("should_accept_empty_candidates_pool_on_arrange_day", () => {
    expect(
      arrangeDayBody.safeParse({
        ...arrangeBase,
        candidates: { places: [], restaurants: [] },
        city: "里斯本",
      }).success,
    ).toBe(true);
  });
});
