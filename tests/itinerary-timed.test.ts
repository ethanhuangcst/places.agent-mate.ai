import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FIXTURE_POIS } from "../src/adapters/fixtures";
import { planItinerary } from "../src/core/itinerary";
import { insertMealBlocks, mealSlots, hoursOverlapStatus, type TimedItineraryDay } from "../src/core/itinerary-timed";
import { type PlaceCard } from "../src/core/types";
import { type WeatherAdapter } from "../src/adapters/open-meteo/types";

// These tests exercise the legacy code path (no LLM available in fixture mode)
const origMode = process.env.ITINERARY_MODE;
beforeAll(() => { process.env.ITINERARY_MODE = "legacy"; });
afterAll(() => { if (origMode !== undefined) process.env.ITINERARY_MODE = origMode; else delete process.env.ITINERARY_MODE; });

const lisbonPlaces = FIXTURE_POIS.slice(0, 6).map((p, i) => ({
  ...p,
  name: i % 2 === 0 ? `Museum ${i}` : `Miradouro ${i}`,
  category: i % 2 === 0 ? "museum" : "viewpoint",
  location: {
    lat: 38.72 + i * 0.01,
    lng: -9.14 + i * 0.01,
    crs: "WGS84" as const,
  },
}));

function weatherFor(code: number, max = 22): WeatherAdapter {
  return {
    async fetchForecast() {
      return {
        weather_code: code,
        temp_max_c: max,
        temp_min_c: 16,
        provider: "OPEN_METEO",
      };
    },
  };
}

