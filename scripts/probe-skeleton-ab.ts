/**
 * TBD-1 §2.6 A/B probe: one-shot make_itinerary vs per-day concurrent LLM + deterministic merge.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/probe-skeleton-ab.ts
 *   npx tsx --env-file=.env.local scripts/probe-skeleton-ab.ts --cities Tokyo,Lisbon --days 5,4
 *
 * Output: tmp/probe-skeleton-ab.json + stdout summary
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { discoverPlaces } from "../src/core/itinerary-planner";
import {
  createSkeletonChatCreate,
  llmSkeletonTimeoutMs,
  makeItinerary,
  validateSkeleton,
  remapStopNamesToPool,
  trimAreaAliasStops,
  reseatLateLunchStops,
  reseatStayToDayOrigin,
  dropCityNameStops,
  trimPaceOverages,
  type MakeItineraryInput,
  type ItinerarySkeleton,
  type SkeletonChatCreate,
} from "../src/core/make-itinerary";
import { assembleSystemPrompt } from "../src/agent/prompt-assembler";
import { loadGlossary } from "../src/agent/loop";
import { parseLocale, type Locale } from "../src/core/locales";
import type { PlaceCard } from "../src/core/types";

const OUT = join(process.cwd(), "tmp", "probe-skeleton-ab.json");

type Scenario = { city: string; numDays: number; pace: "medium" | "tight" | "relaxed"; must_include?: string[] };

const DEFAULT_SCENARIOS: Scenario[] = [
  { city: "Tokyo", numDays: 5, pace: "medium" },
  { city: "Lisbon", numDays: 4, pace: "relaxed", must_include: ["Belém", "Sintra"] },
  { city: "Bangkok", numDays: 2, pace: "tight" },
  { city: "Paris", numDays: 3, pace: "medium", must_include: ["Versailles"] },
  { city: "Hanoi", numDays: 2, pace: "tight" },
];

function ms(t0: number) {
  return Math.round(performance.now() - t0);
}

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1]!.trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return text.trim();
}

function extractText(completion: unknown): string | null {
  const text = (completion as { choices?: Array<{ message?: { content?: string | null } }> })
    ?.choices?.[0]?.message?.content;
  return typeof text === "string" && text.trim() ? text.trim() : null;
}

async function withAbortTimeout<T>(timeoutMs: number, fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fn(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

function candidateLine(card: PlaceCard): string {
  const loc = card.location;
  const coord = loc?.lat != null && loc?.lng != null ? ` (${loc.lat}, ${loc.lng})` : "";
  const rating = typeof card.rating === "number" ? ` rating ${card.rating}` : "";
  const mustSee = card.must_see ? " [must-see]" : "";
  return `- ${card.name}${coord}${rating}${mustSee}`;
}

function paceLimit(pace?: string): number {
  if (pace === "tight") return 6;
  if (pace === "relaxed") return 4;
  return 5;
}

/** Round-robin must_include tokens onto days (deterministic pre-assign). */
function assignMustInclude(must: string[], numDays: number): string[][] {
  const out = Array.from({ length: numDays }, () => [] as string[]);
  must.forEach((t, i) => {
    if (t.trim()) out[i % numDays]!.push(t.trim());
  });
  return out;
}

/** Slice attraction pool into per-day focus lists (sorted must_see / rating). */
function focusSlices(places: PlaceCard[], numDays: number): PlaceCard[][] {
  const sorted = [...places].sort((a, b) => {
    const ms = Number(!!b.must_see) - Number(!!a.must_see);
    if (ms !== 0) return ms;
    return (b.rating ?? 0) - (a.rating ?? 0);
  });
  const slices = Array.from({ length: numDays }, () => [] as PlaceCard[]);
  sorted.forEach((p, i) => slices[i % numDays]!.push(p));
  return slices;
}

