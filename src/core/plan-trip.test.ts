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
});
