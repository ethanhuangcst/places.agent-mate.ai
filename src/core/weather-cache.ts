/**
 * ADR-045 §4 — short-TTL in-memory cache for Open-Meteo daily forecasts.
 *
 * `travel_tips` fetches one forecast per trip day; within a single planning
 * session the same day is often re-requested. Mirror `geocode-cache.ts`:
 * `{lat,lng,date}` key, 30 min TTL, LRU eviction, null results not cached.
 */

export type WeatherCacheKey = {
  lat: number;
  lng: number;
  date: string;
};

type CacheEntry = { result: WeatherForecastValue; ts: number };

export type WeatherForecastValue = {
  weather_code: number;
  temp_max_c?: number;
  temp_min_c?: number;
  provider?: string;
};

const TTL_MS = 30 * 60 * 1000; // 30 min
const MAX_SIZE = 300;

const cache = new Map<string, CacheEntry>();

function normalizeKey(key: WeatherCacheKey): string {
  return `${key.lat.toFixed(4)},${key.lng.toFixed(4)},${key.date}`;
}

/**
 * Wrap a forecast fetcher with an in-memory LRU cache keyed by `{lat,lng,date}`.
 * Same key within TTL returns the cached forecast instantly.
 */
export function cachedWeatherFetch(
  fetchFn: (key: WeatherCacheKey) => Promise<WeatherForecastValue | null>,
): (key: WeatherCacheKey) => Promise<WeatherForecastValue | null> {
  return async (key: WeatherCacheKey) => {
    const k = normalizeKey(key);
    const hit = cache.get(k);
    if (hit && Date.now() - hit.ts < TTL_MS) {
      return hit.result;
    }
    const result = await fetchFn(key);
    if (result) {
      if (cache.size >= MAX_SIZE) {
        const oldest = cache.keys().next().value;
        if (oldest != null) cache.delete(oldest);
      }
      cache.set(k, { result, ts: Date.now() });
    }
    return result;
  };
}

/** Clear cache (for tests). */
export function clearWeatherCache(): void {
  cache.clear();
}

/** Cache size (for tests). */
export function weatherCacheSize(): number {
  return cache.size;
}
