/**
 * Itinerary planner (MVP-6 + ADR-040).
 *
 * plan_itinerary LLM path (true shell):
 *   Phase 1: discoverPlaces (candidate pool)
 *   Phase 2: arrangeDay × N (execution=agent, exclude_names across days)
 *   Forbidden: one-shot multi-day LLM for the full trip
 *
 * arrange_day: single-day LLM (or Mode H host handoff)
 * Fallback: ITINERARY_MODE=legacy → code-only timed path
 */

import { z } from "zod";
import { type Locale } from "./locales";
import { type PlaceCard, type PlaceLocation, type PlanItineraryInput, type ToolResult } from "./types";
import { type TimedItineraryPlan, type TravelMode, dateForDay } from "./itinerary-timed";
import { assembleSystemPrompt } from "../agent/prompt-assembler";
import {
  assembleDiscoverAttractionJobs,
  assembleDiscoverRestaurantJobs,
} from "./query-assembler";
import {
  localDiningTokensForCity,
  mustSeeTokensForCity,
  nameMatchesMustSeeTokens,
} from "./discover-must-see";
import { filterAttractionPlaces, filterDiningPlaces } from "./place-filters";
import {
  dedupeByCluster,
  dedupeRestaurantsByStem,
  ensureMustSeeDiversity,
} from "./discover-dedupe";
import { normalizeMustIncludeToken, mustIncludeTokenCovered } from "./trip-intake";
import {
  applyMustIncludeDayEvidence,
  blockCoversMustIncludeToken,
  getMustIncludeCoverageSnapshot,
  mergeMustIncludeIntoCandidates,
  mustIncludeCoverageKey,
  peekMissingMustInclude,
  selectMustIncludeFocusToken,
  type GeoAnchor,
  type MustIncludeCoverageSnapshot,
} from "./must-include-coverage";
import { enrichArrangeDayWithTransit } from "./enrich-arrange-transit";
import { inferMustSeeFromPool } from "./discover-must-see-llm";
import { getAdapter } from "../adapters";
import { type ProviderId } from "./providers";
import { resolveProviderStrategy } from "../adapters/provider-resolver";
import { geocode, searchPlaces, searchRestaurants } from "./tools";

// --- Zod schema for LLM output ---

const AlternativeSchema = z.object({
  name: z.string(),
  reason: z.string(),
});

const BlockSchema = z.object({
  name: z.string(),
  type: z.enum(["attraction", "lunch", "dinner", "cafe"]),
  start_time: z.string().regex(/^\d{2}:\d{2}$/),
  duration_min: z.number().int().min(10).max(480),
  reason: z.string(),
  alternatives: z.array(AlternativeSchema).optional(),
  photos: z.array(z.string()).optional(), // attached from candidates in Phase 4
});

const TransportSchema = z.object({
  transport: z.string(),
  duration_min: z.number().int().min(0),
  depart_time: z.string().optional(),
  arrive_time: z.string().optional(),
});

const DaySchema = z.object({
  day_index: z.number().int().min(1),
  date: z.string().optional(),
  from_origin: TransportSchema.optional(),
  blocks: z.array(BlockSchema).min(1),
  to_destination: TransportSchema.optional(),
});

export const LlmItinerarySchema = z.object({
  days: z.array(DaySchema).min(1),
});

export type LlmItineraryOutput = z.infer<typeof LlmItinerarySchema>;

// --- Validation ---

export type ValidationError = {
  field: string;
  message: string;
};

/**
 * Validate LLM output against hard constraints.
 * Returns empty array if all checks pass.
 */
export function validateItinerary(
  output: LlmItineraryOutput,
  candidateNames: Set<string>,
  paceLimit: number,
  pace?: string,
): ValidationError[] {
  const errors: ValidationError[] = [];
  const seenAcrossDays = new Set<string>();
  /** Fullness rules apply only when pace is passed (arrange uses pace ?? "medium"). */
  const applyFullness = pace !== undefined;
  const paceId = pace === "tight" || pace === "relaxed" ? pace : "medium";

  for (const day of output.days) {
    // Check pace limit
    if (day.blocks.length > paceLimit) {
      errors.push({
        field: `days[${day.day_index}].blocks`,
        message: `Too many blocks (${day.blocks.length} > pace limit ${paceLimit})`,
      });
    }

    // Check all names come from candidates; enforce cross-day uniqueness for multi-day plans
    for (const block of day.blocks) {
      if (!candidateNames.has(block.name)) {
        errors.push({
          field: `days[${day.day_index}].blocks[${block.name}]`,
          message: `Place "${block.name}" not found in candidate list`,
        });
      }
      if (output.days.length > 1) {
        if (seenAcrossDays.has(block.name)) {
          errors.push({
            field: `days[${day.day_index}].blocks[${block.name}]`,
            message: `Place "${block.name}" is reused across days; each place may appear on at most one day`,
          });
        } else {
          seenAcrossDays.add(block.name);
        }
      }
    }

    const last = day.blocks[day.blocks.length - 1];
    const endMin = last ? blockEndMinutes(last) : null;
    if (applyFullness) {
      if (endMin != null && endMin < 16 * 60) {
        errors.push({
          field: `days[${day.day_index}].blocks`,
          message: `Day ends before 16:00 (too short / not a full day); extend the schedule`,
        });
      }
      const hasDinner = day.blocks.some((b) => b.type === "dinner");
      if (paceId === "medium" || paceId === "tight") {
        if (!hasDinner) {
          errors.push({
            field: `days[${day.day_index}].blocks`,
            message: `pace=${paceId} requires a dinner block (fill through normal dinner end ~20:00)`,
          });
        }
        if (endMin != null && endMin < 19 * 60) {
          errors.push({
            field: `days[${day.day_index}].blocks`,
            message: `pace=${paceId} day should end near dinner (~19:00–20:30), not before 19:00`,
          });
        }
      } else if (paceId === "relaxed" && endMin != null && endMin < 17 * 60) {
        errors.push({
          field: `days[${day.day_index}].blocks`,
          message: `pace=relaxed day should end at or after 17:00`,
        });
      }
    }
  }

  return errors;
}

function parseHhMmToMinutes(t: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh > 23 || mm > 59) return null;
  return hh * 60 + mm;
}

function blockEndMinutes(block: {
  start_time: string;
  duration_min: number;
}): number | null {
  const start = parseHhMmToMinutes(block.start_time);
  if (start == null || !Number.isFinite(block.duration_min)) return null;
  return start + block.duration_min;
}

// --- Pace limit mapping ---

function paceLimit(pace?: string): number {
  if (pace === "tight") return 6;
  if (pace === "relaxed") return 4;
  return 5; // medium
}

/** Discover + arrange prompt candidate cap (ADR-040 Story B). */
export const CANDIDATE_CAP = 16;

// --- User message builder ---

