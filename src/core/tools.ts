import { validateProviders, type Capability } from "./providers";
import { getAdapter } from "../adapters";
import { isDiningCategory } from "../adapters/fixtures";
import { enrichWithTripadvisor } from "./enrich";
import { resolveProviderStrategy, type GeocodeFn } from "../adapters/provider-resolver";
import { parseLocale, type Locale } from "./locales";
import {
  type PlaceCard,
  type SearchInput,
  type ToolResult,
} from "./types";

import { cachedGeocode } from "./geocode-cache";
import { searchCacheKey, getCachedSearch, setCachedSearch } from "./search-cache";

/**
 * Build a geocode function from the Google live adapter, wrapped with cache.
 * Same address within 10min returns instantly without API call.
 */
function buildGeocodeFn(): GeocodeFn {
  return cachedGeocode(async (query: string) => {
    try {
      const { getAdapter } = await import("../adapters");
      const adapter = getAdapter("GOOGLE_MAPS");
      if (!adapter?.geocode) return null;
      const result = await adapter.geocode(query);
      if (!result) return null;
      return { address: result.address, lat: result.lat, lng: result.lng };
    } catch {
      return null;
    }
  });
}

/** When caller omits providers[], auto-select based on destination + locale. */
async function applyProviderStrategy(input: SearchInput): Promise<SearchInput> {
  if (input.providers?.length) return input;
  const strategy = await resolveProviderStrategy(
    {
      // Chat tools often pass only `query`; Decide HTTP passes `address`.
      location: input.address ?? input.query,
      near: input.near ? { lat: input.near.lat, lng: input.near.lng } : undefined,
      locale: input.locale,
    },
    buildGeocodeFn(),
  );
  const updated = { ...input, providers: strategy.searchProviders };
  if (strategy.enrichProviders.includes("TRIPADVISOR") && !input.enrich?.tripadvisor) {
    return { ...updated, enrich: { ...updated.enrich, tripadvisor: true } };
  }
  return updated;
}

function localesFrom(input: { locale?: Locale; locales?: Locale[] }): {
  locale: Locale;
  pair: Locale[];
} {
  const pair = (input.locales ?? []).filter(Boolean) as Locale[];
  const locale = parseLocale(input.locale ?? pair[0]);
  return { locale, pair: pair.length ? pair : [locale] };
}

function mergeCards(cards: PlaceCard[]): PlaceCard[] {
  const byName = new Map<string, PlaceCard>();
  for (const card of cards) {
    const key = card.name.trim().toLowerCase();
    const existing = byName.get(key);
    if (!existing) {
      byName.set(key, { ...card, primary_provider: card.provider });
      continue;
    }
    existing.sources = [...existing.sources, ...card.sources];
    existing.primary_provider = existing.provider;
  }
  return [...byName.values()];
}

async function fanOut<T>(
  requested: string[] | undefined,
  capability: Capability,
  run: (id: ReturnType<typeof validateProviders>["providers"][number]) => Promise<T>,
): Promise<{ values: T[]; skipped: { provider: string; reason_key: string }[] }> {
  const { providers, skipped } = validateProviders(requested, capability);
  const runnable = providers.filter((id) => {
    if (!getAdapter(id)) {
      skipped.push({ provider: id, reason_key: "errors.capability_unsupported" });
      return false;
    }
    return true;
  });
  const settled = await Promise.allSettled(runnable.map((id) => run(id)));
  const values: T[] = [];
  settled.forEach((result, index) => {
    const id = runnable[index];
    if (result.status === "fulfilled") {
      values.push(result.value);
      return;
    }
    if (id) skipped.push({ provider: id, reason_key: "errors.provider_failed" });
  });
  return { values, skipped };
}

/** Drop dining-dominated results when the caller is searching for attractions/POIs. */
function filterPlaceSearchResults(cards: PlaceCard[], query?: string): PlaceCard[] {
  const nonDining = cards.filter((c) => !isDiningCategory(c.category));
  if (nonDining.length > 0) return nonDining;
  const q = (query ?? "").toLowerCase();
  const attractionHint =
    /museum|park|attraction|poi|gallery|temple|monument|sight/i.test(q);
  if (attractionHint) return [];
  return cards;
}

/**
 * When ADR-026 auto-selects AMAP-only and it returns no hits, try Google once.
 * Callers that explicitly pass providers[] are not retried (override stays absolute).
 * Restores fuzzy POI matching (e.g. 定位 vs 定味) that Google often handles better.
 */
export function shouldTryGoogleAfterEmptyAmap(opts: {
  callerForcedProviders: boolean;
  providers: string[] | undefined;
  cardCount: number;
}): boolean {
  return (
    !opts.callerForcedProviders &&
    opts.cardCount === 0 &&
    opts.providers?.length === 1 &&
    opts.providers[0] === "AMAP"
  );
}

