import { authenticateCaller } from "../auth/caller";
import {
  geocode,
  getPlaceDetails,
  searchPlaces,
  searchRestaurants,
} from "../core/tools";
import { planItinerary } from "../core/itinerary";
import { arrangeDay, discoverPlaces, enrichArrangeTransit } from "../core/itinerary-planner";
import { makeItinerary, createSkeletonChatCreate } from "../core/make-itinerary";
import { displayCurrentStop, planNextStop } from "../core/plan-next-stop";
import { visaRequirement } from "../core/visa-requirement";
import { mergeMustInclude } from "../core/must-include-merge";
import { travelTips, TravelTipsTimeoutError } from "../core/travel-tips";
import {
  dualWriteTrip,
  dualWriteTripIfPresent,
  slimCandidatesForStore,
  TripStoreError,
} from "../core/trip-dual-write";
import {
  fetchTripDetails,
  FETCH_TRIP_HOST_INSTRUCTIONS_ON_MISS,
} from "../core/fetch-trip-details";
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
  displayCurrentStopBody,
  enrichArrangeTransitBody,
  fetchTripDetailsBody,
  geocodeBody,
  getPlaceDetailsBody,
  makeItineraryBody,
  planItineraryBody,
  planNextStopBody,
  searchPlacesBody,
  searchRestaurantsBody,
  visaRequirementBody,
  travelTipsBody,
} from "./schemas";

export type ToolName =
  | "search_restaurants"
  | "search_places"
  | "plan_itinerary"
  | "get_place_details"
  | "geocode"
  | "discover_places"
  | "arrange_day"
  | "enrich_arrange_transit"
  | "make_itinerary"
  | "plan_next_stop"
  | "display_current_stop"
  | "fetch_trip_details"
  | "visa_requirement"
  | "travel_tips";

export type DispatchResult = { status: number; envelope: Envelope };

function invalid(locale: Locale, extra: Locale[]): DispatchResult {
  return {
    status: 400,
    envelope: errorEnvelope("errors.invalid_input", locale, extra),
  };
}

