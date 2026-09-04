import { describe, it, expect } from "vitest";
import {
  LlmItinerarySchema,
  validateItinerary,
  validateStationTiming,
  buildUserMessage,
  withAbortTimeout,
  callItineraryLlmWithValidationRetry,
  slimArrangeCandidate,
  slimArrangeCandidates,
  slimArrangeDayResultForMcp,
  normalizePlaceSources,
  arrangeDay,
  buildDayTripSearchQueries,
  type LlmItineraryOutput,
} from "./itinerary-planner";
import { type PlaceCard } from "./types";

const validOutput: LlmItineraryOutput = {
  days: [
    {
      day_index: 1,
      date: "2026-08-25",
      blocks: [
        {
          name: "上海博物馆",
          type: "attraction",
          start_time: "10:00",
          duration_min: 90,
          reason: "上海最著名的博物馆",
        },
        {
          name: "南翔小笼",
          type: "lunch",
          start_time: "12:00",
          duration_min: 60,
          reason: "正宗小笼包",
          alternatives: [{ name: "绿波廊", reason: "老字号餐厅" }],
        },
      ],
    },
  ],
};

const candidates = new Set(["上海博物馆", "南翔小笼", "绿波廊", "豫园", "外滩"]);

describe("LlmItinerarySchema", () => {
  it("TC-M6-IT04: should pass for valid output", () => {
    const result = LlmItinerarySchema.safeParse(validOutput);
    expect(result.success).toBe(true);
  });

  it("TC-M6-IT02: should require reason field", () => {
    const noReason = {
      days: [{
        day_index: 1,
        blocks: [{ name: "X", type: "attraction", start_time: "10:00", duration_min: 90 }],
      }],
    };
    const result = LlmItinerarySchema.safeParse(noReason);
    expect(result.success).toBe(false);
  });

  it("TC-M6-IT03: should require duration_min", () => {
    const noDuration = {
      days: [{
        day_index: 1,
        blocks: [{ name: "X", type: "attraction", start_time: "10:00", reason: "good" }],
      }],
    };
    const result = LlmItinerarySchema.safeParse(noDuration);
    expect(result.success).toBe(false);
  });

  it("TC-M6-IT05: should reject invalid start_time format", () => {
    const badTime = {
      days: [{
        day_index: 1,
        blocks: [{ name: "X", type: "attraction", start_time: "10am", duration_min: 90, reason: "ok" }],
      }],
    };
    const result = LlmItinerarySchema.safeParse(badTime);
    expect(result.success).toBe(false);
  });

  it("should accept from_origin and to_destination", () => {
    const withTransport = {
      ...validOutput,
      days: [{
        ...validOutput.days[0],
        from_origin: { transport: "metro", duration_min: 25, depart_time: "09:30" },
        to_destination: { transport: "taxi", duration_min: 40, arrive_time: "18:30" },
      }],
    };
    const result = LlmItinerarySchema.safeParse(withTransport);
    expect(result.success).toBe(true);
  });

  it("should accept output without from_origin (no origin provided)", () => {
    const result = LlmItinerarySchema.safeParse(validOutput);
    expect(result.success).toBe(true);
    expect(validOutput.days[0].from_origin).toBeUndefined();
  });
});

describe("validateItinerary", () => {
  it("TC-M6-IT07: should return no errors for valid output", () => {
    const errors = validateItinerary(validOutput, candidates, 5);
    expect(errors).toHaveLength(0);
  });

  it("TC-M6-IT07b: should detect invented place name", () => {
    const invented: LlmItineraryOutput = {
      days: [{
        day_index: 1,
        blocks: [{
          name: "不存在的餐厅",
          type: "lunch",
          start_time: "12:00",
          duration_min: 60,
          reason: "虚构的",
        }],
      }],
    };
    const errors = validateItinerary(invented, candidates, 5);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toContain("not found in candidate");
  });

  it("TC-M6-IT08: should detect pace limit exceeded", () => {
    const tooMany: LlmItineraryOutput = {
      days: [{
        day_index: 1,
        blocks: Array.from({ length: 7 }, (_, i) => ({
          name: [...candidates][i % candidates.size],
          type: "attraction" as const,
          start_time: `${10 + i}:00`,
          duration_min: 60,
          reason: "ok",
        })),
      }],
    };
    const errors = validateItinerary(tooMany, candidates, 5);
    expect(errors.some((e) => e.message.includes("Too many blocks"))).toBe(true);
  });

  it("should_reject_duplicate_place_names_across_days", () => {
    const dup: LlmItineraryOutput = {
      days: [
        {
          day_index: 1,
          blocks: [
            {
              name: "上海博物馆",
              type: "attraction",
              start_time: "10:00",
              duration_min: 90,
              reason: "day1",
            },
          ],
        },
        {
          day_index: 2,
          blocks: [
            {
              name: "上海博物馆",
              type: "attraction",
              start_time: "10:00",
              duration_min: 90,
              reason: "day2",
            },
          ],
        },
      ],
    };
    const errors = validateItinerary(dup, candidates, 5);
    expect(errors.some((e) => e.message.includes("reused across days"))).toBe(true);
  });

  it("should_reject_medium_day_ending_before_16", () => {
    const short: LlmItineraryOutput = {
      days: [
        {
          day_index: 1,
          blocks: [
            {
              name: "上海博物馆",
              type: "attraction",
              start_time: "10:00",
              duration_min: 90,
              reason: "ok",
            },
            {
              name: "南翔小笼",
              type: "lunch",
              start_time: "12:00",
              duration_min: 60,
              reason: "ok",
            },
          ],
        },
      ],
    };
    const errors = validateItinerary(short, candidates, 5, "medium");
    expect(errors.some((e) => e.message.includes("before 16:00"))).toBe(true);
    expect(errors.some((e) => e.message.includes("dinner"))).toBe(true);
  });

  it("should_accept_medium_day_with_dinner_ending_near_20", () => {
    const full: LlmItineraryOutput = {
      days: [
        {
          day_index: 1,
          blocks: [
            {
              name: "上海博物馆",
              type: "attraction",
              start_time: "10:00",
              duration_min: 90,
              reason: "ok",
            },
            {
              name: "南翔小笼",
              type: "lunch",
              start_time: "12:00",
              duration_min: 60,
              reason: "ok",
            },
            {
              name: "豫园",
              type: "attraction",
              start_time: "14:00",
              duration_min: 90,
              reason: "ok",
            },
            {
              name: "绿波廊",
              type: "dinner",
              start_time: "18:30",
              duration_min: 90,
              reason: "ok",
            },
          ],
        },
      ],
    };
    expect(validateItinerary(full, candidates, 5, "medium")).toEqual([]);
  });
});

