/**
 * plan_next_stop + display_current_stop — MVP-10 §12 incremental filler (F44).
 *
 * Zero-LLM per-stop fill: the skeleton (make_itinerary) fixes the order;
 * these tools attach serial real-directions transit (dual-mode) and rich
 * place info, and back-fill times from the previous stop + recommended leg.
 * F42-equivalent validations (station timing tolerance, same-day restaurant
 * dedup hints, lunch-window note) live in the fill layer here.
 */

import { type Locale } from "./locales";
import { type PlaceCard, type PlaceLocation } from "./types";
import { getAdapter } from "../adapters";
import { geocode, getPlaceDetails, searchPlaces, searchRestaurants } from "./tools";
import {
  buildHeuristicLegs,
  buildLegs,
  type ItineraryLeg,
  type TravelMode,
} from "./itinerary-timed";
import { slimArrangeCandidate } from "./itinerary-planner";
import { resolvedDirectionProviders } from "./direction-providers";
import { isDisplayablePhotoUrl, resolveDisplayPhoto } from "./resolve-display-photo";
import { DISCOVER_GEO_MAX_KM } from "./geo-bounds";
import { haversineKm } from "./must-include-coverage";
import {
  corridorSearchPoints,
  filterRestaurantsBySpend,
  hhmmToMinutes,
  insertMealIntoDayStops,
  mapSpendLevel,
  mealTimingAction,
  mergeRestaurantCards,
  mealWindowForSlot,
  moveMealInDayStops,
  MEAL_CORRIDOR_EXPANDED_KM,
  MEAL_CORRIDOR_MAX_KM,
  MEAL_CORRIDOR_RADIUS_KM,
  pickRestaurantAllowReuse,
  pickUnusedRestaurant,
  shouldInsertMeal,
  type DayStopLike,
  type MealSlotId,
  type SpendLevel,
  withinCorridorRadius,
} from "./meal-corridor";
import { attractionDwellMinutes, resolveAttractionClusterRole, type ClusterRole } from "./attraction-dwell";

export type TransitOutcome = "directions" | "heuristic" | "partial";

/** Motor/transit leg drop + clock clamp (F88 / §25.2). Was 180 under F60. */
export const LEG_MAX_DURATION_MIN = 120;
/** Walk legs longer than this are dropped (F88). */
export const WALK_DROP_MAX_MIN = 45;

export type TransitPreferenceParsed = {
  single_mode: boolean;
  mode: TravelMode | null;
  transit_preferred: boolean;
};

/**
 * Natural-language transit preference (§12.5 / F88).
 * 「捷运 + 步行」/ metro+walk → dual-mode with transit preferred (not walk-only).
 */
export function parseTransitPreference(pref?: string): TransitPreferenceParsed {
  const p = (pref ?? "").toLowerCase();
  if (!p.trim()) {
    return { single_mode: false, mode: null, transit_preferred: false };
  }
  const hasWalk = /walk|步行|走路/.test(p);
  const hasTransit = /transit|metro|subway|bus|tram|捷运|公交|地铁|电车/.test(p);
  const hasDrive = /drive|taxi|cab|uber|打车|开车/.test(p);
  const modeCount = [hasWalk, hasTransit, hasDrive].filter(Boolean).length;

  if (modeCount >= 2) {
    return { single_mode: false, mode: null, transit_preferred: hasTransit };
  }
  if (hasTransit) return { single_mode: true, mode: "transit", transit_preferred: true };
  if (hasDrive) return { single_mode: true, mode: "drive", transit_preferred: false };
  if (hasWalk) return { single_mode: true, mode: "walk", transit_preferred: false };
  return { single_mode: false, mode: null, transit_preferred: false };
}

export type PlanStopPoint = {
  name: string;
  kind?: "stay" | "attraction" | "meal";
  meal_slot?: "lunch" | "afternoon_tea" | "dinner";
  lat?: number;
  lng?: number;
  /** Fill-chain clock: previous stop's slot.end when this point is current_stop. */
  end_time?: string;
  /** F91: pool pointer — resolve coords from card, not geocode. */
  provider?: string;
  native_id?: string;
  /** F91 single-attraction AM/PM split. */
  visit_part?: "am" | "pm";
};

export type PlanNextStopInput = {
  current_stop: PlanStopPoint;
  next_stop: PlanStopPoint;
  candidates: { places: PlaceCard[]; restaurants: PlaceCard[] };
  /** Trip city — biases geocode queries (F60). */
  city?: string;
  /** Anchor for geo sanity (origin or previous resolved point). */
  anchor?: PlaceLocation;
  /** Natural-language transit preference (§12.5): present → single mode, absent → dual-mode set. */
  transit_preference?: string;
  providers?: string[];
  locale: Locale;
  _testResolveDuration?: (
    mode: TravelMode,
    from: PlaceLocation,
    to: PlaceLocation,
  ) => Promise<{ duration_min: number; distance_m?: number } | null>;
  _testGeocode?: (query: string) => Promise<{ lat: number; lng: number } | null>;
  _testSearchRestaurants?: (near: PlaceLocation, query?: string) => Promise<PlaceCard[]>;
  used_restaurant_names?: string[];
  /** F89: next-next attraction for corridor `to`. */
  lookahead_stop?: PlanStopPoint;
  spend_level?: SpendLevel;
  budget?: "budget" | "premium";
  pace?: "tight" | "medium" | "relaxed";
  /** F89: day skeleton stops for insert/move decisions. */
  day_stops?: DayStopLike[];
  /** Optional clock override (HH:MM) for meal timing / insert. */
  arrival_clock?: string;
  /** Test hook: apply skeleton day_stops patch (insert/move). */
  _testPatchDayStops?: (next: DayStopLike[]) => Promise<void> | void;
};

