import { describe, expect, it } from "vitest";
import {
  attachNativeIdsToSkeleton,
  buildFixtureSkeleton,
  buildSkeletonUserMessage,
  dropCityNameStops,
  dropUnknownAttractionStops,
  isAreaAliasStop,
  normalizeMealSlotStops,
  enrichMakeItineraryInput,
  llmSkeletonTimeoutMs,
  makeItinerary,
  PLAN_GATEWAY_BUDGET_MS,
  reseatLateLunchStops,
  reseatStayToDayOrigin,
  remapStopNamesToPool,
  splitSingleAttractionDays,
  trimAreaAliasStops,
  trimPaceOverages,
  validateSkeleton,
  ItinerarySkeletonSchema,
  type MakeItineraryInput,
  type SkeletonChatCreate,
  type SkeletonDeviation,
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
          { kind: "meal", meal_slot: "dinner" },
        ],
      },
      {
        day_index: 2,
        day_theme: "Alfama",
        stops: [
          { name: "Hills Hotel Lisboa", kind: "stay" },
          { name: "Time Out Market", kind: "meal", meal_slot: "lunch" },
          { name: "Castelo de São Jorge", kind: "attraction" },
          { kind: "meal", meal_slot: "dinner" },
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

  it("TC-M22-84-02 should_not_fail_when_must_include_is_collection_name", () => {
    const result = validateSkeleton(skeletonJson(input), pool, ["西湖十景"], "medium");
    expect(result.ok).toBe(true);
  });

  it("should_reject_stay_only_day_when_attraction_pool_exists", () => {
    const raw = {
      days: [
        {
          day_index: 1,
          day_theme: "empty",
          stops: [{ name: "Hills Hotel Lisboa", kind: "stay" }],
        },
      ],
    };
    const result = validateSkeleton(raw, pool, [], "medium");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/stay-only|attraction/i);
  });

  it("TC-T3-110e-01 should_allow_one_attraction_day_under_soft_pace_no_hard_minattr_floor", () => {
    const fatPool = {
      places: [
        place("A"),
        place("B"),
        place("C"),
        place("D"),
        place("E"),
        place("F"),
      ],
      restaurants: input.candidates.restaurants,
      stays: ["Hills Hotel Lisboa"],
    };
    const raw = {
      days: [
        {
          day_index: 1,
          day_theme: "theme park full day",
          stops: [
            { name: "Hills Hotel Lisboa", kind: "stay" },
            { name: "A", kind: "attraction" },
            { name: "Pastéis de Belém", kind: "meal", meal_slot: "lunch" },
            { kind: "meal", meal_slot: "dinner" },
          ],
        },
        {
          day_index: 2,
          day_theme: "city",
          stops: [
            { name: "Hills Hotel Lisboa", kind: "stay" },
            { name: "B", kind: "attraction" },
            { name: "C", kind: "attraction" },
            { name: "Time Out Market", kind: "meal", meal_slot: "lunch" },
            { name: "D", kind: "attraction" },
            { kind: "meal", meal_slot: "dinner" },
          ],
        },
      ],
    };
    // 110e: a 1-attraction day (e.g. theme park) is no longer hard-rejected for
    // being below a ">= 2" minimum; pace is a soft signal, not a hard floor.
    const result = validateSkeleton(raw, fatPool, [], "relaxed");
    expect(result.ok).toBe(true);
  });

  it("TC-T3-110e-01b should_not_hard_reject_near_cap_pace_day_at_medium", () => {
    const fatPool = {
      places: ["A", "B", "C", "D", "E", "F", "G"].map((n) => place(n)),
      restaurants: input.candidates.restaurants,
      stays: ["Hills Hotel Lisboa"],
    };
    const raw = {
      days: [
        {
          day_index: 1,
          day_theme: "city",
          stops: [
            { name: "Hills Hotel Lisboa", kind: "stay" },
            { name: "A", kind: "attraction" },
            { name: "B", kind: "attraction" },
            { name: "C", kind: "attraction" },
            { name: "Pastéis de Belém", kind: "meal", meal_slot: "lunch" },
            { name: "D", kind: "attraction" },
            { name: "E", kind: "attraction" },
            { name: "F", kind: "attraction" },
            { kind: "meal", meal_slot: "dinner" },
          ],
        },
      ],
    };
    // 110e: 6 attractions at medium (soft cap 5) is not a hard rejection.
    const result = validateSkeleton(raw, fatPool, [], "medium");
    expect(result.ok).toBe(true);
  });

  it("should_trim_extreme_attraction_overage_only (TC-M13-55-01 / 110e)", () => {
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
            { kind: "meal", meal_slot: "dinner" },
          ],
        },
      ],
    };
    // 110e: trim only extreme overage (> limit + 2); relaxed cap 4 → 7 trimmed to 6, not 4.
    const trimmed = reseatLateLunchStops(trimPaceOverages(crowded, "relaxed"));
    const result = validateSkeleton(trimmed, manyPlaces, [], "relaxed");
    expect(result.ok).toBe(true);
    if (result.ok) {
      const attr = result.skeleton.days[0]!.stops.filter((s) => s.kind === "attraction");
      expect(attr).toHaveLength(6);
      expect(attr.map((s) => s.name)).toEqual(["A", "B", "C", "D", "E", "F"]);
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
            { kind: "meal", meal_slot: "dinner" },
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

  it("should_drop_unknown_attraction_and_keep_valid_skeleton", () => {
    const raw = JSON.parse(JSON.stringify(skeletonJson(input))) as {
      days: Array<{ stops: Array<{ name: string; kind: string; meal_slot?: string }> }>;
    };
    raw.days[0]!.stops.splice(2, 0, { name: "白堤", kind: "attraction" });
    const trimmed = dropUnknownAttractionStops(raw, pool);
    const result = validateSkeleton(trimmed, pool, [], "medium");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.skeleton.days[0]!.stops.some((s) => s.name === "白堤")).toBe(false);
      expect(result.skeleton.days[0]!.stops.some((s) => s.name === "Torre de Belém")).toBe(true);
    }
  });

  it("should_reject_stop_when_name_not_in_pool", () => {
    const bad = JSON.parse(JSON.stringify(skeletonJson(input)));
    bad.days[0].stops[2].name = "Invented Palace";
    const result = validateSkeleton(bad, pool, [], "medium");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("not found in candidate list");
      expect(result.retryable).toBe(true);
    }
  });

  it("TC-M19-78-01 should_default_skeleton_timeout_below_gateway_budget", () => {
    const prevSk = process.env.LLM_SKELETON_TIMEOUT_MS;
    const prevIt = process.env.LLM_ITINERARY_TIMEOUT_MS;
    delete process.env.LLM_SKELETON_TIMEOUT_MS;
    delete process.env.LLM_ITINERARY_TIMEOUT_MS;
    expect(llmSkeletonTimeoutMs()).toBe(160_000);
    expect(llmSkeletonTimeoutMs()).toBeLessThan(PLAN_GATEWAY_BUDGET_MS);
    if (prevSk === undefined) delete process.env.LLM_SKELETON_TIMEOUT_MS;
    else process.env.LLM_SKELETON_TIMEOUT_MS = prevSk;
    if (prevIt === undefined) delete process.env.LLM_ITINERARY_TIMEOUT_MS;
    else process.env.LLM_ITINERARY_TIMEOUT_MS = prevIt;
  });

  it("TC-M19-80-01 should_reject_must_include_when_only_day_theme_matches", () => {
    const stayOnly = {
      days: [
        {
          day_index: 1,
          day_theme: "贝伦海岸一日",
          stops: [{ name: "Hills Hotel Lisboa", kind: "stay" }],
        },
      ],
    };
    const result = validateSkeleton(
      stayOnly,
      { places: [place("贝伦塔"), place("辛特拉宫"), place("卡斯凯什老城")], restaurants: [], stays: pool.stays },
      ["贝伦塔"],
      "medium",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("must_include not scheduled");
      expect(result.retryable).toBe(true);
    }
  });

  it("TC-M19-80-02 should_reject_stay_only_day_when_attraction_pool_has_three", () => {
    const stayOnly = {
      days: [
        {
          day_index: 1,
          day_theme: "rest day",
          stops: [{ name: "Hills Hotel Lisboa", kind: "stay" }],
        },
      ],
    };
    const result = validateSkeleton(
      stayOnly,
      { places: [place("A"), place("B"), place("C")], restaurants: [], stays: pool.stays },
      [],
      "medium",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/stay-only/i);
    }
  });

  it("TC-M19-80-03 should_accept_cn_must_include_when_official_stop_name_covers", () => {
    const raw = {
      days: [
        {
          day_index: 1,
          day_theme: "coast",
          stops: [
            { name: "Hills Hotel Lisboa", kind: "stay" },
            { kind: "meal", meal_slot: "lunch" },
            { name: "贝伦塔", kind: "attraction" },
            { kind: "meal", meal_slot: "dinner" },
          ],
        },
      ],
    };
    const result = validateSkeleton(
      raw,
      { places: [place("贝伦塔"), place("辛特拉宫"), place("A")], restaurants: [], stays: pool.stays },
      ["贝伦塔"],
      "medium",
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.skeleton.days[0]?.stops.some((s) => s.name === "贝伦塔")).toBe(true);
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

  it("should_accept_meal_stop_when_name_not_in_restaurant_pool", () => {
    const raw = JSON.parse(JSON.stringify(skeletonJson(input))) as {
      days: Array<{ stops: Array<{ name: string; kind: string; meal_slot?: string }> }>;
    };
    raw.days[0]!.stops[1] = { name: "楼外楼", kind: "meal", meal_slot: "lunch" };
    const result = validateSkeleton(raw, pool, [], "medium");
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
    const attr = bad.days[0].stops.find((s: { kind: string }) => s.kind === "attraction");
    attr.name = "Lisbon";
    const result = validateSkeleton(bad, pool, [], "medium", "Lisbon");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("destination city");
    }
  });

  it("should_require_lunch_slot_when_restaurant_pool_empty", () => {
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
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/missing a lunch stop/);
  });

  it("should_accept_meal_slot_without_venue_name", () => {
    const raw = {
      days: [
        {
          day_index: 1,
          day_theme: "Belém",
          stops: [
            { name: "Hills Hotel Lisboa", kind: "stay" },
            { kind: "meal", meal_slot: "lunch" },
            { name: "Torre de Belém", kind: "attraction" },
            { kind: "meal", meal_slot: "dinner" },
          ],
        },
        {
          day_index: 2,
          day_theme: "Alfama",
          stops: [
            { name: "Hills Hotel Lisboa", kind: "stay" },
            { kind: "meal", meal_slot: "lunch" },
            { name: "Castelo de São Jorge", kind: "attraction" },
            { kind: "meal", meal_slot: "dinner" },
          ],
        },
      ],
    };
    const result = validateSkeleton(raw, pool, [], "medium");
    expect(result.ok).toBe(true);
    if (result.ok) {
      for (const day of result.skeleton.days) {
        for (const s of day.stops) {
          if (s.kind === "meal") {
            expect(s.name).toBe(s.meal_slot);
            expect(["lunch", "dinner", "afternoon_tea"]).toContain(s.name);
          }
        }
      }
    }
  });

  it("should_normalize_restaurant_named_meals_to_slot_id", () => {
    const out = normalizeMealSlotStops(skeletonJson(input)) as {
      days: Array<{ stops: Array<{ kind: string; name?: string; meal_slot?: string }> }>;
    };
    const meals = out.days.flatMap((d) => d.stops.filter((s) => s.kind === "meal"));
    expect(meals.every((m) => m.name === m.meal_slot)).toBe(true);
    expect(meals.some((m) => m.name === "Pastéis de Belém")).toBe(false);
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
            { kind: "meal", meal_slot: "dinner" },
            { name: "贝伦塔", kind: "attraction" },
          ],
        },
        {
          day_index: 2,
          day_theme: "辛特拉一日",
          stops: [
            { name: "Hills Hotel Lisboa", kind: "stay" },
            { name: "Time Out Market", kind: "meal", meal_slot: "lunch" },
            { kind: "meal", meal_slot: "dinner" },
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
            { kind: "meal", meal_slot: "dinner" },
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
            { kind: "meal", meal_slot: "dinner" },
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
      places: [place("Sintra"), place("Pena Palace"), place("Palace of Sintra")],
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
            { name: "Palace of Sintra", kind: "attraction" },
            { name: "Pastéis de Belém", kind: "meal", meal_slot: "lunch" },
            { kind: "meal", meal_slot: "dinner" },
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

  it("should_keep_scenic_area_poi_names_ending_in_景区", () => {
    expect(isAreaAliasStop("雷峰塔景区", ["雷峰塔景区"], "杭州")).toBe(false);
    expect(isAreaAliasStop("西湖区", ["西湖区"], "杭州")).toBe(true);
    const poolHz = {
      places: [place("雷峰塔景区", 30.23, 120.14), place("西溪公园", 30.27, 120.06)],
      restaurants: [] as PlaceCard[],
      stays: ["大华饭店"],
    };
    const raw = {
      days: [
        {
          day_index: 1,
          day_theme: "西湖",
          stops: [
            { name: "大华饭店", kind: "stay" },
            { name: "雷峰塔景区", kind: "attraction" },
            { kind: "meal", meal_slot: "lunch" },
            { name: "西溪公园", kind: "attraction" },
            { kind: "meal", meal_slot: "dinner" },
          ],
        },
      ],
    };
    const trimmed = trimAreaAliasStops(raw, ["雷峰塔景区"], "杭州");
    expect(
      (trimmed as { days: Array<{ stops: Array<{ name?: string }> }> }).days[0]!.stops.map(
        (s) => s.name,
      ),
    ).toContain("雷峰塔景区");
    const result = validateSkeleton(trimmed, poolHz, ["雷峰塔景区"], "relaxed", "杭州");
    expect(result.ok).toBe(true);
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
            { kind: "meal", meal_slot: "dinner" },
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
      { kind: "meal", meal_slot: "dinner" },
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
            { kind: "meal", meal_slot: "dinner" },
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
      const lunchIdx = result.skeleton.days[0]!.stops.findIndex(
        (s) => s.kind === "meal" && s.meal_slot === "lunch",
      );
      const lastAttrIdx = names.lastIndexOf("Mosteiro dos Jerónimos");
      expect(lunchIdx).toBeLessThan(lastAttrIdx);
    }
  });

  /** TC-T3-110e-02 — lunch rule soft on a single-attraction (theme-park) day. */
  it("should_not_force_lunch_before_sole_attraction_on_single_attraction_day", () => {
    const raw = {
      days: [
        {
          day_index: 1,
          day_theme: "theme park",
          stops: [
            { name: "Hills Hotel Lisboa", kind: "stay" },
            { name: "上海迪士尼乐园", kind: "attraction" },
            { name: "Pastéis de Belém", kind: "meal", meal_slot: "lunch" },
            { kind: "meal", meal_slot: "dinner" },
          ],
        },
      ],
    };
    const extendedPool = {
      ...pool,
      places: [...pool.places, place("上海迪士尼乐园")],
    };
    const reseated = reseatLateLunchStops(raw);
    const result = validateSkeleton(reseated, extendedPool, [], "medium");
    expect(result.ok).toBe(true);
    if (result.ok) {
      const stops = result.skeleton.days[0]!.stops;
      const lunchIdx = stops.findIndex((s) => s.kind === "meal" && s.meal_slot === "lunch");
      const attrIdx = stops.findIndex((s) => s.kind === "attraction");
      // Lunch stays after the sole attraction so splitSingleAttractionDays can build AM→lunch→PM.
      expect(lunchIdx).toBeGreaterThan(attrIdx);
    }
  });

  /** TC-T3-110e-05 — safety rails still hard after softening. */
  it("should_still_reject_cross_day_reuse_city_as_stop_and_uncovered_must_include", () => {
    const fatPool = {
      places: ["A", "B", "C", "D", "E", "F"].map((n) => place(n)),
      restaurants: input.candidates.restaurants,
      stays: ["Hills Hotel Lisboa"],
    };
    const reused = {
      days: [
        {
          day_index: 1,
          day_theme: "d1",
          stops: [
            { name: "Hills Hotel Lisboa", kind: "stay" },
            { name: "A", kind: "attraction" },
            { name: "Pastéis de Belém", kind: "meal", meal_slot: "lunch" },
            { kind: "meal", meal_slot: "dinner" },
          ],
        },
        {
          day_index: 2,
          day_theme: "d2",
          stops: [
            { name: "Hills Hotel Lisboa", kind: "stay" },
            { name: "A", kind: "attraction" },
            { name: "Time Out Market", kind: "meal", meal_slot: "lunch" },
            { kind: "meal", meal_slot: "dinner" },
          ],
        },
      ],
    };
    expect(validateSkeleton(reused, fatPool, [], "medium").ok).toBe(false);

    const cityAsStop = JSON.parse(JSON.stringify(reused));
    cityAsStop.days[1].stops[1] = { name: "Lisbon", kind: "attraction" };
    expect(validateSkeleton(cityAsStop, fatPool, [], "medium", "Lisbon").ok).toBe(false);

    const missingMust = JSON.parse(JSON.stringify(reused));
    expect(
      validateSkeleton(missingMust, fatPool, ["Mosteiro dos Jerónimos"], "medium").ok,
    ).toBe(false);
  });

  /** TC-T3-110e-06 — day count is a hard safety rail, not a pace quota. */
  it("should_reject_skeleton_when_day_count_mismatches_numDays", () => {
    const fatPool = {
      places: ["A", "B", "C", "D", "E", "F"].map((n) => place(n)),
      restaurants: input.candidates.restaurants,
      stays: ["Hills Hotel Lisboa"],
    };
    const threeDay = {
      days: [
        {
          day_index: 1,
          day_theme: "d1",
          stops: [
            { name: "Hills Hotel Lisboa", kind: "stay" },
            { name: "A", kind: "attraction" },
            { kind: "meal", meal_slot: "lunch" },
            { kind: "meal", meal_slot: "dinner" },
          ],
        },
        {
          day_index: 2,
          day_theme: "d2",
          stops: [
            { name: "Hills Hotel Lisboa", kind: "stay" },
            { name: "B", kind: "attraction" },
            { kind: "meal", meal_slot: "lunch" },
            { kind: "meal", meal_slot: "dinner" },
          ],
        },
        {
          day_index: 3,
          day_theme: "d3",
          stops: [
            { name: "Hills Hotel Lisboa", kind: "stay" },
            { name: "C", kind: "attraction" },
            { kind: "meal", meal_slot: "lunch" },
            { kind: "meal", meal_slot: "dinner" },
          ],
        },
      ],
    };
    // 3-day skeleton is valid when numDays=3.
    expect(validateSkeleton(threeDay, fatPool, [], "medium", undefined, undefined, 3).ok).toBe(true);
    // 3-day skeleton is invalid when numDays=2 (LLM emitted too many days).
    const tooMany = validateSkeleton(threeDay, fatPool, [], "medium", undefined, undefined, 2);
    expect(tooMany.ok).toBe(false);
    if (!tooMany.ok) expect(tooMany.error).toMatch(/day count|numDays|expected/i);
    // 3-day skeleton is invalid when numDays=4 (LLM emitted too few days).
    const tooFew = validateSkeleton(threeDay, fatPool, [], "medium", undefined, undefined, 4);
    expect(tooFew.ok).toBe(false);
    if (!tooFew.ok) expect(tooFew.error).toMatch(/day count|numDays|expected/i);
    // Omitting numDays keeps backward-compatible behavior (no count check).
    expect(validateSkeleton(threeDay, fatPool, [], "medium").ok).toBe(true);
  });

  /** TC-T3-110c-02 — optional deviations on skeleton schema. */
  it("should_allow_optional_deviations_on_ItinerarySkeletonSchema", () => {
    const withDev: {
      days: Array<{
        day_index: number;
        day_theme: string;
        stops: Array<{ name?: string; kind: "stay" | "attraction" | "meal"; meal_slot?: "lunch" | "dinner" }>;
      }>;
      deviations: SkeletonDeviation[];
    } = {
      days: [
        {
          day_index: 1,
          day_theme: "d1",
          stops: [
            { name: "Hills Hotel Lisboa", kind: "stay" },
            { name: "Torre de Belém", kind: "attraction" },
            { kind: "meal", meal_slot: "lunch" },
            { kind: "meal", meal_slot: "dinner" },
          ],
        },
      ],
      deviations: [
        {
          field: "attraction_pool",
          expected: ">= 3 attractions for 3 days",
          actual: "1",
          reason: "attraction_pool_thin",
        },
      ],
    };
    const parsed = ItinerarySkeletonSchema.safeParse(withDev);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.deviations).toHaveLength(1);
      expect(parsed.data.deviations![0]!.field).toBe("attraction_pool");
    }
    expect(ItinerarySkeletonSchema.safeParse({ days: withDev.days }).success).toBe(true);
  });
});

