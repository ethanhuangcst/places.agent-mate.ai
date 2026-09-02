/**
 * ADR-045 §3 — must-include merge sunk to core.
 *
 * Unifies user `must_include` with LLM-inferred iconic names across MCP and HTTP
 * paths (previously `dedupeMustInclude` lived only in the MCP handler). User
 * takes precedence; tokens are normalized-deduped. When `limit` is provided the
 * result is truncated to that length; omitted → no truncation.
 */

import { normalizeMustIncludeToken } from "./trip-intake";

/**
 * Merge user must_include with LLM-inferred must-see.
 * User takes precedence; normalized dedupe; preserves original casing.
 */
export function dedupeMustInclude(user: string[], inferred: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const s of [...user, ...inferred]) {
    const n = normalizeMustIncludeToken(s);
    if (!n || seen.has(n)) continue;
    seen.add(n);
    out.push(s);
  }
  return out;
}

/**
 * Merge user must_include with iconic names, optionally truncating to `limit`.
 * User takes precedence over iconic. `limit` omitted → no truncation.
 */
export function mergeMustInclude(
  user: string[],
  iconic: string[],
  limit?: number,
): string[] {
  const merged = dedupeMustInclude(user, iconic);
  return typeof limit === "number" && limit >= 0 ? merged.slice(0, limit) : merged;
}
