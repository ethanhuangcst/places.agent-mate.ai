import { getAdapter } from "../adapters";
import { getWeatherAdapter } from "../adapters/open-meteo/fixture";
import { type WeatherAdapter } from "../adapters/open-meteo/types";
import { t } from "./i18n";
import { normalizeProviderId, type ProviderId } from "./providers";
import {
  buildTimedDay,
  dateForDay,
  dayCount,
  distributeAcrossDays,
  guessTimezone,
  insertMealBlocks,
  areaHintFromText,
  timedAttractionQueries,
  timedMealQueries,
  interpolateCorridorPin,
  buildLegs,
  rankRestaurantsForSpend,
  type TimedItineraryPlan,
  type TravelMode,
  visitsPerDay,
} from "./itinerary-timed";
import {
  planningImpactFromForecast,
  type PlanningImpact,
} from "./itinerary-weather";
import { parseLocale, type Locale } from "./locales";
import {
  filterAttractionPlaces,
  filterCafePlaces,
  filterDiningPlaces,
  isUsedPlace,
  markPlaceUsed,
  uniquePlaces,
} from "./place-filters";
import { geocode, searchPlaces, searchRestaurants } from "./tools";
import {
  type ItineraryDay,
  type ItineraryDayWeather,
  type ItineraryPlan,
  type ItineraryPreferences,
  type PlanItineraryInput,
  type PlanItineraryOrigin,
  type PlaceCard,
  type PlaceLocation,
  type ToolResult,
} from "./types";

function localesFrom(input: { locale?: Locale; locales?: Locale[] }) {
  const pair = (input.locales ?? []).filter(Boolean) as Locale[];
  const locale = parseLocale(input.locale ?? pair[0]);
  return { locale, pair: pair.length ? pair : [locale] };
}

function isCnFamilyLocale(locale: Locale): boolean {
  return locale === "CN" || locale === "HK" || locale === "TW";
}

/** CN/HK/TW: search AMAP first when the caller already listed it. Never inject AMAP. */
export function splitTimedSearchWaves(
  locale: Locale,
  providers?: string[],
): { first: string[]; rest: string[] } {
  const list = providers?.length ? [...providers] : ["GOOGLE_MAPS"];
  if (!isCnFamilyLocale(locale)) return { first: list, rest: [] };
  const amap = list.filter((p) => normalizeProviderId(p) === "AMAP");
  const rest = list.filter((p) => normalizeProviderId(p) !== "AMAP");
  if (!amap.length) return { first: list, rest: [] };
  return { first: amap, rest };
}

async function searchWithAmapRetry(
  searchFn: NonNullable<PlanItineraryDeps["searchPlacesFn"]>,
  args: Parameters<NonNullable<PlanItineraryDeps["searchPlacesFn"]>>[0],
): Promise<ToolResult<PlaceCard[]>> {
  const first = await searchFn(args);
  const amapFailed = first.skipped.some(
    (s) => s.provider === "AMAP" && s.reason_key === "errors.provider_failed",
  );
  if ((first.data?.length ?? 0) > 0 || !amapFailed) return first;
  const retry = await searchFn(args);
  return {
    data: retry.data,
    skipped: [...first.skipped, ...retry.skipped],
    locale: retry.locale,
    locales: retry.locales,
    outcomeKey: retry.outcomeKey,
  };
}

function parseBounds(bounds?: { start?: string; end?: string }): { start: Date; end: Date } | null {
  if (!bounds?.start || !bounds?.end) return null;
  const start = new Date(bounds.start);
  const end = new Date(bounds.end);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) {
    return null;
  }
  return { start, end };
}

function stopsPerDay(pace: ItineraryPreferences["pace"]): number {
  if (pace === "tight") return 4;
  if (pace === "relaxed") return 2;
  return 3;
}

