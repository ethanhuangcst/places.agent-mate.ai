/**
 * F91 — attraction dwell minutes (cluster / isolated / museum / rating bump).
 * Destination-agnostic; no city encyclopedia (ADR-042).
 */

import { type PlaceCard } from "./types";
import { haversineKm } from "./must-include-coverage";

export type ClusterRole = "in" | "end" | "isolated";

const MUSEUM_GARDEN_RE =
  /museum|gallery|园林|公园|garden|palace|palace museum|博物|美术|park/i;

export function isMuseumOrGardenCategory(category?: string): boolean {
  if (!category?.trim()) return false;
  return MUSEUM_GARDEN_RE.test(category);
}

export function attractionDwellMinutes(
  card: PlaceCard | null | undefined,
  clusterRole: ClusterRole = "isolated",
): number {
  if (clusterRole === "in") return 20;
  if (clusterRole === "end") return 35;

  if (isMuseumOrGardenCategory(card?.category)) return 60;

  const rating = card?.rating;
  const ratingsTotal = card?.user_ratings_total;
  if (
    typeof rating === "number" &&
    rating >= 4.6 &&
    typeof ratingsTotal === "number" &&
    ratingsTotal >= 200
  ) {
    return 60;
  }

  return 45;
}

/** Floors when squeezing all attraction dwells to fit a meal window. */
export function dwellFloorMinutes(
  card: PlaceCard | null | undefined,
  clusterRole: ClusterRole = "isolated",
): number {
  if (clusterRole === "in") return 15;
  if (isMuseumOrGardenCategory(card?.category)) return 45;
  return 30;
}

/**
 * Proportionally shrink attraction dwells so meal can start by latestStart.
 * Returns new dwells (same length); never below floors.
 */
export function squeezeAttractionDwells(opts: {
  dwells: number[];
  cards?: Array<PlaceCard | null | undefined>;
  roles?: ClusterRole[];
  overtimeMin: number;
}): number[] {
  if (opts.overtimeMin <= 0 || !opts.dwells.length) return [...opts.dwells];
  const floors = opts.dwells.map((_, i) =>
    dwellFloorMinutes(opts.cards?.[i], opts.roles?.[i] ?? "isolated"),
  );
  const shrinkable = opts.dwells.map((d, i) => Math.max(0, d - floors[i]!));
  const totalShrinkable = shrinkable.reduce((a, b) => a + b, 0);
  if (totalShrinkable <= 0) return opts.dwells.map((d, i) => Math.max(d, floors[i]!));

  const take = Math.min(opts.overtimeMin, totalShrinkable);
  let remaining = take;
  const next = [...opts.dwells];
  for (let i = 0; i < next.length; i++) {
    if (remaining <= 0) break;
    const share =
      totalShrinkable > 0 ? Math.floor((shrinkable[i]! / totalShrinkable) * take) : 0;
    const cut = Math.min(shrinkable[i]!, share, remaining);
    next[i] = Math.max(floors[i]!, next[i]! - cut);
    remaining -= cut;
  }
  // Distribute leftover cuts greedily.
  for (let i = 0; i < next.length && remaining > 0; i++) {
    const room = next[i]! - floors[i]!;
    if (room <= 0) continue;
    const cut = Math.min(room, remaining);
    next[i]! -= cut;
    remaining -= cut;
  }
  return next;
}

/** Continuous attractions within walk≤15min equiv (≤800m straight) form a cluster. */
export function clusterRoleForIndex(
  stops: Array<{ kind?: string; location?: { lat: number; lng: number } | null }>,
  index: number,
): ClusterRole {
  const stop = stops[index];
  if (!stop || stop.kind !== "attraction") return "isolated";

  const inClusterWith = (a: number, b: number): boolean => {
    const la = stops[a]?.location;
    const lb = stops[b]?.location;
    if (!la || !lb) return false;
    return (
      haversineKm(
        { lat: la.lat, lng: la.lng },
        { lat: lb.lat, lng: lb.lng },
      ) <= 0.8
    );
  };

  const prevAttr = (() => {
    for (let i = index - 1; i >= 0; i--) {
      if (stops[i]?.kind === "attraction") return i;
    }
    return -1;
  })();
  const nextAttr = (() => {
    for (let i = index + 1; i < stops.length; i++) {
      if (stops[i]?.kind === "attraction") return i;
    }
    return -1;
  })();

  const linkedPrev = prevAttr >= 0 && inClusterWith(prevAttr, index);
  const linkedNext = nextAttr >= 0 && inClusterWith(index, nextAttr);

  if (linkedNext) return "in";
  if (linkedPrev) return "end";
  return "isolated";
}

const WALK_CLUSTER_MAX_MIN = 15;

/**
 * Cluster role for the stop being filled: distance ≤800m plus optional walk gate.
 * If walk minutes to previous attraction exceed 15, do not link with previous.
 */
export function resolveAttractionClusterRole(opts: {
  dayStops: Array<{
    name?: string;
    kind?: string;
    lat?: number;
    lng?: number;
    location?: { lat?: number; lng?: number } | null;
  }>;
  stopName: string;
  candidates?: Array<{
    name: string;
    location?: { lat?: number; lng?: number } | null;
  }>;
  /** Recommended walk duration from previous stop (minutes), if known. */
  walkMinFromPrev?: number | null;
}): ClusterRole {
  const cardLoc = (name: string | undefined) => {
    if (!name) return null;
    const card = opts.candidates?.find((c) => c.name === name);
    const lat = card?.location?.lat;
    const lng = card?.location?.lng;
    if (typeof lat === "number" && typeof lng === "number") return { lat, lng };
    return null;
  };

  const enriched = opts.dayStops.map((s) => {
    const fromStop =
      typeof s.lat === "number" && typeof s.lng === "number"
        ? { lat: s.lat, lng: s.lng }
        : s.location && typeof s.location.lat === "number" && typeof s.location.lng === "number"
          ? { lat: s.location.lat, lng: s.location.lng }
          : null;
    return {
      kind: s.kind,
      location: fromStop ?? cardLoc(s.name),
    };
  });

  const index = opts.dayStops.findIndex((s) => s.name === opts.stopName);
  if (index < 0) return "isolated";

  let role = clusterRoleForIndex(enriched, index);
  if (
    typeof opts.walkMinFromPrev === "number" &&
    opts.walkMinFromPrev > WALK_CLUSTER_MAX_MIN
  ) {
    // Walk too long to previous: drop prev location so only next-link can keep "in".
    role = clusterRoleForIndex(
      enriched.map((s, i) =>
        i < index && s.kind === "attraction" ? { kind: s.kind, location: null } : s,
      ),
      index,
    );
  }
  return role;
}
