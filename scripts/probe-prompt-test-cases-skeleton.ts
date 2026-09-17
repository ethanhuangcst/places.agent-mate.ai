/**
 * End-to-end skeleton probe for specs/agent-specs/prompt-test-case.md (12 cases).
 * Validates 110e soft gates + 110a OptA discovery on real takeoff inputs.
 * Covers provider routing (AMAP / Google / HK dual), POI density edge
 * (expand-radius), cross-script name matching, locales (CN/EN), and
 * no-origin geocode fallback.
 *
 * Cost strategy: 7 AMAP cases (free) + 5 Google cases (opt-in, probe cache).
 * Run Google cases with PLACES_PROBE_CACHE_DIR + GOOGLE_DAILY_BUDGET_CALLS.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/probe-prompt-test-cases-skeleton.ts
 *   npx tsx --env-file=.env.local scripts/probe-prompt-test-cases-skeleton.ts test4
 *
 * Output: tmp/probe-prompt-test-cases-skeleton.json
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { generateCallerSecret } from "../src/core/crypto";
import { prisma } from "../src/db/client";
import { planTrip } from "../src/core/plan-trip";
import { fetchTripDetails } from "../src/core/fetch-trip-details";
import { attractionDwellMinutes } from "../src/core/attraction-dwell";
import type { Locale } from "../src/core/locales";

/** Destination-agnostic theme-park name hint for probe reporting only (ADR-042). */
function looksLikeThemePark(name: string): boolean {
  return /乐园|游乐园|主題公園|主题公园|theme.?park|amusement|disney|迪士尼|universal|欢乐谷|海洋公园|动物园|aquarium/i.test(
    name,
  );
}

type Case = {
  id: string;
  city: string;
  locale: Locale;
  date: string;
  trip_type: string;
  numDays: number;
  party_size: number;
  budget: string;
  pace: "tight" | "medium" | "relaxed";
  transit: string;
  origin: string;
  start_time: string;
  other: string;
};

/** Aligned with specs/agent-specs/prompt-test-case.md */
const CASES: Case[] = [
  {
    id: "test1",
    city: "上海",
    locale: "CN",
    date: "2026-09-16",
    trip_type: "family_kids",
    numDays: 3,
    party_size: 3,
    budget: "mid",
    pace: "medium",
    transit: "drive_walk",
    origin: "上海虹桥中心爱琴海亚朵S酒店",
    start_time: "09:00",
    other: "7岁男孩",
  },
  {
    id: "test2",
    city: "杭州",
    locale: "CN",
    date: "2026-09-16",
    trip_type: "couple_romance",
    numDays: 3,
    party_size: 2,
    budget: "luxury",
    pace: "relaxed",
    transit: "drive_walk",
    origin: "SFEEL设计师酒店(杭州西湖武林广场店)",
    start_time: "09:00",
    other: "",
  },
  {
    id: "test3",
    city: "西安",
    locale: "CN",
    date: "2026-09-16",
    trip_type: "city",
    numDays: 3,
    party_size: 3,
    budget: "mid",
    pace: "tight",
    transit: "transit_walk",
    origin: "",
    start_time: "09:00",
    other: "探访历史",
  },
  {
    id: "test4",
    city: "里斯本",
    locale: "CN",
    date: "2026-09-16",
    trip_type: "couple_romance",
    numDays: 4,
    party_size: 2,
    budget: "luxury",
    pace: "medium",
    transit: "transit_walk",
    origin: "Hills Hotel Lisboa",
    start_time: "07:00",
    other: "",
  },
  {
    id: "test5",
    city: "东京",
    locale: "CN",
    date: "2026-09-16",
    trip_type: "solo",
    numDays: 3,
    party_size: 1,
    budget: "mid",
    pace: "tight",
    transit: "transit_walk",
    origin: "Hotel Monterey Lasoeur Ginza",
    start_time: "08:00",
    other: "80年代动漫粉丝，动漫主题度假",
  },
  {
    id: "test6",
    city: "成都",
    locale: "CN",
    date: "2026-09-16",
    trip_type: "food_checkin",
    numDays: 2,
    party_size: 2,
    budget: "mid",
    pace: "medium",
    transit: "transit_walk",
    origin: "成都博舍",
    start_time: "10:00",
    other: "川菜和小吃探店",
  },
  {
    id: "test7",
    city: "北京",
    locale: "CN",
    date: "2026-09-16",
    trip_type: "family_vacation",
    numDays: 5,
    party_size: 4,
    budget: "comfort",
    pace: "relaxed",
    transit: "drive_walk",
    origin: "北京王府井文华东方酒店",
    start_time: "09:00",
    other: "含老人，节奏慢",
  },
  {
    id: "test8",
    city: "厦门",
    locale: "CN",
    date: "2026-09-16",
    trip_type: "friends",
    numDays: 3,
    party_size: 4,
    budget: "economy",
    pace: "medium",
    transit: "transit_walk",
    origin: "",
    start_time: "09:30",
    other: "海边和文艺景点",
  },
  {
    id: "test9",
    city: "深圳",
    locale: "CN",
    date: "2026-09-16",
    trip_type: "business",
    numDays: 2,
    party_size: 1,
    budget: "comfort",
    pace: "tight",
    transit: "drive_walk",
    origin: "深圳柏悦酒店",
    start_time: "08:00",
    other: "白天会议，晚上自由",
  },
  {
    id: "test10",
    city: "香港",
    locale: "CN",
    date: "2026-09-16",
    trip_type: "family_kids",
    numDays: 3,
    party_size: 3,
    budget: "mid",
    pace: "medium",
    transit: "transit_walk",
    origin: "香港中环文华东方酒店",
    start_time: "09:00",
    other: "8岁女孩",
  },
  {
    id: "test11",
    city: "曼谷",
    locale: "EN",
    date: "2026-09-16",
    trip_type: "friends",
    numDays: 4,
    party_size: 3,
    budget: "economy",
    pace: "relaxed",
    transit: "transit_walk",
    origin: "",
    start_time: "10:00",
    other: "夜市和寺庙",
  },
  {
    id: "test12",
    city: "台北",
    locale: "CN",
    date: "2026-09-16",
    trip_type: "city",
    numDays: 3,
    party_size: 2,
    budget: "comfort",
    pace: "medium",
    transit: "transit_walk",
    origin: "台北晶华酒店",
    start_time: "09:00",
    other: "",
  },
];

