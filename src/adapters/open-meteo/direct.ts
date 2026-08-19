import { type OpenMeteoAdapterConfig } from "./config";
import { type WeatherAdapter, type WeatherForecast } from "./types";

export type FetchFn = typeof fetch;

type DailyBlock = {
  time?: string[];
  weather_code?: number[];
  temperature_2m_max?: number[];
  temperature_2m_min?: number[];
};

async function fetchWithTimeout(
  fetchFn: FetchFn,
  url: string,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchFn(url, { signal: controller.signal });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`open_meteo_egress:${msg}`);
  } finally {
    clearTimeout(timer);
  }
}

function pickDailyIndex(daily: DailyBlock, date: string): number {
  const times = daily.time ?? [];
  return times.findIndex((t) => t === date);
}

export function createOpenMeteoDirectClient(
  config: OpenMeteoAdapterConfig,
  fetchFn: FetchFn = fetch,
): WeatherAdapter {
  return {
    async fetchForecast(input): Promise<WeatherForecast | null> {
      const qs = new URLSearchParams({
        latitude: String(input.lat),
        longitude: String(input.lng),
        daily: "weather_code,temperature_2m_max,temperature_2m_min",
        timezone: "auto",
        forecast_days: "16",
      });
      if (config.apiKey) qs.set("apikey", config.apiKey);
      const url = `${config.baseUrl}/forecast?${qs.toString()}`;
      const res = await fetchWithTimeout(fetchFn, url, config.requestTimeoutMs);
      if (!res.ok) throw new Error(`open_meteo_http_${res.status}`);
      const json = (await res.json()) as { daily?: DailyBlock };
      const daily = json.daily;
      if (!daily) return null;
      const idx = pickDailyIndex(daily, input.date);
      if (idx < 0) return null;
      const code = daily.weather_code?.[idx];
      if (code == null || !Number.isFinite(Number(code))) return null;
      const max = daily.temperature_2m_max?.[idx];
      const min = daily.temperature_2m_min?.[idx];
      return {
        weather_code: Number(code),
        temp_max_c: max == null ? undefined : Number(max),
        temp_min_c: min == null ? undefined : Number(min),
        provider: "OPEN_METEO",
      };
    },
  };
}
