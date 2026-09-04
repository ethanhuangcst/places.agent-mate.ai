import { AGENT_ID, type Locale } from "../core/locales";
import { resolveOutcome } from "../core/i18n";
import { type ToolResult } from "../core/types";

export type Envelope<T = unknown> = {
  agent: typeof AGENT_ID;
  ok: boolean;
  data?: T;
  outcome?: { key: string; locales?: Partial<Record<Locale, string>> };
  skipped?: { provider: string; reason_key: string }[];
  locale?: Locale;
  locales?: Locale[];
};

export function okEnvelope<T>(
  data: T,
  locale: Locale = "EN",
  extra?: Partial<Envelope<T>>,
): Envelope<T> {
  return {
    agent: AGENT_ID,
    ok: true,
    data,
    locale,
    ...extra,
  };
}

export function errorEnvelope(
  key: string,
  locale: Locale = "EN",
  extraLocales: Locale[] = [],
  extra?: Partial<Envelope>,
): Envelope {
  return {
    agent: AGENT_ID,
    ok: false,
    outcome: resolveOutcome(locale, key, extraLocales),
    locale,
    ...extra,
  };
}

export function healthEnvelope(): Envelope<{ tools: string[] }> {
  return {
    agent: AGENT_ID,
    ok: true,
    data: {
      tools: [
        "search_restaurants",
        "search_places",
        "plan_itinerary",
        "get_place_details",
        "geocode",
        "discover_places",
        "arrange_day",
        "enrich_arrange_transit",
        "make_itinerary",
        "plan_next_stop",
        "fetch_trip_details",
        "visa_requirement",
        "travel_tips",
        "patch_trip",
        "chat",
      ],
    },
  };
}

export function toolToEnvelope<T>(result: ToolResult<T>): Envelope<T> {
  const extra: Partial<Envelope<T>> = {
    skipped: result.skipped.length ? result.skipped : undefined,
    locales: result.locales,
  };
  if (result.outcomeKey === "errors.empty_results") {
    return {
      ...okEnvelope(result.data, result.locale, extra),
      outcome: resolveOutcome(result.locale, result.outcomeKey, result.locales ?? []),
    };
  }
  if (result.outcomeKey) {
    return {
      ...errorEnvelope(result.outcomeKey, result.locale, result.locales ?? [], extra),
      data: result.data,
    };
  }
  return okEnvelope(result.data, result.locale, extra);
}

export function statusForOutcome(outcomeKey: string | undefined): number {
  if (outcomeKey === "errors.place_not_found" || outcomeKey === "errors.trip_not_found") {
    return 404;
  }
  if (outcomeKey === "errors.trip_revision_conflict") {
    return 409;
  }
  if (outcomeKey === "errors.bounds_invalid" || outcomeKey === "errors.no_places_to_plan") {
    return 400;
  }
  if (
    outcomeKey === "errors.arrange_day_failed" ||
    outcomeKey === "errors.discover_places_failed"
  ) {
    return 502;
  }
  if (
    outcomeKey === "errors.visa_invalid_country_code" ||
    outcomeKey === "errors.visa_unconfigured"
  ) {
    return 400;
  }
  if (outcomeKey === "errors.visa_quota_exceeded") {
    return 429;
  }
  return 200;
}
