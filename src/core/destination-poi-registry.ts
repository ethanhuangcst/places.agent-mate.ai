/**
 * F87 — cross-trip eligible attraction registry (ADR-049 D4–D6).
 * Not a source-city encyclopedia. Restaurants are never stored.
 */

import { isEligibleAttraction } from "./eligible-attraction";
import { getPlaceDetails } from "./tools";
import { type PlaceCard, type PlaceSource } from "./types";

export type DestinationAnchor = {
  city: string;
  provider?: string;
  placeId?: string | null;
  lat?: number;
  lng?: number;
};

export type AttractionPoiRow = {
  id: string;
  destinationId: string;
  provider: string;
  nativeId: string;
  name: string;
  aliases: string[];
  lat: number;
  lng: number;
  cardSlim: PlaceCard;
  details: Record<string, unknown> | null;
  detailsFetchedAt: Date | null;
};

export type PoiRegistryStore = {
  getOrCreateDestination(anchor: DestinationAnchor): Promise<{ id: string; lookupKey: string }>;
  upsertPoi(
    destinationId: string,
    card: PlaceCard,
    native: { provider: string; nativeId: string },
  ): Promise<{ id: string }>;
  listPois(destinationId: string): Promise<AttractionPoiRow[]>;
  getPoi?(poiId: string): Promise<AttractionPoiRow | null>;
  updatePoiDetails?(
    poiId: string,
    details: Record<string, unknown>,
    fetchedAt: Date,
  ): Promise<void>;
};

export const POI_DETAILS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const SLOT = { store: null as PoiRegistryStore | null };

export function setPoiRegistryStore(store: PoiRegistryStore | null): void {
  SLOT.store = store;
}

export function getPoiRegistryStore(): PoiRegistryStore {
  if (SLOT.store) return SLOT.store;
  if (process.env.VITEST) {
    SLOT.store = createMemoryPoiRegistryStore();
    return SLOT.store;
  }
  try {
    // Lazy: keep unit tests off Prisma.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { prisma } = require("../db/client") as { prisma: { destination?: unknown } };
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createPrismaPoiRegistryStore } = require("./destination-poi-registry-prisma") as {
      createPrismaPoiRegistryStore: (c: unknown) => PoiRegistryStore;
    };
    if (prisma?.destination) {
      SLOT.store = createPrismaPoiRegistryStore(prisma);
      return SLOT.store;
    }
  } catch {
    /* memory fallback */
  }
  SLOT.store = createMemoryPoiRegistryStore();
  return SLOT.store;
}

export function resetPoiRegistryStoreForTests(): void {
  SLOT.store = createMemoryPoiRegistryStore();
}

export function normalizeCityQuery(city: string): string {
  return city.normalize("NFKC").replace(/\s+/g, "").toLowerCase();
}

export function destinationLookupKey(anchor: DestinationAnchor): string {
  const provider = (anchor.provider ?? "GEO").trim() || "GEO";
  if (anchor.placeId?.trim()) return `${provider}:id:${anchor.placeId.trim()}`;
  const q = normalizeCityQuery(anchor.city);
  const lat = Number.isFinite(anchor.lat) ? Number(anchor.lat).toFixed(3) : "";
  const lng = Number.isFinite(anchor.lng) ? Number(anchor.lng).toFixed(3) : "";
  return `${provider}:q:${q}:${lat}:${lng}`;
}

export function registrableNative(card: PlaceCard): { provider: string; nativeId: string } | null {
  const hit = (card.sources ?? []).find(
    (s) => typeof s.native_id === "string" && s.native_id.trim().length > 0,
  );
  if (!hit) return null;
  return { provider: hit.provider, nativeId: hit.native_id.trim() };
}

export function canRegisterAttraction(card: PlaceCard): boolean {
  return isEligibleAttraction(card) && registrableNative(card) != null;
}

export function cardSlimFromPlace(card: PlaceCard): PlaceCard {
  const sources: PlaceSource[] = (card.sources ?? []).filter((s) => s.native_id?.trim());
  return {
    provider: card.provider,
    name: card.name,
    location: card.location,
    sources,
    ...(card.rating != null ? { rating: card.rating } : {}),
    ...(card.must_see != null ? { must_see: card.must_see } : {}),
  };
}