describe("slimArrangeCandidate (TC-M6-P0-02)", () => {
  it("should_keep_one_photo_and_sanitized_deeplinks_strip_hours_extra_photos", () => {
    const fat: PlaceCard = {
      provider: "GOOGLE_MAPS",
      name: "上海博物馆",
      category: "museum",
      rating: 4.5,
      hours: "09:00-17:00",
      photos: ["https://example.com/a.jpg?key=SECRET", "https://example.com/b.jpg"],
      location: { lat: 31.23, lng: 121.47, crs: "WGS84" },
      sources: [
        {
          provider: "GOOGLE_MAPS",
          native_id: "test1",
          deeplinks: { google: "https://maps.google.com/?cid=1&key=SECRET" },
        },
      ],
    };
    const slim = slimArrangeCandidate(fat);
    expect(slim.name).toBe("上海博物馆");
    expect(slim.category).toBe("museum");
    expect(slim.rating).toBe(4.5);
    expect(slim.location).toEqual(fat.location);
    expect(slim.photos).toEqual(["https://example.com/a.jpg"]);
    expect(slim.hours).toBeUndefined();
    expect(slim.sources?.[0]?.deeplinks?.google).toBe("https://maps.google.com/?cid=1");
    expect(JSON.stringify(slim)).not.toMatch(/SECRET/);
  });

  it("TC-M19-79-02 should_keep_user_ratings_total_in_slimArrangeCandidate", () => {
    const fat: PlaceCard = {
      provider: "GOOGLE_MAPS",
      name: "Sample Attraction",
      category: "tourist_attraction",
      rating: 4.7,
      user_ratings_total: 18_500,
      location: { lat: 0, lng: 0, crs: "WGS84" },
      sources: [],
    };
    const slim = slimArrangeCandidate(fat);
    expect(slim.user_ratings_total).toBe(18_500);
    expect(slim.rating).toBe(4.7);
  });

  it("should_normalize_sources_object_to_array_without_throwing", () => {
    const card = {
      provider: "GOOGLE_MAPS",
      name: "Miradouro",
      location: { lat: 38.71, lng: -9.13, crs: "WGS84" as const },
      photos: [],
      // ChatBox host rewrite: object instead of array
      sources: {
        deeplinks: {
          google_web: "https://www.google.com/maps/search/?api=1&query=38.71%2C-9.13",
        },
      },
    } as unknown as PlaceCard;
    const slim = slimArrangeCandidate(card);
    expect(Array.isArray(slim.sources)).toBe(true);
    expect(slim.sources?.[0]?.deeplinks?.google_web).toMatch(/google\.com\/maps/);
  });

  it("should_synthesize_google_web_when_sources_empty_but_location_present", () => {
    const sources = normalizePlaceSources([], {
      provider: "GOOGLE_MAPS",
      location: { lat: 38.7, lng: -9.1 },
    });
    expect(sources).toHaveLength(1);
    expect(sources[0]?.deeplinks?.google_web).toContain("38.7");
  });

  it("should_compact_mcp_echo_to_name_location_and_one_deeplink", () => {
    const fat: PlaceCard = {
      provider: "GOOGLE_MAPS",
      name: "贝伦塔",
      address: "Lisboa",
      category: "tower",
      rating: 4.6,
      photos: ["https://example.com/a.jpg"],
      location: { lat: 38.69, lng: -9.21, crs: "WGS84" },
      sources: [
        {
          provider: "GOOGLE_MAPS",
          native_id: "ChIJ1",
          deeplinks: {
            google_web: "https://www.google.com/maps/search/?api=1&query=1",
            google_app: "https://maps.google.com/?q=1",
            amap_web: "https://uri.amap.com/marker?position=-9.21,38.69",
          },
        },
      ],
      must_see: true,
    };
    const slim = slimArrangeCandidates(
      { places: [fat], restaurants: [] },
      { omitPhotos: true, compactEcho: true },
    );
    expect(slim.places[0]).toMatchObject({
      name: "贝伦塔",
      must_see: true,
      location: fat.location,
    });
    expect(slim.places[0]?.photos).toBeUndefined();
    expect(slim.places[0]?.address).toBeUndefined();
    expect(slim.places[0]?.sources?.[0]?.deeplinks).toEqual({
      google_web: "https://www.google.com/maps/search/?api=1&query=1",
    });
  });

  it("should_include_must_include_in_user_message", () => {
    const msg = buildUserMessage({
      city: "Lisbon",
      numDays: 4,
      candidates: { places: [], restaurants: [] },
      locale: "CN",
      dayIndex: 1,
      must_include: ["Sintra", "Cascais"],
      day_theme: "downtown historic core",
    });
    expect(msg).toMatch(/HARD MUST INCLUDE/);
    expect(msg).toMatch(/Sintra/);
    expect(msg).toMatch(/Cascais/);
    expect(msg).toMatch(/Day theme/);
  });

  it("should_drop_photos_from_mcp_arrange_result", () => {
    const slim = slimArrangeDayResultForMcp({
      day_index: 1,
      blocks: [
        {
          name: "A",
          type: "attraction",
          start_time: "10:00",
          duration_min: 60,
          reason: "ok",
          photos: ["https://example.com/fat"],
        },
      ],
      photos_cover: "https://example.com/cover",
    });
    const data = slim as {
      blocks: Array<{ photos?: string[] }>;
      photos_cover?: string;
    };
    expect(data.blocks[0]?.photos).toBeUndefined();
    expect(data.photos_cover).toBeUndefined();
  });
});