export async function searchRestaurants(
  rawInput: SearchInput,
): Promise<ToolResult<PlaceCard[]>> {
  const callerForcedProviders = Boolean(rawInput.providers?.length);
  const input = await applyProviderStrategy(rawInput);
  const { locale, pair } = localesFrom(input);

  // Check search cache
  const cKey = searchCacheKey(input.query ?? "", input.near, input.providers);
  const cached = getCachedSearch(cKey);
  if (cached) {
    return { data: cached, skipped: [], locale, locales: pair };
  }
  const { values, skipped } = await fanOut(input.providers, "search", async (id) => {
    const adapter = getAdapter(id);
    if (!adapter) throw new Error("missing");
    return adapter.searchRestaurants(input);
  });
  let cards = values.flat();
  if (
    shouldTryGoogleAfterEmptyAmap({
      callerForcedProviders,
      providers: input.providers,
      cardCount: cards.length,
    })
  ) {
    const fallback = await fanOut(["GOOGLE_MAPS"], "search", async (id) => {
      const adapter = getAdapter(id);
      if (!adapter) throw new Error("missing");
      return adapter.searchRestaurants({ ...input, providers: ["GOOGLE_MAPS"] });
    });
    cards = fallback.values.flat();
    skipped.push(...fallback.skipped);
  }
  if (input.merge) cards = mergeCards(cards);
  if (input.enrich?.tripadvisor) {
    const enriched = await enrichWithTripadvisor(cards);
    cards = enriched.cards;
    skipped.push(...enriched.skipped);
  }
  if (cards.length > 0) setCachedSearch(cKey, cards);
  const outcomeKey = cards.length === 0 ? "errors.empty_results" : undefined;
  return { data: cards, skipped, locale, locales: pair, outcomeKey };
}

export async function searchPlaces(rawInput: SearchInput): Promise<ToolResult<PlaceCard[]>> {
  const callerForcedProviders = Boolean(rawInput.providers?.length);
  const input = await applyProviderStrategy(rawInput);
  const { locale, pair } = localesFrom(input);
  const { values, skipped } = await fanOut(input.providers, "search", async (id) => {
    const adapter = getAdapter(id);
    if (!adapter) throw new Error("missing");
    return adapter.searchPlaces(input);
  });
  let cards = values.flat();
  cards = filterPlaceSearchResults(cards, input.query);
  if (
    shouldTryGoogleAfterEmptyAmap({
      callerForcedProviders,
      providers: input.providers,
      cardCount: cards.length,
    })
  ) {
    const fallback = await fanOut(["GOOGLE_MAPS"], "search", async (id) => {
      const adapter = getAdapter(id);
      if (!adapter) throw new Error("missing");
      return adapter.searchPlaces({ ...input, providers: ["GOOGLE_MAPS"] });
    });
    cards = filterPlaceSearchResults(fallback.values.flat(), input.query);
    skipped.push(...fallback.skipped);
  }
  if (input.merge) cards = mergeCards(cards);
  if (input.enrich?.tripadvisor) {
    const enriched = await enrichWithTripadvisor(cards);
    cards = enriched.cards;
    skipped.push(...enriched.skipped);
  }
  const outcomeKey = cards.length === 0 ? "errors.empty_results" : undefined;
  return { data: cards, skipped, locale, locales: pair, outcomeKey };
}

export async function getPlaceDetails(input: {
  provider: string;
  native_id: string;
  locale?: Locale;
  locales?: Locale[];
  providers?: string[];
}): Promise<ToolResult<PlaceCard | null>> {
  const { locale, pair } = localesFrom(input);
  const { values, skipped } = await fanOut(
    input.providers ?? [input.provider],
    "details",
    async (id) => {
      const adapter = getAdapter(id);
      if (!adapter) throw new Error("missing");
      return adapter.getDetails(input.native_id);
    },
  );
  const card = values[0] ?? null;
  return {
    data: card,
    skipped,
    locale,
    locales: pair,
    outcomeKey: card ? undefined : "errors.place_not_found",
  };
}

export async function geocode(input: {
  query?: string;
  lat?: number;
  lng?: number;
  providers?: string[];
  locale?: Locale;
  locales?: Locale[];
}): Promise<
  ToolResult<{ lat: number; lng: number; crs: string; address?: string } | null>
> {
  const { locale, pair } = localesFrom(input);
  let providers = input.providers;
  if (!providers?.length) {
    const strategy = await resolveProviderStrategy(
      {
        location: input.query,
        near:
          input.lat != null && input.lng != null
            ? { lat: input.lat, lng: input.lng }
            : undefined,
        locale: input.locale,
      },
      buildGeocodeFn(),
    );
    providers = strategy.searchProviders;
  }
  const { values, skipped } = await fanOut(providers, "geocode", async (id) => {
    const adapter = getAdapter(id);
    if (!adapter) throw new Error("missing");
    if (input.query) return adapter.geocode(input.query);
    if (input.lat != null && input.lng != null) {
      const address = await adapter.reverseGeocode(input.lat, input.lng);
      return { lat: input.lat, lng: input.lng, crs: "WGS84", address };
    }
    throw new Error("missing_input");
  });
  return { data: values[0] ?? null, skipped, locale, locales: pair };
}

export async function navigate(input: {
  native_id?: string;
  name?: string;
  lat?: number;
  lng?: number;
  provider?: string;
  providers?: string[];
  locale?: Locale;
  locales?: Locale[];
}): Promise<ToolResult<Record<string, string>>> {
  const { locale, pair } = localesFrom(input);
  const { values, skipped } = await fanOut(
    input.providers ?? (input.provider ? [input.provider] : undefined),
    "navigate",
    async (id) => {
      const adapter = getAdapter(id);
      if (!adapter) throw new Error("missing");
      if (input.native_id) {
        const card = await adapter.getDetails(input.native_id);
        if (!card) throw new Error("not_found");
        return adapter.deeplinks(card);
      }
      const loc = {
        lat: input.lat ?? 0,
        lng: input.lng ?? 0,
        crs: "WGS84" as const,
      };
      return adapter.deeplinks({
        provider: id,
        name: input.name ?? "",
        location: loc,
        sources: [],
      });
    },
  );
  const links = Object.assign({}, ...values);
  const serialized = JSON.stringify(links);
  if (/key=|api[_-]?key/i.test(serialized)) {
    throw new Error("secret_in_deeplink");
  }
  return { data: links, skipped, locale, locales: pair };
}

export { mergeCards };
