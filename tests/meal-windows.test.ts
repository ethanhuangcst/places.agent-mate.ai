import { describe, expect, it } from "vitest";
import {
  areaHintFromText,
  timedAttractionQueries,
  distributeAcrossDays,
  filterMealOptionsForHours,
  hoursOverlapStatus,
  mealWindowsFromVisits,
} from "../src/core/itinerary-timed";
import { uniquePlaces } from "../src/core/place-filters";
import { type PlaceCard } from "../src/core/types";

describe("areaHintFromText", () => {
  it("should_prefer_known_city_over_at_hotel_phrase", () => {
    expect(
      areaHintFromText("2-day Lisboa trip, start and end at Boavista 83 Hostel"),
    ).toMatch(/Lisboa/i);
  });

  it("should_include_generic_museum_queries_for_lisboa (no city-specific hardcoding)", () => {
    const qs = timedAttractionQueries("Lisboa");
    expect(qs.some((q) => /museum/i.test(q))).toBe(true);
    // City-specific queries (Castelo, Belem) removed in MVP-4a; generic templates only
    expect(qs.some((q) => q.includes("Lisboa"))).toBe(true);
  });

  it("should_emit_chinese_attraction_queries_when_locale_CN", () => {
    const qs = timedAttractionQueries("上海", "CN");
    expect(qs.length).toBeGreaterThan(0);
    expect(qs.every((q) => !/\bmuseums?\b/i.test(q))).toBe(true);
    expect(qs.some((q) => q.includes("博物馆"))).toBe(true);
  });

  it("should_emit_traditional_attraction_queries_when_locale_HK", () => {
    const qs = timedAttractionQueries("香港", "HK");
    expect(qs.some((q) => q.includes("博物館") || q.includes("美術館"))).toBe(true);
    expect(qs.every((q) => !/\bmuseums?\b/i.test(q))).toBe(true);
  });

  it("should_use_EN_queries_when_locale_EN_regardless_of_cjk_origin (MVP-4a: locale wins)", () => {
    const qs = timedAttractionQueries("Shanghai", "EN", {
      originName: "上海国际饭店",
    });
    // MVP-4a: locale explicitly set → use that locale's keywords, not CJK detection
    expect(qs.some((q) => /museum/i.test(q))).toBe(true);
    expect(qs.every((q) => !q.includes("博物馆") && !q.includes("博物館"))).toBe(true);
  });

  it("should_keep_english_queries_when_locale_EN_and_no_cjk", () => {
    const qs = timedAttractionQueries("Lisboa", "EN", {
      originName: "Boavista 83 Hostel Lisbon",
    });
    expect(qs.some((q) => /museum/i.test(q))).toBe(true);
    expect(qs.every((q) => !q.includes("博物馆") && !q.includes("博物館"))).toBe(true);
  });
});

describe("mealWindowsFromVisits", () => {
  it("should_derive_lunch_from_gap_between_first_and_second_visit", () => {
    const windows = mealWindowsFromVisits([
      { slot: { start: "10:00", end: "12:00" } },
      { slot: { start: "14:00", end: "16:00" } },
    ]);
    expect(windows.lunch).toEqual({ start: "12:00", end: "14:00" });
    expect(windows.cafe).toEqual({ start: "16:00", end: "18:00" });
    expect(windows.dinner).toEqual({ start: "18:00", end: "20:00" });
  });

  it("should_use_fixed_lunch_duration_when_only_one_visit", () => {
    const windows = mealWindowsFromVisits([{ slot: { start: "10:00", end: "12:00" } }]);
    expect(windows.lunch).toEqual({ start: "12:00", end: "13:30" });
    expect(windows.cafe).toEqual({ start: "13:30", end: "18:00" });
    expect(windows.dinner).toEqual({ start: "18:00", end: "20:00" });
  });
});

describe("hoursOverlapStatus", () => {
  it("should_mark_unknown_when_hours_missing", () => {
    expect(hoursOverlapStatus(undefined, { start: "12:00", end: "14:00" })).toBe("unknown");
  });

  it("should_exclude_closed_when_range_misses_slot", () => {
    expect(hoursOverlapStatus("18:00-22:00", { start: "12:00", end: "14:00" })).toBe("closed");
    expect(hoursOverlapStatus("10:00-15:00", { start: "12:00", end: "14:00" })).toBe("open");
  });
});