describe("arrangeDay Phase 4 photos (TC-M6-P0-03)", () => {
  it("should_attach_photos_from_original_candidates_after_slim", async () => {
    const fat: PlaceCard = {
      provider: "GOOGLE_MAPS",
      name: "上海博物馆",
      category: "museum",
      rating: 4.5,
      hours: "09:00-17:00",
      photos: ["https://example.com/cover.jpg"],
      location: { lat: 31.23, lng: 121.47, crs: "WGS84" },
      sources: [
        {
          provider: "GOOGLE_MAPS",
          native_id: "test1",
          deeplinks: { google: "https://maps.google.com/?cid=1" },
        },
      ],
    };
    const dayJson = JSON.stringify({
      days: [
        {
          day_index: 1,
          blocks: [
            {
              name: "上海博物馆",
              type: "attraction",
              start_time: "10:00",
              duration_min: 90,
              reason: "iconic",
            },
            {
              name: "南翔小笼",
              type: "lunch",
              start_time: "12:00",
              duration_min: 60,
              reason: "lunch",
            },
            {
              name: "豫园",
              type: "attraction",
              start_time: "14:00",
              duration_min: 90,
              reason: "afternoon",
            },
            {
              name: "绿波廊",
              type: "dinner",
              start_time: "18:30",
              duration_min: 90,
              reason: "dinner",
            },
          ],
        },
      ],
    });
    const lunch: PlaceCard = {
      provider: "GOOGLE_MAPS",
      name: "南翔小笼",
      category: "restaurant",
      location: { lat: 31.23, lng: 121.48, crs: "WGS84" },
      sources: [],
    };
    const garden: PlaceCard = {
      provider: "GOOGLE_MAPS",
      name: "豫园",
      category: "scenic_spot",
      location: { lat: 31.22, lng: 121.49, crs: "WGS84" },
      sources: [],
    };
    const dinner: PlaceCard = {
      provider: "GOOGLE_MAPS",
      name: "绿波廊",
      category: "restaurant",
      location: { lat: 31.23, lng: 121.49, crs: "WGS84" },
      sources: [],
    };
    const result = await arrangeDay({
      candidates: { places: [fat, garden], restaurants: [lunch, dinner] },
      dayIndex: 1,
      locale: "CN",
      pace: "medium",
      _testChatCreate: async () => ({
        choices: [{ message: { content: dayJson } }],
      }),
      _testResolveDuration: async () => ({ duration_min: 10 }),
    });
    if ("execution" in result && result.execution === "host") {
      throw new Error("expected agent arrange result");
    }
    const day = result as Exclude<typeof result, { execution: "host" }>;
    expect(day.blocks[0]?.photos).toEqual(["https://example.com/cover.jpg"]);
    expect(day.photos_cover).toBe("https://example.com/cover.jpg");
  });
});

describe("buildUserMessage", () => {
  const samplePlace: PlaceCard = {
    provider: "GOOGLE_MAPS",
    name: "上海博物馆",
    category: "museum",
    rating: 4.5,
    location: { lat: 31.23, lng: 121.47, crs: "WGS84" },
    sources: [{ provider: "GOOGLE_MAPS", native_id: "test1", deeplinks: {} }],
  };

  it("TC-M6-IT09: should include candidate lat/lng in message", () => {
    const msg = buildUserMessage({
      city: "上海",
      numDays: 2,
      candidates: { places: [samplePlace], restaurants: [] },
      locale: "CN",
    });
    expect(msg).toContain("31.2300");
    expect(msg).toContain("121.4700");
    expect(msg).toContain("上海博物馆");
  });

  it("should include origin when provided", () => {
    const msg = buildUserMessage({
      city: "上海",
      numDays: 1,
      candidates: { places: [], restaurants: [] },
      origin: { name: "外滩", lat: 31.24, lng: 121.49 },
      locale: "EN",
    });
    expect(msg).toContain("Origin: 外滩");
  });

  it("should include dayIndex guidance for single-day arrange", () => {
    const msg = buildUserMessage({
      city: "Taipei",
      numDays: 1,
      dayIndex: 2,
      candidates: { places: [], restaurants: [] },
      locale: "EN",
    });
    expect(msg).toContain("Plan day 2");
    expect(msg).toContain("already filtered");
  });

  it("should note 'not specified' when no origin", () => {
    const msg = buildUserMessage({
      city: "Tokyo",
      numDays: 1,
      candidates: { places: [], restaurants: [] },
      locale: "EN",
    });
    expect(msg).toContain("not specified");
    expect(msg).toContain("10:00");
  });

  it("should include pace limit", () => {
    const msg = buildUserMessage({
      city: "HK",
      numDays: 1,
      candidates: { places: [], restaurants: [] },
      pace: "tight",
      locale: "EN",
    });
    expect(msg).toContain("max places per day: 6");
  });

  it("should_include_day_theme_and_natural_language_when_set", () => {
    const msg = buildUserMessage({
      city: "Lisbon",
      numDays: 1,
      dayIndex: 4,
      candidates: { places: [], restaurants: [] },
      locale: "CN",
      day_theme: "Sintra day trip",
      natural_language: "要去辛特拉，中等节奏",
    });
    expect(msg).toContain("Day theme / focus (must honor): Sintra day trip");
    expect(msg).toContain("Traveler notes: 要去辛特拉，中等节奏");
  });
});