function buildDayUserMessage(opts: {
  city: string;
  dayIndex: number;
  numDays: number;
  pace?: string;
  locale: Locale;
  originName?: string;
  mustForDay: string[];
  focus: PlaceCard[];
  allPlaces: PlaceCard[];
  restaurants: PlaceCard[];
  excludeNames: string[];
}): string {
  const limit = paceLimit(opts.pace);
  const hasR = opts.restaurants.length > 0;
  const parts: string[] = [];
  parts.push(
    `Create ONE day (day_index=${opts.dayIndex}) stop-order skeleton for a ${opts.numDays}-day trip in ${opts.city}. ` +
      `Order only — NO times, NO transit. Only choose stops from the candidate lists.`,
  );
  parts.push(
    `Pace: ${opts.pace ?? "medium"} (≤ ${limit} attraction stops this day). ` +
      (hasR
        ? `Include a lunch stop at midday (not after the last attraction); medium/tight also dinner.`
        : `No restaurants — omit meals.`),
  );
  parts.push(`Never schedule the city name "${opts.city}" as a stop.`);
  parts.push(`Return ONLY JSON: {"day_index":${opts.dayIndex},"day_theme":"...","stops":[{"name","kind","meal_slot?"}]}`);
  if (opts.originName) {
    parts.push(`First stop must be stay named "${opts.originName}".`);
  }
  if (opts.mustForDay.length) {
    parts.push(`HARD for this day (theme or stop): ${opts.mustForDay.join("; ")}`);
  }
  if (opts.excludeNames.length) {
    parts.push(`Do NOT use these names (used other days): ${opts.excludeNames.slice(0, 40).join("; ")}`);
  }
  parts.push(`\nPrefer these attractions today:\n${opts.focus.map(candidateLine).join("\n")}`);
  parts.push(`\nFull attraction list (use sparingly if needed):\n${opts.allPlaces.map(candidateLine).join("\n")}`);
  if (hasR) {
    parts.push(`\nRestaurants:\n${opts.restaurants.map(candidateLine).join("\n")}`);
  }
  parts.push(`Respond in ${opts.locale}.`);
  return parts.join("\n");
}

function applyRepairPipeline(
  raw: unknown,
  pool: { places: PlaceCard[]; restaurants: PlaceCard[]; stays: string[] },
  mustInclude: string[],
  pace: string | undefined,
  city: string,
) {
  let parsedJson: unknown = raw;
  parsedJson = remapStopNamesToPool(parsedJson, pool);
  parsedJson = trimAreaAliasStops(parsedJson, mustInclude, city);
  parsedJson = reseatLateLunchStops(parsedJson);
  parsedJson = reseatStayToDayOrigin(parsedJson);
  parsedJson = dropCityNameStops(parsedJson, city);
  parsedJson = trimPaceOverages(parsedJson, pace);
  parsedJson = reseatLateLunchStops(parsedJson);
  return validateSkeleton(parsedJson, pool, mustInclude, pace, city);
}

/** Drop later-day attraction duplicates; keep first occurrence. */
function dedupeAttractionsAcrossDays(skeleton: ItinerarySkeleton): ItinerarySkeleton {
  const seen = new Set<string>();
  return {
    days: skeleton.days.map((day) => ({
      ...day,
      stops: day.stops.filter((s) => {
        if (s.kind === "meal" || s.kind === "stay") return true;
        const key = s.name.normalize("NFKC").replace(/\s+/g, "").toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }),
    })),
  };
}

function countCrossDayAttractionReuse(skeleton: ItinerarySkeleton): number {
  const first = new Map<string, number>();
  let reuse = 0;
  for (const day of skeleton.days) {
    for (const s of day.stops) {
      if (s.kind !== "attraction") continue;
      const key = s.name.normalize("NFKC").replace(/\s+/g, "").toLowerCase();
      if (first.has(key)) reuse++;
      else first.set(key, day.day_index);
    }
  }
  return reuse;
}

async function armA(
  input: MakeItineraryInput,
  create: SkeletonChatCreate,
): Promise<{
  wall_ms: number;
  ok: boolean;
  error?: string;
  attempts_estimate?: string;
  skeleton?: ItinerarySkeleton;
  reuse: number;
}> {
  const t0 = performance.now();
  try {
    const result = await makeItinerary(input, { create });
    return {
      wall_ms: ms(t0),
      ok: true,
      skeleton: result.skeleton,
      reuse: countCrossDayAttractionReuse(result.skeleton),
    };
  } catch (err) {
    return {
      wall_ms: ms(t0),
      ok: false,
      error: err instanceof Error ? err.message.slice(0, 240) : String(err).slice(0, 240),
      reuse: 0,
    };
  }
}

