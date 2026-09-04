/**
 * Destination-agnostic geo bounds (ADR-042).
 * No city POI lists — only distance from an anchor.
 */

import { haversineKm } from "./must-include-coverage";
import { normalizeMustIncludeToken, skeletonCoversMustInclude } from "./trip-intake";
import type { PlaceCard } from "./types";

/** Metro + typical day-trips; drops other-continent leaks (e.g. Yellowstone in a Lisbon pool). */
export const DISCOVER_GEO_MAX_KM = 80;

/** Attractions on a must_include-themed day stay in that day's cluster. */
export const DAY_THEME_CLUSTER_KM = 20;

/**
 * First usable supplementary search hit for a must_include token.
 * Prefer a name that covers the token; otherwise take the top vendor hit
 * (CN token vs EN place name, e.g. 卡斯凯什 → Cascais). Never the city name.
 */
export function pickSupplementaryMustIncludeHit(
  cards: PlaceCard[],
  token: string,
  opts: { city?: string; existingNorm: Set<string> },
): PlaceCard | undefined {
  const cityNorm = opts.city ? normalizeMustIncludeToken(opts.city) : "";
  const usable = cards.filter((c) => {
    if (typeof c.name !== "string" || !c.name.trim()) return false;
    const n = normalizeMustIncludeToken(c.name);
    if (!n || opts.existingNorm.has(n)) return false;
    if (cityNorm && n === cityNorm) return false;
    return true;
  });
  return usable.find((c) => skeletonCoversMustInclude(token, [c.name])) ?? usable[0];
}

export function filterCardsNearAnchor(
  cards: PlaceCard[],
  anchor: { lat: number; lng: number },
  maxKm = DISCOVER_GEO_MAX_KM,
): PlaceCard[] {
  return cards.filter((c) => {
    const loc = c.location;
    if (loc?.lat == null || loc?.lng == null) return true;
    return haversineKm(anchor, loc) <= maxKm;
  });
}

function locOf(
  name: string,
  pool: PlaceCard[],
): { lat: number; lng: number } | null {
  const card = pool.find((p) => p.name === name);
  const loc = card?.location;
  if (loc?.lat == null || loc?.lng == null) return null;
  return { lat: loc.lat, lng: loc.lng };
}

export type ThemeDay = {
  day_theme: string;
  stops: Array<{ name: string; kind: string }>;
};

/**
 * Drop attraction/meal stops that sit far from the day's must_include anchor.
 * Stay stops are kept. City days (no must_include in theme/stops) are unchanged.
 */
export function trimThemedDayOutliers<T extends { days: ThemeDay[] }>(
  skeleton: T,
  pool: PlaceCard[],
  mustInclude: string[],
  origin?: { lat: number; lng: number },
): T {
  if (!mustInclude.length) return skeleton;
  const days = skeleton.days.map((day) => {
    const haystacks = [day.day_theme, ...day.stops.map((s) => s.name)];
    const focus = mustInclude.filter((t) => skeletonCoversMustInclude(t, haystacks));
    if (!focus.length) return day;
    const anchorStop = day.stops.find(
      (s) =>
        s.kind !== "stay" &&
        focus.some((t) => skeletonCoversMustInclude(t, [s.name])) &&
        locOf(s.name, pool),
    );
    if (!anchorStop) return day;
    const anchor = locOf(anchorStop.name, pool);
    if (!anchor) return day;
    return {
      ...day,
      stops: day.stops.filter((s) => {
        if (s.kind === "stay") return true;
        if (s.name === anchorStop.name) return true;
        const loc = locOf(s.name, pool);
        if (!loc) return false;
        if (haversineKm(anchor, loc) > DAY_THEME_CLUSTER_KM) return false;
        if (origin && haversineKm(loc, origin) < haversineKm(loc, anchor)) {
          return false;
        }
        return true;
      }),
    };
  });
  return { ...skeleton, days };
}
