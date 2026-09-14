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

/**
 * ADR-048 — keep hotel name, drop coords farther than DISCOVER_GEO_MAX_KM from the city.
 * Discover and make both filter/search `near` against the city, not a far hotel.
 */
export function dropFarOriginCoords<T extends { name?: string; lat?: number; lng?: number }>(
  origin: T | undefined,
  cityAnchor: { lat: number; lng: number } | null,
  maxKm = DISCOVER_GEO_MAX_KM,
): T | undefined {
  if (!origin || cityAnchor == null) return origin;
  if (origin.lat == null || origin.lng == null) return origin;
  if (haversineKm(cityAnchor, { lat: origin.lat, lng: origin.lng }) <= maxKm) return origin;
  return { ...origin, lat: undefined, lng: undefined };
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
  name: string | undefined,
  pool: PlaceCard[],
): { lat: number; lng: number } | null {
  if (!name) return null;
  const card = pool.find((p) => p.name === name);
  const loc = card?.location;
  if (loc?.lat == null || loc?.lng == null) return null;
  return { lat: loc.lat, lng: loc.lng };
}

export type ThemeDay = {
  day_index?: number;
  date?: string;
  day_theme: string;
  stops: Array<{ name?: string; kind?: string }>;
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
    const haystacks = [day.day_theme, ...day.stops.map((s) => s.name ?? "")];
    const focus = mustInclude.filter((t) => skeletonCoversMustInclude(t, haystacks));
    if (!focus.length) return day;
    const anchorStop = day.stops.find(
      (s) =>
        s.kind !== "stay" &&
        focus.some((t) => skeletonCoversMustInclude(t, [s.name ?? ""])) &&
        locOf(s.name, pool),
    );
    if (!anchorStop) return day;
    const anchor = locOf(anchorStop.name, pool);
    if (!anchor) return day;
    return {
      ...day,
      stops: day.stops.filter((s) => {
        if (s.kind === "stay") return true;
        // F92: meal slots have no pool coords — never drop lunch/dinner.
        if (s.kind === "meal") return true;
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

type LocatedStop = {
  stop: ThemeDay["stops"][number];
  loc: { lat: number; lng: number };
};

function clusterLocatedStops(
  items: LocatedStop[],
  clusterKm: number,
): LocatedStop[][] {
  const n = items.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => {
    let x = i;
    while (parent[x] !== x) x = parent[x]!;
    let y = i;
    while (parent[y] !== y) {
      const next = parent[y]!;
      parent[y] = x;
      y = next;
    }
    return x;
  };
  const unite = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (haversineKm(items[i]!.loc, items[j]!.loc) <= clusterKm) {
        unite(i, j);
      }
    }
  }
  const groups = new Map<number, LocatedStop[]>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    const g = groups.get(r) ?? [];
    g.push(items[i]!);
    groups.set(r, g);
  }
  return [...groups.values()];
}

/** Transparent non-conformance recorded on the skeleton (agent-discover-110c). */
export type SkeletonDeviation = {
  field: string;
  expected: string;
  actual: string;
  reason: string;
};

export type EnsureFarClustersResult<T extends { days: ThemeDay[] }> = {
  skeleton: T;
  deviations: SkeletonDeviation[];
};

/**
 * Detect when a day mixes geographically far attraction clusters (coords from pool).
 * 110c validate-don't-repair: never peel clusters onto new days (no silent day-add);
 * record deviations instead. maxDays retained for call-site compat only.
 * Never invents POIs that were not already scheduled (agent-itinerary-104).
 */
export function ensureFarClustersOwnDays<T extends { days: ThemeDay[] }>(
  skeleton: T,
  pool: PlaceCard[],
  clusterKm = DAY_THEME_CLUSTER_KM,
  /** @deprecated 110c: never mutates day count; kept for call-site compat. */
  maxDays?: number,
): EnsureFarClustersResult<T> {
  void maxDays;
  const deviations: SkeletonDeviation[] = [];

  for (const day of skeleton.days) {
    const attractionStops = day.stops.filter((s) => s.kind === "attraction");
    const located: LocatedStop[] = [];
    for (const stop of attractionStops) {
      const loc = locOf(stop.name, pool);
      if (loc) located.push({ stop, loc });
    }
    if (located.length < 2) continue;

    const clusters = clusterLocatedStops(located, clusterKm);
    if (clusters.length <= 1) continue;

    clusters.sort((a, b) => b.length - a.length);
    const [, ...far] = clusters;
    const farNames = far
      .flatMap((c) => c.map((x) => x.stop.name).filter(Boolean))
      .join(", ");
    const dayLabel = day.day_index ?? "?";
    deviations.push({
      field: "far_cluster",
      expected: "far attraction clusters on their own days within numDays",
      actual: `day ${dayLabel} co-schedules far cluster(s): ${farNames || "(unnamed)"}`,
      reason:
        "geographically far attraction clusters share a day; validate-don't-repair left the LLM day layout unchanged (no silent day-add)",
    });
  }

  return { skeleton, deviations };
}
