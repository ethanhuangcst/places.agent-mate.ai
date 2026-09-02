import { describe, expect, it } from "vitest";
import {
  buildFixtureSkeleton,
  buildSkeletonUserMessage,
  dropCityNameStops,
  makeItinerary,
  reseatLateLunchStops,
  reseatStayToDayOrigin,
  remapStopNamesToPool,
  trimAreaAliasStops,
  trimPaceOverages,
  validateSkeleton,
  type MakeItineraryInput,
  type SkeletonChatCreate,
} from "./make-itinerary";
import { type PlaceCard } from "./types";
import { type Locale } from "./locales";

function place(name: string, lat = 38.7, lng = -9.1): PlaceCard {
  return {
    provider: "GOOGLE_MAPS",
    name,
    location: { lat, lng, crs: "WGS84" },
    rating: 4.5,
    sources: [],
  };
}

function restaurant(name: string): PlaceCard {
  return {
    provider: "GOOGLE_MAPS",
    name,
    location: { lat: 38.7, lng: -9.1, crs: "WGS84" },
    rating: 4.4,
    sources: [],
  };
}

function baseInput(overrides?: Partial<MakeItineraryInput>): MakeItineraryInput {
  return {
    city: "Lisbon",
    numDays: 2,
    candidates: {
      places: [place("Torre de Belém"), place("Mosteiro dos Jerónimos"), place("Castelo de São Jorge")],
      restaurants: [restaurant("Pastéis de Belém"), restaurant("Time Out Market"), restaurant("Cervejaria Ramiro"), restaurant("Taberna")],
    },
    origin: { name: "Hills Hotel Lisboa", lat: 38.72, lng: -9.14 },
    pace: "medium",
    locale: "EN" as Locale,
    ...overrides,
  };
}

function skeletonJson(input: MakeItineraryInput): unknown {
  return {
    days: [
      {
        day_index: 1,
        day_theme: "Belém classics",
        stops: [
          { name: "Hills Hotel Lisboa", kind: "stay" },
          { name: "Pastéis de Belém", kind: "meal", meal_slot: "lunch" },
          { name: "Torre de Belém", kind: "attraction" },
        ],
      },
      {
        day_index: 2,
        day_theme: "Alfama",
        stops: [
          { name: "Hills Hotel Lisboa", kind: "stay" },
          { name: "Time Out Market", kind: "meal", meal_slot: "lunch" },
          { name: "Castelo de São Jorge", kind: "attraction" },
        ],
      },
    ],
  };
}

/** Fake LLM create fn returning a canned completion (mirrors itinerary-planner tests). */
function fakeCreate(text: string | ((attempt: number) => string)): SkeletonChatCreate {
  let attempt = 0;
  return async () => {
    const t = typeof text === "function" ? text(attempt) : text;
    attempt++;
    return { choices: [{ message: { content: t } }] };
  };
}