export type PlanNextStopResult = {
  next_stop: { name: string; location: PlaceLocation | null };
  legs: ItineraryLeg[];
  transit_outcome: TransitOutcome;
  /** True when a natural-language preference narrowed to a single mode. */
  single_mode: boolean;
  /**
   * @deprecated F91 forbids meal_skipped — always resolve or reuse. Kept optional for wire compat.
   */
  meal_skipped?: boolean;
  venue_card?: PlaceCard;
  /** F89: skeleton day_stops were rewritten (insert/move); host must refetch. */
  skeleton_patched?: boolean;
  meal_move?: "later" | "earlier";
  inserted_meal_slot?: MealSlotId;
  /** Patched day stop list when skeleton_patched (for internal patchTrip). */
  patched_day_stops?: DayStopLike[];
};

const MEAL_SLOT_IDS = new Set(["lunch", "afternoon_tea", "dinner"]);

export function isAnonymousMealStop(stop: PlanStopPoint): boolean {
  if (stop.kind === "meal" && typeof stop.lat === "number" && typeof stop.lng === "number") {
    return false;
  }
  if (stop.kind === "meal") return true;
  return MEAL_SLOT_IDS.has(stop.name);
}

function mealSlotOf(stop: PlanStopPoint): MealSlotId {
  if (stop.meal_slot === "lunch" || stop.meal_slot === "dinner" || stop.meal_slot === "afternoon_tea") {
    return stop.meal_slot;
  }
  if (stop.name === "dinner" || stop.name === "afternoon_tea") return stop.name;
  return "lunch";
}

/**
 * F92: meal search centroid = day's attraction pool coords, not hotel stay.
 * Lunch: previous attraction, else lookahead, else first day attraction.
 * Dinner: last attraction before the meal; optional stay as corridor end (lookahead).
 */
export async function resolveMealSearchCentroid(opts: {
  slot: MealSlotId;
  currentStop: PlanStopPoint;
  currentLoc: PlaceLocation | null;
  lookaheadLoc: PlaceLocation | null;
  dayStops: DayStopLike[];
  places: PlaceCard[];
  resolveAttraction: (stop: PlanStopPoint) => Promise<PlaceLocation | null>;
}): Promise<{ near: PlaceLocation | null; lookahead: PlaceLocation | null }> {
  const dayStops = opts.dayStops;
  const mealIdx = dayStops.findIndex(
    (s) =>
      s.kind === "meal" &&
      (s.meal_slot === opts.slot || s.name === opts.slot),
  );
  const attractionStops = dayStops
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => s.kind === "attraction" && s.name?.trim());

  const resolveNamed = async (name: string): Promise<PlaceLocation | null> => {
    const card = opts.places.find((c) => c.name === name);
    const fromCard = cardLocation(card);
    if (fromCard) return fromCard;
    return opts.resolveAttraction({ name, kind: "attraction" });
  };

  let near: PlaceLocation | null = null;
  let lookahead = opts.lookaheadLoc;

  if (opts.slot === "dinner") {
    const before =
      mealIdx >= 0
        ? [...attractionStops].reverse().find(({ i }) => i < mealIdx)
        : attractionStops[attractionStops.length - 1];
    if (before) near = await resolveNamed(before.s.name!);
    // S8: dinner may center on stay/hotel (return trip) within product rules.
    if (opts.currentStop.kind === "stay" && opts.currentLoc) {
      if (!near || haversineKm(near, opts.currentLoc) > MEAL_CORRIDOR_MAX_KM) {
        near = opts.currentLoc;
        lookahead = null;
      } else {
        lookahead = opts.currentLoc;
      }
    }
  } else {
    // lunch / afternoon_tea — never use stay as centroid (S6B/S8).
    const prev =
      mealIdx >= 0
        ? [...attractionStops].reverse().find(({ i }) => i < mealIdx)
        : undefined;
    const nextAttr =
      mealIdx >= 0 ? attractionStops.find(({ i }) => i > mealIdx) : undefined;
    if (prev) {
      near = await resolveNamed(prev.s.name!);
    } else if (nextAttr) {
      // Lunch before the day's attraction(s) — still search at the POI, not the hotel.
      near = await resolveNamed(nextAttr.s.name!);
    } else if (opts.currentStop.kind === "attraction" && opts.currentLoc) {
      near = opts.currentLoc;
    } else if (attractionStops[0]) {
      near = await resolveNamed(attractionStops[0].s.name!);
    } else if (opts.lookaheadLoc && opts.currentStop.kind !== "stay") {
      near = opts.lookaheadLoc;
    }
    // Keep lookahead only if same cluster (≤5km from near); never stay.
    if (near && lookahead && haversineKm(near, lookahead) > MEAL_CORRIDOR_MAX_KM) {
      lookahead = null;
    }
    if (opts.currentStop.kind === "stay") {
      lookahead = null;
    }
  }

  if (!near && opts.currentStop.kind === "attraction") {
    near = opts.currentLoc;
  }
  // Do not fall back to stay/hotel as meal search near.
  if (!near && opts.currentStop.kind !== "stay") {
    near = opts.currentLoc;
  }

  return { near, lookahead };
}

/**
 * F89: corridor search (from → mid → lookahead) within ~800m, spend + used-name filter.
 * Pool restaurants are last fallback only (ADR-049 pools are usually empty).
 */
