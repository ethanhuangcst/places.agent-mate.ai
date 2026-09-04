/**
 * F84 / ADR-049 — destination-agnostic eligible attraction predicate.
 * Shared by discover ingest, iconic heat, make pool, and trip candidate replace.
 */

import { filterDiningPlaces } from "./place-filters";
import { type PlaceCard } from "./types";

/** Collection / scenic-area labels — templates only, not per-city POI lists (ADR-042). */
const COLLECTION_NAME =
  /十景|八景|二十四景|名胜区|名勝區|风景名胜区|風景名勝區|风景区|風景區|旅游区|旅遊區|游览区|遊覽區/u;

export function isCollectionPlaceName(name: string): boolean {
  const t = name.trim();
  if (!t) return true;
  return COLLECTION_NAME.test(t);
}

export function isIneligibleMustIncludeToken(token: string): boolean {
  return isCollectionPlaceName(token);
}

function hasPlottableLocation(card: PlaceCard): boolean {
  const lat = card.location?.lat;
  const lng = card.location?.lng;
  return Number.isFinite(lat) && Number.isFinite(lng);
}

function hasNativeIdIfSourced(card: PlaceCard): boolean {
  const sources = card.sources ?? [];
  if (sources.length === 0) return true;
  return sources.some((s) => typeof s.native_id === "string" && s.native_id.trim().length > 0);
}

export function isEligibleAttraction(card: PlaceCard): boolean {
  if (!card.name?.trim()) return false;
  if (isCollectionPlaceName(card.name)) return false;
  if (!hasPlottableLocation(card)) return false;
  if (!hasNativeIdIfSourced(card)) return false;
  if (filterDiningPlaces([card]).length > 0) return false;
  return true;
}

export function filterEligibleAttractions(places: PlaceCard[]): PlaceCard[] {
  return places.filter(isEligibleAttraction);
}

export function degradeMustInclude(
  tokens: string[] | undefined,
  eligiblePlaces: PlaceCard[],
  covers: (token: string, haystacks: string[]) => boolean,
): string[] {
  const names = eligiblePlaces.map((p) => p.name);
  return (tokens ?? []).filter((raw) => {
    const t = raw.trim();
    if (!t) return false;
    if (isIneligibleMustIncludeToken(t)) return false;
    return covers(t, names);
  });
}
