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
import { type ProviderId } from "./providers";
import { geocode } from "./tools";
import {
  buildHeuristicLegs,
  buildLegs,
  type ItineraryLeg,
  type TravelMode,
} from "./itinerary-timed";
import { slimArrangeCandidate } from "./itinerary-planner";
import { DISCOVER_GEO_MAX_KM } from "./geo-bounds";
import { haversineKm } from "./must-include-coverage";

export type TransitOutcome = "directions" | "heuristic" | "partial";

/** Same-city leg duration hard cap (MVP-14 F60). */
export const LEG_MAX_DURATION_MIN = 180;

export type PlanStopPoint = {
  name: string;
  kind?: "stay" | "attraction" | "meal";
  meal_slot?: "lunch" | "afternoon_tea" | "dinner";
  lat?: number;
  lng?: number;
  /** Fill-chain clock: previous stop's slot.end when this point is current_stop. */
  end_time?: string;
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
};

export type PlanNextStopResult = {
  next_stop: { name: string; location: PlaceLocation | null };
  legs: ItineraryLeg[];
  transit_outcome: TransitOutcome;
  /** True when a natural-language preference narrowed to a single mode. */
  single_mode: boolean;
};

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

/** preference text → single mode, when clearly expressed (§12.5 natural-language contract). */
function preferenceMode(pref?: string): TravelMode | null {
  const p = (pref ?? "").toLowerCase();
  if (!p.trim()) return null;
  if (/walk|步行|走路/.test(p)) return "walk";
  if (/transit|metro|subway|bus|tram|公交|地铁|电车/.test(p)) return "transit";
  if (/drive|taxi|cab|uber|打车|开车/.test(p)) return "drive";
  return null;
}

async function resolvePoint(
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
  const card = candidates.find((c) => c.name === stop.name);
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

function sanitizeLegDuration(legs: ItineraryLeg[]): ItineraryLeg[] {
  return legs.map((leg) =>
    leg.duration_min > LEG_MAX_DURATION_MIN
      ? { ...leg, duration_min: LEG_MAX_DURATION_MIN, recommended: false }
      : leg,
  );
}

export function clampLegMinutesForClock(minutes: number | undefined): number | undefined {
  if (minutes == null) return undefined;
  return minutes > LEG_MAX_DURATION_MIN ? LEG_MAX_DURATION_MIN : minutes;
}

/**
 * Compute serial transit legs current → next (F44 / TC-M10-44-01).
 * Directions are called serially per mode (walk → transit → drive), mirroring
 * §12 probe findings (enrich is fast; parallelization is not the win).
 */
export async function planNextStop(input: PlanNextStopInput): Promise<PlanNextStopResult> {
  const all = [...input.candidates.places, ...input.candidates.restaurants];
  const from = await resolvePoint(
    input.current_stop,
    all,
    input.providers,
    input._testGeocode,
    input.city,
    input.anchor,
  );
  const to = await resolvePoint(
    input.next_stop,
    all,
    input.providers,
    input._testGeocode,
    input.city,
    from ?? input.anchor,
  );

  const prefMode = preferenceMode(input.transit_preference);
  const single_mode = prefMode != null;

  if (!from || !to) {
    // No coordinates on either end (geocode failed) — never fabricate durations.
    return {
      next_stop: { name: input.next_stop.name, location: to },
      legs: [],
      transit_outcome: "partial",
      single_mode,
    };
  }

  const providers = (input.providers?.length ? input.providers : ["GOOGLE_MAPS", "AMAP"]) as ProviderId[];
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

  const built = await buildLegs(from, to, undefined, { transit_preferred: prefMode === "transit" }, (mode) =>
    resolveDuration(mode, from, to),
  );
  let legs = sanitizeLegDuration(built.legs);
  let anyDirections = legs.some((l) => l.source === "directions");

  if (single_mode && prefMode) {
    const kept = legs.filter((l) => l.mode === prefMode);
    if (kept.length) {
      legs = kept.map((l) => ({ ...l, recommended: true }));
    }
  }

  // Secret-scrub deeplinks (same guard as enrich-arrange-transit).
  for (const leg of legs) {
    for (const [k, v] of Object.entries(leg.deeplinks)) {
      if (/key=|Bearer|sk-/i.test(v)) delete leg.deeplinks[k];
    }
  }

  const transit_outcome: TransitOutcome =
    anyDirections && !built.directionsFailed ? "directions" : anyDirections ? "partial" : "heuristic";

  return { next_stop: { name: input.next_stop.name, location: to }, legs, transit_outcome, single_mode };
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
    planResult = await planNextStop({
      ...input,
      current_stop: current,
      next_stop: input.next_stop,
    });
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

  const stop_display = displayCurrentStop({
    stop: input.next_stop,
    candidates: input.candidates,
    previous_stop,
    legs_to_here: planResult.legs,
    default_duration_min: input.default_duration_min,
    time_from: input.time_from,
    stay_role: input.stay_role,
    locale: input.locale,
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

const DEFAULT_VISIT_MIN = 90;
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

function mealWindowStart(slot?: PlanStopPoint["meal_slot"]): number | null {
  if (slot === "lunch") return 11 * 60 + 30;
  if (slot === "afternoon_tea") return 15 * 60;
  if (slot === "dinner") return 18 * 60;
  return null;
}

function defaultDuration(stop: PlanStopPoint, explicit?: number): number {
  if (typeof explicit === "number") return explicit;
  if (stop.kind === "meal") return DEFAULT_MEAL_MIN;
  if (stop.kind === "stay") return 0;
  return DEFAULT_VISIT_MIN;
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
  const card = all.find((c) => c.name === input.stop.name) ?? null;
  const slim = card ? slimArrangeCandidate(card) : null;
  const notes: string[] = [];

  const legs = input.legs_to_here ?? [];
  const recommended = legs.find((l) => l.recommended) ?? legs[0];
  const recommendedMin = clampLegMinutesForClock(recommended?.duration_min);

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
    const windowStart = mealWindowStart(input.stop.meal_slot);
    const feasibleMin = toMinutes(feasibleStart) ?? 0;
    if (input.stop.meal_slot === "lunch" && feasibleMin > 14 * 60 + 30) {
      start = fromMinutes(18 * 60);
      notes.push("meal_promoted_to_dinner");
    } else if (windowStart != null && feasibleMin < windowStart) {
      start = fromMinutes(windowStart);
    }
    if (input.stop.meal_slot === "lunch") {
      const startMin = toMinutes(start);
      if (
        startMin != null &&
        !notes.includes("meal_promoted_to_dinner") &&
        (startMin < 11 * 60 + 30 || startMin > 14 * 60 + 30)
      ) {
        notes.push("lunch_window_outside");
      }
    }
  }

  const duration = defaultDuration(input.stop, input.default_duration_min);
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
