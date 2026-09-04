import { describe, it, expect } from "vitest";
import {
  evaluateDiscoverIntake,
  evaluateArrangeIntake,
  buildIntakeHostInstructions,
  buildFixedTripForm,
  mustIncludeTokenCovered,
  skeletonCoversMustInclude,
  stripAreaSuffix,
  parseSpendLevel,
  MCP_TRIP_CHAT_RULES,
} from "./trip-intake";

describe("evaluateDiscoverIntake", () => {
  it("should_always_return_full_8_row_form_when_empty", () => {
    const r = evaluateDiscoverIntake({ locale: "CN" });
    expect(r.status).toBe("need_input");
    if (r.status === "need_input") {
      expect(r.questions).toHaveLength(8);
      expect(r.question).toMatch(/1\./);
      expect(r.question).toMatch(/8\./);
      expect(r.question).toMatch(/节奏/);
      expect(r.question).toMatch(/消费/);
      expect(r.question).toMatch(/兴趣/);
      expect(r.question).toMatch(/必去/);
      expect(r.remaining_fields).toEqual(["city", "start_date", "num_days"]);
      expect(r.defaults.spend_level).toBe(2);
    }
  });

  it("should_be_ready_without_hotel_and_keep_defaults", () => {
    const r = evaluateDiscoverIntake({
      city: "Lisbon",
      bounds: { start: "2026-09-05" },
      numDays: 4,
      locale: "CN",
    });
    expect(r.status).toBe("ready");
    if (r.status === "ready") {
      expect(r.pace).toBe("medium");
      expect(r.spend_level).toBe(2);
      expect(r.numDays).toBe(4);
    }
  });

  it("should_still_list_full_form_when_only_start_missing", () => {
    const r = evaluateDiscoverIntake({
      city: "Lisbon",
      numDays: 4,
      locale: "CN",
    });
    expect(r.status).toBe("need_input");
    if (r.status === "need_input") {
      expect(r.remaining_fields).toEqual(["start_date"]);
      expect(r.questions).toHaveLength(8);
      expect(r.question).toMatch(/【已填：Lisbon】/);
    }
  });
});

describe("evaluateArrangeIntake", () => {
  it("should_ok_when_origin_missing_by_default", () => {
    expect(evaluateArrangeIntake({ locale: "CN" }).status).toBe("ok");
  });
});

describe("buildIntakeHostInstructions", () => {
  it("should_embed_rules_and_full_form", () => {
    const intake = evaluateDiscoverIntake({ locale: "CN" });
    if (intake.status !== "need_input") throw new Error("expected need_input");
    const text = buildIntakeHostInstructions(intake);
    expect(text).toMatch(/RULE 0/);
    expect(text).toMatch(/FIXED 8-row|完整表单/);
    expect(text).toMatch(/as-is|原文|Do not rewrite/i);
    expect(MCP_TRIP_CHAT_RULES).toMatch(/scale 1–3|spend_level=2/);
    expect(MCP_TRIP_CHAT_RULES).toMatch(/empty candidates|auto-discover/i);
    expect(MCP_TRIP_CHAT_RULES).toMatch(/execute the returned next_tool_call chain/);
    expect(MCP_TRIP_CHAT_RULES).toMatch(/plan_next_stop/);
    expect(MCP_TRIP_CHAT_RULES).toMatch(/travel_tips/);
  });
});

describe("buildFixedTripForm", () => {
  it("should_mark_known_values", () => {
    const form = buildFixedTripForm({
      locale: "CN",
      city: "Lisbon",
      start: "2026-09-16",
      numDays: 4,
      must_include: "辛特拉、卡斯凯什",
    });
    expect(form.question).toMatch(/辛特拉/);
    expect(form.remaining_hard).toEqual([]);
  });
});

describe("mustIncludeTokenCovered", () => {
  it("should_match_sintra_variants", () => {
    expect(mustIncludeTokenCovered("辛特拉", ["Sintra palace day", "贝伦"])).toBe(false);
    expect(mustIncludeTokenCovered("辛特拉", ["辛特拉一日游"])).toBe(true);
    expect(mustIncludeTokenCovered("Cascais", ["卡斯凯什海岸"])).toBe(false);
    expect(mustIncludeTokenCovered("卡斯凯什", ["Cascais bay day"])).toBe(false);
    expect(mustIncludeTokenCovered("Cascais", ["Cascais coast"])).toBe(true);
  });

  it("should_not_cover_town_token_with_unrelated_palace_name", () => {
    expect(mustIncludeTokenCovered("辛特拉", ["佩纳宫"])).toBe(false);
    expect(skeletonCoversMustInclude("辛特拉", ["佩纳宫"])).toBe(false);
  });
});

describe("skeletonCoversMustInclude", () => {
  it("should_cover_area_suffix_via_place_core_or_theme", () => {
    expect(stripAreaSuffix("贝伦区")).toBe("贝伦");
    expect(skeletonCoversMustInclude("贝伦区", ["贝伦塔"])).toBe(true);
    expect(skeletonCoversMustInclude("辛特拉", ["辛特拉宫"])).toBe(true);
    expect(skeletonCoversMustInclude("辛特拉", ["辛特拉一日"])).toBe(true);
    expect(skeletonCoversMustInclude("卡斯凯什", ["贝伦塔"])).toBe(false);
  });
});

describe("parseSpendLevel", () => {
  it("should_parse_cn_and_numbers", () => {
    expect(parseSpendLevel(2)).toBe(2);
    expect(parseSpendLevel("适中")).toBe(2);
    expect(parseSpendLevel("节约")).toBe(1);
    expect(parseSpendLevel("宽松")).toBe(3);
  });
});