export function buildUserMessage(input: {
  city: string;
  numDays: number;
  candidates: { places: PlaceCard[]; restaurants: PlaceCard[] };
  weather?: Array<{ date: string; label: string; temp_max_c?: number }>;
  pace?: string;
  budget?: string;
  origin?: { name?: string; lat?: number; lng?: number };
  destination?: { name?: string; lat?: number; lng?: number };
  locale: Locale;
  dayIndex?: number;
  time_from?: string;
  time_to?: string;
  transit_preferred?: boolean;
  party_size?: number;
  /** Traveler free-text preferences for this day. */
  natural_language?: string;
  /** Explicit day focus (day trip / district). */
  day_theme?: string;
  /**
   * Destination-agnostic must-includes from chat (towns, places, themes).
   * Not a city encyclopedia — only what the traveler explicitly required.
   */
  must_include?: string[];
  /** Spend 1 节约 / 2 适中 / 3 宽松 */
  spend_level?: 1 | 2 | 3;
  /** Place names from server must_include search — must appear in today's blocks. */
  hard_must_schedule?: string[];
}): string {
  const parts: string[] = [];

  if (input.dayIndex != null && input.numDays === 1) {
    parts.push(
      `Plan day ${input.dayIndex} of a multi-day trip in ${input.city}. ` +
        `Only choose places from the candidate list below (already filtered to unused places).`,
    );
  } else {
    parts.push(`Plan a ${input.numDays}-day itinerary for ${input.city}.`);
    if (input.numDays > 1) {
      parts.push(
        "Across days, do not reuse the same place or restaurant name — each venue appears on at most one day.",
      );
    }
  }

  if (input.hard_must_schedule?.length) {
    parts.push(
      `\nHARD MUST SCHEDULE TODAY (server-injected must_include pool — include ≥1 of these ` +
        `attraction names in blocks): ${input.hard_must_schedule.join("; ")}. ` +
        `These places are co-located at a priority destination — schedule them together as the day's main focus. ` +
        `If they form a day-trip town cluster away from the base city, dedicate the FULL day to this destination and nearby attractions ` +
        `(do NOT dilute with distant base-city stops — travelers cannot do a half-day Sintra/Cascais and return for city sightseeing). ` +
        `If they are in-city attractions, you may mix with other city candidates.`,
    );
  }
  if (input.must_include?.length) {
    parts.push(
      `\nHARD MUST INCLUDE (trip-level list; advance coverage when this day's focus matches): ` +
        input.must_include.map((s) => s.trim()).filter(Boolean).join("; "),
    );
  }
  if (input.day_theme?.trim()) {
    parts.push(`\nDay theme / focus (must honor): ${input.day_theme.trim()}`);
  }
  if (input.natural_language?.trim()) {
    parts.push(`\nTraveler notes: ${input.natural_language.trim()}`);
  }

  // Origin/destination
  if (input.origin?.name) {
    const oLat = input.origin.lat;
    const oLng = input.origin.lng;
    if (oLat != null && oLng != null) {
      parts.push(`\nOrigin: ${input.origin.name} (${oLat}, ${oLng})`);
    } else {
      parts.push(`\nOrigin: ${input.origin.name} (coordinates unknown — still recommend transport from this daily start)`);
    }
  } else {
    parts.push(
      "\nOrigin: not specified — omit from_origin and to_destination; start at the first block (≥10:00); still plan transit times BETWEEN blocks only.",
    );
  }
  if (input.destination?.name && input.destination.name !== input.origin?.name) {
    const dLat = input.destination.lat;
    const dLng = input.destination.lng;
    if (dLat != null && dLng != null) {
      parts.push(`Destination: ${input.destination.name} (${dLat}, ${dLng})`);
    } else {
      parts.push(
        `Destination: ${input.destination.name} (coordinates unknown — recommend return transport when useful)`,
      );
    }
  }

  // Constraints
  const constraints: string[] = [];
  if (input.pace) constraints.push(`pace: ${input.pace}`);
  if (input.budget) constraints.push(`budget: ${input.budget}`);
  if (input.spend_level === 1) {
    constraints.push("spend_level=1 节约: prefer lower-cost meals and free/low-fee sights");
  } else if (input.spend_level === 3) {
    constraints.push("spend_level=3 宽松: prefer higher-quality dining and premium experiences");
  } else if (input.spend_level === 2) {
    constraints.push("spend_level=2 适中: balanced spend (default)");
  }
  if (input.party_size != null) {
    constraints.push(`party_size: ${input.party_size}`);
    if (input.party_size >= 6) {
      constraints.push(
        "party_size≥6: prefer venues and pacing suitable for larger groups / big tables",
      );
    }
  }
  if (input.time_from || input.time_to) {
    constraints.push(`time window: ${input.time_from ?? "…"}–${input.time_to ?? "…"}`);
  }
  if (input.transit_preferred === true) {
    constraints.push("transport: prefer public transit / metro over driving");
  } else if (input.transit_preferred === false) {
    constraints.push("transport: prefer walking between nearby stops");
  }
  constraints.push(`max places per day: ${paceLimit(input.pace)}`);
  const paceId = input.pace === "tight" || input.pace === "relaxed" ? input.pace : "medium";
  if (paceId === "medium") {
    constraints.push(
      "day fullness (medium default): include lunch + dinner; last block should end near dinner finish (~20:00, window 18:00–20:30); ending before 16:00 is invalid",
    );
  } else if (paceId === "tight") {
    constraints.push(
      "day fullness (tight): denser day with dinner; last block end ≥19:30; ending before 16:00 is invalid",
    );
  } else {
    constraints.push(
      "day fullness (relaxed): fewer stops but last block end ≥17:00; ending before 16:00 is invalid",
    );
  }
  parts.push(`\nConstraints: ${constraints.join(", ")}`);

  // Candidates (cap = CANDIDATE_CAP — ADR-040 Story B)
  const MAX_CANDIDATES = CANDIDATE_CAP;
  parts.push(`\n## Attraction candidates (${Math.min(input.candidates.places.length, MAX_CANDIDATES)}):\n`);
  for (const p of input.candidates.places.slice(0, MAX_CANDIDATES)) {
    parts.push(`- ${p.name} (${p.category}, rating: ${p.rating ?? "N/A"}, lat: ${p.location.lat.toFixed(4)}, lng: ${p.location.lng.toFixed(4)})`);
  }

  parts.push(`\n## Restaurant candidates (${Math.min(input.candidates.restaurants.length, MAX_CANDIDATES)}):\n`);
  for (const r of input.candidates.restaurants.slice(0, MAX_CANDIDATES)) {
    parts.push(`- ${r.name} (${r.category}, rating: ${r.rating ?? "N/A"}, lat: ${r.location.lat.toFixed(4)}, lng: ${r.location.lng.toFixed(4)})`);
  }

  // Weather
  if (input.weather?.length) {
    parts.push("\n## Weather:\n");
    for (const w of input.weather) {
      parts.push(`- ${w.date}: ${w.label}${w.temp_max_c != null ? `, ${w.temp_max_c}°C` : ""}`);
    }
  }

  parts.push(`\nRespond in ${input.locale} language. Return ONLY the JSON object.`);

  return parts.join("\n");
}

// --- LLM call + full pipeline ---

import OpenAI from "openai";
import { parseLocale } from "./locales";
import { loadGlossary } from "../agent/loop";

export function useFixtureLlm(): boolean {
  return !process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === "fixture";
}

export function createOpenAI(): OpenAI | null {
  if (useFixtureLlm()) return null;
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL,
  });
}

const DEFAULT_LLM_TIMEOUT_MS = 90_000;

