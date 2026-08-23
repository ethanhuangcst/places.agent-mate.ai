import { describe, expect, it, beforeEach } from "vitest";
import {
  arrangeGateKey,
  buildArrangeContinueHostInstructions,
  evaluateArrangePresentGate,
  markArrangeAwaitingPresent,
  recordMustIncludeCoverage,
  resetArrangePresentGates,
  DAY_CARD_FORMAT_INSTRUCTIONS,
} from "./arrange-present-gate";

describe("arrange-present-gate", () => {
  beforeEach(() => {
    resetArrangePresentGates();
  });

  it("should_block_next_day_when_previous_unpresented", () => {
    const key = arrangeGateKey({ city: "Lisbon", originName: "Hotel", locale: "CN" });
    markArrangeAwaitingPresent(key, 1);
    const gate = evaluateArrangePresentGate({ key, dayIndex: 2 });
    expect(gate.ok).toBe(false);
    if (!gate.ok) {
      expect(gate.day_index).toBe(1);
      expect(gate.host_instructions).toMatch(/do it yourself right after presenting|without asking the user/);
      expect(gate.host_instructions).toMatch(/MULTI-LINE/);
      expect(gate.host_instructions).toMatch(/ONE day at a time|do NOT fire multiple arrange_day in parallel/i);
    }
  });

  it("should_allow_next_day_when_presented_previous_day_true", () => {
    const key = arrangeGateKey({ city: "Lisbon", originName: "Hotel", locale: "CN" });
    markArrangeAwaitingPresent(key, 1);
    const gate = evaluateArrangePresentGate({
      key,
      dayIndex: 2,
      presented_previous_day: true,
    });
    expect(gate.ok).toBe(true);
  });

  it("should_instruct_multi_line_sequential_when_not_last_day", () => {
    const text = buildArrangeContinueHostInstructions({ dayIndex: 3, numDays: 4 });
    expect(text).toMatch(/Day 3 of 4/);
    expect(text).toMatch(/no asking the user|no waiting for 继续|do it yourself/i);
    expect(text).toMatch(/ONE day at a time|do NOT fire multiple arrange_day in parallel/i);
    expect(text).toMatch(/### HH:MM/);
    expect(text).toMatch(/must_include/);
    expect(DAY_CARD_FORMAT_INSTRUCTIONS).toMatch(/MULTI-LINE|multi-line/i);
  });

  it("should_instruct_overview_and_stop_on_last_day_when_coverage_complete", () => {
    const text = buildArrangeContinueHostInstructions({ dayIndex: 4, numDays: 4 });
    expect(text).toMatch(/LAST day \(Day 4 of 4\)/);
    expect(text).toMatch(/Do NOT call arrange_day again/);
    expect(text).toMatch(/ONCE only|Present Day 4 ONCE/i);
    expect(text).toMatch(/Forbidden:.*(re-paste|repeating)/i);
  });

  it("should_forbid_invented_blocks_in_day_card_format", () => {
    expect(DAY_CARD_FORMAT_INSTRUCTIONS).toMatch(/Only list blocks returned by arrange_day/i);
    expect(DAY_CARD_FORMAT_INSTRUCTIONS).toMatch(/Forbidden: inventing/i);
  });

  it("should_block_overview_when_must_include_missing_on_last_day", () => {
    const text = buildArrangeContinueHostInstructions({
      dayIndex: 4,
      numDays: 4,
      missing_must_include: ["卡斯凯什"],
    });
    expect(text).toMatch(/BLOCKED OVERVIEW/);
    expect(text).toMatch(/卡斯凯什/);
    expect(text).toMatch(/dayIndex=5/);
  });

  it("should_track_must_include_coverage_across_days", () => {
    const key = arrangeGateKey({ city: "Lisbon", originName: "H", locale: "CN" });
    // D7: day_theme alone does NOT cover — need real block name evidence
    const a = recordMustIncludeCoverage({
      key,
      must_include: ["辛特拉", "卡斯凯什"],
      day_theme: "辛特拉一日游",
      block_names: ["佩纳宫"],
    });
    // 佩纳宫 does not substring-match 辛特拉 → still missing both unless name hits
    expect(a.missing).toContain("辛特拉");
    expect(a.missing).toContain("卡斯凯什");

    const b = recordMustIncludeCoverage({
      key,
      must_include: ["辛特拉", "卡斯凯什"],
      day_theme: "ignored theme",
      block_names: ["辛特拉国家宫"],
    });
    expect(b.covered).toContain("辛特拉");
    expect(b.missing).toEqual(["卡斯凯什"]);

    const c = recordMustIncludeCoverage({
      key,
      must_include: ["辛特拉", "卡斯凯什"],
      day_theme: "卡斯凯什海岸",
      block_names: ["卡斯凯什海滩"],
    });
    expect(c.missing).toEqual([]);
  });
});
