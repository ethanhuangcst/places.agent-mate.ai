export type WeatherSeverity = "fair" | "caution" | "adverse" | "severe";

export type WeatherDriver = "clear" | "fog" | "drizzle" | "rain" | "snow" | "storm" | "heat";

export type LegBufferPolicy = {
  walk_extra_min_per_leg: number;
  outdoor_visit_shorten_min: number;
};

export type PlanningImpact = {
  severity: WeatherSeverity;
  drivers: WeatherDriver[];
  summary_key: string;
  /** Localized summary for callers that display strings */
  summary?: string;
  leg_buffer_policy: LegBufferPolicy;
};

const HEAT_C = 32;

function codeBand(code: number): WeatherDriver | "clear" {
  if (code >= 95) return "storm";
  if (code >= 71 && code <= 77) return "snow";
  if (code >= 80 && code <= 82) return "rain";
  if (code >= 61 && code <= 67) return "rain";
  if (code >= 51 && code <= 57) return "drizzle";
  if (code >= 45 && code <= 48) return "fog";
  return "clear";
}

function severityFromDrivers(drivers: WeatherDriver[]): WeatherSeverity {
  if (drivers.includes("storm")) return "severe";
  if (drivers.includes("rain") || drivers.includes("snow")) return "adverse";
  if (drivers.includes("drizzle") || drivers.includes("fog") || drivers.includes("heat")) {
    return "caution";
  }
  return "fair";
}

function policyFor(severity: WeatherSeverity): LegBufferPolicy {
  switch (severity) {
    case "severe":
      return { walk_extra_min_per_leg: 20, outdoor_visit_shorten_min: 45 };
    case "adverse":
      return { walk_extra_min_per_leg: 10, outdoor_visit_shorten_min: 30 };
    case "caution":
      return { walk_extra_min_per_leg: 5, outdoor_visit_shorten_min: 15 };
    default:
      return { walk_extra_min_per_leg: 0, outdoor_visit_shorten_min: 0 };
  }
}

/** Deterministic WMO (+ heat) → planning impact. No LLM. */
export function planningImpactFromForecast(input: {
  weather_code: number;
  temp_max_c?: number;
}): PlanningImpact {
  const drivers: WeatherDriver[] = [];
  const band = codeBand(input.weather_code);
  if (band !== "clear") drivers.push(band);
  if (input.temp_max_c != null && input.temp_max_c >= HEAT_C) drivers.push("heat");
  if (drivers.length === 0) drivers.push("clear");

  const severity = severityFromDrivers(drivers);
  return {
    severity,
    drivers,
    summary_key: `itinerary.weather.impact_${severity}`,
    leg_buffer_policy: policyFor(severity),
  };
}

export function walkBufferReasonKey(drivers: WeatherDriver[]): string | undefined {
  if (drivers.includes("rain") || drivers.includes("drizzle") || drivers.includes("storm")) {
    return "itinerary.weather.buffer_rain_walk";
  }
  if (drivers.includes("heat")) return "itinerary.weather.buffer_heat_walk";
  if (drivers.includes("fog") || drivers.includes("snow")) {
    return "itinerary.weather.buffer_fog_walk";
  }
  return undefined;
}

const OUTDOOR_HINT =
  /park|viewpoint|miradouro|mirador|garden|beach|outdoor|castle|hill|square|plaza|promenade/i;
const INDOOR_HINT =
  /museum|gallery|mall|shopping|cathedral|church|indoor|aquarium|theatre|theater|palace/i;

export function isOutdoorPlace(name: string, category?: string): boolean {
  const blob = `${name} ${category ?? ""}`;
  if (INDOOR_HINT.test(blob)) return false;
  if (OUTDOOR_HINT.test(blob)) return true;
  return false;
}

export function rankPlacesForWeather<T extends { name: string; category?: string }>(
  places: T[],
  severity: WeatherSeverity,
): T[] {
  if (severity === "fair") return [...places];
  return [...places].sort((a, b) => {
    const ao = isOutdoorPlace(a.name, a.category) ? 1 : 0;
    const bo = isOutdoorPlace(b.name, b.category) ? 1 : 0;
    return ao - bo;
  });
}