describe("planItinerary timed", () => {
  it("should_emit_all_days_with_slots_when_detail_timed", async () => {
    const result = await planItinerary(
      {
        detail: "timed",
        origin: { name: "Hyatt Regency Lisbon", lat: 38.724, lng: -9.15 },
        bounds: { start: "2026-08-25", end: "2026-08-30" },
        places: lisbonPlaces,
        preferences: { pace: "relaxed", spend: "premium" },
        locale: "EN",
      },
      { weatherAdapter: weatherFor(0) },
    );
    expect(result.outcomeKey).toBeUndefined();
    expect(result.data?.detail).toBe("timed");
    const timed = result.data as {
      days: { date: string; blocks: { kind: string; slot?: { start: string } }[]; planning_impact?: { severity: string } }[];
      origin: { name: string };
      timezone: string;
    };
    expect(timed.origin.name).toMatch(/Hyatt/i);
    expect(timed.timezone).toBe("Europe/Lisbon");
    expect(timed.days).toHaveLength(5);
    expect(timed.days.map((d) => (d as { day_index?: number }).day_index)).toEqual([
      1, 2, 3, 4, 5,
    ]);
    expect(timed.days.every((d) => d.date.startsWith("2026-08"))).toBe(true);
    const withVisits = timed.days.filter((d) => d.blocks.some((b) => b.kind === "visit"));
    expect(withVisits.length).toBeGreaterThan(0);
    expect(withVisits[0]?.blocks[0]?.slot?.start).toBeTruthy();
  });

  it("should_add_walk_buffer_when_rain", async () => {
    const result = await planItinerary(
      {
        detail: "timed",
        origin: { lat: 38.724, lng: -9.15, name: "Lisbon" },
        bounds: { start: "2026-08-25", end: "2026-08-26" },
        places: lisbonPlaces.slice(0, 2),
        preferences: { pace: "relaxed" },
        locale: "EN",
      },
      { weatherAdapter: weatherFor(61) },
    );
    const day = (result.data as { days: { planning_impact: { severity: string }; blocks: { legs_to_here: { mode: string; weather_buffer_min: number }[] }[] }[] }).days[0]!;
    expect(day.planning_impact.severity).toBe("adverse");
    const walk = day.blocks[0]?.legs_to_here.find((l) => l.mode === "walk");
    expect(walk?.weather_buffer_min).toBeGreaterThan(0);
  });

  it("should_auto_search_when_places_empty", async () => {
    const result = await planItinerary(
      {
        detail: "timed",
        origin: { lat: 38.724, lng: -9.15, name: "Lisbon" },
        bounds: { start: "2026-08-25", end: "2026-08-27" },
        places: [],
        preferences: { pace: "relaxed" },
        locale: "EN",
      },
      {
        weatherAdapter: weatherFor(3),
        searchPlacesFn: async () => ({
          data: lisbonPlaces.slice(0, 4),
          skipped: [],
          locale: "EN",
        }),
      },
    );
    expect(result.outcomeKey).toBeUndefined();
    expect((result.data as { days: unknown[] }).days).toHaveLength(2);
  });

  it("should_pass_chinese_search_queries_when_locale_CN", async () => {
    const placeQueries: string[] = [];
    const mealQueries: string[] = [];
    await planItinerary(
      {
        detail: "timed",
        origin: { lat: 31.23, lng: 121.47, name: "上海国际饭店" },
        bounds: { start: "2026-08-25", end: "2026-08-26" },
        places: [],
        preferences: { pace: "relaxed" },
        locale: "CN",
        providers: ["AMAP"],
      },
      {
        weatherAdapter: weatherFor(0),
        geocodeFn: async ({ query }) => ({
          data: {
            lat: 31.23,
            lng: 121.47,
            crs: "GCJ-02",
            address: String(query ?? ""),
          },
          skipped: [],
          locale: "CN",
        }),
        searchPlacesFn: async (input) => {
          if (input.query) placeQueries.push(input.query);
          expect(input.near).toMatchObject({
            lat: 31.23,
            lng: 121.47,
            crs: "GCJ-02",
          });
          return {
            data: [
              {
                provider: "AMAP",
                name: "上海博物馆",
                category: "科教文化服务;博物馆",
                location: { lat: 31.23, lng: 121.47, crs: "GCJ-02" },
                sources: [{ provider: "AMAP", native_id: "m1", deeplinks: {} }],
              },
            ],
            skipped: [],
            locale: "CN",
          };
        },
        searchRestaurantsFn: async (input) => {
          if (input.query) mealQueries.push(input.query);
          return { data: [], skipped: [], locale: "CN" };
        },
      },
    );
    expect(placeQueries.length).toBeGreaterThan(0);
    expect(placeQueries.every((q) => !/\bmuseums?\b/i.test(q))).toBe(true);
    expect(placeQueries.some((q) => q.includes("博物馆"))).toBe(true);
    expect(mealQueries.every((q) => !/fine dining|restaurants in|cafe tea/i.test(q))).toBe(true);
    expect(mealQueries.some((q) => q.includes("餐厅") || q.includes("咖啡"))).toBe(true);
  });

  it("should_use_amap_directions_source_on_legs_when_amap_only", async () => {
    const prevMode = process.env.PLACES_VENDOR_MODE;
    process.env.PLACES_VENDOR_MODE = "live";
    const { setAmapLiveAdapterForTests, resetAmapLiveAdapterForTests } = await import(
      "../src/adapters/amap/live"
    );
    const { amapFixtureAdapter } = await import("../src/adapters/amap/fixture");
    setAmapLiveAdapterForTests({
      ...amapFixtureAdapter,
      async directions() {
        return { duration_min: 11, distance_m: 650 };
      },
    });
    try {
      const museum = (name: string, id: string, lat: number): PlaceCard => ({
        provider: "AMAP",
        name,
        category: "museum",
        location: { lat, lng: 121.47, crs: "GCJ-02" },
        sources: [{ provider: "AMAP", native_id: id, deeplinks: {} }],
      });
      const result = await planItinerary(
        {
          detail: "timed",
          origin: { lat: 31.22, lng: 121.46, name: "上海国际饭店" },
          places: [
            museum("上海博物馆", "amap-m1", 31.23),
            museum("上海历史博物馆", "amap-m2", 31.24),
          ],
          providers: ["AMAP"],
          locale: "CN",
          bounds: { start: "2026-08-25", end: "2026-08-26" },
          preferences: { pace: "relaxed" },
        },
        {
          weatherAdapter: weatherFor(0),
          searchRestaurantsFn: async () => ({ data: [], skipped: [], locale: "CN" }),
        },
      );
      expect(result.outcomeKey).toBeUndefined();
      const timed = result.data as {
        days: { blocks: { kind: string; legs_to_here?: { source?: string }[] }[] }[];
      };
      const firstVisit = timed.days[0]?.blocks.find((b) => b.kind === "visit");
      expect(firstVisit?.legs_to_here?.some((l) => l.source === "directions")).toBe(true);
    } finally {
      resetAmapLiveAdapterForTests();
      process.env.PLACES_VENDOR_MODE = prevMode;
    }
  });

  it("should_search_near_destination_on_later_days_when_corridor_exists", async () => {
    const origin = { lat: 31.22, lng: 121.37 };
    const dest = { lat: 31.11, lng: 121.51 };
    const pins: { lat: number; lng: number }[] = [];
    const result = await planItinerary(
      {
        detail: "timed",
        origin: { ...origin, name: "Hyatt Place Shanghai Tianshan" },
        destination: { ...dest, name: "MixC Minhang" },
        bounds: { start: "2026-08-25", end: "2026-08-28" },
        places: [],
        preferences: { pace: "relaxed" },
        locale: "EN",
        providers: ["GOOGLE_MAPS"],
      },
      {
        weatherAdapter: weatherFor(0),
        searchPlacesFn: async (input) => {
          const lat = input.near?.lat ?? 0;
          const lng = input.near?.lng ?? 0;
          pins.push({ lat, lng });
          return {
            data: [
              {
                provider: "GOOGLE_MAPS",
                name: `Museum at ${lat.toFixed(3)}`,
                category: "museum",
                location: { lat, lng, crs: "WGS84" },
                sources: [
                  {
                    provider: "GOOGLE_MAPS",
                    native_id: `id-${lat.toFixed(4)}-${lng.toFixed(4)}`,
                    deeplinks: {},
                  },
                ],
              },
            ],
            skipped: [],
            locale: "EN",
          };
        },
        searchRestaurantsFn: async () => ({ data: [], skipped: [], locale: "EN" }),
      },
    );
    expect(result.outcomeKey).toBeUndefined();
    const timed = result.data as {
      days: {
        blocks: { kind: string; place?: { location: { lat: number; lng: number } } }[];
      }[];
    };
    expect(timed.days).toHaveLength(3);
    const visitLoc = (day: (typeof timed.days)[0]) =>
      day.blocks.find((b) => b.kind === "visit")?.place?.location;
    const d1 = visitLoc(timed.days[0]!);
    const d3 = visitLoc(timed.days[2]!);
    expect(d1).toBeDefined();
    expect(d3).toBeDefined();
    const dist = (
      a: { lat: number; lng: number },
      b: { lat: number; lng: number },
    ) => Math.hypot(a.lat - b.lat, a.lng - b.lng);
    expect(dist(d3!, dest)).toBeLessThan(dist(d1!, dest));
    expect(Math.max(...pins.map((p) => p.lat))).toBeGreaterThan(
      Math.min(...pins.map((p) => p.lat)),
    );
  });

  it("should_return_no_places_when_stops_mode_and_empty", async () => {
    const result = await planItinerary({
      bounds: { start: "2026-08-25", end: "2026-08-26" },
      places: [],
    });
    expect(result.outcomeKey).toBe("errors.no_places_to_plan");
  });

  it("should_omit_first_inbound_legs_when_origin_missing_but_city_in_nl", async () => {
    const result = await planItinerary(
      {
        detail: "timed",
        bounds: { start: "2026-08-25", end: "2026-08-27" },
        places: [],
        preferences: { pace: "relaxed", natural_language: "2 days in Lisboa" },
        locale: "EN",
      },
      {
        weatherAdapter: weatherFor(0),
        geocodeFn: async () => ({
          data: { lat: 38.72, lng: -9.14, crs: "WGS84", address: "Lisboa" },
          skipped: [],
          locale: "EN",
        }),
        searchPlacesFn: async () => ({
          data: lisbonPlaces.slice(0, 4),
          skipped: [],
          locale: "EN",
        }),
        searchRestaurantsFn: async () => ({ data: [], skipped: [], locale: "EN" }),
      },
    );
    expect(result.outcomeKey).toBeUndefined();
    const timed = result.data as {
      origin?: unknown;
      search_anchor?: { name: string };
      days: { blocks: { kind: string; legs_to_here?: unknown[] }[] }[];
    };
    expect(timed.origin).toBeUndefined();
    expect(timed.search_anchor?.name).toMatch(/Lisboa|Lisbon/i);
    const firstVisit = timed.days[0]?.blocks.find((b) => b.kind === "visit");
    expect(firstVisit?.legs_to_here).toEqual([]);
  });

  it("should_attach_legs_to_destination_on_last_visit_when_destination_set", async () => {
    const result = await planItinerary(
      {
        detail: "timed",
        origin: { lat: 38.724, lng: -9.15, name: "Start Hotel" },
        destination: { lat: 38.73, lng: -9.14, name: "End Hotel" },
        bounds: { start: "2026-08-25", end: "2026-08-26" },
        places: lisbonPlaces.slice(0, 2),
        preferences: { pace: "relaxed" },
        locale: "EN",
      },
      {
        weatherAdapter: weatherFor(0),
        searchRestaurantsFn: async () => ({ data: [], skipped: [], locale: "EN" }),
      },
    );
    const timed = result.data as {
      destination?: { name: string };
      days: { blocks: { kind: string; legs_to_destination?: unknown[] }[] }[];
    };
    expect(timed.destination?.name).toBe("End Hotel");
    const visits = timed.days[0]?.blocks.filter((b) => b.kind === "visit") ?? [];
    const last = visits[visits.length - 1];
    expect((last?.legs_to_destination?.length ?? 0)).toBeGreaterThan(0);
  });

  it("should_attach_lunch_and_dinner_meal_blocks", async () => {
    const grill = (
      name: string,
      id: string,
      rating: number,
    ): PlaceCard => ({
      ...lisbonPlaces[0]!,
      name,
      category: "restaurant",
      rating,
      sources: [{ provider: "GOOGLE_MAPS", native_id: id, deeplinks: {} }],
    });
    const result = await planItinerary(
      {
        detail: "timed",
        origin: { lat: 38.724, lng: -9.15, name: "Lisbon" },
        bounds: { start: "2026-08-25", end: "2026-08-26" },
        places: lisbonPlaces.slice(0, 2),
        preferences: { pace: "relaxed", spend: "premium" },
        locale: "EN",
      },
      {
        weatherAdapter: weatherFor(0),
        searchRestaurantsFn: async () => ({
          data: [
            grill("Premium Lisboa Grill", "grill-1", 4.9),
            grill("Second Table", "grill-2", 4.8),
            grill("Night Table", "grill-3", 4.7),
            grill("Harbor Kitchen", "grill-4", 4.6),
          ],
          skipped: [],
          locale: "EN",
        }),
      },
    );
    const day = (result.data as { days: { blocks: { kind: string; meal?: string; options?: unknown[] }[] }[] }).days[0]!;
    const meals = day.blocks.filter((b) => b.kind === "meal");
    expect(meals.map((m) => m.meal).sort()).toEqual(["dinner", "lunch"]);
    expect(meals.every((m) => (m.options?.length ?? 0) >= 1)).toBe(true);
  });

  it("should_use_vendor_duration_when_directions_resolver_returns_eta", async () => {
    const { buildLegs } = await import("../src/core/itinerary-timed");
    const { legs } = await buildLegs(
      { lat: 38.72, lng: -9.14, crs: "WGS84" },
      { lat: 38.73, lng: -9.13, crs: "WGS84" },
      {
        severity: "adverse",
        drivers: ["rain"],
        summary_key: "itinerary.weather.impact_adverse",
        leg_buffer_policy: { walk_extra_min_per_leg: 10, outdoor_visit_shorten_min: 30 },
      },
      { pace: "relaxed" },
      async (mode) => (mode === "walk" ? { duration_min: 22, distance_m: 1500 } : null),
    );
    const walk = legs.find((l) => l.mode === "walk");
    expect(walk?.source).toBe("directions");
    expect(walk?.base_duration_min).toBe(22);
    expect(walk?.weather_buffer_min).toBe(10);
    expect(walk?.duration_min).toBe(32);
  });

  it("should_search_city_not_destination_tower_when_origin_omitted", async () => {
    const nears: { lat: number; lng: number }[] = [];
    const result = await planItinerary(
      {
        detail: "timed",
        destination: { name: "广州塔" },
        bounds: { start: "2026-08-25", end: "2026-08-27" },
        places: [],
        preferences: { pace: "relaxed", natural_language: "广州两天" },
        locale: "CN",
        providers: ["AMAP", "GOOGLE_MAPS"],
      },
      {
        weatherAdapter: weatherFor(0),
        geocodeFn: async (input) => {
          const q = `${input.query ?? ""}`;
          if (q.includes("塔")) {
            return {
              data: { lat: 23.1, lng: 113.32, crs: "GCJ-02", address: "广州塔" },
              skipped: [],
              locale: "CN",
            };
          }
          return {
            data: { lat: 23.13, lng: 113.26, crs: "GCJ-02", address: "广州" },
            skipped: [],
            locale: "CN",
          };
        },
        searchPlacesFn: async (input) => {
          if (input.near) nears.push(input.near);
          return {
            data: [
              {
                ...lisbonPlaces[0]!,
                name: "陈家祠",
                category: "museum",
                provider: "AMAP",
                location: { lat: 23.12, lng: 113.25, crs: "GCJ-02" },
              },
            ],
            skipped: [],
            locale: "CN",
          };
        },
        searchRestaurantsFn: async () => ({ data: [], skipped: [], locale: "CN" }),
      },
    );
    expect(result.outcomeKey).toBeUndefined();
    const timed = result.data as { search_anchor?: { name: string; location: { lat: number } } };
    expect(timed.search_anchor?.name).toMatch(/广州/);
    expect(timed.search_anchor?.name).not.toMatch(/塔/);
    expect(nears[0]?.lat).toBeCloseTo(23.13, 2);
  });

  it("should_search_amap_before_google_when_cn_locale_lists_amap", async () => {
    const waves: (string[] | undefined)[] = [];
    await planItinerary(
      {
        detail: "timed",
        origin: { name: "北京", lat: 39.9, lng: 116.4 },
        bounds: { start: "2026-08-25", end: "2026-08-26" },
        places: [],
        preferences: { pace: "relaxed", natural_language: "北京两天" },
        locale: "CN",
        providers: ["GOOGLE_MAPS", "AMAP"],
      },
      {
        weatherAdapter: weatherFor(0),
        geocodeFn: async () => ({
          data: { lat: 39.9, lng: 116.4, crs: "WGS84", address: "北京" },
          skipped: [],
          locale: "CN",
        }),
        searchPlacesFn: async (input) => {
          waves.push(input.providers);
          if (input.providers?.length === 1 && input.providers[0] === "AMAP") {
            return { data: [], skipped: [], locale: "CN" };
          }
          return {
            data: lisbonPlaces.slice(0, 2).map((p) => ({ ...p, category: "museum" })),
            skipped: [],
            locale: "CN",
          };
        },
        searchRestaurantsFn: async () => ({ data: [], skipped: [], locale: "CN" }),
      },
    );
    expect(waves[0]).toEqual(["AMAP"]);
    expect(waves.some((w) => w?.includes("GOOGLE_MAPS"))).toBe(true);
  });

  it("should_use_distinct_lunch_and_dinner_when_alternatives_exist", async () => {
    const dining = (
      name: string,
      id: string,
      rating: number,
      category = "restaurant",
    ): PlaceCard => ({
      ...lisbonPlaces[0]!,
      name,
      category,
      rating,
      sources: [{ provider: "GOOGLE_MAPS", native_id: id, deeplinks: {} }],
    });
    const restaurants = [
      dining("Tasca da Esquina", "lunch-1", 4.9),
      dining("Second Lunch", "lunch-2", 4.8),
      dining("Time Out Market stall", "dinner-1", 4.7),
      dining("Other Dinner", "dinner-2", 4.6),
    ];
    const cafes = [
      dining("Fábrica Coffee Roasters", "cafe-1", 4.5, "cafe"),
      dining("Second Cafe", "cafe-2", 4.4, "cafe"),
    ];
    const result = await planItinerary(
      {
        detail: "timed",
        origin: { lat: 38.724, lng: -9.15, name: "Lisbon" },
        bounds: { start: "2026-08-25", end: "2026-08-26" },
        places: lisbonPlaces.slice(0, 2),
        preferences: { pace: "relaxed" },
        locale: "EN",
      },
      {
        weatherAdapter: weatherFor(0),
        searchRestaurantsFn: async (input) => {
          const q = (input.query ?? "").toLowerCase();
          if (q.includes("cafe") || q.includes("茶")) {
            return { data: cafes, skipped: [], locale: "EN" };
          }
          return { data: restaurants, skipped: [], locale: "EN" };
        },
      },
    );
    const day = (
      result.data as {
        days: {
          day_index: number;
          blocks: {
            kind: string;
            meal?: string;
            slot?: { start: string };
            options?: { place: { name: string } }[];
          }[];
        }[];
      }
    ).days[0]!;
    expect(day.day_index).toBe(1);
    const lunch = day.blocks.find((b) => b.kind === "meal" && b.meal === "lunch");
    const dinner = day.blocks.find((b) => b.kind === "meal" && b.meal === "dinner");
    const cafe = day.blocks.find((b) => b.kind === "meal" && b.meal === "cafe");
    const lunchNames = lunch?.options?.map((o) => o.place.name) ?? [];
    const dinnerNames = dinner?.options?.map((o) => o.place.name) ?? [];
    const cafeNames = cafe?.options?.map((o) => o.place.name) ?? [];
    expect(lunchNames).toEqual(["Tasca da Esquina", "Second Lunch"]);
    expect(dinnerNames).toEqual(["Time Out Market stall", "Other Dinner"]);
    expect(dinner?.slot?.start).toBe("18:00");
    expect(dinner?.slot?.start).toBe("18:00");
    expect(cafe?.kind).toBe("meal");
    expect(lunchNames.some((n) => dinnerNames.includes(n) || cafeNames.includes(n))).toBe(
      false,
    );
  });

  it("should_keep_meal_venues_unique_across_days", async () => {
    const dining = (
      name: string,
      id: string,
      rating: number,
      category = "restaurant",
    ): PlaceCard => ({
      ...lisbonPlaces[0]!,
      name,
      category,
      rating,
      sources: [{ provider: "GOOGLE_MAPS", native_id: id, deeplinks: {} }],
    });
    const restaurants = [9, 8, 7, 6, 5, 4, 3, 2].map((n, i) =>
      dining(`Rest ${i}`, `r${i}`, n / 2),
    );
    const cafes = [4, 3, 2, 1].map((n, i) => dining(`Tea House ${i}`, `c${i}`, n, "cafe"));
    const result = await planItinerary(
      {
        detail: "timed",
        origin: { lat: 38.724, lng: -9.15, name: "Lisbon" },
        bounds: { start: "2026-08-25", end: "2026-08-27" },
        places: lisbonPlaces.slice(0, 4).map((p, i) => ({
          ...p,
          name: `Museum ${i}`,
          category: "museum",
          sources: [{ provider: "GOOGLE_MAPS", native_id: `v${i}`, deeplinks: {} }],
        })),
        preferences: { pace: "relaxed" },
        locale: "EN",
      },
      {
        weatherAdapter: weatherFor(0),
        searchRestaurantsFn: async (input) => {
          const q = (input.query ?? "").toLowerCase();
          if (q.includes("cafe") || q.includes("茶")) {
            return { data: cafes, skipped: [], locale: "EN" };
          }
          return { data: restaurants, skipped: [], locale: "EN" };
        },
      },
    );
    const days = (
      result.data as {
        days: {
          blocks: {
            kind: string;
            meal?: string;
            place?: { name: string; sources?: { native_id: string }[] };
            options?: { place: { name: string; sources?: { native_id: string }[] } }[];
          }[];
        }[];
      }
    ).days;
    expect(days).toHaveLength(2);
    const visitIds: string[] = [];
    const mealIds: string[] = [];
    for (const d of days) {
      for (const b of d.blocks) {
        if (b.kind === "visit" && b.place) {
          visitIds.push(b.place.sources?.[0]?.native_id ?? b.place.name);
        }
        if (b.kind === "meal") {
          for (const o of b.options ?? []) {
            mealIds.push(o.place.sources?.[0]?.native_id ?? o.place.name);
          }
        }
      }
    }
    expect(new Set(visitIds).size).toBe(visitIds.length);
    expect(new Set(mealIds).size).toBe(mealIds.length);
    expect(visitIds.some((id) => mealIds.includes(id))).toBe(false);
  });

  it("should_dedupe_same_name_visits_from_search", async () => {
    const result = await planItinerary(
      {
        detail: "timed",
        origin: { lat: 38.724, lng: -9.15, name: "Lisbon" },
        bounds: { start: "2026-08-25", end: "2026-08-26" },
        places: [],
        preferences: { pace: "relaxed", natural_language: "Lisboa" },
        locale: "EN",
        providers: ["GOOGLE_MAPS"],
      },
      {
        weatherAdapter: weatherFor(0),
        geocodeFn: async () => ({
          data: { lat: 38.72, lng: -9.14, crs: "WGS84", address: "Lisbon" },
          skipped: [],
          locale: "EN",
        }),
        searchPlacesFn: async () => ({
          data: [
            {
              ...lisbonPlaces[0]!,
              name: "Carmo",
              category: "museum",
              sources: [{ provider: "GOOGLE_MAPS", native_id: "id-a", deeplinks: {} }],
            },
            {
              ...lisbonPlaces[1]!,
              name: "Carmo!",
              category: "museum",
              sources: [{ provider: "GOOGLE_MAPS", native_id: "id-b", deeplinks: {} }],
            },
            {
              ...lisbonPlaces[2]!,
              name: "Castelo",
              category: "castle",
              sources: [{ provider: "GOOGLE_MAPS", native_id: "id-c", deeplinks: {} }],
            },
          ],
          skipped: [],
          locale: "EN",
        }),
        searchRestaurantsFn: async () => ({ data: [], skipped: [], locale: "EN" }),
      },
    );
    const names = (
      result.data as {
        days: { blocks: { kind: string; place?: { name: string } }[] }[];
      }
    ).days.flatMap((d) =>
      d.blocks.filter((b) => b.kind === "visit").map((b) => b.place?.name),
    );
    expect(names.filter((n) => n?.startsWith("Carmo")).length).toBe(1);
  });

  it("should_search_more_then_omit_dinner_when_only_one_restaurant", async () => {
    const queries: string[] = [];
    const only: PlaceCard = {
      ...lisbonPlaces[0]!,
      name: "Solo Tasca",
      category: "restaurant",
      rating: 4.9,
      sources: [{ provider: "GOOGLE_MAPS", native_id: "solo", deeplinks: {} }],
    };
    const result = await planItinerary(
      {
        detail: "timed",
        origin: { lat: 38.724, lng: -9.15, name: "Lisbon" },
        bounds: { start: "2026-08-25", end: "2026-08-26" },
        places: lisbonPlaces.slice(0, 2),
        preferences: { pace: "relaxed" },
        locale: "EN",
      },
      {
        weatherAdapter: weatherFor(0),
        searchRestaurantsFn: async (input) => {
          queries.push(input.query ?? "");
          const q = (input.query ?? "").toLowerCase();
          if (q.includes("cafe") || q.includes("茶")) {
            return { data: [], skipped: [], locale: "EN" };
          }
          return { data: [only], skipped: [], locale: "EN" };
        },
      },
    );
    const day = (
      result.data as {
        days: { blocks: { kind: string; meal?: string; options?: { place: { name: string } }[] }[] }[];
      }
    ).days[0]!;
    const lunch = day.blocks.find((b) => b.kind === "meal" && b.meal === "lunch");
    const dinner = day.blocks.find((b) => b.kind === "meal" && b.meal === "dinner");
    expect(lunch?.options?.[0]?.place.name).toBe("Solo Tasca");
    expect(dinner).toBeUndefined();
    expect(queries.some((q) => /more restaurants|更多餐厅/i.test(q))).toBe(true);
  });

  it("should_use_distinct_venues_across_days_when_pool_repeats", async () => {
    const mk = (name: string, id: string, rating: number): PlaceCard => ({
      provider: "GOOGLE_MAPS",
      name,
      category: "restaurant",
      rating,
      location: { lat: 38.71, lng: -9.14, crs: "WGS84" },
      sources: [{ provider: "GOOGLE_MAPS", native_id: id, deeplinks: {} }],
    });
    const pool = [
      mk("Fifty", "f", 4.9),
      mk("Marlene", "m", 4.8),
      mk("Altura", "a", 4.7),
      mk("Boa", "b", 4.6),
    ];
    const dayTemplate = (index: number): TimedItineraryDay => ({
      day_index: index,
      date: `2026-08-${24 + index}`,
      stops: [],
      blocks: [
        {
          kind: "visit",
          slot: { start: "10:00", end: "12:00" },
          place: {
            provider: "GOOGLE_MAPS",
            name: `Museum ${index}`,
            location: { lat: 38.71, lng: -9.14, crs: "WGS84" },
            sources: [{ provider: "GOOGLE_MAPS", native_id: `v${index}`, deeplinks: {} }],
          },
          legs_to_here: [],
        },
        {
          kind: "visit",
          slot: { start: "14:00", end: "16:00" },
          place: {
            provider: "GOOGLE_MAPS",
            name: `Castle ${index}`,
            location: { lat: 38.713, lng: -9.133, crs: "WGS84" },
            sources: [{ provider: "GOOGLE_MAPS", native_id: `c${index}`, deeplinks: {} }],
          },
          legs_to_here: [],
        },
      ],
    });
    const used = new Set<string>();
    const day1 = await insertMealBlocks(
      dayTemplate(1),
      { lunch: pool, dinner: pool },
      undefined,
      { pace: "relaxed" },
      { lat: 38.713, lng: -9.139, crs: "WGS84" },
      undefined,
      used,
    );
    const day2 = await insertMealBlocks(
      dayTemplate(2),
      { lunch: pool, dinner: pool },
      undefined,
      { pace: "relaxed" },
      { lat: 38.713, lng: -9.139, crs: "WGS84" },
      undefined,
      used,
    );
    const names = (d: TimedItineraryDay) =>
      d.blocks
        .filter((b): b is Extract<typeof b, { kind: "meal" }> => b.kind === "meal")
        .flatMap((b) => b.options.map((o) => o.place.name));
    expect(names(day1)).toEqual(["Fifty", "Marlene", "Altura", "Boa"]);
    expect(names(day2)).toEqual([]);
  });
});

describe("timed helpers", () => {
  it("should_keep_legacy_meal_slots_and_hours_status", () => {
    expect(mealSlots()).toEqual({
      lunch: { start: "12:00", end: "13:30" },
      dinner: { start: "19:00", end: "21:00" },
    });
    expect(hoursOverlapStatus(undefined, { start: "12:00", end: "13:00" })).toBe("unknown");
    expect(hoursOverlapStatus("Closed", { start: "12:00", end: "13:00" })).toBe("closed");
    expect(hoursOverlapStatus("休息", { start: "12:00", end: "13:00" })).toBe("closed");
    expect(hoursOverlapStatus("09:00-17:00", { start: "12:00", end: "13:00" })).toBe("open");
    expect(hoursOverlapStatus("22:00-02:00", { start: "23:00", end: "23:30" })).toBe("open");
    expect(hoursOverlapStatus("no clocks here", { start: "12:00", end: "13:00" })).toBe("unknown");
    expect(hoursOverlapStatus("09:00-10:00", { start: "12:00", end: "13:00" })).toBe("closed");
  });
});