export async function resolveMealVenue(opts: {
  near: PlaceLocation | null;
  lookahead?: PlaceLocation | null;
  pool: PlaceCard[];
  usedNames?: string[];
  spend?: SpendLevel;
  locale: Locale;
  providers?: string[];
  /** S8: lunch must not reuse a city restaurant name when corridor is empty. */
  allowNameReuse?: boolean;
  search?: (near: PlaceLocation, query?: string) => Promise<PlaceCard[]>;
}): Promise<PlaceCard | null> {
  if (!opts.near) return null;
  const spend = opts.spend ?? 2;
  const used = opts.usedNames ?? [];
  const allowReuse = opts.allowNameReuse !== false;

  const points = corridorSearchPoints(opts.near, opts.lookahead ?? null);
  const runSearch = async (query: string): Promise<PlaceCard[]> => {
    const batches: PlaceCard[][] = [];
    for (const pt of points) {
      try {
        const hits = opts.search
          ? await opts.search(pt, query)
          : ((await searchRestaurants({
              query,
              near: { lat: pt.lat, lng: pt.lng, crs: pt.crs },
              locale: opts.locale,
              providers: opts.providers,
            })).data ?? []);
        const ringRadii = [MEAL_CORRIDOR_RADIUS_KM, MEAL_CORRIDOR_EXPANDED_KM, MEAL_CORRIDOR_MAX_KM];
        let ringHits: PlaceCard[] = [];
        for (const r of ringRadii) {
          ringHits = hits.filter((c) => withinCorridorRadius(pt, c, r));
          if (ringHits.length) break;
        }
        const localOnly = ringHits.filter((c) => {
          const loc = cardLocation(c);
          if (!loc) return false;
          return haversineKm(opts.near!, loc) <= MEAL_CORRIDOR_MAX_KM;
        });
        if (localOnly.length) batches.push(localOnly);
      } catch {
        /* try next point */
      }
    }
    return mergeRestaurantCards(batches);
  };

  let merged = filterRestaurantsBySpend(await runSearch("restaurant"), spend);
  let fromCorridor = allowReuse
    ? pickRestaurantAllowReuse(merged, used)
    : pickUnusedRestaurant(merged, used) ??
      merged.find((c) => {
        const loc = cardLocation(c);
        return loc != null;
      }) ??
      null;
  if (fromCorridor) return fromCorridor;

  // S8: one extra pass with cafe query, still hard-capped at 5km.
  merged = filterRestaurantsBySpend(await runSearch("cafe"), spend);
  fromCorridor = allowReuse
    ? pickRestaurantAllowReuse(merged, used)
    : pickUnusedRestaurant(merged, used) ??
      merged.find((c) => {
        const loc = cardLocation(c);
        return loc != null;
      }) ??
      null;
  if (fromCorridor) return fromCorridor;

  // Pool fallback (may be empty after ADR-049) — still within 5km of attraction.
  const nearbyPool = opts.pool.filter((c) => {
    const loc = cardLocation(c);
    if (!loc) return false;
    return haversineKm(opts.near!, loc) <= MEAL_CORRIDOR_MAX_KM;
  });
  const fromPool = allowReuse
    ? pickRestaurantAllowReuse(filterRestaurantsBySpend(nearbyPool, spend), used)
    : pickUnusedRestaurant(filterRestaurantsBySpend(nearbyPool, spend), used);
  if (fromPool) return fromPool;

  if (!allowReuse) return null;

  // Dinner / tea: reuse a used same-day name at the corridor origin.
  const reuseName = used.find((n) => n.trim().length > 0);
  if (reuseName) {
    return {
      provider: "GOOGLE_MAPS",
      name: reuseName,
      location: { ...opts.near, crs: opts.near.crs ?? "WGS84" },
      sources: [
        {
          provider: "GOOGLE_MAPS",
          native_id: `reuse:${reuseName}`,
          deeplinks: {},
        },
      ],
    };
  }
  return null;
}

/** F65: optional display fields merged into plan_next_stop (replaces display_current_stop tool). */
export type PlanNextStopFillInput = Omit<PlanNextStopInput, "current_stop"> & {
  current_stop?: PlanStopPoint;
  origin_mode?: boolean;
  /** When false, skip stop_display (legs-only). Default true. */
  with_stop_display?: boolean;
  previous_stop?: DisplayStopInput["previous_stop"];
  legs_to_here?: ItineraryLeg[];
  time_from?: string;
  stay_role?: DisplayStopInput["stay_role"];
  default_duration_min?: number;
  /** ADR-051 D1.3 — inject hotel PlaceCards for stay photo resolve (tests / fixtures). */
  _testSearchPlaces?: (input: {
    query: string;
    near?: PlaceLocation;
    address?: string;
  }) => Promise<PlaceCard[]>;
};

export type PlanNextStopFillResult = PlanNextStopResult & {
  stop_display?: DisplayStopResult;
};

function cardLocation(card: PlaceCard | undefined): PlaceLocation | null {
  if (!card?.location) return null;
  const { lat, lng } = card.location;
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  return { lat, lng, crs: card.location.crs ?? "WGS84" };
}

function cardNativeId(card: PlaceCard): string | undefined {
  const fromSources = card.sources?.find((s) => s.native_id?.trim())?.native_id?.trim();
  return fromSources || undefined;
}

function matchCardByPointer(stop: PlanStopPoint, candidates: PlaceCard[]): PlaceCard | undefined {
  const nid = stop.native_id?.trim();
  if (nid) {
    const byId = candidates.find((c) => {
      if (cardNativeId(c) === nid) return true;
      return (c.sources ?? []).some((s) => s.native_id === nid);
    });
    if (byId) return byId;
  }
  return candidates.find((c) => c.name === stop.name);
}