/** Map common NL preference phrases to structured ids (rule-based for testability). */
export function parseNaturalLanguagePreferences(text: string): ItineraryPreferences {
  const lower = text.toLowerCase();
  const prefs: ItineraryPreferences = { natural_language: text };
  if (/relaxed|leisure|slow|weekend/i.test(lower)) prefs.pace = "relaxed";
  else if (/tight|packed|busy/i.test(lower)) prefs.pace = "tight";
  else if (/medium|moderate/i.test(lower)) prefs.pace = "medium";
  if (/budget|cheap|affordable/i.test(lower)) prefs.spend = "budget";
  else if (/premium|luxury|splurge/i.test(lower)) prefs.spend = "premium";
  if (/metro|transit|mtr|subway|public transport|bus/i.test(lower)) {
    prefs.transit_preferred = true;
  }
  return prefs;
}

export function mergePreferences(base?: ItineraryPreferences): ItineraryPreferences {
  const merged: ItineraryPreferences = { ...base };
  if (base?.natural_language) {
    const parsed = parseNaturalLanguagePreferences(base.natural_language);
    merged.pace = merged.pace ?? parsed.pace;
    merged.spend = merged.spend ?? parsed.spend;
    merged.transit_preferred = merged.transit_preferred ?? parsed.transit_preferred;
  }
  merged.pace = merged.pace ?? "medium";
  return merged;
}

function distributePlaces(
  places: PlaceCard[],
  numDays: number,
  perDay: number,
): PlaceCard[][] {
  const buckets: PlaceCard[][] = Array.from({ length: numDays }, () => []);
  let day = 0;
  for (const place of places) {
    if (buckets[day]!.length >= perDay) day = Math.min(day + 1, numDays - 1);
    buckets[day]!.push(place);
  }
  return buckets;
}

export type PlanItineraryDeps = {
  geocodeFn?: typeof geocode;
  searchPlacesFn?: typeof searchPlaces;
  searchRestaurantsFn?: typeof searchRestaurants;
  weatherAdapter?: WeatherAdapter;
};

async function resolvePin(
  pin: PlanItineraryOrigin | undefined,
  deps: PlanItineraryDeps,
  input: PlanItineraryInput,
  locale: Locale,
  pair: Locale[],
): Promise<
  | { ok: true; name: string; location: PlaceLocation; skipped: ToolResult<unknown>["skipped"] }
  | { ok: false; skipped: ToolResult<unknown>["skipped"] }
> {
  const skipped: ToolResult<unknown>["skipped"] = [];
  if (!pin) return { ok: false, skipped };
  if (pin.lat != null && pin.lng != null) {
    return {
      ok: true,
      name: pin.name?.trim() || `${pin.lat},${pin.lng}`,
      location: { lat: pin.lat, lng: pin.lng, crs: "WGS84" },
      skipped,
    };
  }
  const name = pin.name?.trim();
  if (!name) return { ok: false, skipped };
  const geoFn = deps.geocodeFn ?? geocode;
  const geo = await geoFn({
    query: name,
    providers: input.providers,
    locale,
    locales: pair,
  });
  skipped.push(...geo.skipped);
  if (!geo.data) return { ok: false, skipped };
  return {
    ok: true,
    name,
    location: {
      lat: geo.data.lat,
      lng: geo.data.lng,
      crs: (geo.data.crs as PlaceLocation["crs"]) || "WGS84",
    },
    skipped,
  };
}