describe("validateSkeleton", () => {
  const input = baseInput();
  const pool = {
    places: input.candidates.places,
    restaurants: input.candidates.restaurants,
    stays: ["Hills Hotel Lisboa"],
  };

  it("should_accept_valid_skeleton_when_all_stops_in_pool", () => {
    const result = validateSkeleton(skeletonJson(input), pool, [], "medium");
    expect(result.ok).toBe(true);
  });

  it("should_trim_extra_attractions_when_day_exceeds_pace_limit (TC-M13-55-01)", () => {
    const manyPlaces = {
      places: [
        place("A"),
        place("B"),
        place("C"),
        place("D"),
        place("E"),
        place("F"),
        place("G"),
      ],
      restaurants: input.candidates.restaurants,
      stays: ["Hills Hotel Lisboa"],
    };
    const crowded = {
      days: [
        {
          day_index: 1,
          day_theme: "too many",
          stops: [
            { name: "Hills Hotel Lisboa", kind: "stay" },
            { name: "A", kind: "attraction" },
            { name: "B", kind: "attraction" },
            { name: "C", kind: "attraction" },
            { name: "D", kind: "attraction" },
            { name: "E", kind: "attraction" },
            { name: "F", kind: "attraction" },
            { name: "Pastéis de Belém", kind: "meal", meal_slot: "lunch" },
          ],
        },
      ],
    };
    const trimmed = reseatLateLunchStops(trimPaceOverages(crowded, "relaxed"));
    const result = validateSkeleton(trimmed, manyPlaces, [], "relaxed");
    expect(result.ok).toBe(true);
    if (result.ok) {
      const attr = result.skeleton.days[0]!.stops.filter((s) => s.kind === "attraction");
      expect(attr).toHaveLength(4);
      expect(attr.map((s) => s.name)).toEqual(["A", "B", "C", "D"]);
    }
  });

  it("should_remap_normalized_stop_name_to_pool_canonical (TC-M13-56-01)", () => {
    const koreanPool = {
      places: [place("Bukchon Hanok Village"), place("Torre de Belém")],
      restaurants: input.candidates.restaurants,
      stays: ["Hills Hotel Lisboa"],
    };
    const raw = {
      days: [
        {
          day_index: 1,
          day_theme: "old town",
          stops: [
            { name: "Hills Hotel Lisboa", kind: "stay" },
            { name: "bukchon hanok village", kind: "attraction" },
            { name: "Pastéis de Belém", kind: "meal", meal_slot: "lunch" },
            { name: "Torre de Belém", kind: "attraction" },
          ],
        },
      ],
    };
    const remapped = remapStopNamesToPool(raw, koreanPool);
    const result = validateSkeleton(remapped, koreanPool, [], "medium");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.skeleton.days[0]!.stops[1]!.name).toBe("Bukchon Hanok Village");
    }
  });

  it("should_reject_stop_when_name_not_in_pool", () => {
    const bad = JSON.parse(JSON.stringify(skeletonJson(input)));
    bad.days[0].stops[1].name = "Invented Palace";
    const result = validateSkeleton(bad, pool, [], "medium");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("not found in candidate list");
      expect(result.retryable).toBe(true);
    }
  });

  it("should_reject_skeleton_when_must_include_missing", () => {
    const result = validateSkeleton(
      skeletonJson(input),
      pool,
      ["Mosteiro dos Jerónimos"],
      "medium",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("must_include not scheduled");
    }
  });

  it("should_reject_skeleton_when_venue_reused_across_days", () => {
    const bad = JSON.parse(JSON.stringify(skeletonJson(input)));
    bad.days[1].stops[1] = { name: "Torre de Belém", kind: "attraction" };
    const result = validateSkeleton(bad, pool, [], "medium");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("reused");
    }
  });

  it("should_allow_restaurant_reused_across_days", () => {
    const ok = JSON.parse(JSON.stringify(skeletonJson(input)));
    ok.days[1].stops.push({ name: "Pastéis de Belém", kind: "meal", meal_slot: "dinner" });
    const result = validateSkeleton(ok, pool, [], "medium");
    expect(result.ok).toBe(true);
  });

  it("should_reject_skeleton_when_day_missing_lunch", () => {
    const bad = JSON.parse(JSON.stringify(skeletonJson(input)));
    bad.days[0].stops = bad.days[0].stops.filter((s: { meal_slot?: string }) => s.meal_slot !== "lunch");
    const result = validateSkeleton(bad, pool, [], "medium");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("missing a lunch stop");
    }
  });

  it("should_reject_stop_when_name_is_the_destination_city", () => {
    const bad = JSON.parse(JSON.stringify(skeletonJson(input)));
    bad.days[0].stops[1].name = "Lisbon";
    const result = validateSkeleton(bad, pool, [], "medium", "Lisbon");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("destination city");
    }
  });

  it("should_skip_lunch_requirement_when_restaurant_pool_empty", () => {
    const noLunch = JSON.parse(JSON.stringify(skeletonJson(input)));
    noLunch.days[0].stops = noLunch.days[0].stops.filter(
      (s: { meal_slot?: string }) => s.meal_slot !== "lunch",
    );
    noLunch.days[1].stops = noLunch.days[1].stops.filter(
      (s: { meal_slot?: string }) => s.meal_slot !== "lunch",
    );
    const result = validateSkeleton(
      noLunch,
      { ...pool, restaurants: [] },
      [],
      "medium",
    );
    expect(result.ok).toBe(true);
  });

  it("should_accept_must_include_when_area_token_covered_by_place_or_theme", () => {
    const areaPool = {
      places: [place("贝伦塔"), place("辛特拉宫"), place("卡斯凯什老城")],
      restaurants: pool.restaurants,
      stays: pool.stays,
    };
    const raw = {
      days: [
        {
          day_index: 1,
          day_theme: "贝伦区",
          stops: [
            { name: "Hills Hotel Lisboa", kind: "stay" },
            { name: "Pastéis de Belém", kind: "meal", meal_slot: "lunch" },
            { name: "贝伦塔", kind: "attraction" },
          ],
        },
        {
          day_index: 2,
          day_theme: "辛特拉一日",
          stops: [
            { name: "Hills Hotel Lisboa", kind: "stay" },
            { name: "Time Out Market", kind: "meal", meal_slot: "lunch" },
            { name: "辛特拉宫", kind: "attraction" },
          ],
        },
      ],
    };
    const result = validateSkeleton(raw, areaPool, ["贝伦区", "辛特拉", "卡斯凯什"], "medium");
    // 卡斯凯什 is not in stops or themes — still missing
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("卡斯凯什");
      expect(result.error).not.toContain("贝伦区");
      expect(result.error).not.toContain("辛特拉");
    }
    raw.days[1].stops.splice(1, 0, { name: "卡斯凯什老城", kind: "attraction" });
    const covered = validateSkeleton(raw, areaPool, ["贝伦区", "辛特拉", "卡斯凯什"], "medium");
    expect(covered.ok).toBe(true);
  });

  it("should_reject_skeleton_when_time_fields_present_are_ignored_but_schema_strict", () => {
    // start_time etc. are stripped by zod (not in schema) — validation still passes
    const extra = JSON.parse(JSON.stringify(skeletonJson(input)));
    extra.days[0].stops[1].start_time = "10:00";
    const result = validateSkeleton(extra, pool, [], "medium");
    expect(result.ok).toBe(true);
  });

  it("should_reject_stay_not_at_day_start (TC-M14-59-03)", () => {
    const bad = {
      days: [
        {
          day_index: 1,
          day_theme: "sintra",
          stops: [
            { name: "Hills Hotel Lisboa", kind: "stay" },
            { name: "Pena Palace", kind: "attraction" },
            { name: "Sintra Garden Hotel", kind: "stay" },
            { name: "Pastéis de Belém", kind: "meal", meal_slot: "lunch" },
          ],
        },
      ],
    };
    const extendedPool = {
      ...pool,
      stays: ["Hills Hotel Lisboa", "Sintra Garden Hotel"],
    };
    const result = validateSkeleton(bad, extendedPool, [], "medium");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/stay.*first stop/i);
    }
  });

  it("should_reject_area_alias_attraction (TC-M14-60-03)", () => {
    const sintraPool = {
      places: [place("Sintra"), place("Pena Palace")],
      restaurants: pool.restaurants,
      stays: pool.stays,
    };
    const bad = {
      days: [
        {
          day_index: 1,
          day_theme: "Sintra day",
          stops: [
            { name: "Hills Hotel Lisboa", kind: "stay" },
            { name: "Sintra", kind: "attraction" },
            { name: "Pastéis de Belém", kind: "meal", meal_slot: "lunch" },
          ],
        },
      ],
    };
    const result = validateSkeleton(bad, sintraPool, ["Sintra"], "medium", "Lisbon");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/area name/i);
    }
  });

  it("should_trim_area_alias_stops_before_validation (TC-M14-60-03)", () => {
    const sintraPool = {
      places: [place("Sintra"), place("Pena Palace")],
      restaurants: pool.restaurants,
      stays: pool.stays,
    };
    const raw = {
      days: [
        {
          day_index: 1,
          day_theme: "Sintra day",
          stops: [
            { name: "Hills Hotel Lisboa", kind: "stay" },
            { name: "Sintra", kind: "attraction" },
            { name: "Pena Palace", kind: "attraction" },
            { name: "Pastéis de Belém", kind: "meal", meal_slot: "lunch" },
          ],
        },
      ],
    };
    const trimmed = reseatLateLunchStops(trimAreaAliasStops(raw, ["Sintra"], "Lisbon"));
    const result = validateSkeleton(trimmed, sintraPool, ["Sintra"], "medium", "Lisbon");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.skeleton.days[0]!.stops.map((s) => s.name)).not.toContain("Sintra");
    }
  });

  it("should_reject_lunch_after_last_attraction (TC-M14-61-02)", () => {
    const bad = {
      days: [
        {
          day_index: 1,
          day_theme: "city",
          stops: [
            { name: "Hills Hotel Lisboa", kind: "stay" },
            { name: "Torre de Belém", kind: "attraction" },
            { name: "Castelo de São Jorge", kind: "attraction" },
            { name: "Pastéis de Belém", kind: "meal", meal_slot: "lunch" },
          ],
        },
      ],
    };
    // lunch is last stop after attractions — but it's also after last attraction
    // Move lunch to be explicitly after last attraction only:
    const lateLunch = JSON.parse(JSON.stringify(bad));
    lateLunch.days[0].stops.push({ name: "Mosteiro dos Jerónimos", kind: "attraction" });
    // order: stay, torre, castelo, lunch, jerónimos — lunch before last attr actually
    // Fix: put lunch after jerónimos
    lateLunch.days[0].stops = [
      { name: "Hills Hotel Lisboa", kind: "stay" },
      { name: "Torre de Belém", kind: "attraction" },
      { name: "Castelo de São Jorge", kind: "attraction" },
      { name: "Mosteiro dos Jerónimos", kind: "attraction" },
      { name: "Pastéis de Belém", kind: "meal", meal_slot: "lunch" },
    ];
    const extendedPool = {
      ...pool,
      places: [...pool.places, place("Mosteiro dos Jerónimos")],
    };
    const result = validateSkeleton(lateLunch, extendedPool, [], "medium");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/lunch stop.*last attraction/i);
    }
  });

  it("should_reseat_lunch_before_last_attraction (TC-M14-61-02)", () => {
    const raw = {
      days: [
        {
          day_index: 1,
          day_theme: "city",
          stops: [
            { name: "Hills Hotel Lisboa", kind: "stay" },
            { name: "Torre de Belém", kind: "attraction" },
            { name: "Castelo de São Jorge", kind: "attraction" },
            { name: "Mosteiro dos Jerónimos", kind: "attraction" },
            { name: "Pastéis de Belém", kind: "meal", meal_slot: "lunch" },
          ],
        },
      ],
    };
    const extendedPool = {
      ...pool,
      places: [...pool.places, place("Mosteiro dos Jerónimos")],
    };
    const reseated = reseatLateLunchStops(raw);
    const result = validateSkeleton(reseated, extendedPool, [], "medium");
    expect(result.ok).toBe(true);
    if (result.ok) {
      const names = result.skeleton.days[0]!.stops.map((s) => s.name);
      const lunchIdx = names.indexOf("Pastéis de Belém");
      const lastAttrIdx = names.lastIndexOf("Mosteiro dos Jerónimos");
      expect(lunchIdx).toBeLessThan(lastAttrIdx);
    }
  });
});

