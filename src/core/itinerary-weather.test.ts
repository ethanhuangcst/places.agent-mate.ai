import { describe, expect, it } from "vitest";
import {
  planningImpactFromForecast,
  rankPlacesForWeather,
  walkBufferReasonKey,
} from "./itinerary-weather";

describe("planningImpactFromForecast", () => {
  it("should_return_fair_when_clear_and_mild", () => {
    const impact = planningImpactFromForecast({ weather_code: 0, temp_max_c: 24 });
    expect(impact.severity).toBe("fair");
    expect(impact.leg_buffer_policy.walk_extra_min_per_leg).toBe(0);
    expect(impact.summary_key).toBe("itinerary.weather.impact_fair");
  });

  it("should_return_adverse_with_walk_buffer_when_rain", () => {
    const impact = planningImpactFromForecast({ weather_code: 61, temp_max_c: 20 });
    expect(impact.severity).toBe("adverse");
    expect(impact.drivers).toContain("rain");
    expect(impact.leg_buffer_policy.walk_extra_min_per_leg).toBe(10);
    expect(walkBufferReasonKey(impact.drivers)).toBe("itinerary.weather.buffer_rain_walk");
  });

  it("should_return_severe_when_thunderstorm", () => {
    const impact = planningImpactFromForecast({ weather_code: 95 });
    expect(impact.severity).toBe("severe");
    expect(impact.leg_buffer_policy.walk_extra_min_per_leg).toBe(20);
  });

  it("should_raise_caution_when_heat_even_if_clear", () => {
    const impact = planningImpactFromForecast({ weather_code: 1, temp_max_c: 34 });
    expect(impact.severity).toBe("caution");
    expect(impact.drivers).toContain("heat");
  });
});

describe("rankPlacesForWeather", () => {
  it("should_prefer_indoor_when_adverse", () => {
    const ranked = rankPlacesForWeather(
      [
        { name: "Miradouro da Senhora do Monte", category: "viewpoint" },
        { name: "Museu Nacional do Azulejo", category: "museum" },
      ],
      "adverse",
    );
    expect(ranked[0]?.name).toMatch(/Museu|museum/i);
  });
});
