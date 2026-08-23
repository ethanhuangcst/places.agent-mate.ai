import { type Locale } from "./locales";
import { type ProviderId } from "./providers";
import { getAttractionQueries, getMealQueries } from "../i18n/search-keywords";
import {
  type ItineraryDayWeather,
  type ItineraryPreferences,
  type PlaceCard,
  type PlaceLocation,
} from "./types";
import {
  type PlanningImpact,
  planningImpactFromForecast,
  rankPlacesForWeather,
  walkBufferReasonKey,
  type WeatherSeverity,
} from "./itinerary-weather";
import { t } from "./i18n";
import { isUsedPlace, markPlaceUsed } from "./place-filters";

export type TravelMode = "walk" | "transit" | "drive";

export type ItineraryLeg = {
  mode: TravelMode;
  duration_min: number;
  base_duration_min: number;
  weather_buffer_min: number;
  degraded_by_weather?: boolean;
  recommended?: boolean;
  reason_key?: string;
  deeplinks: Record<string, string>;
  /** Story C: vendor ETA when present */
  source?: "heuristic" | "directions";
};

export type ItineraryVisitBlock = {
  kind: "visit";
  slot: { start: string; end: string };
  place: PlaceCard;
  weather_fit?: "indoor_preferred" | "outdoor_ok";
  /** Empty when no start point (omit inbound to the day's first visit). */
  legs_to_here: ItineraryLeg[];
  /** Set on the trip's last visit when an end point was supplied. */
  legs_to_destination?: ItineraryLeg[];
};

export type ItineraryMealBlock = {
  kind: "meal";
  meal: "lunch" | "dinner" | "cafe";
  slot: { start: string; end: string };
  options: {
    place: PlaceCard;
    leg_from_previous: ItineraryLeg;
    /** Vendor hours missing or unparseable — not invented. */
    hours_unknown?: boolean;
  }[];
};

export type ItineraryBlock = ItineraryVisitBlock | ItineraryMealBlock;

export type TimedItineraryDay = {
  day_index: number;
  date: string;
  stops: { place: PlaceCard; order: number }[];
  blocks: ItineraryBlock[];
  weather?: ItineraryDayWeather;
  planning_impact?: PlanningImpact;
};

export type TimedItineraryPlan = {
  detail: "timed";
  /** Present only when the caller supplied a start point. */
  origin?: { name: string; location: PlaceLocation };
  /** Present only when the caller supplied an end point. */
  destination?: { name: string; location: PlaceLocation };
  /** Pin used for weather / nearby search when origin is omitted (city or destination). */
  search_anchor?: { name: string; location: PlaceLocation };
  timezone: string;
  days: TimedItineraryDay[];
  preferences_applied: ItineraryPreferences;
};

function haversineKm(a: PlaceLocation, b: PlaceLocation): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function interpolateCorridorPin(
  origin: PlaceLocation,
  destination: PlaceLocation,
  dayIndex: number,
  numDays: number,
): PlaceLocation {
  if (numDays <= 1) return { ...origin };
  const t = dayIndex / (numDays - 1);
  return {
    lat: origin.lat + (destination.lat - origin.lat) * t,
    lng: origin.lng + (destination.lng - origin.lng) * t,
    crs: origin.crs,
  };
}

export function estimateBaseDurationMin(mode: TravelMode, km: number): number {
  if (mode === "walk") return Math.max(5, Math.round((km / 5) * 60));
  if (mode === "drive") return Math.max(8, Math.round((km / 25) * 60));
  return Math.max(12, Math.round((km / 5) * 60 * 0.55 + 8));
}

export function directionDeeplinks(
  from: PlaceLocation,
  to: PlaceLocation,
  mode: TravelMode,
): Record<string, string> {
  const origin = `${from.lat},${from.lng}`;
  const destination = `${to.lat},${to.lng}`;
  const travelmode =
    mode === "walk" ? "walking" : mode === "transit" ? "transit" : "driving";
  const g = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&travelmode=${travelmode}`;
  return {
    google_web: g,
    google_app: g,
    amap_web: `https://uri.amap.com/navigation?from=${from.lng},${from.lat}&to=${to.lng},${to.lat}&mode=${mode === "drive" ? "car" : mode === "walk" ? "walk" : "bus"}`,
  };
}

