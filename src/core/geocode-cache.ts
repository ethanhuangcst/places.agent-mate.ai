export type GeoResult = {
  address?: string;
  lat?: number;
  lng?: number;
};

type CacheEntry = { result: GeoResult; ts: number };

const TTL_MS = 10 * 60 * 1000; // 10 min
const MAX_SIZE = 200;

const cache = new Map<string, CacheEntry>();

function normalizeKey(query: string): string {
  return query.trim().toLowerCase();
}

/**
 * Wrap a geocode function with an in-memory LRU cache.
 * Same address within TTL returns cached result instantly.
 */
export function cachedGeocode(
  geocodeFn: (q: string) => Promise<GeoResult | null>,
): (q: string) => Promise<GeoResult | null> {
  return async (query: string) => {
    const key = normalizeKey(query);

    const hit = cache.get(key);
    if (hit && Date.now() - hit.ts < TTL_MS) {
      return hit.result;
    }

    const result = await geocodeFn(query);
    if (result) {
      // Evict oldest if at capacity
      if (cache.size >= MAX_SIZE) {
        const oldest = cache.keys().next().value;
        if (oldest != null) cache.delete(oldest);
      }
      cache.set(key, { result, ts: Date.now() });
    }
    return result;
  };
}

/** Clear cache (for tests). */
export function clearGeocodeCache(): void {
  cache.clear();
}

/** Cache size (for tests). */
export function geocodeCacheSize(): number {
  return cache.size;
}
