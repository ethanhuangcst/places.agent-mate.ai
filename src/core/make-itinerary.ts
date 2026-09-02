/**
 * make_itinerary — MVP-10 §12 light-skeleton LLM (ADR sequence: F43).
 *
 * One LLM call produces the global multi-day STOP-ORDER skeleton
 * (day_theme + stop names + meal slots, NO times). Per-stop times and
 * transit are attached later by plan_next_stop / display_current_stop
 * with zero LLM (performance.md §12).
 *
 * NDJSON events (§16.2 contract, agent-specs):
 *   skeleton_start → skeleton_day × N → skeleton_done
 */

import { z } from "zod";
import OpenAI from "openai";
import { type Locale } from "./locales";
import { type PlaceCard } from "./types";
import { assembleSystemPrompt } from "../agent/prompt-assembler";
import { loadGlossary } from "../agent/loop";
import { parseLocale } from "./locales";
import { slimArrangeCandidates } from "./itinerary-planner";
import { normalizeMustIncludeToken, skeletonCoversMustInclude } from "./trip-intake";
import { geocode, searchPlaces, searchRestaurants } from "./tools";
import {
  filterCardsNearAnchor,
  pickSupplementaryMustIncludeHit,
  trimThemedDayOutliers,
} from "./geo-bounds";

// --- Schema ---

const SkeletonStopSchema = z.object({
  name: z.string().min(1),
  kind: z.enum(["stay", "attraction", "meal"]),
  meal_slot: z.enum(["lunch", "afternoon_tea", "dinner"]).optional(),
  must_include: z.boolean().optional(),
});

const SkeletonDaySchema = z.object({
  day_index: z.number().int().min(1),
  // LLMs often emit `"date": null`; treat as omitted (F62).
  date: z.preprocess(
    (v) => (v == null || v === "" ? undefined : v),
    z.string().optional(),
  ),
  day_theme: z.string().min(1),
  stops: z.array(SkeletonStopSchema).min(1),
});

export const ItinerarySkeletonSchema = z.object({
  days: z.array(SkeletonDaySchema).min(1),
});

export type SkeletonStop = z.infer<typeof SkeletonStopSchema>;
export type SkeletonDay = z.infer<typeof SkeletonDaySchema>;
export type ItinerarySkeleton = z.infer<typeof ItinerarySkeletonSchema>;

export type SkeletonStreamEvent =
  | { type: "skeleton_start"; total_days: number }
  | { type: "skeleton_day"; day: SkeletonDay }
  | { type: "skeleton_done"; days_count: number };

export type MakeItineraryInput = {
  city: string;
  numDays: number;
  candidates: { places: PlaceCard[]; restaurants: PlaceCard[] };
  origin?: { name?: string; lat?: number; lng?: number };
  pace?: "tight" | "medium" | "relaxed";
  budget?: "budget" | "premium";
  must_include?: string[];
  natural_language?: string;
  dayStart?: string;
  dayEnd?: string;
  locale: Locale;
};

export type MakeItineraryResult = {
  skeleton: ItinerarySkeleton;
  candidates_slim: { places: PlaceCard[]; restaurants: PlaceCard[] };
};

// --- Validation ---

function paceStopLimit(pace?: string): number {
  if (pace === "tight") return 6;
  if (pace === "relaxed") return 4;
  return 5;
}

export function normalizeStopNameKey(name: string): string {
  return name.normalize("NFKC").replace(/\s+/g, "").toLowerCase();
}

/** Rewrite stop names to pool canonical names when only case/spacing/NFKC differs. */
export function remapStopNamesToPool(
  raw: unknown,
  pool: { places: PlaceCard[]; restaurants: PlaceCard[]; stays: string[] },
): unknown {
  const parsed = ItinerarySkeletonSchema.safeParse(raw);
  if (!parsed.success) return raw;
  const catalog = [
    ...pool.places.map((p) => p.name),
    ...pool.restaurants.map((r) => r.name),
    ...pool.stays,
  ];
  const byNorm = new Map<string, string>();
  for (const n of catalog) {
    const k = normalizeStopNameKey(n);
    if (!byNorm.has(k)) byNorm.set(k, n);
  }
  return {
    ...parsed.data,
    days: parsed.data.days.map((day) => ({
      ...day,
      stops: day.stops.map((s) => {
        if (catalog.includes(s.name)) return s;
        const canon = byNorm.get(normalizeStopNameKey(s.name));
        return canon ? { ...s, name: canon } : s;
      }),
    })),
  };
}