describe("makeItinerary events (TC-M10-43-01)", () => {
  it("should_emit_skeleton_start_day_done_in_order_when_llm_succeeds", async () => {
    const input = baseInput();
    const events: Array<Record<string, unknown>> = [];
    const result = await makeItinerary(input, {
      onEvent: (e) => events.push(e as unknown as Record<string, unknown>),
      create: fakeCreate(JSON.stringify(skeletonJson(input))),
    });
    expect(events.map((e) => e.type)).toEqual([
      "skeleton_start",
      "skeleton_day",
      "skeleton_day",
      "skeleton_done",
    ]);
    expect(events[0]).toMatchObject({ type: "skeleton_start", total_days: 2 });
    expect(events[3]).toMatchObject({ type: "skeleton_done", days_count: 2 });
    const dayEvent = events[1] as { day: { stops: Array<Record<string, unknown>> } };
    for (const stop of dayEvent.day.stops) {
      expect(stop.start_time).toBeUndefined();
      expect(stop.duration_min).toBeUndefined();
    }
    expect(result.skeleton.days).toHaveLength(2);
  });

  it("should_retry_once_when_first_attempt_missing_must_include (TC-M10-43-02)", async () => {
    const input = baseInput({ must_include: ["Mosteiro dos Jerónimos"] });
    let calls = 0;
    const create: SkeletonChatCreate = async () => {
      calls++;
      if (calls === 1) {
        // First attempt: valid JSON but missing the must_include stop
        return { choices: [{ message: { content: JSON.stringify(skeletonJson(input)) } }] };
      }
      const fixed = JSON.parse(JSON.stringify(skeletonJson(input))) as {
        days: Array<{ stops: Array<Record<string, unknown>> }>;
      };
      fixed.days[0].stops.splice(1, 0, {
        name: "Mosteiro dos Jerónimos",
        kind: "attraction",
      });
      return { choices: [{ message: { content: JSON.stringify(fixed) } }] };
    };
    const result = await makeItinerary(input, { create });
    expect(calls).toBe(2);
    const names = result.skeleton.days.flatMap((d) => d.stops.map((s) => s.name));
    expect(names).toContain("Mosteiro dos Jerónimos");
  });

  it("should_accept_english_supplementary_hit_for_cn_must_include", async () => {
    const input = baseInput({
      city: "里斯本",
      numDays: 1,
      must_include: ["卡斯凯什"],
      candidates: {
        places: [place("贝伦塔")],
        restaurants: [restaurant("Pastéis de Belém")],
      },
    });
    const cascais = place("Cascais", 38.697, -9.4217);
    const result = await makeItinerary(input, {
      searchPlaces: async () => ({ data: [cascais] }),
      create: fakeCreate(
        JSON.stringify({
          days: [
            {
              day_index: 1,
              day_theme: "卡斯凯什海岸",
              stops: [
                { name: "Hills Hotel Lisboa", kind: "stay" },
                { name: "Pastéis de Belém", kind: "meal", meal_slot: "lunch" },
                { name: "Cascais", kind: "attraction" },
              ],
            },
          ],
        }),
      ),
    });
    expect(result.candidates_slim.places.map((p) => p.name)).toContain("Cascais");
    expect(result.skeleton.days[0]?.stops.some((s) => s.name === "Cascais")).toBe(true);
  });

  it("should_merge_nearby_search_hits_for_area_must_include (TC-M13-57-01)", async () => {
    const input = baseInput({
      city: "Lisbon",
      numDays: 1,
      must_include: ["Sintra"],
      candidates: {
        places: [place("贝伦塔")],
        restaurants: [restaurant("Pastéis de Belém")],
      },
    });
    const pena = place("Pena Palace", 38.7877, -9.3906);
    const moor = place("Castelo dos Mouros", 38.7926, -9.3893);
    const quinta = place("Quinta da Regaleira", 38.7963, -9.396);
    const result = await makeItinerary(input, {
      geocode: async (q) => (q === "Sintra" ? { lat: 38.8029, lng: -9.3817 } : { lat: 38.72, lng: -9.14 }),
      searchPlaces: async (req) => {
        if (req.near) return { data: [pena, moor, quinta] };
        return { data: [place("Sintra", 38.8029, -9.3817)] };
      },
      create: fakeCreate(
        JSON.stringify({
          days: [
            {
              day_index: 1,
              day_theme: "Sintra day trip",
              stops: [
                { name: "Hills Hotel Lisboa", kind: "stay" },
                { name: "Pena Palace", kind: "attraction" },
                { name: "Castelo dos Mouros", kind: "attraction" },
                { name: "Quinta da Regaleira", kind: "attraction" },
                { name: "Pastéis de Belém", kind: "meal", meal_slot: "lunch" },
              ],
            },
          ],
        }),
      ),
    });
    const names = result.candidates_slim.places.map((p) => p.name);
    expect(names).toEqual(expect.arrayContaining(["Pena Palace", "Castelo dos Mouros", "Quinta da Regaleira"]));
    expect(result.skeleton.days[0]?.stops.filter((s) => s.kind === "attraction")).toHaveLength(3);
  });

  it("should_skip_supplementary_place_that_is_city_name_or_unrelated", async () => {
    const input = baseInput({
      city: "里斯本",
      must_include: ["卡斯凯什"],
      candidates: {
        places: [place("贝伦塔"), place("Castelo de São Jorge")],
        restaurants: [restaurant("Pastéis de Belém"), restaurant("Time Out Market")],
      },
    });
    await expect(
      makeItinerary(input, {
        searchPlaces: async () => ({ data: [place("里斯本")] }),
        create: fakeCreate(JSON.stringify(skeletonJson(input))),
      }),
    ).rejects.toThrow(/must_include not scheduled: 卡斯凯什/);
  });

  it("should_drop_far_continent_candidates_when_origin_has_coords", async () => {
    const yellowstone = place("黄石国家公园", 44.5979, -110.5612);
    const input = baseInput({
      numDays: 1,
      candidates: {
        places: [place("贝伦塔"), yellowstone],
        restaurants: [restaurant("Pastéis de Belém"), restaurant("Time Out Market")],
      },
    });
    const result = await makeItinerary(input);
    expect(result.candidates_slim.places.map((p) => p.name)).not.toContain("黄石国家公园");
    expect(result.candidates_slim.places.map((p) => p.name)).toContain("贝伦塔");
  });

  it("should_trim_lisbon_fillers_from_must_include_day_trip", async () => {
    const cascais = place("卡斯凯什", 38.697, -9.4217);
    const pink = place("Pink Street", 38.7072, -9.1438);
    const input = baseInput({
      numDays: 1,
      must_include: ["卡斯凯什"],
      candidates: {
        places: [cascais, pink],
        restaurants: [restaurant("Pastéis de Belém")],
      },
    });
    const result = await makeItinerary(input, {
      create: fakeCreate(
        JSON.stringify({
          days: [
            {
              day_index: 1,
              day_theme: "卡斯凯什海岸一日游",
              stops: [
                { name: "Hills Hotel Lisboa", kind: "stay" },
                { name: "卡斯凯什", kind: "attraction" },
                { name: "Pink Street", kind: "attraction" },
                { name: "Pastéis de Belém", kind: "meal", meal_slot: "lunch" },
              ],
            },
          ],
        }),
      ),
    });
    expect(result.skeleton.days[0]?.stops.map((s) => s.name)).toEqual([
      "Hills Hotel Lisboa",
      "卡斯凯什",
    ]);
  });

  it("should_enrich_empty_restaurants_and_uncovered_must_include_before_llm", async () => {
    const input = baseInput({
      must_include: ["卡斯凯什"],
      candidates: {
        places: [place("贝伦塔"), place("Castelo de São Jorge")],
        restaurants: [],
      },
    });
    const cascais = place("卡斯凯什老城", 38.697, -9.4217);
    const lunch = restaurant("Auto Lunch");
    const dinner = restaurant("Auto Dinner");
    const result = await makeItinerary(input, {
      searchRestaurants: async () => ({ data: [lunch, dinner] }),
      searchPlaces: async () => ({ data: [cascais] }),
      create: fakeCreate(
        JSON.stringify({
          days: [
            {
              day_index: 1,
              day_theme: "贝伦区",
              stops: [
                { name: "Hills Hotel Lisboa", kind: "stay" },
                { name: "贝伦塔", kind: "attraction" },
                { name: "Auto Lunch", kind: "meal", meal_slot: "lunch" },
              ],
            },
            {
              day_index: 2,
              day_theme: "卡斯凯什",
              stops: [
                { name: "Hills Hotel Lisboa", kind: "stay" },
                { name: "卡斯凯什老城", kind: "attraction" },
                { name: "Auto Dinner", kind: "meal", meal_slot: "lunch" },
              ],
            },
          ],
        }),
      ),
    });
    const names = result.skeleton.days.flatMap((d) => d.stops.map((s) => s.name));
    expect(names).toContain("卡斯凯什老城");
    expect(names).toContain("Auto Lunch");
  });

  it("should_hard_fail_when_retry_still_invalid", async () => {
    const input = baseInput();
    const bad = { days: [{ day_index: 1, day_theme: "x", stops: [{ name: "Nope", kind: "attraction" }] }] };
    await expect(
      makeItinerary(input, { create: fakeCreate(JSON.stringify(bad)) }),
    ).rejects.toThrow(/skeleton validation failed/);
  });

  it("should_return_fixture_skeleton_when_no_llm_and_pool_is_sufficient", async () => {
    const input = baseInput();
    const events: Array<Record<string, unknown>> = [];
    const result = await makeItinerary(input, {
      onEvent: (e) => events.push(e as unknown as Record<string, unknown>),
    });
    expect(events.map((e) => e.type)).toEqual([
      "skeleton_start",
      "skeleton_day",
      "skeleton_day",
      "skeleton_done",
    ]);
    expect(result.skeleton.days).toHaveLength(2);
    expect(result.skeleton.days[0].stops[0]).toMatchObject({
      name: "Hills Hotel Lisboa",
      kind: "stay",
    });
  });

  it("should_timeout_llm_and_throw_when_create_never_resolves", async () => {
    const input = baseInput();
    const prev = process.env.LLM_SKELETON_TIMEOUT_MS;
    process.env.LLM_SKELETON_TIMEOUT_MS = "50";
    const hanging: SkeletonChatCreate = (_params, { signal }) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("aborted by timeout")));
      });
    await expect(makeItinerary(input, { create: hanging })).rejects.toThrow(/timed out/);
    if (prev === undefined) delete process.env.LLM_SKELETON_TIMEOUT_MS;
    else process.env.LLM_SKELETON_TIMEOUT_MS = prev;
  });

  it("should_include_prior_validation_when_retry_llm_times_out (TC-M15-62-04)", async () => {
    const input = baseInput({ must_include: ["Torre de Belém"] });
    const prev = process.env.LLM_SKELETON_TIMEOUT_MS;
    process.env.LLM_SKELETON_TIMEOUT_MS = "80";
    let attempt = 0;
    const create: SkeletonChatCreate = (_params, { signal }) => {
      attempt++;
      if (attempt === 1) {
        // Valid JSON but missing must_include — survives repair pipeline, fails validate.
        return Promise.resolve({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  days: [
                    {
                      day_index: 1,
                      day_theme: "Alfama only",
                      stops: [
                        { name: "Hills Hotel Lisboa", kind: "stay" },
                        { name: "Pastéis de Belém", kind: "meal", meal_slot: "lunch" },
                        { name: "Castelo de São Jorge", kind: "attraction" },
                      ],
                    },
                    {
                      day_index: 2,
                      day_theme: "more Alfama",
                      stops: [
                        { name: "Hills Hotel Lisboa", kind: "stay" },
                        { name: "Time Out Market", kind: "meal", meal_slot: "lunch" },
                        { name: "Mosteiro dos Jerónimos", kind: "attraction" },
                      ],
                    },
                  ],
                }),
              },
            },
          ],
        });
      }
      return new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("aborted by timeout")));
      });
    };
    await expect(makeItinerary(input, { create })).rejects.toThrow(
      /timed out.*must_include|must_include.*timed out/i,
    );
    if (prev === undefined) delete process.env.LLM_SKELETON_TIMEOUT_MS;
    else process.env.LLM_SKELETON_TIMEOUT_MS = prev;
  });
});