describe("withAbortTimeout + callItineraryLlmWithValidationRetry", () => {
  it("should_abort_when_create_never_resolves", async () => {
    const t0 = Date.now();
    await expect(
      withAbortTimeout(80, (signal) =>
        new Promise<never>((_resolve, reject) => {
          signal.addEventListener("abort", () => {
            const err = new Error("aborted");
            err.name = "AbortError";
            reject(err);
          });
        }),
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(Date.now() - t0).toBeLessThan(500);
  });

  it("should_not_retry_when_llm_times_out", async () => {
    let calls = 0;
    await expect(
      callItineraryLlmWithValidationRetry({
        create: async (_params, { signal }) => {
          calls += 1;
          return new Promise((_resolve, reject) => {
            signal.addEventListener("abort", () => {
              const err = new Error("aborted");
              err.name = "AbortError";
              reject(err);
            });
          });
        },
        systemPrompt: "sys",
        userMessage: "user",
        timeoutMs: 60,
        temperature: 0.35,
        maxCompletionTokens: 1280,
        failLabel: "arrange_day failed",
        parseAndValidate: () => ({ ok: true, value: { ok: true } }),
      }),
    ).rejects.toThrow(/timed out/);
    expect(calls).toBe(1);
  });

  it("should_retry_once_on_validation_failure_then_succeed", async () => {
    let calls = 0;
    const valid = JSON.stringify({
      days: [
        {
          day_index: 1,
          blocks: [
            {
              name: "上海博物馆",
              type: "attraction",
              start_time: "10:00",
              duration_min: 90,
              reason: "ok",
            },
          ],
        },
      ],
    });
    const result = await callItineraryLlmWithValidationRetry({
      create: async () => {
        calls += 1;
        return {
          choices: [
            {
              message: {
                content: calls === 1 ? '{"days":[]}' : valid,
              },
            },
          ],
        };
      },
      systemPrompt: "sys",
      userMessage: "user",
      timeoutMs: 5_000,
      temperature: 0.35,
      maxCompletionTokens: 1280,
      failLabel: "arrange_day failed",
      parseAndValidate: (jsonStr) => {
        const parsed = LlmItinerarySchema.safeParse(JSON.parse(jsonStr));
        if (!parsed.success || !parsed.data.days[0]) {
          return { ok: false, retryable: true, error: "bad" };
        }
        return { ok: true, value: parsed.data };
      },
    });
    expect(calls).toBe(2);
    expect(result.days).toHaveLength(1);
  });
});

describe("arrangeDay empty candidates auto-discover (ADR-043 D8)", () => {
  it("should_auto_discover_and_arrange_when_candidates_empty_with_city", async () => {
    const miradouro: PlaceCard = {
      provider: "GOOGLE_MAPS",
      name: "Miradouro da Senhora do Monte",
      location: { lat: 38.7192, lng: -9.1328, crs: "WGS84" },
      sources: [
        {
          provider: "GOOGLE_MAPS",
          native_id: "ChIJ_mira",
          deeplinks: {},
        },
      ],
    };
    const lunch: PlaceCard = {
      provider: "GOOGLE_MAPS",
      name: "Antù Alfama",
      location: { lat: 38.7109, lng: -9.1295, crs: "WGS84" },
      sources: [],
    };
    const dinner: PlaceCard = {
      provider: "GOOGLE_MAPS",
      name: "AlmaLusa Alfama",
      location: { lat: 38.7091, lng: -9.1333, crs: "WGS84" },
      sources: [],
    };

    let discoverCalls = 0;
    const dayJson = JSON.stringify({
      days: [
        {
          day_index: 1,
          blocks: [
            {
              name: "Miradouro da Senhora do Monte",
              type: "attraction",
              start_time: "10:00",
              duration_min: 60,
              reason: "view",
            },
            {
              name: "Antù Alfama",
              type: "lunch",
              start_time: "12:30",
              duration_min: 60,
              reason: "lunch",
            },
            {
              name: "AlmaLusa Alfama",
              type: "dinner",
              start_time: "19:00",
              duration_min: 90,
              reason: "dinner",
            },
          ],
        },
      ],
    });

    const result = await arrangeDay({
      candidates: { places: [], restaurants: [] },
      dayIndex: 1,
      city: "里斯本",
      locale: "CN",
      pace: "medium",
      date: "2026-09-20",
      _testDiscoverPlaces: async () => {
        discoverCalls += 1;
        return {
          candidates: {
            places: [miradouro],
            restaurants: [lunch, dinner],
          },
        };
      },
      _testChatCreate: async () => ({
        choices: [{ message: { content: dayJson } }],
      }),
      _testResolveDuration: async () => ({ duration_min: 15 }),
    });

    expect(discoverCalls).toBe(1);
    if ("execution" in result && result.execution === "host") {
      throw new Error("expected agent result");
    }
    expect((result as { blocks: { name: string }[] }).blocks.map((b) => b.name)).toEqual([
      "Miradouro da Senhora do Monte",
      "Antù Alfama",
      "AlmaLusa Alfama",
    ]);
  });

  it("should_fail_clearly_when_candidates_empty_and_city_missing", async () => {
    await expect(
      arrangeDay({
        candidates: { places: [], restaurants: [] },
        dayIndex: 1,
        locale: "CN",
        pace: "medium",
        _testDiscoverPlaces: async () => {
          throw new Error("discover should not run");
        },
        _testChatCreate: async () => {
          throw new Error("llm should not run");
        },
      }),
    ).rejects.toThrow(/city|auto-discover|candidates empty/i);
  });

  it("should_not_rediscover_when_candidates_already_present", async () => {
    const place: PlaceCard = {
      provider: "GOOGLE_MAPS",
      name: "Castle",
      location: { lat: 38.71, lng: -9.13, crs: "WGS84" },
      sources: [],
    };
    const lunch: PlaceCard = {
      provider: "GOOGLE_MAPS",
      name: "Lunch",
      location: { lat: 38.71, lng: -9.13, crs: "WGS84" },
      sources: [],
    };
    const dinner: PlaceCard = {
      provider: "GOOGLE_MAPS",
      name: "Dinner",
      location: { lat: 38.71, lng: -9.13, crs: "WGS84" },
      sources: [],
    };
    let discoverCalls = 0;
    const dayJson = JSON.stringify({
      days: [
        {
          day_index: 1,
          blocks: [
            {
              name: "Castle",
              type: "attraction",
              start_time: "10:00",
              duration_min: 90,
              reason: "a",
            },
            {
              name: "Lunch",
              type: "lunch",
              start_time: "12:30",
              duration_min: 60,
              reason: "l",
            },
            {
              name: "Dinner",
              type: "dinner",
              start_time: "19:00",
              duration_min: 90,
              reason: "d",
            },
          ],
        },
      ],
    });

    await arrangeDay({
      candidates: { places: [place], restaurants: [lunch, dinner] },
      dayIndex: 1,
      city: "里斯本",
      locale: "CN",
      pace: "medium",
      _testDiscoverPlaces: async () => {
        discoverCalls += 1;
        return { candidates: { places: [], restaurants: [] } };
      },
      _testChatCreate: async () => ({
        choices: [{ message: { content: dayJson } }],
      }),
      _testResolveDuration: async () => ({ duration_min: 10 }),
    });

    expect(discoverCalls).toBe(0);
  });
});

describe("arrangeDay must_include hard coverage (ADR-043 D7 + D9 精简)", () => {
  it("should_fail_when_llm_skips_focus_sintra", async () => {
    const { resetMustIncludeCoverageSessions } = await import("./must-include-coverage");
    resetMustIncludeCoverageSessions();

    const queluz: PlaceCard = {
      provider: "GOOGLE_MAPS",
      name: "克卢什国家宫",
      location: { lat: 38.7506, lng: -9.2593, crs: "WGS84" },
      sources: [
        {
          provider: "GOOGLE_MAPS",
          native_id: "ChIJ_queluz",
          deeplinks: {},
        },
      ],
    };
    const lunch: PlaceCard = {
      provider: "GOOGLE_MAPS",
      name: "Lunch Spot",
      location: { lat: 38.75, lng: -9.26, crs: "WGS84" },
      sources: [],
    };
    const dinner: PlaceCard = {
      provider: "GOOGLE_MAPS",
      name: "Dinner Spot",
      location: { lat: 38.75, lng: -9.25, crs: "WGS84" },
      sources: [],
    };
    const pena: PlaceCard = {
      provider: "GOOGLE_MAPS",
      name: "Pena Palace",
      location: { lat: 38.7877, lng: -9.3906, crs: "WGS84" },
      sources: [
        {
          provider: "GOOGLE_MAPS",
          native_id: "ChIJ_pena",
          deeplinks: {},
        },
      ],
    };

    // LLM schedules only Queluz (not Sintra) on both attempts → hard fail after retry.
    const dayJson = JSON.stringify({
      days: [
        {
          day_index: 2,
          blocks: [
            {
              name: "克卢什国家宫",
              type: "attraction",
              start_time: "10:00",
              duration_min: 90,
              reason: "palace",
            },
            {
              name: "Lunch Spot",
              type: "lunch",
              start_time: "12:30",
              duration_min: 60,
              reason: "lunch",
            },
            {
              name: "Dinner Spot",
              type: "dinner",
              start_time: "18:30",
              duration_min: 90,
              reason: "dinner",
            },
          ],
        },
      ],
    });

    await expect(
      arrangeDay({
        candidates: { places: [queluz], restaurants: [lunch, dinner] },
        dayIndex: 2,
        num_days: 4,
        city: "里斯本",
        locale: "CN",
        pace: "medium",
        preferences: {
          must_include: ["辛特拉"],
          day_theme: "辛特拉整日短途",
        },
        _testGeocodeMustInclude: async () => ({
          lat: 38.8029,
          lng: -9.3817,
          aliases: ["Sintra", "辛特拉"],
        }),
        _testSearchMustInclude: async () => [pena],
        _testChatCreate: async () => ({
          choices: [{ message: { content: dayJson } }],
        }),
        _testResolveDuration: async () => ({ duration_min: 15 }),
      }),
    ).rejects.toThrow(/must_include "辛特拉" not covered/);
  });

  it("should_cover_sintra_when_llm_schedules_pena_on_retry", async () => {
    const { resetMustIncludeCoverageSessions } = await import("./must-include-coverage");
    resetMustIncludeCoverageSessions();

    const queluz: PlaceCard = {
      provider: "GOOGLE_MAPS",
      name: "克卢什国家宫",
      location: { lat: 38.7506, lng: -9.2593, crs: "WGS84" },
      sources: [],
    };
    const pena: PlaceCard = {
      provider: "GOOGLE_MAPS",
      name: "Pena Palace",
      location: { lat: 38.7877, lng: -9.3906, crs: "WGS84" },
      sources: [{ provider: "GOOGLE_MAPS", native_id: "ChIJ_pena", deeplinks: {} }],
    };
    const lunch: PlaceCard = {
      provider: "GOOGLE_MAPS",
      name: "Lunch Spot",
      location: { lat: 38.75, lng: -9.26, crs: "WGS84" },
      sources: [],
    };
    const dinner: PlaceCard = {
      provider: "GOOGLE_MAPS",
      name: "Dinner Spot",
      location: { lat: 38.75, lng: -9.25, crs: "WGS84" },
      sources: [],
    };

    const queluzJson = JSON.stringify({
      days: [
        {
          day_index: 1,
          blocks: [
            { name: "克卢什国家宫", type: "attraction", start_time: "10:00", duration_min: 90, reason: "x" },
            { name: "Lunch Spot", type: "lunch", start_time: "12:30", duration_min: 60, reason: "l" },
            { name: "Dinner Spot", type: "dinner", start_time: "19:00", duration_min: 90, reason: "d" },
          ],
        },
      ],
    });
    const penaJson = JSON.stringify({
      days: [
        {
          day_index: 1,
          blocks: [
            { name: "Pena Palace", type: "attraction", start_time: "10:00", duration_min: 90, reason: "x" },
            { name: "Lunch Spot", type: "lunch", start_time: "12:30", duration_min: 60, reason: "l" },
            { name: "Dinner Spot", type: "dinner", start_time: "19:00", duration_min: 90, reason: "d" },
          ],
        },
      ],
    });

    // Attempt 1: Queluz only (focus 辛特拉 not covered) → retry.
    // Attempt 2: Pena (in focusPool, native_id match) → covered.
    let attempt = 0;
    const result = await arrangeDay({
      candidates: { places: [queluz, pena], restaurants: [lunch, dinner] },
      dayIndex: 1,
      num_days: 2,
      city: "里斯本",
      locale: "CN",
      pace: "medium",
      preferences: { must_include: ["辛特拉"], day_theme: "辛特拉整日短途" },
      _testGeocodeMustInclude: async () => ({
        lat: 38.8029,
        lng: -9.3817,
        aliases: ["Sintra", "辛特拉"],
      }),
      _testSearchMustInclude: async () => [pena],
      _testChatCreate: async () => ({
        choices: [{ message: { content: attempt++ === 0 ? queluzJson : penaJson } }],
      }),
      _testResolveDuration: async () => ({ duration_min: 15 }),
    });

    if ("execution" in result && result.execution === "host") {
      throw new Error("expected agent result");
    }
    expect(result.must_include_focus).toBe("辛特拉");
    expect(result.must_include_coverage?.covered ?? []).toContain("辛特拉");
    expect((result as { blocks: { name: string }[] }).blocks.map((b) => b.name)).toContain("Pena Palace");
  });

  it("should_stay_focused_on_uncovered_must_include_when_host_omits_it", async () => {
    const { resetMustIncludeCoverageSessions, applyMustIncludeDayEvidence, mustIncludeCoverageKey } =
      await import("./must-include-coverage");
    resetMustIncludeCoverageSessions();

    // Register the trip must_include list in the session (sticky).
    const key = mustIncludeCoverageKey({ city: "里斯本", locale: "CN" });
    const pena: PlaceCard = {
      provider: "GOOGLE_MAPS",
      name: "Pena Palace",
      location: { lat: 38.7877, lng: -9.3906, crs: "WGS84" },
      sources: [{ provider: "GOOGLE_MAPS", native_id: "ChIJ_pena", deeplinks: {} }],
    };
    // Day 1 already covered 辛特拉 — only 卡斯凯什 remains missing.
    applyMustIncludeDayEvidence({
      key,
      must_include: ["辛特拉", "卡斯凯什"],
      blocks: [{ name: "Pena Palace", type: "attraction" }],
      focusToken: "辛特拉",
      focusPool: [pena],
      focusAnchor: { lat: 38.8029, lng: -9.3817, aliases: ["Sintra", "辛特拉"] },
      candidates: [pena],
    });

    const boca: PlaceCard = {
      provider: "GOOGLE_MAPS",
      name: "Boca do Inferno",
      location: { lat: 38.697, lng: -9.4217, crs: "WGS84" },
      sources: [{ provider: "GOOGLE_MAPS", native_id: "ChIJ_cascais", deeplinks: {} }],
    };
    const lunch: PlaceCard = {
      provider: "GOOGLE_MAPS",
      name: "Lunch",
      location: { lat: 38.71, lng: -9.13, crs: "WGS84" },
      sources: [],
    };
    const dinner: PlaceCard = {
      provider: "GOOGLE_MAPS",
      name: "Dinner",
      location: { lat: 38.71, lng: -9.13, crs: "WGS84" },
      sources: [],
    };

    // Day 2 — host OMITS preferences.must_include. Sticky recovery focuses 卡斯凯什 (first still-missing).
    const dayJson = JSON.stringify({
      days: [
        {
          day_index: 2,
          blocks: [
            { name: "Boca do Inferno", type: "attraction", start_time: "10:00", duration_min: 90, reason: "x" },
            { name: "Lunch", type: "lunch", start_time: "12:30", duration_min: 60, reason: "l" },
            { name: "Dinner", type: "dinner", start_time: "19:00", duration_min: 90, reason: "d" },
          ],
        },
      ],
    });

    const result = await arrangeDay({
      candidates: { places: [boca], restaurants: [lunch, dinner] },
      dayIndex: 2,
      num_days: 4,
      city: "里斯本",
      locale: "CN",
      pace: "medium",
      // preferences.must_include intentionally omitted — sticky recovery must kick in.
      // day_theme names the next uncovered token so theme-gated focus selects 卡斯凯什.
      preferences: { day_theme: "卡斯凯什海岸线" },
      _testGeocodeMustInclude: async () => ({
        lat: 38.697,
        lng: -9.4217,
        aliases: ["Cascais", "卡斯凯什"],
      }),
      _testSearchMustInclude: async () => [boca],
      _testChatCreate: async () => ({ choices: [{ message: { content: dayJson } }] }),
      _testResolveDuration: async () => ({ duration_min: 15 }),
    });

    if ("execution" in result && result.execution === "host") {
      throw new Error("expected agent result");
    }
    // 辛特拉 already covered on day 1; day 2 sticky must_include recovered + theme-gated focus = 卡斯凯什.
    expect(result.must_include_focus).toBe("卡斯凯什");
    expect(result.must_include_coverage?.covered ?? []).toContain("卡斯凯什");
  });

  it("should_not_force_focus_when_day_theme_absent_or_non_matching", async () => {
    // ADR-043 D9 精简 follow-up: theme-gated focus. No day_theme → no forced
    // focus; the day is planned from the base-city pool and must_include stays
    // missing for a future themed day (last-day gate still guarantees coverage).
    const { resetMustIncludeCoverageSessions, applyMustIncludeDayEvidence, mustIncludeCoverageKey } =
      await import("./must-include-coverage");
    resetMustIncludeCoverageSessions();
    const key = mustIncludeCoverageKey({ city: "里斯本", locale: "CN" });
    const pena: PlaceCard = {
      provider: "GOOGLE_MAPS",
      name: "Pena Palace",
      location: { lat: 38.7877, lng: -9.3906, crs: "WGS84" },
      sources: [{ provider: "GOOGLE_MAPS", native_id: "ChIJ_pena", deeplinks: {} }],
    };
    applyMustIncludeDayEvidence({
      key,
      must_include: ["辛特拉", "卡斯凯什"],
      blocks: [{ name: "Pena Palace", type: "attraction" }],
      focusToken: "辛特拉",
      focusPool: [pena],
      focusAnchor: { lat: 38.8029, lng: -9.3817, aliases: ["Sintra", "辛特拉"] },
      candidates: [pena],
    });
    const cityPlace: PlaceCard = {
      provider: "GOOGLE_MAPS",
      name: "圣若热城堡",
      location: { lat: 38.71, lng: -9.13, crs: "WGS84" },
      sources: [],
    };
    const lunch: PlaceCard = {
      provider: "GOOGLE_MAPS",
      name: "Lunch",
      location: { lat: 38.71, lng: -9.13, crs: "WGS84" },
      sources: [],
    };
    const dinner: PlaceCard = {
      provider: "GOOGLE_MAPS",
      name: "Dinner",
      location: { lat: 38.71, lng: -9.13, crs: "WGS84" },
      sources: [],
    };
    const dayJson = JSON.stringify({
      days: [
        {
          day_index: 2,
          blocks: [
            { name: "圣若热城堡", type: "attraction", start_time: "10:00", duration_min: 90, reason: "x" },
            { name: "Lunch", type: "lunch", start_time: "12:30", duration_min: 60, reason: "l" },
            { name: "Dinner", type: "dinner", start_time: "19:00", duration_min: 90, reason: "d" },
          ],
        },
      ],
    });
    const result = await arrangeDay({
      candidates: { places: [cityPlace], restaurants: [lunch, dinner] },
      dayIndex: 2,
      num_days: 4,
      city: "里斯本",
      locale: "CN",
      pace: "medium",
      preferences: { must_include: ["辛特拉", "卡斯凯什"] }, // no day_theme
      _testChatCreate: async () => ({ choices: [{ message: { content: dayJson } }] }),
      _testResolveDuration: async () => ({ duration_min: 15 }),
    });
    if ("execution" in result && result.execution === "host") {
      throw new Error("expected agent result");
    }
    expect(result.must_include_focus).toBeNull();
    // 卡斯凯什 stays missing — no focus search ran, no Cascais evidence.
    expect(result.must_include_coverage?.missing ?? []).toContain("卡斯凯什");
  });

  it("should_hard_fail_when_focus_search_returns_empty", async () => {
    const { resetMustIncludeCoverageSessions } = await import("./must-include-coverage");
    resetMustIncludeCoverageSessions();

    const lunch: PlaceCard = {
      provider: "GOOGLE_MAPS",
      name: "Lunch",
      location: { lat: 38.71, lng: -9.13, crs: "WGS84" },
      sources: [],
    };
    const dinner: PlaceCard = {
      provider: "GOOGLE_MAPS",
      name: "Dinner",
      location: { lat: 38.71, lng: -9.13, crs: "WGS84" },
      sources: [],
    };
    const dayJson = JSON.stringify({
      days: [
        {
          day_index: 1,
          blocks: [
            { name: "Lunch", type: "lunch", start_time: "12:30", duration_min: 60, reason: "l" },
            { name: "Dinner", type: "dinner", start_time: "19:00", duration_min: 90, reason: "d" },
          ],
        },
      ],
    });

    await expect(
      arrangeDay({
        candidates: { places: [], restaurants: [lunch, dinner] },
        dayIndex: 1,
        num_days: 2,
        city: "里斯本",
        locale: "CN",
        pace: "medium",
        preferences: { must_include: ["辛特拉"], day_theme: "辛特拉一日" },
        _testGeocodeMustInclude: async () => ({
          lat: 38.8029,
          lng: -9.3817,
          aliases: ["Sintra", "辛特拉"],
        }),
        _testSearchMustInclude: async () => [], // empty pool → cannot inject → hard fail
        _testDiscoverPlaces: async () => ({
          candidates: {
            places: [
              {
                provider: "GOOGLE_MAPS",
                name: "Castle",
                location: { lat: 38.71, lng: -9.13, crs: "WGS84" },
                sources: [],
              },
            ],
            restaurants: [lunch, dinner],
          },
        }),
        _testChatCreate: async () => ({ choices: [{ message: { content: dayJson } }] }),
        _testResolveDuration: async () => ({ duration_min: 15 }),
      }),
    ).rejects.toThrow(/must_include.*not covered/);
  });

  it("should_not_invent_day_trip_when_must_include_empty", async () => {
    const { resetMustIncludeCoverageSessions } = await import("./must-include-coverage");
    resetMustIncludeCoverageSessions();

    const castle: PlaceCard = {
      provider: "GOOGLE_MAPS",
      name: "Castle",
      location: { lat: 38.71, lng: -9.13, crs: "WGS84" },
      sources: [],
    };
    const lunch: PlaceCard = {
      provider: "GOOGLE_MAPS",
      name: "Lunch",
      location: { lat: 38.71, lng: -9.13, crs: "WGS84" },
      sources: [],
    };
    const dinner: PlaceCard = {
      provider: "GOOGLE_MAPS",
      name: "Dinner",
      location: { lat: 38.71, lng: -9.13, crs: "WGS84" },
      sources: [],
    };
    const dayJson = JSON.stringify({
      days: [
        {
          day_index: 1,
          blocks: [
            { name: "Castle", type: "attraction", start_time: "10:00", duration_min: 60, reason: "c" },
            { name: "Lunch", type: "lunch", start_time: "12:30", duration_min: 60, reason: "l" },
            { name: "Dinner", type: "dinner", start_time: "19:00", duration_min: 90, reason: "d" },
          ],
        },
      ],
    });

    const result = await arrangeDay({
      candidates: { places: [castle], restaurants: [lunch, dinner] },
      dayIndex: 1,
      num_days: 2,
      city: "里斯本",
      locale: "CN",
      pace: "medium",
      // No must_include — must not auto-invent a day trip.
      _testChatCreate: async () => ({ choices: [{ message: { content: dayJson } }] }),
      _testResolveDuration: async () => ({ duration_min: 15 }),
    });

    if ("execution" in result && result.execution === "host") {
      throw new Error("expected agent result");
    }
    expect(result.must_include_focus).toBeNull();
    expect(result.must_include_coverage?.missing ?? []).toEqual([]);
    expect((result as { blocks: { name: string }[] }).blocks.map((b) => b.name)).toEqual(["Castle", "Lunch", "Dinner"]);
  });
});

// ============================================================================
// F42 — arrange output validation (TC-M9-U42-01~04)
// ============================================================================

describe("F42: validateStationTiming (TC-M9-U42-01)", () => {
  it("should_pass_when_block_start_accounts_for_transit_duration", () => {
    const blocks = [
      { name: "A", type: "attraction", start_time: "10:00", duration_min: 90, legs_to_here: [{ mode: "walk", duration_min: 20, recommended: true }] },
      { name: "B", type: "attraction", start_time: "11:55", duration_min: 60, legs_to_here: [{ mode: "walk", duration_min: 15, recommended: true }] },
    ];
    const errors = validateStationTiming(blocks, 5);
    expect(errors).toHaveLength(0);
  });

  it("should_fail_when_gap_is_less_than_transit_minus_tolerance", () => {
    const blocks = [
      { name: "辛特拉", type: "attraction", start_time: "10:00", duration_min: 240, legs_to_here: [{ mode: "transit", duration_min: 100, recommended: true }] },
      { name: "Lunch", type: "lunch", start_time: "14:15", duration_min: 60, legs_to_here: [{ mode: "transit", duration_min: 100, recommended: true }] },
    ];
    const errors = validateStationTiming(blocks, 5);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].field).toContain("blocks");
  });

  it("should_pass_within_5min_tolerance", () => {
    const blocks = [
      { name: "A", type: "attraction", start_time: "10:00", duration_min: 60, legs_to_here: [{ mode: "walk", duration_min: 30, recommended: true }] },
      { name: "B", type: "attraction", start_time: "11:25", duration_min: 60, legs_to_here: [] },
    ];
    // A ends 11:00, transit 30min → expect 11:30, actual 11:25 → 5min diff = OK
    const errors = validateStationTiming(blocks, 5);
    expect(errors).toHaveLength(0);
  });

  it("should_skip_first_block_legs_to_here", () => {
    const blocks = [
      { name: "A", type: "attraction", start_time: "10:00", duration_min: 60, legs_to_here: [{ mode: "walk", duration_min: 999, recommended: true }] },
    ];
    const errors = validateStationTiming(blocks, 5);
    expect(errors).toHaveLength(0);
  });
});

