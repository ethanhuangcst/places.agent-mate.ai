/**
 * ADR-045 §1 — unified iconic-places acquisition (dual-mode).
 *
 * Replaces `discover-must-see-llm.ts` `inferMustSeeFromPool` with a single
 * method that works in two modes:
 *
 * - grounded (pool non-empty): LLM picks from the pool, names are
 *   pool-validated (no hallucinations), `grounded: true`. Used by discover /
 *   make_itinerary where a candidate pool exists and names must be schedulable.
 * - ungrounded (pool empty/undefined): LLM produces names from parametric
 *   knowledge for the destination, `grounded: false`. Used by travel_tips,
 *   which may be called before any pool exists. Knowledge lives in the LLM
 *   weights, not in source (ADR-042 compliant).
 *
 * Never throws — returns `{ names: [], grounded }` on any failure so callers
 * (discover, travel_tips) are not blocked.
 */

import {
  createOpenAI,
  extractChatCompletionText,
  isLlmAbortError,
  withAbortTimeout,
  type ItineraryChatCreate,
} from "./itinerary-planner";
import { normalizeMustIncludeToken } from "./trip-intake";
import { cachedIconicPlaces, hashPool, type IconicCacheKey } from "./iconic-places-cache";
import type { Locale } from "./locales";
import type { PlaceCard } from "./types";

const INFER_TIMEOUT_MS = 12_000;
const MAX_COMPLETION_TOKENS = 300;
const LLM_TEMPERATURE = 0.3;

export type FindIconicPlacesInput = {
  city: string;
  locale: Locale;
  /** Candidate attraction cards. When non-empty → grounded mode. */
  pool?: PlaceCard[];
  /** Max iconic names to return. */
  limit: number;
  /** Optional test injection for the LLM client. */
  _testChatCreate?: ItineraryChatCreate;
};

export type FindIconicPlacesResult = {
  names: string[];
  /** true = names were pool-validated (grounded); false = ungrounded LLM output. */
  grounded: boolean;
};

/**
 * Extract a JSON array from LLM text that may contain markdown fencing.
 */
function extractJsonArray(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return text.trim();
}

function buildCreate(input: FindIconicPlacesInput): ItineraryChatCreate | null {
  if (input._testChatCreate) return input._testChatCreate;
  const openai = createOpenAI();
  if (!openai) return null;
  return openai.chat.completions.create.bind(openai.chat.completions) as unknown as ItineraryChatCreate;
}

async function callLlm(
  create: ItineraryChatCreate,
  userMessage: string,
): Promise<string | null> {
  try {
    const completion = await withAbortTimeout(INFER_TIMEOUT_MS, (signal) =>
      create(
        {
          model: process.env.OPENAI_CHAT_MODEL ?? "gpt-4o",
          messages: [{ role: "user", content: userMessage }],
          max_completion_tokens: MAX_COMPLETION_TOKENS,
          temperature: LLM_TEMPERATURE,
        },
        { signal },
      ),
    );
    return extractChatCompletionText(completion);
  } catch (err) {
    if (isLlmAbortError(err)) {
      console.error("findIconicPlaces: LLM timed out, returning []");
    } else {
      console.error("findIconicPlaces: LLM failed, returning []", err);
    }
    return null;
  }
}

function parseNames(raw: string | null): string[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJsonArray(raw));
  } catch {
    console.error("findIconicPlaces: could not parse LLM JSON, returning []");
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((x): x is string => typeof x === "string");
}

/**
 * Unified iconic-places acquisition.
 */
export async function findIconicPlaces(
  input: FindIconicPlacesInput,
): Promise<FindIconicPlacesResult> {
  const limit = Math.max(0, Math.min(input.limit, 12));
  if (limit === 0) return { names: [], grounded: false };

  const pool = input.pool ?? [];
  const poolNames = pool
    .map((p) => p.name?.trim())
    .filter((n): n is string => Boolean(n));
  const grounded = pool.length > 0;

  const resolveUncached = async (): Promise<FindIconicPlacesResult> => {
    // Fixture / no-key mode: cannot infer without an LLM.
    if (!input._testChatCreate && createOpenAI() === null) {
      return { names: [], grounded };
    }

    const create = buildCreate(input);
    if (!create) return { names: [], grounded };

    if (grounded) {
      if (poolNames.length === 0) return { names: [], grounded: true };

      const poolNormalized = new Map<string, string>();
      for (const n of poolNames) poolNormalized.set(normalizeMustIncludeToken(n), n);

      const userMessage =
        `You are a travel expert. From these candidate attractions, identify up to ${limit} ` +
        `that are widely considered must-see / iconic for this destination. ` +
        `Return ONLY a JSON array of place names, drawn exactly from the provided list (copy names verbatim). ` +
        `Names: ${JSON.stringify(poolNames)}`;

      const raw = await callLlm(create, userMessage);
      const parsed = parseNames(raw);

      const validated: string[] = [];
      const seen = new Set<string>();
      for (const item of parsed) {
        const n = normalizeMustIncludeToken(item);
        if (!n || seen.has(n)) continue;
        const original = poolNormalized.get(n);
        if (!original) continue; // hallucination — not in pool
        seen.add(n);
        validated.push(original);
        if (validated.length >= limit) break;
      }
      return { names: validated, grounded: true };
    }

    // Ungrounded: LLM produces names from parametric knowledge for the city.
    const userMessage =
      `You are a travel expert. For the destination "${input.city}", list up to ${limit} ` +
      `places that are widely considered must-see / iconic. ` +
      `Return ONLY a JSON array of place names (real, well-known attractions for this destination). ` +
      `Do not invent places that do not exist. If you are unsure, return fewer.`;

    const raw = await callLlm(create, userMessage);
    const parsed = parseNames(raw);

    const out: string[] = [];
    const seen = new Set<string>();
    for (const item of parsed) {
      const trimmed = item.trim();
      if (!trimmed) continue;
      const n = normalizeMustIncludeToken(trimmed);
      if (!n || seen.has(n)) continue;
      seen.add(n);
      out.push(trimmed);
      if (out.length >= limit) break;
    }
    return { names: out, grounded: false };
  };

  // Bypass cache for test injection so tests stay deterministic and fresh.
  if (input._testChatCreate) return resolveUncached();

  const key: IconicCacheKey = {
    destination: input.city,
    poolHash: hashPool(poolNames),
    limit,
  };
  const cached = cachedIconicPlaces(async () => resolveUncached());
  return cached(key);
}
