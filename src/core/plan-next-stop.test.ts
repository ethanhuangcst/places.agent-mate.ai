import { describe, expect, it } from "vitest";
import {
  displayCurrentStop,
  earliestFeasibleStart,
  isAnonymousMealStop,
  LEG_MAX_DURATION_MIN,
  parseTransitPreference,
  planNextStop,
  planNextStopFill,
  type PlanNextStopInput,
} from "./plan-next-stop";
import { type PlaceCard } from "./types";
import { type Locale } from "./locales";
import { type TravelMode } from "./itinerary-timed";

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

  it("should_keep_dual_mode_when_preference_is_metro_plus_walk (TC-M23-88-01)", async () => {
    const zh = parseTransitPreference("捷运 + 步行");
    expect(zh.single_mode).toBe(false);
    expect(zh.transit_preferred).toBe(true);
    expect(zh.mode).toBeNull();

    const en = parseTransitPreference("metro and walk");
    expect(en.single_mode).toBe(false);
    expect(en.transit_preferred).toBe(true);

    const result = await planNextStop(
      baseInput({ transit_preference: "捷运 + 步行", _testResolveDuration: fakeDirections }),
    );
    expect(result.single_mode).toBe(false);
    expect(result.legs.map((l) => l.mode).sort()).toEqual(["drive", "transit", "walk"]);
    expect(result.legs.find((l) => l.recommended)?.mode).toBe("transit");
  });

  it("should_drop_walk_over_45_and_keep_transit (TC-M23-88-02)", async () => {
    const stub = async (mode: TravelMode) => {
      if (mode === "walk") return { duration_min: 180 };
      if (mode === "transit") return { duration_min: 35 };
      return { duration_min: 20 };
    };
    const result = await planNextStop(
      baseInput({ transit_preference: "捷运 + 步行", _testResolveDuration: stub }),
    );
    expect(result.legs.some((l) => l.mode === "walk")).toBe(false);
    expect(result.legs.find((l) => l.mode === "transit")?.duration_min).toBe(35);
    expect(result.legs.every((l) => l.duration_min <= LEG_MAX_DURATION_MIN)).toBe(true);

    const display = displayCurrentStop({
      stop: { name: "Castelo de São Jorge", kind: "attraction" },
      candidates: CANDIDATES,
      previous_stop: { name: "Torre de Belém", end_time: "10:00", kind: "attraction" },
      legs_to_here: result.legs,
      locale: "EN",
    });
    // clock uses max remaining (drive 20 vs transit 35) → 35 → 10:35
    expect(display.slot.start).toBe("10:35");
  });

  it("should_drop_legs_over_120 (TC-M23-88-03)", async () => {
    const stub = async (mode: TravelMode) => {
      if (mode === "walk") return { duration_min: 30 };
      if (mode === "transit") return { duration_min: 150 };
      return { duration_min: 25 };
    };
    const result = await planNextStop(baseInput({ _testResolveDuration: stub }));
    expect(result.legs.some((l) => l.mode === "transit")).toBe(false);
    expect(result.legs.every((l) => l.duration_min <= LEG_MAX_DURATION_MIN)).toBe(true);
  });

  it("should_use_max_remaining_duration_for_clock (TC-M23-88-04)", () => {
    const result = displayCurrentStop({
      stop: { name: "Torre de Belém", kind: "attraction" },
      candidates: CANDIDATES,
      previous_stop: { name: "X", end_time: "09:00", kind: "stay" },
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
        {
          mode: "drive",
          duration_min: 50,
          base_duration_min: 50,
          weather_buffer_min: 0,
          recommended: false,
          deeplinks: {},
          source: "directions",
        },
      ],
      locale: "EN",
    });
    expect(result.slot.start).toBe("09:50");
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
        _testResolveDuration: async () => ({ duration_min: 500 }),
      }),
    );
    // Far points: directions absurd + F91 forbids >120 heuristic → empty legs.
    expect(result.legs).toEqual([]);
    expect(result.transit_outcome).toBe("partial");
    expect(result.legs.every((l) => l.duration_min <= 120)).toBe(true);
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

  it("TC-M22-86-01 should_search_near_current_stop_instead_of_geocoding_slot_id", async () => {
    const geoQueries: string[] = [];
    const result = await planNextStop(
      baseInput({
        next_stop: { name: "lunch", kind: "meal", meal_slot: "lunch" },
        candidates: { places: CANDIDATES.places, restaurants: [] },
        _testGeocode: async (q) => {
          geoQueries.push(q);
          return { lat: 1, lng: 1 };
        },
        _testSearchRestaurants: async () => [place("邻站食堂", 38.692, -9.215)],
        _testResolveDuration: fakeDirections,
      }),
    );
    expect(isAnonymousMealStop({ name: "lunch", kind: "meal", meal_slot: "lunch" })).toBe(true);
    expect(geoQueries.some((q) => /lunch/i.test(q))).toBe(false);
    expect(result.next_stop.name).toBe("邻站食堂");
    expect(result.next_stop.location).not.toBeNull();
    expect(result.meal_skipped).not.toBe(true);
  });

  it("TC-M22-86-02 should_reuse_used_name_when_search_empty (F91)", async () => {
    const result = await planNextStop(
      baseInput({
        next_stop: { kind: "meal", meal_slot: "dinner", name: "dinner" },
        candidates: { places: CANDIDATES.places, restaurants: [] },
        used_restaurant_names: ["Yesterday Spot"],
        _testSearchRestaurants: async () => [],
        _testGeocode: async () => null,
        _testResolveDuration: fakeDirections,
      }),
    );
    expect(result.meal_skipped).not.toBe(true);
    expect(result.next_stop.name).toBe("Yesterday Spot");
    expect(result.next_stop.location).not.toBeNull();
  });

  it("TC-M22-86-03 should_use_corridor_search_before_pool_fallback (F89)", async () => {
    let live = 0;
    const nearby = place("Pastéis de Belém", 38.6972, -9.2032);
    const result = await planNextStop(
      baseInput({
        next_stop: { name: "lunch", kind: "meal", meal_slot: "lunch" },
        candidates: { places: CANDIDATES.places, restaurants: [nearby] },
        lookahead_stop: { name: "Castelo de São Jorge", kind: "attraction", lat: 38.7139, lng: -9.1335 },
        _testSearchRestaurants: async () => {
          live += 1;
          return [place("走廊食堂", 38.692, -9.215)];
        },
        _testResolveDuration: fakeDirections,
      }),
    );
    expect(live).toBeGreaterThanOrEqual(1);
    expect(result.next_stop.name).toBe("走廊食堂");
  });

  it("should_search_near_only_when_lookahead_beyond_5km (TC-M23-89-01 / S6B)", async () => {
    const nears: Array<{ lat: number; lng: number }> = [];
    const geoQueries: string[] = [];
    const result = await planNextStop(
      baseInput({
        next_stop: { name: "lunch", kind: "meal", meal_slot: "lunch" },
        candidates: { places: CANDIDATES.places, restaurants: [] },
        // Castle is >5km from Belém — S6B drops far corridor end.
        lookahead_stop: { name: "Castelo de São Jorge", kind: "attraction", lat: 38.7139, lng: -9.1335 },
        _testGeocode: async (q) => {
          geoQueries.push(q);
          return null;
        },
        _testSearchRestaurants: async (near) => {
          nears.push({ lat: near.lat, lng: near.lng });
          return [place("Belém Bites", near.lat, near.lng)];
        },
        _testResolveDuration: fakeDirections,
      }),
    );
    expect(geoQueries.some((q) => /lunch/i.test(q))).toBe(false);
    expect(nears.length).toBe(1);
    expect(result.next_stop.name).toBe("Belém Bites");
    expect(result.meal_skipped).not.toBe(true);
  });

  it("should_search_three_corridor_points_when_lookahead_within_5km (S6B)", async () => {
    const nears: Array<{ lat: number; lng: number }> = [];
    const result = await planNextStop(
      baseInput({
        current_stop: {
          name: "Torre de Belém",
          kind: "attraction",
          lat: 38.6916,
          lng: -9.216,
          end_time: "12:00",
        },
        next_stop: { name: "lunch", kind: "meal", meal_slot: "lunch" },
        arrival_clock: "12:00",
        // ~1.5km from Torre — within 5km cluster
        lookahead_stop: { name: "Pastéis nearby", kind: "attraction", lat: 38.6972, lng: -9.2032 },
        _testSearchRestaurants: async (near) => {
          nears.push({ lat: near.lat, lng: near.lng });
          return [place("Belém Bites", near.lat, near.lng)];
        },
        _testResolveDuration: fakeDirections,
      }),
    );
    expect(nears.length).toBe(3);
    expect(result.next_stop.name).toBe("Belém Bites");
  });

  it("should_exclude_used_restaurant_names_in_plan_next_stop (TC-M23-89-02)", async () => {
    const result = await planNextStop(
      baseInput({
        next_stop: { name: "lunch", kind: "meal", meal_slot: "lunch" },
        candidates: { places: CANDIDATES.places, restaurants: [] },
        used_restaurant_names: ["Used Cafe"],
        _testSearchRestaurants: async () => [
          place("Used Cafe", 38.692, -9.215),
          place("Fresh Kitchen", 38.6921, -9.2151),
        ],
        _testResolveDuration: fakeDirections,
      }),
    );
    expect(result.next_stop.name).toBe("Fresh Kitchen");
  });

  it("should_prefer_budget_price_in_plan_next_stop (TC-M23-89-03)", async () => {
    const cheap = place("Cheap Eats", 38.692, -9.215);
    cheap.price_level = "$";
    const fancy = place("Fancy Spot", 38.6921, -9.2151);
    fancy.price_level = "$$$";
    const result = await planNextStop(
      baseInput({
        next_stop: { name: "lunch", kind: "meal", meal_slot: "lunch" },
        candidates: { places: CANDIDATES.places, restaurants: [] },
        budget: "budget",
        _testSearchRestaurants: async () => [fancy, cheap],
        _testResolveDuration: fakeDirections,
      }),
    );
    expect(result.next_stop.name).toBe("Cheap Eats");
  });

  it("should_snap_fill_lunch_when_early_without_move_later (TC-M23-92-05)", async () => {
    let patched: unknown = null;
    const result = await planNextStop(
      baseInput({
        current_stop: {
          name: "Torre de Belém",
          kind: "attraction",
          lat: 38.6916,
          lng: -9.216,
          end_time: "10:00",
        },
        next_stop: { name: "lunch", kind: "meal", meal_slot: "lunch" },
        arrival_clock: "10:00",
        day_stops: [
          { name: "Hotel", kind: "stay" },
          { name: "Torre de Belém", kind: "attraction" },
          { name: "lunch", kind: "meal", meal_slot: "lunch" },
          { name: "Castelo de São Jorge", kind: "attraction" },
        ],
        _testPatchDayStops: async (next) => {
          patched = next;
        },
        _testSearchRestaurants: async () => [place("Early Snap Cafe", 38.692, -9.215)],
        _testResolveDuration: fakeDirections,
      }),
    );
    expect(result.skeleton_patched).not.toBe(true);
    expect(result.meal_move).toBeUndefined();
    expect(patched).toBeNull();
    expect(result.next_stop.name).toBe("Early Snap Cafe");
    expect(result.meal_skipped).not.toBe(true);
  });

  it("should_search_lunch_near_day_attraction_not_hotel_when_current_is_stay (TC-M23-92-03)", async () => {
    const cascais = place("卡斯凯什", 38.697, -9.4217);
    cascais.sources = [
      {
        provider: "GOOGLE_MAPS",
        native_id: "cascais-1",
        deeplinks: { google_web: "https://maps.google.com/?q=cascais" },
      },
    ];
    const nears: Array<{ lat: number; lng: number }> = [];
    const hotelLat = 38.7223;
    const hotelLng = -9.1393;
    const result = await planNextStop(
      baseInput({
        current_stop: {
          name: "Hills Hotel Lisboa",
          kind: "stay",
          lat: hotelLat,
          lng: hotelLng,
          end_time: "12:00",
        },
        next_stop: { name: "lunch", kind: "meal", meal_slot: "lunch" },
        arrival_clock: "12:00",
        lookahead_stop: {
          name: "卡斯凯什",
          kind: "attraction",
          native_id: "cascais-1",
          provider: "GOOGLE_MAPS",
        },
        day_stops: [
          { name: "Hills Hotel Lisboa", kind: "stay" },
          { name: "卡斯凯什", kind: "attraction" },
          { name: "lunch", kind: "meal", meal_slot: "lunch" },
          { name: "dinner", kind: "meal", meal_slot: "dinner" },
        ],
        candidates: { places: [cascais], restaurants: [] },
        _testSearchRestaurants: async (near) => {
          nears.push({ lat: near.lat, lng: near.lng });
          return [place("Cascais Mar", near.lat, near.lng)];
        },
        _testResolveDuration: fakeDirections,
      }),
    );
    expect(result.next_stop.name).toBe("Cascais Mar");
    expect(nears.length).toBeGreaterThan(0);
    const first = nears[0]!;
    expect(Math.abs(first.lat - 38.697)).toBeLessThan(0.02);
    expect(Math.abs(first.lng - -9.4217)).toBeLessThan(0.02);
    // Distinct from Lisbon hotel (~38.72, -9.14)
    expect(Math.abs(first.lng - hotelLng)).toBeGreaterThan(0.2);
  });

  it("should_pick_local_near_poi_over_texas_ranch (TC-M23-92-04)", async () => {
    const texas = place("The Ranch at Las Colinas", 32.87, -96.95);
    const local = place("Cascais Bistro", 38.697, -9.4217);
    const cascais = place("卡斯凯什", 38.697, -9.4217);
    const result = await planNextStop(
      baseInput({
        current_stop: {
          name: "Hills Hotel Lisboa",
          kind: "stay",
          lat: 38.7223,
          lng: -9.1393,
          end_time: "12:00",
        },
        next_stop: { name: "lunch", kind: "meal", meal_slot: "lunch" },
        arrival_clock: "12:00",
        day_stops: [
          { name: "Hills Hotel Lisboa", kind: "stay" },
          { name: "卡斯凯什", kind: "attraction" },
          { name: "lunch", kind: "meal", meal_slot: "lunch" },
        ],
        candidates: { places: [cascais], restaurants: [] },
        _testSearchRestaurants: async () => [texas, local],
        _testResolveDuration: fakeDirections,
      }),
    );
    expect(result.next_stop.name).toBe("Cascais Bistro");
    expect(result.next_stop.name).not.toMatch(/Ranch/i);
  });

  it("should_compute_legs_from_stay_coords_to_first_attraction (TC-M23-92-01)", async () => {
    const result = await planNextStop(
      baseInput({
        current_stop: {
          name: "Hills Hotel Lisboa",
          kind: "stay",
          lat: 38.7223,
          lng: -9.1393,
          end_time: "09:00",
        },
        next_stop: {
          name: "Torre de Belém",
          kind: "attraction",
          lat: 38.6916,
          lng: -9.216,
        },
        _testResolveDuration: async () => ({ duration_min: 25 }),
      }),
    );
    expect(result.legs.length).toBeGreaterThan(0);
    expect(result.legs.every((l) => l.duration_min === 25)).toBe(true);
    expect(result.next_stop.location).not.toBeNull();
  });

  it("should_move_meal_later_when_arrival_before_window (TC-M23-89-05)", async () => {
    let patched: unknown = null;
    const result = await planNextStop(
      baseInput({
        current_stop: {
          name: "Torre de Belém",
          kind: "attraction",
          lat: 38.6916,
          lng: -9.216,
          end_time: "10:00",
        },
        next_stop: { name: "lunch", kind: "meal", meal_slot: "lunch" },
        arrival_clock: "10:00",
        day_stops: [
          { name: "Hotel", kind: "stay" },
          { name: "Torre de Belém", kind: "attraction" },
          { name: "lunch", kind: "meal", meal_slot: "lunch" },
          { name: "Castelo de São Jorge", kind: "attraction" },
        ],
        _testPatchDayStops: async (next) => {
          patched = next;
        },
        _testSearchRestaurants: async () => [place("Too Early", 38.692, -9.215)],
      }),
    );
    // Superseded by F92 / TC-M23-92-05: early clock fills at window, does not move.
    expect(result.skeleton_patched).not.toBe(true);
    expect(patched).toBeNull();
  });

  it("should_keep_lunch_slot_when_corridor_empty_for_lunch (S8 / was TC-M23-91-06)", async () => {
    const result = await planNextStop(
      baseInput({
        next_stop: { name: "lunch", kind: "meal", meal_slot: "lunch" },
        candidates: { places: CANDIDATES.places, restaurants: [] },
        arrival_clock: "12:00",
        used_restaurant_names: ["邻站食堂"],
        _testSearchRestaurants: async () => [],
        _testResolveDuration: fakeDirections,
      }),
    );
    expect(result.meal_skipped).not.toBe(true);
    expect(result.next_stop.name).toBe("lunch");
    expect(result.next_stop.name).not.toBe("邻站食堂");
  });

  it("should_insert_dinner_when_relaxed_clock_in_window (TC-M23-89-04)", async () => {
    let patched: unknown = null;
    const result = await planNextStopFill({
      current_stop: {
        name: "Torre de Belém",
        kind: "attraction",
        lat: 38.6916,
        lng: -9.216,
        end_time: "18:00",
      },
      next_stop: { name: "Castelo de São Jorge", kind: "attraction", lat: 38.7139, lng: -9.1335 },
      candidates: CANDIDATES,
      locale: "EN",
      pace: "relaxed",
      arrival_clock: "18:00",
      day_stops: [
        { name: "Hotel", kind: "stay" },
        { name: "Torre de Belém", kind: "attraction" },
        { name: "lunch", kind: "meal", meal_slot: "lunch" },
        { name: "Castelo de São Jorge", kind: "attraction" },
      ],
      _testPatchDayStops: async (next) => {
        patched = next;
      },
      _testResolveDuration: fakeDirections,
    });
    expect(result.skeleton_patched).toBe(true);
    expect(result.inserted_meal_slot).toBe("dinner");
    expect(patched).not.toBeNull();
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
    expect(result.slot.end).toBe("10:40"); // +45min isolated dwell (F91)
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

  it("should_snap_dinner_start_to_window_when_feasible_is_earlier (TC-M13-54-02)", () => {
    const result = displayCurrentStop({
      stop: { name: "Pastéis de Belém", kind: "meal", meal_slot: "dinner" },
      candidates: CANDIDATES,
      previous_stop: { name: "X", end_time: "12:00", kind: "attraction" },
      legs_to_here: [],
      locale: "EN",
      pace: "medium",
    });
    expect(result.slot.start).toBe("17:30");
    expect(result.slot.end).toBe("19:00");
  });

  it("should_keep_late_lunch_at_arrival_without_skip (TC-M23-91-03)", () => {
    const result = displayCurrentStop({
      stop: { name: "Pastéis de Belém", kind: "meal", meal_slot: "lunch" },
      candidates: CANDIDATES,
      previous_stop: { name: "X", end_time: "15:30", kind: "attraction" },
      legs_to_here: [],
      locale: "EN",
    });
    expect(result.slot.start).toBe("15:30");
    expect(result.notes).toContain("lunch_window_outside");
    expect(result.notes).not.toContain("meal_promoted_to_dinner");
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

  it("should_clamp_duration_over_120_for_clock (TC-M14-60-02 / TC-M23-88)", () => {
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
    // LEG_MAX_DURATION_MIN = 120 → 09:00 + 120 = 11:00
    expect(result.slot.start).toBe("11:00");
  });
});

describe("planNextStop F91 pointer (TC-M23-91)", () => {
  it("should_resolve_by_native_id_without_geocode (TC-M23-91-01)", async () => {
    const torre = place("Torre de Belém", 38.6916, -9.216);
    torre.sources = [{ provider: "GOOGLE_MAPS", native_id: "ChIJ_torre", deeplinks: {} }];
    const geoQueries: string[] = [];
    const result = await planNextStop(
      baseInput({
        current_stop: {
          name: "Hotel",
          kind: "stay",
          lat: 38.7,
          lng: -9.14,
        },
        next_stop: {
          name: "Wrong Name That Would Geocode",
          kind: "attraction",
          native_id: "ChIJ_torre",
          provider: "GOOGLE_MAPS",
        },
        candidates: { places: [torre], restaurants: [] },
        _testGeocode: async (q) => {
          geoQueries.push(q);
          return { lat: 1, lng: 1 };
        },
        _testResolveDuration: fakeDirections,
      }),
    );
    expect(geoQueries).toEqual([]);
    expect(result.next_stop.location).toEqual({ lat: 38.6916, lng: -9.216, crs: "WGS84" });
    expect(result.legs.length).toBeGreaterThan(0);
  });

  it("should_drop_far_geocode_and_not_emit_over_120_fallback (TC-M23-91-02)", async () => {
    const result = await planNextStop(
      baseInput({
        current_stop: { name: "A", kind: "attraction", lat: 38.7, lng: -9.14 },
        next_stop: { name: "Far Away Spot", kind: "attraction" },
        candidates: { places: [], restaurants: [] },
        city: "Lisbon",
        anchor: { lat: 38.7, lng: -9.14, crs: "WGS84" },
        _testGeocode: async () => ({ lat: 40.0, lng: -100.0 }),
        _testResolveDuration: async () => ({ duration_min: 500 }),
      }),
    );
    expect(result.next_stop.location).toBeNull();
    expect(result.legs).toEqual([]);
    expect(result.transit_outcome).toBe("partial");
    expect(result.legs.every((l) => l.duration_min <= 120)).toBe(true);
  });

  it("should_fill_dinner_when_early_but_already_last_stop (no move hang)", async () => {
    const result = await planNextStop(
      baseInput({
        current_stop: {
          name: "Torre de Belém",
          kind: "attraction",
          lat: 38.6916,
          lng: -9.216,
          end_time: "14:30",
        },
        next_stop: { name: "dinner", kind: "meal", meal_slot: "dinner" },
        arrival_clock: "14:30",
        day_stops: [
          { name: "Hotel", kind: "stay" },
          { name: "Torre de Belém", kind: "attraction" },
          { name: "lunch", kind: "meal", meal_slot: "lunch" },
          { name: "Castelo de São Jorge", kind: "attraction" },
          { name: "dinner", kind: "meal", meal_slot: "dinner" },
        ],
        _testSearchRestaurants: async () => [place("Evening Table", 38.7139, -9.1335)],
        _testResolveDuration: fakeDirections,
      }),
    );
    expect(result.skeleton_patched).not.toBe(true);
    expect(result.meal_skipped).not.toBe(true);
    expect(result.next_stop.name).toBe("Evening Table");
  });

  it("should_reject_far_country_restaurant_hits_in_corridor_search", async () => {
    const texas = place("The Ranch at Las Colinas", 32.87, -96.95);
    const local = place("Lisbon Bistro", 38.692, -9.215);
    const result = await planNextStop(
      baseInput({
        next_stop: { name: "lunch", kind: "meal", meal_slot: "lunch" },
        candidates: { places: CANDIDATES.places, restaurants: [] },
        arrival_clock: "12:00",
        _testSearchRestaurants: async () => [texas, local],
        _testResolveDuration: fakeDirections,
      }),
    );
    expect(result.next_stop.name).toBe("Lisbon Bistro");
    expect(result.next_stop.name).not.toMatch(/Ranch/i);
  });

  it("should_reject_lisbon_cafe_43km_from_cabo_lunch (S6B)", async () => {
    const cabo = place("罗卡角", 38.7804, -9.4989);
    cabo.sources = [
      { provider: "GOOGLE_MAPS", native_id: "cabo-1", deeplinks: {} },
    ];
    const lisbonCafe = place("Sense of Coffee & Wine", 38.71, -9.14);
    const localCafe = place("Cabo Snack", 38.782, -9.497);
    const nears: Array<{ lat: number; lng: number }> = [];
    const result = await planNextStop(
      baseInput({
        current_stop: {
          name: "Hills Hotel Lisboa",
          kind: "stay",
          lat: 38.7223,
          lng: -9.1393,
          end_time: "12:00",
        },
        next_stop: { name: "lunch", kind: "meal", meal_slot: "lunch" },
        arrival_clock: "12:00",
        day_stops: [
          { name: "Hills Hotel Lisboa", kind: "stay" },
          { name: "罗卡角", kind: "attraction" },
          { name: "lunch", kind: "meal", meal_slot: "lunch" },
        ],
        candidates: { places: [cabo], restaurants: [] },
        _testSearchRestaurants: async (near) => {
          nears.push({ lat: near.lat, lng: near.lng });
          return [lisbonCafe, localCafe];
        },
        _testResolveDuration: fakeDirections,
      }),
    );
    expect(result.next_stop.name).toBe("Cabo Snack");
    expect(result.next_stop.name).not.toMatch(/Sense/i);
    expect(nears.length).toBeGreaterThan(0);
    expect(Math.abs(nears[0]!.lat - 38.7804)).toBeLessThan(0.02);
    expect(Math.abs(nears[0]!.lng - -9.4989)).toBeLessThan(0.05);
  });

  it("should_keep_lunch_slot_when_only_far_hits_beyond_5km (S8)", async () => {
    const cabo = place("罗卡角", 38.7804, -9.4989);
    const lisbonCafe = place("Sense of Coffee & Wine", 38.71, -9.14);
    const result = await planNextStop(
      baseInput({
        current_stop: {
          name: "罗卡角",
          kind: "attraction",
          lat: 38.7804,
          lng: -9.4989,
          end_time: "12:00",
        },
        next_stop: { name: "lunch", kind: "meal", meal_slot: "lunch" },
        arrival_clock: "12:00",
        day_stops: [
          { name: "Hotel", kind: "stay" },
          { name: "罗卡角", kind: "attraction" },
          { name: "lunch", kind: "meal", meal_slot: "lunch" },
        ],
        candidates: { places: [cabo], restaurants: [] },
        used_restaurant_names: ["Yesterday Cabo Spot"],
        _testSearchRestaurants: async () => [lisbonCafe],
        _testResolveDuration: fakeDirections,
      }),
    );
    expect(result.meal_skipped).not.toBe(true);
    expect(result.next_stop.name).toBe("lunch");
    expect(result.next_stop.name).not.toBe("Yesterday Cabo Spot");
    expect(result.next_stop.name).not.toMatch(/Sense/i);
  });

  it("should_allow_dinner_near_hotel_within_5km (S8)", async () => {
    const cabo = place("罗卡角", 38.7804, -9.4989);
    const hotelCafe = place("Hotel Bistro", 38.723, -9.14);
    const result = await planNextStop(
      baseInput({
        current_stop: {
          name: "Hills Hotel Lisboa",
          kind: "stay",
          lat: 38.7223,
          lng: -9.1393,
          end_time: "18:00",
        },
        next_stop: { name: "dinner", kind: "meal", meal_slot: "dinner" },
        arrival_clock: "18:00",
        day_stops: [
          { name: "Hills Hotel Lisboa", kind: "stay" },
          { name: "罗卡角", kind: "attraction", visit_part: "am" },
          { name: "lunch", kind: "meal", meal_slot: "lunch" },
          { name: "罗卡角", kind: "attraction", visit_part: "pm" },
          { name: "dinner", kind: "meal", meal_slot: "dinner" },
        ],
        candidates: { places: [cabo], restaurants: [] },
        _testSearchRestaurants: async (near) => {
          // Hotel-centered search for dinner when stay is current.
          if (Math.abs(near.lat - 38.7223) < 0.01) return [hotelCafe];
          return [];
        },
        _testResolveDuration: fakeDirections,
      }),
    );
    expect(result.next_stop.name).toBe("Hotel Bistro");
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