async function armB(
  input: MakeItineraryInput,
  create: SkeletonChatCreate,
): Promise<{
  wall_ms: number;
  per_day_ms: number[];
  ok: boolean;
  error?: string;
  skeleton?: ItinerarySkeleton;
  reuse_before_dedupe: number;
  reuse_after_dedupe: number;
}> {
  const t0 = performance.now();
  const budget = llmSkeletonTimeoutMs();
  const locale = parseLocale(input.locale);
  const systemPrompt = assembleSystemPrompt({
    locale,
    intent: "itinerary-skeleton",
    budget: input.budget,
    glossary: loadGlossary(locale) ?? undefined,
  });
  const mustAssign = assignMustInclude(input.must_include ?? [], input.numDays);
  const focuses = focusSlices(input.candidates.places, input.numDays);
  const pool = {
    places: input.candidates.places,
    restaurants: input.candidates.restaurants,
    stays: input.origin?.name ? [input.origin.name] : [],
  };

  // Concurrent: no exclude (optimistic); merge dedupes. excludeNames empty.
  const dayJobs = Array.from({ length: input.numDays }, (_, i) => i + 1).map(async (dayIndex) => {
    const tDay = performance.now();
    const userMessage = buildDayUserMessage({
      city: input.city,
      dayIndex,
      numDays: input.numDays,
      pace: input.pace,
      locale,
      originName: input.origin?.name,
      mustForDay: mustAssign[dayIndex - 1] ?? [],
      focus: focuses[dayIndex - 1] ?? [],
      allPlaces: input.candidates.places,
      restaurants: input.candidates.restaurants,
      excludeNames: [],
    });
    try {
      const completion = await withAbortTimeout(budget, (signal) =>
        create(
          {
            model: process.env.OPENAI_CHAT_MODEL ?? "gpt-4o",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userMessage },
            ],
            max_completion_tokens: 1024,
            temperature: 0.3,
          },
          { signal },
        ),
      );
      const raw = extractText(completion);
      if (!raw) throw new Error(`day ${dayIndex}: empty LLM`);
      const parsed = JSON.parse(extractJson(raw)) as {
        day_index?: number;
        day_theme?: string;
        stops?: unknown[];
      };
      return {
        day_index: dayIndex,
        day_theme: typeof parsed.day_theme === "string" ? parsed.day_theme : `Day ${dayIndex}`,
        stops: Array.isArray(parsed.stops) ? parsed.stops : [],
        ms: ms(tDay),
        error: null as string | null,
      };
    } catch (err) {
      return {
        day_index: dayIndex,
        day_theme: `Day ${dayIndex}`,
        stops: [] as unknown[],
        ms: ms(tDay),
        error: err instanceof Error ? err.message.slice(0, 160) : String(err).slice(0, 160),
      };
    }
  });

  const dayResults = await Promise.all(dayJobs);
  const per_day_ms = dayResults.map((d) => d.ms);
  const failed = dayResults.filter((d) => d.error);
  if (failed.length) {
    return {
      wall_ms: ms(t0),
      per_day_ms,
      ok: false,
      error: failed.map((f) => `d${f.day_index}:${f.error}`).join(" | "),
      reuse_before_dedupe: 0,
      reuse_after_dedupe: 0,
    };
  }

  const mergedRaw = {
    days: dayResults
      .sort((a, b) => a.day_index - b.day_index)
      .map((d) => ({
        day_index: d.day_index,
        day_theme: d.day_theme,
        stops: d.stops,
      })),
  };

  const reuse_before_dedupe = countCrossDayAttractionReuse(mergedRaw as ItinerarySkeleton);
  const deduped = dedupeAttractionsAcrossDays(mergedRaw as ItinerarySkeleton);
  const validated = applyRepairPipeline(
    deduped,
    pool,
    input.must_include ?? [],
    input.pace,
    input.city,
  );

  if (!validated.ok) {
    return {
      wall_ms: ms(t0),
      per_day_ms,
      ok: false,
      error: validated.error.slice(0, 240),
      reuse_before_dedupe,
      reuse_after_dedupe: countCrossDayAttractionReuse(deduped),
    };
  }

  return {
    wall_ms: ms(t0),
    per_day_ms,
    ok: true,
    skeleton: validated.skeleton,
    reuse_before_dedupe,
    reuse_after_dedupe: countCrossDayAttractionReuse(validated.skeleton),
  };
}

