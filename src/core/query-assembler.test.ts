import { describe, it, expect } from "vitest";
import {
  assembleAttractionSearchJobs,
  assembleDiscoverAttractionJobs,
  assembleDiscoverRestaurantJobs,
  assembleRestaurantSearchJobs,
} from "./query-assembler";

describe("assembleAttractionSearchJobs", () => {
  it("should_emit_cn_amap_jobs_only_when_amap_only", () => {
    const jobs = assembleAttractionSearchJobs({
      city: "哈尔滨",
      providers: ["AMAP"],
      uiLocale: "EN",
    });
    expect(jobs.length).toBeGreaterThan(0);
    expect(jobs.every((j) => j.providers.includes("AMAP"))).toBe(true);
    expect(jobs.every((j) => /[\u4e00-\u9fff]/.test(j.query))).toBe(true);
    expect(jobs.some((j) => /attractions|landmarks/i.test(j.query))).toBe(false);
  });

  it("should_emit_en_only_for_google_when_ui_en", () => {
    const jobs = assembleAttractionSearchJobs({
      city: "Tokyo",
      providers: ["GOOGLE_MAPS"],
      uiLocale: "EN",
    });
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.providers).toEqual(["GOOGLE_MAPS"]);
    expect(jobs[0]!.query).toMatch(/Tokyo/i);
  });

  it("should_emit_en_and_ui_locale_for_google_when_ui_cn", () => {
    const jobs = assembleAttractionSearchJobs({
      city: "Tokyo",
      providers: ["GOOGLE_MAPS"],
      uiLocale: "CN",
    });
    expect(jobs.length).toBe(2);
    expect(jobs.every((j) => j.providers.includes("GOOGLE_MAPS"))).toBe(true);
  });

  it("should_split_amap_and_google_when_dual_providers", () => {
    const jobs = assembleAttractionSearchJobs({
      city: "哈尔滨",
      providers: ["AMAP", "GOOGLE_MAPS"],
      uiLocale: "CN",
    });
    const amap = jobs.filter((j) => j.providers.includes("AMAP"));
    const google = jobs.filter((j) => j.providers.includes("GOOGLE_MAPS"));
    expect(amap.length).toBeGreaterThan(0);
    expect(google.length).toBeGreaterThan(0);
    expect(amap.every((j) => /[\u4e00-\u9fff]/.test(j.query))).toBe(true);
  });
});

describe("assembleRestaurantSearchJobs", () => {
  it("should_use_cn_restaurant_keyword_for_amap", () => {
    const jobs = assembleRestaurantSearchJobs({
      city: "哈尔滨",
      providers: ["AMAP"],
      uiLocale: "EN",
    });
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.query).toContain("餐厅");
  });

  it("should_use_en_restaurant_keyword_for_google_en_ui", () => {
    const jobs = assembleRestaurantSearchJobs({
      city: "Tokyo",
      providers: ["GOOGLE_MAPS"],
      uiLocale: "EN",
    });
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.query.toLowerCase()).toContain("restaurant");
  });
});

describe("assembleDiscoverAttractionJobs", () => {
  it("should_emit_generic_cn_jobs_for_xian_amap_after_adr042_update", () => {
    // ADR-042 Update: no city-specific seeds — generic templates only.
    const jobs = assembleDiscoverAttractionJobs({
      city: "西安",
      providers: ["AMAP"],
      uiLocale: "EN",
    });
    expect(jobs.length).toBeGreaterThan(0);
    expect(jobs.every((j) => j.providers.includes("AMAP"))).toBe(true);
    expect(jobs.every((j) => /[\u4e00-\u9fff]/.test(j.query))).toBe(true);
    expect(jobs.some((j) => /attractions|landmarks/i.test(j.query))).toBe(false);
    // No city-encyclopedia seeds.
    expect(jobs.some((j) => j.query.includes("秦始皇帝陵博物院"))).toBe(false);
    expect(jobs.some((j) => j.query.includes("兵马俑"))).toBe(false);
  });

  it("should_emit_hot_templates_for_lisbon_on_google", () => {
    const jobs = assembleDiscoverAttractionJobs({
      city: "Lisbon",
      providers: ["GOOGLE_MAPS"],
      uiLocale: "EN",
    });
    expect(jobs.some((j) => /top attractions|must see|famous sightseeing/i.test(j.query))).toBe(
      true,
    );
    expect(jobs.every((j) => j.query.includes("Lisbon"))).toBe(true);
  });

  it("should_still_emit_generic_jobs_for_unknown_city", () => {
    const jobs = assembleDiscoverAttractionJobs({
      city: "NowhereVille",
      providers: ["AMAP"],
      uiLocale: "CN",
    });
    expect(jobs.length).toBeGreaterThan(0);
    expect(jobs.every((j) => j.query.includes("NowhereVille"))).toBe(true);
  });
});

describe("assembleDiscoverRestaurantJobs", () => {
  it("should_emit_generic_restaurant_jobs_for_xian_after_adr042_update", () => {
    // ADR-042 Update: no city-specific dining seeds — generic templates only.
    const jobs = assembleDiscoverRestaurantJobs({
      city: "西安",
      providers: ["AMAP"],
      uiLocale: "CN",
    });
    expect(jobs.length).toBeGreaterThan(0);
    expect(jobs.some((j) => j.query.includes("餐厅") || j.query.includes("美食"))).toBe(true);
    // No city-encyclopedia seeds.
    expect(jobs.some((j) => j.query.includes("回民街"))).toBe(false);
  });
});