describe("makeItinerary deviations (agent-discover-110c)", () => {
  /** TC-T3-110c-01 — post-make never grows days; far-cluster issues become deviations. */
  it("should_not_grow_days_beyond_numDays_and_attach_far_cluster_deviation", async () => {
    const pink = place("Pink Street", 38.7072, -9.1438);
    const sculpture = place("Street Sculpture", 38.7346, -9.1371);
    const pena = place("佩纳宫", 38.7876, -9.3906);
    const cabo = place("罗卡角", 38.7804, -9.4989);
    const restaurants = [restaurant("Pastéis de Belém"), restaurant("Time Out Market")];
    const tripInput = baseInput({
      numDays: 1,
      candidates: { places: [pink, sculpture, pena, cabo], restaurants },
    });
    const llmSkeleton = {
      days: [
        {
          day_index: 1,
          day_theme: "Mixed city and hills",
          stops: [
            { name: "Hills Hotel Lisboa", kind: "stay" },
            { name: "Pink Street", kind: "attraction" },
            { name: "Street Sculpture", kind: "attraction" },
            { kind: "meal", meal_slot: "lunch" },
            { name: "佩纳宫", kind: "attraction" },
            { name: "罗卡角", kind: "attraction" },
            { kind: "meal", meal_slot: "dinner" },
          ],
        },
      ],
    };
    const result = await makeItinerary(tripInput, {
      create: fakeCreate(JSON.stringify(llmSkeleton)),
    });
    expect(result.skeleton.days).toHaveLength(1);
    expect(result.skeleton.deviations?.some((d) => /far_cluster/i.test(d.field))).toBe(true);
  });

  /** TC-T3-110c-03 — thin pool: deviation + no endless retry hang. */
  it("should_attach_thin_pool_deviation_and_complete_without_endless_retry", async () => {
    const onlyTwo = [place("A"), place("B")];
    const tripInput = baseInput({
      numDays: 4,
      candidates: {
        places: onlyTwo,
        restaurants: [restaurant("Pastéis de Belém"), restaurant("Time Out Market")],
      },
      must_include: undefined,
    });
    // Fixture path (no create): thin pool must still complete with deviation.
    const result = await makeItinerary(tripInput);
    expect(result.skeleton.days).toHaveLength(4);
    const thin = result.skeleton.deviations?.find((d) =>
      /attraction_pool|thin|poi/i.test(d.field),
    );
    expect(thin).toBeDefined();
    expect(thin!.expected).toMatch(/4/);
    expect(thin!.actual).toMatch(/2/);
    expect(thin!.reason.length).toBeGreaterThan(0);
  });

  it("should_preserve_llm_attached_deviations_on_skeleton", async () => {
    const tripInput = baseInput({ numDays: 1 });
    const llmSkeleton = {
      days: [
        {
          day_index: 1,
          day_theme: "City",
          stops: [
            { name: "Hills Hotel Lisboa", kind: "stay" },
            { name: "Torre de Belém", kind: "attraction" },
            { kind: "meal", meal_slot: "lunch" },
            { kind: "meal", meal_slot: "dinner" },
          ],
        },
      ],
      deviations: [
        {
          field: "pace",
          expected: "relaxed density",
          actual: "1 attraction",
          reason: "LLM chose a light day",
        },
      ],
    };
    const result = await makeItinerary(tripInput, {
      create: fakeCreate(JSON.stringify(llmSkeleton)),
    });
    expect(result.skeleton.deviations?.some((d) => d.field === "pace")).toBe(true);
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
        places: [place("贝伦塔"), place("卡斯凯什老城")],
        restaurants: [restaurant("Pastéis de Belém")],
      },
    });
    const cascais = place("Cascais", 38.697, -9.4217);
    const result = await makeItinerary(input, {
      searchPlaces: async () => ({ data: [cascais] }),
      geocode: async () => ({ lat: 38.7223, lng: -9.1393 }),
      create: fakeCreate(
        JSON.stringify({
          days: [
            {
              day_index: 1,
              day_theme: "卡斯凯什海岸",
              stops: [
                { name: "Hills Hotel Lisboa", kind: "stay" },
                { name: "Pastéis de Belém", kind: "meal", meal_slot: "lunch" },
                { kind: "meal", meal_slot: "dinner" },
                { name: "卡斯凯什老城", kind: "attraction" },
                { name: "Cascais", kind: "attraction" },
              ],
            },
          ],
        }),
      ),
    });
    expect(result.candidates_slim.places.map((p) => p.name)).toContain("Cascais");
    expect(result.skeleton.days[0]?.stops.some((s) => s.name === "卡斯凯什老城")).toBe(true);
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
    const sintraPalace = place("Palace of Sintra", 38.7979, -9.3904);
    const result = await makeItinerary(input, {
      geocode: async (q) => (q === "Sintra" ? { lat: 38.8029, lng: -9.3817 } : { lat: 38.72, lng: -9.14 }),
      searchPlaces: async (req) => {
        if (req.near) return { data: [pena, moor, quinta, sintraPalace] };
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
                { name: "Palace of Sintra", kind: "attraction" },
                { name: "Pena Palace", kind: "attraction" },
                { name: "Castelo dos Mouros", kind: "attraction" },
                { name: "Pastéis de Belém", kind: "meal", meal_slot: "lunch" },
                { kind: "meal", meal_slot: "dinner" },
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
    const result = await makeItinerary(input, {
      searchPlaces: async () => ({ data: [place("里斯本")] }),
      geocode: async () => ({ lat: 38.72, lng: -9.14 }),
      create: fakeCreate(
        JSON.stringify({
          days: [
            {
              day_index: 1,
              day_theme: "Belem",
              stops: [
                { name: "Hills Hotel Lisboa", kind: "stay" },
                { name: "Pastéis de Belém", kind: "meal", meal_slot: "lunch" },
                { kind: "meal", meal_slot: "dinner" },
                { name: "贝伦塔", kind: "attraction" },
              ],
            },
            {
              day_index: 2,
              day_theme: "Alfama",
              stops: [
                { name: "Hills Hotel Lisboa", kind: "stay" },
                { name: "Time Out Market", kind: "meal", meal_slot: "lunch" },
                { kind: "meal", meal_slot: "dinner" },
                { name: "Castelo de São Jorge", kind: "attraction" },
              ],
            },
          ],
        }),
      ),
    });
    expect(result.skeleton.days).toHaveLength(2);
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
                { kind: "meal", meal_slot: "dinner" },
              ],
            },
          ],
        }),
      ),
    });
    expect(result.skeleton.days[0]?.stops.map((s) => s.name)).toEqual([
      "Hills Hotel Lisboa",
      "卡斯凯什",
      "lunch",
      "卡斯凯什",
      "dinner",
    ]);
    const attrs = result.skeleton.days[0]?.stops.filter((s) => s.kind === "attraction") ?? [];
    expect(attrs.map((s) => s.visit_part)).toEqual(["am", "pm"]);
  });

  it("TC-M19-82-02 should_mark_user_requested_not_must_see_on_supplementary_backfill", async () => {
    const input = baseInput({
      must_include: ["卡斯凯什"],
      candidates: {
        places: [place("贝伦塔"), place("Castelo de São Jorge")],
        restaurants: [restaurant("Pastéis de Belém"), restaurant("Time Out Market"), restaurant("Cervejaria Ramiro"), restaurant("Taberna")],
      },
    });
    const cascais = place("卡斯凯什老城", 38.697, -9.4217);
    const result = await makeItinerary(input, {
      searchPlaces: async () => ({ data: [cascais] }),
      create: fakeCreate(
        JSON.stringify({
          days: [
            {
              day_index: 1,
              day_theme: "卡斯凯什",
              stops: [
                { name: "Hills Hotel Lisboa", kind: "stay" },
                { name: "Pastéis de Belém", kind: "meal", meal_slot: "lunch" },
                { kind: "meal", meal_slot: "dinner" },
                { name: "卡斯凯什老城", kind: "attraction" },
              ],
            },
            {
              day_index: 2,
              day_theme: "Alfama",
              stops: [
                { name: "Hills Hotel Lisboa", kind: "stay" },
                { name: "Time Out Market", kind: "meal", meal_slot: "lunch" },
                { kind: "meal", meal_slot: "dinner" },
                { name: "Castelo de São Jorge", kind: "attraction" },
              ],
            },
          ],
        }),
      ),
    });
    const backfill = result.candidates_slim.places.find((p) => p.name === "卡斯凯什老城");
    expect(backfill?.user_requested).toBe(true);
    expect(backfill && "must_see" in backfill).toBe(false);
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
                { kind: "meal", meal_slot: "dinner" },
              ],
            },
            {
              day_index: 2,
              day_theme: "卡斯凯什",
              stops: [
                { name: "Hills Hotel Lisboa", kind: "stay" },
                { name: "卡斯凯什老城", kind: "attraction" },
                { name: "Auto Dinner", kind: "meal", meal_slot: "lunch" },
                { kind: "meal", meal_slot: "dinner" },
              ],
            },
          ],
        }),
      ),
    });
    const names = result.skeleton.days.flatMap((d) => d.stops.map((s) => s.name));
    expect(names).toContain("卡斯凯什老城");
    expect(names).toContain("lunch");
    expect(names).not.toContain("Auto Lunch");
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
                        { kind: "meal", meal_slot: "dinner" },
                        { name: "Castelo de São Jorge", kind: "attraction" },
                      ],
                    },
                    {
                      day_index: 2,
                      day_theme: "more Alfama",
                      stops: [
                        { name: "Hills Hotel Lisboa", kind: "stay" },
                        { name: "Time Out Market", kind: "meal", meal_slot: "lunch" },
                        { kind: "meal", meal_slot: "dinner" },
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
            { kind: "meal", meal_slot: "dinner" },
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
            { kind: "meal", meal_slot: "dinner" },
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
            { kind: "meal", meal_slot: "dinner" },
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
            { kind: "meal", meal_slot: "dinner" },
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
            { kind: "meal", meal_slot: "dinner" },
          ],
        },
      ],
    };
    const mid = dropCityNameStops(reseatLateLunchStops(raw), "Lisbon");
    // S8: sole remaining attraction may keep lunch after it (split later).
    expect(validateSkeleton(mid, cityPool, [], "medium", "Lisbon").ok).toBe(true);
    const repaired = reseatLateLunchStops(mid);
    expect(validateSkeleton(repaired, cityPool, [], "medium", "Lisbon").ok).toBe(true);
    const attr = (repaired as { days: Array<{ stops: Array<{ kind?: string }> }> }).days[0]!.stops.filter(
      (s) => s.kind === "attraction",
    );
    expect(attr).toHaveLength(1);
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
    expect(msg).toMatch(/Never reuse the same attraction across days/);
    expect(msg).toMatch(/do not repeat venues/);
  });

  it("should_require_meal_slots_in_prompt_without_restaurant_catalog", () => {
    const input = baseInput({
      candidates: { places: [place("贝伦塔")], restaurants: [] },
    });
    const msg = buildSkeletonUserMessage(input);
    expect(msg).toMatch(/lunch meal slot/);
    expect(msg).not.toMatch(/Restaurant list is empty/);
    expect(msg).not.toMatch(/Restaurant candidates/);
    expect(msg).not.toMatch(/from the restaurant list/);
  });

  it("ADR-069: should_not_annotate_must_see_tags_in_skeleton_prompt", () => {
    const places = [place("Torre de Belém"), place("Mosteiro dos Jerónimos")];
    const input = baseInput({ candidates: { places, restaurants: [] } });
    input.candidates.places = places;
    const msg = buildSkeletonUserMessage(input);
    expect(msg).toMatch(/Torre de Belém/);
    expect(msg).toMatch(/Mosteiro dos Jerónimos/);
    expect(msg).not.toMatch(/\[must-see\]/);
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

  it("should_emit_meal_slots_without_restaurant_names", () => {
    const skeleton = buildFixtureSkeleton(baseInput());
    const meals = skeleton.days.flatMap((d) => d.stops.filter((s) => s.kind === "meal"));
    expect(meals.some((m) => m.meal_slot === "lunch")).toBe(true);
    expect(meals.every((m) => m.name === m.meal_slot)).toBe(true);
    expect(meals.every((m) => !baseInput().candidates.restaurants.some((r) => r.name === m.name))).toBe(
      true,
    );
  });

  it("ADR-069: should_keep_candidate_order_without_must_see_first_sort", () => {
    // Fixture schedules places in pool order — no must_see-first reorder.
    const generic = place("Generic Viewpoint");
    const iconic = place("Pena Palace");
    const input = baseInput({
      numDays: 1,
      candidates: { places: [generic, iconic], restaurants: [restaurant("Lunch")] },
    });
    const skeleton = buildFixtureSkeleton(input);
    const day1 = skeleton.days[0];
    const attractionNames = day1.stops
      .filter((s) => s.kind === "attraction")
      .map((s) => s.name);
    expect(attractionNames[0]).toBe("Generic Viewpoint");
    expect(attractionNames).toContain("Pena Palace");
  });

  it("TC-M21-83-01 should_keep_lisbon_pool_when_origin_is_far", async () => {
    const enriched = await enrichMakeItineraryInput(
      {
        city: "里斯本",
        numDays: 4,
        locale: "CN",
        origin: { name: "Hills Hotel Lisboa", lat: 22.186785, lng: 113.549525 },
        candidates: {
          places: [place("贝伦塔", 38.69, -9.21), place("城堡", 38.71, -9.13), place("MAAT", 38.69, -9.2)],
          restaurants: [],
        },
      },
      { geocode: async () => ({ lat: 38.7223, lng: -9.1393 }) },
    );
    expect(enriched.candidates.places.length).toBe(3);
    expect(enriched.placesBeforeGeoFilter).toBe(3);
    expect(enriched.origin?.lat).toBeUndefined();
    expect(enriched.origin?.name).toBe("Hills Hotel Lisboa");
  });

  it("TC-M22-84-02 should_drop_collection_cards_and_must_include_in_enrich", async () => {
    const enriched = await enrichMakeItineraryInput(
      baseInput({
        must_include: ["西湖十景"],
        candidates: {
          places: [
            place("西湖十景"),
            place("Torre de Belém"),
            place("Mosteiro dos Jerónimos"),
            place("Castelo de São Jorge"),
          ],
          restaurants: baseInput().candidates.restaurants,
        },
      }),
      {
        geocode: async () => ({ lat: 38.72, lng: -9.14 }),
        searchPlaces: async () => ({ data: [] }),
        searchRestaurants: async () => ({ data: [] }),
      },
    );
    expect(enriched.candidates.places.map((p) => p.name)).not.toContain("西湖十景");
    expect(enriched.must_include).toEqual([]);
  });

  it("TC-M21-83-02 should_reject_stay_only_using_pre_filter_pool_size", () => {
    const stayOnly = {
      days: [
        {
          day_index: 1,
          day_theme: "rest",
          stops: [{ name: "Hills Hotel Lisboa", kind: "stay" }],
        },
      ],
    };
    const result = validateSkeleton(
      stayOnly,
      { places: [], restaurants: [], stays: ["Hills Hotel Lisboa"] },
      [],
      "relaxed",
      "里斯本",
      40,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/stay-only/i);
  });
});

