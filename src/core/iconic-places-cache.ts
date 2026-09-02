/**
 * ADR-045 §3 — TTL cache for `findIconicPlaces` results.
 *
 * Iconic-place inference is deterministic for a given `{destination, pool, limit}`
 * within a short window, so caching avoids repeated LLM calls during a planning
 * session. Mirror `geocode-cache.ts`: 1h TTL, LRU eviction, null/empty not cached.
 */

export type IconicCacheKey = {
  destination: string;
  /** Stable hash of the pool array ("" when pool empty / ungrounded). */
  poolHash: string;
  limit: number;
};

export type IconicCacheValue = {
  names: string[];
  grounded: boolean;
};

type CacheEntry = { result: IconicCacheValue; ts: number };

const TTL_MS = 60 * 60 * 1000; // 1h
const MAX_SIZE = 200;

const cache = new Map<string, CacheEntry>();

/** Deterministic hash for a pool of place names. Empty pool → "". */
export function hashPool(pool: string[]): string {
  if (pool.length === 0) return "";
  // Simple stable hash: sorted, joined, length-tagged. Not cryptographic.
  return pool
    .slice()
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .sort()
    .join("|");
}

function normalizeKey(key: IconicCacheKey): string {
  return `${key.destination.trim().toLowerCase()}@${key.poolHash}@${key.limit}`;
}

/**
 * Wrap an iconic-places resolver with an in-memory LRU cache keyed by
 * `{destination, poolHash, limit}`. Same key within TTL returns cached result.
 * Empty `names` results are not cached (so a transient LLM failure retries).
 */
export function cachedIconicPlaces(
  resolveFn: (key: IconicCacheKey) => Promise<IconicCacheValue>,
): (key: IconicCacheKey) => Promise<IconicCacheValue> {
  return async (key: IconicCacheKey) => {
    const k = normalizeKey(key);
    const hit = cache.get(k);
    if (hit && Date.now() - hit.ts < TTL_MS) {
      return hit.result;
    }
    const result = await resolveFn(key);
    if (result && result.names.length > 0) {
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
export function clearIconicCache(): void {
  cache.clear();
}

/** Cache size (for tests). */
export function iconicCacheSize(): number {
  return cache.size;
}
