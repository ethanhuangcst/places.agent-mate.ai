/**
 * ADR-051 — resolve browser-displayable photo URLs for PlaceCards.
 * Keys stay on the agent; Trip photos[] must be public https (no media+key).
 */

import { loadGoogleAdapterConfig } from "../adapters/google/config";
import type { PlaceCard } from "./types";

const DEFAULT_CONCURRENCY = 4;

export type ResolveDisplayPhotoDeps = {
  fetchFn?: typeof fetch;
  googleApiKey?: string;
  placesBaseUrl?: string;
  /** When set, overrides media fetch for a Google photo resource name. */
  resolveGooglePhotoName?: (photoName: string) => Promise<string | null>;
  getDetails?: (nativeId: string) => Promise<PlaceCard | null>;
  fetchTripadvisorPhoto?: (card: PlaceCard) => Promise<string | null>;
  concurrency?: number;
};

/**
 * AMAP search often returns `http://store.is.autonavi.com/...` (and siblings).
 * Mixed-content + ADR-051 https gate would drop them — upgrade known CDN hosts only.
 */
export function upgradeAmapInsecurePhotoUrl(url: string): string {
  if (!url.startsWith("http://")) return url;
  try {
    const u = new URL(url);
    if (/(^|\.)(autonavi\.com|amap\.com)$/i.test(u.hostname)) {
      u.protocol = "https:";
      return u.toString();
    }
  } catch {
    /* keep original */
  }
  return url;
}

/** RFC 2606 reserved names — POC placeholders must not become list thumbs. */
function isPlaceholderPhotoHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return (
    h === "example.com" ||
    h.endsWith(".example.com") ||
    h === "example.org" ||
    h.endsWith(".example.org") ||
    h === "example.net" ||
    h.endsWith(".example.net")
  );
}

/** True when the URL can be used as <img src> without embedding an API key. */
export function isDisplayablePhotoUrl(url: unknown): url is string {
  if (typeof url !== "string" || !url.startsWith("https://")) return false;
  if (/[?&](?:api_)?key=/i.test(url) || /[?&]token=/i.test(url)) return false;
  if (/places\.googleapis\.com\/v1\/.+\/media/i.test(url)) return false;
  if (/skipHttpRedirect=true/i.test(url)) return false;
  try {
    if (isPlaceholderPhotoHost(new URL(url).hostname)) return false;
  } catch {
    return false;
  }
  return true;
}

function firstDisplayable(photos: unknown): string | undefined {
  if (!Array.isArray(photos)) return undefined;
  for (const p of photos) {
    if (typeof p !== "string") continue;
    const candidate = upgradeAmapInsecurePhotoUrl(p);
    if (isDisplayablePhotoUrl(candidate)) return candidate;
  }
  return undefined;
}

/** Exported for slim/registry paths that must keep AMAP http→https thumbs (ADR-051). */
export function pickDisplayablePhotoUrl(photos: unknown): string | undefined {
  return firstDisplayable(photos);
}

function nameOverlapsQuery(query: string, name: string | undefined): boolean {
  const q = query.trim();
  const n = (name ?? "").trim();
  if (!q || !n) return false;
  return n.includes(q) || q.includes(n);
}

/**
 * AMAP tip/inputtips ids often 404 on Place Detail (pois:[]).
 * Copy a displayable photo from same-provider name search without changing identity (ADR-072).
 */
export function pickDisplayablePhotoFromNameSearch(
  query: string,
  cards: Array<{ name?: string; photos?: unknown }>,
): string | undefined {
  const q = query.trim();
  if (!q || !cards.length) return undefined;
  const ranked = cards
    .filter((c) => nameOverlapsQuery(q, c.name))
    .sort((a, b) => {
      const ap = pickDisplayablePhotoUrl(a.photos) ? 1 : 0;
      const bp = pickDisplayablePhotoUrl(b.photos) ? 1 : 0;
      if (bp !== ap) return bp - ap;
      const an = (a.name ?? "").trim() === q ? 1 : 0;
      const bn = (b.name ?? "").trim() === q ? 1 : 0;
      return bn - an;
    });
  for (const c of ranked) {
    const url = pickDisplayablePhotoUrl(c.photos);
    if (url) return url;
  }
  return undefined;
}

function googlePhotoNames(card: PlaceCard): string[] {
  const named = card.google_photo_names;
  if (Array.isArray(named) && named.length) {
    return named.filter((n): n is string => typeof n === "string" && n.length > 0).slice(0, 3);
  }
  // Some adapters leave Places media resource paths in photos[] before resolve.
  if (Array.isArray(card.photos)) {
    const fromPhotos = card.photos
      .filter((p): p is string => typeof p === "string")
      .map((p) => {
        const m = p.match(/places\/[^/]+\/photos\/[^/?]+/i);
        return m?.[0];
      })
      .filter((n): n is string => Boolean(n));
    if (fromPhotos.length) return fromPhotos.slice(0, 3);
  }
  return [];
}

