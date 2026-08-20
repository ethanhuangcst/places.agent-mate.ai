import { describe, it, expect, vi, beforeEach } from "vitest";
import { cachedGeocode, clearGeocodeCache, geocodeCacheSize } from "./geocode-cache";

beforeEach(() => {
  clearGeocodeCache();
  vi.restoreAllMocks();
});

describe("cachedGeocode", () => {
  it("should call geocodeFn on cache miss", async () => {
    const fn = vi.fn(async () => ({ address: "Shanghai, China", lat: 31.2, lng: 121.4 }));
    const cached = cachedGeocode(fn);

    const result = await cached("上海市南京西路");
    expect(result).toEqual({ address: "Shanghai, China", lat: 31.2, lng: 121.4 });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("should return cached result on cache hit", async () => {
    const fn = vi.fn(async () => ({ address: "Shanghai, China", lat: 31.2, lng: 121.4 }));
    const cached = cachedGeocode(fn);

    await cached("上海市南京西路");
    const result = await cached("上海市南京西路");

    expect(result).toEqual({ address: "Shanghai, China", lat: 31.2, lng: 121.4 });
    expect(fn).toHaveBeenCalledTimes(1); // NOT called again
    expect(geocodeCacheSize()).toBe(1);
  });

  it("should normalize key (case + whitespace)", async () => {
    const fn = vi.fn(async () => ({ address: "Tokyo, Japan", lat: 35.7, lng: 139.7 }));
    const cached = cachedGeocode(fn);

    await cached("Tokyo Tower");
    await cached("  tokyo tower  ");
    await cached("TOKYO TOWER");

    expect(fn).toHaveBeenCalledTimes(1); // all same key
  });

  it("should expire entries after TTL", async () => {
    vi.useFakeTimers();
    const fn = vi.fn(async () => ({ address: "HK", lat: 22.3, lng: 114.2 }));
    const cached = cachedGeocode(fn);

    await cached("中環");
    expect(fn).toHaveBeenCalledTimes(1);

    // Advance 11 minutes (past 10min TTL)
    vi.advanceTimersByTime(11 * 60 * 1000);

    await cached("中環");
    expect(fn).toHaveBeenCalledTimes(2); // called again after expiry

    vi.useRealTimers();
  });

  it("should not cache null results", async () => {
    const fn = vi.fn(async () => null);
    const cached = cachedGeocode(fn);

    await cached("unknown place");
    await cached("unknown place");

    expect(fn).toHaveBeenCalledTimes(2); // called each time
    expect(geocodeCacheSize()).toBe(0);
  });
});