async function planTimed(
  input: PlanItineraryInput,
  deps: PlanItineraryDeps,
): Promise<ToolResult<TimedItineraryPlan | null>> {
  const { locale, pair } = localesFrom(input);
  const skipped: ToolResult<unknown>["skipped"] = [];
  const bounds = parseBounds(input.bounds);
  if (!bounds) {
    return {
      data: null,
      skipped,
      locale,
      locales: pair,
      outcomeKey: "errors.bounds_invalid",
    };
  }

  const preferences = mergePreferences(input.preferences);
  const hasOrigin = Boolean(
    input.origin &&
      ((input.origin.name && input.origin.name.trim()) ||
        (input.origin.lat != null && input.origin.lng != null)),
  );
  const hasDestination = Boolean(
    input.destination &&
      ((input.destination.name && input.destination.name.trim()) ||
        (input.destination.lat != null && input.destination.lng != null)),
  );

  const originRes = hasOrigin
    ? await resolvePin(input.origin, deps, input, locale, pair)
    : { ok: false as const, skipped: [] as ToolResult<unknown>["skipped"] };
  skipped.push(...originRes.skipped);

  const destRes = hasDestination
    ? await resolvePin(input.destination, deps, input, locale, pair)
    : { ok: false as const, skipped: [] as ToolResult<unknown>["skipped"] };
  skipped.push(...destRes.skipped);

  const cityHint =
    areaHintFromText(preferences.natural_language) ||
    areaHintFromText(input.timezone) ||
    (originRes.ok ? areaHintFromText(originRes.name) : undefined) ||
    (destRes.ok ? areaHintFromText(destRes.name) : undefined);
  let cityPin: { name: string; location: PlaceLocation } | null = null;
  if (cityHint) {
    const city = await resolvePin({ name: cityHint }, deps, input, locale, pair);
    skipped.push(...city.skipped);
    if (city.ok) cityPin = { name: city.name, location: city.location };
  }

  // Weather/origin pin vs city search pin. Never use a destination landmark as the city.
  let weatherAnchor: { name: string; location: PlaceLocation } | null = null;
  if (originRes.ok) {
    weatherAnchor = { name: originRes.name, location: originRes.location };
  } else if (cityPin) {
    weatherAnchor = cityPin;
  }

  if (!weatherAnchor) {
    return {
      data: null,
      skipped,
      locale,
      locales: pair,
      outcomeKey: "errors.timed_no_places",
    };
  }

  const searchAreaName = cityPin?.name ?? cityHint ?? weatherAnchor.name;
  const searchNear = cityPin?.location ?? weatherAnchor.location;
  const queryHints = {
    originName: originRes.ok ? originRes.name : undefined,
    destName: destRes.ok ? destRes.name : undefined,
    naturalLanguage: preferences.natural_language,
  };

  const numDays = dayCount(bounds.start, bounds.end);
  const perDay = visitsPerDay(preferences.pace);
  const searchNeed = Math.max(perDay * numDays, perDay);
  const corridorSearch =
    Boolean(!input.places?.length) && originRes.ok && destRes.ok && numDays > 1;

  const searchFn = deps.searchPlacesFn ?? searchPlaces;
  const queries = timedAttractionQueries(searchAreaName, locale, queryHints);
  const waves = splitTimedSearchWaves(locale, input.providers);
  const seen = new Set<string>();
  const searchAtPin = async (pin: PlaceLocation, need: number) => {
    const found: PlaceCard[] = [];
    const tryWave = async (providers: string[]) => {
      for (const query of queries) {
        if (found.length >= need) break;
        const result = await searchWithAmapRetry(searchFn, {
          query,
          near: { lat: pin.lat, lng: pin.lng, crs: pin.crs },
          providers,
          locale,
          locales: pair,
        });
        skipped.push(...result.skipped);
        for (const card of filterAttractionPlaces(result.data ?? [])) {
          if (isUsedPlace(card, seen)) continue;
          markPlaceUsed(card, seen);
          found.push(card);
          if (found.length >= need) break;
        }
      }
    };
    await tryWave(waves.first);
    if (found.length < need && waves.rest.length) await tryWave(waves.rest);
    return uniquePlaces(found);
  };

  let buckets: PlaceCard[][];
  if (input.places?.length) {
    buckets = distributeAcrossDays(input.places, numDays, perDay, {
      origin: originRes.ok ? originRes.location : searchNear,
      destination: destRes.ok ? destRes.location : null,
    });
  } else if (corridorSearch) {
    buckets = [];
    for (let d = 0; d < numDays; d++) {
      const pin = interpolateCorridorPin(
        originRes.location,
        destRes.location,
        d,
        numDays,
      );
      buckets.push(await searchAtPin(pin, perDay));
    }
  } else {
    const places = await searchAtPin(searchNear, searchNeed);
    if (!places.length) {
      return {
        data: null,
        skipped,
        locale,
        locales: pair,
        outcomeKey: "errors.timed_no_places",
      };
    }
    buckets = distributeAcrossDays(places, numDays, perDay, {
      origin: originRes.ok ? originRes.location : searchNear,
      destination: destRes.ok ? destRes.location : null,
    });
  }

  const hasAnyVisit = buckets.some((b) => b.length > 0);
  if (!hasAnyVisit) {
    return {
      data: null,
      skipped,
      locale,
      locales: pair,
      outcomeKey: "errors.timed_no_places",
    };
  }
  const weatherAdapter = deps.weatherAdapter ?? getWeatherAdapter();
  const timezone = guessTimezone(
    originRes.ok ? originRes.name : searchAreaName,
    input.timezone,
  );

  const directionProviders = (
    input.providers?.length ? input.providers : ["GOOGLE_MAPS"]
  ) as ProviderId[];

  const resolveDuration = async (
    mode: TravelMode,
    from: PlaceLocation,
    to: PlaceLocation,
  ) => {
    for (const id of directionProviders) {
      const adapter = getAdapter(id);
      if (!adapter?.directions) continue;
      try {
        const eta = await adapter.directions({ from, to, mode });
        if (eta) return eta;
      } catch {
        /* try next */
      }
    }
    return null;
  };

  const markDirectionsSkipped = () => {
    for (const id of directionProviders) {
      if (getAdapter(id)?.directions) {
        skipped.push({ provider: id, reason_key: "errors.directions_unavailable" });
      }
    }
  };

  const days = [];
  const tripUsed = new Set<string>();
  for (let i = 0; i < numDays; i++) {
    const date = dateForDay(bounds.start, i);
    const dayPlaces = buckets[i] ?? [];
    let weather: ItineraryDayWeather | undefined;
    let impact: PlanningImpact | undefined;
    try {
      const forecast = await weatherAdapter.fetchForecast({
        lat: weatherAnchor.location.lat,
        lng: weatherAnchor.location.lng,
        date,
      });
      if (forecast) {
        const labelKey = `weather.wmo.${forecast.weather_code}`;
        weather = {
          weather_code: forecast.weather_code,
          label_key: labelKey,
          label: t(locale, labelKey),
          temp_max_c: forecast.temp_max_c,
          temp_min_c: forecast.temp_min_c,
          provider: "OPEN_METEO",
        };
        const base = planningImpactFromForecast({
          weather_code: forecast.weather_code,
          temp_max_c: forecast.temp_max_c,
        });
        impact = {
          ...base,
          summary: t(locale, base.summary_key),
        };
      }
    } catch {
      skipped.push({ provider: "OPEN_METEO", reason_key: "errors.weather_unavailable" });
    }

    const built = await buildTimedDay({
      dayIndex: i + 1,
      date,
      fromPin: originRes.ok ? originRes.location : null,
      places: dayPlaces,
      preferences,
      weather,
      planning_impact: impact,
      locale,
      omitFirstInbound: !originRes.ok,
      resolveDuration,
    });
    if (built.directionsFailed) {
      markDirectionsSkipped();
    }
    let day = built.day;
    for (const p of dayPlaces) markPlaceUsed(p, tripUsed);

    // Closing legs to destination only when end point was supplied — on last visit of last day with stops.
    if (destRes.ok && i === numDays - 1) {
      const visits = day.blocks.filter((b) => b.kind === "visit");
      const last = visits[visits.length - 1];
      if (last && last.kind === "visit") {
        const from = last.place.location;
        const closing = await buildLegs(
          from,
          destRes.location,
          impact,
          preferences,
          (mode) => resolveDuration(mode, from, destRes.location),
        );
        last.legs_to_destination = closing.legs;
        if (closing.directionsFailed) {
          markDirectionsSkipped();
        }
      }
    }

    if (dayPlaces.length > 0) {
      const searchR = deps.searchRestaurantsFn ?? searchRestaurants;
      const pin = dayPlaces[0]!.location;
      const dinnerPin = dayPlaces[dayPlaces.length - 1]!.location;
      const area = searchAreaName;
      const cuisineQueries = timedMealQueries(
        area,
        locale,
        queryHints,
        "restaurant",
        preferences.spend,
        i + 1,
      );
      const cafeQueries = timedMealQueries(
        area,
        locale,
        queryHints,
        "cafe",
        preferences.spend,
        i + 1,
      );
      const extraRestaurantQueries = timedMealQueries(
        area,
        locale,
        queryHints,
        "restaurantExtra",
        preferences.spend,
        i + 1,
      );
      const mealWaves = splitTimedSearchWaves(locale, input.providers);
      const searchMeal = async (
        query: string,
        near: PlaceLocation,
        providers: string[],
        cafe: boolean,
      ) => {
        const res = await searchWithAmapRetry(searchR, {
          query,
          near: { lat: near.lat, lng: near.lng, crs: near.crs },
          providers,
          locale,
          locales: pair,
        });
        skipped.push(...res.skipped);
        const filtered = cafe
          ? filterCafePlaces(res.data ?? [])
          : filterDiningPlaces(res.data ?? []);
        return rankRestaurantsForSpend(filtered, preferences.spend);
      };
      const unused = (list: PlaceCard[]) =>
        uniquePlaces(list.filter((p) => !isUsedPlace(p, tripUsed)));
      const fillPool = async (
        cafe: boolean,
        near: PlaceLocation,
        extra: string[],
        minNeeded: number,
      ) => {
        let pool: PlaceCard[] = [];
        const queries = cafe
          ? cafeQueries
          : [...cuisineQueries, ...extra];
        const tryFill = async (providers: string[]) => {
          for (const q of queries) {
            if (unused(pool).length >= minNeeded) break;
            const found = await searchMeal(q, near, providers, cafe);
            pool = uniquePlaces([...pool, ...found]);
          }
        };
        await tryFill(mealWaves.first);
        if (unused(pool).length < minNeeded && mealWaves.rest.length) {
          await tryFill(mealWaves.rest);
        }
        return unused(pool);
      };
      try {
        const [lunch, dinner, cafe] = await Promise.all([
          fillPool(false, pin, extraRestaurantQueries, 4),
          fillPool(false, dinnerPin, extraRestaurantQueries, 4),
          fillPool(true, dinnerPin, [], 2),
        ]);
        day = await insertMealBlocks(
          day,
          { lunch, dinner, cafe },
          impact,
          preferences,
          originRes.ok ? originRes.location : pin,
          resolveDuration,
          tripUsed,
        );
      } catch {
        skipped.push({ provider: "GOOGLE_MAPS", reason_key: "errors.provider_failed" });
      }
    }

    days.push(day);
  }

  const plan: TimedItineraryPlan = {
    detail: "timed",
    origin: originRes.ok
      ? { name: originRes.name, location: originRes.location }
      : undefined,
    destination: destRes.ok
      ? { name: destRes.name, location: destRes.location }
      : undefined,
    search_anchor: {
      name: originRes.ok ? searchAreaName : weatherAnchor.name,
      location: originRes.ok ? searchNear : weatherAnchor.location,
    },
    timezone,
    days,
    preferences_applied: preferences,
  };
  return { data: plan, skipped, locale, locales: pair };
}