/** Serial per-day with accumulating exclude (Arm C, optional). */
async function armC(
  input: MakeItineraryInput,
  create: SkeletonChatCreate,
): Promise<{
  wall_ms: number;
  per_day_ms: number[];
  ok: boolean;
  error?: string;
  reuse_before_dedupe: number;
}> {
  const t0 = performance.now();
  const budget = llmSkeletonTimeoutMs();
  const locale = parseLocale(input.locale);
  const systemPrompt = assembleSystemPrompt({
    locale,
    intent: "itinerary-skeleton",
    budget: input.budget,
    glossary: loadGlossary(locale) ?? undefined,
  });
  const mustAssign = assignMustInclude(input.must_include ?? [], input.numDays);
  const focuses = focusSlices(input.candidates.places, input.numDays);
  const pool = {
    places: input.candidates.places,
    restaurants: input.candidates.restaurants,
    stays: input.origin?.name ? [input.origin.name] : [],
  };
  const exclude: string[] = [];
  const per_day_ms: number[] = [];
  const days: unknown[] = [];

  for (let dayIndex = 1; dayIndex <= input.numDays; dayIndex++) {
    const tDay = performance.now();
    const userMessage = buildDayUserMessage({
      city: input.city,
      dayIndex,
      numDays: input.numDays,
      pace: input.pace,
      locale,
      originName: input.origin?.name,
      mustForDay: mustAssign[dayIndex - 1] ?? [],
      focus: focuses[dayIndex - 1] ?? [],
      allPlaces: input.candidates.places,
      restaurants: input.candidates.restaurants,
      excludeNames: exclude,
    });
    try {
      const completion = await withAbortTimeout(budget, (signal) =>
        create(
          {
            model: process.env.OPENAI_CHAT_MODEL ?? "gpt-4o",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userMessage },
            ],
            max_completion_tokens: 1024,
            temperature: 0.3,
          },
          { signal },
        ),
      );
      const raw = extractText(completion);
      if (!raw) throw new Error(`day ${dayIndex}: empty`);
      const parsed = JSON.parse(extractJson(raw)) as {
        day_theme?: string;
        stops?: Array<{ name?: string; kind?: string }>;
      };
      const stops = Array.isArray(parsed.stops) ? parsed.stops : [];
      for (const s of stops) {
        if (s?.kind === "attraction" && typeof s.name === "string") exclude.push(s.name);
      }
      days.push({
        day_index: dayIndex,
        day_theme: parsed.day_theme ?? `Day ${dayIndex}`,
        stops,
      });
      per_day_ms.push(ms(tDay));
    } catch (err) {
      per_day_ms.push(ms(tDay));
      return {
        wall_ms: ms(t0),
        per_day_ms,
        ok: false,
        error: err instanceof Error ? err.message.slice(0, 240) : String(err).slice(0, 240),
        reuse_before_dedupe: 0,
      };
    }
  }

  const merged = { days };
  const reuse_before_dedupe = countCrossDayAttractionReuse(merged as ItinerarySkeleton);
  const validated = applyRepairPipeline(
    dedupeAttractionsAcrossDays(merged as ItinerarySkeleton),
    pool,
    input.must_include ?? [],
    input.pace,
    input.city,
  );
  return {
    wall_ms: ms(t0),
    per_day_ms,
    ok: validated.ok,
    error: validated.ok ? undefined : validated.error.slice(0, 240),
    reuse_before_dedupe,
  };
}

function parseArgs(argv: string[]): { scenarios: Scenario[]; withC: boolean } {
  let cities: string[] | null = null;
  let days: number[] | null = null;
  let withC = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--cities" && argv[i + 1]) cities = argv[++i]!.split(",").map((s) => s.trim());
    if (argv[i] === "--days" && argv[i + 1])
      days = argv[++i]!.split(",").map((s) => Number(s.trim()));
    if (argv[i] === "--with-c") withC = true;
  }
  if (!cities) return { scenarios: DEFAULT_SCENARIOS, withC };
  const scenarios = cities.map((city, i) => {
    const base = DEFAULT_SCENARIOS.find((s) => s.city.toLowerCase() === city.toLowerCase());
    return {
      city,
      numDays: days?.[i] ?? base?.numDays ?? 3,
      pace: base?.pace ?? ("medium" as const),
      must_include: base?.must_include,
    };
  });
  return { scenarios, withC };
}

