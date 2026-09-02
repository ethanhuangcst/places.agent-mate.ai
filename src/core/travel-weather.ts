/**
 * ADR-045 §4.1 — multi-day weather aggregation for `travel_tips`.
 *
 * Aggregates per-day Open-Meteo forecasts into a single planning-impact summary
 * for a multi-day trip: worst severity across days, union of drivers, and the
 * full temperature range. Severity ordering follows the codebase
 * (`fair < caution < adverse < severe`), not the ADR's earlier draft terms.
 */

import {
  planningImpactFromForecast,
  type WeatherDriver,
  type WeatherSeverity,
} from "./itinerary-weather";
import type { WeatherForecast } from "../adapters/open-meteo/types";

const SEVERITY_RANK: Record<WeatherSeverity, number> = {
  fair: 0,
  caution: 1,
  adverse: 2,
  severe: 3,
};

export type AggregatedPlanningImpact = {
  severity: WeatherSeverity;
  drivers: WeatherDriver[];
  temp_min?: number;
  temp_max?: number;
};

/**
 * Aggregate daily forecasts into one planning-impact summary.
 * - severity: worst across days (fair < caution < adverse < severe)
 * - drivers: union, deduped, preserving first-seen order
 * - temp: [min of daily temp_min, max of daily temp_max]
 *
 * Single day → returns that day's impact directly (no aggregation).
 * Empty input → severity `fair`, no drivers, no temp.
 */
export function aggregatePlanningImpact(
  forecasts: WeatherForecast[],
): AggregatedPlanningImpact {
  if (forecasts.length === 0) {
    return { severity: "fair", drivers: [] };
  }

  let worst: WeatherSeverity = "fair";
  const driverSet = new Set<WeatherDriver>();
  const driverOrder: WeatherDriver[] = [];
  let tempMin: number | undefined;
  let tempMax: number | undefined;

  for (const f of forecasts) {
    const impact = planningImpactFromForecast({
      weather_code: f.weather_code,
      temp_max_c: f.temp_max_c,
    });
    if (SEVERITY_RANK[impact.severity] > SEVERITY_RANK[worst]) {
      worst = impact.severity;
    }
    for (const d of impact.drivers) {
      if (!driverSet.has(d)) {
        driverSet.add(d);
        driverOrder.push(d);
      }
    }
    if (f.temp_min_c != null) {
      tempMin = tempMin == null ? f.temp_min_c : Math.min(tempMin, f.temp_min_c);
    }
    if (f.temp_max_c != null) {
      tempMax = tempMax == null ? f.temp_max_c : Math.max(tempMax, f.temp_max_c);
    }
  }

  return { severity: worst, drivers: driverOrder, temp_min: tempMin, temp_max: tempMax };
}