describe("MVP-15 skeleton deterministic repair (TC-M15-62)", () => {
  const input = baseInput();
  const pool = {
    places: input.candidates.places,
    restaurants: input.candidates.restaurants,
    stays: ["Hills Hotel Lisboa"],
  };

  it("should_move_stay_to_day_start_when_not_first (TC-M15-62-01)", () => {
    const raw = {
      days: [
        {
          day_index: 1,
          day_theme: "Belém",
          stops: [
            { name: "Torre de Belém", kind: "attraction" },
            { name: "Hills Hotel Lisboa", kind: "stay" },
            { name: "Pastéis de Belém", kind: "meal", meal_slot: "lunch" },
            { name: "Mosteiro dos Jerónimos", kind: "attraction" },
          ],
        },
      ],
    };
    expect(validateSkeleton(raw, pool, [], "medium").ok).toBe(false);
    const fixed = reseatStayToDayOrigin(raw);
    const result = validateSkeleton(fixed, pool, [], "medium");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.skeleton.days[0]!.stops[0]).toMatchObject({
        name: "Hills Hotel Lisboa",
        kind: "stay",
      });
    }
  });

  it("should_keep_only_one_stay_at_day_start_when_multiple (TC-M15-62-02)", () => {
    const extendedPool = {
      ...pool,
      stays: ["Hills Hotel Lisboa", "Sintra Garden Hotel"],
    };
    const raw = {
      days: [
        {
          day_index: 1,
          day_theme: "sintra",
          stops: [
            { name: "Hills Hotel Lisboa", kind: "stay" },
            { name: "Torre de Belém", kind: "attraction" },
            { name: "Sintra Garden Hotel", kind: "stay" },
            { name: "Pastéis de Belém", kind: "meal", meal_slot: "lunch" },
          ],
        },
      ],
    };
    expect(validateSkeleton(raw, extendedPool, [], "medium").ok).toBe(false);
    // Production pipeline: lunch reseat then stay reseat (F61 + F62).
    const fixed = reseatStayToDayOrigin(reseatLateLunchStops(raw));
    const result = validateSkeleton(fixed, extendedPool, [], "medium");
    expect(result.ok).toBe(true);
    if (result.ok) {
      const stays = result.skeleton.days[0]!.stops.filter((s) => s.kind === "stay");
      expect(stays).toHaveLength(1);
      expect(result.skeleton.days[0]!.stops[0]!.kind).toBe("stay");
    }
  });

  it("should_drop_city_name_attraction_stops (TC-M15-62-03)", () => {
    const cityPool = {
      places: [...pool.places, place("Lisbon")],
      restaurants: pool.restaurants,
      stays: pool.stays,
    };
    const raw = {
      days: [
        {
          day_index: 1,
          day_theme: "city pad",
          stops: [
            { name: "Hills Hotel Lisboa", kind: "stay" },
            { name: "Lisbon", kind: "attraction" },
            { name: "Pastéis de Belém", kind: "meal", meal_slot: "lunch" },
            { name: "Torre de Belém", kind: "attraction" },
          ],
        },
      ],
    };
    expect(validateSkeleton(raw, cityPool, [], "medium", "Lisbon").ok).toBe(false);
    const fixed = dropCityNameStops(raw, "Lisbon");
    const result = validateSkeleton(fixed, cityPool, [], "medium", "Lisbon");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.skeleton.days[0]!.stops.some((s) => s.name === "Lisbon")).toBe(false);
    }
  });

  it("should_accept_null_day_date_as_omitted (TC-M15-62 schema)", () => {
    const raw = {
      days: [
        {
          day_index: 1,
          date: null,
          day_theme: "Belém",
          stops: [
            { name: "Hills Hotel Lisboa", kind: "stay" },
            { name: "Pastéis de Belém", kind: "meal", meal_slot: "lunch" },
            { name: "Torre de Belém", kind: "attraction" },
          ],
        },
      ],
    };
    const result = validateSkeleton(raw, pool, [], "medium");
    expect(result.ok).toBe(true);
  });

  it("should_reseat_lunch_again_after_dropping_trailing_city_attr", () => {
    const cityPool = {
      places: [...pool.places, place("Lisbon")],
      restaurants: pool.restaurants,
      stays: pool.stays,
    };
    const raw = {
      days: [
        {
          day_index: 1,
          day_theme: "pad",
          stops: [
            { name: "Hills Hotel Lisboa", kind: "stay" },
            { name: "Torre de Belém", kind: "attraction" },
            { name: "Lisbon", kind: "attraction" },
            { name: "Pastéis de Belém", kind: "meal", meal_slot: "lunch" },
          ],
        },
      ],
    };
    const mid = dropCityNameStops(reseatLateLunchStops(raw), "Lisbon");
    expect(validateSkeleton(mid, cityPool, [], "medium", "Lisbon").ok).toBe(false);
    const repaired = reseatLateLunchStops(mid);
    expect(validateSkeleton(repaired, cityPool, [], "medium", "Lisbon").ok).toBe(true);
  });
});

