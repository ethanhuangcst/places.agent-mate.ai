import type { PlaceCard } from "./types";
import { filterAttractionPlaces } from "./place-filters";
import { normalizeMustIncludeToken } from "./trip-intake";

/** Heat score for pool ordering — vendor signals only (ADR-042 / F79). */
export function poolHeatScore(card: Pick<PlaceCard, "user_ratings_total" | "rating">): number {
  if (typeof card.user_ratings_total === "number" && card.user_ratings_total > 0) {
    return card.user_ratings_total;
  }
  if (typeof card.rating === "number" && card.rating > 0) {
    return card.rating * 1000;
  }
  return 0;
}

export function comparePoolHeat(a: PlaceCard, b: PlaceCard): number {
  const diff = poolHeatScore(b) - poolHeatScore(a);
  if (diff !== 0) return diff;
  return a.name.localeCompare(b.name);
}

/**
 * F79 Phase B — mark top-K attractions by vendor heat; no LLM.
 * Returns must-see names in heat order for `inferred_must_see`.
 */
export function markMustSeeByPoolHeat(places: PlaceCard[], limit: number): string[] {
  const cap = Math.max(0, Math.min(limit, 12));
  if (cap === 0) return [];

  const ranked = [...filterAttractionPlaces(places)].sort(comparePoolHeat);
  const picked = ranked.slice(0, cap);
  const pickedNorm = new Set(picked.map((p) => normalizeMustIncludeToken(p.name)));

  for (const card of places) {
    if (pickedNorm.has(normalizeMustIncludeToken(card.name))) {
      card.must_see = true;
    }
  }

  return picked.map((p) => p.name);
}