describe("enrichMakeItineraryInput registry cache-only (TC-T3-110a-05)", () => {
  it("should_not_merge_whole_city_registry_into_make_pool", async () => {
    const { createMemoryPoiRegistryStore, setPoiRegistryStore, upsertEligiblePois } =
      await import("./destination-poi-registry");
    const store = createMemoryPoiRegistryStore();
    setPoiRegistryStore(store);
    await upsertEligiblePois(
      [
        {
          provider: "GOOGLE_MAPS",
          name: "Mosteiro dos Jerónimos",
          location: { lat: 38.6979, lng: -9.2067, crs: "WGS84" },
          sources: [
            { provider: "GOOGLE_MAPS", native_id: "jer", deeplinks: { google_web: "https://maps.google.com/?q=2" } },
          ],
        },
      ],
      { city: "Lisbon", lat: 38.722, lng: -9.139 },
      store,
    );
    const enriched = await enrichMakeItineraryInput(
      baseInput({
        candidates: { places: [place("Torre de Belém")], restaurants: [] },
      }),
      { geocode: async () => ({ lat: 38.722, lng: -9.139 }) },
    );
    expect(enriched.candidates.places.map((p) => p.name)).toEqual(["Torre de Belém"]);
    expect(enriched.candidates.places.map((p) => p.name)).not.toContain(
      "Mosteiro dos Jerónimos",
    );
    setPoiRegistryStore(null);
  });
});