describe("buildSkeletonUserMessage", () => {
  it("should_include_must_include_and_origin_when_present", () => {
    const input = baseInput({ must_include: ["Torre de Belém"], natural_language: "Seafood lover" });
    const msg = buildSkeletonUserMessage(input);
    expect(msg).toContain("HARD MUST INCLUDE");
    expect(msg).toContain("Torre de Belém");
    expect(msg).toContain("Hills Hotel Lisboa");
    expect(msg).toContain("Seafood lover");
    expect(msg).toContain("NO times");
    expect(msg).toContain('Never schedule the city name "Lisbon"');
  });

  it("should_omit_lunch_rule_in_prompt_when_restaurants_empty", () => {
    const input = baseInput({
      candidates: { places: [place("贝伦塔")], restaurants: [] },
    });
    const msg = buildSkeletonUserMessage(input);
    expect(msg).toMatch(/Restaurant list is empty/);
    expect(msg).not.toMatch(/Every day needs a lunch stop from the restaurant list/);
  });

  it("TC-M12-49-05: should_annotate_must_see_candidates", () => {
    const places = [
      { ...place("Torre de Belém"), must_see: true },
      place("Mosteiro dos Jerónimos"),
    ];
    const input = baseInput({ candidates: { places, restaurants: [] } });
    input.candidates.places = places;
    const msg = buildSkeletonUserMessage(input);
    expect(msg).toMatch(/Torre de Belém.*\[must-see\]/);
    expect(msg).not.toMatch(/Mosteiro dos Jerónimos.*\[must-see\]/);
  });
});

describe("buildFixtureSkeleton", () => {
  it("should_never_emit_times", () => {
    const skeleton = buildFixtureSkeleton(baseInput());
    for (const day of skeleton.days) {
      for (const stop of day.stops) {
        expect((stop as Record<string, unknown>).start_time).toBeUndefined();
        expect((stop as Record<string, unknown>).duration_min).toBeUndefined();
      }
    }
  });

  it("TC-M12-49-05: should_prefer_must_see_places_first", () => {
    // Generic place first, iconic (must_see) last — fixture must reorder so the
    // iconic place is scheduled on day 1 ahead of the generic one.
    const generic = place("Generic Viewpoint");
    const iconic = { ...place("Pena Palace"), must_see: true };
    const input = baseInput({
      numDays: 1,
      candidates: { places: [generic, iconic], restaurants: [restaurant("Lunch")] },
    });
    const skeleton = buildFixtureSkeleton(input);
    const day1 = skeleton.days[0];
    const attractionNames = day1.stops
      .filter((s) => s.kind === "attraction")
      .map((s) => s.name);
    expect(attractionNames[0]).toBe("Pena Palace");
  });
});
