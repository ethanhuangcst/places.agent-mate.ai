/**
 * agent-poc-01 — plan_trip intake + must-see chips (fixture).
 * Checklist #1 / #5 / #8 / #25 / #28.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../db/client";
import { generateCallerSecret, hashPassword } from "./crypto";
import {
  buildFullLoopSystemPrompt,
  FULL_LOOP_STOP_TOOL_DESCRIPTION,
  planTrip,
  resolveHotelAnswer,
  skeletonPoolQueries,
} from "./plan-trip";
import type { PlanTripInput } from "./plan-trip";
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
      // ADR-069: committed candidates are pool cards — no must_see heat flag.
      expect(card.must_see).toBeUndefined();
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
      expect("must_see" in card).toBe(false);
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

  it("should_use_google_only_when_city_is_hong_kong", async () => {
    const strategy = await resolveProviderStrategy({
      location: "Hong Kong",
      near: { lat: 22.3193, lng: 114.1694 },
    });
    expect(strategy.searchProviders).toEqual(["GOOGLE_MAPS"]);

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
            name: "Hong Kong Museum of History",
            provider: "GOOGLE_MAPS",
            lat: 22.3019,
            lng: 114.1772,
            photo: "https://cdn.example.com/hk-museum.jpg",
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
    expect(providers.has("AMAP")).toBe(false);
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
        { type: "tool", name: "plan_next_stop", args: {} },
        { type: "tool", name: "plan_next_stop", args: {} },
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
                { name: "雷峰塔", kind: "attraction" as const },
                { name: "dinner", kind: "meal" as const, meal_slot: "dinner" as const },
              ],
            },
            {
              day_index: 3,
              day_theme: "返程",
              stops: [
                { name: "西湖大华饭店", kind: "stay" as const },
                { name: "西溪湿地", kind: "attraction" as const },
              ],
            },
          ],
        },
        candidates_slim: {
          places: [
            lingyin,
            place({
              name: "雷峰塔",
              provider: "AMAP",
              lat: 30.231,
              lng: 120.148,
              photo: "https://store.is.autonavi.com/leifeng.jpg",
              nativeId: "amap_leifeng",
            }),
            place({
              name: "西溪湿地",
              provider: "AMAP",
              lat: 30.2706,
              lng: 120.0631,
              photo: "https://store.is.autonavi.com/xixi.jpg",
              nativeId: "amap_xixi",
            }),
          ],
          restaurants: [],
        },
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
      "plan_next_stop",
      "plan_next_stop",
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
    expect(hongkong.searchProviders).toEqual(["GOOGLE_MAPS"]);
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

describe("MVP-T3 plan_trip skeleton_only (TC-T3-100)", () => {
  let callerKey = "";
  const prevVendor = process.env.PLACES_VENDOR_MODE;
  const prevQwen = process.env.QWEN_API_KEY;
  const prevOpenai = process.env.OPENAI_API_KEY;

  const skeletonFixture = {
    days: [
      {
        day_index: 1,
        day_theme: "Belém",
        stops: [
          { name: "Hills Hotel", kind: "stay" as const },
          { name: "Torre de Belém", kind: "attraction" as const },
        ],
      },
    ],
  };

  function baseT3() {
    return {
      callerKey,
      city: "Lisbon",
      locale: "EN" as const,
      numDays: 3,
      origin: { name: "Hills Hotel Lisboa" },
      pace: "medium" as const,
      budget: "mid",
      transit_preference: "transit_walk",
      trip_type: "couple",
      party_size: 2,
      bounds: { start: "2026-10-10", end: "2026-10-12" },
      start_time: "09:30",
      other: "prefer waterfront walks",
      // Thin fixture pool: answer expand_radius so TC-T3-100 reaches skeleton.
      answers: { expand_radius: "no" as const },
      skeleton_only: true as const,
      _testGeocode: async () => okGeocode(38.7223, -9.1393, "Lisbon"),
      _testSearchPlaces: async () =>
        okCards([
          place({
            name: "Torre de Belém",
            provider: "GOOGLE_MAPS" as const,
            lat: 38.6916,
            lng: -9.216,
            photo: "https://cdn.example.com/belem.jpg",
            nativeId: "ChIJbelem",
          }),
        ]),
      _testResolveStay: async () =>
        place({
          name: "Hills Hotel Lisboa",
          provider: "GOOGLE_MAPS" as const,
          lat: 38.73,
          lng: -9.14,
          photo: "https://cdn.example.com/hotel.jpg",
          nativeId: "ChIJhotel",
        }),
      _testMakeItinerary: async () => ({
        skeleton: skeletonFixture,
        candidates_slim: { places: [] as PlaceCard[], restaurants: [] as PlaceCard[] },
      }),
      _testPlanNextStopFill: async () => {
        throw new Error("plan_next_stop must not run on skeleton_only");
      },
    };
  }

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
        name: "plan-trip-t3",
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

  it("should_return_trip_id_and_persist_takeoff_bounds_when_skeleton_only (TC-T3-100-01)", async () => {
    const result = await planTrip(baseT3());
    expect(result.status).toBe("ready");
    expect(result.trip_id.length).toBeGreaterThan(0);

    const fetched = await fetchTripDetails({
      callerKey,
      trip_id: result.trip_id,
      fields: ["constraints"],
    });
    const constraints = (fetched.data.constraints ?? {}) as Record<string, unknown>;
    expect(constraints.party_size ?? constraints.partySize).toBe(2);
    expect(constraints.start_time ?? constraints.startTime).toBe("09:30");
    expect(constraints.other).toBe("prefer waterfront walks");
    expect(
      (constraints.origin as { name?: string } | undefined)?.name ?? constraints.origin_name,
    ).toMatch(/Hills Hotel/);
  });

  it("should_stop_after_skeleton_without_plan_next_stop (TC-T3-100-02)", async () => {
    const result = await planTrip(baseT3());
    expect(result.status).toBe("ready");
    expect(result.itinerary?.skeleton).toBeTruthy();
    expect(result.itinerary?.filledStops ?? []).toEqual([]);
    expect(result.tool_calls ?? []).toContain("make_itinerary");
    expect(result.tool_calls ?? []).not.toContain("plan_next_stop");
  });

  it("should_not_return_fixed_four_need_input_when_skeleton_only (TC-T3-100-03)", async () => {
    const result = await planTrip(baseT3());
    expect(result.status).not.toBe("needs_input");
    const ids = result.need_input?.questions?.map((q) => q.id) ?? [];
    expect(ids).not.toContain("hotel");
    expect(ids).not.toContain("must_see");
  });

  it("should_emit_trip_created_generating_ready_phases (TC-T3-100-04)", async () => {
    const result = await planTrip(baseT3());
    const names = (result.phases ?? []).map((p) => p.phase);
    expect(names).toEqual(
      expect.arrayContaining(["trip_created", "skeleton_generating", "skeleton_ready"]),
    );
  });

  it("should_fetch_ordered_skeleton_days_after_ready (TC-T3-100-05)", async () => {
    const result = await planTrip(baseT3());
    const fetched = await fetchTripDetails({
      callerKey,
      trip_id: result.trip_id,
      fields: ["skeleton", "constraints"],
    });
    const skeleton = fetched.data.skeleton as {
      days?: Array<{ day_index: number; stops?: unknown[] }>;
    };
    expect(skeleton.days?.length).toBeGreaterThanOrEqual(1);
    expect(skeleton.days?.[0]?.day_index).toBe(1);
    expect((skeleton.days?.[0]?.stops ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it("should_list_city_pool_honestly_without_invented_pois (TC-T3-100-06)", async () => {
    await planTrip(baseT3());
    const listed = await listPoisForDestination({
      city: "Lisbon",
      lat: 38.7223,
      lng: -9.1393,
    });
    for (const card of listed) {
      expect(card.name.trim().length).toBeGreaterThan(0);
      expect(card.name).not.toMatch(/^fixture_/i);
    }
  });

  it("should_fail_honestly_without_fake_filled_when_make_throws (TC-T3-100-07)", async () => {
    const result = await planTrip({
      ...baseT3(),
      _testMakeItinerary: async () => {
        throw new Error("skeleton boom");
      },
    });
    expect(result.status).toBe("failed");
    expect(result.itinerary?.filledStops?.length ?? 0).toBe(0);
    expect(JSON.stringify(result)).not.toMatch(/sk-|api[_-]?key|secret/i);
  });

  it("should_ready_skeleton_when_origin_omitted (takeoff skip hotel)", async () => {
    const { origin: _omit, ...rest } = baseT3();
    const result = await planTrip({
      ...rest,
      city: "Xi'an",
      trip_type: "探访历史",
      _testGeocode: async () => okGeocode(34.3416, 108.9398, "Xi'an"),
      _testMakeItinerary: async (mi) => {
        expect(mi.origin?.name).toBeUndefined();
        return {
          skeleton: {
            days: [
              {
                day_index: 1,
                day_theme: "城墙",
                stops: [{ name: "西安城墙", kind: "attraction" as const }],
              },
            ],
          },
          candidates_slim: { places: [], restaurants: [] },
        };
      },
    });
    expect(result.status).toBe("ready");
    expect(result.itinerary?.skeleton).toBeTruthy();
  });

  it("should_ready_skeleton_with_name_only_stay_when_resolve_stay_misses", async () => {
    const result = await planTrip({
      ...baseT3(),
      city: "Xi'an",
      origin: { name: "随便一家客栈" },
      trip_type: "探访历史",
      _testGeocode: async () => okGeocode(34.3416, 108.9398, "Xi'an"),
      _testResolveStay: async () => null,
      _testMakeItinerary: async (mi) => {
        expect(mi.origin?.name).toBe("随便一家客栈");
        return {
          skeleton: skeletonFixture,
          candidates_slim: { places: [], restaurants: [] },
        };
      },
    });
    expect(result.status).toBe("ready");
  });
});

describe("MVP-T3++ LLM OptA discovery (TC-T3-110a)", () => {
  let callerKey = "";
  const prevVendor = process.env.PLACES_VENDOR_MODE;
  const prevQwen = process.env.QWEN_API_KEY;
  const prevOpenai = process.env.OPENAI_API_KEY;

  const skeletonFixture = {
    days: [
      {
        day_index: 1,
        day_theme: "Belém",
        stops: [
          { name: "Hills Hotel", kind: "stay" as const },
          { name: "Torre de Belém", kind: "attraction" as const },
        ],
      },
    ],
  };

  function nominateChat(names: string[]) {
    return async () =>
      ({
        choices: [{ message: { content: JSON.stringify(names) } }],
      }) as never;
  }

  function base110a(searchQueries: string[]): PlanTripInput {
    return {
      callerKey,
      city: "Lisbon",
      locale: "EN",
      numDays: 3,
      origin: { name: "Hills Hotel Lisboa" },
      pace: "medium",
      budget: "mid",
      transit_preference: "transit_walk",
      trip_type: "couple",
      party_size: 2,
      bounds: { start: "2026-10-10", end: "2026-10-12" },
      start_time: "09:30",
      other: "prefer waterfront walks",
      // Thin fixture pool: answer expand_radius so discovery tests reach make_itinerary.
      answers: { expand_radius: "no" },
      skeleton_only: true,
      _testGeocode: async () => okGeocode(38.7223, -9.1393, "Lisbon"),
      _testNominateChatCreate: nominateChat(["Torre de Belém", "Mosteiro dos Jerónimos"]),
      _testSearchPlaces: async (input) => {
        if (input.query) searchQueries.push(input.query);
        const name = input.query?.includes("Mosteiro")
          ? "Mosteiro dos Jerónimos"
          : "Torre de Belém";
        const nativeId = name.startsWith("Mosteiro") ? "ChIJjer" : "ChIJbelem";
        return okCards([
          place({
            name,
            provider: "GOOGLE_MAPS",
            lat: 38.69,
            lng: -9.21,
            photo: "https://cdn.example.com/p.jpg",
            nativeId,
          }),
        ]);
      },
      _testResolveStay: async () =>
        place({
          name: "Hills Hotel Lisboa",
          provider: "GOOGLE_MAPS",
          lat: 38.73,
          lng: -9.14,
          photo: "https://cdn.example.com/hotel.jpg",
          nativeId: "ChIJhotel",
        }),
      _testMakeItinerary: async () => ({
        skeleton: skeletonFixture,
        candidates_slim: { places: [] as PlaceCard[], restaurants: [] as PlaceCard[] },
      }),
      _testPlanNextStopFill: async () => {
        throw new Error("plan_next_stop must not run on skeleton_only");
      },
    };
  }

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
        name: "plan-trip-110a",
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

  it("should_not_call_template_skeletonPoolQueries_on_skeleton_path (TC-T3-110a-02)", async () => {
    const searchQueries: string[] = [];
    await planTrip(base110a(searchQueries));
    const templates = skeletonPoolQueries("Lisbon", "EN", {
      trip_type: "couple",
      other: "prefer waterfront walks",
    });
    for (const q of templates) {
      expect(searchQueries).not.toContain(q);
    }
  });

  it("should_nominate_clean_ground_and_skip_search_on_registry_hit (TC-T3-110a-03)", async () => {
    await upsertEligiblePois(
      [
        place({
          name: "Torre de Belém",
          provider: "GOOGLE_MAPS",
          lat: 38.6916,
          lng: -9.216,
          photo: "https://cdn.example.com/belem.jpg",
          nativeId: "ChIJbelem",
        }),
      ],
      { city: "Lisbon", lat: 38.7223, lng: -9.1393 },
    );
    const searchQueries: string[] = [];
    let makePlaces: string[] = [];
    await planTrip({
      ...base110a(searchQueries),
      _testMakeItinerary: async (mi) => {
        makePlaces = mi.candidates.places.map((p) => p.name);
        return {
          skeleton: skeletonFixture,
          candidates_slim: {
            places: mi.candidates.places,
            restaurants: [],
          },
        };
      },
    });
    expect(searchQueries.some((q) => /Torre|Belém|Belem/i.test(q))).toBe(false);
    expect(searchQueries.some((q) => /Mosteiro|Jerónimos|Jeronimos/i.test(q))).toBe(true);
    expect(makePlaces).toEqual(
      expect.arrayContaining(["Torre de Belém", "Mosteiro dos Jerónimos"]),
    );
  });

  it("should_write_only_nominated_grounded_candidates_not_whole_city_registry (TC-T3-110a-06)", async () => {
    await upsertEligiblePois(
      [
        place({
          name: "Castelo de São Jorge",
          provider: "GOOGLE_MAPS",
          lat: 38.7139,
          lng: -9.1334,
          photo: "https://cdn.example.com/castelo.jpg",
          nativeId: "ChIJcastelo",
        }),
        place({
          name: "Torre de Belém",
          provider: "GOOGLE_MAPS",
          lat: 38.6916,
          lng: -9.216,
          photo: "https://cdn.example.com/belem.jpg",
          nativeId: "ChIJbelem",
        }),
      ],
      { city: "Lisbon", lat: 38.7223, lng: -9.1393 },
    );
    const searchQueries: string[] = [];
    let makePlaces: string[] = [];
    const result = await planTrip({
      ...base110a(searchQueries),
      _testNominateChatCreate: nominateChat(["Torre de Belém"]),
      _testMakeItinerary: async (mi) => {
        makePlaces = mi.candidates.places.map((p) => p.name);
        return {
          skeleton: skeletonFixture,
          candidates_slim: {
            places: mi.candidates.places,
            restaurants: [],
          },
        };
      },
    });
    expect(result.status).toBe("ready");
    expect(makePlaces).toContain("Torre de Belém");
    expect(makePlaces).not.toContain("Castelo de São Jorge");
    const doc = await fetchTripDetails({
      callerKey,
      trip_id: result.trip_id,
      fields: ["candidates"],
    });
    const places = (
      (doc.data.candidates as { places?: PlaceCard[] } | undefined)?.places ?? []
    ).map((p) => p.name);
    expect(places).toContain("Torre de Belém");
    expect(places).not.toContain("Castelo de São Jorge");
  });
});

describe("MVP-T3++Q expand radius need_input (TC-T3-110d)", () => {
  let callerKey = "";
  const prevVendor = process.env.PLACES_VENDOR_MODE;
  const prevQwen = process.env.QWEN_API_KEY;
  const prevOpenai = process.env.OPENAI_API_KEY;

  const skeletonFixture = {
    days: [
      {
        day_index: 1,
        day_theme: "Local",
        stops: [
          { name: "Hills Hotel", kind: "stay" as const },
          { name: "Torre de Belém", kind: "attraction" as const },
        ],
      },
    ],
  };

  /** Lisbon ~38.72,-9.14; ~100km NE is beyond CITY_RADIUS_KM (80) but within 160. */
  function localCard() {
    return place({
      name: "Torre de Belém",
      provider: "GOOGLE_MAPS",
      lat: 38.6916,
      lng: -9.216,
      photo: "https://cdn.example.com/belem.jpg",
      nativeId: "ChIJbelem",
    });
  }

  function nearbyCard(name: string, nativeId: string) {
    return place({
      name,
      provider: "GOOGLE_MAPS",
      lat: 39.5,
      lng: -8.9,
      photo: "https://cdn.example.com/nearby.jpg",
      nativeId,
    });
  }

  function base110d(overrides?: Partial<PlanTripInput>): PlanTripInput {
    return {
      callerKey,
      city: "Lisbon",
      locale: "EN",
      numDays: 3,
      origin: { name: "Hills Hotel Lisboa" },
      pace: "medium",
      budget: "mid",
      transit_preference: "transit_walk",
      trip_type: "couple",
      party_size: 2,
      bounds: { start: "2026-10-10", end: "2026-10-12" },
      start_time: "09:30",
      other: "prefer waterfront walks",
      skeleton_only: true,
      _testGeocode: async () => okGeocode(38.7223, -9.1393, "Lisbon"),
      _testDiscoverPlacesForSkeleton: async () => [
        localCard(),
        nearbyCard("Óbidos Castle", "ChIJobidos"),
        nearbyCard("Nazaré Beach", "ChIJnazare"),
      ],
      _testResolveStay: async () =>
        place({
          name: "Hills Hotel Lisboa",
          provider: "GOOGLE_MAPS",
          lat: 38.73,
          lng: -9.14,
          photo: "https://cdn.example.com/hotel.jpg",
          nativeId: "ChIJhotel",
        }),
      _testMakeItinerary: async () => ({
        skeleton: skeletonFixture,
        candidates_slim: { places: [] as PlaceCard[], restaurants: [] as PlaceCard[] },
      }),
      _testPlanNextStopFill: async () => {
        throw new Error("plan_next_stop must not run on expand_radius gate");
      },
      ...overrides,
    };
  }

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
        name: "plan-trip-110d",
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

  it("should_ask_expand_radius_when_thin_even_without_expandable_pois", async () => {
    // 江阴-style: local attractions < days and nothing beyond local radius.
    const result = await planTrip({
      ...base110d({
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
          ]),
      }),
    });
    expect(result.status).toBe("needs_input");
    expect(result.need_input?.questions.some((q) => q.id === "expand_radius")).toBe(true);
  });

  it("should_not_ask_expand_for_hangzhou_amap_titles_without_category", async () => {
    // Hangzhou classic names often have no AMAP category and fail ATTRACTION_ALLOW
    // (苏堤 / 灵隐寺 / 雷峰塔景区) — must still count as local attractions.
    const hangzhouLocal = (name: string, nativeId: string, lat: number, lng: number): PlaceCard => ({
      provider: "AMAP",
      name,
      location: { lat, lng, crs: "WGS84" },
      sources: [{ provider: "AMAP", native_id: nativeId, deeplinks: {} }],
    });
    const result = await planTrip({
      ...base110d({
        city: "杭州",
        locale: "CN",
        numDays: 3,
        _testGeocode: async () => okGeocode(30.2741, 120.1551, "杭州"),
        _testDiscoverPlacesForSkeleton: async () => [
          hangzhouLocal("苏堤", "B0FF苏堤", 30.2403, 120.1393),
          hangzhouLocal("灵隐寺", "B0FF灵隐", 30.2408, 120.1014),
          hangzhouLocal("雷峰塔景区", "B0FF雷峰", 30.2309, 120.1488),
          hangzhouLocal("三潭印月", "B0FF三潭", 30.2388, 120.1454),
        ],
      }),
    });
    expect(result.need_input?.questions?.some((q) => q.id === "expand_radius")).toBeFalsy();
    expect(result.status).toBe("ready");
  });

  it("should_return_needs_input_expand_radius_when_local_pool_scarce (TC-T3-110d-01)", async () => {
    const result = await planTrip(base110d());
    expect(result.status).toBe("needs_input");
    const q = result.need_input?.questions.find((x) => x.id === "expand_radius");
    expect(q).toBeDefined();
    expect(q?.options?.map((o) => o.id)).toEqual(["yes", "no"]);
    // Nearby-city POIs must not be auto-merged into candidates before confirm.
    const doc = await fetchTripDetails({
      callerKey,
      trip_id: result.trip_id,
      fields: ["candidates"],
    });
    const names = (
      (doc.data.candidates as { places?: PlaceCard[] } | undefined)?.places ?? []
    ).map((p) => p.name);
    expect(names).toContain("Torre de Belém");
    expect(names).not.toContain("Óbidos Castle");
    expect(names).not.toContain("Nazaré Beach");
  });

  it("should_include_expanded_pois_when_expand_radius_affirmed", async () => {
    let makeNames: string[] = [];
    const first = await planTrip(base110d());
    expect(first.status).toBe("needs_input");

    const second = await planTrip(
      base110d({
        trip_id: first.trip_id,
        revision: first.revision,
        answers: { expand_radius: "yes" },
        _testMakeItinerary: async (mi) => {
          makeNames = mi.candidates.places.map((p) => p.name);
          return {
            skeleton: skeletonFixture,
            candidates_slim: {
              places: mi.candidates.places,
              restaurants: [],
            },
          };
        },
      }),
    );
    expect(second.status).toBe("ready");
    expect(makeNames).toEqual(
      expect.arrayContaining(["Torre de Belém", "Óbidos Castle", "Nazaré Beach"]),
    );
  });

  it("should_keep_local_only_and_complete_when_expand_radius_declined", async () => {
    let makeNames: string[] = [];
    const first = await planTrip(base110d());
    expect(first.status).toBe("needs_input");

    const second = await planTrip(
      base110d({
        trip_id: first.trip_id,
        revision: first.revision,
        answers: { expand_radius: "no" },
        _testMakeItinerary: async (mi) => {
          makeNames = mi.candidates.places.map((p) => p.name);
          return {
            skeleton: {
              days: skeletonFixture.days,
              deviations: [
                {
                  field: "attraction_pool",
                  expected: ">= 3 attractions for 3 days",
                  actual: "1",
                  reason: "attraction_pool_thin",
                },
              ],
            },
            candidates_slim: {
              places: mi.candidates.places,
              restaurants: [],
            },
          };
        },
      }),
    );
    expect(second.status).toBe("ready");
    expect(makeNames).toContain("Torre de Belém");
    expect(makeNames).not.toContain("Óbidos Castle");
    expect(makeNames).not.toContain("Nazaré Beach");
    expect(second.itinerary?.skeleton).toBeTruthy();
  });
});