/** Env: LLM_ARRANGE_TIMEOUT_MS (default 90000). Quanzil structured arrange often needs >45s. */
export function llmArrangeTimeoutMs(): number {
  const raw = Number(process.env.LLM_ARRANGE_TIMEOUT_MS ?? DEFAULT_LLM_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_LLM_TIMEOUT_MS;
}

/** Env: LLM_ITINERARY_TIMEOUT_MS (default 90000). */
export function llmItineraryTimeoutMs(): number {
  const raw = Number(process.env.LLM_ITINERARY_TIMEOUT_MS ?? DEFAULT_LLM_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_LLM_TIMEOUT_MS;
}

/**
 * Hard-abort wrapper — OpenAI SDK `timeout` is unreliable against Quanzil;
 * AbortSignal is the contract (ADR-032).
 */
export async function withAbortTimeout<T>(
  ms: number,
  fn: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fn(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

export function isLlmAbortError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { name?: string; message?: string };
  if (e.name === "AbortError") return true;
  const msg = typeof e.message === "string" ? e.message : "";
  return /aborted|abort|timeout/i.test(msg);
}

/** Extract JSON from LLM response that may contain markdown fencing. */
function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  // Try to find { ... } directly
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return text.trim();
}

export type ItineraryChatCreate = (
  params: {
    model: string;
    messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
    max_completion_tokens: number;
    temperature: number;
  },
  options: { signal: AbortSignal },
) => Promise<{ choices: Array<{ message?: { content?: string | null } }> }>;

type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string; retryable: boolean };

/** Extract assistant text from OpenAI-compatible chat.completions.create result. */
export function extractChatCompletionText(completion: unknown): string | null {
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
  const c = completion as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };
  if (!Array.isArray(c.choices)) {
    throw new Error(
      "LLM response missing choices[] — check OPENAI_BASE_URL / OPENAI_CHAT_MODEL",
    );
  }
  const text = c.choices[0]?.message?.content;
  if (typeof text !== "string") return null;
  const trimmed = text.trim();
  return trimmed.length ? trimmed : null;
}

/**
 * One LLM call with AbortSignal; retry at most once on validation failures only.
 * Timeout / network abort fails immediately (no second attempt).
 */
export async function callItineraryLlmWithValidationRetry<T>(opts: {
  create: ItineraryChatCreate;
  systemPrompt: string;
  userMessage: string;
  timeoutMs: number;
  temperature: number;
  maxCompletionTokens: number;
  parseAndValidate: (raw: string) => ValidationResult<T>;
  failLabel: string;
}): Promise<T> {
  let lastError: string | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: "system", content: opts.systemPrompt },
      {
        role: "user",
        content:
          attempt === 0
            ? opts.userMessage
            : `${opts.userMessage}\n\nPrevious errors:\n${lastError}\n\nFix and return valid JSON.`,
      },
    ];

    let raw: string | null | undefined;
    try {
      const completion = await withAbortTimeout(opts.timeoutMs, (signal) =>
        opts.create(
          {
            model: process.env.OPENAI_CHAT_MODEL ?? "gpt-4o",
            messages,
            max_completion_tokens: opts.maxCompletionTokens,
            temperature: opts.temperature,
          },
          { signal },
        ),
      );
      raw = extractChatCompletionText(completion);
    } catch (err) {
      if (isLlmAbortError(err)) {
        throw new Error(
          `${opts.failLabel}: LLM timed out after ${opts.timeoutMs}ms`,
          { cause: err },
        );
      }
      throw err;
    }

    if (!raw) {
      lastError = "empty LLM response";
      continue;
    }

    let parsed: ValidationResult<T>;
    try {
      const jsonStr = extractJson(raw);
      parsed = opts.parseAndValidate(jsonStr);
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      continue;
    }

    if (parsed.ok) return parsed.value;
    lastError = parsed.error;
    if (!parsed.retryable) {
      throw new Error(`${opts.failLabel}: ${lastError}`);
    }
  }

  throw new Error(`${opts.failLabel} after 2 attempts: ${lastError}`);
}

