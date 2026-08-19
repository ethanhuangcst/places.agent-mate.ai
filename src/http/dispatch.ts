import { authenticateCaller } from "../auth/caller";
import {
  geocode,
  getPlaceDetails,
  navigate,
  searchPlaces,
  searchRestaurants,
} from "../core/tools";
import { planItinerary } from "../core/itinerary";
import { type PlanItineraryInput } from "../core/types";
import { parseLocale, type Locale } from "../core/locales";
import {
  errorEnvelope,
  statusForOutcome,
  toolToEnvelope,
  type Envelope,
} from "./envelope";
import {
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
  | "navigate";

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
  const parsed = navigateBody.safeParse(body ?? {});
  if (!parsed.success) return invalid(locale, extra);
  const result = await navigate(parsed.data);
  return { status: statusForOutcome(result.outcomeKey), envelope: toolToEnvelope(result) };
}