describe("MVP-T5 S1 A+B full-loop stop policy (TD-3)", () => {
  it("should_require_trip_complete_before_stop_in_tool_description", () => {
    expect(FULL_LOOP_STOP_TOOL_DESCRIPTION).toMatch(/trip_complete/i);
    expect(FULL_LOOP_STOP_TOOL_DESCRIPTION).toMatch(/partial/i);
    expect(FULL_LOOP_STOP_TOOL_DESCRIPTION).not.toBe(
      "Stop when the itinerary is filled.",
    );
  });

  it("should_forbid_early_stop_in_full_loop_system_prompt", () => {
    const prompt = buildFullLoopSystemPrompt(
      {
        city: "Shanghai",
        numDays: 3,
        origin: { name: "Hotel", lat: 31.2, lng: 121.5 },
        locale: "EN",
      } as PlanTripInput,
      "EN",
    );
    expect(prompt).toMatch(/Never stop early/i);
    expect(prompt).toMatch(/stop only after trip_complete/i);
    expect(prompt).not.toMatch(/Stop when filled/);
    expect(prompt).toMatch(/unfilled skeleton stops remain/i);
  });
});

describe("MVP-T5 TD-4 HTTP answers.hotel", () => {
  let callerKey = "";
  const prevVendor = process.env.PLACES_VENDOR_MODE;
  const prevQwen = process.env.QWEN_API_KEY;
  const prevOpenai = process.env.OPENAI_API_KEY;
  const prevLegacy = process.env.PLAN_TRIP_LEGACY_FULL_LOOP;

  const skeletonFixture = {
    days: [
      {
        day_index: 1,
        day_theme: "History",
        stops: [
          { name: "Xi'an Hotel", kind: "stay" as const },
          { name: "Terracotta Warriors", kind: "attraction" as const },
        ],
      },
    ],
  };

  function baseXian(overrides?: Partial<PlanTripInput>): PlanTripInput {
    const warriors = place({
      name: "兵马俑",
      provider: "AMAP",
      lat: 34.384,
      lng: 109.273,
      photo: "https://cdn.example.com/bw.jpg",
      nativeId: "amap-bw",
    });
    const wall = place({
      name: "西安城墙",
      provider: "AMAP",
      lat: 34.266,
      lng: 108.943,
      photo: "https://cdn.example.com/wall.jpg",
      nativeId: "amap-wall",
    });
    const bell = place({
      name: "钟楼",
      provider: "AMAP",
      lat: 34.261,
      lng: 108.942,
      photo: "https://cdn.example.com/bell.jpg",
      nativeId: "amap-bell",
    });
    return {
      callerKey,
      city: "西安",
      locale: "CN",
      numDays: 3,
      pace: "tight",
      budget: "mid",
      transit_preference: "transit_walk",
      trip_type: "city",
      party_size: 3,
      bounds: { start: "2026-09-20", end: "2026-09-22" },
      start_time: "09:00",
      other: "探访历史",
      // no origin — triggers hotel need_input
      _testGeocode: async () => okGeocode(34.3416, 108.9398, "西安"),
      _testSearchPlaces: async () => okCards([warriors, wall, bell]),
      _testDiscoverPlacesForSkeleton: async () => [warriors, wall, bell],
      _testMakeItinerary: async () => ({
        skeleton: skeletonFixture,
        candidates_slim: {
          places: [warriors, wall, bell],
          restaurants: [],
        },
      }),
      _testResolveStay: async () =>
        place({
          name: "西安钟楼饭店",
          provider: "AMAP",
          lat: 34.26,
          lng: 108.94,
          nativeId: "amap-hotel",
        }),
      _testPlanNextStopFill: async (fillInput) => ({
        next_stop: {
          name: fillInput.next_stop.name,
          location: {
            lat: fillInput.next_stop.lat ?? 34.26,
            lng: fillInput.next_stop.lng ?? 108.94,
            crs: "WGS84" as const,
          },
        },
        legs: [],
        transit_outcome: "heuristic" as const,
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
            end: "11:00",
          },
          legs_to_here: [],
          transit_outcome: "heuristic" as const,
          notes: [] as string[],
        },
        day_stops_patch: null,
        trip_complete: false,
      }),
      ...overrides,
    };
  }

  beforeEach(async () => {
    process.env.PLACES_VENDOR_MODE = "fixture";
    process.env.PLAN_TRIP_LEGACY_FULL_LOOP = "1";
    delete process.env.QWEN_API_KEY;
    delete process.env.OPENAI_API_KEY;
    resetPoiRegistryStoreForTests();
    setPoiRegistryStore(createMemoryPoiRegistryStore());
    await prisma.trip.deleteMany();
    await prisma.callerApiKey.deleteMany();
    clearTripMemoryForTests();
    const generated = generateCallerSecret();
    const row = await prisma.callerApiKey.create({
      data: {
        name: "plan-trip-td4",
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
    if (prevLegacy === undefined) delete process.env.PLAN_TRIP_LEGACY_FULL_LOOP;
    else process.env.PLAN_TRIP_LEGACY_FULL_LOOP = prevLegacy;
  });

  it("should_parse_hotel_answer_name_and_skip", () => {
    expect(resolveHotelAnswer(undefined).kind).toBe("unanswered");
    expect(resolveHotelAnswer({ hotel: "西安钟楼饭店" })).toEqual({
      kind: "name",
      name: "西安钟楼饭店",
    });
    expect(resolveHotelAnswer({ hotel: "skip" }).kind).toBe("skip");
    expect(resolveHotelAnswer({ hotel: "" }).kind).toBe("skip");
  });

  it("should_ask_hotel_when_origin_missing_on_full_loop", async () => {
    const result = await planTrip(baseXian());
    expect(result.status).toBe("needs_input");
    expect(result.need_input?.questions.some((q) => q.id === "hotel")).toBe(true);
  });

  it("should_reach_skeleton_when_hotel_name_answered", async () => {
    const first = await planTrip(baseXian());
    expect(first.status).toBe("needs_input");
    const second = await planTrip(
      baseXian({
        trip_id: first.trip_id,
        answers: { hotel: "西安钟楼饭店", expand_radius: "no" },
        _testFullLoopTurns: [
          { type: "tool", name: "resolve_origin_stay", args: {} },
          { type: "tool", name: "make_itinerary", args: {} },
          { type: "tool", name: "plan_next_stop", args: {} },
          { type: "tool", name: "commit_artifacts", args: {} },
          { type: "stop" },
        ],
        _testTravelTips: async () =>
          ({ prose: "tips", cards: [] }) as never,
      }),
    );
    expect(second.need_input?.questions.some((q) => q.id === "hotel")).not.toBe(true);
    expect(["ready", "failed"]).toContain(second.status);
    // Hotel gate cleared; skeleton and/or filled path ran (not re-asking hotel).
    if (second.status === "ready") {
      expect(
        (second.itinerary?.skeleton?.days?.length ?? 0) > 0 ||
          (second.itinerary?.filledStops?.length ?? 0) > 0,
      ).toBe(true);
    }
  });

  it("should_reach_skeleton_without_origin_when_hotel_skipped", async () => {
    const first = await planTrip(baseXian());
    expect(first.status).toBe("needs_input");
    const second = await planTrip(
      baseXian({
        trip_id: first.trip_id,
        answers: { hotel: "skip", expand_radius: "no" },
        _testFullLoopTurns: [
          { type: "tool", name: "make_itinerary", args: {} },
          { type: "stop" },
        ],
      }),
    );
    expect(second.status).toBe("ready");
    expect(second.itinerary?.skeleton).toBeTruthy();
    expect(second.itinerary?.filledStops?.length ?? 0).toBe(0);
    expect(second.need_input?.questions.some((q) => q.id === "hotel")).not.toBe(true);
  });
});

describe("MVP-T5 TD-5 resolve_origin_stay cross-script / once-guard", () => {
  let callerKey = "";
  const prevVendor = process.env.PLACES_VENDOR_MODE;
  const prevQwen = process.env.QWEN_API_KEY;
  const prevOpenai = process.env.OPENAI_API_KEY;
  const prevLegacy = process.env.PLAN_TRIP_LEGACY_FULL_LOOP;

  beforeEach(async () => {
    process.env.PLACES_VENDOR_MODE = "fixture";
    delete process.env.PLAN_TRIP_LEGACY_FULL_LOOP;
    delete process.env.QWEN_API_KEY;
    delete process.env.OPENAI_API_KEY;
    resetPoiRegistryStoreForTests();
    setPoiRegistryStore(createMemoryPoiRegistryStore());
    await prisma.trip.deleteMany();
    await prisma.callerApiKey.deleteMany();
    clearTripMemoryForTests();
    const generated = generateCallerSecret();
    const row = await prisma.callerApiKey.create({
      data: {
        name: "plan-trip-td5",
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
    if (prevLegacy === undefined) delete process.env.PLAN_TRIP_LEGACY_FULL_LOOP;
    else process.env.PLAN_TRIP_LEGACY_FULL_LOOP = prevLegacy;
  });

  it("should_proceed_with_name_only_origin_when_resolve_stay_null", async () => {
    let resolveCalls = 0;
    const akihabara = place({
      name: "秋叶原",
      provider: "GOOGLE_MAPS",
      lat: 35.698,
      lng: 139.773,
      photo: "https://cdn.example.com/aki.jpg",
      nativeId: "g-aki",
    });
    const result = await planTrip({
      callerKey,
      city: "东京",
      locale: "CN",
      numDays: 1,
      origin: { name: "Hotel Monterey Lasoeur Ginza" },
      pace: "tight",
      budget: "mid",
      transit_preference: "transit_walk",
      trip_type: "solo",
      party_size: 1,
      bounds: { start: "2026-09-20", end: "2026-09-20" },
      start_time: "08:00",
      _testGeocode: async () => okGeocode(35.68, 139.76, "东京"),
      _testSearchPlaces: async () => okCards([akihabara]),
      _testDiscoverPlacesForSkeleton: async () => [akihabara],
      _testResolveStay: async () => {
        resolveCalls += 1;
        return null;
      },
      _testMakeItinerary: async () => ({
        skeleton: {
          days: [
            {
              day_index: 1,
              day_theme: "Anime",
              stops: [
                { name: "Hotel Monterey Lasoeur Ginza", kind: "stay" as const },
                { name: "秋叶原", kind: "attraction" as const },
              ],
            },
          ],
        },
        candidates_slim: { places: [akihabara], restaurants: [] },
      }),
      _testPlanNextStopFill: async (fillInput) => ({
        next_stop: {
          name: fillInput.next_stop.name,
          location: {
            lat: fillInput.next_stop.lat ?? 35.68,
            lng: fillInput.next_stop.lng ?? 139.76,
            crs: "WGS84" as const,
          },
        },
        legs: [],
        transit_outcome: "heuristic" as const,
        single_mode: true,
        stop_display: {
          stop: {
            name: fillInput.next_stop.name,
            kind: fillInput.next_stop.kind ?? "attraction",
            card: null,
            deeplinks: {},
          },
          slot: { start: fillInput.time_from ?? "09:00", end: "11:00" },
          legs_to_here: [],
          transit_outcome: "heuristic" as const,
          notes: [] as string[],
        },
        day_stops_patch: null,
        trip_complete: fillInput.next_stop.name === "秋叶原",
      }),
      _testTravelTips: async () => ({ prose: "tips", cards: [] }) as never,
      _testFullLoopTurns: [
        { type: "tool", name: "resolve_origin_stay", args: {} },
        { type: "tool", name: "resolve_origin_stay", args: {} },
        { type: "tool", name: "make_itinerary", args: {} },
        { type: "tool", name: "plan_next_stop", args: {} },
        { type: "tool", name: "plan_next_stop", args: {} },
        { type: "tool", name: "commit_artifacts", args: {} },
        { type: "stop" },
      ],
    });
    expect(result.status).toBe("ready");
    expect(resolveCalls).toBe(1);
    expect(result.itinerary?.skeleton).toBeTruthy();
    expect(result.tool_calls?.filter((t) => t === "resolve_origin_stay").length).toBe(2);
  });
});
