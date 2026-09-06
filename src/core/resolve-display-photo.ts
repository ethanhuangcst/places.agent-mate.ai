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

/** True when the URL can be used as <img src> without embedding an API key. */
export function isDisplayablePhotoUrl(url: unknown): url is string {
  if (typeof url !== "string" || !url.startsWith("https://")) return false;
  if (/[?&](?:api_)?key=/i.test(url) || /[?&]token=/i.test(url)) return false;
  if (/places\.googleapis\.com\/v1\/.+\/media/i.test(url)) return false;
  if (/skipHttpRedirect=true/i.test(url)) return false;
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

function googlePhotoNames(card: PlaceCard): string[] {
  const named = card.google_photo_names;
  if (Array.isArray(named) && named.length) {
    return named.filter((n): n is string => typeof n === "string" && n.length > 0).slice(0, 3);
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
    const nativeId = googleNativeId(card);
    if (nativeId && process.env.GOOGLE_PHOTOS_ENABLED !== "false") {
      try {
        const detailed = await deps.getDetails(nativeId);
        if (detailed) {
          const fromDetails = firstDisplayable(detailed.photos);
          if (fromDetails) {
            resolved = fromDetails;
          } else {
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
