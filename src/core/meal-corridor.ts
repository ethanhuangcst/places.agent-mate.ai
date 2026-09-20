/**
 * F89 — corridor restaurant search, spend filter, meal windows, insert/move helpers.
 * Zero-LLM; no city dish encyclopedia (ADR-042).
 */

import { type PlaceCard, type PlaceLocation } from "./types";
import { haversineKm } from "./must-include-coverage";

export const MEAL_CORRIDOR_RADIUS_KM = 0.8;
/** F91: when 800m empty, expand corridor radius (not worldwide). */
export const MEAL_CORRIDOR_EXPANDED_KM = 2;
/** S6B: hard cap from attraction centroid — never 80km city cafes for day-trips. */
export const MEAL_CORRIDOR_MAX_KM = 5;

export type MealSlotId = "lunch" | "afternoon_tea" | "dinner";
export type SpendLevel = 1 | 2 | 3;

export type DayStopLike = {
  name?: string;
  kind?: string;
  meal_slot?: MealSlotId | string;
  provider?: string;
  native_id?: string;
  visit_part?: "am" | "pm" | string;
};

export function corridorSearchPoints(
  from: PlaceLocation,
  to?: PlaceLocation | null,
): PlaceLocation[] {
  if (!to) return [{ ...from, crs: from.crs ?? "WGS84" }];
  const mid: PlaceLocation = {
    lat: (from.lat + to.lat) / 2,
    lng: (from.lng + to.lng) / 2,
    crs: "WGS84",
  };
  return [
    { ...from, crs: from.crs ?? "WGS84" },
    mid,
    { ...to, crs: to.crs ?? "WGS84" },
  ];
}

export function mapSpendLevel(
  budget?: "budget" | "premium" | string | null,
  spend_level?: number | null,
): SpendLevel {
  if (spend_level === 1 || spend_level === 2 || spend_level === 3) return spend_level;
  const key = (budget ?? "").trim().toLowerCase();
  if (key === "budget" || key === "economy") return 1;
  if (key === "premium" || key === "luxury") return 3;
  if (key === "mid" || key === "comfort") return 2;
  return 2;
}

function priceRank(priceLevel?: string): number {
  if (!priceLevel) return 2;
  const p = priceLevel.toUpperCase();
  if (p === "FREE" || p === "$") return 1;
  if (p === "$$") return 2;
  if (p === "$$$") return 3;
  if (p === "$$$$") return 4;
  return 2;
}

/** Prefer budget / premium bands; unknown price_level stays eligible; empty prefer → fall back to all. */
export function filterRestaurantsBySpend(cards: PlaceCard[], spend: SpendLevel): PlaceCard[] {
  if (spend === 2) return cards;
  const filtered = cards.filter((c) => {
    if (!c.price_level) return true;
    const r = priceRank(c.price_level);
    if (spend === 1) return r <= 2;
    return r >= 3;
  });
  return filtered.length ? filtered : cards;
}

/** agent-meal-116 — rating floor for gated meal picks. */
export const MEAL_RATING_MIN = 3.5;
/** Google review floor when `user_ratings_total` is present. */
export const GOOGLE_USER_RATINGS_MIN = 20;

const GOOGLE_INSTITUTIONAL_DINING = new Set(["cafeteria", "food_court"]);

export type MealVenuePick = { card: PlaceCard; lowSignal: boolean };

function hasMealCoords(card: PlaceCard): boolean {
  const loc = card.location;
  return typeof loc?.lat === "number" && typeof loc?.lng === "number";
}

/** Google-only: drop Places Table A cafeteria / food_court (category or types[]). */
export function isGoogleInstitutionalDiningType(card: PlaceCard): boolean {
  if (card.provider !== "GOOGLE_MAPS") return false;
  const labels = [
    ...(card.types ?? []),
    ...(card.category ? [card.category] : []),
  ].map((t) => t.trim().toLowerCase());
  return labels.some((t) => GOOGLE_INSTITUTIONAL_DINING.has(t));
}

/** True when card clears rating (and Google review floor when count present). */
export function passesMealQualityGate(card: PlaceCard): boolean {
  if (typeof card.rating !== "number") return false;
  if (card.rating < MEAL_RATING_MIN) return false;
  if (
    card.provider === "GOOGLE_MAPS" &&
    typeof card.user_ratings_total === "number" &&
    card.user_ratings_total < GOOGLE_USER_RATINGS_MIN
  ) {
    return false;
  }
  return true;
}

function usedKeySet(usedNames?: string[]): Set<string> {
  return new Set((usedNames ?? []).map((n) => n.trim().toLowerCase()).filter(Boolean));
}