export type LlmPlanInput = {
  city: string;
  numDays: number;
  bounds: { start: string; end: string };
  origin?: { name?: string; lat?: number; lng?: number };
  destination?: { name?: string; lat?: number; lng?: number };
  pace?: string;
  budget?: "budget" | "premium";
  locale: Locale;
  providers?: string[];
  party_size?: number;
  /** Injected for testing — skips real search */
  _testCandidates?: { places: PlaceCard[]; restaurants: PlaceCard[] };
  /** Injected for testing — skips real OpenAI */
  _testChatCreate?: ItineraryChatCreate;
  /** Injected for testing — replace arrangeDay (ADR-040 Story C) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- avoids forward-ref to arrangeDay
  _testArrangeDay?: (input: any) => Promise<any>;
};

/**
 * Map plan input → discover_places input (ADR-040 Story A).
 */
export function toDiscoverPlacesInput(input: LlmPlanInput): DiscoverPlacesInput {
  return {
    city: input.city,
    bounds: input.bounds,
    origin: input.origin,
    locale: parseLocale(input.locale),
    numDays: input.numDays,
    providers: input.providers,
  };
}

/**
 * ADR-040: plan_itinerary true shell — discoverPlaces once + arrangeDay × N.
 * Forbidden: one-shot multi-day llmPlanItinerary LLM.
 */
export async function llmPlanItinerary(
  input: LlmPlanInput,
): Promise<LlmItineraryOutput> {
  const locale = parseLocale(input.locale);
  const candidates =
    input._testCandidates ??
    (await discoverPlaces(toDiscoverPlacesInput(input))).candidates;

  const arrange = input._testArrangeDay ?? arrangeDay;
  const days: LlmItineraryOutput["days"] = [];
  const excludeNames: string[] = [];
  const start = new Date(input.bounds.start);

  for (let dayIndex = 1; dayIndex <= input.numDays; dayIndex++) {
    const filtered = filterExcluded(candidates, excludeNames);
    const dayResult = await arrange({
      candidates: filtered,
      dayIndex,
      date: dateForDay(start, dayIndex - 1),
      city: input.city,
      origin: input.origin,
      destination: input.destination,
      pace: input.pace,
      budget: input.budget,
      locale,
      exclude_names: excludeNames.length ? excludeNames : undefined,
      execution: "agent",
      providers: input.providers,
      party_size: input.party_size,
      _testChatCreate: input._testChatCreate,
    });

    if ("execution" in dayResult && dayResult.execution === "host") {
      throw new Error("plan_itinerary shell requires arrangeDay execution=agent");
    }

    const day = dayResult as LlmItineraryOutput["days"][number];
    days.push({
      day_index: day.day_index ?? dayIndex,
      date: day.date,
      blocks: day.blocks,
    });
    for (const block of day.blocks) {
      excludeNames.push(block.name);
    }
  }

  return { days };
}

/**
 * Resolve providers the same way search_restaurants / search_places do when
 * callers omit providers[] (ADR-026/030 via resolveProviderStrategy).
 * Explicit caller providers[] always win.
 *
 * Feature 34 Arm A: mainland default AMAP-only is expanded to dual-source
 * (AMAP + GOOGLE_MAPS) for discover must-see coverage. Caller-forced single
 * provider is respected.
 */
async function resolveDiscoverProviders(input: {
  city: string;
  locale: Locale;
  providers?: string[];
  origin?: { lat?: number; lng?: number };
}): Promise<string[]> {
  if (input.providers?.length) return input.providers;
  const strategy = await resolveProviderStrategy({
    location: input.city,
    near:
      input.origin?.lat != null && input.origin?.lng != null
        ? { lat: input.origin.lat, lng: input.origin.lng }
        : undefined,
    locale: input.locale,
  });
  const providers = strategy.searchProviders;
  if (providers.includes("AMAP") && !providers.includes("GOOGLE_MAPS")) {
    return ["AMAP", "GOOGLE_MAPS"];
  }
  return providers;
}

function mergePlaceCardsByName(lists: PlaceCard[][]): PlaceCard[] {
  const seen = new Set<string>();
  const out: PlaceCard[] = [];
  for (const list of lists) {
    for (const card of list) {
      const name = card.name?.trim();
      if (!name || seen.has(name)) continue;
      seen.add(name);
      out.push(card);
    }
  }
  return out;
}

/** Seed-token hits first, then higher rating; stable for equal scores. */
export function rankDiscoverCandidates(
  cards: PlaceCard[],
  mustSeeTokens: string[],
): PlaceCard[] {
  return [...cards].sort((a, b) => {
    const aHit = nameMatchesMustSeeTokens(a.name ?? "", mustSeeTokens) ? 1 : 0;
    const bHit = nameMatchesMustSeeTokens(b.name ?? "", mustSeeTokens) ? 1 : 0;
    if (aHit !== bHit) return bHit - aHit;
    const ar = typeof a.rating === "number" ? a.rating : -1;
    const br = typeof b.rating === "number" ? b.rating : -1;
    return br - ar;
  });
}

const CHAIN_DINING_DENY =
  /必胜客|肯德基|麦当劳|星巴克|汉堡王|赛百味|永和大王|真功夫|海底捞|西贝|喜茶|奈雪|Pizza Hut|KFC|McDonald|Starbucks|Burger King|Subway/i;

/**
 * Arm A dining rank: local specialty tokens up, chains down, then rating.
 * ADR-042 Update: city-specific far-district hint removed (was Xi'an districts).
 * Does not fabricate POIs.
 */
export function rankDiningCandidates(
  cards: PlaceCard[],
  localTokens: string[],
): PlaceCard[] {
  const score = (c: PlaceCard): number => {
    const name = c.name ?? "";
    let s = typeof c.rating === "number" ? c.rating : 0;
    if (nameMatchesMustSeeTokens(name, localTokens)) s += 5;
    if (CHAIN_DINING_DENY.test(name)) s -= 8;
    return s;
  };
  return [...cards].sort((a, b) => score(b) - score(a));
}

async function searchCandidatePools(input: {
  city: string;
  locale: Locale;
  providers?: string[];
  origin?: { name?: string; lat?: number; lng?: number };
}): Promise<{ places: PlaceCard[]; restaurants: PlaceCard[] }> {
  const locale = parseLocale(input.locale);
  const providers = await resolveDiscoverProviders({
    city: input.city,
    locale,
    providers: input.providers,
    origin: input.origin,
  });

  const near =
    input.origin?.lat != null && input.origin?.lng != null
      ? { lat: input.origin.lat, lng: input.origin.lng }
      : undefined;

  const attractionJobs = assembleDiscoverAttractionJobs({
    city: input.city,
    providers,
    uiLocale: locale,
  });
  const restaurantJobs = assembleDiscoverRestaurantJobs({
    city: input.city,
    providers,
    uiLocale: locale,
  });

  const [placeResults, restaurantResults] = await Promise.all([
    Promise.all(
      attractionJobs.map((job) =>
        searchPlaces({
          address: input.city,
          query: job.query,
          locale,
          providers: job.providers,
          near,
          // Google searchText RankPreference is RELEVANCE | DISTANCE only.
          // POPULARITY is invalid (HTTP 400) and emptied the Lisbon attraction pool.
          rankPreference: "RELEVANCE",
        }),
      ),
    ),
    Promise.all(
      restaurantJobs.map((job) =>
        searchRestaurants({
          address: input.city,
          query: job.query,
          locale,
          providers: job.providers,
          near,
        }),
      ),
    ),
  ]);

  const tokens = mustSeeTokensForCity(input.city);
  const places = rankDiscoverCandidates(
    ensureMustSeeDiversity(
      dedupeByCluster(
        filterAttractionPlaces(mergePlaceCardsByName(placeResults.map((r) => r.data ?? []))),
      ),
    ),
    tokens,
  );
  const restaurants = rankDiningCandidates(
    dedupeRestaurantsByStem(
      filterDiningPlaces(mergePlaceCardsByName(restaurantResults.map((r) => r.data ?? []))),
    ),
    localDiningTokensForCity(input.city),
  );

  return { places, restaurants };
}

export async function searchCandidates(input: LlmPlanInput): Promise<{
  places: PlaceCard[];
  restaurants: PlaceCard[];
}> {
  return searchCandidatePools({
    city: input.city,
    locale: input.locale,
    providers: input.providers,
    origin: input.origin,
  });
}

// --- MCP tool functions ---

export type DiscoverPlacesInput = {
  city: string;
  bounds: { start: string; end: string };
  origin?: { name?: string; lat?: number; lng?: number };
  locale: Locale;
  numDays?: number;
  providers?: string[];
};

export type DiscoverPlacesResult = {
  candidates: { places: PlaceCard[]; restaurants: PlaceCard[] };
  weather?: Array<{ date: string; label: string; temp_max_c?: number }>;
  /** ADR-042 Update: LLM-inferred must-see names (destination-agnostic, pool-validated). */
  inferred_must_see?: string[];
};

export type DiscoverStreamEvent =
  | { type: "candidate"; kind: "place" | "restaurant"; card: PlaceCard }
  | { type: "discover_done"; counts: { places: number; restaurants: number } };

function slimCard(card: PlaceCard): PlaceCard {
  return {
    ...card,
    photos: card.photos?.slice(0, 1),
  };
}

/**
 * Strip fat fields before LLM / Mode H prompt assembly (P0).
 * Keep photos[0] + sanitized sources/deeplinks so ChatBox can render links/images.
 * Never echo API keys in URLs. Phase 4 photo join for execution=agent still uses the original pool.
 */
function sanitizePublicUrl(url: string): string {
  try {
    const u = new URL(url);
    for (const k of [...u.searchParams.keys()]) {
      if (/^(api_)?key$/i.test(k) || /token/i.test(k)) u.searchParams.delete(k);
    }
    return u.toString();
  } catch {
    return url.replace(/([?&](?:api_)?key=)[^&]*/gi, "$1REDACTED");
  }
}

export function slimArrangeCandidate(card: PlaceCard): PlaceCard {
  const sources = normalizePlaceSources(card.sources, card);
  return {
    provider: card.provider,
    primary_provider: card.primary_provider,
    name: card.name,
    address: card.address,
    location: card.location,
    rating: card.rating,
    category: card.category,
    price_level: card.price_level,
    price_per_person: card.price_per_person,
    photos: card.photos?.slice(0, 1).map(sanitizePublicUrl),
    sources: sources.map((s) => ({
      provider: s.provider,
      native_id: s.native_id,
      deeplinks: Object.fromEntries(
        Object.entries(s.deeplinks ?? {}).map(([k, v]) => [k, sanitizePublicUrl(v)]),
      ),
    })),
  };
}

/**
 * ChatBox hosts sometimes rewrite sources from array → `{ deeplinks }` object,
 * which crashed slimArrangeCandidate (`.map is not a function`).
 * Normalize to PlaceCard.sources shape; synthesize google_web from lat/lng when empty.
 */
export function normalizePlaceSources(
  raw: unknown,
  card?: { provider?: string; location?: { lat?: number; lng?: number }; name?: string },
): NonNullable<PlaceCard["sources"]> {
  const asList = (): Array<Record<string, unknown>> => {
    if (raw == null) return [];
    if (Array.isArray(raw)) {
      return raw.filter((s): s is Record<string, unknown> => !!s && typeof s === "object");
    }
    if (typeof raw === "object") {
      return [raw as Record<string, unknown>];
    }
    return [];
  };

  const out: NonNullable<PlaceCard["sources"]> = [];
  for (const s of asList()) {
    const deeplinksRaw = s.deeplinks;
    const deeplinks =
      deeplinksRaw && typeof deeplinksRaw === "object" && !Array.isArray(deeplinksRaw)
        ? (deeplinksRaw as Record<string, string>)
        : {};
    const provider =
      typeof s.provider === "string"
        ? s.provider
        : typeof card?.provider === "string"
          ? card.provider
          : "GOOGLE_MAPS";
    const native_id = typeof s.native_id === "string" ? s.native_id : "";
    out.push({ provider, native_id, deeplinks });
  }

  if (out.length === 0 && card?.location?.lat != null && card?.location?.lng != null) {
    const q = `${card.location.lat}%2C${card.location.lng}`;
    out.push({
      provider: card.provider ?? "GOOGLE_MAPS",
      native_id: "",
      deeplinks: {
        google_web: `https://www.google.com/maps/search/?api=1&query=${q}`,
      },
    });
  }
  return out;
}

export function slimArrangeCandidates(candidates: {
  places: PlaceCard[];
  restaurants: PlaceCard[];
}): { places: PlaceCard[]; restaurants: PlaceCard[] } {
  return {
    places: candidates.places.map(slimArrangeCandidate),
    restaurants: candidates.restaurants.map(slimArrangeCandidate),
  };
}

/**
 * MCP wire size: drop photos / photos_cover from agent arrange results.
 * Host presents via times + reasons + legs deeplinks; fat Google photo URLs
 * blow ChatBox context and stall Day 4.
 */
export function slimArrangeDayResultForMcp(result: ArrangeDayResult): unknown {
  if ("execution" in result && result.execution === "host") {
    return result;
  }
  const day = result as Record<string, unknown>;
  const blocks = Array.isArray(day.blocks)
    ? (day.blocks as Array<Record<string, unknown>>).map((block) => {
        const { photos: _photos, ...rest } = block;
        return rest;
      })
    : day.blocks;
  const { photos_cover: _cover, ...rest } = day;
  return { ...rest, blocks };
}

/**
 * MCP/HTTP tool: discover_places — search candidates for itinerary planning.
 * Uses provider-resolver + QLP query-assembler (same policy as restaurant search).
 * Optional onEvent enables HTTP NDJSON progressive emit (MCP omits it).
 */
export async function discoverPlaces(
  input: DiscoverPlacesInput,
  opts?: { onEvent?: (e: DiscoverStreamEvent) => void },
): Promise<DiscoverPlacesResult> {
  const numDays = Math.max(1, input.numDays ?? 1);
  const locale = parseLocale(input.locale);
  const { places: rawPlaces, restaurants: rawRestaurants } = await searchCandidatePools({
    city: input.city,
    locale,
    providers: input.providers,
    origin: input.origin,
  });

  const places = rawPlaces.slice(0, CANDIDATE_CAP * Math.min(numDays, 3));
  const restaurants = rawRestaurants.slice(0, CANDIDATE_CAP * Math.min(numDays, 3));

  for (const card of places) {
    opts?.onEvent?.({ type: "candidate", kind: "place", card: slimCard(card) });
  }
  for (const card of restaurants) {
    opts?.onEvent?.({ type: "candidate", kind: "restaurant", card: slimCard(card) });
  }
  opts?.onEvent?.({
    type: "discover_done",
    counts: { places: places.length, restaurants: restaurants.length },
  });

  // ADR-042 Update: infer must-see from the pool (destination-agnostic, no city names in source).
  // Failure returns [] and does not block discover.
  const inferred_must_see = await inferMustSeeFromPool({ places });

  return { candidates: { places, restaurants }, inferred_must_see };
}

export type ArrangeDayInput = {
  candidates: { places: PlaceCard[]; restaurants: PlaceCard[] };
  dayIndex: number;
  city?: string;
  origin?: { name?: string; lat?: number; lng?: number };
  destination?: { name?: string; lat?: number; lng?: number };
  pace?: string;
  budget?: "budget" | "premium";
  locale: Locale;
  date?: string;
  exclude_names?: string[];
  /**
   * `host` — Mode H handoff: return prompts + slim candidates, no LLM.
   * `agent` (default for HTTP) — server-side OPENAI_CN arrange.
   */
  execution?: "agent" | "host";
  /** Injected for testing — skips real OpenAI */
  _testChatCreate?: ItineraryChatCreate;
  /** Injected for testing — directions ETA */
  _testResolveDuration?: (
    mode: TravelMode,
    from: PlaceLocation,
    to: PlaceLocation,
  ) => Promise<{ duration_min: number; distance_m?: number } | null>;
  /** Providers used for directions (default GOOGLE_MAPS then AMAP). */
  providers?: string[];
  preferences?: ArrangeSchedulePreferences;
  /** ADR-040 D6: party size 1–20 */
  party_size?: number;
  /** Injected for tests — skip live geocode for must_include. */
  _testGeocodeMustInclude?: (query: string) => Promise<GeoAnchor | null>;
  /** Injected for tests — skip live searchPlaces for must_include. */
  _testSearchMustInclude?: (query: string) => Promise<PlaceCard[]>;
  /** Injected for tests — skip live discoverPlaces when candidates empty (ADR-043 D8). */
  _testDiscoverPlaces?: (
    input: DiscoverPlacesInput,
  ) => Promise<DiscoverPlacesResult>;
  /** Optional total days — sizes auto-discover pool when candidates empty. */
  num_days?: number;
};

/** ADR-043 D8 — MCP/HTTP error host_instructions when arrange_day throws. */
export const ARRANGE_DAY_FAILURE_HOST_INSTRUCTIONS =
  "arrange_day failed. Retry the SAME dayIndex only. " +
  "Empty candidates are auto-discovered from city on the server — do not invent POIs or " +
  "call search_places to fabricate a pool. Prefer passing the discover_places pool when available. " +
  "If retrying with a host pool, keep sources as an ARRAY of {provider, native_id, deeplinks}. " +
  "Do not invent truncation stories; do not restart Day 1.";

/**
 * ADR-043 D8: when places or restaurants are empty after exclude, discover from city.
 */
export async function ensureArrangeCandidates(input: {
  candidates: { places: PlaceCard[]; restaurants: PlaceCard[] };
  city?: string;
  origin?: { name?: string; lat?: number; lng?: number };
  locale: Locale;
  date?: string;
  providers?: string[];
  num_days?: number;
  exclude_names?: string[];
  _testDiscoverPlaces?: ArrangeDayInput["_testDiscoverPlaces"];
}): Promise<{
  candidates: { places: PlaceCard[]; restaurants: PlaceCard[] };
  auto_discovered: boolean;
}> {
  const places = input.candidates.places ?? [];
  const restaurants = input.candidates.restaurants ?? [];
  // Only auto-discover when attraction pool is empty (Lisbon host bug). Do not
  // live-discover merely because restaurants=[] while places already exist.
  if (places.length > 0) {
    return { candidates: { places, restaurants }, auto_discovered: false };
  }

  const city = input.city?.trim();
  if (!city) {
    throw new Error(
      "arrange_day: candidates empty and city missing — cannot auto-discover. Pass city or a non-empty candidates pool.",
    );
  }

  const day =
    input.date?.trim() || new Date().toISOString().slice(0, 10);
  const discoverInput: DiscoverPlacesInput = {
    city,
    bounds: { start: day, end: day },
    origin: input.origin,
    locale: input.locale,
    numDays: Math.max(1, input.num_days ?? 1),
    providers: input.providers,
  };

  const discovered = input._testDiscoverPlaces
    ? await input._testDiscoverPlaces(discoverInput)
    : await discoverPlaces(discoverInput);

  const needRestaurants = restaurants.length === 0;
  const filled = filterExcluded(
    {
      places: discovered.candidates.places,
      restaurants: needRestaurants
        ? discovered.candidates.restaurants
        : restaurants,
    },
    input.exclude_names,
  );

  if (filled.places.length === 0) {
    throw new Error(
      "arrange_day: auto-discover returned no places after exclude_names — widen candidates or reduce exclude_names.",
    );
  }

  return { candidates: filled, auto_discovered: true };
}

export type ArrangeHostHandoff = {
  execution: "host";
  system_prompt: string;
  user_prompt: string;
  candidates_slim: { places: PlaceCard[]; restaurants: PlaceCard[] };
  output_contract: string;
  /** ADR-040 ChatBox: mandatory next steps for the host model */
  host_instructions: string;
  day_index: number;
  date?: string;
  must_include_coverage?: MustIncludeCoverageSnapshot;
  must_include_focus?: string | null;
};

export type ArrangeDayResult =
  | ((LlmItineraryOutput["days"][number] & {
      photos_cover?: string;
      transit_outcome?: "directions" | "heuristic" | "partial";
      blocks: Array<
        LlmItineraryOutput["days"][number]["blocks"][number] & {
          legs_to_here?: import("./itinerary-timed").ItineraryLeg[];
        }
      >;
      must_include_coverage?: MustIncludeCoverageSnapshot;
      must_include_focus?: string | null;
    }))
  | ArrangeHostHandoff;

export const ARRANGE_OUTPUT_CONTRACT =
  "Return ONLY JSON: { days: [{ day_index, date?, from_origin?: { transport, duration_min, depart_time? }, blocks: [{ name, type: attraction|lunch|dinner|cafe, start_time HH:MM, duration_min, reason, alternatives? }], to_destination?: { transport, duration_min, arrive_time? } }] }. " +
  "Every block MUST have start_time + duration_min. Include from_origin/to_destination ONLY when Origin is set; if Origin omitted, exclude both and start at first block. " +
  "Default pace=medium: include dinner and end near ~20:00 (never end before 16:00). Names must come from candidates_slim. Include HARD MUST INCLUDE / must_include when listed.";

export function buildHostInstructions(input: {
  dayIndex: number;
  date?: string;
  locale: Locale;
}): string {
  const dayLabel = input.date
    ? `Day ${input.dayIndex} (${input.date})`
    : `Day ${input.dayIndex}`;
  if (input.locale === "CN" || input.locale === "HK" || input.locale === "TW") {
    return [
      `【立即执行 · 禁止跳过】`,
      `1. 用 system_prompt + user_prompt + candidates_slim 生成 ${dayLabel} 行程（遵守 output_contract）。`,
      `2. 立刻把这一天写进对用户可见的回复：每个景点须有开始时间与停留时长（如 10:00–11:30）；站间交通必写；仅当有酒店/起点时写酒店→首站与末站→回程；附地图链接/图片（来自 candidates_slim）。`,
      `3. 在用户看到这一天之前，禁止再调用 arrange_day / plan_itinerary。`,
      `4. 写完这一天并展示给用户后，自行继续对下一天调用 arrange_day（不要问用户、不要等「继续」），但一次一天：先展示当天，再调下一天，禁止同回合并发/批量（exclude_names 仅填「当天真正排进日程」的店名）。`,
      `5. 边界收集：一条消息问齐缺口（地点/日期/天数/可选酒店/偏好）；禁止一次只问一项再调工具。酒店可选。`,
    ].join("\n");
  }
  return [
    `[DO NOW — do not skip]`,
    `1. Use system_prompt + user_prompt + candidates_slim to plan ${dayLabel} (obey output_contract).`,
    `2. Immediately write that single day to the user: every stop needs start_time + duration; always include between-stop transit; hotel→first / last→return only when origin is known; attach map links/photos from candidates_slim.`,
    `3. Do NOT call arrange_day / plan_itinerary again until this day is visible in the chat.`,
    `4. Then call arrange_day for the next day yourself (no asking the user, no waiting for 继续) — but ONE day at a time: present this day first, then call the next; do NOT fire multiple arrange_day in parallel (exclude_names = names actually scheduled).`,
    `5. Boundary questions: ONE message covering all gaps (place/dates/days/optional hotel/preferences). Forbidden: one field per MCP call. Hotel is optional.`,
  ].join("\n");
}

/**
 * Shared schedule prompt builder (Mode H + agent path).
 */
export type ArrangeSchedulePreferences = {
  time_from?: string;
  time_to?: string;
  transit_preferred?: boolean;
  /** Free-text traveler notes (e.g. day trip, seafood). */
  natural_language?: string;
  /** Host-assigned focus for this day only. */
  day_theme?: string;
  /** Chat-derived must-includes (towns/places) — not city encyclopedia hardcodes. */
  must_include?: string[];
  /** Spend 1 节约 / 2 适中 / 3 宽松 */
  spend_level?: 1 | 2 | 3;
  interests?: string;
  /** Server-injected must_include place names for this day. */
  hard_must_schedule?: string[];
};

export function buildSchedulePrompt(input: {
  candidates: { places: PlaceCard[]; restaurants: PlaceCard[] };
  dayIndex: number;
  city?: string;
  origin?: { name?: string; lat?: number; lng?: number };
  destination?: { name?: string; lat?: number; lng?: number };
  pace?: string;
  budget?: "budget" | "premium";
  locale: Locale;
  preferences?: ArrangeSchedulePreferences;
  party_size?: number;
}): { system_prompt: string; user_prompt: string; candidates_slim: { places: PlaceCard[]; restaurants: PlaceCard[] } } {
  const locale = parseLocale(input.locale);
  const slim = slimArrangeCandidates(input.candidates);
  const system_prompt = assembleSystemPrompt({
    locale,
    intent: "itinerary",
    budget: input.budget,
    glossary: loadGlossary(locale) ?? undefined,
  });
  const user_prompt = buildUserMessage({
    city: input.city?.trim() || input.origin?.name || "city",
    numDays: 1,
    dayIndex: input.dayIndex,
    candidates: slim,
    pace: input.pace,
    budget: input.budget,
    origin: input.origin,
    destination: input.destination,
    locale,
    time_from: input.preferences?.time_from,
    time_to: input.preferences?.time_to,
    transit_preferred: input.preferences?.transit_preferred,
    party_size: input.party_size,
    natural_language: input.preferences?.natural_language,
    day_theme: input.preferences?.day_theme,
    must_include: input.preferences?.must_include,
    spend_level: input.preferences?.spend_level,
    hard_must_schedule:
      input.preferences?.hard_must_schedule ??
      undefined,
  });
  return { system_prompt, user_prompt, candidates_slim: slim };
}

export type ArrangeStreamEvent =
  | { type: "place"; dayIndex: number; block: LlmItineraryOutput["days"][number]["blocks"][number] }
  | { type: "day_done"; dayIndex: number };

function filterExcluded(
  candidates: { places: PlaceCard[]; restaurants: PlaceCard[] },
  exclude?: string[],
): { places: PlaceCard[]; restaurants: PlaceCard[] } {
  if (!exclude?.length) return candidates;
  const ban = new Set(exclude);
  return {
    places: candidates.places.filter((p) => !ban.has(p.name)),
    restaurants: candidates.restaurants.filter((r) => !ban.has(r.name)),
  };
}

/** Resolve hotel / landmark name → lat/lng for transit legs (ADR-040 ChatBox). */
async function resolvePointForTransit(
  point?: { name?: string; lat?: number; lng?: number },
  providers?: string[],
): Promise<{ name?: string; lat?: number; lng?: number } | undefined> {
  if (!point) return undefined;
  if (point.lat != null && point.lng != null) return point;
  const query = point.name?.trim();
  if (!query) return point;
  try {
    const result = await geocode({
      query,
      providers: providers?.length ? providers : undefined,
    });
    const hit = result.data;
    if (hit?.lat != null && hit?.lng != null) {
      return {
        name: point.name,
        lat: hit.lat,
        lng: hit.lng,
      };
    }
  } catch {
    /* keep name-only; enrich degrades without origin legs */
  }
  return point;
}

/** ADR-043 D7/D9: pick one missing must_include, geocode+search, merge into candidates.
 * D9 P0: prefer the assigned token for this dayIndex; seed assignment; sticky. */
async function prepareMustIncludeFocus(input: {
  candidates: { places: PlaceCard[]; restaurants: PlaceCard[] };
  preferences?: ArrangeSchedulePreferences;
  city?: string;
  origin?: { name?: string; lat?: number; lng?: number };
  locale: Locale;
  providers?: string[];
  dayIndex?: number;
  num_days?: number;
  _testGeocodeMustInclude?: ArrangeDayInput["_testGeocodeMustInclude"];
  _testSearchMustInclude?: ArrangeDayInput["_testSearchMustInclude"];
}): Promise<{
  candidates: { places: PlaceCard[]; restaurants: PlaceCard[] };
  preferences: ArrangeSchedulePreferences | undefined;
  coverageKey: string;
  focusToken: string | null;
  focusPool: PlaceCard[];
  focusAnchor: GeoAnchor | null;
}> {
  const coverageKey = mustIncludeCoverageKey({
    city: input.city,
    originName: input.origin?.name,
    locale: input.locale,
  });
  const mustList = (input.preferences?.must_include ?? [])
    .map((s) => s.trim())
    .filter(Boolean);
  if (!mustList.length) {
    // ADR-043 D9 P0: sticky — recover must_include from a prior seed even if
    // the host omitted preferences.must_include on this call.
    const sticky = getMustIncludeCoverageSnapshot(coverageKey).must_include;
    if (!sticky.length) {
      return {
        candidates: input.candidates,
        preferences: input.preferences,
        coverageKey,
        focusToken: null,
        focusPool: [],
        focusAnchor: null,
      };
    }
    return prepareMustIncludeFocus({
      ...input,
      preferences: { ...input.preferences, must_include: sticky },
    });
  }

  const missing = peekMissingMustInclude(coverageKey, mustList);
  // D9 精简: focus = first still-missing token (theme-aligned preferred).
  const focusToken = selectMustIncludeFocusToken({
    must_include: mustList,
    missing,
    day_theme: input.preferences?.day_theme,
  });
  if (!focusToken) {
    return {
      candidates: input.candidates,
      preferences: input.preferences,
      coverageKey,
      focusToken: null,
      focusPool: [],
      focusAnchor: null,
    };
  }

  const cityHint = input.city?.trim() ?? "";
  const query = cityHint ? `${focusToken} ${cityHint}` : focusToken;

  let focusAnchor: GeoAnchor | null = null;
  if (input._testGeocodeMustInclude) {
    focusAnchor = await input._testGeocodeMustInclude(focusToken);
  } else {
    try {
      const geo = await geocode({
        query: focusToken,
        providers: input.providers?.length ? input.providers : undefined,
      });
      const hit = geo.data;
      if (hit?.lat != null && hit?.lng != null) {
        const aliases = [focusToken];
        if (hit.address?.trim()) aliases.push(hit.address.trim());
        focusAnchor = { lat: hit.lat, lng: hit.lng, aliases };
      }
    } catch {
      /* continue without anchor */
    }
  }

  let focusPool: PlaceCard[] = [];
  if (input._testSearchMustInclude) {
    focusPool = await input._testSearchMustInclude(query);
  } else {
    try {
      const searched = await searchPlaces({
        query,
        providers: input.providers?.length
          ? input.providers
          : ["GOOGLE_MAPS"],
        locale: input.locale,
      });
      focusPool = (searched.data ?? []).slice(0, 12);
    } catch {
      focusPool = [];
    }
  }

  const merged = mergeMustIncludeIntoCandidates(input.candidates, focusPool);
  const hardNames = focusPool.map((p) => p.name).filter(Boolean);
  const preferences: ArrangeSchedulePreferences = {
    ...input.preferences,
    must_include: mustList,
    hard_must_schedule: hardNames.length ? hardNames : undefined,
  };

  return {
    candidates: merged,
    preferences,
    coverageKey,
    focusToken,
    focusPool,
    focusAnchor,
  };
}

/**
 * MCP/HTTP tool: arrange_day — LLM plans a single day from candidates,
 * or Mode H host handoff when execution=host.
 * Optional onEvent emits each validated block for HTTP NDJSON (agent path only).
 */
export async function arrangeDay(
  input: ArrangeDayInput,
  opts?: { onEvent?: (e: ArrangeStreamEvent) => void },
): Promise<ArrangeDayResult> {
  const filtered0 = filterExcluded(input.candidates, input.exclude_names);
  const locale = parseLocale(input.locale);

  const ensured = await ensureArrangeCandidates({
    candidates: filtered0,
    city: input.city,
    origin: input.origin,
    locale,
    date: input.date,
    providers: input.providers,
    num_days: input.num_days,
    exclude_names: input.exclude_names,
    _testDiscoverPlaces: input._testDiscoverPlaces,
  });

  const prepared = await prepareMustIncludeFocus({
    candidates: ensured.candidates,
    preferences: input.preferences,
    city: input.city,
    origin: input.origin,
    locale,
    providers: input.providers,
    dayIndex: input.dayIndex,
    num_days: input.num_days,
    _testGeocodeMustInclude: input._testGeocodeMustInclude,
    _testSearchMustInclude: input._testSearchMustInclude,
  });
  const filtered = prepared.candidates;
  const prefs = prepared.preferences;

  if (input.execution === "host") {
    const origin = await resolvePointForTransit(input.origin, input.providers);
    const destination = await resolvePointForTransit(
      input.destination,
      input.providers,
    );
    const prompt = buildSchedulePrompt({
      candidates: filtered,
      dayIndex: input.dayIndex,
      city: input.city,
      origin,
      destination,
      pace: input.pace,
      budget: input.budget,
      locale: input.locale,
      preferences: prefs,
      party_size: input.party_size,
    });
    const coverage = applyMustIncludeDayEvidence({
      key: prepared.coverageKey,
      must_include: prefs?.must_include,
      blocks: [],
      focusToken: prepared.focusToken,
      focusPool: prepared.focusPool,
      focusAnchor: prepared.focusAnchor,
      candidates: [...filtered.places, ...filtered.restaurants],
    });
    return {
      execution: "host",
      system_prompt: prompt.system_prompt,
      user_prompt: prompt.user_prompt,
      candidates_slim: prompt.candidates_slim,
      output_contract: ARRANGE_OUTPUT_CONTRACT,
      host_instructions: buildHostInstructions({
        dayIndex: input.dayIndex,
        date: input.date,
        locale,
      }),
      day_index: input.dayIndex,
      date: input.date,
      must_include_coverage: coverage,
      must_include_focus: prepared.focusToken,
    };
  }

  const candidateNames = new Set([
    ...filtered.places.map((p) => p.name),
    ...filtered.restaurants.map((r) => r.name),
  ]);
  /** Original pool for Phase 4 photo join */
  const allCandidates = [...filtered.places, ...filtered.restaurants];
  const prompt = buildSchedulePrompt({
    candidates: filtered,
    dayIndex: input.dayIndex,
    city: input.city,
    origin: input.origin,
    destination: input.destination,
    pace: input.pace,
    budget: input.budget,
    locale,
    preferences: prefs,
    party_size: input.party_size,
  });

  const create = input._testChatCreate ?? (() => {
    const openai = createOpenAI();
    if (!openai) throw new Error("LLM not configured");
    return openai.chat.completions.create.bind(openai.chat.completions) as ItineraryChatCreate;
  })();

  const day = await callItineraryLlmWithValidationRetry<LlmItineraryOutput["days"][number]>({
    create,
    systemPrompt: prompt.system_prompt,
    userMessage: prompt.user_prompt,
    timeoutMs: llmArrangeTimeoutMs(),
    temperature: 0.35,
    maxCompletionTokens: 1280,
    failLabel: "arrange_day failed",
    parseAndValidate: (jsonStr) => {
      const schema = LlmItinerarySchema.safeParse(JSON.parse(jsonStr));
      if (!schema.success) {
        return {
          ok: false,
          retryable: true,
          error: schema.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
        };
      }
      const first = schema.data.days[0];
      if (!first) {
        return { ok: false, retryable: true, error: "missing days[0]" };
      }
      const errors = validateItinerary(
        { days: [first] },
        candidateNames,
        paceLimit(input.pace),
        input.pace ?? "medium",
      );
      if (errors.length > 0) {
        return {
          ok: false,
          retryable: true,
          error: errors.map((e) => `${e.field}: ${e.message}`).join("; "),
        };
      }
      const hasOrigin =
        Boolean(input.origin?.name?.trim()) ||
        (input.origin?.lat != null && input.origin?.lng != null);
      let value: typeof first;
      if (!hasOrigin) {
        const { from_origin: _fo, to_destination: _td, ...rest } = first;
        value = rest as typeof first;
      } else {
        value = first;
      }

      // ADR-043 D9 精简: must_include focus hard-fail retry. If the focus token
      // is not evidenced by any block, make the LLM retry once with the error
      // surfaced (no deterministic inject — no low-quality fabricated blocks).
      if (prepared.focusToken) {
        const byName = new Map(allCandidates.map((c) => [normalizeMustIncludeToken(c.name), c]));
        const focusCovered = value.blocks.some((b) => {
          const card = byName.get(normalizeMustIncludeToken(b.name));
          if (
            blockCoversMustIncludeToken({
              token: prepared.focusToken!,
              blockName: b.name,
              blockType: b.type,
              blockLocation: card?.location ?? null,
              blockAddress: card?.address,
              blockNativeIds: card ? (card.sources ?? []).flatMap((s) => (s.native_id ? [s.native_id] : [])) : [],
              focusPool: prepared.focusPool,
              anchor: prepared.focusAnchor ?? null,
            })
          ) {
            return true;
          }
          const t = (b.type ?? "").toLowerCase();
          if (t === "transit" || t === "transfer" || t === "transport") return false;
          return mustIncludeTokenCovered(prepared.focusToken!, [b.name, card?.address ?? ""]);
        });
        if (!focusCovered) {
          return {
            ok: false,
            retryable: true,
            error: `must_include "${prepared.focusToken}" not covered by any block. ` +
              `Include a block whose name matches the focus place (or a place within ~10km of it).`,
          };
        }
      }

      return { ok: true, value };
    },
  });

  const blocksWithPhotos = day.blocks.map((block) => {
    const candidate = allCandidates.find((c) => c.name === block.name);
    return { ...block, photos: candidate?.photos };
  });

  const coverPhoto = blocksWithPhotos.find(
    (b) => b.type === "attraction" && b.photos?.length,
  )?.photos?.[0];

  const dayWithPhotos = {
    ...day,
    day_index: input.dayIndex,
    date: input.date,
    blocks: blocksWithPhotos,
    photos_cover: coverPhoto,
  };

  const directionProviders = (
    input.providers?.length ? input.providers : ["GOOGLE_MAPS", "AMAP"]
  ) as ProviderId[];

  const origin = await resolvePointForTransit(input.origin, input.providers);
  const destination = await resolvePointForTransit(
    input.destination,
    input.providers,
  );

  const resolveDuration =
    input._testResolveDuration ??
    (async (mode: TravelMode, from: PlaceLocation, to: PlaceLocation) => {
      for (const id of directionProviders) {
        const adapter = getAdapter(id);
        if (!adapter?.directions) continue;
        try {
          const eta = await adapter.directions({ from, to, mode });
          if (eta) return eta;
        } catch {
          /* try next */
        }
      }
      return null;
    });

  const enriched = await enrichArrangeDayWithTransit({
    day: dayWithPhotos,
    candidates: allCandidates,
    origin,
    destination,
    transit_preferred: input.preferences?.transit_preferred,
    resolveDuration,
  });

  for (const block of enriched.blocks) {
    opts?.onEvent?.({ type: "place", dayIndex: input.dayIndex, block });
  }
  opts?.onEvent?.({ type: "day_done", dayIndex: input.dayIndex });

  const coverage = applyMustIncludeDayEvidence({
    key: prepared.coverageKey,
    must_include: prefs?.must_include,
    blocks: enriched.blocks.map((b) => ({
      name: b.name,
      type: b.type,
    })),
    focusToken: prepared.focusToken,
    focusPool: prepared.focusPool,
    focusAnchor: prepared.focusAnchor,
    candidates: allCandidates,
  });

  // ADR-043 D9 精简: final safety net — focus token still missing after LLM
  // retry + evidence. parseAndValidate already retried once; reaching here
  // means the LLM claimed coverage but evidence disagrees. Hard fail.
  if (
    prepared.focusToken &&
    coverage.missing.some(
      (t) => normalizeMustIncludeToken(t) === normalizeMustIncludeToken(prepared.focusToken!),
    )
  ) {
    throw new Error(
      `arrange_day failed: must_include "${prepared.focusToken}" not covered after retry. ` +
        `focusPool had ${prepared.focusPool.length} card(s). Retry the SAME dayIndex, or widen must_include. ` +
        ARRANGE_DAY_FAILURE_HOST_INSTRUCTIONS,
    );
  }

  return {
    ...enriched,
    must_include_coverage: coverage,
    must_include_focus: prepared.focusToken,
  };
}

/** HTTP/MCP: enrich LLM day blocks with real/heuristic transit legs (Feature 37). */
export async function enrichArrangeTransit(input: {
  day: LlmItineraryOutput["days"][number] & { photos_cover?: string };
  candidates: { places: PlaceCard[]; restaurants: PlaceCard[] };
  origin?: { name?: string; lat?: number; lng?: number };
  destination?: { name?: string; lat?: number; lng?: number };
  providers?: string[];
  preferences?: ArrangeSchedulePreferences;
  _testResolveDuration?: (
    mode: TravelMode,
    from: PlaceLocation,
    to: PlaceLocation,
  ) => Promise<{ duration_min: number; distance_m?: number } | null>;
}): Promise<import("./enrich-arrange-transit").ArrangeDayWithTransit> {
  const allCandidates = [...input.candidates.places, ...input.candidates.restaurants];
  const directionProviders = (
    input.providers?.length ? input.providers : ["GOOGLE_MAPS", "AMAP"]
  ) as ProviderId[];

  const resolveDuration =
    input._testResolveDuration ??
    (async (mode: TravelMode, from: PlaceLocation, to: PlaceLocation) => {
      for (const id of directionProviders) {
        const adapter = getAdapter(id);
        if (!adapter?.directions) continue;
        try {
          const eta = await adapter.directions({ from, to, mode });
          if (eta) return eta;
        } catch {
          /* try next */
        }
      }
      return null;
    });

  return enrichArrangeDayWithTransit({
    day: input.day,
    candidates: allCandidates,
    origin: input.origin,
    destination: input.destination,
    transit_preferred: input.preferences?.transit_preferred,
    resolveDuration,
  });
}

// --- Exports ---

export { paceLimit };