describe("F42: same-day restaurant dedup via validateItinerary (TC-M9-U42-02)", () => {
  it("should_fail_when_lunch_and_dinner_have_same_name", () => {
    const dup: LlmItineraryOutput = {
      days: [{
        day_index: 1,
        blocks: [
          { name: "景点A", type: "attraction", start_time: "10:00", duration_min: 90, reason: "ok" },
          { name: "同一餐厅", type: "lunch", start_time: "12:00", duration_min: 60, reason: "ok" },
          { name: "景点B", type: "attraction", start_time: "14:00", duration_min: 60, reason: "ok" },
          { name: "同一餐厅", type: "dinner", start_time: "18:00", duration_min: 90, reason: "ok" },
        ],
      }],
    };
    const cands = new Set(["景点A", "景点B", "同一餐厅"]);
    const errors = validateItinerary(dup, cands, 6);
    expect(errors.some((e) => e.message.includes("same restaurant") || e.message.includes("同一餐厅"))).toBe(true);
  });

  it("should_pass_when_lunch_and_dinner_have_different_names", () => {
    const ok: LlmItineraryOutput = {
      days: [{
        day_index: 1,
        blocks: [
          { name: "景点A", type: "attraction", start_time: "10:00", duration_min: 90, reason: "ok" },
          { name: "午餐A", type: "lunch", start_time: "12:00", duration_min: 60, reason: "ok" },
          { name: "景点B", type: "attraction", start_time: "14:00", duration_min: 60, reason: "ok" },
          { name: "晚餐B", type: "dinner", start_time: "18:00", duration_min: 90, reason: "ok" },
        ],
      }],
    };
    const cands = new Set(["景点A", "景点B", "午餐A", "晚餐B"]);
    const errors = validateItinerary(ok, cands, 6);
    expect(errors.filter((e) => e.message.includes("restaurant"))).toHaveLength(0);
  });
});