function cardUsedKeys(card: PlaceCard): string[] {
  const keys: string[] = [];
  for (const s of card.sources ?? []) {
    const id = s.native_id?.trim().toLowerCase();
    if (id) keys.push(id);
  }
  const name = card.name?.trim().toLowerCase();
  if (name) keys.push(name);
  return keys;
}

function isMealUsed(card: PlaceCard, used: Set<string>): boolean {
  return cardUsedKeys(card).some((k) => used.has(k));
}

function sortMealCandidates(cards: PlaceCard[], near?: PlaceLocation | null): PlaceCard[] {
  return [...cards].sort((a, b) => {
    const ra = typeof a.rating === "number" ? a.rating : -1;
    const rb = typeof b.rating === "number" ? b.rating : -1;
    if (rb !== ra) return rb - ra;
    if (near && hasMealCoords(a) && hasMealCoords(b)) {
      const da = haversineKm(near, { lat: a.location.lat, lng: a.location.lng });
      const db = haversineKm(near, { lat: b.location.lat, lng: b.location.lng });
      return da - db;
    }
    return 0;
  });
}

/**
 * agent-meal-116 — rank corridor hits: quality gate, then rating, then nearer.
 * No name denylist. When none pass the gate, still pick best remaining and set lowSignal.
 */
export function pickMealVenue(
  cards: PlaceCard[],
  usedNames?: string[],
  opts?: { near?: PlaceLocation | null },
): MealVenuePick | null {
  const used = usedKeySet(usedNames);
  const near = opts?.near ?? null;
  const eligible = cards.filter((c) => {
    if (!hasMealCoords(c)) return false;
    if (isMealUsed(c, used)) return false;
    if (isGoogleInstitutionalDiningType(c)) return false;
    return true;
  });
  if (!eligible.length) return null;

  const gated = eligible.filter(passesMealQualityGate);
  if (gated.length) {
    return { card: sortMealCandidates(gated, near)[0]!, lowSignal: false };
  }
  return { card: sortMealCandidates(eligible, near)[0]!, lowSignal: true };
}

export function pickUnusedRestaurant(
  cards: PlaceCard[],
  usedNames?: string[],
  near?: PlaceLocation | null,
): PlaceCard | null {
  return pickMealVenue(cards, usedNames, { near })?.card ?? null;
}

/** Prefer unused; if none, reuse among all cards with rank (F91 — never skip). */
export function pickRestaurantAllowReuse(
  cards: PlaceCard[],
  usedNames?: string[],
  near?: PlaceLocation | null,
): PlaceCard | null {
  const unused = pickMealVenue(cards, usedNames, { near });
  if (unused) return unused.card;
  return pickMealVenue(cards, [], { near })?.card ?? null;
}

export function withinCorridorRadius(
  near: PlaceLocation,
  card: PlaceCard,
  radiusKm = MEAL_CORRIDOR_RADIUS_KM,
): boolean {
  const loc = card.location;
  if (typeof loc?.lat !== "number" || typeof loc?.lng !== "number") return false;
  return haversineKm(near, { lat: loc.lat, lng: loc.lng }) <= radiusKm;
}

export type MealWindow = {
  start: number;
  end: number;
  duration: number;
  latestStart: number;
};

/** F91 meal occupation windows (pace-aware dinner). */
export function mealWindowForSlot(
  slot: MealSlotId,
  pace?: "tight" | "medium" | "relaxed" | string | null,
): MealWindow {
  if (slot === "lunch") {
    return {
      start: 11 * 60 + 30,
      end: 14 * 60 + 30,
      duration: 60,
      latestStart: 13 * 60 + 30,
    };
  }
  if (slot === "dinner") {
    if (pace === "relaxed") {
      return {
        start: 17 * 60 + 30,
        end: 20 * 60,
        duration: 90,
        latestStart: 18 * 60 + 30,
      };
    }
    if (pace === "tight") {
      return {
        start: 17 * 60 + 30,
        end: 19 * 60 + 30,
        duration: 60,
        latestStart: 18 * 60 + 30,
      };
    }
    // medium (default)
    return {
      start: 17 * 60 + 30,
      end: 19 * 60 + 30,
      duration: 90,
      latestStart: 18 * 60,
    };
  }
  return {
    start: 15 * 60,
    end: 16 * 60 + 30,
    duration: 60,
    latestStart: 15 * 60 + 30,
  };
}

export type MealTimingAction = "fill" | "move_later" | "move_earlier";