function cardHasDisplayablePhoto(card: PlaceCard | undefined): boolean {
  return Boolean(card?.photos?.some((p) => isDisplayablePhotoUrl(p)));
}

/** ADR-053: strip branch labels before stay re-search. */
export function staySearchCoreName(name: string): string {
  return name
    .replace(/（[^）]*）/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function isLodgingAncillaryName(name: string): boolean {
  return /停车|停车场|出口|入口|服务亭|充电|门岗|门卫/.test(name);
}

function looksLikeLodgingCard(card: PlaceCard): boolean {
  const name = card.name ?? "";
  if (isLodgingAncillaryName(name)) return false;
  const cat = (card.category ?? "").toLowerCase();
  if (/lodging|hotel|住宿|酒店|宾馆|旅馆|resort|inn|客栈/.test(cat)) return true;
  return /酒店|宾馆|旅馆|饭店|客栈|hotel|hyatt|hilton|marriott|sheraton|novotel|ibis|inn|resort|凯悦|希尔顿|万豪|喜来登|洲际|假日/i.test(
    name,
  );
}

/** Exported for unit tests — pick lodging from search hits (never bare cards[0]). */
export function pickLodgingStayCard(query: string, cards: PlaceCard[]): PlaceCard | undefined {
  const lodging = cards.filter(looksLikeLodgingCard);
  if (!lodging.length) return undefined;
  const exact = lodging.find((c) => c.name === query);
  if (exact) return exact;
  const core = staySearchCoreName(query);
  const coreHit = lodging.find((c) => c.name === core || staySearchCoreName(c.name) === core);
  if (coreHit) return coreHit;
  const covered = lodging.find((c) => {
    const n = (c.name ?? "").toLowerCase();
    return core.length >= 2 && n.includes(core.toLowerCase());
  });
  if (covered) return covered;
  // AMAP often drops a district/landmark prefix (e.g. 西湖大华饭店 → 大华饭店).
  const reverse = lodging
    .filter((c) => {
      const n = staySearchCoreName(c.name);
      return n.length >= 2 && core.toLowerCase().includes(n.toLowerCase());
    })
    .sort((a, b) => (a.name?.length ?? 99) - (b.name?.length ?? 99));
  return reverse[0];
}

/**
 * ADR-051 D1.3 / ADR-053 — stay / origin display card.
 * With native_id or displayable photos: copy only (no search).
 * Without pointer: search core name + lodging filter; never cards[0].
 */
export async function resolveStayDisplayCard(input: {
  stop: PlanStopPoint;
  pool: PlaceCard[];
  city?: string;
  near?: PlaceLocation | null;
  locale: Locale;
  providers?: string[];
  _testSearchPlaces?: PlanNextStopFillInput["_testSearchPlaces"];
}): Promise<PlaceCard | null> {
  const existing = matchCardByPointer(input.stop, input.pool);
  const hasPointer = Boolean(input.stop.native_id?.trim());

  if (existing && (cardHasDisplayablePhoto(existing) || hasPointer)) {
    return resolveDisplayPhoto(existing, {
      getDetails: async (nativeId) => {
        const res = await getPlaceDetails({
          provider: existing.provider ?? input.stop.provider ?? "GOOGLE_MAPS",
          native_id: nativeId,
          locale: input.locale,
          providers: input.providers,
        });
        return res.data ?? null;
      },
    });
  }

  if (hasPointer) {
    const providerId = (
      input.stop.provider === "AMAP" ||
      input.stop.provider === "GOOGLE_MAPS" ||
      input.stop.provider === "TRIPADVISOR"
        ? input.stop.provider
        : "GOOGLE_MAPS"
    ) as PlaceCard["provider"];
    const seed: PlaceCard = {
      provider: providerId,
      name: input.stop.name,
      location:
        typeof input.stop.lat === "number" && typeof input.stop.lng === "number"
          ? { lat: input.stop.lat, lng: input.stop.lng, crs: "WGS84" }
          : { lat: 0, lng: 0, crs: "WGS84" },
      sources: [
        {
          provider: providerId,
          native_id: input.stop.native_id!,
          deeplinks: {},
        },
      ],
    };
    return resolveDisplayPhoto(seed, {
      getDetails: async (nativeId) => {
        const res = await getPlaceDetails({
          provider: seed.provider ?? "GOOGLE_MAPS",
          native_id: nativeId,
          locale: input.locale,
          providers: input.providers,
        });
        return res.data ?? null;
      },
    });
  }

  const near =
    input.near ??
    (typeof input.stop.lat === "number" && typeof input.stop.lng === "number"
      ? { lat: input.stop.lat, lng: input.stop.lng, crs: "WGS84" as const }
      : cardLocation(existing));
  const query = staySearchCoreName(input.stop.name);
  if (!query) return existing ? resolveDisplayPhoto(existing) : null;

  let found: PlaceCard | undefined;
  try {
    if (input._testSearchPlaces) {
      const cards = await input._testSearchPlaces({
        query,
        near: near ?? undefined,
        address: input.city,
      });
      found = pickLodgingStayCard(input.stop.name, cards);
    } else {
      const res = await searchPlaces({
        query,
        address: input.city,
        near: near ?? undefined,
        locale: input.locale,
        providers: input.providers,
        bias_radius_m: 50_000,
      });
      found = pickLodgingStayCard(input.stop.name, res.data ?? []);
    }
  } catch {
    found = undefined;
  }

  const seed = found ?? (existing && looksLikeLodgingCard(existing) ? existing : undefined);
  if (!seed) return null;

  return resolveDisplayPhoto(seed, {
    getDetails: async (nativeId) => {
      const res = await getPlaceDetails({
        provider: seed.provider ?? "GOOGLE_MAPS",
        native_id: nativeId,
        locale: input.locale,
        providers: input.providers,
      });
      return res.data ?? null;
    },
  });
}

/**
 * Resolve stop coordinates (F91):
 * 1. Explicit lat/lng on the stop
 * 2. Pool card via native_id then exact name — coords only from card
 * 3. Geocode; ruler = previous/anchor else city bias; drop if >80km
 */
export async function resolvePoint(
  stop: PlanStopPoint,
  candidates: PlaceCard[],
  providers?: string[],
  testGeocode?: (query: string) => Promise<{ lat: number; lng: number } | null>,
  city?: string,
  anchor?: PlaceLocation,
): Promise<PlaceLocation | null> {
  if (typeof stop.lat === "number" && typeof stop.lng === "number") {
    return { lat: stop.lat, lng: stop.lng, crs: "WGS84" };
  }
  const card = matchCardByPointer(stop, candidates);
  const fromCard = cardLocation(card);
  if (fromCard) return fromCard;
  const query = city?.trim() ? `${stop.name}, ${city.trim()}` : stop.name;
  try {
    let hit: { lat?: number; lng?: number } | null;
    if (testGeocode) {
      hit = await testGeocode(query);
    } else {
      const result = await geocode({
        query,
        providers: providers?.length ? providers : undefined,
      });
      hit = result.data;
    }
    if (hit?.lat != null && hit?.lng != null) {
      const loc = { lat: hit.lat, lng: hit.lng, crs: "WGS84" as const };
      if (anchor && haversineKm(anchor, loc) > DISCOVER_GEO_MAX_KM) return null;
      return loc;
    }
  } catch {
    /* degrade below */
  }
  return null;
}

/** Drop absurd walk / long motor-transit legs (F88). Replaces cap-and-keep. */
export function dropAbsurdLegs(legs: ItineraryLeg[]): ItineraryLeg[] {
  return legs.filter((leg) => {
    if (leg.mode === "walk") return leg.duration_min <= WALK_DROP_MAX_MIN;
    return leg.duration_min <= LEG_MAX_DURATION_MIN;
  });
}

export function clampLegMinutesForClock(minutes: number | undefined): number | undefined {
  if (minutes == null) return undefined;
  return minutes > LEG_MAX_DURATION_MIN ? LEG_MAX_DURATION_MIN : minutes;
}

/** Clock reserve = max duration among remaining legs, then clamp (F88). */
export function maxRemainingLegMinutes(legs: ItineraryLeg[]): number | undefined {
  if (!legs.length) return undefined;
  return clampLegMinutesForClock(Math.max(...legs.map((l) => l.duration_min)));
}

/**
 * Compute serial transit legs current → next (F44 / TC-M10-44-01).
 * Directions are called serially per mode (walk → transit → drive), mirroring
 * §12 probe findings (enrich is fast; parallelization is not the win).
 */
export async function planNextStop(input: PlanNextStopInput): Promise<PlanNextStopResult> {
  const restaurants = [...input.candidates.restaurants];
  const all = [...input.candidates.places, ...restaurants];
  const from = await resolvePoint(
    input.current_stop,
    all,
    input.providers,
    input._testGeocode,
    input.city,
    input.anchor,
  );

  const pref = parseTransitPreference(input.transit_preference);
  const single_mode = pref.single_mode;
  const prefMode = pref.mode;

  let nextStop = input.next_stop;
  let mealVenueCard: PlaceCard | undefined;
  if (isAnonymousMealStop(nextStop)) {
    const slot = mealSlotOf(nextStop);
    const clockMin =
      hhmmToMinutes(input.arrival_clock) ??
      hhmmToMinutes(input.current_stop.end_time) ??
      null;

    if (clockMin != null && slot !== "afternoon_tea") {
      const timing = mealTimingAction(clockMin, slot, input.pace);
      if (timing === "move_later" || timing === "move_earlier") {
        const dayStops = input.day_stops ?? [];
        const moved =
          dayStops.length > 0
            ? moveMealInDayStops(dayStops, slot, timing === "move_later" ? "later" : "earlier")
            : null;
        if (moved && input._testPatchDayStops) {
          await input._testPatchDayStops(moved);
          return {
            next_stop: { name: slot, location: null },
            legs: [],
            transit_outcome: "partial",
            single_mode,
            skeleton_patched: true,
            meal_move: timing === "move_later" ? "later" : "earlier",
            patched_day_stops: moved,
          };
        }
        if (moved) {
          return {
            next_stop: { name: slot, location: null },
            legs: [],
            transit_outcome: "partial",
            single_mode,
            skeleton_patched: true,
            meal_move: timing === "move_later" ? "later" : "earlier",
            patched_day_stops: moved,
          };
        }
      }
    }

    let lookaheadLoc: PlaceLocation | null = null;
    if (input.lookahead_stop) {
      lookaheadLoc = await resolvePoint(
        input.lookahead_stop,
        all,
        input.providers,
        input._testGeocode,
        input.city,
        from ?? input.anchor,
      );
    }

    const centroid = await resolveMealSearchCentroid({
      slot,
      currentStop: input.current_stop,
      currentLoc: from,
      lookaheadLoc,
      dayStops: input.day_stops ?? [],
      places: input.candidates.places,
      resolveAttraction: (stop) =>
        resolvePoint(
          stop,
          all,
          input.providers,
          input._testGeocode,
          input.city,
          from ?? input.anchor,
        ),
    });

    const spend = mapSpendLevel(input.budget, input.spend_level);
    const venue = await resolveMealVenue({
      near: centroid.near,
      lookahead: centroid.lookahead,
      pool: restaurants,
      usedNames: input.used_restaurant_names,
      spend,
      locale: input.locale,
      providers: input.providers,
      allowNameReuse: slot !== "lunch",
      search: input._testSearchRestaurants,
    });
    if (!venue) {
      // S8 lunch: keep slot id when no local venue; dinner may still fall through unused.
      const fallbackName =
        slot === "lunch"
          ? slot
          : (input.used_restaurant_names?.find((n) => n.trim()) ?? slot);
      nextStop = {
        ...nextStop,
        name: fallbackName,
        lat: centroid.near?.lat ?? from?.lat,
        lng: centroid.near?.lng ?? from?.lng,
      };
    } else {
      const loc = cardLocation(venue);
      const resolvedVenue = await resolveDisplayPhoto(venue, {
        getDetails: async (nativeId) => {
          const res = await getPlaceDetails({
            provider: venue.provider ?? "GOOGLE_MAPS",
            native_id: nativeId,
            locale: input.locale,
            providers: input.providers,
          });
          return res.data ?? null;
        },
      });
      nextStop = {
        ...nextStop,
        name: resolvedVenue.name,
        lat: loc?.lat,
        lng: loc?.lng,
      };
      restaurants.push(resolvedVenue);
      mealVenueCard = resolvedVenue;
    }
  }

  const to = await resolvePoint(
    nextStop,
    [...input.candidates.places, ...restaurants],
    input.providers,
    input._testGeocode,
    input.city,
    from ?? input.anchor,
  );

  if (!from || !to) {
    // No coordinates on either end (geocode failed) — never fabricate durations.
    return {
      next_stop: { name: nextStop.name, location: to },
      legs: [],
      transit_outcome: "partial",
      single_mode,
    };
  }

  const providers = await resolvedDirectionProviders({
    providers: input.providers,
    location: input.city,
    near: from ?? input.anchor,
    locale: input.locale,
  });
  const resolveDuration =
    input._testResolveDuration ??
    (async (mode: TravelMode, f: PlaceLocation, t: PlaceLocation) => {
      for (const id of providers) {
        const adapter = getAdapter(id);
        if (!adapter?.directions) continue;
        try {
          const eta = await adapter.directions({ from: f, to: t, mode });
          if (eta) return eta;
        } catch {
          /* try next */
        }
      }
      return null;
    });

  const built = await buildLegs(
    from,
    to,
    undefined,
    { transit_preferred: pref.transit_preferred },
    (mode) => resolveDuration(mode, from, to),
  );
  let legs = dropAbsurdLegs(built.legs);
  let directionsFailed = built.directionsFailed;
  let usedHeuristicFallback = false;

  if (single_mode && prefMode) {
    const kept = legs.filter((l) => l.mode === prefMode);
    if (kept.length) {
      legs = kept.map((l) => ({ ...l, recommended: true }));
    }
  }

  if (!legs.length) {
    // F91: never emit heuristic fallback >120; else empty legs + partial.
    const heuristics = buildHeuristicLegs(from, to, undefined, {
      transit_preferred: pref.transit_preferred || true,
    });
    const capped = heuristics.filter((l) => l.duration_min <= LEG_MAX_DURATION_MIN);
    const fallback =
      capped.find((l) => l.mode === "transit") ??
      capped.find((l) => l.mode === "drive") ??
      capped.find((l) => l.mode === "walk") ??
      capped[0];
    if (fallback) {
      legs = [{ ...fallback, recommended: true, source: "heuristic" }];
      usedHeuristicFallback = true;
    } else {
      usedHeuristicFallback = true;
    }
  } else if (!legs.some((l) => l.recommended)) {
    const prefer =
      (pref.transit_preferred ? legs.find((l) => l.mode === "transit") : undefined) ??
      [...legs].sort((a, b) => a.duration_min - b.duration_min)[0];
    legs = legs.map((l) => ({ ...l, recommended: l.mode === prefer?.mode }));
  }

  // Secret-scrub deeplinks (same guard as enrich-arrange-transit).
  for (const leg of legs) {
    for (const [k, v] of Object.entries(leg.deeplinks)) {
      if (/key=|Bearer|sk-/i.test(v)) delete leg.deeplinks[k];
    }
  }

  const anyDirections = legs.some((l) => l.source === "directions");
  const transit_outcome: TransitOutcome = usedHeuristicFallback
    ? "partial"
    : anyDirections && !directionsFailed
      ? "directions"
      : anyDirections
        ? "partial"
        : "heuristic";

  return {
    next_stop: { name: nextStop.name, location: to },
    legs,
    transit_outcome,
    single_mode,
    ...(mealVenueCard ? { venue_card: mealVenueCard } : {}),
  };
}

/**
 * F65: plan transit legs (unless origin_mode) and attach stop_display in one call.
 * origin_mode renders a stay/origin stop without computing legs (current === next).
 */
export async function planNextStopFill(input: PlanNextStopFillInput): Promise<PlanNextStopFillResult> {
  const withDisplay = input.with_stop_display !== false;
  const originMode = input.origin_mode === true;

  let planResult: PlanNextStopResult;
  if (originMode) {
    const all = [...input.candidates.places, ...input.candidates.restaurants];
    const loc = await resolvePoint(
      input.next_stop,
      all,
      input.providers,
      input._testGeocode,
      input.city,
      input.anchor,
    );
    planResult = {
      next_stop: { name: input.next_stop.name, location: loc },
      legs: input.legs_to_here ?? [],
      transit_outcome: "heuristic",
      single_mode: false,
    };
  } else {
    const current = input.current_stop ?? input.next_stop;

    // F89: insert lunch/dinner when clock is in window and day lacks that meal (incl. relaxed dinner).
    if (
      !isAnonymousMealStop(input.next_stop) &&
      input.next_stop.kind !== "stay" &&
      Array.isArray(input.day_stops) &&
      input.day_stops.length
    ) {
      const clockMin =
        hhmmToMinutes(input.arrival_clock) ??
        hhmmToMinutes(current.end_time) ??
        hhmmToMinutes(input.previous_stop?.end_time) ??
        hhmmToMinutes(input.time_from);
      if (clockMin != null) {
        const insertSlot = shouldInsertMeal({
          clockMin,
          dayStops: input.day_stops,
          pace: input.pace,
        });
        if (insertSlot) {
          const nextIdx = input.day_stops.findIndex((s) => s.name === input.next_stop.name);
          const afterIndex =
            nextIdx > 0
              ? nextIdx - 1
              : (() => {
                  const curIdx = input.day_stops.findIndex((s) => s.name === current.name);
                  return curIdx >= 0 ? curIdx : undefined;
                })();
          const patched = insertMealIntoDayStops(input.day_stops, insertSlot, afterIndex);
          if (input._testPatchDayStops) await input._testPatchDayStops(patched);
          return {
            next_stop: { name: insertSlot, location: null },
            legs: [],
            transit_outcome: "partial",
            single_mode: false,
            skeleton_patched: true,
            inserted_meal_slot: insertSlot,
            patched_day_stops: patched,
          };
        }
      }
    }

    planResult = await planNextStop({
      ...input,
      current_stop: current,
      next_stop: input.next_stop,
    });
  }

  if (planResult.skeleton_patched || planResult.meal_skipped) {
    if (!withDisplay) return planResult;
    if (planResult.skeleton_patched) return planResult;
  }

  if (!withDisplay) {
    return planResult;
  }

  const previous_stop =
    input.previous_stop ??
    (input.current_stop && !originMode
      ? {
          name: input.current_stop.name,
          end_time: input.current_stop.end_time,
          kind: input.current_stop.kind,
        }
      : undefined);

  const restaurants = [
    ...input.candidates.restaurants,
    ...(planResult.venue_card ? [planResult.venue_card] : []),
  ];
  let places = [...input.candidates.places];
  const isStayStop = originMode || input.next_stop.kind === "stay";
  if (isStayStop) {
    const stayCard = await resolveStayDisplayCard({
      stop: {
        ...input.next_stop,
        name: planResult.next_stop.name,
        lat: planResult.next_stop.location?.lat ?? input.next_stop.lat,
        lng: planResult.next_stop.location?.lng ?? input.next_stop.lng,
      },
      pool: [...places, ...restaurants],
      city: input.city,
      near: planResult.next_stop.location ?? input.anchor ?? null,
      locale: input.locale,
      providers: input.providers,
      _testSearchPlaces: input._testSearchPlaces,
    });
    if (stayCard) {
      places = [stayCard, ...places.filter((c) => c.name !== stayCard.name)];
    }
  }
  const recommendedWalkMin = planResult.legs.find(
    (l) => l.recommended && l.mode === "walk",
  )?.duration_min;
  const cluster_role =
    input.next_stop.kind === "attraction"
      ? resolveAttractionClusterRole({
          dayStops: input.day_stops ?? [],
          stopName: planResult.next_stop.name,
          candidates: places,
          walkMinFromPrev: recommendedWalkMin,
        })
      : undefined;
  const stop_display = displayCurrentStop({
    stop: {
      ...input.next_stop,
      name: planResult.next_stop.name,
      lat: planResult.next_stop.location?.lat,
      lng: planResult.next_stop.location?.lng,
    },
    candidates: { places, restaurants },
    previous_stop,
    legs_to_here: planResult.legs,
    default_duration_min: input.default_duration_min,
    time_from: input.time_from,
    stay_role: input.stay_role,
    locale: input.locale,
    pace: input.pace,
    ...(cluster_role ? { cluster_role } : {}),
  });

  return { ...planResult, stop_display };
}

// --- display_current_stop (internal; F65 — not registered as HTTP/MCP tool) ---

export type DisplayStopInput = {
  stop: PlanStopPoint;
  candidates: { places: PlaceCard[]; restaurants: PlaceCard[] };
  previous_stop?: { name?: string; end_time?: string; kind?: "stay" | "attraction" | "meal" };
  legs_to_here?: ItineraryLeg[];
  default_duration_min?: number;
  time_from?: string;
  /** F59: only day_origin resets the day clock; return/midday stay accumulate. */
  stay_role?: "day_origin" | "return" | "midday";
  locale: Locale;
  pace?: "tight" | "medium" | "relaxed";
  cluster_role?: ClusterRole;
};

export type DisplayStopResult = {
  stop: { name: string; kind: string; card: PlaceCard | null; deeplinks: Record<string, string> };
  legs_to_here: ItineraryLeg[];
  from_origin?: { transport: string; duration_min: number };
  slot: { start: string; end: string };
  transit_outcome: TransitOutcome;
  /** F42-equivalent fill-layer notes (soft, non-blocking). */
  notes: string[];
};

const DEFAULT_MEAL_MIN = 60;

function toMinutes(hhmm: string): number | null {
  const m = hhmm.match(/^(\d{2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

function fromMinutes(total: number): string {
  const t = ((total % 1440) + 1440) % 1440;
  const h = Math.floor(t / 60);
  const m = t % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function mealWindowStart(
  slot?: PlanStopPoint["meal_slot"],
  pace?: "tight" | "medium" | "relaxed" | string | null,
): number | null {
  if (!slot) return null;
  if (slot === "lunch" || slot === "afternoon_tea" || slot === "dinner") {
    return mealWindowForSlot(slot, pace).start;
  }
  return null;
}

function defaultDuration(
  stop: PlanStopPoint,
  explicit?: number,
  card?: PlaceCard | null,
  opts?: { pace?: string; cluster_role?: ClusterRole },
): number {
  if (typeof explicit === "number") return explicit;
  if (stop.kind === "meal") {
    const slot = stop.meal_slot ?? (stop.name === "dinner" ? "dinner" : "lunch");
    if (slot === "lunch" || slot === "afternoon_tea" || slot === "dinner") {
      return mealWindowForSlot(slot, opts?.pace).duration;
    }
    return DEFAULT_MEAL_MIN;
  }
  if (stop.kind === "stay") return 0;
  return attractionDwellMinutes(card, opts?.cluster_role ?? "isolated");
}

function publicDeeplinks(card: PlaceCard | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const s of card?.sources ?? []) {
    for (const [k, v] of Object.entries(s.deeplinks ?? {})) {
      if (!/key=|Bearer|sk-/i.test(v)) out[k] = v;
    }
  }
  return out;
}

/**
 * F42-equivalent station timing check in the fill layer: given the previous
 * stop's end time and the recommended leg duration, compute the earliest
 * feasible start. A violation note (not a failure) is surfaced when the
 * requested start is earlier than feasible by more than the tolerance.
 */
export function earliestFeasibleStart(
  prevEnd: string | undefined,
  recommendedLegMin: number | undefined,
  fallbackStart: string,
  toleranceMin = 5,
): { start: string; timing_violation: boolean } {
  const fallback = toMinutes(fallbackStart) ?? 10 * 60;
  const prev = prevEnd != null ? toMinutes(prevEnd) : null;
  if (prev == null) return { start: fromMinutes(fallback), timing_violation: false };
  const leg = recommendedLegMin ?? 0;
  const earliest = prev + leg;
  if (fallback + toleranceMin < earliest) {
    return { start: fromMinutes(earliest), timing_violation: true };
  }
  return { start: fromMinutes(Math.max(fallback, earliest)), timing_violation: false };
}

export function displayCurrentStop(input: DisplayStopInput): DisplayStopResult {
  const all = [...input.candidates.places, ...input.candidates.restaurants];
  const card =
    matchCardByPointer(input.stop, all) ??
    all.find((c) => c.name === input.stop.name) ??
    null;
  const slim = card ? slimArrangeCandidate(card) : null;
  const notes: string[] = [];
  const pace = input.pace;

  const legs = input.legs_to_here ?? [];
  const recommended = legs.find((l) => l.recommended) ?? legs[0];
  const recommendedMin = maxRemainingLegMinutes(legs);

  if (input.stop.kind === "stay") {
    const role =
      input.stay_role ??
      (input.previous_stop?.end_time ? "return" : "day_origin");
    if (role === "day_origin") {
      const start = input.time_from ?? "09:30";
      notes.push("origin_stop");
      return {
        stop: {
          name: input.stop.name,
          kind: "stay",
          card: slim,
          deeplinks: publicDeeplinks(card ?? undefined),
        },
        legs_to_here: [],
        slot: { start, end: start },
        transit_outcome: legs.length ? "directions" : "heuristic",
        notes,
      };
    }
    notes.push(role === "midday" ? "midday_stay" : "return_stay");
  }

  const baseStart = input.previous_stop?.end_time
    ? input.previous_stop.end_time
    : (input.time_from ?? "10:00");
  const { start: feasibleStart, timing_violation } = earliestFeasibleStart(
    input.previous_stop?.end_time,
    recommendedMin,
    baseStart,
  );
  if (timing_violation) {
    notes.push("station_timing_adjusted");
  }

  let start = feasibleStart;
  if (input.stop.kind === "meal") {
    const slot = input.stop.meal_slot ?? mealSlotOf(input.stop);
    const windowStart = mealWindowStart(slot, pace);
    const feasibleMin = toMinutes(feasibleStart) ?? 0;
    if (windowStart != null && feasibleMin < windowStart) {
      start = fromMinutes(windowStart);
    }
    // F91: past latest / end still place at arrival (break window) — do not promote lunch→dinner.
    if (slot === "lunch") {
      const w = mealWindowForSlot("lunch", pace);
      const startMin = toMinutes(start);
      if (startMin != null && (startMin < w.start || startMin > w.end)) {
        notes.push("lunch_window_outside");
      }
    }
  }

  const duration = defaultDuration(input.stop, input.default_duration_min, card, {
    pace,
    cluster_role: input.cluster_role,
  });
  const end = fromMinutes((toMinutes(start) ?? 10 * 60) + duration);

  const from_origin =
    input.previous_stop?.kind === "stay" && recommended
      ? { transport: recommended.mode, duration_min: recommended.duration_min }
      : undefined;

  const transit_outcome: TransitOutcome = legs.some((l) => l.source === "directions")
    ? "directions"
    : legs.length
      ? "heuristic"
      : input.previous_stop != null
        ? "partial"
        : "heuristic";

  return {
    stop: {
      name: input.stop.name,
      kind: input.stop.kind ?? "attraction",
      card: slim,
      deeplinks: publicDeeplinks(card ?? undefined),
    },
    legs_to_here: legs,
    from_origin,
    slot: { start, end },
    transit_outcome,
    notes,
  };
}