/** Drop extra attractions from the end of each day until pace limit is met. */
export function trimPaceOverages(raw: unknown, pace?: string): unknown {
  const parsed = ItinerarySkeletonSchema.safeParse(raw);
  if (!parsed.success) return raw;
  const limit = paceStopLimit(pace);
  return {
    ...parsed.data,
    days: parsed.data.days.map((day) => {
      let attractions = day.stops.filter((s) => s.kind === "attraction").length;
      if (attractions <= limit) return day;
      const stops = [...day.stops];
      for (let i = stops.length - 1; i >= 0 && attractions > limit; i--) {
        if (stops[i]?.kind === "attraction") {
          stops.splice(i, 1);
          attractions--;
        }
      }
      return { ...day, stops };
    }),
  };
}

/** True when an attraction stop name is just an area/city token, not a POI (F60). */
export function isAreaAliasStop(
  stopName: string,
  mustInclude: string[],
  city?: string,
): boolean {
  const norm = normalizeMustIncludeToken(stopName);
  if (!norm) return false;
  const cityNorm = city ? normalizeMustIncludeToken(city) : "";
  if (cityNorm && norm === cityNorm) return true;
  const isAreaStyle = (token: string) => {
    const t = token.trim();
    if (/(区|一带|一日游|day[\s-]?trip|district|area)$/iu.test(t)) return true;
    // Bare Latin district names (Belém, Sintra) — not CJK day-trip town names.
    if (!/\s/u.test(t) && /^[A-Za-zÀ-ÿ]+$/u.test(t)) return true;
    return false;
  };
  return mustInclude.some((t) => {
    if (normalizeMustIncludeToken(t) !== norm) return false;
    return isAreaStyle(t) || isAreaStyle(stopName);
  });
}

/** Remove bare area-token attraction stops before validation (F60). */
export function trimAreaAliasStops(
  raw: unknown,
  mustInclude: string[],
  city?: string,
): unknown {
  const parsed = ItinerarySkeletonSchema.safeParse(raw);
  if (!parsed.success) return raw;
  return {
    ...parsed.data,
    days: parsed.data.days.map((day) => ({
      ...day,
      stops: day.stops.filter(
        (s) => s.kind !== "attraction" || !isAreaAliasStop(s.name, mustInclude, city),
      ),
    })),
  };
}

/** Move lunch stops that sit after the last attraction to midday (F61). */
export function reseatLateLunchStops(raw: unknown): unknown {
  const parsed = ItinerarySkeletonSchema.safeParse(raw);
  if (!parsed.success) return raw;
  return {
    ...parsed.data,
    days: parsed.data.days.map((day) => {
      const lunchIdx = day.stops.findIndex((s) => s.kind === "meal" && s.meal_slot === "lunch");
      if (lunchIdx < 0) return day;
      let lastAttrIdx = -1;
      for (let i = 0; i < day.stops.length; i++) {
        if (day.stops[i]?.kind === "attraction") lastAttrIdx = i;
      }
      if (lastAttrIdx < 0 || lunchIdx <= lastAttrIdx) return day;
      const stops = [...day.stops];
      const lunch = stops.splice(lunchIdx, 1)[0];
      if (!lunch) return day;
      const attrIndices = stops
        .map((s, i) => (s.kind === "attraction" ? i : -1))
        .filter((i) => i >= 0);
      let targetIdx: number;
      if (attrIndices.length <= 1) {
        targetIdx = attrIndices[0] ?? 0;
      } else if (attrIndices.length === 2) {
        targetIdx = attrIndices[0]! + 1;
      } else {
        targetIdx = attrIndices[1]! + 1;
      }
      stops.splice(targetIdx, 0, lunch);
      return { ...day, stops };
    }),
  };
}

