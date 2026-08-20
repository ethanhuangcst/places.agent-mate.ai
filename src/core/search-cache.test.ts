import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  searchCacheKey,
  getCachedSearch,
  setCachedSearch,
  clearSearchCache,
  searchCacheSize,
} from "./search-cache";
import { type PlaceCard } from "./types";

const sampleCard: PlaceCard = {
  provider: "GOOGLE_MAPS",
  name: "Test Restaurant",
  location: { lat: 22.28, lng: 114.16, crs: "WGS84" },
  sources: [{ provider: "GOOGLE_MAPS", native_id: "test1", deeplinks: {} }],
};

beforeEach(() => {
  clearSearchCache();
  vi.restoreAllMocks();
});

describe("searchCacheKey", () => {
  it("should normalize query case and whitespace", () => {
    expect(searchCacheKey("Ramen")).toBe(searchCacheKey("  ramen  "));
  });

  it("should include coordinates with 3 decimal precision", () => {
    const key = searchCacheKey("ramen", { lat: 22.28123, lng: 114.15678 });
    expect(key).toContain("22.281,114.157");
  });

  it("should include sorted providers", () => {
    const k1 = searchCacheKey("ramen", undefined, ["AMAP", "GOOGLE_MAPS"]);
    const k2 = searchCacheKey("ramen", undefined, ["GOOGLE_MAPS", "AMAP"]);
    expect(k1).toBe(k2);
  });
});

describe("getCachedSearch / setCachedSearch", () => {
  it("should return null on cache miss", () => {
    expect(getCachedSearch("nonexistent")).toBeNull();
  });

  it("should return cached cards on hit", () => {
    const key = searchCacheKey("ramen", { lat: 22.28, lng: 114.16 });
    setCachedSearch(key, [sampleCard]);

    const result = getCachedSearch(key);
    expect(result).toHaveLength(1);
    expect(result![0].name).toBe("Test Restaurant");
    expect(searchCacheSize()).toBe(1);
  });

  it("should expire entries after TTL", () => {
    vi.useFakeTimers();
    const key = searchCacheKey("ramen");
    setCachedSearch(key, [sampleCard]);

    expect(getCachedSearch(key)).toHaveLength(1);

    // Advance 6 minutes (past 5min TTL)
    vi.advanceTimersByTime(6 * 60 * 1000);

    expect(getCachedSearch(key)).toBeNull();
    vi.useRealTimers();
  });
});