export function createMemoryPoiRegistryStore(): PoiRegistryStore {
  const destByKey = new Map<string, { id: string; lookupKey: string }>();
  const poisByDest = new Map<string, Map<string, AttractionPoiRow>>();
  let n = 0;
  const id = (p: string) => `${p}_${++n}`;

  return {
    async getOrCreateDestination(anchor) {
      const lookupKey = destinationLookupKey(anchor);
      const existing = destByKey.get(lookupKey);
      if (existing) return existing;
      const row = { id: id("dest"), lookupKey };
      destByKey.set(lookupKey, row);
      poisByDest.set(row.id, new Map());
      return row;
    },
    async upsertPoi(destinationId, card, native) {
      const bag = poisByDest.get(destinationId) ?? new Map();
      poisByDest.set(destinationId, bag);
      const uniq = `${native.provider}:${native.nativeId}`;
      const prev = bag.get(uniq);
      const row: AttractionPoiRow = {
        id: prev?.id ?? id("poi"),
        destinationId,
        provider: native.provider,
        nativeId: native.nativeId,
        name: card.name,
        aliases: prev && prev.name !== card.name ? [...new Set([...prev.aliases, prev.name])] : (prev?.aliases ?? []),
        lat: card.location.lat,
        lng: card.location.lng,
        cardSlim: cardSlimFromPlace(card),
        details: prev?.details ?? null,
        detailsFetchedAt: prev?.detailsFetchedAt ?? null,
      };
      bag.set(uniq, row);
      return { id: row.id };
    },
    async listPois(destinationId) {
      return [...(poisByDest.get(destinationId)?.values() ?? [])];
    },
    async getPoi(poiId) {
      for (const bag of poisByDest.values()) {
        for (const row of bag.values()) {
          if (row.id === poiId) return row;
        }
      }
      return null;
    },
    async updatePoiDetails(poiId, details, fetchedAt) {
      for (const bag of poisByDest.values()) {
        for (const row of bag.values()) {
          if (row.id === poiId) {
            row.details = details;
            row.detailsFetchedAt = fetchedAt;
            return;
          }
        }
      }
    },
  };
}

export async function safeUpsertEligiblePois(
  cards: PlaceCard[],
  anchor: DestinationAnchor,
  store: PoiRegistryStore = getPoiRegistryStore(),
): Promise<{ destinationId: string; poiIds: string[] }> {
  try {
    return await upsertEligiblePois(cards, anchor, store);
  } catch {
    return { destinationId: "", poiIds: [] };
  }
}

export async function upsertEligiblePois(
  cards: PlaceCard[],
  anchor: DestinationAnchor,
  store: PoiRegistryStore = getPoiRegistryStore(),
): Promise<{ destinationId: string; poiIds: string[] }> {
  const dest = await store.getOrCreateDestination(anchor);
  const poiIds: string[] = [];
  for (const card of cards) {
    const native = registrableNative(card);
    if (!native || !canRegisterAttraction(card)) continue;
    const { id } = await store.upsertPoi(dest.id, card, native);
    poiIds.push(id);
  }
  return { destinationId: dest.id, poiIds };
}

export async function listPoisForDestination(
  anchor: DestinationAnchor,
  store: PoiRegistryStore = getPoiRegistryStore(),
): Promise<PlaceCard[]> {
  const dest = await store.getOrCreateDestination(anchor);
  const rows = await store.listPois(dest.id);
  return rows.map((r) => r.cardSlim);
}

export function mergeRegistryPlaces(existing: PlaceCard[], registered: PlaceCard[]): PlaceCard[] {
  const seen = new Set(existing.map((p) => p.name.normalize("NFKC").replace(/\s+/g, "").toLowerCase()));
  const out = [...existing];
  for (const card of registered) {
    const k = card.name.normalize("NFKC").replace(/\s+/g, "").toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(card);
  }
  return out;
}

export type DetailsFetchFn = (
  provider: string,
  nativeId: string,
) => Promise<Record<string, unknown> | null>;

async function defaultGetDetails(
  provider: string,
  nativeId: string,
): Promise<Record<string, unknown> | null> {
  const res = await getPlaceDetails({ provider, native_id: nativeId });
  const card = res.data;
  if (!card) return null;
  return {
    phone: card.phone,
    hours: card.hours,
    photos: card.photos,
    name: card.name,
  };
}

export async function schedulePoiDetailsRefresh(
  poiIds: string[],
  opts?: {
    store?: PoiRegistryStore;
    getDetails?: DetailsFetchFn;
    now?: Date;
    ttlMs?: number;
    enqueue?: (work: () => Promise<void>) => void;
  },
): Promise<{ scheduled: number }> {
  const store = opts?.store ?? getPoiRegistryStore();
  const ttl = opts?.ttlMs ?? POI_DETAILS_TTL_MS;
  const now = opts?.now ?? new Date();
  const due = await poiIdsDueForDetails(poiIds, store, now, ttl);
  if (!due.length) return { scheduled: 0 };
  const fetchDetails = opts?.getDetails ?? defaultGetDetails;
  const enqueue =
    opts?.enqueue ??
    ((work) => {
      setImmediate(() => {
        void work();
      });
    });
  enqueue(async () => {
    for (const id of due) {
      const row = store.getPoi ? await store.getPoi(id) : null;
      if (!row || !store.updatePoiDetails) continue;
      try {
        const details = await fetchDetails(row.provider, row.nativeId);
        if (details) await store.updatePoiDetails(id, details, now);
      } catch {
        /* L1 miss is not dirty pool */
      }
    }
  });
  return { scheduled: due.length };
}

/** Count how many ids would refresh (sync predicate for tests). */
export async function poiIdsDueForDetails(
  poiIds: string[],
  store: PoiRegistryStore,
  now = new Date(),
  ttlMs = POI_DETAILS_TTL_MS,
): Promise<string[]> {
  const due: string[] = [];
  for (const id of poiIds) {
    const row = store.getPoi ? await store.getPoi(id) : null;
    if (!row) continue;
    if (row.detailsFetchedAt && now.getTime() - row.detailsFetchedAt.getTime() < ttlMs) continue;
    due.push(id);
  }
  return due;
}
