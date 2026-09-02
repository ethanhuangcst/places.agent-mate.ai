import { describe, it, expect } from "vitest";
import { aggregatePlanningImpact } from "./travel-weather";
import type { WeatherForecast } from "../adapters/open-meteo/types";

function fc(code: number, tmin?: number, tmax?: number): WeatherForecast {
  return { weather_code: code, temp_min_c: tmin, temp_max_c: tmax, provider: "OPEN_METEO" };
}

describe("aggregatePlanningImpact", () => {
  it("should_return_fair_empty_when_no_forecasts", () => {
    expect(aggregatePlanningImpact([])).toEqual({ severity: "fair", drivers: [] });
  });

  it("should_return_single_day_impact_unchanged", () => {
    const r = aggregatePlanningImpact([fc(0, 18, 24)]);
    expect(r.severity).toBe("fair");
    expect(r.drivers).toEqual(["clear"]);
    expect(r.temp_min).toBe(18);
    expect(r.temp_max).toBe(24);
  });

  it("should_take_worst_severity_across_days", () => {
    // day1 fair (clear), day2 adverse (rain 61), day3 caution (fog 45)
    const r = aggregatePlanningImpact([fc(0), fc(61), fc(45)]);
    expect(r.severity).toBe("adverse");
  });

  it("should_promote_to_severe_when_any_day_storm", () => {
    const r = aggregatePlanningImpact([fc(0), fc(95)]);
    expect(r.severity).toBe("severe");
  });

  it("should_union_drivers_deduped_first_seen_order", () => {
    // day1 rain(61), day2 rain+? -> rain; day3 fog(45); day4 storm(95)
    const r = aggregatePlanningImpact([fc(61), fc(63), fc(45), fc(95)]);
    expect(r.drivers).toEqual(["rain", "fog", "storm"]);
  });

  it("should_compute_temp_range_min_of_mins_max_of_maxs", () => {
    const r = aggregatePlanningImpact([fc(0, 10, 20), fc(0, 5, 28), fc(0, 12, 18)]);
    expect(r.temp_min).toBe(5);
    expect(r.temp_max).toBe(28);
  });

  it("should_leave_temp_undefined_when_all_missing", () => {
    const r = aggregatePlanningImpact([fc(0), fc(61)]);
    expect(r.temp_min).toBeUndefined();
    expect(r.temp_max).toBeUndefined();
  });

  it("should_include_heat_driver_when_hot_day", () => {
    const r = aggregatePlanningImpact([fc(0, 25, 33)]);
    expect(r.drivers).toContain("heat");
    expect(r.severity).toBe("caution");
  });
});
