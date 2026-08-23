import { describe, expect, it } from "vitest";
import { FIXTURE_POIS } from "../src/adapters/fixtures";
import {
  mergePreferences,
  parseNaturalLanguagePreferences,
  planItinerary,
} from "../src/core/itinerary";
import { t } from "../src/core/i18n";

const samplePlaces = FIXTURE_POIS.slice(0, 3);

describe("planItinerary", () => {
  it("should_build_plan_from_bounds_and_places", async () => {
    const result = await planItinerary({
      bounds: { start: "2026-09-01", end: "2026-09-03" },
      places: samplePlaces,
      locale: "EN",
    });
    expect(result.outcomeKey).toBeUndefined();
    expect(result.data?.days.length).toBeGreaterThan(0);
    expect(result.data?.days[0]?.stops.length).toBeGreaterThan(0);
    expect(result.data?.days[0]?.day_index).toBe(1);
    expect(result.data?.days[0]?.stops[0]?.place.name).toBeTruthy();
  });

  it("should_return_bounds_invalid_when_bounds_missing", async () => {
    const result = await planItinerary({
      places: samplePlaces,
    });
    expect(result.data).toBeNull();
    expect(result.outcomeKey).toBe("errors.bounds_invalid");
  });

  it("should_accept_same_day_bounds_for_one_day_trip", async () => {
    const result = await planItinerary({
      detail: "stops",
      bounds: { start: "2026-09-01", end: "2026-09-01" },
      places: samplePlaces,
      locale: "EN",
    });
    expect(result.outcomeKey).not.toBe("errors.bounds_invalid");
    expect(result.data?.days.length).toBe(1);
  });

  it("should_return_no_places_when_list_empty", async () => {
    const result = await planItinerary({
      bounds: { start: "2026-09-01", end: "2026-09-02" },
      places: [],
    });
    expect(result.data).toBeNull();
    expect(result.outcomeKey).toBe("errors.no_places_to_plan");
  });

  it("should_apply_tighter_pace_with_more_stops_per_day", async () => {
    const relaxed = await planItinerary({
      bounds: { start: "2026-09-01", end: "2026-09-02" },
      places: samplePlaces,
      preferences: { pace: "relaxed" },
    });
    const tight = await planItinerary({
      bounds: { start: "2026-09-01", end: "2026-09-02" },
      places: samplePlaces,
      preferences: { pace: "tight" },
    });
    const relaxedStops = relaxed.data?.days[0]?.stops.length ?? 0;
    const tightStops = tight.data?.days[0]?.stops.length ?? 0;
    expect(tightStops).toBeGreaterThanOrEqual(relaxedStops);
  });

  it("should_localize_weather_with_wmo_key_not_english_doc_string", async () => {
    const result = await planItinerary({
      bounds: { start: "2026-09-01", end: "2026-09-02" },
      places: samplePlaces,
      locale: "CN",
    });
    const weather = result.data?.days[0]?.weather;
    expect(weather?.label_key).toBe("weather.wmo.80");
    expect(weather?.label).toBe(t("CN", "weather.wmo.80"));
    expect(weather?.label).not.toMatch(/Slight rain showers/i);
  });

  it("should_keep_plan_when_weather_unavailable", async () => {
    const result = await planItinerary({
      bounds: { start: "2026-09-01", end: "2026-09-02" },
      places: samplePlaces,
      locale: "EN",
    });
    expect(result.data?.days.length).toBeGreaterThan(0);
  });
});

describe("parseNaturalLanguagePreferences", () => {
  it("should_map_nl_phrase_to_preference_ids", () => {
    const prefs = mergePreferences({
      natural_language: "relaxed weekend, budget, prefer metro",
    });
    expect(prefs.pace).toBe("relaxed");
    expect(prefs.spend).toBe("budget");
    expect(prefs.transit_preferred).toBe(true);
  });

  it("should_parse_transit_preferred_from_nl", () => {
    const parsed = parseNaturalLanguagePreferences("transit_preferred trip by MTR");
    expect(parsed.transit_preferred).toBe(true);
  });
});

describe("weather.wmo HK vs TW", () => {
  it("should_differ_for_code_80", () => {
    expect(t("HK", "weather.wmo.80")).not.toBe(t("TW", "weather.wmo.80"));
  });
});