describe("F91 skeleton dinner + single-attraction split (TC-M23-91-04)", () => {
  it("should_require_dinner_on_relaxed_skeleton", () => {
    const skeleton = buildFixtureSkeleton(baseInput({ pace: "relaxed", numDays: 1 }));
    expect(
      skeleton.days[0]!.stops.some((s) => s.kind === "meal" && s.meal_slot === "dinner"),
    ).toBe(true);
    const result = validateSkeleton(
      skeleton,
      {
        places: baseInput().candidates.places,
        restaurants: baseInput().candidates.restaurants,
        stays: ["Hills Hotel Lisboa"],
      },
      [],
      "relaxed",
    );
    expect(result.ok).toBe(true);
  });

  it("should_not_insert_lunch_before_sole_attraction_on_reseat (S8)", () => {
    const raw = {
      days: [
        {
          day_index: 1,
          day_theme: "Cabo",
          stops: [
            { name: "Hills Hotel Lisboa", kind: "stay" },
            { name: "罗卡角", kind: "attraction" },
            { name: "lunch", kind: "meal", meal_slot: "lunch" },
            { name: "dinner", kind: "meal", meal_slot: "dinner" },
          ],
        },
      ],
    };
    // Lunch already after last attraction — reseat must keep it after, not before.
    const late = {
      days: [
        {
          day_index: 1,
          day_theme: "Cabo",
          stops: [
            { name: "Hills Hotel Lisboa", kind: "stay" },
            { name: "罗卡角", kind: "attraction" },
            { name: "dinner", kind: "meal", meal_slot: "dinner" },
            { name: "lunch", kind: "meal", meal_slot: "lunch" },
          ],
        },
      ],
    };
    const reseated = reseatLateLunchStops(late);
    const names = (reseated as { days: Array<{ stops: Array<{ name?: string; kind?: string; meal_slot?: string }> }> })
      .days[0]!.stops.map((s) => `${s.kind}:${s.meal_slot ?? s.name}`);
    expect(names.indexOf("meal:lunch")).toBeGreaterThan(names.indexOf("attraction:罗卡角"));
    expect(names.indexOf("meal:lunch")).toBeGreaterThan(names.indexOf("stay:Hills Hotel Lisboa"));

    const split = splitSingleAttractionDays(
      attachNativeIdsToSkeleton(reseatLateLunchStops(raw) as never, [
        place("罗卡角"),
      ]),
    );
    const kinds = split.days[0]!.stops.map((s) => `${s.kind}:${s.visit_part ?? s.meal_slot ?? ""}`);
    expect(kinds).toEqual([
      "stay:",
      "attraction:am",
      "meal:lunch",
      "attraction:pm",
      "meal:dinner",
    ]);
  });

  it("should_split_single_attraction_day_into_am_lunch_pm_dinner", () => {
    const torre = place("Torre de Belém");
    torre.sources = [{ provider: "GOOGLE_MAPS", native_id: "ChIJ_torre", deeplinks: {} }];
    const raw = {
      days: [
        {
          day_index: 1,
          day_theme: "Belém",
          stops: [
            { name: "Hills Hotel Lisboa", kind: "stay" },
            { name: "Torre de Belém", kind: "attraction", native_id: "ChIJ_torre", provider: "GOOGLE_MAPS" },
            { name: "lunch", kind: "meal", meal_slot: "lunch" },
            { name: "dinner", kind: "meal", meal_slot: "dinner" },
          ],
        },
      ],
    };
    const attached = attachNativeIdsToSkeleton(raw as never, [torre]);
    const split = splitSingleAttractionDays(attached);
    const kinds = split.days[0]!.stops.map((s) => `${s.kind}:${s.visit_part ?? s.meal_slot ?? ""}`);
    expect(kinds).toEqual([
      "stay:",
      "attraction:am",
      "meal:lunch",
      "attraction:pm",
      "meal:dinner",
    ]);
    const attrs = split.days[0]!.stops.filter((s) => s.kind === "attraction");
    expect(attrs[0]!.native_id).toBe("ChIJ_torre");
    expect(attrs[1]!.native_id).toBe("ChIJ_torre");
    const validated = validateSkeleton(
      split,
      {
        places: [torre, place("Mosteiro dos Jerónimos"), place("Castelo de São Jorge")],
        restaurants: [],
        stays: ["Hills Hotel Lisboa"],
      },
      [],
      "relaxed",
    );
    expect(validated.ok).toBe(true);
  });

  it("should_mention_dinner_for_every_pace_in_prompt", () => {
    const msg = buildSkeletonUserMessage(baseInput({ pace: "relaxed" }));
    expect(msg).toMatch(/Every day also needs a dinner/i);
  });
});

