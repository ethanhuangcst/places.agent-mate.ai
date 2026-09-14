/**
 * ADR-045 §4 / ADR-069 — travel_tips tool.
 *
 * Standalone destination advisory: ≤80-char intro + up to N iconic places +
 * local transit + aggregated weather + clothing + safety.
 *
 * ADR-069: iconic_places come from skeleton attraction stops (day order) —
 * no findIconicPlaces / must_see heat marking. LLM calls ≤ 1 (tips-prose).
 *
 * Performance budget (ADR-045 §4.2): a hard 20s outer timeout wraps the whole
 * tool. Weather branch has its own timeout and degrades on failure. Only the
 * tips-prose LLM and the outer 20s cap can throw.
 */

import { z } from "zod";
import {
  createOpenAI,
  isLlmAbortError,
  withAbortTimeout,
  callItineraryLlmWithValidationRetry,
  type ItineraryChatCreate,
} from "./itinerary-planner";
import { getWeatherAdapter } from "../adapters/open-meteo/fixture";
import { aggregatePlanningImpact } from "./travel-weather";
import { cachedWeatherFetch, type WeatherCacheKey, type WeatherForecastValue } from "./weather-cache";
import { geocode } from "./tools";
import { assembleSystemPrompt } from "../agent/prompt-assembler";
import { loadGlossary } from "../agent/loop";
import { t } from "./i18n";
import { parseLocale, type Locale } from "./locales";
import type { ItinerarySkeleton } from "./make-itinerary";
import type { WeatherSeverity, WeatherDriver } from "./itinerary-weather";

const OUTER_TIMEOUT_MS = 20_000;
const GEOCODE_TIMEOUT_MS = 3_000;
const TIPS_PROSE_TIMEOUT_MS = 10_000;
const INTRO_MAX_CHARS = 80;
const MAX_TRIP_DAYS = 14;
const MAX_ICONIC_PLACES = 3;

export class TravelTipsTimeoutError extends Error {
  constructor(message = "travel_tips_timeout") {
    super(message);
    this.name = "TravelTipsTimeoutError";
  }
}

export type TravelTipsInput = {
  destination: string;
  /** Inclusive trip date bounds (YYYY-MM-DD); drives multi-day weather aggregation. */
  bounds?: { start: string; end: string };
  trip_type?: string;
  pace?: "tight" | "medium" | "relaxed";
  /** Skeleton from make_itinerary; attraction stops become iconic_places (ADR-069). */
  skeleton?: ItinerarySkeleton;
  /** Free-text planning constraints (party size, interests, etc.). */
  constraints?: string;
  /** Explicit iconic-name fallback when skeleton has no attractions. */
  pool?: string[];
  locale: Locale;
  providers?: string[];
  /** Test injection for tips-prose LLM. */
  _testChatCreate?: ItineraryChatCreate;
  /** Test injection to bypass geocode. */
  _testGeo?: { lat: number; lng: number };
};

export type TravelTipsWeather = {
  severity: WeatherSeverity;
  drivers: WeatherDriver[];
  temp_min?: number;
  temp_max?: number;
  summary_key: string;
  summary?: string;
};

export type TravelTipsResult = {
  intro: string;
  iconic_places: string[];
  iconic_grounded: boolean;
  transit: string;
  weather: TravelTipsWeather | null;
  weather_unavailable: boolean;
  clothing: string;
  safety: string;
};

// --- Zod output schema for tips-prose ---

const TipsProseSchema = z.object({
  intro: z.string(),
  transit: z.string(),
  clothing: z.string(),
  safety: z.string(),
});

type TipsProse = z.infer<typeof TipsProseSchema>;

// --- Weather fetch cache (module-level, 30 min TTL) ---

const cachedForecast = cachedWeatherFetch(async (key: WeatherCacheKey): Promise<WeatherForecastValue | null> => {
  const adapter = getWeatherAdapter();
  const f = await adapter.fetchForecast({ lat: key.lat, lng: key.lng, date: key.date });
  if (!f) return null;
  return {
    weather_code: f.weather_code,
    temp_max_c: f.temp_max_c,
    temp_min_c: f.temp_min_c,
    provider: f.provider,
  };
});

// --- Helpers ---

