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

// --- Exports for the main itinerary module ---

export { paceLimit };
