import { describe, it, expect } from "vitest";
import {
  shouldUseChineseSearchQueries,
  timedAttractionQueries,
  timedMealQueries,
} from "./itinerary-timed";

describe("shouldUseChineseSearchQueries", () => {
  it("should_be_true_when_locale_is_cn", () => {
    expect(shouldUseChineseSearchQueries({ locale: "CN", area: "Tokyo" })).toBe(true);
  });

  it("should_be_true_when_area_has_cjk_even_if_ui_en", () => {
    expect(shouldUseChineseSearchQueries({ locale: "EN", area: "哈尔滨" })).toBe(true);
  });

  it("should_be_false_when_en_and_latin_area", () => {
    expect(shouldUseChineseSearchQueries({ locale: "EN", area: "Tokyo" })).toBe(false);
  });
});

describe("timedAttractionQueries", () => {
  it("should_use_cn_catalog_when_en_ui_and_harbin", () => {
    const qs = timedAttractionQueries("哈尔滨", "EN");
    expect(qs.length).toBeGreaterThan(0);
    expect(qs.some((q) => /景点|博物馆|公园/.test(q))).toBe(true);
    expect(qs.every((q) => !/attractions landmarks/i.test(q))).toBe(true);
  });

  it("should_use_en_catalog_for_tokyo_en", () => {
    const qs = timedAttractionQueries("Tokyo", "EN");
    expect(qs.some((q) => /museum|park|viewpoint|things to do/i.test(q))).toBe(true);
  });
});

describe("timedMealQueries", () => {
  it("should_use_cn_restaurant_when_cjk_city_en_ui", () => {
    const qs = timedMealQueries("哈尔滨", "EN", undefined, "restaurant");
    expect(qs.some((q) => q.includes("餐厅"))).toBe(true);
  });
});
