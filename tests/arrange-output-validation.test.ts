import { describe, it, expect } from "vitest";
import { validateStationTiming, validateItinerary, type LlmItineraryOutput } from "../src/core/itinerary-planner";

/**
 * TC-M9-U42-05: Lisbon 4D sample regression.
 * Fixture extracted from agent-specs/sample_lisbon_4d.md — the known data
 * quality issues that F42 validations should catch.
 */
describe("TC-M9-U42-05: Lisbon 4D fixture regression", () => {
  // Day 2: Sintra "day trip" — only first block in Sintra, lunch back in Lisbon.
  // Block 1 ends 14:00, transit to Lisbon = 100min, but block 2 starts 14:15 (15min gap).
  const day2Blocks = [
    { name: "辛特拉", type: "attraction" as const, start_time: "10:00", duration_min: 240, reason: "ok", legs_to_here: [{ mode: "transit", duration_min: 102, recommended: true }] },
    { name: "PUT IT ON LISBON", type: "lunch" as const, start_time: "14:15", duration_min: 60, reason: "ok", legs_to_here: [{ mode: "transit", duration_min: 100, recommended: true }] },
    { name: "圣卢西亚观景台", type: "attraction" as const, start_time: "15:35", duration_min: 45, reason: "ok", legs_to_here: [{ mode: "walk", duration_min: 24, recommended: true }] },
  ];

  // Day 3: Cascais "day trip" — same restaurant for lunch AND dinner.
  const day3Blocks = [
    { name: "卡斯凯什", type: "attraction" as const, start_time: "10:00", duration_min: 180, reason: "ok", legs_to_here: [{ mode: "transit", duration_min: 87, recommended: true }] },
    { name: "Ato Gastronómico美食行动", type: "lunch" as const, start_time: "13:15", duration_min: 75, reason: "ok", legs_to_here: [{ mode: "transit", duration_min: 45, recommended: true }] },
    { name: "卡斯凯什", type: "attraction" as const, start_time: "15:00", duration_min: 150, reason: "ok", legs_to_here: [{ mode: "transit", duration_min: 59, recommended: true }] },
    { name: "Ato Gastronómico美食行动", type: "dinner" as const, start_time: "18:15", duration_min: 105, reason: "ok", legs_to_here: [{ mode: "transit", duration_min: 45, recommended: true }] },
  ];

  it("D2_station_timing_should_fail_gap_vs_transit", () => {
    const errors = validateStationTiming(day2Blocks, 5);
    // Block 1 ends 14:00, transit 100min → expect 15:40, actual 14:15 → 85min diff > 5min
    expect(errors.length).toBeGreaterThan(0);
  });

  it("D3_same_day_restaurant_dedup_should_fail", () => {
    const output: LlmItineraryOutput = {
      days: [{ day_index: 3, blocks: day3Blocks }],
    };
    const cands = new Set(day3Blocks.map((b) => b.name));
    const errors = validateItinerary(output, cands, 6);
    expect(errors.some((e) => e.message.includes("restaurant") || e.message.includes("Ato Gastronómico"))).toBe(true);
  });

  it("D3_station_timing_should_fail_lunch_gap_vs_transit", () => {
    const errors = validateStationTiming(day3Blocks, 5);
    // Block 1 ends 13:00, transit 45min → expect 13:45, actual 13:15 → 30min diff > 5min
    expect(errors.length).toBeGreaterThan(0);
  });
});
