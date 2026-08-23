import { authenticateCaller } from "../auth/caller";
import {
  geocode,
  getPlaceDetails,
  navigate,
  searchPlaces,
  searchRestaurants,
} from "../core/tools";
import { planItinerary } from "../core/itinerary";
import { arrangeDay, discoverPlaces, enrichArrangeTransit } from "../core/itinerary-planner";
import { type PlanItineraryInput, type PlaceCard } from "../core/types";
import { parseLocale, type Locale } from "../core/locales";
import {
  errorEnvelope,
  okEnvelope,
  statusForOutcome,
  toolToEnvelope,
  type Envelope,
} from "./envelope";
import {
  arrangeDayBody,
  discoverPlacesBody,
  enrichArrangeTransitBody,
  geocodeBody,
  getPlaceDetailsBody,
  navigateBody,
  planItineraryBody,
  searchPlacesBody,
  searchRestaurantsBody,
} from "./schemas";

export type ToolName =
  | "search_restaurants"
  | "search_places"
  | "plan_itinerary"
  | "get_place_details"
  | "geocode"
  | "navigate"
  | "discover_places"
  | "arrange_day"
  | "enrich_arrange_transit";

export type DispatchResult = { status: number; envelope: Envelope };

function invalid(locale: Locale, extra: Locale[]): DispatchResult {
  return {
    status: 400,
    envelope: errorEnvelope("errors.invalid_input", locale, extra),
  };
}

export async function dispatchTool(
  tool: ToolName,
  authorization: string | null,
  body: unknown,
): Promise<DispatchResult> {
  const raw = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const locale = parseLocale(typeof raw.locale === "string" ? raw.locale : undefined);
  const extra = Array.isArray(raw.locales)
    ? (raw.locales.filter((v) => typeof v === "string") as Locale[])
    : [];

  const auth = await authenticateCaller(authorization);
  if (!auth.ok) {
    return {
      status: 401,
      envelope: errorEnvelope("errors.caller_unauthorized", locale, extra),
    };
  }

  if (tool === "search_restaurants") {
    const parsed = searchRestaurantsBody.safeParse(body ?? {});
    if (!parsed.success) return invalid(locale, extra);
    const result = await searchRestaurants(parsed.data);
    return { status: statusForOutcome(result.outcomeKey), envelope: toolToEnvelope(result) };
  }
  if (tool === "search_places") {
    const parsed = searchPlacesBody.safeParse(body ?? {});
    if (!parsed.success) return invalid(locale, extra);
    const result = await searchPlaces(parsed.data);
    return { status: statusForOutcome(result.outcomeKey), envelope: toolToEnvelope(result) };
  }
  if (tool === "plan_itinerary") {
    const parsed = planItineraryBody.safeParse(body ?? {});
    if (!parsed.success) return invalid(locale, extra);
    const result = await planItinerary(parsed.data as PlanItineraryInput);
    return { status: statusForOutcome(result.outcomeKey), envelope: toolToEnvelope(result) };
  }
  if (tool === "get_place_details") {
    const parsed = getPlaceDetailsBody.safeParse(body ?? {});
    if (!parsed.success) return invalid(locale, extra);
    const result = await getPlaceDetails(parsed.data);
    return { status: statusForOutcome(result.outcomeKey), envelope: toolToEnvelope(result) };
  }
  if (tool === "geocode") {
    const parsed = geocodeBody.safeParse(body ?? {});
    if (!parsed.success) return invalid(locale, extra);
    const result = await geocode(parsed.data);
    return { status: statusForOutcome(result.outcomeKey), envelope: toolToEnvelope(result) };
  }
  if (tool === "discover_places") {
    const parsed = discoverPlacesBody.safeParse(body ?? {});
    if (!parsed.success) return invalid(locale, extra);
    try {
      const result = await discoverPlaces({
        city: parsed.data.city,
        bounds: parsed.data.bounds,
        origin: parsed.data.origin,
        locale,
        numDays: parsed.data.numDays,
        providers: parsed.data.providers,
      });
      return { status: 200, envelope: okEnvelope(result, locale, { locales: extra }) };
    } catch {
      return {
        status: 502,
        envelope: errorEnvelope("errors.discover_places_failed", locale, extra),
      };
    }
  }
  if (tool === "arrange_day") {
    const parsed = arrangeDayBody.safeParse(body ?? {});
    if (!parsed.success) return invalid(locale, extra);
    try {
      const result = await arrangeDay({
        candidates: {
          places: (parsed.data.candidates?.places ?? []) as PlaceCard[],
          restaurants: (parsed.data.candidates?.restaurants ?? []) as PlaceCard[],
        },
        dayIndex: parsed.data.dayIndex,
        date: parsed.data.date ?? undefined,
        city: parsed.data.city,
        origin: parsed.data.origin,
        destination: parsed.data.destination,
        pace: parsed.data.pace,
        budget: parsed.data.budget,
        exclude_names: parsed.data.exclude_names,
        execution: parsed.data.execution,
        providers: parsed.data.providers,
        preferences: parsed.data.preferences,
        party_size: parsed.data.party_size,
        num_days: parsed.data.num_days,
        locale,
      });
      return { status: 200, envelope: okEnvelope(result, locale, { locales: extra }) };
    } catch {
      return {
        status: 502,
        envelope: errorEnvelope("errors.arrange_day_failed", locale, extra),
      };
    }
  }
  if (tool === "enrich_arrange_transit") {
    const parsed = enrichArrangeTransitBody.safeParse(body ?? {});
    if (!parsed.success) return invalid(locale, extra);
    try {
      const result = await enrichArrangeTransit({
        day: {
          ...parsed.data.day,
          day_index: parsed.data.day.day_index ?? 1,
        } as Parameters<typeof enrichArrangeTransit>[0]["day"],
        candidates: {
          places: parsed.data.candidates.places as PlaceCard[],
          restaurants: parsed.data.candidates.restaurants as PlaceCard[],
        },
        origin: parsed.data.origin,
        destination: parsed.data.destination,
        providers: parsed.data.providers,
        preferences: parsed.data.preferences,
      });
      return { status: 200, envelope: okEnvelope(result, locale, { locales: extra }) };
    } catch {
      return {
        status: 502,
        envelope: errorEnvelope("errors.provider_failed", locale, extra),
      };
    }
  }
  const parsed = navigateBody.safeParse(body ?? {});
  if (!parsed.success) return invalid(locale, extra);
  const result = await navigate(parsed.data);
  return { status: statusForOutcome(result.outcomeKey), envelope: toolToEnvelope(result) };
}
