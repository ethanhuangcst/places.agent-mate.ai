/**
 * T5 probe: plan_trip full loop (skeleton_only=false) for prompt-test-case.md cases.
 * Reads inline itinerary.filledStops (grouped by day) + skeleton for completeness.
 * Metrics per filled day: stops filled, last end time, total transit min, direction reversals, lunch/dinner.
 *
 * Usage: npx tsx --env-file=.env.local scripts/probe-t5-fill-review.ts [caseId...]
 */
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

type Case = {
  id: string; city: string; locale: "EN" | "CN" | "HK" | "TW";
  days: number; party: number; trip_type: string; budget: string;
  pace: "tight" | "medium" | "relaxed"; transit: string;
  origin?: { name: string }; start_time: string; other?: string;
  bounds: { start: string; end: string };
};

const START = "2026-09-20";
function endDate(days: number): string {
  const d = new Date(START); d.setDate(d.getDate() + days - 1); return d.toISOString().slice(0, 10);
}

const CASES: Case[] = [
  { id: "shanghai", city: "上海", locale: "CN", days: 3, party: 3, trip_type: "family_kids", budget: "mid", pace: "medium", transit: "drive_walk", origin: { name: "上海虹桥中心爱琴海亚朵S酒店" }, start_time: "09:00", other: "7岁男孩", bounds: { start: START, end: endDate(3) } },
  { id: "hangzhou", city: "杭州", locale: "CN", days: 3, party: 2, trip_type: "couple_romance", budget: "luxury", pace: "relaxed", transit: "drive_walk", origin: { name: "SFEEL设计师酒店(杭州西湖武林广场店)" }, start_time: "09:00", bounds: { start: START, end: endDate(3) } },
  { id: "taipei", city: "台北", locale: "TW", days: 3, party: 2, trip_type: "city", budget: "mid", pace: "medium", transit: "transit_walk", origin: { name: "台北晶华酒店" }, start_time: "09:00", bounds: { start: START, end: endDate(3) } },
  { id: "xian", city: "西安", locale: "CN", days: 3, party: 3, trip_type: "city", budget: "mid", pace: "tight", transit: "transit_walk", start_time: "09:00", other: "探访历史", bounds: { start: START, end: endDate(3) } },
  { id: "lisbon", city: "Lisbon", locale: "EN", days: 3, party: 2, trip_type: "couple_romance", budget: "luxury", pace: "medium", transit: "transit_walk", origin: { name: "Hills Hotel Lisboa" }, start_time: "07:00", bounds: { start: START, end: endDate(3) } },
  { id: "tokyo", city: "东京", locale: "CN", days: 3, party: 1, trip_type: "solo", budget: "mid", pace: "tight", transit: "transit_walk", origin: { name: "Hotel Monterey Lasoeur Ginza" }, start_time: "08:00", other: "80年代动漫粉丝，动漫主题度假", bounds: { start: START, end: endDate(3) } },
  { id: "jiangyin", city: "江阴", locale: "CN", days: 14, party: 2, trip_type: "city", budget: "mid", pace: "medium", transit: "transit_walk", start_time: "09:00", bounds: { start: START, end: endDate(14) } },
];

const BASE = process.env.PLAN_TRIP_BASE ?? `http://127.0.0.1:${process.env.PORT ?? "3010"}`;

function issueKey(): string {
  if (process.env.CALLER_KEY?.trim()) return process.env.CALLER_KEY.trim();
  const out = execSync("npx tsx --env-file=.env.local scripts/issue-caller-key.ts t5-probe", { encoding: "utf8" });
  return (JSON.parse(out) as { secret: string }).secret;
}