export async function buildLegs(
  from: PlaceLocation,
  to: PlaceLocation,
  impact: PlanningImpact | undefined,
  prefs: ItineraryPreferences,
  resolveDuration?: (
    mode: TravelMode,
  ) => Promise<{ duration_min: number; distance_m?: number } | null>,
): Promise<{ legs: ItineraryLeg[]; directionsFailed: boolean }> {
  const km = haversineKm(from, to);
  const walkBuf = impact?.leg_buffer_policy.walk_extra_min_per_leg ?? 0;
  const reason = impact ? walkBufferReasonKey(impact.drivers) : undefined;
  const severity: WeatherSeverity = impact?.severity ?? "fair";
  const preferTransit =
    prefs.transit_preferred || severity === "adverse" || severity === "severe";

  const modes: TravelMode[] = ["walk", "transit", "drive"];
  let directionsFailed = false;
  const legs: ItineraryLeg[] = [];
  for (const mode of modes) {
    const heuristic = estimateBaseDurationMin(mode, km);
    let base = heuristic;
    let source: "heuristic" | "directions" = "heuristic";
    if (resolveDuration) {
      try {
        const eta = await resolveDuration(mode);
        if (eta && eta.duration_min > 0) {
          base = eta.duration_min;
          source = "directions";
        }
      } catch {
        directionsFailed = true;
      }
    }
    const buffer = mode === "walk" ? walkBuf : severity === "severe" && mode === "transit" ? 5 : 0;
    legs.push({
      mode,
      base_duration_min: base,
      weather_buffer_min: buffer,
      duration_min: base + buffer,
      degraded_by_weather: mode === "walk" && buffer > 0,
      reason_key: mode === "walk" && buffer > 0 ? reason : undefined,
      deeplinks: directionDeeplinks(from, to, mode),
      source,
    });
  }

  const recommendedMode = pickRecommendedTravelMode(legs, preferTransit);
  for (const leg of legs) {
    leg.recommended = leg.mode === recommendedMode;
  }
  legs.sort((a, b) => Number(b.recommended) - Number(a.recommended));
  return { legs, directionsFailed };
}

/** Prefer walk only when it is not absurd vs transit/drive (e.g. Sintra day trip). */
export function pickRecommendedTravelMode(
  legs: Array<{ mode: TravelMode; duration_min: number }>,
  preferTransit: boolean,
): TravelMode {
  const walk = legs.find((l) => l.mode === "walk");
  const transit = legs.find((l) => l.mode === "transit");
  const drive = legs.find((l) => l.mode === "drive");
  if (preferTransit) {
    if (transit) return "transit";
    if (drive) return "drive";
    return walk?.mode ?? "walk";
  }
  if (
    walk &&
    transit &&
    walk.duration_min > 45 &&
    walk.duration_min >= transit.duration_min * 1.5
  ) {
    return "transit";
  }
  if (
    walk &&
    drive &&
    walk.duration_min > 60 &&
    walk.duration_min >= drive.duration_min * 2
  ) {
    if (transit && transit.duration_min <= drive.duration_min * 1.35) return "transit";
    return "drive";
  }
  return walk?.mode ?? transit?.mode ?? drive?.mode ?? "walk";
}

/** Sync heuristic-only legs (Story A/B defaults and meal options). */
export function buildHeuristicLegs(
  from: PlaceLocation,
  to: PlaceLocation,
  impact: PlanningImpact | undefined,
  prefs: ItineraryPreferences,
): ItineraryLeg[] {
  const km = haversineKm(from, to);
  const walkBuf = impact?.leg_buffer_policy.walk_extra_min_per_leg ?? 0;
  const reason = impact ? walkBufferReasonKey(impact.drivers) : undefined;
  const severity: WeatherSeverity = impact?.severity ?? "fair";
  const preferTransit =
    prefs.transit_preferred || severity === "adverse" || severity === "severe";
  const modes: TravelMode[] = ["walk", "transit", "drive"];
  const legs: ItineraryLeg[] = modes.map((mode) => {
    const base = estimateBaseDurationMin(mode, km);
    const buffer = mode === "walk" ? walkBuf : severity === "severe" && mode === "transit" ? 5 : 0;
    return {
      mode,
      base_duration_min: base,
      weather_buffer_min: buffer,
      duration_min: base + buffer,
      degraded_by_weather: mode === "walk" && buffer > 0,
      reason_key: mode === "walk" && buffer > 0 ? reason : undefined,
      deeplinks: directionDeeplinks(from, to, mode),
      source: "heuristic" as const,
    };
  });
  const recommendedMode = pickRecommendedTravelMode(legs, preferTransit);
  for (const leg of legs) leg.recommended = leg.mode === recommendedMode;
  legs.sort((a, b) => Number(b.recommended) - Number(a.recommended));
  return legs;
}