describe("filterMealOptionsForHours", () => {
  it("should_keep_unknown_and_drop_closed", () => {
    const places: PlaceCard[] = [
      {
        provider: "AMAP",
        name: "Open Cafe",
        hours: "10:00-22:00",
        location: { lat: 1, lng: 1, crs: "GCJ-02" },
        sources: [{ provider: "AMAP", native_id: "1", deeplinks: {} }],
      },
      {
        provider: "AMAP",
        name: "Dinner Only",
        hours: "18:00-22:00",
        location: { lat: 1, lng: 1, crs: "GCJ-02" },
        sources: [{ provider: "AMAP", native_id: "2", deeplinks: {} }],
      },
      {
        provider: "AMAP",
        name: "Unknown Hours",
        location: { lat: 1, lng: 1, crs: "GCJ-02" },
        sources: [{ provider: "AMAP", native_id: "3", deeplinks: {} }],
      },
    ];
    const out = filterMealOptionsForHours(places, { start: "12:00", end: "14:00" });
    expect(out.map((o) => o.place.name)).toEqual(["Open Cafe", "Unknown Hours"]);
    expect(out.find((o) => o.place.name === "Unknown Hours")?.hours_unknown).toBe(true);
  });
});

describe("distributeAcrossDays bias", () => {
  it("should_put_places_nearer_destination_on_later_days", () => {
    const origin = { lat: 31.22, lng: 121.4, crs: "WGS84" as const };
    const destination = { lat: 31.1, lng: 121.5, crs: "WGS84" as const };
    const nearOrigin: PlaceCard = {
      provider: "AMAP",
      name: "Near Origin",
      location: { lat: 31.21, lng: 121.41, crs: "WGS84" },
      sources: [{ provider: "AMAP", native_id: "a", deeplinks: {} }],
    };
    const nearDest: PlaceCard = {
      provider: "AMAP",
      name: "Near Dest",
      location: { lat: 31.11, lng: 121.49, crs: "WGS84" },
      sources: [{ provider: "AMAP", native_id: "b", deeplinks: {} }],
    };
    const mid: PlaceCard = {
      provider: "AMAP",
      name: "Mid",
      location: { lat: 31.16, lng: 121.45, crs: "WGS84" },
      sources: [{ provider: "AMAP", native_id: "c", deeplinks: {} }],
    };
    const buckets = distributeAcrossDays([nearDest, mid, nearOrigin], 3, 1, {
      origin,
      destination,
    });
    expect(buckets[0]![0]!.name).toBe("Near Origin");
    expect(buckets[2]![0]!.name).toBe("Near Dest");
  });

  it("should_interpolate_corridor_pin_along_origin_destination", async () => {
    const { interpolateCorridorPin } = await import("../src/core/itinerary-timed");
    const origin = { lat: 31.22, lng: 121.4, crs: "WGS84" as const };
    const destination = { lat: 31.1, lng: 121.52, crs: "WGS84" as const };
    const day0 = interpolateCorridorPin(origin, destination, 0, 3);
    const day2 = interpolateCorridorPin(origin, destination, 2, 3);
    expect(day0.lat).toBeCloseTo(origin.lat, 5);
    expect(day0.lng).toBeCloseTo(origin.lng, 5);
    expect(day2.lat).toBeCloseTo(destination.lat, 5);
    expect(day2.lng).toBeCloseTo(destination.lng, 5);
  });

  it("should_keep_visit_identities_disjoint_across_days", () => {
    const mk = (name: string, id: string, lat: number): PlaceCard => ({
      provider: "GOOGLE_MAPS",
      name,
      category: "museum",
      location: { lat, lng: -9.14, crs: "WGS84" },
      sources: [{ provider: "GOOGLE_MAPS", native_id: id, deeplinks: {} }],
    });
    const places = uniquePlaces([
      mk("Carmo", "a", 38.71),
      mk("Carmo!", "b", 38.72),
      mk("Castelo", "c", 38.73),
      mk("Pantheon", "d", 38.74),
    ]);
    expect(places.map((p) => p.name)).toEqual(["Carmo", "Castelo", "Pantheon"]);
    const buckets = distributeAcrossDays(places, 3, 1);
    const names = buckets.flatMap((b) => b.map((p) => p.name));
    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual(["Carmo", "Castelo", "Pantheon"]);
  });
});