function endDate(start: string, numDays: number): string {
  const d = new Date(`${start}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Math.max(0, numDays - 1));
  return d.toISOString().slice(0, 10);
}

async function ensureCallerKey(): Promise<string> {
  const generated = generateCallerSecret();
  await prisma.callerApiKey.create({
    data: {
      name: `probe-ptc-${Date.now()}`,
      keyHash: generated.keyHash,
      prefix: generated.prefix,
      secret: generated.secret,
      status: "ACTIVE",
    },
  });
  return generated.secret;
}

function expandRadiusAsked(
  result: { need_input?: { questions?: Array<{ id?: string }> } },
): boolean {
  return Boolean(
    result.need_input?.questions?.some((q) => q.id === "expand_radius"),
  );
}

async function runCase(tc: Case, callerKey: string) {
  const t0 = performance.now();
  const baseInput = {
    callerKey,
    city: tc.city,
    locale: tc.locale,
    numDays: tc.numDays,
    origin: tc.origin ? { name: tc.origin } : undefined,
    pace: tc.pace,
    budget: tc.budget,
    transit_preference: tc.transit,
    trip_type: tc.trip_type,
    party_size: tc.party_size,
    bounds: { start: tc.date, end: endDate(tc.date, tc.numDays) },
    start_time: tc.start_time,
    other: tc.other,
    skeleton_only: true as const,
  };
  let result = await planTrip(baseInput);
  const expandAsked = expandRadiusAsked(result);
  let expandAffirmed = false;
  if (expandAsked && result.trip_id) {
    result = await planTrip({
      ...baseInput,
      trip_id: result.trip_id,
      answers: { expand_radius: "yes" },
    });
    expandAffirmed = true;
  }
  const ms = Math.round(performance.now() - t0);

  const fetched = await fetchTripDetails({
    callerKey,
    trip_id: result.trip_id,
    fields: ["skeleton", "candidates"],
  });
  const skeleton = (fetched.data.skeleton ?? result.itinerary?.skeleton) as {
    days?: Array<{
      day_index: number;
      day_theme?: string;
      stops?: Array<{
        name?: string;
        kind?: string;
        meal_slot?: string;
        visit_part?: string;
      }>;
    }>;
  } | undefined;
  const places =
    (fetched.data.candidates as {
      places?: Array<{
        name?: string;
        sources?: Array<{ provider?: string; native_id?: string }>;
      }>;
    } | undefined)?.places ?? [];
  const poolProviders = [
    ...new Set(
      places.flatMap((p) =>
        (p.sources ?? []).map((s) => s.provider).filter((x): x is string => Boolean(x)),
      ),
    ),
  ];
  const poolNativeIds = places.filter((p) =>
    (p.sources ?? []).some((s) => Boolean(s.native_id)),
  ).length;

  const days = (skeleton?.days ?? []).map((d) => {
    const stops = d.stops ?? [];
    const attractions = stops.filter((s) => s.kind === "attraction");
    const themeParks = attractions.filter(
      (s) => s.name && looksLikeThemePark(s.name),
    );
    return {
      day_index: d.day_index,
      day_theme: d.day_theme,
      attraction_count: attractions.length,
      stop_count: stops.length,
      theme_park_stops: themeParks.map((s) => s.name),
      stops: stops.map((s) => ({
        kind: s.kind,
        name: s.name ?? null,
        meal_slot: s.meal_slot ?? null,
        visit_part: s.visit_part ?? null,
        dwell_min:
          s.kind === "attraction" && s.name
            ? attractionDwellMinutes({
                provider: "GOOGLE_MAPS",
                name: s.name,
                location: { lat: 0, lng: 0, crs: "WGS84" },
                sources: [],
              })
            : null,
      })),
    };
  });

  const singleAttractionDays = days.filter((d) => d.attraction_count === 1);
  const themeParkFullDays = days.filter(
    (d) => d.theme_park_stops.length >= 1 && d.attraction_count <= 2,
  );

  return {
    id: tc.id,
    city: tc.city,
    status: result.status,
    trip_id: result.trip_id,
    ms,
    expand_asked: expandAsked,
    expand_affirmed: expandAffirmed,
    pool_places: places.length,
    pool_native_ids: poolNativeIds,
    pool_providers: poolProviders,
    pool_theme_parks: places
      .filter((p) => p.name && looksLikeThemePark(p.name))
      .map((p) => p.name),
    days,
    single_attraction_days: singleAttractionDays.map((d) => d.day_index),
    theme_park_full_days: themeParkFullDays.map((d) => ({
      day_index: d.day_index,
      parks: d.theme_park_stops,
    })),
    error: result.status === "failed" ? (result as { error?: string }).error : undefined,
  };
}

async function main() {
  const onlyId = process.argv[2]?.trim();
  const runCases = onlyId ? CASES.filter((c) => c.id === onlyId) : CASES;
  if (!runCases.length) {
    console.error(`Unknown case id: ${onlyId}`);
    process.exit(1);
  }

  const callerKey = await ensureCallerKey();
  console.log(
    JSON.stringify({
      probe: "prompt-test-cases-skeleton",
      n: runCases.length,
      model: process.env.OPENAI_CHAT_MODEL,
    }),
  );

  const rows = [];
  for (const tc of runCases) {
    process.stderr.write(`\n=== ${tc.id} ${tc.city} ===\n`);
    try {
      const row = await runCase(tc, callerKey);
      rows.push(row);
      console.log(
        JSON.stringify({
          id: row.id,
          status: row.status,
          ms: row.ms,
          expand_asked: row.expand_asked,
          pool: row.pool_places,
          providers: row.pool_providers,
          days: row.days.map((d) => ({
            i: d.day_index,
            attrs: d.attraction_count,
            parks: d.theme_park_stops,
          })),
          single_attr_days: row.single_attraction_days,
          theme_park_full_days: row.theme_park_full_days,
        }),
      );
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      rows.push({ id: tc.id, city: tc.city, error: err });
      console.log(JSON.stringify({ id: tc.id, error: err }));
    }
  }

  const out = join(process.cwd(), "tmp", "probe-prompt-test-cases-skeleton.json");
  mkdirSync(join(process.cwd(), "tmp"), { recursive: true });
  writeFileSync(
    out,
    JSON.stringify({ as_of: new Date().toISOString(), cases: rows }, null, 2),
  );
  console.log(`\nwrote ${out}`);
  await prisma.$disconnect();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .then(() => process.exit(0));