function visitsPerDay(pace: ItineraryPreferences["pace"]): number {
  if (pace === "tight") return 4;
  if (pace === "relaxed") return 2;
  return 3;
}

export { visitsPerDay };

/** Clock windows per visit index within a day (local wall-clock labels). */
export function visitSlotsForPace(
  pace: ItineraryPreferences["pace"],
  shortenOutdoorMin: number,
  outdoor: boolean,
): { start: string; end: string }[] {
  const shrink = outdoor ? shortenOutdoorMin : 0;
  const endAdjust = (hh: number, mm: number) => {
    const total = hh * 60 + mm - shrink;
    const h = Math.floor(Math.max(0, total) / 60);
    const m = Math.max(0, total) % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  };

  if (pace === "relaxed") {
    return [
      { start: "10:00", end: endAdjust(12, 0) },
      { start: "14:00", end: endAdjust(16, 0) },
    ];
  }
  if (pace === "tight") {
    return [
      { start: "09:00", end: endAdjust(10, 15) },
      { start: "10:30", end: endAdjust(11, 45) },
      { start: "13:30", end: endAdjust(14, 45) },
      { start: "15:00", end: endAdjust(16, 15) },
    ];
  }
  return [
    { start: "09:30", end: endAdjust(11, 0) },
    { start: "11:30", end: endAdjust(13, 0) },
    { start: "15:00", end: endAdjust(16, 30) },
  ];
}

export function distributeAcrossDays(
  places: PlaceCard[],
  numDays: number,
  perDay: number,
  bias?: { origin?: PlaceLocation | null; destination?: PlaceLocation | null },
): PlaceCard[][] {
  const buckets: PlaceCard[][] = Array.from({ length: numDays }, () => []);
  if (!places.length || numDays < 1) return buckets;

  let ordered = [...places];
  const origin = bias?.origin;
  const destination = bias?.destination;
  if (origin && destination && numDays > 1) {
    ordered = [...places].sort((a, b) => {
      const progress = (p: PlaceCard) => {
        const dO = haversineKm(origin, p.location);
        const dD = haversineKm(destination, p.location);
        return dO / (dO + dD + 0.001);
      };
      return progress(a) - progress(b);
    });
  }

  let day = 0;
  for (const place of ordered) {
    while (day < numDays - 1 && buckets[day]!.length >= perDay) day += 1;
    if (buckets[day]!.length < perDay) buckets[day]!.push(place);
    else if (day < numDays - 1) {
      day += 1;
      buckets[day]!.push(place);
    }
  }
  return buckets;
}

export function dateForDay(start: Date, index: number): string {
  const d = new Date(start);
  d.setUTCDate(d.getUTCDate() + index);
  return d.toISOString().slice(0, 10);
}

