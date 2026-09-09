/**
 * agent-poc-01 — plan_trip intake + must-see chips (fixture).
 * Checklist #1 / #5 / #8 / #25 / #28.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../db/client";
import { generateCallerSecret, hashPassword } from "./crypto";
import { planTrip } from "./plan-trip";
import { fetchTripDetails } from "./fetch-trip-details";
import { clearTripMemoryForTests } from "./trip-store";
import { resolveProviderStrategy } from "../adapters/provider-resolver";
import {
  createMemoryPoiRegistryStore,
  listPoisForDestination,
  resetPoiRegistryStoreForTests,
  setPoiRegistryStore,
  upsertEligiblePois,
} from "./destination-poi-registry";
import type { PlaceCard } from "./types";
import type { ToolResult } from "./types";

const ADMIN = { username: "admin", email: "me@ethanhuang.com" };

function place(opts: {
  name: string;
  provider: "GOOGLE_MAPS" | "AMAP";
  lat: number;
  lng: number;
  photo?: string;
  nativeId?: string;
}): PlaceCard {
  return {
    provider: opts.provider,
    name: opts.name,
    location: { lat: opts.lat, lng: opts.lng, crs: "WGS84" },
    category: "attraction",
    photos: opts.photo ? [opts.photo] : undefined,
    sources: [
      {
        provider: opts.provider,
        native_id: opts.nativeId ?? `fixture_${opts.name}`,
        deeplinks: {},
      },
    ],
  };
}

function okCards(cards: PlaceCard[]): ToolResult<PlaceCard[]> {
  return { data: cards, skipped: [], locale: "EN" };
}

function okGeocode(
  lat: number,
  lng: number,
  address: string,
): ToolResult<{ lat: number; lng: number; crs: string; address?: string } | null> {
  return { data: { lat, lng, crs: "WGS84", address }, skipped: [], locale: "EN" };
}

async function resetDb() {
  clearTripMemoryForTests();
  await prisma.trip.deleteMany();
  await prisma.callerApiKey.deleteMany();
  await prisma.adminUser.deleteMany();
  await prisma.adminUser.create({
    data: { ...ADMIN, passwordHash: await hashPassword("devpass") },
  });
}

describe("planTrip POC intake", () => {
  let callerKey = "";
  const prevVendor = process.env.PLACES_VENDOR_MODE;
  const prevQwen = process.env.QWEN_API_KEY;
  const prevOpenai = process.env.OPENAI_API_KEY;

  beforeEach(async () => {
    process.env.PLACES_VENDOR_MODE = "fixture";
    delete process.env.QWEN_API_KEY;
    delete process.env.OPENAI_API_KEY;
    resetPoiRegistryStoreForTests();
    setPoiRegistryStore(createMemoryPoiRegistryStore());
    await resetDb();
    const generated = generateCallerSecret();
    const row = await prisma.callerApiKey.create({
      data: {
        name: "plan-trip-poc",
        keyHash: generated.keyHash,
        prefix: generated.prefix,
        status: "ACTIVE",
      },
    });
    callerKey = row.id;
  });

  afterEach(async () => {
    clearTripMemoryForTests();
    resetPoiRegistryStoreForTests();
    await prisma.trip.deleteMany();
    await prisma.callerApiKey.deleteMany();
    if (prevVendor === undefined) delete process.env.PLACES_VENDOR_MODE;
    else process.env.PLACES_VENDOR_MODE = prevVendor;
    if (prevQwen === undefined) delete process.env.QWEN_API_KEY;
    else process.env.QWEN_API_KEY = prevQwen;
    if (prevOpenai === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = prevOpenai;
  });

  it("should_lazy_create_trip_and_return_needs_input_when_city_is_lisbon", async () => {
    const result = await planTrip({
      callerKey,
      city: "Lisbon",
      locale: "EN",
      _testGeocode: async () => okGeocode(38.7223, -9.1393, "Lisbon"),
      _testSearchPlaces: async () =>
        okCards([
          place({
            name: "Torre de Belém",
            provider: "GOOGLE_MAPS",
            lat: 38.6916,
            lng: -9.216,
            photo: "https://cdn.example.com/belem.jpg",
          }),
          place({
            name: "Castelo de São Jorge",
            provider: "GOOGLE_MAPS",
            lat: 38.7139,
            lng: -9.1335,
            photo: "https://cdn.example.com/castelo.jpg",
          }),
          place({
            name: "Mosteiro dos Jerónimos",
            provider: "GOOGLE_MAPS",
            lat: 38.6979,
            lng: -9.2067,
            photo: "https://cdn.example.com/jeronimos.jpg",
          }),
        ]),
    });

    expect(result.trip_id).toMatch(/\w+/);
    expect(result.revision).toBeGreaterThanOrEqual(1);
    expect(result.status).toBe("needs_input");
    expect(result.need_input).toBeDefined();
  });

  it("should_return_needs_input_not_failed_when_intake_does_not_commit_chips", async () => {
    const result = await planTrip({
      callerKey,
      city: "Hangzhou",
      locale: "CN",
      _testTurns: [{ type: "stop" }],
      _testGeocode: async () => okGeocode(30.2741, 120.1551, "Hangzhou"),
      _testSearchPlaces: async () => okCards([]),
    });

    expect(result.status).toBe("needs_input");
    expect(result.need_input?.questions?.length).toBeGreaterThanOrEqual(1);
    expect(result.trip_id).toMatch(/\w+/);
  });

  it("should_attach_must_see_options_from_city_registry_when_search_is_empty", async () => {
    const store = createMemoryPoiRegistryStore();
    setPoiRegistryStore(store);
    await upsertEligiblePois(
      [
        place({
          name: "Torre de Belém",
          provider: "GOOGLE_MAPS",
          lat: 38.6916,
          lng: -9.216,
          nativeId: "ChIJ-belem",
        }),
        place({
          name: "Castelo de São Jorge",
          provider: "GOOGLE_MAPS",
          lat: 38.7139,
          lng: -9.1335,
          nativeId: "ChIJ-castelo",
        }),
        place({
          name: "Mosteiro dos Jerónimos",
          provider: "GOOGLE_MAPS",
          lat: 38.6979,
          lng: -9.2067,
          nativeId: "ChIJ-jeronimos",
        }),
        place({
          name: "Hong Kong Museum of History",
          provider: "GOOGLE_MAPS",
          lat: 22.282,
          lng: 114.158,
          nativeId: "ChIJ-hk-history",
        }),
      ],
      { city: "Lisbon", lat: 38.7223, lng: -9.1393 },
      store,
    );

    const result = await planTrip({
      callerKey,
      city: "Lisbon",
      locale: "EN",
      _testTurns: [{ type: "stop" }],
      _testGeocode: async () => okGeocode(38.7223, -9.1393, "Lisbon"),
      _testSearchPlaces: async () => okCards([]),
    });

    expect(result.status).toBe("needs_input");
    const mustSee = result.need_input?.questions.find((q) => q.id === "must_see");
    const labels = mustSee?.options?.map((o) => o.label) ?? [];
    expect(labels).toEqual(
      expect.arrayContaining(["Torre de Belém", "Castelo de São Jorge", "Mosteiro dos Jerónimos"]),
    );
    expect(labels).not.toContain("Hong Kong Museum of History");
    expect(labels.length).toBeGreaterThanOrEqual(3);
    expect(labels.length).toBeLessThanOrEqual(5);
  });

  it("should_fetch_must_see_candidates_with_https_photos_when_committed", async () => {
    const planned = await planTrip({
      callerKey,
      city: "Lisbon",
      locale: "EN",
      _testGeocode: async () => okGeocode(38.7223, -9.1393, "Lisbon"),
      _testSearchPlaces: async () =>
        okCards([
          place({
            name: "Torre de Belém",
            provider: "GOOGLE_MAPS",
            lat: 38.6916,
            lng: -9.216,
            photo: "https://cdn.example.com/belem.jpg",
          }),
        ]),
    });

    const fetched = await fetchTripDetails({
      callerKey,
      trip_id: planned.trip_id,
      fields: ["candidates"],
    });
    const places = (fetched.data.candidates as { places?: Array<Record<string, unknown>> })
      ?.places ?? [];
    expect(places.length).toBeGreaterThanOrEqual(1);
    for (const card of places) {
      expect(card.must_see).toBe(true);
      expect(card.provider).toBe("GOOGLE_MAPS");
      const photos = card.photos as string[] | undefined;
      expect(photos?.[0]).toMatch(/^https:\/\//);
      expect(photos?.[0]).not.toMatch(/[?&](?:api_)?key=/i);
    }
    expect(fetched.revision).toBe(planned.revision);
  });

  it("should_write_registry_on_commit", async () => {
    await planTrip({
      callerKey,
      city: "Lisbon",
      locale: "EN",
      _testGeocode: async () => okGeocode(38.7223, -9.1393, "Lisbon"),
      _testSearchPlaces: async () =>
        okCards([
          place({
            name: "Torre de Belém",
            provider: "GOOGLE_MAPS",
            lat: 38.6916,
            lng: -9.216,
            photo: "https://cdn.example.com/belem.jpg",
            nativeId: "ChIJbelem",
          }),
          place({
            name: "Castelo de São Jorge",
            provider: "GOOGLE_MAPS",
            lat: 38.7139,
            lng: -9.1335,
            photo: "https://cdn.example.com/castelo.jpg",
            nativeId: "ChIJcastelo",
          }),
        ]),
    });

    const listed = await listPoisForDestination({
      city: "Lisbon",
      lat: 38.7223,
      lng: -9.1393,
    });
    expect(listed.map((p) => p.name).sort()).toEqual(
      ["Castelo de São Jorge", "Torre de Belém"].sort(),
    );
    for (const card of listed) {
      expect(card.must_see).toBeUndefined();
      expect(card.photos?.[0]).toMatch(/^https:\/\//);
      expect(card.sources[0]?.native_id).toBeTruthy();
    }
  });

  it("should_use_google_only_when_city_is_lisbon", async () => {
    const strategy = await resolveProviderStrategy({
      location: "Lisbon",
      near: { lat: 38.7223, lng: -9.1393 },
    });
    expect(strategy.searchProviders).toEqual(["GOOGLE_MAPS"]);

    let seenProviders: string[] | undefined;
    await planTrip({
      callerKey,
      city: "Lisbon",
      locale: "EN",
      _testGeocode: async () => okGeocode(38.7223, -9.1393, "Lisbon"),
      _testSearchPlaces: async (input) => {
        seenProviders = input.providers;
        return okCards([
          place({
            name: "Praça do Comércio",
            provider: "GOOGLE_MAPS",
            lat: 38.7071,
            lng: -9.1364,
            photo: "https://cdn.example.com/comercio.jpg",
          }),
        ]);
      },
    });
    expect(seenProviders === undefined || seenProviders.length === 0).toBe(true);
  });

  it("should_drop_ungrounded_names_and_ineligible_cards_when_commit", async () => {
    const planned = await planTrip({
      callerKey,
      city: "Lisbon",
      locale: "EN",
      _testGeocode: async () => okGeocode(38.7223, -9.1393, "Lisbon"),
      _testSearchPlaces: async () =>
        okCards([
          place({
            name: "Torre de Belém",
            provider: "GOOGLE_MAPS",
            lat: 38.6916,
            lng: -9.216,
            photo: "https://cdn.example.com/belem.jpg",
          }),
          {
            provider: "GOOGLE_MAPS",
            name: "西湖风景名胜区",
            location: { lat: 38.72, lng: -9.14, crs: "WGS84" },
            sources: [{ provider: "GOOGLE_MAPS", native_id: "collection", deeplinks: {} }],
          },
        ]),
      _testTurns: [
        { type: "tool", name: "geocode", args: { query: "Lisbon" } },
        { type: "tool", name: "search_places", args: { query: "Lisbon" } },
        {
          type: "tool",
          name: "commit_trip",
          args: { names: ["Torre de Belém", "Invented Castle"] },
        },
        { type: "stop" },
      ],
    });

    const fetched = await fetchTripDetails({
      callerKey,
      trip_id: planned.trip_id,
      fields: ["candidates"],
    });
    const places = (fetched.data.candidates as { places?: Array<{ name?: string }> })?.places ?? [];
    const names = places.map((p) => p.name);
    expect(names).toContain("Torre de Belém");
    expect(names).not.toContain("Invented Castle");
    expect(names).not.toContain("西湖风景名胜区");
  });

  it("should_drop_cards_beyond_80km_city_anchor", async () => {
    const planned = await planTrip({
      callerKey,
      city: "Lisbon",
      locale: "EN",
      _testGeocode: async () => okGeocode(38.7223, -9.1393, "Lisbon"),
      _testSearchPlaces: async () =>
        okCards([
          place({
            name: "Torre de Belém",
            provider: "GOOGLE_MAPS",
            lat: 38.6916,
            lng: -9.216,
            photo: "https://cdn.example.com/belem.jpg",
          }),
          place({
            name: "Porto São Bento",
            provider: "GOOGLE_MAPS",
            lat: 41.1456,
            lng: -8.6105,
            photo: "https://cdn.example.com/porto.jpg",
          }),
        ]),
    });

    const fetched = await fetchTripDetails({
      callerKey,
      trip_id: planned.trip_id,
      fields: ["candidates"],
    });
    const names = (
      (fetched.data.candidates as { places?: Array<{ name?: string }> })?.places ?? []
    ).map((p) => p.name);
    expect(names).toContain("Torre de Belém");
    expect(names).not.toContain("Porto São Bento");
  });

  it("should_use_amap_only_when_city_is_hangzhou", async () => {
    const strategy = await resolveProviderStrategy({
      location: "杭州",
      near: { lat: 30.2741, lng: 120.1551 },
    });
    expect(strategy.searchProviders).toEqual(["AMAP"]);

    let seenProviders: string[] | undefined;
    const planned = await planTrip({
      callerKey,
      city: "杭州",
      locale: "CN",
      _testGeocode: async () => okGeocode(30.2741, 120.1551, "杭州"),
      _testSearchPlaces: async (input) => {
        seenProviders = input.providers;
        return okCards([
          place({
            name: "灵隐寺",
            provider: "AMAP",
            lat: 30.2408,
            lng: 120.0966,
            photo: "https://store.is.autonavi.com/lingyin.jpg",
          }),
          place({
            name: "西溪湿地",
            provider: "AMAP",
            lat: 30.2706,
            lng: 120.0631,
            photo: "https://store.is.autonavi.com/xixi.jpg",
          }),
        ]);
      },
    });
    expect(seenProviders === undefined || seenProviders.length === 0).toBe(true);

    const fetched = await fetchTripDetails({
      callerKey,
      trip_id: planned.trip_id,
      fields: ["candidates"],
    });
    const places = (fetched.data.candidates as { places?: Array<{ provider?: string }> })
      ?.places ?? [];
    expect(places.length).toBeGreaterThanOrEqual(1);
    expect(places.every((p) => p.provider === "AMAP")).toBe(true);
    expect(places.some((p) => p.provider === "GOOGLE_MAPS")).toBe(false);
  });

  it("should_use_google_and_amap_when_city_is_hong_kong", async () => {
    const strategy = await resolveProviderStrategy({
      location: "Hong Kong",
      near: { lat: 22.3193, lng: 114.1694 },
    });
    expect(strategy.searchProviders).toEqual(["GOOGLE_MAPS", "AMAP"]);

    const planned = await planTrip({
      callerKey,
      city: "Hong Kong",
      locale: "HK",
      _testGeocode: async () => okGeocode(22.3193, 114.1694, "Hong Kong"),
      _testSearchPlaces: async () =>
        okCards([
          place({
            name: "Victoria Peak",
            provider: "GOOGLE_MAPS",
            lat: 22.275,
            lng: 114.145,
            photo: "https://cdn.example.com/peak.jpg",
          }),
          place({
            name: "香港歷史博物館",
            provider: "AMAP",
            lat: 22.3019,
            lng: 114.1772,
            photo: "https://store.is.autonavi.com/hk-museum.jpg",
          }),
        ]),
    });

    const fetched = await fetchTripDetails({
      callerKey,
      trip_id: planned.trip_id,
      fields: ["candidates"],
    });
    const places = (fetched.data.candidates as { places?: Array<{ provider?: string }> })
      ?.places ?? [];
    const providers = new Set(places.map((p) => p.provider));
    expect(providers.has("GOOGLE_MAPS")).toBe(true);
    expect(providers.has("AMAP")).toBe(true);
  });

  it("should_return_ready_with_3day_itinerary_when_full_bounds_provided", async () => {
    const hotel = place({
      name: "西湖大华饭店",
      provider: "AMAP",
      lat: 30.242,
      lng: 120.143,
      photo: "https://store.is.autonavi.com/dahua.jpg",
      nativeId: "amap_dahua",
    });
    hotel.category = "酒店";

    const planned = await planTrip({
      callerKey,
      city: "杭州",
      locale: "CN",
      numDays: 3,
      origin: { name: "西湖大华饭店" },
      pace: "relaxed",
      budget: "premium",
      transit_preference: "打车",
      trip_type: "情侣",
      bounds: { start: "2026-10-01", end: "2026-10-03" },
      must_include: ["灵隐寺", "西溪湿地"],
      _testGeocode: async () => okGeocode(30.2741, 120.1551, "杭州"),
      _testSearchPlaces: async (input) => {
        if (/大华|饭店|酒店|hotel/i.test(input.query ?? "")) {
          return okCards([hotel]);
        }
        return okCards([
          place({
            name: "灵隐寺",
            provider: "AMAP",
            lat: 30.2408,
            lng: 120.0966,
            photo: "https://store.is.autonavi.com/lingyin.jpg",
          }),
          place({
            name: "西溪湿地",
            provider: "AMAP",
            lat: 30.2706,
            lng: 120.0631,
            photo: "https://store.is.autonavi.com/xixi.jpg",
          }),
          place({
            name: "雷峰塔",
            provider: "AMAP",
            lat: 30.231,
            lng: 120.148,
            photo: "https://store.is.autonavi.com/leifeng.jpg",
          }),
        ]);
      },
      _testResolveStay: async () => hotel,
      _testMakeItinerary: async () => ({
        skeleton: {
          days: [
            {
              day_index: 1,
              day_theme: "湖西经典",
              stops: [
                { name: "西湖大华饭店", kind: "stay" as const },
                { name: "灵隐寺", kind: "attraction" as const },
                { name: "lunch", kind: "meal" as const, meal_slot: "lunch" as const },
                { name: "雷峰塔", kind: "attraction" as const },
              ],
            },
            {
              day_index: 2,
              day_theme: "湿地休闲",
              stops: [
                { name: "西湖大华饭店", kind: "stay" as const },
                { name: "西溪湿地", kind: "attraction" as const },
                { name: "dinner", kind: "meal" as const, meal_slot: "dinner" as const },
              ],
            },
            {
              day_index: 3,
              day_theme: "返程轻松",
              stops: [
                { name: "西湖大华饭店", kind: "stay" as const },
                { name: "雷峰塔", kind: "attraction" as const },
              ],
            },
          ],
        },
        candidates_slim: {
          places: [
            place({
              name: "灵隐寺",
              provider: "AMAP",
              lat: 30.2408,
              lng: 120.0966,
              photo: "https://store.is.autonavi.com/lingyin.jpg",
            }),
            place({
              name: "西溪湿地",
              provider: "AMAP",
              lat: 30.2706,
              lng: 120.0631,
              photo: "https://store.is.autonavi.com/xixi.jpg",
            }),
            place({
              name: "雷峰塔",
              provider: "AMAP",
              lat: 30.231,
              lng: 120.148,
              photo: "https://store.is.autonavi.com/leifeng.jpg",
            }),
          ],
          restaurants: [],
        },
      }),
      _testPlanNextStopFill: async (fillInput) => ({
        next_stop: {
          name: fillInput.next_stop.name,
          location: {
            lat: fillInput.next_stop.lat ?? 30.24,
            lng: fillInput.next_stop.lng ?? 120.14,
            crs: "WGS84" as const,
          },
        },
        legs:
          fillInput.origin_mode === true
            ? []
            : [
                {
                  mode: "drive" as const,
                  duration_min: 15,
                  base_duration_min: 15,
                  weather_buffer_min: 0,
                  deeplinks: {},
                  source: "directions" as const,
                },
              ],
        transit_outcome: "directions" as const,
        single_mode: true,
        stop_display: {
          stop: {
            name: fillInput.next_stop.name,
            kind: fillInput.next_stop.kind ?? "attraction",
            card: null,
            deeplinks: {},
          },
          slot: {
            start: fillInput.time_from ?? "09:00",
            end: fillInput.time_from === "09:00" ? "09:00" : "11:00",
          },
          legs_to_here: [],
          from_origin: fillInput.origin_mode === true
            ? { transport: "stay", duration_min: 0 }
            : undefined,
          transit_outcome: "directions" as const,
          notes: [],
        },
      }),
      _testTravelTips: async () => ({
        intro: "杭州三日情侣行，湖光山色与湿地并重。",
        iconic_places: ["灵隐寺", "西溪湿地", "雷峰塔"],
        iconic_grounded: true,
        transit: "建议打车往返景点。",
        weather: null,
        weather_unavailable: true,
        clothing: "早晚微凉，带薄外套。",
        safety: "景区注意防盗。",
      }),
    });

    expect(planned.status).toBe("ready");
    expect(planned.itinerary?.skeleton.days).toHaveLength(3);
    expect(planned.itinerary?.filledStops.length).toBeGreaterThanOrEqual(3);
    expect(planned.itinerary?.artifacts?.tips).toBeDefined();
    expect(planned.timing?.total_s).toBeGreaterThanOrEqual(0);
    expect(planned.timing?.skeleton_s).toBeDefined();
    expect(planned.timing?.fill_s).toBeDefined();

    const fetched = await fetchTripDetails({
      callerKey,
      trip_id: planned.trip_id,
      fields: ["constraints", "skeleton", "artifacts"],
    });
    const constraints = fetched.data.constraints as {
      originStay?: { name?: string };
      origin?: { name?: string };
    };
    expect(
      constraints.originStay?.name === "西湖大华饭店" ||
        constraints.origin?.name === "西湖大华饭店",
    ).toBe(true);
    expect((fetched.data.skeleton as { days?: unknown[] })?.days).toHaveLength(3);
  });

  it("should_run_full_loop_as_model_tool_loop", async () => {
    const hotel = place({
      name: "西湖大华饭店",
      provider: "AMAP",
      lat: 30.242,
      lng: 120.143,
      photo: "https://store.is.autonavi.com/dahua.jpg",
      nativeId: "amap_dahua",
    });
    hotel.category = "酒店";
    const lingyin = place({
      name: "灵隐寺",
      provider: "AMAP",
      lat: 30.2408,
      lng: 120.0966,
      photo: "https://store.is.autonavi.com/lingyin.jpg",
      nativeId: "amap_lingyin",
    });

    const planned = await planTrip({
      callerKey,
      city: "杭州",
      locale: "CN",
      numDays: 3,
      origin: { name: "西湖大华饭店" },
      pace: "relaxed",
      _testGeocode: async () => okGeocode(30.2741, 120.1551, "杭州"),
      _testSearchPlaces: async () => okCards([lingyin]),
      _testResolveStay: async () => hotel,
      _testFullLoopTurns: [
        { type: "tool", name: "resolve_origin_stay", args: {} },
        { type: "tool", name: "make_itinerary", args: {} },
        { type: "tool", name: "plan_next_stop", args: {} },
        { type: "tool", name: "plan_next_stop", args: {} },
        { type: "tool", name: "plan_next_stop", args: {} },
        { type: "tool", name: "commit_artifacts", args: {} },
        { type: "stop" },
      ],
      _testMakeItinerary: async () => ({
        skeleton: {
          days: [
            {
              day_index: 1,
              day_theme: "湖西",
              stops: [
                { name: "西湖大华饭店", kind: "stay" as const },
                { name: "灵隐寺", kind: "attraction" as const },
                { name: "lunch", kind: "meal" as const, meal_slot: "lunch" as const },
              ],
            },
            {
              day_index: 2,
              day_theme: "湿地",
              stops: [
                { name: "西湖大华饭店", kind: "stay" as const },
                { name: "灵隐寺", kind: "attraction" as const },
              ],
            },
            {
              day_index: 3,
              day_theme: "返程",
              stops: [
                { name: "西湖大华饭店", kind: "stay" as const },
                { name: "灵隐寺", kind: "attraction" as const },
              ],
            },
          ],
        },
        candidates_slim: { places: [lingyin], restaurants: [] },
      }),
      _testPlanNextStopFill: async (fillInput) => ({
        next_stop: {
          name: fillInput.next_stop.name,
          location: { lat: 30.24, lng: 120.14, crs: "WGS84" as const },
        },
        legs: [],
        transit_outcome: "directions" as const,
        single_mode: true,
        stop_display: {
          stop: {
            name: fillInput.next_stop.name,
            kind: fillInput.next_stop.kind ?? "attraction",
            card: null,
            deeplinks: {},
          },
          slot: { start: "09:00", end: "11:00" },
          legs_to_here: [],
          transit_outcome: "directions" as const,
          notes: [],
        },
      }),
      _testTravelTips: async () => ({
        intro: "fixture",
        iconic_places: ["灵隐寺"],
        iconic_grounded: true,
        transit: "打车",
        weather: null,
        weather_unavailable: true,
        clothing: "薄外套",
        safety: "注意防盗",
      }),
    });

    expect(planned.status).toBe("ready");
    expect(planned.itinerary?.skeleton.days).toHaveLength(3);
    expect(planned.itinerary?.filledStops.length).toBeGreaterThanOrEqual(3);
    const fullCalls = (planned.tool_calls ?? []).filter((n) =>
      ["resolve_origin_stay", "make_itinerary", "plan_next_stop", "commit_artifacts"].includes(
        n,
      ),
    );
    expect(fullCalls).toEqual([
      "resolve_origin_stay",
      "make_itinerary",
      "plan_next_stop",
      "plan_next_stop",
      "plan_next_stop",
      "commit_artifacts",
    ]);
  });

  it("should_backfill_registry_after_full_loop", async () => {
    const hotel = place({
      name: "西湖大华饭店",
      provider: "AMAP",
      lat: 30.242,
      lng: 120.143,
      nativeId: "amap_dahua",
    });
    hotel.category = "酒店";
    const chip = place({
      name: "灵隐寺",
      provider: "AMAP",
      lat: 30.2408,
      lng: 120.0966,
      photo: "https://store.is.autonavi.com/lingyin.jpg",
      nativeId: "amap_lingyin",
    });
    const extra = place({
      name: "雷峰塔",
      provider: "AMAP",
      lat: 30.231,
      lng: 120.148,
      photo: "https://store.is.autonavi.com/leifeng.jpg",
      nativeId: "amap_leifeng",
    });

    await planTrip({
      callerKey,
      city: "杭州",
      locale: "CN",
      numDays: 3,
      origin: { name: "西湖大华饭店" },
      _testGeocode: async () => okGeocode(30.2741, 120.1551, "杭州"),
      _testSearchPlaces: async (input) => {
        if (/博物馆|景点|museum|landmark/i.test(input.query ?? "")) {
          return okCards([chip, extra]);
        }
        return okCards([chip]);
      },
      _testResolveStay: async () => hotel,
      _testMakeItinerary: async () => ({
        skeleton: {
          days: [
            {
              day_index: 1,
              day_theme: "一日",
              stops: [
                { name: "西湖大华饭店", kind: "stay" as const },
                { name: "灵隐寺", kind: "attraction" as const },
                { name: "雷峰塔", kind: "attraction" as const },
              ],
            },
          ],
        },
        candidates_slim: { places: [chip, extra], restaurants: [] },
      }),
      _testPlanNextStopFill: async (fillInput) => ({
        next_stop: {
          name: fillInput.next_stop.name,
          location: { lat: 30.24, lng: 120.14, crs: "WGS84" as const },
        },
        legs: [],
        transit_outcome: "directions" as const,
        single_mode: true,
        stop_display: {
          stop: {
            name: fillInput.next_stop.name,
            kind: fillInput.next_stop.kind ?? "attraction",
            card: null,
            deeplinks: {},
          },
          slot: { start: "09:00", end: "11:00" },
          legs_to_here: [],
          transit_outcome: "directions" as const,
          notes: [],
        },
      }),
      _testTravelTips: async () => ({
        intro: "fixture",
        iconic_places: ["灵隐寺"],
        iconic_grounded: true,
        transit: "",
        weather: null,
        weather_unavailable: true,
        clothing: "",
        safety: "",
      }),
    });

    const listed = await listPoisForDestination({
      city: "杭州",
      lat: 30.2741,
      lng: 120.1551,
    });
    const names = listed.map((p) => p.name);
    expect(names).toContain("灵隐寺");
    expect(names).toContain("雷峰塔");
  });

  it("should_return_four_need_input_questions_when_bounds_incomplete", async () => {
    const result = await planTrip({
      callerKey,
      city: "Lisbon",
      locale: "EN",
      _testGeocode: async () => okGeocode(38.7223, -9.1393, "Lisbon"),
      _testSearchPlaces: async () =>
        okCards([
          place({
            name: "Torre de Belém",
            provider: "GOOGLE_MAPS",
            lat: 38.6916,
            lng: -9.216,
            photo: "https://cdn.example.com/belem.jpg",
          }),
        ]),
    });

    expect(result.status).toBe("needs_input");
    const ids = result.need_input?.questions.map((q) => q.id) ?? [];
    expect(ids).toEqual(["hotel", "start_time", "must_see", "other"]);
    const mustSee = result.need_input?.questions.find((q) => q.id === "must_see");
    expect(mustSee?.options?.some((o) => o.label === "Torre de Belém")).toBe(true);
    expect(mustSee?.multi).toBe(true);
  });

  it("should_keep_ask_user_options_when_llm_returns_verification_chips", async () => {
    const result = await planTrip({
      callerKey,
      city: "Lisbon",
      locale: "EN",
      _testTurns: [
        { type: "tool", name: "geocode", args: { query: "Lisbon" } },
        {
          type: "tool",
          name: "search_places",
          args: { query: "Torre de Belém", address: "Lisbon" },
        },
        {
          type: "tool",
          name: "ask_user",
          args: {
            questions: [
              {
                id: "hotel",
                prompt: "Which stay?",
                options: [
                  { id: "a", label: "Hills Hotel Lisboa" },
                  { id: "skip", label: "Skip" },
                ],
              },
              { id: "start_time", prompt: "Start time?" },
              {
                id: "must_see",
                prompt: "Must-see?",
                multi: true,
                options: [{ id: "belem", label: "Torre de Belém" }],
              },
              { id: "other", prompt: "Anything else?" },
            ],
          },
        },
        { type: "stop" },
      ],
      _testGeocode: async () => okGeocode(38.7223, -9.1393, "Lisbon"),
      _testSearchPlaces: async () =>
        okCards([
          place({
            name: "Torre de Belém",
            provider: "GOOGLE_MAPS",
            lat: 38.6916,
            lng: -9.216,
            photo: "https://cdn.example.com/belem.jpg",
          }),
        ]),
    });

    expect(result.status).toBe("needs_input");
    const hotel = result.need_input?.questions.find((q) => q.id === "hotel");
    expect(hotel?.options?.map((o) => o.label)).toContain("Hills Hotel Lisboa");
    const mustSee = result.need_input?.questions.find((q) => q.id === "must_see");
    expect(mustSee?.options?.map((o) => o.label)).toContain("Torre de Belém");
  });

  it("should_route_lisbon_google_and_hangzhou_amap_when_providers_omitted", async () => {
    const lisbon = await resolveProviderStrategy(
      { location: "Lisbon", locale: "EN" },
      async () => ({ address: "Lisbon, Portugal", lat: 38.7223, lng: -9.1393 }),
    );
    expect(lisbon.searchProviders).toEqual(["GOOGLE_MAPS"]);

    const hangzhou = await resolveProviderStrategy(
      { location: "杭州", locale: "CN" },
      async () => ({ address: "杭州市, 中国", lat: 30.2741, lng: 120.1551 }),
    );
    expect(hangzhou.searchProviders).toEqual(["AMAP"]);

    const hongkong = await resolveProviderStrategy(
      { location: "Hong Kong", locale: "HK" },
      async () => ({ address: "Hong Kong", lat: 22.3193, lng: 114.1694 }),
    );
    expect(hongkong.searchProviders).toEqual(["GOOGLE_MAPS", "AMAP"]);
  });

  it("should_not_force_nominate_on_intake_when_scripted_search", async () => {
    const result = await planTrip({
      callerKey,
      city: "Lisbon",
      locale: "EN",
      numDays: 4,
      _testGeocode: async () => okGeocode(38.7223, -9.1393, "Lisbon"),
      _testSearchPlaces: async () =>
        okCards([
          place({
            name: "Torre de Belém",
            provider: "GOOGLE_MAPS",
            lat: 38.6916,
            lng: -9.216,
          }),
        ]),
      _testTurns: [
        { type: "tool", name: "geocode", args: { query: "Lisbon" } },
        { type: "tool", name: "search_places", args: { query: "Belém Tower" } },
        { type: "tool", name: "commit_trip", args: {} },
        { type: "stop" },
      ],
    });
    expect(result.tool_calls ?? []).not.toContain("nominate_must_see");
    expect(result.tool_calls).toContain("search_places");
    const labels =
      result.need_input?.questions.find((q) => q.id === "must_see")?.options?.map((o) => o.label) ??
      [];
    expect(labels).toContain("Torre de Belém");
  });

  it("should_allow_empty_must_see_chips_when_model_asks_without_search", async () => {
    const result = await planTrip({
      callerKey,
      city: "Lisbon",
      locale: "EN",
      numDays: 4,
      _testGeocode: async () => okGeocode(38.7223, -9.1393, "Lisbon"),
      _testSearchPlaces: async () => okCards([]),
      _testListPois: async () => [],
      _testTurns: [
        {
          type: "tool",
          name: "ask_user",
          args: {
            questions: [
              { id: "hotel", prompt: "Where will you stay?" },
              { id: "start_time", prompt: "Start time?" },
              { id: "must_see", prompt: "Must-sees?", multi: true },
              { id: "other", prompt: "Other?" },
            ],
          },
        },
        { type: "stop" },
      ],
    });
    expect(result.status).toBe("needs_input");
    expect(result.tool_calls ?? []).not.toContain("nominate_must_see");
    const mustSee = result.need_input?.questions.find((q) => q.id === "must_see");
    expect(mustSee).toBeTruthy();
    expect(mustSee?.options?.length ?? 0).toBe(0);
  });

  it("should_dedupe_leifeng_satellite_names_to_one_chip", async () => {
    const hz = { lat: 30.23, lng: 120.15 };
    const result = await planTrip({
      callerKey,
      city: "杭州",
      locale: "CN",
      numDays: 3,
      _testGeocode: async () => okGeocode(hz.lat, hz.lng, "杭州"),
      _testSearchPlaces: async () =>
        okCards([
          place({ name: "雷峰塔景区", provider: "AMAP", lat: hz.lat, lng: hz.lng, nativeId: "a" }),
          place({ name: "雷峰塔景区售票处", provider: "AMAP", lat: hz.lat, lng: hz.lng, nativeId: "b" }),
          place({ name: "雷峰塔重建记", provider: "AMAP", lat: hz.lat, lng: hz.lng, nativeId: "c" }),
        ]),
      _testTurns: [
        { type: "tool", name: "search_places", args: { query: "雷峰塔" } },
        { type: "tool", name: "commit_trip", args: {} },
        { type: "stop" },
      ],
    });
    const labels =
      result.need_input?.questions.find((q) => q.id === "must_see")?.options?.map((o) => o.label) ??
      [];
    const leifeng = labels.filter((n) => n.includes("雷峰"));
    expect(leifeng.length).toBe(1);
  });

  it("should_drop_ungrounded_nominated_names", async () => {
    const result = await planTrip({
      callerKey,
      city: "Lisbon",
      locale: "EN",
      numDays: 4,
      _testGeocode: async () => okGeocode(38.7223, -9.1393, "Lisbon"),
      _testSearchPlaces: async () => okCards([]),
      _testListPois: async () => [],
      _testTurns: [
        {
          type: "tool",
          name: "commit_trip",
          args: { names: ["Invented Castle"] },
        },
        { type: "stop" },
      ],
    });
    const labels =
      result.need_input?.questions.find((q) => q.id === "must_see")?.options?.map((o) => o.label) ??
      [];
    expect(labels).not.toContain("Invented Castle");
  });

  it("should_drop_cards_without_coordinates_from_must_see_chips", async () => {
    const noPin: PlaceCard = {
      provider: "GOOGLE_MAPS",
      name: "Ghost Landmark",
      category: "attraction",
      location: { lat: Number.NaN, lng: Number.NaN, crs: "WGS84" },
      sources: [
        {
          provider: "GOOGLE_MAPS",
          native_id: "ghost_1",
          deeplinks: {},
        },
      ],
    };
    const withPin = place({
      name: "Torre de Belém",
      provider: "GOOGLE_MAPS",
      lat: 38.6916,
      lng: -9.216,
    });
    const result = await planTrip({
      callerKey,
      city: "Lisbon",
      locale: "EN",
      numDays: 4,
      _testGeocode: async () => okGeocode(38.7223, -9.1393, "Lisbon"),
      _testSearchPlaces: async () => okCards([noPin, withPin]),
      _testTurns: [
        { type: "tool", name: "search_places", args: { query: "Lisbon" } },
        { type: "tool", name: "commit_trip", args: {} },
        { type: "stop" },
      ],
    });
    const labels =
      result.need_input?.questions.find((q) => q.id === "must_see")?.options?.map((o) => o.label) ??
      [];
    expect(labels).toContain("Torre de Belém");
    expect(labels).not.toContain("Ghost Landmark");
  });

  it("should_drop_boat_dock_satellite_from_must_see_chips", async () => {
    const hz = { lat: 30.25, lng: 120.15 };
    const dock = place({
      name: "西湖风景名胜区-手划船停靠点",
      provider: "AMAP",
      lat: hz.lat,
      lng: hz.lng,
      nativeId: "dock_hz",
    });
    dock.category = "景点";
    const bridge = place({
      name: "断桥残雪",
      provider: "AMAP",
      lat: hz.lat + 0.01,
      lng: hz.lng + 0.01,
      nativeId: "bridge_hz",
    });
    bridge.category = "attraction";
    const result = await planTrip({
      callerKey,
      city: "Hangzhou",
      locale: "CN",
      numDays: 3,
      _testGeocode: async () => okGeocode(hz.lat, hz.lng, "Hangzhou"),
      _testSearchPlaces: async () => okCards([dock, bridge]),
      _testTurns: [
        { type: "tool", name: "search_places", args: { query: "杭州" } },
        { type: "tool", name: "commit_trip", args: {} },
        { type: "stop" },
      ],
    });
    const labels =
      result.need_input?.questions.find((q) => q.id === "must_see")?.options?.map((o) => o.label) ??
      [];
    expect(labels).toContain("断桥残雪");
    expect(labels.some((n) => n.includes("停靠点") || n.includes("手划船"))).toBe(false);
  });

  it("should_reuse_existing_must_see_when_locale_changes", async () => {
    const tower = place({
      name: "Torre de Belém",
      provider: "GOOGLE_MAPS",
      lat: 38.6916,
      lng: -9.216,
    });
    tower.must_see = true;

    const first = await planTrip({
      callerKey,
      city: "Lisbon",
      locale: "CN",
      numDays: 4,
      _testGeocode: async () => okGeocode(38.7223, -9.1393, "Lisbon"),
      _testSearchPlaces: async () => okCards([tower]),
      _testTurns: [
        { type: "tool", name: "search_places", args: { query: "Lisbon" } },
        { type: "tool", name: "commit_trip", args: {} },
        { type: "stop" },
      ],
    });
    expect(first.tool_calls ?? []).not.toContain("nominate_must_see");
    expect(first.trip_id).toBeTruthy();
    const firstLabels =
      first.need_input?.questions.find((q) => q.id === "must_see")?.options?.map((o) => o.label) ??
      [];
    expect(firstLabels).toContain("Torre de Belém");

    const second = await planTrip({
      callerKey,
      city: "Lisbon",
      locale: "EN",
      numDays: 4,
      trip_id: first.trip_id,
      revision: first.revision,
      _testGeocode: async () => okGeocode(38.7223, -9.1393, "Lisbon"),
      _testSearchPlaces: async () => okCards([]),
      _testTurns: [
        { type: "tool", name: "commit_trip", args: {} },
        { type: "stop" },
      ],
    });
    expect(second.tool_calls ?? []).not.toContain("nominate_must_see");
    const secondLabels =
      second.need_input?.questions.find((q) => q.id === "must_see")?.options?.map((o) => o.label) ??
      [];
    expect(secondLabels).toContain("Torre de Belém");
  });
});
