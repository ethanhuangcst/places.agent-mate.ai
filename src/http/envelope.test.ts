import { describe, expect, it } from "vitest";
import { healthEnvelope, statusForOutcome } from "./envelope";

describe("healthEnvelope", () => {
  it("should_list_public_tools_including_mvp2", () => {
    const env = healthEnvelope();
    expect(env.ok).toBe(true);
    expect(env.agent).toBe("places-agent");
    expect(env.data?.tools).toEqual([
      "search_restaurants",
      "search_places",
      "plan_itinerary",
      "get_place_details",
      "geocode",
      "navigate",
      "discover_places",
      "arrange_day",
      "chat",
    ]);
  });
});

describe("statusForOutcome", () => {
  it("should_map_place_not_found_to_404", () => {
    expect(statusForOutcome("errors.place_not_found")).toBe(404);
  });

  it("should_map_plan_input_errors_to_400", () => {
    expect(statusForOutcome("errors.bounds_invalid")).toBe(400);
    expect(statusForOutcome("errors.no_places_to_plan")).toBe(400);
  });

  it("should_map_discover_and_arrange_failures_to_502", () => {
    expect(statusForOutcome("errors.discover_places_failed")).toBe(502);
    expect(statusForOutcome("errors.arrange_day_failed")).toBe(502);
  });

  it("should_default_to_200_when_outcome_absent", () => {
    expect(statusForOutcome(undefined)).toBe(200);
    expect(statusForOutcome("errors.empty_results")).toBe(200);
  });
});
