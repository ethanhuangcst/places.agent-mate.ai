import { describe, expect, it } from "vitest";
import { skeletonPoolQueries } from "./plan-trip";

describe("skeletonPoolQueries (agent-itinerary-103)", () => {
  it("should_include_kids_theme_templates_when_family_kids_and_儿童_other", () => {
    const q = skeletonPoolQueries("Shanghai", "CN", {
      trip_type: "family_kids",
      other: "7岁儿童",
    });
    expect(q.some((s) => /博物馆|景点/.test(s))).toBe(true);
    expect(q.some((s) => /亲子|游乐园/.test(s))).toBe(true);
    expect(q.every((s) => !/迪士尼|Disney/i.test(s))).toBe(true);
    expect(q.length).toBeLessThanOrEqual(2 + 3);
  });

  it("should_not_add_theme_park_when_couple_romance_lisbon", () => {
    const q = skeletonPoolQueries("Lisbon", "EN", {
      trip_type: "couple_romance",
    });
    expect(q).toEqual(expect.arrayContaining(["Lisbon museum", "Lisbon landmark"]));
    expect(q.every((s) => !/theme park|游乐园|kids|zoo|aquarium/i.test(s))).toBe(true);
  });

  it("should_add_historic_template_when_custom_历史_type", () => {
    const q = skeletonPoolQueries("西安", "CN", {
      trip_type: "探访历史",
    });
    expect(q.some((s) => s.includes("历史"))).toBe(true);
    expect(q.every((s) => !/兵马俑|大雁塔/.test(s))).toBe(true);
  });
});

describe("skeletonPoolQueries kids pack (agent-itinerary-106)", () => {
  it("should_include_主题公园_when_family_kids_shanghai (TC-T3-106-01)", () => {
    const q = skeletonPoolQueries("Shanghai", "CN", {
      trip_type: "family_kids",
      other: "7岁儿童",
    });
    expect(q.some((s) => s.includes("主题公园"))).toBe(true);
    expect(q.every((s) => !/迪士尼|Disney/i.test(s))).toBe(true);
  });

  it("should_not_add_theme_park_for_couple_romance (TC-T3-106-02)", () => {
    const q = skeletonPoolQueries("Lisbon", "EN", {
      trip_type: "couple_romance",
    });
    expect(q.every((s) => !/theme park|游乐园|主题公园|zoo|aquarium/i.test(s))).toBe(true);
  });

  it("should_add_history_without_amusement_for_探访历史 (TC-T3-106-03)", () => {
    const q = skeletonPoolQueries("西安", "CN", {
      trip_type: "探访历史",
    });
    expect(q.some((s) => s.includes("历史"))).toBe(true);
    expect(q.every((s) => !/游乐园|主题公园/.test(s))).toBe(true);
  });
});
