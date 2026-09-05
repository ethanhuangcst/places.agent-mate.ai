/**
 * F90-1 — day review: swap unused restaurants / detour swap; never drop unfilled attractions for overtime.
 */

import { type DayStopLike } from "./meal-corridor";

export type DayReviewPolicy = {
  /** F90-1: overtime must not cut remaining unfilled attractions. */
  dropUnfilledOnOvertime: false;
  detourSwapThreshold: number;
};

export const F90_1_POLICY: DayReviewPolicy = {
  dropUnfilledOnOvertime: false,
  detourSwapThreshold: 0.4,
};

/** Always false under F90-1 (replaces F90 cut-remaining). */
export function shouldDropUnfilledForOvertime(_overtimeMin?: number): false {
  return false;
}

/**
 * When detour ratio > 40%, swap the next unfilled stop with the one after
 * (only among unfilled attraction indices). No-op if fewer than two remain.
 */
export function swapUnfilledDetourPair<T extends DayStopLike>(
  remaining: T[],
  detourRatio: number,
  threshold = F90_1_POLICY.detourSwapThreshold,
): T[] {
  if (detourRatio <= threshold || remaining.length < 2) return remaining;
  const next = remaining.map((s) => ({ ...s }));
  const a = next[0]!;
  const b = next[1]!;
  next[0] = b;
  next[1] = a;
  return next;
}

/**
 * Prefer an unused restaurant name when the current meal repeats a used name.
 * Returns the replacement name, or the original when no unused alternative exists (reuse OK).
 */
export function resolveRepeatRestaurantName(
  currentName: string,
  usedNames: string[],
  unusedCandidates: string[],
): string {
  const used = new Set(usedNames.map((n) => n.trim().toLowerCase()).filter(Boolean));
  const cur = currentName.trim().toLowerCase();
  if (!cur || !used.has(cur)) return currentName;
  const alt = unusedCandidates.find((n) => {
    const k = n.trim().toLowerCase();
    return k && !used.has(k);
  });
  return alt ?? currentName;
}