async function postJson(path: string, secret: string, body: unknown, timeoutMs = 600_000) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}${path}`, { method: "POST", headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctrl.signal });
    const json = await res.json(); return { httpStatus: res.status, json };
  } finally { clearTimeout(t); }
}

function bodyFor(c: Case) {
  return { city: c.city, locale: c.locale, numDays: c.days, origin: c.origin, pace: c.pace, budget: c.budget, transit_preference: c.transit, trip_type: c.trip_type, party_size: c.party, start_time: c.start_time, other: c.other, skeleton_only: false, bounds: c.bounds };
}

type FilledStop = {
  day_index: number; stop_index: number;
  stop: {
    name?: string;
    kind?: string;
    meal_slot?: string;
    card?: {
      name?: string;
      rating?: number;
      user_ratings_total?: number;
      category?: string;
      location?: { lat?: number; lng?: number };
    };
  };
  slot?: { start?: string; end?: string };
  legs?: Array<{ mode?: string; duration_min?: number; source?: string }>;
  notes?: string[];
};

type SkeletonDay = { day_index?: number; day_theme?: string; stops?: Array<{ name?: string; kind?: string; meal_slot?: string }> };

function hhmmToMin(s?: string): number | undefined {
  if (!s || !/^\d{2}:\d{2}$/.test(s)) return undefined;
  const [h, m] = s.split(":").map(Number); return h * 60 + m;
}

function dayMetrics(stops: FilledStop[]) {
  const attractions = stops.filter((s) => s.stop.kind === "attraction");
  const meals = stops.filter((s) => s.stop.kind === "meal");
  const ends = stops.map((s) => hhmmToMin(s.slot?.end)).filter((x): x is number => x != null);
  const lastEnd = ends.length ? ends[ends.length - 1] : undefined;
  const totalTransitMin = stops.reduce((sum, s) => sum + (s.legs?.[0]?.duration_min ?? 0), 0);
  const coords = stops
    .filter((s) => s.stop.card?.location?.lat != null && s.stop.card?.location?.lng != null)
    .map((s) => ({ lat: s.stop.card!.location!.lat!, lng: s.stop.card!.location!.lng! }));
  let reversals = 0;
  for (let i = 2; i < coords.length; i++) {
    const a = coords[i - 2], b = coords[i - 1], c = coords[i];
    if ((b.lng - a.lng) * (c.lng - b.lng) < 0 || (b.lat - a.lat) * (c.lat - b.lat) < 0) reversals++;
  }
  const mealVenues = meals.map((m) => ({
    slot: m.stop.meal_slot ?? m.stop.name,
    name: m.stop.card?.name ?? m.stop.name,
    rating: m.stop.card?.rating,
    user_ratings_total: m.stop.card?.user_ratings_total,
    category: m.stop.card?.category,
    notes: m.notes ?? [],
  }));
  return {
    filledStops: stops.length,
    attractions: attractions.length,
    meals: meals.length,
    mealVenues,
    lastEndTime: lastEnd != null ? `${Math.floor(lastEnd / 60)}:${String(lastEnd % 60).padStart(2, "0")}` : undefined,
    totalTransitMin,
    reversals,
    hasLunch: meals.some((m) => m.stop.meal_slot === "lunch"),
    hasDinner: meals.some((m) => m.stop.meal_slot === "dinner"),
  };
}

async function runOne(c: Case, secret: string) {
  const t0 = Date.now();
  let res = await postJson("/v1/plan_trip", secret, bodyFor(c));
  let env = res.json as {
    ok?: boolean;
    data?: {
      trip_id?: string;
      status?: string;
      need_input?: { questions?: Array<{ id: string }> };
      deviations?: unknown[];
      itinerary?: { filledStops?: FilledStop[]; skeleton?: { days?: SkeletonDay[] } };
      tool_calls?: string[];
      timing?: Record<string, number>;
    };
  };
  let elapsed = +((Date.now() - t0) / 1000).toFixed(1);
  let data = env.data;
  if (res.httpStatus >= 400 || !env.ok || !data?.trip_id) {
    return { id: c.id, error: "plan_trip failed", httpStatus: res.httpStatus, body: env, elapsed };
  }

  // MVP-T5 TD-4: resume hotel / expand_radius answers on same trip_id.
  const HOTEL_BY_CITY: Record<string, string> = {
    // Prefer skip for reliable skeleton path; named hotels may loop on resolve_origin_stay (provider).
    xian: "skip",
    jiangyin: "skip",
  };
  let guard = 0;
  while (data.status === "needs_input" && guard < 3) {
    guard += 1;
    const qid = data.need_input?.questions?.[0]?.id;
    const answers: Record<string, string> = {};
    if (qid === "hotel") {
      answers.hotel = HOTEL_BY_CITY[c.id] ?? "skip";
    } else if (qid === "expand_radius") {
      answers.expand_radius = "no";
    } else {
      return {
        id: c.id,
        status: "needs_input",
        tripId: data.trip_id,
        question: qid,
        elapsed,
      };
    }
    res = await postJson("/v1/plan_trip", secret, {
      ...bodyFor(c),
      trip_id: data.trip_id,
      answers,
    });
    env = res.json as typeof env;
    elapsed = +((Date.now() - t0) / 1000).toFixed(1);
    data = env.data;
    if (res.httpStatus >= 400 || !env.ok || !data?.trip_id) {
      return { id: c.id, error: "plan_trip failed on answers resume", httpStatus: res.httpStatus, body: env, elapsed };
    }
  }

  if (data.status === "needs_input") {
    return {
      id: c.id,
      status: "needs_input",
      tripId: data.trip_id,
      question: data.need_input?.questions?.[0]?.id,
      elapsed,
    };
  }

  const filled = data.itinerary?.filledStops ?? [];
  const skDays = data.itinerary?.skeleton?.days ?? [];
  const skeletonStopTotal = skDays.reduce((n, d) => n + (d.stops?.length ?? 0), 0);
  const byDay = new Map<number, FilledStop[]>();
  for (const f of filled) {
    const arr = byDay.get(f.day_index) ?? [];
    arr.push(f);
    byDay.set(f.day_index, arr);
  }
  const perDay = [...byDay.keys()].sort((a, b) => a - b).map((di) => ({
    day: di,
    theme: skDays.find((d) => d.day_index === di)?.day_theme,
    metrics: dayMetrics(byDay.get(di) ?? []),
  }));
  return {
    id: c.id,
    city: c.city,
    status: data.status,
    tripId: data.trip_id,
    elapsed,
    timing: data.timing,
    fillCompleteness: {
      filledStops: filled.length,
      skeletonStops: skeletonStopTotal,
      pct: skeletonStopTotal ? +((filled.length / skeletonStopTotal) * 100).toFixed(0) : 0,
    },
    toolCalls: data.tool_calls,
    deviations: data.deviations,
    days: perDay,
  };
}

async function main() {
  const ids = process.argv.slice(2);
  const selected = ids.length ? CASES.filter((c) => ids.includes(c.id)) : CASES;
  const secret = issueKey();
  const results: unknown[] = [];
  for (const c of selected) {
    process.stdout.write(`probing ${c.id} (${c.city}, ${c.days}d)... `);
    try {
      const r = await runOne(c, secret);
      results.push(r);
      const rr = r as { status?: string; error?: string; fillCompleteness?: { filledStops: number; skeletonStops: number; pct: number } };
      process.stdout.write(`${rr.error ?? rr.status ?? "?"} fill=${rr.fillCompleteness?.filledStops ?? 0}/${rr.fillCompleteness?.skeletonStops ?? 0} (${rr.fillCompleteness?.pct ?? 0}%)\n`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      results.push({ id: c.id, error: msg });
      process.stdout.write(`error: ${msg.slice(0, 150)}\n`);
    }
  }
  const outDir = join(process.cwd(), "tmp"); mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "probe-t5-fill-review.json"), JSON.stringify(results, null, 2));
  process.stdout.write("\n=== SUMMARY ===\n");
  for (const r of results) {
    const rr = r as {
      id: string;
      status?: string;
      error?: string;
      elapsed?: number;
      question?: string;
      fillCompleteness?: { filledStops: number; skeletonStops: number; pct: number };
      timing?: Record<string, number>;
      days?: Array<{
        day: number;
        theme?: string;
        metrics: {
          filledStops: number;
          attractions: number;
          meals: number;
          lastEndTime?: string;
          totalTransitMin: number;
          reversals: number;
          hasLunch: boolean;
          hasDinner: boolean;
        };
      }>;
    };
    if (rr.error) {
      process.stdout.write(`${rr.id}: ERROR ${rr.error.slice(0, 100)}\n`);
      continue;
    }
    if (rr.status === "needs_input") {
      process.stdout.write(`${rr.id}: needs_input question=${rr.question ?? "?"} elapsed=${rr.elapsed}s\n`);
      continue;
    }
    const fc = rr.fillCompleteness ?? { filledStops: 0, skeletonStops: 0, pct: 0 };
    process.stdout.write(
      `${rr.id}: ${rr.status} elapsed=${rr.elapsed}s fill=${fc.filledStops}/${fc.skeletonStops}(${fc.pct}%) skeleton=${rr.timing?.skeleton_s ?? "?"}s fill_t=${rr.timing?.fill_s ?? "?"}s\n`,
    );
    for (const d of rr.days ?? []) {
      const m = d.metrics as {
        filledStops: number;
        attractions: number;
        meals: number;
        lastEndTime?: string;
        totalTransitMin: number;
        reversals: number;
        hasLunch: boolean;
        hasDinner: boolean;
        mealVenues?: Array<{
          slot?: string;
          name?: string;
          rating?: number;
          user_ratings_total?: number;
          notes?: string[];
        }>;
      };
      process.stdout.write(
        `  D${d.day} [${d.theme ?? "?"}]: filled=${m.filledStops} attr=${m.attractions} meals=${m.meals} lastEnd=${m.lastEndTime ?? "?"} transit=${m.totalTransitMin}min reversals=${m.reversals} lunch=${m.hasLunch} dinner=${m.hasDinner}\n`,
      );
      for (const mv of m.mealVenues ?? []) {
        const r = mv.rating != null ? String(mv.rating) : "—";
        const n = mv.user_ratings_total != null ? String(mv.user_ratings_total) : "—";
        const notes = (mv.notes ?? []).length ? ` notes=${mv.notes!.join(",")}` : "";
        process.stdout.write(`    meal ${mv.slot}: ${mv.name} rating=${r} reviews=${n}${notes}\n`);
      }
    }
  }
}

void main().catch((e) => { console.error(e); process.exit(1); });