function googleNativeId(card: PlaceCard): string | undefined {
  const src = card.sources?.find((s) => s.provider === "GOOGLE_MAPS" && s.native_id);
  return src?.native_id;
}

async function fetchGooglePhotoUri(
  photoName: string,
  deps: ResolveDisplayPhotoDeps,
): Promise<string | null> {
  if (process.env.GOOGLE_PHOTOS_ENABLED === "false") return null;
  if (deps.resolveGooglePhotoName) {
    return deps.resolveGooglePhotoName(photoName);
  }
  const apiKey = deps.googleApiKey ?? loadGoogleAdapterConfig().apiKey;
  if (!apiKey) return null;
  const base =
    (deps.placesBaseUrl ?? loadGoogleAdapterConfig().placesBaseUrl).replace(/\/$/, "") ||
    "https://places.googleapis.com/v1";
  const name = photoName.startsWith("places/") ? photoName : `places/${photoName}`;
  const url = `${base}/${name}/media?maxWidthPx=800&skipHttpRedirect=true&key=${encodeURIComponent(apiKey)}`;
  const fetchFn = deps.fetchFn ?? fetch;
  try {
    const res = await fetchFn(url, { method: "GET" });
    if (!res.ok) return null;
    const json = (await res.json()) as { photoUri?: string };
    return isDisplayablePhotoUrl(json.photoUri) ? json.photoUri : null;
  } catch {
    return null;
  }
}

async function resolveFromGoogleNames(
  names: string[],
  deps: ResolveDisplayPhotoDeps,
): Promise<string | null> {
  if (process.env.GOOGLE_PHOTOS_ENABLED === "false") return null;
  for (const name of names) {
    const uri = await fetchGooglePhotoUri(name, deps);
    if (uri) return uri;
  }
  return null;
}

/**
 * Resolve at most one displayable https photo onto the card.
 * Never writes keyed Google media URLs. Strips google_photo_names after success/attempt.
 */
export async function resolveDisplayPhoto(
  card: PlaceCard,
  deps: ResolveDisplayPhotoDeps = {},
): Promise<PlaceCard> {
  const existing = firstDisplayable(card.photos);
  if (existing) {
    const { google_photo_names: _drop, ...rest } = card;
    return { ...rest, photos: [existing] };
  }

  let resolved: string | null = null;

  const names = googlePhotoNames(card);
  if (names.length) {
    resolved = await resolveFromGoogleNames(names, deps);
  }

  if (!resolved && deps.getDetails) {
    const googleId = googleNativeId(card);
    const anyId =
      googleId ??
      card.sources?.find((s) => typeof s.native_id === "string" && s.native_id.trim())?.native_id?.trim();
    const allowGoogle = process.env.GOOGLE_PHOTOS_ENABLED !== "false";
    if (anyId && (!googleId || allowGoogle)) {
      try {
        const detailed = await deps.getDetails(anyId);
        if (detailed) {
          const fromDetails = firstDisplayable(detailed.photos);
          if (fromDetails) {
            resolved = fromDetails;
          } else if (googleId) {
            const detailNames = googlePhotoNames(detailed);
            if (detailNames.length) {
              resolved = await resolveFromGoogleNames(detailNames, deps);
            }
          }
        }
      } catch {
        /* single-card failure must not abort discover/fill */
      }
    }
  }

  if (!resolved && deps.fetchTripadvisorPhoto) {
    try {
      const ta = await deps.fetchTripadvisorPhoto(card);
      if (isDisplayablePhotoUrl(ta)) resolved = ta;
    } catch {
      /* ignore */
    }
  }

  const { google_photo_names: _drop, ...rest } = card;
  if (resolved) {
    return { ...rest, photos: [resolved] };
  }
  const next = { ...rest };
  delete next.photos;
  return next;
}

async function runPool<T>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let next = 0;
  const workers = Math.min(Math.max(1, limit), Math.max(1, items.length));
  await Promise.all(
    Array.from({ length: workers }, async () => {
      while (next < items.length) {
        const index = next;
        next += 1;
        await fn(items[index]!, index);
      }
    }),
  );
}

/** Resolve photos for many cards with a concurrency cap (default 4). */
export async function resolveDisplayPhotosForCards(
  cards: PlaceCard[],
  deps: ResolveDisplayPhotoDeps = {},
): Promise<PlaceCard[]> {
  if (!cards.length) return cards;
  const concurrency = deps.concurrency ?? DEFAULT_CONCURRENCY;
  const out: PlaceCard[] = new Array(cards.length);
  await runPool(cards, concurrency, async (card, index) => {
    try {
      out[index] = await resolveDisplayPhoto(card, deps);
    } catch {
      const { google_photo_names: _d, ...rest } = card;
      out[index] = rest;
    }
  });
  return out;
}