async function planStops(
  input: PlanItineraryInput,
  deps: PlanItineraryDeps,
): Promise<ToolResult<ItineraryPlan | null>> {
  const { locale, pair } = localesFrom(input);
  const skipped: { provider: string; reason_key: string }[] = [];
  const bounds = parseBounds(input.bounds);
  if (!bounds) {
    return {
      data: null,
      skipped,
      locale,
      locales: pair,
      outcomeKey: "errors.bounds_invalid",
    };
  }
  if (!input.places?.length) {
    return {
      data: null,
      skipped,
      locale,
      locales: pair,
      outcomeKey: "errors.no_places_to_plan",
    };
  }

  const preferences = mergePreferences(input.preferences);
  const numDays = dayCount(bounds.start, bounds.end);
  const perDay = stopsPerDay(preferences.pace);
  const buckets = distributePlaces(input.places, numDays, perDay);
  const weatherAdapter = deps.weatherAdapter ?? getWeatherAdapter();

  const days: ItineraryDay[] = [];
  for (let i = 0; i < numDays; i++) {
    const dayPlaces = buckets[i] ?? [];
    const stops = dayPlaces.map((place, order) => ({ place, order }));
    const date = dateForDay(bounds.start, i);
    let weather: ItineraryDayWeather | undefined;
    const anchor = dayPlaces[0];
    if (anchor) {
      try {
        const forecast = await weatherAdapter.fetchForecast({
          lat: anchor.location.lat,
          lng: anchor.location.lng,
          date,
        });
        if (forecast) {
          const labelKey = `weather.wmo.${forecast.weather_code}`;
          weather = {
            weather_code: forecast.weather_code,
            label_key: labelKey,
            label: t(locale, labelKey),
            temp_max_c: forecast.temp_max_c,
            temp_min_c: forecast.temp_min_c,
            provider: "OPEN_METEO",
          };
        }
      } catch {
        skipped.push({ provider: "OPEN_METEO", reason_key: "errors.weather_unavailable" });
      }
    }
    if (stops.length > 0 || i === 0) {
      days.push({ day_index: i + 1, date, stops, weather });
    }
  }

  return {
    data: { detail: "stops", days, preferences_applied: preferences },
    skipped,
    locale,
    locales: pair,
  };
}