describe("buildSkeletonUserMessage traveler prefs (agent-itinerary-102 / 110b)", () => {
  it("should_include_season_context_and_display_names_without_season_rule_when_cn_family_kids (TC-T3-110b-01)", () => {
    const msg = buildSkeletonUserMessage(
      baseInput({
        locale: "CN",
        trip_type: "family_kids",
        party_size: 2,
        budget: "comfort",
        transit_preference: "transit_walk",
        other: "7岁儿童",
        bounds: { start: "2026-09-10", end: "2026-09-13" },
        start_time: "09:30",
        natural_language: undefined,
      }),
    );
    expect(msg).toMatch(/9月/);
    expect(msg).toMatch(/秋季/);
    // 2a-none: no formatNominateSeasonRule injection (glossary season line from 110e may remain)
    expect(msg).not.toMatch(/不要因季节硬删|四季可游|候选池内已有名称不要因季节/);
    expect(msg).not.toMatch(
      /Do not drop names that are already in the candidate pool solely for season|prefer year-round experiences/i,
    );
    expect(msg).toMatch(/亲子玩乐/);
    expect(msg).not.toMatch(/family_kids/);
    expect(msg).toMatch(/2人|party/i);
    expect(msg).toMatch(/舒适/);
    expect(msg).toMatch(/其他：7岁儿童/);
    expect(msg).not.toMatch(/其他（偏好）/);
    expect(msg).not.toMatch(/HARD MUST INCLUDE[\s\S]*7岁儿童/);
  });

  it("should_label_other_as_Other_without_preference_when_en (TC-T3-110b-01)", () => {
    const msg = buildSkeletonUserMessage(
      baseInput({
        locale: "EN",
        other: "no museums",
        natural_language: undefined,
      }),
    );
    expect(msg).toMatch(/Other: no museums/);
    expect(msg).not.toMatch(/Other \(preference\)/);
  });

  it("should_pass_through_custom_trip_type_探访历史", () => {
    const msg = buildSkeletonUserMessage(
      baseInput({
        locale: "CN",
        trip_type: "探访历史",
        natural_language: undefined,
      }),
    );
    expect(msg).toMatch(/探访历史/);
  });

  it("should_show_mid_budget_display_not_only_budget_premium", () => {
    const msg = buildSkeletonUserMessage(
      baseInput({
        locale: "CN",
        budget: "mid",
        natural_language: undefined,
      }),
    );
    expect(msg).toMatch(/适中/);
    expect(msg).not.toMatch(/Budget: mid\./);
  });

  it("should_keep_seasonal_pool_names_as_context_without_season_hard_rule (TC-T3-110b-01)", () => {
    const places = [place("断桥残雪"), place("灵隐寺")];
    const msg = buildSkeletonUserMessage(
      baseInput({
        locale: "CN",
        city: "杭州",
        bounds: { start: "2026-09-10", end: "2026-09-12" },
        candidates: { places, restaurants: [] },
        natural_language: undefined,
      }),
    );
    expect(msg).toMatch(/断桥残雪/);
    expect(msg).toMatch(/秋季|9月/);
    expect(msg).not.toMatch(/不要因季节硬删|四季可游|候选池内已有名称不要因季节/);
    expect(msg).not.toMatch(/must drop|remove 断桥|强制删除断桥/);
  });
});