/**
 * Ensure each day has at most one stay at stops[0] (F62 / F59).
 * First stay wins; extra stays are dropped; non-first stay is moved to index 0.
 */
export function reseatStayToDayOrigin(raw: unknown): unknown {
  const parsed = ItinerarySkeletonSchema.safeParse(raw);
  if (!parsed.success) return raw;
  return {
    ...parsed.data,
    days: parsed.data.days.map((day) => {
      const stayIndices = day.stops
        .map((s, i) => (s.kind === "stay" ? i : -1))
        .filter((i) => i >= 0);
      if (stayIndices.length === 0) return day;
      const firstStayIdx = stayIndices[0]!;
      const stay = day.stops[firstStayIdx]!;
      const withoutExtraStays = day.stops.filter(
        (s, i) => s.kind !== "stay" || i === firstStayIdx,
      );
      if (firstStayIdx === 0 && stayIndices.length === 1) return day;
      const rest = withoutExtraStays.filter((s) => s !== stay);
      return { ...day, stops: [stay, ...rest] };
    }),
  };
}

/**
 * Drop non-stay stops whose name normalizes to the destination city (F62).
 */
export function dropCityNameStops(raw: unknown, city?: string): unknown {
  if (!city?.trim()) return raw;
  const parsed = ItinerarySkeletonSchema.safeParse(raw);
  if (!parsed.success) return raw;
  const cityNorm = normalizeMustIncludeToken(city);
  if (!cityNorm) return raw;
  return {
    ...parsed.data,
    days: parsed.data.days.map((day) => ({
      ...day,
      stops: day.stops.filter(
        (s) => s.kind === "stay" || normalizeMustIncludeToken(s.name) !== cityNorm,
      ),
    })),
  };
}

export type SkeletonValidationResult =
  | { ok: true; skeleton: ItinerarySkeleton }
  | { ok: false; error: string; retryable: boolean };

/**
 * Validate skeleton against pool + hard constraints.
 * - every stop name ∈ candidates (places ∪ restaurants ∪ origin stays)
 * - no venue reused across days
 * - must_include covered by stop name or day_theme (area suffixes ok)
 * - attraction stops per day ≤ pace limit
 */