/**
 * Early → fill (snap start to window in display). Past meal end → move earlier.
 * Between start and end (including past latestStart) → fill (may break window).
 * F92: do not move_later on early clock — that shoved lunch past remaining sights.
 */
export function mealTimingAction(
  clockMin: number,
  slot: MealSlotId,
  pace?: "tight" | "medium" | "relaxed" | string | null,
): MealTimingAction {
  const w = mealWindowForSlot(slot, pace);
  if (clockMin < w.start) return "fill";
  if (clockMin > w.end) return "move_earlier";
  return "fill";
}

/** Snap arrival to window start when early; otherwise arrival (break window OK past latest). */
export function mealStartFromArrival(
  arrivalMin: number,
  slot: MealSlotId,
  pace?: "tight" | "medium" | "relaxed" | string | null,
): number {
  const w = mealWindowForSlot(slot, pace);
  if (arrivalMin < w.start) return w.start;
  return arrivalMin;
}

export function dayHasMealSlot(dayStops: DayStopLike[], slot: MealSlotId): boolean {
  return dayStops.some(
    (s) => s.kind === "meal" && (s.meal_slot === slot || s.name === slot),
  );
}

/**
 * Insert lunch/dinner when clock is in window and day lacks that slot.
 * Relaxed also inserts dinner (fill-time; make skeleton may omit dinner).
 */
export function shouldInsertMeal(opts: {
  clockMin: number;
  dayStops: DayStopLike[];
  pace?: string;
}): MealSlotId | null {
  const pace = opts.pace;
  if (!dayHasMealSlot(opts.dayStops, "lunch")) {
    const w = mealWindowForSlot("lunch", pace);
    if (opts.clockMin >= w.start && opts.clockMin <= w.end) return "lunch";
  }
  if (!dayHasMealSlot(opts.dayStops, "dinner")) {
    const w = mealWindowForSlot("dinner", pace);
    if (opts.clockMin >= w.start && opts.clockMin <= w.end) return "dinner";
  }
  return null;
}

/** Insert anonymous meal after `afterIndex` (exclusive); default after first attraction. */
export function insertMealIntoDayStops(
  stops: DayStopLike[],
  slot: MealSlotId,
  afterIndex?: number,
): DayStopLike[] {
  const meal = { name: slot, kind: "meal" as const, meal_slot: slot };
  const next = stops.map((s) => ({ ...s }));
  let idx = afterIndex;
  if (idx == null) {
    const firstAttr = next.findIndex((s) => s.kind === "attraction");
    idx = firstAttr >= 0 ? firstAttr : Math.max(0, next.length - 1);
  }
  next.splice(idx + 1, 0, meal);
  return next;
}

/** Move meal slot later (after next attraction) or earlier (before previous attraction).
 * Returns null when the move would be a no-op (same order) — caller should fill instead.
 */
export function moveMealInDayStops(
  stops: DayStopLike[],
  slot: MealSlotId,
  direction: "later" | "earlier",
): DayStopLike[] | null {
  const next = stops.map((s) => ({ ...s }));
  const mealIdx = next.findIndex(
    (s) => s.kind === "meal" && (s.meal_slot === slot || s.name === slot),
  );
  if (mealIdx < 0) return null;
  const [meal] = next.splice(mealIdx, 1);
  if (!meal) return null;

  if (direction === "later") {
    const after = next.findIndex((s, i) => i >= mealIdx && s.kind === "attraction");
    if (after < 0) {
      // Already after last attraction — cannot move later without a no-op.
      return null;
    }
    next.splice(after + 1, 0, meal);
  } else {
    let before = -1;
    for (let i = Math.min(mealIdx, next.length) - 1; i >= 0; i--) {
      if (next[i]?.kind === "attraction") {
        before = i;
        break;
      }
    }
    if (before < 0) {
      next.unshift(meal);
    } else {
      next.splice(before, 0, meal);
    }
  }

  const beforeKey = stops.map((s) => `${s.kind}:${s.meal_slot ?? s.name}`).join("|");
  const afterKey = next.map((s) => `${s.kind}:${s.meal_slot ?? s.name}`).join("|");
  if (beforeKey === afterKey) return null;
  return next;
}

export function mergeRestaurantCards(batches: PlaceCard[][]): PlaceCard[] {
  const byName = new Map<string, PlaceCard>();
  for (const batch of batches) {
    for (const c of batch) {
      const key = c.name?.trim().toLowerCase();
      if (!key) continue;
      if (!byName.has(key)) byName.set(key, c);
    }
  }
  return [...byName.values()];
}

export function hhmmToMinutes(hhmm?: string): number | null {
  if (!hhmm) return null;
  const m = hhmm.match(/^(\d{2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}
