import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  cachedIconicPlaces,
  clearIconicCache,
  iconicCacheSize,
  hashPool,
  type IconicCacheKey,
} from "./iconic-places-cache";

beforeEach(() => {
  clearIconicCache();
  vi.restoreAllMocks();
});

function key(poolHash: string, limit = 3): IconicCacheKey {
  return { destination: "Lisbon", poolHash, limit };
}

describe("hashPool", () => {
  it("should_return_empty_for_empty_pool", () => {
    expect(hashPool([])).toBe("");
  });

  it("should_be_order_and_case_insensitive", () => {
    expect(hashPool(["Belém Tower", "Alfama"])).toBe(hashPool(["alfama", "Belém tower"]));
  });

  it("should_differ_for_different_members", () => {
    expect(hashPool(["A", "B"])).not.toBe(hashPool(["A", "C"]));
  });
});

describe("cachedIconicPlaces", () => {
  it("should_call_resolveFn_on_cache_miss", async () => {
    const fn = vi.fn(async () => ({ names: ["Belém Tower", "Alfama"], grounded: true }));
    const cached = cachedIconicPlaces(fn);
    const r = await cached(key(hashPool(["Belém Tower", "Alfama"])));
    expect(r).toEqual({ names: ["Belém Tower", "Alfama"], grounded: true });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("should_return_cached_result_on_hit", async () => {
    const fn = vi.fn(async () => ({ names: ["A"], grounded: true }));
    const cached = cachedIconicPlaces(fn);
    await cached(key(hashPool(["A"])));
    await cached(key(hashPool(["A"])));
    expect(fn).toHaveBeenCalledTimes(1);
    expect(iconicCacheSize()).toBe(1);
  });

  it("should_distinguish_by_destination", async () => {
    const fn = vi.fn(async () => ({ names: ["X"], grounded: true }));
    const cached = cachedIconicPlaces(fn);
    await cached({ destination: "Lisbon", poolHash: hashPool(["A"]), limit: 3 });
    await cached({ destination: "Tokyo", poolHash: hashPool(["A"]), limit: 3 });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("should_distinguish_by_pool_hash", async () => {
    const fn = vi.fn(async () => ({ names: ["X"], grounded: true }));
    const cached = cachedIconicPlaces(fn);
    await cached(key(hashPool(["A"])));
    await cached(key(hashPool(["B"])));
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("should_not_cache_empty_names", async () => {
    const fn = vi.fn(async () => ({ names: [], grounded: false }));
    const cached = cachedIconicPlaces(fn);
    await cached(key(hashPool(["A"])));
    await cached(key(hashPool(["A"])));
    expect(fn).toHaveBeenCalledTimes(2);
    expect(iconicCacheSize()).toBe(0);
  });

  it("should_expire_after_ttl", async () => {
    vi.useFakeTimers();
    const fn = vi.fn(async () => ({ names: ["A"], grounded: true }));
    const cached = cachedIconicPlaces(fn);
    await cached(key(hashPool(["A"])));
    expect(fn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(61 * 60 * 1000);
    await cached(key(hashPool(["A"])));
    expect(fn).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