export function validateSkeleton(
  raw: unknown,
  pool: { places: PlaceCard[]; restaurants: PlaceCard[]; stays: string[] },
  mustInclude: string[],
  pace?: string,
  city?: string,
): SkeletonValidationResult {
  const parsed = ItinerarySkeletonSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: `skeleton JSON schema invalid: ${parsed.error.issues
        .slice(0, 5)
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`,
      retryable: true,
    };
  }
  const skeleton = parsed.data;
  const names = new Set<string>([
    ...pool.places.map((p) => p.name),
    ...pool.restaurants.map((r) => r.name),
    ...pool.stays,
  ]);
  const errors: string[] = [];
  const seen = new Map<string, number>();
  const stayNames = new Set(pool.stays);
  const limit = paceStopLimit(pace);
  const requireLunch = pool.restaurants.length > 0;
  const cityNorm = city ? normalizeMustIncludeToken(city) : "";

  const dayIndexes = new Set<number>();
  for (const day of skeleton.days) {
    if (dayIndexes.has(day.day_index)) {
      errors.push(`day_index ${day.day_index} duplicated`);
    }
    dayIndexes.add(day.day_index);

    let attractions = 0;
    let stayCount = 0;
    for (let stopIdx = 0; stopIdx < day.stops.length; stopIdx++) {
      const stop = day.stops[stopIdx]!;
      if (stop.kind === "stay") {
        stayCount++;
        if (stopIdx !== 0) {
          errors.push(
            `stay "${stop.name}" (day ${day.day_index}) must be the first stop of the day`,
          );
        }
      }
      if (!names.has(stop.name)) {
        errors.push(`stop "${stop.name}" (day ${day.day_index}) not found in candidate list`);
      }
      if (
        cityNorm &&
        normalizeMustIncludeToken(stop.name) === cityNorm &&
        !stayNames.has(stop.name)
      ) {
        errors.push(
          `stop "${stop.name}" (day ${day.day_index}) is the destination city, not a venue`,
        );
      }
      if (
        stop.kind === "attraction" &&
        isAreaAliasStop(stop.name, mustInclude, city)
      ) {
        errors.push(
          `stop "${stop.name}" (day ${day.day_index}) is an area name, not a specific venue`,
        );
      }
      // The daily origin (stay) legitimately opens every day; only non-stay
      // venues must be unique across the trip. Meal stops (restaurants) are
      // exempt: a traveler may legitimately eat at the same restaurant on
      // two different days, and the LLM has a smaller dining pool than the
      // attraction pool. The anti-reuse rule targets lazy attraction reuse.
      if (!stayNames.has(stop.name) && stop.kind !== "meal") {
        if (seen.has(stop.name)) {
          errors.push(
            `stop "${stop.name}" reused on day ${seen.get(stop.name)} and day ${day.day_index}`,
          );
        } else {
          seen.set(stop.name, day.day_index);
        }
      }
      if (stop.kind === "attraction") attractions++;
      if (stop.kind === "meal" && !stop.meal_slot) {
        errors.push(`meal stop "${stop.name}" (day ${day.day_index}) missing meal_slot`);
      }
    }
    if (stayCount > 1) {
      errors.push(`day ${day.day_index} has more than one stay stop`);
    }
    if (attractions > limit) {
      errors.push(
        `day ${day.day_index} has ${attractions} attraction stops > pace limit ${limit}`,
      );
    }
    if (
      requireLunch &&
      !day.stops.some((s) => s.kind === "meal" && s.meal_slot === "lunch")
    ) {
      errors.push(`day ${day.day_index} missing a lunch stop`);
    }
    const lunchIdx = day.stops.findIndex((s) => s.kind === "meal" && s.meal_slot === "lunch");
    if (lunchIdx >= 0) {
      let lastAttrIdx = -1;
      for (let i = 0; i < day.stops.length; i++) {
        if (day.stops[i]?.kind === "attraction") lastAttrIdx = i;
      }
      if (lastAttrIdx >= 0 && lunchIdx > lastAttrIdx) {
        errors.push(
          `lunch stop (day ${day.day_index}) must not follow the last attraction — place it at midday`,
        );
      }
    }
  }

  if (skeleton.days.length > 1) {
    for (let i = 1; i <= skeleton.days.length; i++) {
      if (!dayIndexes.has(i)) {
        errors.push(`day_index ${i} missing (expected 1..${skeleton.days.length})`);
      }
    }
  }

  const haystacks = skeleton.days.flatMap((d) => [
    d.day_theme,
    ...d.stops.map((s) => s.name),
  ]);
  const missing = mustInclude.filter((m) => !skeletonCoversMustInclude(m, haystacks));
  if (missing.length) {
    errors.push(`must_include not scheduled: ${missing.join("; ")}`);
  }

  if (errors.length) {
    return { ok: false, error: errors.join("; "), retryable: true };
  }
  return { ok: true, skeleton };
}

// --- Prompt building ---

function candidateLine(card: PlaceCard): string {
  const loc = card.location;
  const coord = loc?.lat != null && loc?.lng != null ? ` (${loc.lat}, ${loc.lng})` : "";
  const rating = typeof card.rating === "number" ? ` rating ${card.rating}` : "";
  const mustSee = card.must_see ? " [must-see]" : "";
  return `- ${card.name}${coord}${rating}${mustSee}`;
}

