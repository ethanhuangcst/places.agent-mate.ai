import { describe, expect, it } from "vitest";
import {
  countExpectedFillStops,
  incompleteFillDeviation,
  resolveFillTripStatus,
} from "./fill-trip-status";
import type { ItinerarySkeleton } from "./make-itinerary";
import type { PlaceCard } from "./types";

const poolPlace = (name: string): PlaceCard => ({
  provider: "AMAP",
  name,
  location: { lat: 30, lng: 120, crs: "WGS84" },
  category: "attraction",
  sources: [{ provider: "AMAP", native_id: "B0XIHU00001", deeplinks: {} }],
});

function skeleton1d(): ItinerarySkeleton {
  return {
    days: [
      {
        day_index: 1,
        day_theme: "Day 1",
        stops: [
          { name: "Hotel", kind: "stay" },
          { name: "西湖", kind: "attraction", provider: "AMAP", native_id: "B0XIHU00001" },
          { name: "lunch", kind: "meal", meal_slot: "lunch" },
          { name: "dinner", kind: "meal", meal_slot: "dinner" },
        ],
      },
    ],
  };
}

describe("fill-trip-status MVP-T8 TD-9", () => {
  it("should_count_expected_fill_stops", () => {
    expect(countExpectedFillStops(skeleton1d())).toBe(4);
  });

  it("should_fail_when_fill_incomplete", () => {
    const sk = skeleton1d();
    const pool = {
      places: [poolPlace("西湖")],
      restaurants: [] as PlaceCard[],
      stays: ["Hotel"],
    };
    const result = resolveFillTripStatus({
      skeleton: sk,
      filledStops: [{ day_index: 1, stop_index: 0, stop: { kind: "stay", name: "Hotel" } }],
      pool,
      mustInclude: [],
      numDays: 1,
      pace: "medium",
      city: "杭州",
      fillReachedTripComplete: false,
    });
    expect(result.status).toBe("failed");
    expect(result.deviations?.some((d) => d.reason === "fill_incomplete")).toBe(true);
  });

  it("should_ready_when_fill_complete_and_gates_pass", () => {
    const sk = skeleton1d();
    const pool = {
      places: [poolPlace("西湖")],
      restaurants: [] as PlaceCard[],
      stays: ["Hotel"],
    };
    const filledStops = [
      { day_index: 1, stop_index: 0, stop: { kind: "stay", name: "Hotel" } },
      { day_index: 1, stop_index: 1, stop: { kind: "attraction", name: "西湖" } },
      { day_index: 1, stop_index: 2, stop: { kind: "meal", meal_slot: "lunch", name: "lunch" } },
      { day_index: 1, stop_index: 3, stop: { kind: "meal", meal_slot: "dinner", name: "dinner" } },
    ];
    const result = resolveFillTripStatus({
      skeleton: sk,
      filledStops,
      pool,
      mustInclude: [],
      numDays: 1,
      pace: "medium",
      city: "杭州",
      fillReachedTripComplete: true,
    });
    expect(result.status).toBe("ready");
  });

  it("should_fail_when_hard_gate_day_count_mismatch", () => {
    const sk = skeleton1d();
    const pool = {
      places: [poolPlace("西湖")],
      restaurants: [] as PlaceCard[],
      stays: ["Hotel"],
    };
    const filledStops = [
      { day_index: 1, stop_index: 0, stop: { kind: "stay", name: "Hotel" } },
      { day_index: 1, stop_index: 1, stop: { kind: "attraction", name: "西湖" } },
      { day_index: 1, stop_index: 2, stop: { kind: "meal", meal_slot: "lunch", name: "lunch" } },
      { day_index: 1, stop_index: 3, stop: { kind: "meal", meal_slot: "dinner", name: "dinner" } },
    ];
    const result = resolveFillTripStatus({
      skeleton: sk,
      filledStops,
      pool,
      mustInclude: [],
      numDays: 3,
      pace: "medium",
      city: "杭州",
      fillReachedTripComplete: true,
    });
    expect(result.status).toBe("failed");
    expect(result.deviations?.some((d) => d.field === "hard_gate")).toBe(true);
  });

  it("incompleteFillDeviation shape", () => {
    const d = incompleteFillDeviation(10, 3);
    expect(d.field).toBe("fill_completion");
    expect(d.reason).toBe("fill_incomplete");
  });
});
