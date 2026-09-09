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
 * Chip authority: grounded LLM nominations own must_see.
 * Heat only fills remaining slots when nominations are short, and ties among
 * multiple pool matches for the same nominated name.
 */
export function applyNominatedMustSee(
  places: PlaceCard[],
  nominated: PlaceCard[],
  limit: number,
): string[] {
  const cap = Math.max(0, Math.min(limit, 12));
  for (const card of places) {
    if (card.must_see) card.must_see = false;
  }
  if (cap === 0) return [];

  const names: string[] = [];
  const seen = new Set<string>();

  for (const nom of nominated) {
    if (names.length >= cap) break;
    const match = findNominatedPoolMatch(places, nom) ?? nom;
    const key = normalizeMustIncludeToken(match.name);
    if (!key || seen.has(key)) continue;
    match.must_see = true;
    seen.add(key);
    names.push(match.name);
    if (!places.includes(match)) places.push(match);
  }

  if (nominated.length === 0 && names.length < cap) {
    const extra = markMustSeeByPoolHeat(places, cap);
    return extra;
  }

  return names;
}

function findNominatedPoolMatch(places: PlaceCard[], nom: PlaceCard): PlaceCard | undefined {
  const nomKey = normalizeMustIncludeToken(nom.name);
  const nomNid = nom.sources?.[0]?.native_id?.trim();
  const matches = places.filter((p) => {
    if (nomNid && p.sources?.some((s) => s.native_id === nomNid)) return true;
    return normalizeMustIncludeToken(p.name) === nomKey;
  });
  if (matches.length === 0) return undefined;
  if (matches.length === 1) return matches[0];
  return [...matches].sort(comparePoolHeat)[0];
}

/**
 * F79 Phase B — mark top-K attractions by vendor heat; no LLM.
 * Used as fallback when LLM nomination is empty, or to fill remaining chip slots.
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