export function buildSkeletonUserMessage(input: MakeItineraryInput): string {
  const parts: string[] = [];
  parts.push(
    `Create the stop-order skeleton for a ${input.numDays}-day trip in ${input.city}. ` +
      `Order only — NO times, NO transit. Only choose stops from the candidate lists below.`,
  );
  const hasRestaurants = input.candidates.restaurants.length > 0;
  parts.push(
    `Pace: ${input.pace ?? "medium"} (attraction stops/day: tight ≤ 6, medium ≤ 5, relaxed ≤ 4). ` +
      (hasRestaurants
        ? `Every day needs a lunch stop from the restaurant list (place lunch at midday, after the 2nd or 3rd attraction — never after the last attraction); medium/tight also need dinner.`
        : `Restaurant list is empty — omit meal stops; do not invent restaurant names.`),
  );
  parts.push(`Never schedule the city name "${input.city}" as a stop.`);
  parts.push(
    `Never schedule a bare area or district name (e.g. "Belém", "Sintra") as an attraction — ` +
      `use specific POIs from the candidate list.`,
  );
  if (input.origin?.name) {
    const c =
      input.origin.lat != null && input.origin.lng != null
        ? ` (${input.origin.lat}, ${input.origin.lng})`
        : "";
    parts.push(
      `Daily origin: ${input.origin.name}${c} — include it as the FIRST stop of each day with kind "stay".`,
    );
  }
  if (input.must_include?.length) {
    parts.push(
      `\nHARD MUST INCLUDE (cover each token once via a scheduled stop name OR a day_theme; ` +
        `area words like 区/一带/一日游 are covered by a candidate whose name contains the core — ` +
        `do NOT invent a stop whose exact name is the area token if it is not in the candidate list). ` +
        `On a day whose theme names a must_include area, only schedule attractions near that area — ` +
        `do not pad with leftover city POIs; fewer stops is OK: ` +
        input.must_include.map((s) => s.trim()).filter(Boolean).join("; "),
    );
  }
  if (input.natural_language?.trim()) {
    parts.push(`\nTraveler notes: ${input.natural_language.trim()}`);
  }
  if (input.budget) {
    parts.push(`Budget: ${input.budget}.`);
  }

  parts.push(`\nAttraction candidates:\n${input.candidates.places.map(candidateLine).join("\n")}`);
  parts.push(
    `\nRestaurant candidates:\n${input.candidates.restaurants.map(candidateLine).join("\n")}`,
  );
  parts.push(
    `\nReturn ONLY the JSON skeleton object ({days:[{day_index, date?, day_theme, stops:[{name, kind, meal_slot?}]}]}). ` +
      `No start_time, no duration_min, no transit fields. Respond in ${input.locale}.`,
  );
  if (hasRestaurants) {
    parts.push(
      `Do not repeat the same restaurant across days when alternatives exist in the list.`,
    );
  }
  return parts.join("\n");
}

// --- LLM plumbing (mirrors itinerary-planner patterns; §12.5 skeleton budget) ---

export type SkeletonChatCreate = (
  params: {
    model: string;
    messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
    max_completion_tokens: number;
    temperature: number;
  },
  options: { signal: AbortSignal },
) => Promise<{ choices: Array<{ message?: { content?: string | null } }> }>;

/**
 * Build the real LLM `create` for the skeleton call when OPENAI_API_KEY is
 * configured; returns null in fixture/no-key mode so makeItinerary falls
 * back to the deterministic fixture skeleton.
 */
export function createSkeletonChatCreate(): SkeletonChatCreate | null {
  const key = process.env.OPENAI_API_KEY;
  if (!key || key === "fixture") return null;
  const openai = new OpenAI({ apiKey: key, baseURL: process.env.OPENAI_BASE_URL });
  return openai.chat.completions.create.bind(openai.chat.completions) as unknown as SkeletonChatCreate;
}

const DEFAULT_SKELETON_TIMEOUT_MS = 150_000;

export function llmSkeletonTimeoutMs(): number {
  const raw = Number(process.env.LLM_SKELETON_TIMEOUT_MS ?? DEFAULT_SKELETON_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_SKELETON_TIMEOUT_MS;
}

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return text.trim();
}