function tripStoreFailure(
  err: unknown,
  locale: Locale,
  extra: Locale[],
): DispatchResult | null {
  if (!(err instanceof TripStoreError)) return null;
  return {
    status: statusForOutcome(err.key),
    envelope: errorEnvelope(err.key, locale, extra, {
      data: {
        host_instructions: FETCH_TRIP_HOST_INSTRUCTIONS_ON_MISS,
      },
    }),
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
        must_include: parsed.data.must_include,
      });
      // ADR-045 §2: merge user must_include with inferred must-see (HTTP parity with MCP).
      const merged = mergeMustInclude(parsed.data.must_include ?? [], result.inferred_must_see ?? []);
      const envelopeData = merged.length
        ? { ...result, inferred_must_see: merged }
        : result;
      const trip = await dualWriteTrip({
        callerKey: auth.keyId,
        tripId: parsed.data.trip_id,
        expectedRevision: parsed.data.revision,
        locale,
        patch: {
          constraints: {
            city: parsed.data.city,
            bounds: parsed.data.bounds,
            origin: parsed.data.origin,
            numDays: parsed.data.numDays,
            must_include: merged.length ? merged : parsed.data.must_include,
          },
          candidates: slimCandidatesForStore({
            places: (result.candidates?.places ?? []) as Array<Record<string, unknown>>,
            restaurants: (result.candidates?.restaurants ?? []) as Array<Record<string, unknown>>,
          }),
        },
      });
      return {
        status: 200,
        envelope: okEnvelope({ ...envelopeData, ...trip }, locale, { locales: extra }),
      };
    } catch (err) {
      const tripFail = tripStoreFailure(err, locale, extra);
      if (tripFail) return tripFail;
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
  if (tool === "make_itinerary") {
    const parsed = makeItineraryBody.safeParse(body ?? {});
    if (!parsed.success) return invalid(locale, extra);
    try {
      const result = await makeItinerary({
        city: parsed.data.city,
        numDays: parsed.data.numDays,
        candidates: {
          places: parsed.data.candidates.places as PlaceCard[],
          restaurants: parsed.data.candidates.restaurants as PlaceCard[],
        },
        origin: parsed.data.origin,
        pace: parsed.data.pace,
        budget: parsed.data.budget,
        must_include: parsed.data.must_include,
        natural_language: parsed.data.natural_language,
        locale,
      }, { create: createSkeletonChatCreate() ?? undefined });
      const trip = await dualWriteTrip({
        callerKey: auth.keyId,
        tripId: parsed.data.trip_id,
        expectedRevision: parsed.data.revision,
        locale,
        patch: {
          constraints: {
            city: parsed.data.city,
            numDays: parsed.data.numDays,
            origin: parsed.data.origin,
            pace: parsed.data.pace,
            budget: parsed.data.budget,
            must_include: parsed.data.must_include,
          },
          candidates: slimCandidatesForStore({
            places: parsed.data.candidates.places as Array<Record<string, unknown>>,
            restaurants: parsed.data.candidates.restaurants as Array<Record<string, unknown>>,
          }),
          skeleton: result.skeleton,
        },
      });
      return {
        status: 200,
        envelope: okEnvelope({ ...result, ...trip }, locale, { locales: extra }),
      };
    } catch (err) {
      const tripFail = tripStoreFailure(err, locale, extra);
      if (tripFail) return tripFail;
      return {
        status: 502,
        envelope: errorEnvelope("errors.make_itinerary_failed", locale, extra, {
          data: { detail: err instanceof Error ? err.message : String(err) },
        }),
      };
    }
  }
  if (tool === "plan_next_stop") {
    const parsed = planNextStopBody.safeParse(body ?? {});
    if (!parsed.success) return invalid(locale, extra);
    try {
      const cs = parsed.data.current_stop;
      const anchor =
        typeof cs.lat === "number" && typeof cs.lng === "number"
          ? { lat: cs.lat, lng: cs.lng, crs: "WGS84" as const }
          : undefined;
      const result = await planNextStop({
        current_stop: cs,
        next_stop: parsed.data.next_stop,
        candidates: {
          places: parsed.data.candidates.places as PlaceCard[],
          restaurants: parsed.data.candidates.restaurants as PlaceCard[],
        },
        city: parsed.data.city,
        anchor,
        transit_preference: parsed.data.transit_preference,
        providers: parsed.data.providers,
        locale,
      });
      const trip = await dualWriteTripIfPresent({
        callerKey: auth.keyId,
        tripId: parsed.data.trip_id,
        expectedRevision: parsed.data.revision,
        locale,
        patch: {
          filled: {
            current_stop: cs,
            next_stop: parsed.data.next_stop,
            legs: result.legs,
          },
        },
      });
      return {
        status: 200,
        envelope: okEnvelope({ ...result, ...(trip ?? {}) }, locale, { locales: extra }),
      };
    } catch (err) {
      const tripFail = tripStoreFailure(err, locale, extra);
      if (tripFail) return tripFail;
      return {
        status: 502,
        envelope: errorEnvelope("errors.provider_failed", locale, extra),
      };
    }
  }
  if (tool === "display_current_stop") {
    const parsed = displayCurrentStopBody.safeParse(body ?? {});
    if (!parsed.success) return invalid(locale, extra);
    try {
      const result = displayCurrentStop({
        stop: parsed.data.stop,
        candidates: {
          places: parsed.data.candidates.places as PlaceCard[],
          restaurants: parsed.data.candidates.restaurants as PlaceCard[],
        },
        previous_stop: parsed.data.previous_stop,
        legs_to_here: parsed.data.legs_to_here as never,
        default_duration_min: parsed.data.default_duration_min,
        time_from: parsed.data.time_from,
        stay_role: parsed.data.stay_role,
        locale,
      });
      const trip = await dualWriteTripIfPresent({
        callerKey: auth.keyId,
        tripId: parsed.data.trip_id,
        expectedRevision: parsed.data.revision,
        locale,
        patch: {
          filled: { stop: parsed.data.stop, slot: result.slot },
        },
      });
      return {
        status: 200,
        envelope: okEnvelope({ ...result, ...(trip ?? {}) }, locale, { locales: extra }),
      };
    } catch (err) {
      const tripFail = tripStoreFailure(err, locale, extra);
      if (tripFail) return tripFail;
      return {
        status: 502,
        envelope: errorEnvelope("errors.provider_failed", locale, extra),
      };
    }
  }
  if (tool === "fetch_trip_details") {
    const parsed = fetchTripDetailsBody.safeParse(body ?? {});
    if (!parsed.success) return invalid(locale, extra);
    try {
      const result = await fetchTripDetails({
        callerKey: auth.keyId,
        trip_id: parsed.data.trip_id,
        fields: parsed.data.fields,
        day_index: parsed.data.day_index,
      });
      return { status: 200, envelope: okEnvelope(result, locale, { locales: extra }) };
    } catch (err) {
      const tripFail = tripStoreFailure(err, locale, extra);
      if (tripFail) return tripFail;
      return {
        status: 502,
        envelope: errorEnvelope("errors.provider_failed", locale, extra),
      };
    }
  }
  if (tool === "visa_requirement") {
    const parsed = visaRequirementBody.safeParse(body ?? {});
    if (!parsed.success) return invalid(locale, extra);
    const result = await visaRequirement(parsed.data);
    return { status: statusForOutcome(result.outcomeKey), envelope: toolToEnvelope(result) };
  }
  if (tool === "travel_tips") {
    const parsed = travelTipsBody.safeParse(body ?? {});
    if (!parsed.success) return invalid(locale, extra);
    try {
      const result = await travelTips({
        destination: parsed.data.destination,
        bounds: parsed.data.bounds,
        trip_type: parsed.data.trip_type,
        pace: parsed.data.pace,
        skeleton: parsed.data.skeleton,
        constraints: parsed.data.constraints,
        pool: parsed.data.pool,
        locale,
        providers: parsed.data.providers,
      });
      return { status: 200, envelope: okEnvelope(result, locale, { locales: extra }) };
    } catch (err) {
      const key =
        err instanceof TravelTipsTimeoutError
          ? "errors.travel_tips_timeout"
          : "errors.travel_tips_failed";
      return {
        status: 502,
        envelope: errorEnvelope(key, locale, extra),
      };
    }
  }
  return invalid(locale, extra);
}
