/**
 * ADR-042 Update / ADR-043 D9 精简 — destination-agnostic must-see inference.
 *
 * Replaces the deleted Xi'an `HARD_MUST_SEE_CLUSTERS` hardcode. After discover
 * builds the candidate pool, the LLM picks up to 3 widely-recognized must-see
 * attractions FROM THE POOL. The prompt contains no city names — knowledge
 * lives in the LLM weights, not in source. Returned names are validated
 * against the pool (no hallucinations) and seeded as `must_include`.
 */

import OpenAI from "openai";
import {
  createOpenAI,
  extractChatCompletionText,
  isLlmAbortError,
  withAbortTimeout,
  type ItineraryChatCreate,
} from "./itinerary-planner";
import { normalizeMustIncludeToken } from "./trip-intake";
import type { PlaceCard } from "./types";

const INFER_TIMEOUT_MS = 45_000;
const MAX_MUST_SEE = 3;

export type InferMustSeeInput = {
  /** Candidate attraction cards from discover (any city). */
  places: PlaceCard[];
  /** Optional test injection for the LLM client. */
  _testChatCreate?: ItineraryChatCreate;
};

/**
 * Ask the LLM to pick up to 3 must-see attractions from the pool.
 * Returns pool-validated place names (normalized match). Never throws —
 * returns [] on any failure so discover is not blocked.
 */
export async function inferMustSeeFromPool(
  input: InferMustSeeInput,
): Promise<string[]> {
  const names = input.places
    .map((p) => p.name?.trim())
    .filter((n): n is string => Boolean(n));
  if (names.length === 0) return [];

  const poolNormalized = new Map<string, string>();
  for (const n of names) {
    poolNormalized.set(normalizeMustIncludeToken(n), n);
  }

  const userMessage =
    `You are a travel expert. From these candidate attractions, identify up to ${MAX_MUST_SEE} ` +
    `that are widely considered must-see / iconic for this destination. ` +
    `Return ONLY a JSON array of place names, drawn exactly from the provided list (copy names verbatim). ` +
    `Names: ${JSON.stringify(names)}`;

  const create =
    input._testChatCreate ??
    (() => {
      const openai = createOpenAI();
      if (!openai) return null as unknown as ItineraryChatCreate;
      return openai.chat.completions.create.bind(openai.chat.completions) as ItineraryChatCreate;
    })();

  // No LLM configured (fixture mode) — skip inference, return empty.
  if (!input._testChatCreate && createOpenAI() === null) return [];

  let raw: string | null = null;
  try {
    const completion = await withAbortTimeout(INFER_TIMEOUT_MS, (signal) =>
      create(
        {
          model: process.env.OPENAI_CHAT_MODEL ?? "gpt-4o",
          messages: [
            {
              role: "user",
              content: userMessage,
            },
          ],
          max_completion_tokens: 256,
          temperature: 0.2,
        },
        { signal },
      ),
    );
    raw = extractChatCompletionText(completion);
  } catch (err) {
    if (isLlmAbortError(err)) {
      console.error("inferMustSeeFromPool: LLM timed out, returning []");
    } else {
      console.error("inferMustSeeFromPool: LLM failed, returning []", err);
    }
    return [];
  }

  if (!raw) return [];

  let parsed: unknown;
  try {
    const jsonStr = extractJsonArray(raw);
    parsed = JSON.parse(jsonStr);
  } catch {
    console.error("inferMustSeeFromPool: could not parse LLM JSON, returning []");
    return [];
  }

  if (!Array.isArray(parsed)) return [];

  const validated: string[] = [];
  const seen = new Set<string>();
  for (const item of parsed) {
    if (typeof item !== "string") continue;
    const n = normalizeMustIncludeToken(item);
    if (!n || seen.has(n)) continue;
    const original = poolNormalized.get(n);
    if (!original) continue; // hallucination — not in pool
    seen.add(n);
    validated.push(original);
    if (validated.length >= MAX_MUST_SEE) break;
  }
  return validated;
}

/** Extract a JSON array from LLM text that may contain markdown fencing. */
function extractJsonArray(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return text.trim();
}

// Re-export OpenAI type for callers that build their own client shape.
export type { OpenAI };