export function dayCount(start: Date, end: Date): number {
  const ms = end.getTime() - start.getTime();
  return Math.max(1, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

export async function buildTimedDay(input: {
  dayIndex: number;
  date: string;
  /** Previous pin for inter-stop legs; unused for first visit when omitFirstInbound. */
  fromPin: PlaceLocation | null;
  places: PlaceCard[];
  preferences: ItineraryPreferences;
  weather?: ItineraryDayWeather;
  planning_impact?: PlanningImpact;
  locale: Locale;
  /** When true, first visit has legs_to_here = [] (no start point). */
  omitFirstInbound: boolean;
  resolveDuration?: (
    mode: TravelMode,
    from: PlaceLocation,
    to: PlaceLocation,
  ) => Promise<{ duration_min: number; distance_m?: number } | null>;
}): Promise<{ day: TimedItineraryDay; directionsFailed: boolean }> {
  const impact = input.planning_impact;
  const ranked = rankPlacesForWeather(input.places, impact?.severity ?? "fair");
  const slots = visitSlotsForPace(
    input.preferences.pace,
    impact?.leg_buffer_policy.outdoor_visit_shorten_min ?? 0,
    false,
  );
  const blocks: ItineraryBlock[] = [];
  let prev: PlaceLocation | null = input.fromPin;
  let directionsFailed = false;
  for (let idx = 0; idx < ranked.length; idx++) {
    const place = ranked[idx]!;
    const slotTemplate = slots[idx] ?? slots[slots.length - 1]!;
    const outdoor = /park|viewpoint|miradouro|outdoor|castle|hill/i.test(
      `${place.name} ${place.category ?? ""}`,
    );
    const slot = outdoor
      ? visitSlotsForPace(
          input.preferences.pace,
          impact?.leg_buffer_policy.outdoor_visit_shorten_min ?? 0,
          true,
        )[idx] ?? slotTemplate
      : slotTemplate;

    let legs: ItineraryLeg[] = [];
    const skipInbound = idx === 0 && input.omitFirstInbound;
    if (!skipInbound && prev) {
      const built = await buildLegs(
        prev,
        place.location,
        impact,
        input.preferences,
        input.resolveDuration
          ? (mode) => input.resolveDuration!(mode, prev!, place.location)
          : undefined,
      );
      if (built.directionsFailed) directionsFailed = true;
      legs = built.legs;
    }

    blocks.push({
      kind: "visit",
      slot,
      place,
      weather_fit:
        impact && impact.severity !== "fair"
          ? outdoor
            ? "outdoor_ok"
            : "indoor_preferred"
          : "outdoor_ok",
      legs_to_here: legs,
    });
    prev = place.location;
  }

  return {
    day: {
      day_index: input.dayIndex,
      date: input.date,
      stops: ranked.map((place, order) => ({ place, order })),
      blocks,
      weather: input.weather,
      planning_impact: impact
        ? {
            ...impact,
            summary_key: impact.summary_key,
          }
        : undefined,
    },
    directionsFailed,
  };
}

/** Infer a city/area name for search when origin is omitted. */
export function areaHintFromText(text?: string): string | undefined {
  if (!text?.trim()) return undefined;
  const t = text.trim();
  const known =
    t.match(
      /\b(Lisboa|Lisbon|Shanghai|Beijing|Guangzhou|Shenzhen|Hong Kong|Tokyo|Osaka|Taipei)\b/i,
    )?.[1] ??
    t.match(/(里斯本|上海|北京|广州|深圳|香港|东京|東京|台北)/)?.[1];
  if (known) return known;
  const inMatch = t.match(
    /\b(?:in|at|to)\s+([A-Za-z][A-Za-z ]{1,40}?)(?:\s*[,.]|\s+for\b|\s+\d|\s*$)/i,
  );
  if (inMatch?.[1]) return inMatch[1].trim();
  return undefined;
}

export function hasCjkText(value?: string): boolean {
  return Boolean(value && /[\u3040-\u30ff\u3400-\u9fff]/.test(value));
}

export type SearchQueryHints = {
  originName?: string;
  destName?: string;
  naturalLanguage?: string;
};

export function shouldUseChineseSearchQueries(opts: {
  locale: Locale;
  area?: string;
  originName?: string;
  destName?: string;
  naturalLanguage?: string;
}): boolean {
  if (opts.locale === "CN" || opts.locale === "HK" || opts.locale === "TW") return true;
  return [opts.area, opts.originName, opts.destName, opts.naturalLanguage].some(hasCjkText);
}

/** Extra auto-search queries so timed plans can fill every calendar day. */
export function timedAttractionQueries(
  area: string,
  locale: Locale = "EN",
  hints?: SearchQueryHints,
): string[] {
  const useZh = shouldUseChineseSearchQueries({
    locale,
    area,
    originName: hints?.originName,
    destName: hints?.destName,
    naturalLanguage: hints?.naturalLanguage,
  });
  // EN UI + CJK city (e.g. 哈尔滨) → CN catalog — not UI locale alone.
  const kwLocale: Locale = useZh ? (locale === "EN" ? "CN" : locale) : "EN";
  return getAttractionQueries(area.trim(), kwLocale);
}

export function timedMealQueries(
  area: string,
  locale: Locale,
  hints: SearchQueryHints | undefined,
  kind: "restaurant" | "cafe" | "restaurantExtra",
  spend?: ItineraryPreferences["spend"],
  dayIndex = 1,
): string[] {
  const a = area.trim();
  const mealKind = kind === "restaurantExtra" ? "dinner" : kind === "cafe" ? "cafe" : "lunch";
  const useZh = shouldUseChineseSearchQueries({
    locale,
    area: a,
    originName: hints?.originName,
    destName: hints?.destName,
    naturalLanguage: hints?.naturalLanguage,
  });
  const kwLocale: Locale = useZh ? (locale === "EN" ? "CN" : locale) : "EN";
  return getMealQueries(a, kwLocale, mealKind, spend, dayIndex);
}

export function localizePlanningImpact(
  impact: PlanningImpact,
  locale: Locale,
): PlanningImpact & { summary: string } {
  return {
    ...impact,
    summary: t(locale, impact.summary_key),
  } as PlanningImpact & { summary: string };
}

export function parseClockToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map((x) => Number(x));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h! * 60 + m!;
}

export function formatMinutesToClock(total: number): string {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.round(total)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

const DINNER_START_MIN = 18 * 60;
const DINNER_DURATION_MIN = 120;
const CAFE_IF_BEFORE_MIN = 17 * 60;
const CAFE_MIN_GAP_MIN = 45;
export const ABSURD_LEG_MIN = 300;

/** Lunch from visit gaps; dinner targets 18:00–20:00; cafe fills a long afternoon. */
export function mealWindowsFromVisits(
  visits: { slot: { start: string; end: string } }[],
  opts?: { lunchDurationMin?: number; dinnerDurationMin?: number },
): {
  lunch?: { start: string; end: string };
  cafe?: { start: string; end: string };
  dinner?: { start: string; end: string };
} {
  const lunchDurationMin = opts?.lunchDurationMin ?? 90;
  const dinnerDurationMin = opts?.dinnerDurationMin ?? DINNER_DURATION_MIN;
  if (!visits.length) return {};

  let lunch: { start: string; end: string } | undefined;
  if (visits.length >= 2) {
    let bestGap = -1;
    let best: { start: string; end: string } | undefined;
    for (let i = 0; i < visits.length - 1; i++) {
      const end = visits[i]!.slot.end;
      const start = visits[i + 1]!.slot.start;
      const gap = parseClockToMinutes(start) - parseClockToMinutes(end);
      if (gap > bestGap) {
        bestGap = gap;
        best = gap > 0 ? { start: end, end: start } : undefined;
      }
    }
    if (best) lunch = best;
    else {
      const end = visits[0]!.slot.end;
      lunch = {
        start: end,
        end: formatMinutesToClock(parseClockToMinutes(end) + lunchDurationMin),
      };
    }
  } else {
    const end = visits[0]!.slot.end;
    lunch = {
      start: end,
      end: formatMinutesToClock(parseClockToMinutes(end) + lunchDurationMin),
    };
  }

  const lastEndMin = parseClockToMinutes(visits[visits.length - 1]!.slot.end);
  const dinnerStartMin = Math.max(DINNER_START_MIN, lastEndMin);
  const dinner = {
    start: formatMinutesToClock(dinnerStartMin),
    end: formatMinutesToClock(dinnerStartMin + dinnerDurationMin),
  };

  const cafeStartMin = Math.max(
    lastEndMin,
    lunch ? parseClockToMinutes(lunch.end) : lastEndMin,
  );
  let cafe: { start: string; end: string } | undefined;
  if (
    lastEndMin < CAFE_IF_BEFORE_MIN &&
    dinnerStartMin - cafeStartMin >= CAFE_MIN_GAP_MIN
  ) {
    cafe = {
      start: formatMinutesToClock(cafeStartMin),
      end: dinner.start,
    };
  }
  return { lunch, cafe, dinner };
}

/** @deprecated Use mealWindowsFromVisits — kept for transitional imports. */
export function mealSlots(): {
  lunch: { start: string; end: string };
  dinner: { start: string; end: string };
} {
  return {
    lunch: { start: "12:00", end: "13:30" },
    dinner: { start: "19:00", end: "21:00" },
  };
}

export function hoursOverlapStatus(
  hours: string | undefined,
  slot: { start: string; end: string },
): "open" | "closed" | "unknown" {
  if (!hours?.trim()) return "unknown";
  if (/closed|休息|暂停营业/i.test(hours) && !/\d{1,2}:\d{2}/.test(hours)) {
    return "closed";
  }
  const ranges = [
    ...hours.matchAll(/(\d{1,2}):(\d{2})\s*[-–—]\s*(\d{1,2}):(\d{2})/g),
  ];
  if (!ranges.length) return "unknown";
  const slotStart = parseClockToMinutes(slot.start);
  const slotEnd = parseClockToMinutes(slot.end);
  for (const m of ranges) {
    const open = Number(m[1]) * 60 + Number(m[2]);
    let close = Number(m[3]) * 60 + Number(m[4]);
    if (close <= open) close += 24 * 60;
    if (slotStart < close && slotEnd > open) return "open";
  }
  return "closed";
}

export function rankRestaurantsForSpend(
  places: PlaceCard[],
  spend: ItineraryPreferences["spend"],
): PlaceCard[] {
  const scored = places.map((p) => {
    const rating = p.rating ?? 3.5;
    let score = rating;
    if (spend === "premium") score = rating;
    else if (spend === "budget") score = 5 - Math.abs(rating - 3.8);
    return { p, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.p);
}

export function filterMealOptionsForHours(
  places: PlaceCard[],
  slot: { start: string; end: string },
): { place: PlaceCard; hours_unknown?: boolean }[] {
  const out: { place: PlaceCard; hours_unknown?: boolean }[] = [];
  for (const place of places) {
    const status = hoursOverlapStatus(place.hours, slot);
    if (status === "closed") continue;
    out.push({
      place,
      ...(status === "unknown" ? { hours_unknown: true } : {}),
    });
  }
  return out;
}

export async function insertMealBlocks(
  day: TimedItineraryDay,
  meals: {
    lunch?: PlaceCard[];
    dinner?: PlaceCard[];
    cafe?: PlaceCard[];
  },
  impact: PlanningImpact | undefined,
  prefs: ItineraryPreferences,
  origin: PlaceLocation,
  resolveDuration?: (
    mode: TravelMode,
    from: PlaceLocation,
    to: PlaceLocation,
  ) => Promise<{ duration_min: number; distance_m?: number } | null>,
  excludeKeys?: Set<string>,
): Promise<TimedItineraryDay> {
  const visits = day.blocks.filter((b): b is ItineraryVisitBlock => b.kind === "visit");
  const windows = mealWindowsFromVisits(visits);
  const out: ItineraryBlock[] = [];
  const usedKeys = excludeKeys ?? new Set<string>();

  const buildOptionLegs = async (
    from: PlaceLocation,
    place: PlaceCard,
  ): Promise<ItineraryLeg> => {
    if (resolveDuration) {
      const { legs } = await buildLegs(from, place.location, impact, prefs, (mode) =>
        resolveDuration(mode, from, place.location),
      );
      return legs[0]!;
    }
    return buildHeuristicLegs(from, place.location, impact, prefs)[0]!;
  };

  const buildOptions = async (
    from: PlaceLocation,
    places: PlaceCard[],
    slot: { start: string; end: string },
  ) => {
    const pool = filterMealOptionsForHours(places, slot).filter(
      (item) => !isUsedPlace(item.place, usedKeys),
    );
    const options = [];
    for (const item of pool.slice(0, 2)) {
      const leg = await buildOptionLegs(from, item.place);
      if (leg.duration_min > ABSURD_LEG_MIN) continue;
      options.push({
        place: item.place,
        leg_from_previous: leg,
        ...(item.hours_unknown ? { hours_unknown: true } : {}),
      });
      markPlaceUsed(item.place, usedKeys);
    }
    return options;
  };

  for (let idx = 0; idx < visits.length; idx++) {
    const visit = visits[idx]!;
    out.push(visit);
    if (idx === 0 && meals.lunch?.length && windows.lunch) {
      const options = await buildOptions(
        visit.place.location,
        meals.lunch,
        windows.lunch,
      );
      if (options.length) {
        out.push({
          kind: "meal",
          meal: "lunch",
          slot: windows.lunch,
          options,
        });
      }
    }
  }

  const lastLoc = visits.length ? visits[visits.length - 1]!.place.location : origin;
  if (meals.cafe?.length && windows.cafe) {
    const options = await buildOptions(lastLoc, meals.cafe, windows.cafe);
    if (options.length) {
      out.push({
        kind: "meal",
        meal: "cafe",
        slot: windows.cafe,
        options,
      });
    }
  }

  if (meals.dinner?.length && windows.dinner) {
    const options = await buildOptions(lastLoc, meals.dinner, windows.dinner);
    if (options.length) {
      out.push({
        kind: "meal",
        meal: "dinner",
        slot: windows.dinner,
        options,
      });
    }
  }

  if (!visits.length) {
    return { ...day, blocks: out.length ? out : day.blocks };
  }
  return { ...day, blocks: out };
}

export function guessTimezone(originName: string, explicit?: string): string {
  if (explicit) return explicit;
  if (/lisbon|lisboa/i.test(originName)) return "Europe/Lisbon";
  if (/hong\s*kong|香港/i.test(originName)) return "Asia/Hong_Kong";
  if (/tokyo|東京|东京/i.test(originName)) return "Asia/Tokyo";
  if (/shanghai|上海|beijing|北京|guangzhou|广州/i.test(originName)) {
    return "Asia/Shanghai";
  }
  return "UTC";
}

export type { PlanningImpact, ProviderId };