describe("F42: buildDayTripSearchQueries (TC-M9-U42-03)", () => {
  it("should_expand_focus_token_with_generic_attraction_terms", () => {
    const queries = buildDayTripSearchQueries("辛特拉", "里斯本");
    // Should include the base query AND expanded generic category queries
    expect(queries.length).toBeGreaterThan(1);
    expect(queries.some((q) => q.includes("辛特拉"))).toBe(true);
    // Must NOT contain city-specific hardcoded POI names (ADR-042)
    expect(queries.some((q) => /佩纳宫|摩尔人城堡|雷加莱拉/.test(q))).toBe(false);
  });

  it("should_use_generic_category_words_not_city_specific", () => {
    const queries = buildDayTripSearchQueries("卡斯凯什", "里斯本");
    // Generic terms like 景点/attractions/places are OK
    const joined = queries.join(" ");
    expect(/景点|attraction|place|sight/i.test(joined)).toBe(true);
    // No city-specific POI hardcoding
    expect(/地狱之口|Praia do Guincho/.test(joined)).toBe(false);
  });
});

describe("F42: lunch window soft prompt (TC-M9-U42-04)", () => {
  it("should_include_lunch_window_hint_when_no_meal_block_in_constraints", () => {
    const msg = buildUserMessage({
      city: "Lisbon",
      numDays: 1,
      dayIndex: 1,
      candidates: { places: [], restaurants: [] },
      pace: "medium",
      locale: "EN",
    });
    expect(msg.toLowerCase()).toContain("lunch");
  });
});
