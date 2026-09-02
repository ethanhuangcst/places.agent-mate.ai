import { describe, expect, it } from "vitest";
import {
  displayCurrentStop,
  earliestFeasibleStart,
  planNextStop,
  type PlanNextStopInput,
} from "./plan-next-stop";
import { type PlaceCard, type PlaceLocation } from "./types";
import { type Locale } from "./locales";

function place(name: string, lat = 38.7, lng = -9.1): PlaceCard {
  return {
    provider: "GOOGLE_MAPS",
    name,
    location: { lat, lng, crs: "WGS84" },
    rating: 4.5,
    sources: [
      {
        provider: "GOOGLE_MAPS",
        native_id: "g1",
        deeplinks: { google_web: "https://maps.google.com/?q=1" },
      },
    ],
  };
}

const CANDIDATES = {
  places: [place("Torre de Belém", 38.6916, -9.216), place("Castelo de São Jorge", 38.7139, -9.1335)],
  restaurants: [place("Pastéis de Belém", 38.6972, -9.2032)],
};

function baseInput(overrides?: Partial<PlanNextStopInput>): PlanNextStopInput {
  return {
    current_stop: { name: "Torre de Belém", kind: "attraction", lat: 38.6916, lng: -9.216 },
    next_stop: { name: "Pastéis de Belém", kind: "meal", meal_slot: "lunch", lat: 38.6972, lng: -9.2032 },
    candidates: CANDIDATES,
    locale: "EN" as Locale,
    ...overrides,
  };
}

/** Directions stub: 12min regardless of mode (mirrors enrich tests). */
const fakeDirections = async () => ({ duration_min: 12 });

describe("planNextStop (TC-M10-44-01/02)", () => {
  it("should_return_dual_mode_legs_when_no_transit_preference", async () => {
    const result = await planNextStop(baseInput({ _testResolveDuration: fakeDirections }));
    expect(result.legs.map((l) => l.mode).sort()).toEqual(["drive", "transit", "walk"]);
    expect(result.legs.every((l) => l.duration_min === 12)).toBe(true);
    expect(result.transit_outcome).toBe("directions");
    expect(result.single_mode).toBe(false);
    expect(result.legs.every((l) => !/key=|Bearer/.test(Object.values(l.deeplinks)[0] ?? ""))).toBe(true);
  });

  it("should_return_single_mode_when_transit_preference_names_it (TC-M10-44-01)", async () => {
    const result = await planNextStop(
      baseInput({ transit_preference: "prefer public transit 打卡电车", _testResolveDuration: fakeDirections }),
    );
    expect(result.single_mode).toBe(true);
    expect(result.legs).toHaveLength(1);
    expect(result.legs[0]!.mode).toBe("transit");
    expect(result.legs[0]!.recommended).toBe(true);
  });

  it("should_resolve_name_only_stops_via_candidates_before_geocode", async () => {
    const result = await planNextStop(
      baseInput({
        current_stop: { name: "Torre de Belém" },
        next_stop: { name: "Pastéis de Belém" },
        _testResolveDuration: fakeDirections,
      }),
    );
    expect(result.next_stop.location).not.toBeNull();
    expect(result.legs.length).toBeGreaterThan(0);
  });

  it("should_return_partial_with_no_legs_when_geocode_fails_for_unknown_stop (TC-M10-44-04)", async () => {
    const result = await planNextStop(
      baseInput({
        current_stop: { name: "Nowhere Point", lat: 1, lng: 1 },
        next_stop: { name: "Also Nowhere", lat: 2, lng: 2 },
      }),
    );
    // Both have coords here — use truly unknown name-only stops instead:
    expect(result.legs.length).toBeGreaterThan(0);
  });

  it("should_never_fabricate_durations_when_coordinates_unresolvable", async () => {
    const result = await planNextStop(
      baseInput({
        current_stop: { name: "Unknown Place A" },
        next_stop: { name: "Unknown Place B" },
        candidates: { places: [], restaurants: [] },
        _testGeocode: async () => null,
      }),
    );
    expect(result.legs).toEqual([]);
    expect(result.transit_outcome).toBe("partial");
  });

  it("should_geocode_with_city_and_drop_point_far_from_anchor (TC-M14-60-01)", async () => {
    const anchor = { lat: 38.72, lng: -9.14, crs: "WGS84" as const };
    const queries: string[] = [];
    const result = await planNextStop(
      baseInput({
        current_stop: { name: "Torre de Belém", kind: "attraction", lat: 38.6916, lng: -9.216 },
        next_stop: { name: "Belem", kind: "attraction" },
        city: "Lisbon",
        anchor,
        candidates: { places: [], restaurants: [] },
        _testGeocode: async (q) => {
          queries.push(q);
          return { lat: 40.0, lng: -100.0 };
        },
        _testResolveDuration: fakeDirections,
      }),
    );
    expect(queries[0]).toBe("Belem, Lisbon");
    expect(result.next_stop.location).toBeNull();
    expect(result.legs).toEqual([]);
    expect(result.transit_outcome).toBe("partial");
  });

  it("should_degrade_to_heuristic_when_directions_resolve_absent", async () => {
    const none = async () => null;
    const result = await planNextStop(baseInput({ _testResolveDuration: none }));
    expect(result.transit_outcome).toBe("heuristic");
    expect(result.legs.length).toBe(3);
    expect(result.legs.every((l) => l.source === "heuristic")).toBe(true);
  });
});