function buildCreate(input: TravelTipsInput): ItineraryChatCreate | null {
  if (input._testChatCreate) return input._testChatCreate;
  const openai = createOpenAI();
  if (!openai) return null;
  return openai.chat.completions.create.bind(openai.chat.completions) as unknown as ItineraryChatCreate;
}

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Inclusive YYYY-MM-DD list from bounds, capped at MAX_TRIP_DAYS. */
function enumerateDates(bounds: { start: string; end: string }): string[] {
  const start = new Date(`${bounds.start}T00:00:00Z`);
  const end = new Date(`${bounds.end}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return [bounds.start];
  }
  const out: string[] = [];
  const cursor = new Date(start);
  while (cursor <= end && out.length < MAX_TRIP_DAYS) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

/** Extract attraction stop names from a skeleton (day order, pure data, no LLM). */
export function poolFromSkeleton(skeleton: ItinerarySkeleton | undefined): string[] {
  if (!skeleton) return [];
  const names: string[] = [];
  for (const day of skeleton.days) {
    for (const stop of day.stops) {
      if (stop.kind === "attraction" && stop.name) names.push(stop.name);
    }
  }
  return names;
}

/**
 * ADR-069: iconic_places = top attraction names from skeleton (or explicit pool).
 * Always grounded when names come from skeleton/pool — no separate LLM inference.
 */
export function iconicPlacesFromStops(
  names: string[],
  limit: number = MAX_ICONIC_PLACES,
): { names: string[]; grounded: boolean } {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of names) {
    const n = raw.trim();
    if (!n || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
    if (out.length >= limit) break;
  }
  return { names: out, grounded: true };
}

function localeLanguage(locale: Locale): string {
  switch (locale) {
    case "CN":
      return "Simplified Chinese (简体中文)";
    case "HK":
      return "Traditional Chinese (香港繁體)";
    case "TW":
      return "Traditional Chinese (台灣繁體)";
    default:
      return "English";
  }
}

function weatherContext(weather: TravelTipsWeather | null): string {
  if (!weather) return "Weather: unavailable.";
  const drivers = weather.drivers.length > 0 ? weather.drivers.join(", ") : "clear";
  const lo = weather.temp_min != null ? `${weather.temp_min}°C` : "?";
  const hi = weather.temp_max != null ? `${weather.temp_max}°C` : "?";
  return `Aggregated weather — severity: ${weather.severity}; drivers: ${drivers}; temp range: low ${lo} / high ${hi}.`;
}

// --- Branches ---

async function weatherBranch(input: TravelTipsInput): Promise<TravelTipsWeather | null> {
  try {
    let lat: number | undefined = input._testGeo?.lat;
    let lng: number | undefined = input._testGeo?.lng;
    if (lat == null || lng == null) {
      const geo = await Promise.race([
        geocode({ query: input.destination, locale: input.locale, providers: input.providers }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), GEOCODE_TIMEOUT_MS)),
      ]);
      lat = geo?.data?.lat;
      lng = geo?.data?.lng;
    }
    if (lat == null || lng == null) return null;

    const dates =
      input.bounds && input.bounds.start && input.bounds.end
        ? enumerateDates(input.bounds)
        : [todayDate()];

    const forecasts: WeatherForecastValue[] = [];
    for (const date of dates) {
      const f = await cachedForecast({ lat, lng, date });
      if (f) forecasts.push(f);
    }
    if (forecasts.length === 0) return null;

    const agg = aggregatePlanningImpact(
      forecasts.map((f) => ({
        weather_code: f.weather_code,
        temp_max_c: f.temp_max_c,
        temp_min_c: f.temp_min_c,
        provider: "OPEN_METEO",
      })),
    );
    return {
      severity: agg.severity,
      drivers: agg.drivers,
      temp_min: agg.temp_min,
      temp_max: agg.temp_max,
      summary_key: `itinerary.weather.impact_${agg.severity}`,
      summary: t(input.locale, `itinerary.weather.impact_${agg.severity}`),
    };
  } catch (err) {
    console.error("travelTips: weather branch failed, degrading to null", err);
    return null;
  }
}

function iconicFromInput(input: TravelTipsInput): { names: string[]; grounded: boolean } {
  const fromSkeleton = poolFromSkeleton(input.skeleton);
  const names = fromSkeleton.length > 0 ? fromSkeleton : (input.pool ?? []);
  return iconicPlacesFromStops(names, MAX_ICONIC_PLACES);
}

async function tipsProseLlm(
  input: TravelTipsInput,
  create: ItineraryChatCreate,
  weather: TravelTipsWeather | null,
  iconic: { names: string[]; grounded: boolean },
): Promise<TipsProse> {
  const locale = parseLocale(input.locale);
  const systemPrompt = assembleSystemPrompt({
    locale,
    intent: "travel-tips",
    glossary: loadGlossary(locale) ?? undefined,
  });

  const ctxParts: string[] = [
    `Destination: ${input.destination}`,
    `Iconic places (use ONLY these in iconic_places; if empty, omit specific names): ${JSON.stringify(iconic.names)}`,
    weatherContext(weather),
  ];
  if (input.trip_type) ctxParts.push(`Trip type: ${input.trip_type}`);
  if (input.pace) ctxParts.push(`Pace: ${input.pace}`);
  if (input.constraints) ctxParts.push(`Constraints: ${input.constraints}`);
  ctxParts.push(`Write every field in ${localeLanguage(locale)}.`);

  const userMessage =
    `Return ONLY a JSON object with fields: ` +
    `"intro" (destination overview, ≤ ${INTRO_MAX_CHARS} characters), ` +
    `"transit" (local transit advice, 1–2 sentences), ` +
    `"clothing" (what to wear/pack for the weather above, 1–2 sentences), ` +
    `"safety" (safety reminder, 1–2 sentences). ` +
    `Do not invent itineraries or restaurant names.\n${ctxParts.join("\n")}`;

  try {
    return await callItineraryLlmWithValidationRetry<TipsProse>({
      create,
      systemPrompt,
      userMessage,
      timeoutMs: TIPS_PROSE_TIMEOUT_MS,
      temperature: 0.4,
      maxCompletionTokens: 900,
      failLabel: "travel_tips_failed",
      parseAndValidate: (raw) => {
        const json = JSON.parse(raw);
        const parsed = TipsProseSchema.safeParse(json);
        if (parsed.success) return { ok: true, value: { ...parsed.data, intro: parsed.data.intro.slice(0, INTRO_MAX_CHARS) } };
        return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "), retryable: true };
      },
    });
  } catch (err) {
    if (err instanceof TravelTipsTimeoutError) throw err;
    if (isLlmAbortError(err) || isLlmAbortError((err as Error)?.cause)) {
      throw new TravelTipsTimeoutError();
    }
    // Validation failure after retry → surface as a failed (non-timeout) error.
    throw err;
  }
}

// --- Main entry ---

export async function travelTips(input: TravelTipsInput): Promise<TravelTipsResult> {
  const iconic = iconicFromInput(input);

  const create = buildCreate(input);
  const fixtureMode = !input._testChatCreate && createOpenAI() === null;

  let weather: TravelTipsWeather | null = null;

  const partial = (): TravelTipsResult => ({
    intro: "",
    iconic_places: iconic.names,
    iconic_grounded: iconic.grounded,
    transit: "",
    weather,
    weather_unavailable: weather === null,
    clothing: "",
    safety: "",
  });

  const mapThrow = (err: unknown): never => {
    if (err instanceof TravelTipsTimeoutError) throw err;
    if (isLlmAbortError(err) || isLlmAbortError((err as Error)?.cause)) {
      throw new TravelTipsTimeoutError();
    }
    throw err;
  };

  try {
    return await withAbortTimeout(OUTER_TIMEOUT_MS, async () => {
      weather = await weatherBranch(input);

      if (fixtureMode || !create) {
        return {
          intro: "",
          iconic_places: iconic.names,
          iconic_grounded: iconic.grounded,
          transit: "",
          weather,
          weather_unavailable: weather === null,
          clothing: "",
          safety: "",
        };
      }

      try {
        const prose = await tipsProseLlm(input, create, weather, iconic);
        return {
          intro: prose.intro,
          iconic_places: iconic.names,
          iconic_grounded: iconic.grounded,
          transit: prose.transit,
          weather,
          weather_unavailable: weather === null,
          clothing: prose.clothing,
          safety: prose.safety,
        };
      } catch (err) {
        if (iconic.names.length > 0) return {
          intro: "",
          iconic_places: iconic.names,
          iconic_grounded: iconic.grounded,
          transit: "",
          weather,
          weather_unavailable: weather === null,
          clothing: "",
          safety: "",
        };
        return mapThrow(err);
      }
    });
  } catch (err) {
    if (iconic.names.length > 0) return partial();
    return mapThrow(err);
  }
}
