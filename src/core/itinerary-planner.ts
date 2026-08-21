/**
 * LLM-based itinerary planner (MVP-6).
 *
 * Phase 1: Code searches candidates (places + restaurants + weather)
 * Phase 2: LLM plans the itinerary (single call with self-check)
 * Phase 3: Code validates with Zod
 * Phase 4: Code formats the final result
 *
 * Fallback: if LLM fails or Zod rejects twice → legacy code path
 */

import { z } from "zod";
import { type Locale } from "./locales";
import { type PlaceCard, type PlanItineraryInput, type ToolResult } from "./types";
import { type TimedItineraryPlan } from "./itinerary-timed";
import { assembleSystemPrompt } from "../agent/prompt-assembler";

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
): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const day of output.days) {
    // Check pace limit
    if (day.blocks.length > paceLimit) {
      errors.push({
        field: `days[${day.day_index}].blocks`,
        message: `Too many blocks (${day.blocks.length} > pace limit ${paceLimit})`,
      });
    }

    // Check all names come from candidates
    for (const block of day.blocks) {
      if (!candidateNames.has(block.name)) {
        errors.push({
          field: `days[${day.day_index}].blocks[${block.name}]`,
          message: `Place "${block.name}" not found in candidate list`,
        });
      }
    }
  }

  return errors;
}

// --- Pace limit mapping ---

function paceLimit(pace?: string): number {
  if (pace === "tight") return 6;
  if (pace === "relaxed") return 4;
  return 5; // medium
}

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
}): string {
  const parts: string[] = [];

  parts.push(`Plan a ${input.numDays}-day itinerary for ${input.city}.`);

  // Origin/destination
  if (input.origin?.name) {
    parts.push(`\nOrigin: ${input.origin.name} (${input.origin.lat}, ${input.origin.lng})`);
  } else {
    parts.push("\nOrigin: not specified (start from city center, first place at 10:00 or later)");
  }
  if (input.destination?.name && input.destination.name !== input.origin?.name) {
    parts.push(`Destination: ${input.destination.name} (${input.destination.lat}, ${input.destination.lng})`);
  }

  // Constraints
  const constraints: string[] = [];
  if (input.pace) constraints.push(`pace: ${input.pace}`);
  if (input.budget) constraints.push(`budget: ${input.budget}`);
  constraints.push(`max places per day: ${paceLimit(input.pace)}`);
  parts.push(`\nConstraints: ${constraints.join(", ")}`);

  // Candidates
  parts.push(`\n## Attraction candidates (${input.candidates.places.length}):\n`);
  for (const p of input.candidates.places.slice(0, 15)) {
    const hours = p.hours ? ` hours: ${p.hours}` : "";
    parts.push(`- ${p.name} (${p.category}, rating: ${p.rating ?? "N/A"}, lat: ${p.location.lat.toFixed(4)}, lng: ${p.location.lng.toFixed(4)}${hours})`);
  }

  parts.push(`\n## Restaurant candidates (${input.candidates.restaurants.length}):\n`);
  for (const r of input.candidates.restaurants.slice(0, 15)) {
    const price = r.price_level ? ` price: ${r.price_level}` : "";
    parts.push(`- ${r.name} (${r.category}, rating: ${r.rating ?? "N/A"}, lat: ${r.location.lat.toFixed(4)}, lng: ${r.location.lng.toFixed(4)}${price})`);
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
import { searchPlaces, searchRestaurants } from "./tools";
import { parseLocale } from "./locales";
import { loadGlossary } from "../agent/loop";

function useFixtureLlm(): boolean {
  return !process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === "fixture";
}

function createOpenAI(): OpenAI | null {
  if (useFixtureLlm()) return null;
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL ?? "https://quanzil.com/v1",
  });
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

export type LlmPlanInput = {
  city: string;
  numDays: number;
  bounds: { start: string; end: string };
  origin?: { name?: string; lat?: number; lng?: number };
  destination?: { name?: string; lat?: number; lng?: number };
  pace?: string;
  budget?: "budget" | "premium";
  locale: Locale;
  /** Injected for testing — skips real search */
  _testCandidates?: { places: PlaceCard[]; restaurants: PlaceCard[] };
};

/**
 * Full LLM-based itinerary pipeline.
 * Phase 1: search candidates → Phase 2: LLM call → Phase 3: Zod validate → Phase 4: format
 */
export async function llmPlanItinerary(
  input: LlmPlanInput,
): Promise<LlmItineraryOutput> {
  const locale = parseLocale(input.locale);

  // Phase 1: Search candidates
  const candidates = input._testCandidates ?? await searchCandidates(input);

  // Build candidate name set for validation
  const candidateNames = new Set([
    ...candidates.places.map((p) => p.name),
    ...candidates.restaurants.map((r) => r.name),
  ]);

  // Phase 2: LLM call
  const systemPrompt = assembleSystemPrompt({
    locale,
    intent: "itinerary",
    budget: input.budget,
    glossary: loadGlossary(locale) ?? undefined,
  });

  const userMessage = buildUserMessage({
    city: input.city,
    numDays: input.numDays,
    candidates,
    pace: input.pace,
    budget: input.budget,
    origin: input.origin,
    destination: input.destination,
    locale,
  });

  const openai = createOpenAI();
  if (!openai) {
    throw new Error("LLM not configured (fixture mode)");
  }

  // Attempt LLM call with one retry on Zod failure
  let lastError: string | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: attempt === 0
        ? userMessage
        : `${userMessage}\n\nYour previous response had validation errors:\n${lastError}\n\nPlease fix and return valid JSON.`
      },
    ];

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_CHAT_MODEL ?? "gpt-4o",
      messages,
      max_completion_tokens: 4096,
      temperature: 0.7,
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) continue;

    const jsonStr = extractJson(raw);
    const parsed = LlmItinerarySchema.safeParse(JSON.parse(jsonStr));
    if (!parsed.success) {
      lastError = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      continue;
    }

    // Phase 3: Validate hard constraints
    const errors = validateItinerary(parsed.data, candidateNames, paceLimit(input.pace));
    if (errors.length > 0) {
      lastError = errors.map((e) => `${e.field}: ${e.message}`).join("; ");
      continue;
    }

    return parsed.data;
  }

  throw new Error(`LLM itinerary validation failed after 2 attempts: ${lastError}`);
}

async function searchCandidates(input: LlmPlanInput): Promise<{
  places: PlaceCard[];
  restaurants: PlaceCard[];
}> {
  const searchInput = {
    address: input.city,
    query: "attractions landmarks",
    locale: parseLocale(input.locale),
    near: input.origin?.lat != null && input.origin?.lng != null
      ? { lat: input.origin.lat, lng: input.origin.lng }
      : undefined,
  };

  const [placesResult, restaurantsResult] = await Promise.all([
    searchPlaces({ ...searchInput, query: "attractions landmarks museums parks" }),
    searchRestaurants({ ...searchInput, query: "restaurant" }),
  ]);

  return {
    places: placesResult.data ?? [],
    restaurants: restaurantsResult.data ?? [],
  };
}

// --- Exports ---

export { paceLimit };