export async function planItinerary(
  input: PlanItineraryInput,
  deps: PlanItineraryDeps = {},
): Promise<ToolResult<ItineraryPlan | TimedItineraryPlan | null>> {
  if (input.detail === "timed") {
    const mode = process.env.ITINERARY_MODE ?? "legacy";
    if (mode === "llm") {
      try {
        const { llmPlanItinerary } = await import("./itinerary-planner");
        const locale = parseLocale(input.locale);
        const city = input.origin?.name ?? input.destination?.name ?? "city";
        const startStr = input.bounds?.start ?? new Date().toISOString().slice(0, 10);
        const endStr = input.bounds?.end ?? startStr;
        const numDays = dayCount(new Date(startStr), new Date(endStr));
        const llmResult = await llmPlanItinerary({
          city,
          numDays,
          bounds: input.bounds ?? { start: new Date().toISOString().slice(0, 10), end: new Date().toISOString().slice(0, 10) },
          origin: input.origin,
          destination: input.destination,
          pace: input.preferences?.pace,
          budget: input.preferences?.spend,
          locale,
        });
        return {
          data: { detail: "timed", ...llmResult } as unknown as TimedItineraryPlan,
          skipped: [],
          locale,
          locales: input.locales as Locale[],
        };
      } catch (err) {
        console.error("LLM itinerary failed, falling back to legacy:", err);
        const result = await planTimed(input, deps);
        return { ...result, outcomeKey: "info.itinerary_basic_mode" };
      }
    }
    return planTimed(input, deps);
  }
  return planStops(input, deps);
}

// re-export for tests that imported day helpers from itinerary
export { dayCount, dateForDay };
