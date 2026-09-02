import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  cachedWeatherFetch,
  clearWeatherCache,
  weatherCacheSize,
  type WeatherCacheKey,
} from "./weather-cache";

beforeEach(() => {
  clearWeatherCache();
  vi.restoreAllMocks();
});

function key(date: string): WeatherCacheKey {
  return { lat: 38.7223, lng: -9.1393, date };
}

describe("cachedWeatherFetch", () => {
  it("should_call_fetchFn_on_cache_miss", async () => {
    const fn = vi.fn(async () => ({ weather_code: 0, temp_max_c: 20, provider: "OPEN_METEO" }));
    const cached = cachedWeatherFetch(fn);
    const r = await cached(key("2026-09-01"));
    expect(r).toEqual({ weather_code: 0, temp_max_c: 20, provider: "OPEN_METEO" });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("should_return_cached_result_on_hit", async () => {
    const fn = vi.fn(async () => ({ weather_code: 61, temp_max_c: 18 }));
    const cached = cachedWeatherFetch(fn);
    await cached(key("2026-09-02"));
    const r = await cached(key("2026-09-02"));
    expect(r).toEqual({ weather_code: 61, temp_max_c: 18 });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(weatherCacheSize()).toBe(1);
  });

  it("should_distinguish_by_date", async () => {
    const fn = vi.fn(async () => ({ weather_code: 0 }));
    const cached = cachedWeatherFetch(fn);
    await cached(key("2026-09-01"));
    await cached(key("2026-09-02"));
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("should_distinguish_by_lat_lng", async () => {
    const fn = vi.fn(async () => ({ weather_code: 0 }));
    const cached = cachedWeatherFetch(fn);
    await cached({ lat: 38.7223, lng: -9.1393, date: "2026-09-01" });
    await cached({ lat: 35.6762, lng: 139.6503, date: "2026-09-01" });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("should_expire_after_ttl", async () => {
    vi.useFakeTimers();
    const fn = vi.fn(async () => ({ weather_code: 0 }));
    const cached = cachedWeatherFetch(fn);
    await cached(key("2026-09-03"));
    expect(fn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(31 * 60 * 1000);
    await cached(key("2026-09-03"));
    expect(fn).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("should_not_cache_null_results", async () => {
    const fn = vi.fn(async () => null);
    const cached = cachedWeatherFetch(fn);
    await cached(key("2026-09-04"));
    await cached(key("2026-09-04"));
    expect(fn).toHaveBeenCalledTimes(2);
    expect(weatherCacheSize()).toBe(0);
  });
});
