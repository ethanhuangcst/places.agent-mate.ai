import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { type PlaceCard } from "./types";

type CacheEntry = { cards: PlaceCard[]; ts: number };

const TTL_MS = 5 * 60 * 1000; // 5 min in-memory
const MAX_SIZE = 100;

const cache = new Map<string, CacheEntry>();

/** File cache (opt-in via PLACES_PROBE_CACHE_DIR). Longer TTL for probe re-runs. */
const FILE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
function probeCacheDir(): string | null {
  const d = process.env.PLACES_PROBE_CACHE_DIR?.trim();
  return d || null;
}
function safeKey(key: string): string {
  const digest = createHash("sha1").update(key).digest("hex").slice(0, 12);
  const readable = key.replace(/[^a-zA-Z0-9._\u3400-\u9fff-]+/g, "_").slice(0, 80);
  return `${readable}_${digest}`;
}
function filePath(key: string): string | null {
  const dir = probeCacheDir();
  if (!dir) return null;
  return join(dir, `${safeKey(key)}.json`);
}

/** Build a cache key from search parameters. */
export function searchCacheKey(
  query: string,
  near?: { lat: number; lng: number },
  providers?: string[],
  page?: number,
): string {
  const q = query.trim().toLowerCase();
  const loc = near ? `${near.lat.toFixed(3)},${near.lng.toFixed(3)}` : "";
  const prov = (providers ?? []).sort().join("+");
  const p = page && page > 1 ? `|p${page}` : "";
  return `${q}|${loc}|${prov}${p}`;
}

/** Get cached search results. Returns null on miss or expiry. */
export function getCachedSearch(key: string): PlaceCard[] | null {
  const hit = cache.get(key);
  if (hit) {
    if (Date.now() - hit.ts > TTL_MS) {
      cache.delete(key);
    } else {
      return hit.cards;
    }
  }
  // File fallback (probe cache)
  const fp = filePath(key);
  if (fp && existsSync(fp)) {
    try {
      const raw = JSON.parse(readFileSync(fp, "utf8")) as CacheEntry;
      if (Date.now() - raw.ts <= FILE_TTL_MS) {
        cache.set(key, raw); // promote to memory
        return raw.cards;
      }
      rmSync(fp, { force: true });
    } catch {
      /* corrupt file, ignore */
    }
  }
  return null;
}

/** Store search results in cache. */
export function setCachedSearch(key: string, cards: PlaceCard[]): void {
  if (cache.size >= MAX_SIZE) {
    const oldest = cache.keys().next().value;
    if (oldest != null) cache.delete(oldest);
  }
  const entry = { cards, ts: Date.now() };
  cache.set(key, entry);
  // Persist to file (probe cache)
  const fp = filePath(key);
  if (fp) {
    try {
      mkdirSync(probeCacheDir()!, { recursive: true });
      writeFileSync(fp, JSON.stringify(entry));
    } catch {
      /* disk write failure is non-fatal */
    }
  }
}

/** Clear cache (for tests). */
export function clearSearchCache(): void {
  cache.clear();
}

/** Cache size (for tests). */
export function searchCacheSize(): number {
  return cache.size;
}