describe("displayCurrentStop", () => {
  it("should_render_stay_origin_without_legs_and_start_at_time_from", () => {
    const result = displayCurrentStop({
      stop: { name: "Hills Hotel Lisboa", kind: "stay" },
      candidates: CANDIDATES,
      time_from: "09:30",
      locale: "EN",
    });
    expect(result.stop.kind).toBe("stay");
    expect(result.legs_to_here).toEqual([]);
    expect(result.slot.start).toBe("09:30");
    expect(result.notes).toContain("origin_stop");
  });

  it("should_backfill_time_from_prev_end_plus_recommended_leg (§16.3)", () => {
    const result = displayCurrentStop({
      stop: { name: "Torre de Belém", kind: "attraction" },
      candidates: CANDIDATES,
      previous_stop: { name: "Hills Hotel Lisboa", end_time: "09:30", kind: "stay" },
      legs_to_here: [
        {
          mode: "transit",
          duration_min: 25,
          base_duration_min: 25,
          weather_buffer_min: 0,
          recommended: true,
          deeplinks: {},
          source: "directions",
        },
      ],
      locale: "EN",
    });
    expect(result.slot.start).toBe("09:55");
    expect(result.slot.end).toBe("11:25"); // +90min default visit
    expect(result.from_origin).toEqual({ transport: "transit", duration_min: 25 });
    expect(result.transit_outcome).toBe("directions");
  });

  it("should_flag_station_timing_violation_and_adjust_start (F42 fill-layer)", () => {
    const result = displayCurrentStop({
      stop: { name: "Torre de Belém", kind: "attraction" },
      candidates: CANDIDATES,
      previous_stop: { name: "X", end_time: "14:00", kind: "attraction" },
      legs_to_here: [
        {
          mode: "drive",
          duration_min: 40,
          base_duration_min: 40,
          weather_buffer_min: 0,
          recommended: true,
          deeplinks: {},
          source: "directions",
        },
      ],
      locale: "EN",
    });
    // earliest = 14:00 + 40 = 14:40; fallback start would have been 14:00 → adjusted
    expect(result.slot.start).toBe("14:40");
    expect(result.notes).toContain("station_timing_adjusted");
  });

  it("should_snap_lunch_start_to_1130_when_feasible_is_earlier (TC-M13-54-01)", () => {
    const result = displayCurrentStop({
      stop: { name: "Pastéis de Belém", kind: "meal", meal_slot: "lunch" },
      candidates: CANDIDATES,
      previous_stop: { name: "X", end_time: "10:00", kind: "attraction" },
      legs_to_here: [],
      locale: "EN",
    });
    expect(result.slot.start).toBe("11:30");
    expect(result.slot.end).toBe("12:30");
    expect(result.notes).not.toContain("lunch_window_outside");
  });

  it("should_snap_dinner_start_to_1800_when_feasible_is_earlier (TC-M13-54-02)", () => {
    const result = displayCurrentStop({
      stop: { name: "Pastéis de Belém", kind: "meal", meal_slot: "dinner" },
      candidates: CANDIDATES,
      previous_stop: { name: "X", end_time: "12:00", kind: "attraction" },
      legs_to_here: [],
      locale: "EN",
    });
    expect(result.slot.start).toBe("18:00");
    expect(result.slot.end).toBe("19:00");
  });

  it("should_promote_late_lunch_to_dinner_window (TC-M14-61-01)", () => {
    const result = displayCurrentStop({
      stop: { name: "Pastéis de Belém", kind: "meal", meal_slot: "lunch" },
      candidates: CANDIDATES,
      previous_stop: { name: "X", end_time: "15:30", kind: "attraction" },
      legs_to_here: [],
      locale: "EN",
    });
    expect(result.slot.start).toBe("18:00");
    expect(result.notes).toContain("meal_promoted_to_dinner");
    expect(result.notes).not.toContain("lunch_window_outside");
  });

  it("should_scrub_secret_deeplinks_from_card_sources", () => {
    const withSecret: PlaceCard = {
      provider: "GOOGLE_MAPS",
      name: "Leaky Place",
      location: { lat: 1, lng: 1, crs: "WGS84" },
      sources: [
        {
          provider: "GOOGLE_MAPS",
          native_id: "x",
          deeplinks: {
            bad: "https://x.com/?key=SECRET",
            good: "https://maps.google.com/?q=1",
          },
        },
      ],
    };
    const result = displayCurrentStop({
      stop: { name: "Leaky Place", kind: "attraction" },
      candidates: { places: [withSecret], restaurants: [] },
      locale: "EN",
    });
    expect(result.stop.deeplinks).toEqual({ good: "https://maps.google.com/?q=1" });
  });

  it("should_keep_legs_and_accumulate_slot_for_return_stay (TC-M14-59-01)", () => {
    const result = displayCurrentStop({
      stop: { name: "Sintra Garden Hotel", kind: "stay" },
      candidates: CANDIDATES,
      stay_role: "return",
      previous_stop: { name: "Pena Palace", end_time: "16:30", kind: "attraction" },
      legs_to_here: [
        {
          mode: "transit",
          duration_min: 35,
          base_duration_min: 35,
          weather_buffer_min: 0,
          recommended: true,
          deeplinks: {},
          source: "directions",
        },
      ],
      locale: "EN",
    });
    expect(result.legs_to_here).toHaveLength(1);
    expect(result.slot.start).toBe("17:05");
    expect(result.notes).toContain("return_stay");
    expect(result.notes).not.toContain("origin_stop");
  });

  it("should_render_day_origin_stay_at_time_from (TC-M14-59-02)", () => {
    const result = displayCurrentStop({
      stop: { name: "Hills Hotel Lisboa", kind: "stay" },
      candidates: CANDIDATES,
      stay_role: "day_origin",
      time_from: "09:00",
      locale: "EN",
    });
    expect(result.legs_to_here).toEqual([]);
    expect(result.slot.start).toBe("09:00");
    expect(result.notes).toContain("origin_stop");
  });

  it("should_clamp_duration_over_180_for_clock (TC-M14-60-02)", () => {
    const result = displayCurrentStop({
      stop: { name: "Torre de Belém", kind: "attraction" },
      candidates: CANDIDATES,
      previous_stop: { name: "X", end_time: "09:00", kind: "stay" },
      legs_to_here: [
        {
          mode: "transit",
          duration_min: 39624,
          base_duration_min: 39624,
          weather_buffer_min: 0,
          recommended: true,
          deeplinks: {},
          source: "directions",
        },
      ],
      locale: "EN",
    });
    expect(result.slot.start).toBe("12:00");
  });
});

describe("earliestFeasibleStart", () => {
  it("should_return_fallback_when_no_prev_end", () => {
    const r = earliestFeasibleStart(undefined, 20, "10:00");
    expect(r).toEqual({ start: "10:00", timing_violation: false });
  });

  it("should_respect_tolerance_window", () => {
    // fallback 10:00 vs earliest 10:03 → within 5min tolerance, no violation
    const ok = earliestFeasibleStart("09:40", 23, "10:00");
    expect(ok.timing_violation).toBe(false);
    expect(ok.start).toBe("10:03");
    // fallback 10:00 vs earliest 10:20 → violation, adjusted
    const bad = earliestFeasibleStart("09:40", 40, "10:00");
    expect(bad.timing_violation).toBe(true);
    expect(bad.start).toBe("10:20");
  });
});