describe("buildSkeletonUserMessage kids rank (agent-itinerary-107)", () => {
  it("should_prefer_pool_park_shaped_cards_when_family_kids (TC-T3-107-01)", () => {
    const msg = buildSkeletonUserMessage(
      baseInput({
        locale: "CN",
        trip_type: "family_kids",
        other: "7岁儿童",
        natural_language: undefined,
      }),
    );
    expect(msg).toMatch(/乐园|水族馆|动物园|游乐场|公园/);
    expect(msg).toMatch(/不要发明池外地名|候选池/);
    expect(msg).not.toMatch(/必须安排迪士尼|must include Disney/i);
  });
});

describe("Takeoff-11 full prompt intake (agent-itinerary-109)", () => {
  it("should_include_iso_date_range_in_traveler_block (TC-T3-109-01)", () => {
    const msg = buildSkeletonUserMessage(
      baseInput({
        locale: "CN",
        bounds: { start: "2026-09-10", end: "2026-09-13" },
        natural_language: undefined,
      }),
    );
    expect(msg).toMatch(/2026-09-10/);
    expect(msg).toMatch(/2026-09-13/);
    expect(msg).toMatch(/日期|Dates/i);
    expect(msg).toMatch(/秋季|9月/);
  });

  it("should_label_start_time_and_transit_as_soft_prefs (TC-T3-109-04)", () => {
    const msg = buildSkeletonUserMessage(
      baseInput({
        locale: "CN",
        start_time: "09:30",
        transit_preference: "transit_walk",
        natural_language: undefined,
      }),
    );
    expect(msg).toMatch(/09:30/);
    expect(msg).toMatch(/公交|地铁/);
    expect(msg).toMatch(/后续填细节/);
    expect(msg).toMatch(/不要在骨架 JSON/);
    expect(msg).toMatch(/NO times/);
    expect(msg).toMatch(/NO transit/);
  });

  it("should_omit_dates_when_bounds_empty (TC-T3-109-05)", () => {
    const msg = buildSkeletonUserMessage(
      baseInput({
        locale: "CN",
        bounds: undefined,
        budget: undefined,
        natural_language: undefined,
      }),
    );
    expect(msg).not.toMatch(/日期：|Dates:/);
    expect(msg).not.toMatch(/\d{4}-\d{2}-\d{2}至\d{4}-\d{2}-\d{2}/);
  });
});