async function main() {
  const { scenarios, withC } = parseArgs(process.argv.slice(2));
  const create = createSkeletonChatCreate();
  if (!create) throw new Error("OPENAI_API_KEY required");

  const report: Record<string, unknown> = {
    as_of: new Date().toISOString(),
    model: process.env.OPENAI_CHAT_MODEL,
    base_url: process.env.OPENAI_BASE_URL,
    LLM_SKELETON_TIMEOUT_MS: llmSkeletonTimeoutMs(),
    scenarios: [] as unknown[],
  };

  console.log(
    JSON.stringify({
      probe: "skeleton-ab",
      n: scenarios.length,
      withC,
      timeout_ms: llmSkeletonTimeoutMs(),
    }),
  );

  for (const sc of scenarios) {
    console.log(`\n=== ${sc.city} ${sc.numDays}d ===`);
    const tDisc = performance.now();
    const end = new Date("2026-10-10");
    end.setDate(end.getDate() + sc.numDays - 1);
    const disc = await discoverPlaces({
      city: sc.city,
      numDays: sc.numDays,
      bounds: {
        start: "2026-10-10",
        end: end.toISOString().slice(0, 10),
      },
      locale: "EN",
      providers: ["GOOGLE_MAPS", "AMAP", "TRIPADVISOR"],
      must_include: sc.must_include,
    });
    const discover_ms = ms(tDisc);
    console.log(
      JSON.stringify({
        discover_ms,
        places: disc.candidates.places.length,
        restaurants: disc.candidates.restaurants.length,
      }),
    );

    const input: MakeItineraryInput = {
      city: sc.city,
      numDays: sc.numDays,
      candidates: disc.candidates,
      pace: sc.pace,
      budget: "budget",
      locale: "EN",
      must_include: sc.must_include ?? disc.inferred_must_see,
    };

    const a = await armA(input, create);
    console.log(JSON.stringify({ arm: "A_global", ...a, skeleton: undefined }));

    const b = await armB(input, create);
    console.log(
      JSON.stringify({
        arm: "B_concurrent",
        wall_ms: b.wall_ms,
        per_day_ms: b.per_day_ms,
        max_day_ms: b.per_day_ms.length ? Math.max(...b.per_day_ms) : null,
        ok: b.ok,
        error: b.error,
        reuse_before_dedupe: b.reuse_before_dedupe,
        reuse_after_dedupe: b.reuse_after_dedupe,
      }),
    );

    let c: Awaited<ReturnType<typeof armC>> | null = null;
    if (withC) {
      c = await armC(input, create);
      console.log(
        JSON.stringify({
          arm: "C_serial",
          wall_ms: c.wall_ms,
          per_day_ms: c.per_day_ms,
          ok: c.ok,
          error: c.error,
        }),
      );
    }

    const speedup =
      a.ok && b.ok && b.wall_ms > 0 ? Number((a.wall_ms / b.wall_ms).toFixed(2)) : null;

    (report.scenarios as unknown[]).push({
      city: sc.city,
      numDays: sc.numDays,
      pace: sc.pace,
      must_include: input.must_include,
      discover_ms,
      pool: {
        places: disc.candidates.places.length,
        restaurants: disc.candidates.restaurants.length,
      },
      A: { wall_ms: a.wall_ms, ok: a.ok, error: a.error, reuse: a.reuse },
      B: {
        wall_ms: b.wall_ms,
        ok: b.ok,
        error: b.error,
        per_day_ms: b.per_day_ms,
        max_day_ms: b.per_day_ms.length ? Math.max(...b.per_day_ms) : null,
        reuse_before_dedupe: b.reuse_before_dedupe,
        reuse_after_dedupe: b.reuse_after_dedupe,
      },
      C: c
        ? { wall_ms: c.wall_ms, ok: c.ok, error: c.error, per_day_ms: c.per_day_ms }
        : null,
      speedup_A_over_B: speedup,
    });
  }

  const rows = report.scenarios as Array<{
    A: { ok: boolean; wall_ms: number };
    B: { ok: boolean; wall_ms: number };
    speedup_A_over_B: number | null;
  }>;
  const bothOk = rows.filter((r) => r.A.ok && r.B.ok);
  report.summary = {
    n: rows.length,
    A_ok: rows.filter((r) => r.A.ok).length,
    B_ok: rows.filter((r) => r.B.ok).length,
    both_ok: bothOk.length,
    mean_speedup_when_both_ok:
      bothOk.length === 0
        ? null
        : Number(
            (
              bothOk.reduce((s, r) => s + (r.speedup_A_over_B ?? 0), 0) / bothOk.length
            ).toFixed(2),
          ),
    mean_A_ms: bothOk.length
      ? Math.round(bothOk.reduce((s, r) => s + r.A.wall_ms, 0) / bothOk.length)
      : null,
    mean_B_ms: bothOk.length
      ? Math.round(bothOk.reduce((s, r) => s + r.B.wall_ms, 0) / bothOk.length)
      : null,
  };

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log("\n" + JSON.stringify(report.summary));
  console.log(`wrote ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