function extractChatCompletionText(completion: unknown): string | null {
  if (completion == null) return null;
  if (typeof completion === "string") {
    const trimmed = completion.trim();
    if (!trimmed) return null;
    if (/^<!doctype\s+html/i.test(trimmed) || /^<html[\s>]/i.test(trimmed)) {
      throw new Error(
        "LLM gateway returned HTML instead of chat completion JSON — check OPENAI_BASE_URL and API key",
      );
    }
    return trimmed;
  }
  if (typeof completion !== "object") return null;
  const c = completion as { choices?: Array<{ message?: { content?: string | null } }> };
  if (!Array.isArray(c.choices)) {
    throw new Error("LLM response missing choices[] — check OPENAI_BASE_URL / OPENAI_CHAT_MODEL");
  }
  const text = c.choices[0]?.message?.content;
  if (typeof text !== "string") return null;
  const trimmed = text.trim();
  return trimmed.length ? trimmed : null;
}

function isLlmAbortError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { name?: string; message?: string };
  if (e.name === "AbortError") return true;
  const msg = typeof e.message === "string" ? e.message : "";
  return /aborted|abort|timeout/i.test(msg);
}

async function withAbortTimeout<T>(ms: number, fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fn(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

// --- Fixture fallback (tests / no-key dev) ---

export function buildFixtureSkeleton(input: MakeItineraryInput): ItinerarySkeleton {
  const days: SkeletonDay[] = [];
  // ADR-045 §3 (F49): prefer must_see cards first so the fixture skeleton
  // schedules iconic places ahead of generic pool entries.
  const prioritizedPlaces = [...input.candidates.places].sort(
    (a, b) => (b.must_see ? 1 : 0) - (a.must_see ? 1 : 0),
  );
  let placeIdx = 0;
  let restIdx = 0;
  const perDay = paceStopLimit(input.pace);
  for (let d = 1; d <= input.numDays; d++) {
    const stops: SkeletonStop[] = [];
    if (input.origin?.name) {
      stops.push({ name: input.origin.name, kind: "stay" });
    }
    const attractions = prioritizedPlaces.slice(placeIdx, placeIdx + Math.min(3, perDay));
    placeIdx += attractions.length;
    for (const a of attractions) {
      if (input.must_include?.includes(a.name)) {
        stops.push({ name: a.name, kind: "attraction", must_include: true });
      } else {
        stops.push({ name: a.name, kind: "attraction" });
      }
    }
    const lunch = input.candidates.restaurants[restIdx++];
    if (lunch) stops.push({ name: lunch.name, kind: "meal", meal_slot: "lunch" });
    const dinner = input.candidates.restaurants[restIdx++];
    if (dinner && input.pace !== "relaxed") {
      stops.push({ name: dinner.name, kind: "meal", meal_slot: "dinner" });
    }
    days.push({
      day_index: d,
      day_theme: `Day ${d}`,
      stops,
    });
  }
  const reseated = reseatLateLunchStops({ days });
  const parsed = ItinerarySkeletonSchema.safeParse(reseated);
  return parsed.success ? parsed.data : { days };
}

// --- Main entry ---

export type MakeItinerarySearchFn = (input: {
  address?: string;
  query?: string;
  locale?: Locale;
  near?: { lat: number; lng: number };
}) => Promise<{ data?: PlaceCard[] }>;

async function enrichMakeItineraryInput(
  input: MakeItineraryInput,
  opts?: {
    searchRestaurants?: MakeItinerarySearchFn;
    searchPlaces?: MakeItinerarySearchFn;
    geocode?: (query: string) => Promise<{ lat: number; lng: number } | null>;
  },
): Promise<MakeItineraryInput> {
  let places = [...input.candidates.places];
  let restaurants = [...input.candidates.restaurants];
  const city = input.city.trim();

  if (restaurants.length === 0 && city) {
    const searchR = opts?.searchRestaurants ?? searchRestaurants;
    try {
      const res = await searchR({
        address: city,
        query: city,
        locale: input.locale,
      });
      const cityNorm = normalizeMustIncludeToken(city);
      restaurants = (res.data ?? [])
        .filter((c) => {
          if (typeof c.name !== "string" || !c.name.trim()) return false;
          return normalizeMustIncludeToken(c.name) !== cityNorm;
        })
        .slice(0, 12);
    } catch {
      restaurants = [];
    }
  }

  const placeNames = places.map((p) => p.name);
  const uncovered = (input.must_include ?? []).filter(
    (t) => t.trim() && !skeletonCoversMustInclude(t, placeNames),
  );
  if (uncovered.length > 0 && city) {
    const searchP = opts?.searchPlaces ?? searchPlaces;
    const extras = await Promise.all(
      uncovered.map((token) =>
        searchP({
          address: city,
          query: token.trim(),
          locale: input.locale,
        }).catch(() => ({ data: [] as PlaceCard[] })),
      ),
    );
    const existingNorm = new Set(places.map((p) => normalizeMustIncludeToken(p.name)));
    extras.forEach((res, i) => {
      const token = uncovered[i] ?? "";
      const found = pickSupplementaryMustIncludeHit(res.data ?? [], token, {
        city,
        existingNorm,
      });
      if (!found) return;
      found.must_see = true;
      existingNorm.add(normalizeMustIncludeToken(found.name));
      places.unshift(found);
    });
  }

  // F57: area tokens → geocode token + nearby search (ADR-042, no city catalog).
  for (const token of input.must_include ?? []) {
    const t = token.trim();
    if (!t) continue;
    const covering = places.filter((p) => skeletonCoversMustInclude(t, [p.name])).length;
    if (covering >= 3) continue;
    let geo: { lat: number; lng: number } | null = null;
    try {
      if (opts?.geocode) {
        geo = await opts.geocode(t);
      } else {
        const g = await geocode({ query: t, locale: input.locale });
        if (g.data?.lat != null && g.data?.lng != null) {
          geo = { lat: g.data.lat, lng: g.data.lng };
        }
      }
    } catch {
      geo = null;
    }
    if (!geo) continue;
    const searchP = opts?.searchPlaces ?? searchPlaces;
    try {
      const res = await searchP({
        query: t,
        near: { lat: geo.lat, lng: geo.lng },
        locale: input.locale,
      });
      const existingNorm = new Set(places.map((p) => normalizeMustIncludeToken(p.name)));
      for (const card of res.data ?? []) {
        const n = normalizeMustIncludeToken(card.name);
        if (!n || existingNorm.has(n)) continue;
        if (city && n === normalizeMustIncludeToken(city)) continue;
        card.must_see = true;
        existingNorm.add(n);
        places.push(card);
        if (places.filter((p) => skeletonCoversMustInclude(t, [p.name])).length >= 8) break;
      }
    } catch {
      /* keep existing pool */
    }
  }

  let anchor: { lat: number; lng: number } | null =
    input.origin?.lat != null && input.origin?.lng != null
      ? { lat: input.origin.lat, lng: input.origin.lng }
      : null;
  if (!anchor && city) {
    try {
      if (opts?.geocode) {
        anchor = await opts.geocode(city);
      } else {
        const g = await geocode({ query: city, locale: input.locale });
        if (g.data?.lat != null && g.data?.lng != null) {
          anchor = { lat: g.data.lat, lng: g.data.lng };
        }
      }
    } catch {
      anchor = null;
    }
  }
  if (anchor) {
    places = filterCardsNearAnchor(places, anchor);
    restaurants = filterCardsNearAnchor(restaurants, anchor);
  }

  return { ...input, candidates: { places, restaurants } };
}

export async function makeItinerary(
  input: MakeItineraryInput,
  opts?: {
    onEvent?: (event: SkeletonStreamEvent) => void;
    create?: SkeletonChatCreate;
    searchRestaurants?: MakeItinerarySearchFn;
    searchPlaces?: MakeItinerarySearchFn;
    geocode?: (query: string) => Promise<{ lat: number; lng: number } | null>;
  },
): Promise<MakeItineraryResult> {
  const locale = parseLocale(input.locale);
  const enriched = await enrichMakeItineraryInput(input, opts);
  const slim = slimArrangeCandidates(enriched.candidates);
  const pool = {
    places: enriched.candidates.places,
    restaurants: enriched.candidates.restaurants,
    stays: enriched.origin?.name ? [enriched.origin.name] : [],
  };

  let skeleton: ItinerarySkeleton | undefined;

  const create: SkeletonChatCreate | undefined = opts?.create;
  if (create) {
    const systemPrompt = assembleSystemPrompt({
      locale,
      intent: "itinerary-skeleton",
      budget: enriched.budget,
      glossary: loadGlossary(locale) ?? undefined,
    });
    const userMessage = buildSkeletonUserMessage({ ...enriched, locale });

    let lastError: string | null = null;
    let done = false;
    for (let attempt = 0; attempt < 2 && !done; attempt++) {
      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content:
            attempt === 0
              ? userMessage
              : `${userMessage}\n\nPrevious errors:\n${lastError}\n\nFix and return valid JSON.`,
        },
      ];
      let raw: string | null;
      try {
        const completion = await withAbortTimeout(llmSkeletonTimeoutMs(), (signal) =>
          create(
            {
              model: process.env.OPENAI_CHAT_MODEL ?? "gpt-4o",
              messages,
              max_completion_tokens: 2048,
              temperature: 0.3,
            },
            { signal },
          ),
        );
        raw = extractChatCompletionText(completion);
      } catch (err) {
        if (isLlmAbortError(err)) {
          const prior = lastError
            ? ` (after attempt ${attempt} validation: ${lastError})`
            : "";
          throw new Error(
            `make_itinerary: LLM timed out after ${llmSkeletonTimeoutMs()}ms${prior}`,
            { cause: err },
          );
        }
        throw err;
      }
      if (!raw) {
        lastError = "empty LLM response";
        continue;
      }
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(extractJson(raw));
      } catch {
        lastError = "LLM response is not valid JSON";
        continue;
      }
      parsedJson = remapStopNamesToPool(parsedJson, pool);
      parsedJson = trimAreaAliasStops(parsedJson, enriched.must_include ?? [], enriched.city);
      parsedJson = reseatLateLunchStops(parsedJson);
      parsedJson = reseatStayToDayOrigin(parsedJson);
      parsedJson = dropCityNameStops(parsedJson, enriched.city);
      parsedJson = trimPaceOverages(parsedJson, enriched.pace);
      // Re-run after trims: dropping attrs/city/area can leave lunch after the last attraction again.
      parsedJson = reseatLateLunchStops(parsedJson);
      const validated = validateSkeleton(
        parsedJson,
        pool,
        enriched.must_include ?? [],
        enriched.pace,
        enriched.city,
      );
      if (validated.ok) {
        skeleton = validated.skeleton;
        done = true;
      } else {
        lastError = validated.error;
      }
    }
    if (!done) {
      throw new Error(`make_itinerary: skeleton validation failed — ${lastError}`);
    }
  } else {
    // Fixture path (no OPENAI_API_KEY): deterministic skeleton, still pool-validated.
    const validated = validateSkeleton(
      reseatLateLunchStops(
        trimPaceOverages(
          dropCityNameStops(
            reseatStayToDayOrigin(
              reseatLateLunchStops(
                trimAreaAliasStops(
                  remapStopNamesToPool(buildFixtureSkeleton(enriched), pool),
                  enriched.must_include ?? [],
                  enriched.city,
                ),
              ),
            ),
            enriched.city,
          ),
          enriched.pace,
        ),
      ),
      pool,
      enriched.must_include ?? [],
      enriched.pace,
      enriched.city,
    );
    if (!validated.ok) {
      throw new Error(`make_itinerary: fixture skeleton invalid — ${validated.error}`);
    }
    skeleton = validated.skeleton;
  }

  if (!skeleton) {
    throw new Error("make_itinerary: skeleton validation failed — unknown");
  }

  skeleton = trimThemedDayOutliers(
    skeleton,
    pool.places,
    enriched.must_include ?? [],
    enriched.origin?.lat != null && enriched.origin?.lng != null
      ? { lat: enriched.origin.lat, lng: enriched.origin.lng }
      : undefined,
  );

  opts?.onEvent?.({ type: "skeleton_start", total_days: skeleton.days.length });
  for (const day of skeleton.days) {
    opts?.onEvent?.({ type: "skeleton_day", day });
  }
  opts?.onEvent?.({ type: "skeleton_done", days_count: skeleton.days.length });

  return { skeleton, candidates_slim: slim };
}