describe("insertMealBlocks directions", () => {
  it("should_use_resolveDuration_for_meal_legs_when_provided", async () => {
    const { insertMealBlocks } = await import("../src/core/itinerary-timed");
    const day = {
      day_index: 1,
      date: "2026-08-25",
      stops: [] as { place: PlaceCard; order: number }[],
      blocks: [
        {
          kind: "visit" as const,
          slot: { start: "10:00", end: "12:00" },
          place: {
            provider: "GOOGLE_MAPS" as const,
            name: "Museum",
            location: { lat: 38.72, lng: -9.14, crs: "WGS84" as const },
            sources: [{ provider: "GOOGLE_MAPS" as const, native_id: "m", deeplinks: {} }],
          },
          legs_to_here: [],
        },
        {
          kind: "visit" as const,
          slot: { start: "14:00", end: "16:00" },
          place: {
            provider: "GOOGLE_MAPS" as const,
            name: "Castle",
            location: { lat: 38.73, lng: -9.13, crs: "WGS84" as const },
            sources: [{ provider: "GOOGLE_MAPS" as const, native_id: "c", deeplinks: {} }],
          },
          legs_to_here: [],
        },
      ],
    };
    const restaurant: PlaceCard = {
      provider: "GOOGLE_MAPS",
      name: "Tasca",
      location: { lat: 38.725, lng: -9.135, crs: "WGS84" },
      sources: [{ provider: "GOOGLE_MAPS", native_id: "r", deeplinks: {} }],
    };
    const out = await insertMealBlocks(
      day,
      { lunch: [restaurant], dinner: [restaurant] },
      undefined,
      { pace: "relaxed" },
      { lat: 38.72, lng: -9.14, crs: "WGS84" },
      async () => ({ duration_min: 7, distance_m: 500 }),
    );
    const lunch = out.blocks.find((b) => b.kind === "meal" && b.meal === "lunch");
    expect(lunch?.kind).toBe("meal");
    if (lunch?.kind === "meal") {
      expect(lunch.slot).toEqual({ start: "12:00", end: "14:00" });
      expect(lunch.options[0]?.leg_from_previous.source).toBe("directions");
      expect(lunch.options[0]?.leg_from_previous.base_duration_min).toBe(7);
    }
    const dinner = out.blocks.find((b) => b.kind === "meal" && b.meal === "dinner");
    expect(dinner).toBeUndefined();
  });

  it("should_omit_dinner_when_only_one_unique_restaurant", async () => {
    const { insertMealBlocks } = await import("../src/core/itinerary-timed");
    const only: PlaceCard = {
      provider: "GOOGLE_MAPS",
      name: "Solo Tasca",
      category: "restaurant",
      location: { lat: 38.725, lng: -9.135, crs: "WGS84" },
      sources: [{ provider: "GOOGLE_MAPS", native_id: "solo", deeplinks: {} }],
    };
    const out = await insertMealBlocks(
      {
        day_index: 1,
        date: "2026-08-25",
        stops: [],
        blocks: [
          {
            kind: "visit",
            slot: { start: "10:00", end: "12:00" },
            place: {
              provider: "GOOGLE_MAPS",
              name: "Museum",
              location: { lat: 38.72, lng: -9.14, crs: "WGS84" },
              sources: [{ provider: "GOOGLE_MAPS", native_id: "m", deeplinks: {} }],
            },
            legs_to_here: [],
          },
          {
            kind: "visit",
            slot: { start: "14:00", end: "16:00" },
            place: {
              provider: "GOOGLE_MAPS",
              name: "Castle",
              location: { lat: 38.73, lng: -9.13, crs: "WGS84" },
              sources: [{ provider: "GOOGLE_MAPS", native_id: "c", deeplinks: {} }],
            },
            legs_to_here: [],
          },
        ],
      },
      { lunch: [only], dinner: [only] },
      undefined,
      { pace: "relaxed" },
      { lat: 38.72, lng: -9.14, crs: "WGS84" },
    );
    expect(out.blocks.filter((b) => b.kind === "meal" && b.meal === "lunch")).toHaveLength(1);
    expect(out.blocks.filter((b) => b.kind === "meal" && b.meal === "dinner")).toHaveLength(0);
  });

  it("should_exclude_all_lunch_options_from_dinner", async () => {
    const { insertMealBlocks } = await import("../src/core/itinerary-timed");
    const mk = (name: string, id: string): PlaceCard => ({
      provider: "GOOGLE_MAPS",
      name,
      category: "restaurant",
      location: { lat: 38.725, lng: -9.135, crs: "WGS84" },
      sources: [{ provider: "GOOGLE_MAPS", native_id: id, deeplinks: {} }],
    });
    const a = mk("Alpha", "a");
    const b = mk("Beta", "b");
    const c = mk("Gamma", "c");
    const out = await insertMealBlocks(
      {
        day_index: 1,
        date: "2026-08-25",
        stops: [],
        blocks: [
          {
            kind: "visit",
            slot: { start: "10:00", end: "12:00" },
            place: {
              provider: "GOOGLE_MAPS",
              name: "Museum",
              location: { lat: 38.72, lng: -9.14, crs: "WGS84" },
              sources: [{ provider: "GOOGLE_MAPS", native_id: "m", deeplinks: {} }],
            },
            legs_to_here: [],
          },
          {
            kind: "visit",
            slot: { start: "14:00", end: "16:00" },
            place: {
              provider: "GOOGLE_MAPS",
              name: "Castle",
              location: { lat: 38.73, lng: -9.13, crs: "WGS84" },
              sources: [{ provider: "GOOGLE_MAPS", native_id: "c2", deeplinks: {} }],
            },
            legs_to_here: [],
          },
        ],
      },
      { lunch: [a, b], dinner: [a, b, c] },
      undefined,
      { pace: "relaxed" },
      { lat: 38.72, lng: -9.14, crs: "WGS84" },
    );
    const lunch = out.blocks.find((x) => x.kind === "meal" && x.meal === "lunch");
    const dinner = out.blocks.find((x) => x.kind === "meal" && x.meal === "dinner");
    const lunchNames =
      lunch?.kind === "meal" ? lunch.options.map((o) => o.place.name) : [];
    const dinnerNames =
      dinner?.kind === "meal" ? dinner.options.map((o) => o.place.name) : [];
    expect(lunchNames).toEqual(["Alpha", "Beta"]);
    expect(dinnerNames).toEqual(["Gamma"]);
    expect(lunchNames.some((n) => dinnerNames.includes(n))).toBe(false);
  });

  it("should_drop_meal_options_when_leg_exceeds_300_min", async () => {
    const { insertMealBlocks } = await import("../src/core/itinerary-timed");
    const restaurant: PlaceCard = {
      provider: "GOOGLE_MAPS",
      name: "Far Away Grill",
      category: "restaurant",
      location: { lat: 38.725, lng: -9.135, crs: "WGS84" },
      sources: [{ provider: "GOOGLE_MAPS", native_id: "far", deeplinks: {} }],
    };
    const out = await insertMealBlocks(
      {
        day_index: 1,
        date: "2026-08-25",
        stops: [],
        blocks: [
          {
            kind: "visit",
            slot: { start: "10:00", end: "12:00" },
            place: {
              provider: "GOOGLE_MAPS",
              name: "Museum",
              location: { lat: 38.72, lng: -9.14, crs: "WGS84" },
              sources: [{ provider: "GOOGLE_MAPS", native_id: "m", deeplinks: {} }],
            },
            legs_to_here: [],
          },
        ],
      },
      { lunch: [restaurant], dinner: [restaurant] },
      undefined,
      { pace: "relaxed" },
      { lat: 38.72, lng: -9.14, crs: "WGS84" },
      async () => ({ duration_min: 140894, distance_m: 1 }),
    );
    expect(out.blocks.filter((b) => b.kind === "meal")).toEqual([]);
  });
});
