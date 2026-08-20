import { type PlaceCard } from "./types";

type CacheEntry = { cards: PlaceCard[]; ts: number };

const TTL_MS = 5 * 60 * 1000; // 5 min
const MAX_SIZE = 100;

const cache = new Map<string, CacheEntry>();

/** Build a cache key from search parameters. */
export function searchCacheKey(
  query: string,
  near?: { lat: number; lng: number },
  providers?: string[],
): string {
  const q = query.trim().toLowerCase();
  const loc = near ? `${near.lat.toFixed(3)},${near.lng.toFixed(3)}` : "";
  const prov = (providers ?? []).sort().join("+");
  return `${q}|${loc}|${prov}`;
}

/** Get cached search results. Returns null on miss or expiry. */
export function getCachedSearch(key: string): PlaceCard[] | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.ts > TTL_MS) {
    cache.delete(key);
    return null;
  }
  return hit.cards;
}

/** Store search results in cache. */
export function setCachedSearch(key: string, cards: PlaceCard[]): void {
  if (cache.size >= MAX_SIZE) {
    const oldest = cache.keys().next().value;
    if (oldest != null) cache.delete(oldest);
  }
  cache.set(key, { cards, ts: Date.now() });
}

/** Clear cache (for tests). */
export function clearSearchCache(): void {
  cache.clear();
}

/** Cache size (for tests). */
export function searchCacheSize(): number {
  return cache.size;
}
