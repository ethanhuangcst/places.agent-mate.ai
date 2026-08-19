import { type PlaceCard } from "../../core/types";
import { type TripadvisorAdapterConfig } from "./config";
import { attachTripadvisorEnrichment } from "./fixture";
import {
  flattenTerraNames,
  terraLocationId,
  terraLocationToEnrichment,
  type TerraLocation,
  type TerraNearbyItem,
} from "./card-mapper";
import { NAME_MATCH_MIN, nameMatchScore, pinKey } from "./match";

export type FetchFn = typeof fetch;

const NEARBY_CONCURRENCY = 3;

function formatCoord(n: number): string {
  return String(Number(n.toFixed(6)));
}

async function runPool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const workers = Math.min(Math.max(1, limit), items.length);
  await Promise.all(
    Array.from({ length: workers }, async () => {
      while (next < items.length) {
        const index = next;
        next += 1;
        await fn(items[index]!);
      }
    }),
  );
}

async function fetchWithTimeout(
  fetchFn: FetchFn,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchFn(url, { ...init, signal: controller.signal });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`tripadvisor_egress:${msg}`);
  } finally {
    clearTimeout(timer);
  }
}

function pickLocation(cardName: string, items: TerraNearbyItem[]): TerraLocation | null {
  let best: { score: number; dist: number; loc: TerraLocation } | null = null;
  for (const item of items) {
    const loc = item.location;
    if (!loc) continue;
    const names = flattenTerraNames(loc.names);
    const score = Math.max(0, ...names.map((n) => nameMatchScore(cardName, n)));
    if (score < NAME_MATCH_MIN) continue;
    const dist = item.distance_kilometers ?? Number.POSITIVE_INFINITY;
    if (!best || score > best.score || (score === best.score && dist < best.dist)) {
      best = { score, dist, loc };
    }
  }
  return best?.loc ?? null;
}

export type TripadvisorLiveClient = {
  enrichCards(cards: PlaceCard[]): Promise<{
    cards: PlaceCard[];
    skipped: { provider: string; reason_key: string }[];
  }>;
};

export function createTripadvisorDirectClient(
  config: TripadvisorAdapterConfig,
  fetchFn: FetchFn = fetch,
): TripadvisorLiveClient {
  function headers(): HeadersInit {
    if (!config.apiKey) throw new Error("tripadvisor_no_api_key");
    return { "X-API-Key": config.apiKey, Accept: "application/json" };
  }

  async function getJson(pathAndQuery: string): Promise<unknown> {
    const url = `${config.baseUrl}${pathAndQuery}`;
    const res = await fetchWithTimeout(
      fetchFn,
      url,
      { headers: headers() },
      config.requestTimeoutMs,
    );
    if (!res.ok) throw new Error(`tripadvisor_http_${res.status}`);
    return res.json();
  }

  async function nearby(lat: number, lng: number): Promise<TerraNearbyItem[]> {
    const qs = new URLSearchParams({
      lat: formatCoord(lat),
      lon: formatCoord(lng),
      radius: "1",
      unit: "KM",
    });
    const json = (await getJson(`/locations/nearby?${qs.toString()}`)) as {
      data?: TerraNearbyItem[];
    };
    return Array.isArray(json.data) ? json.data : [];
  }

  async function details(id: string): Promise<TerraLocation> {
    return (await getJson(`/locations/${encodeURIComponent(id)}`)) as TerraLocation;
  }

  return {
    async enrichCards(cards: PlaceCard[]) {
      const groups = new Map<string, PlaceCard[]>();
      for (const card of cards) {
        const key = pinKey(card.location.lat, card.location.lng);
        const list = groups.get(key) ?? [];
        list.push(card);
        groups.set(key, list);
      }

      const nearbyByPin = new Map<string, TerraNearbyItem[]>();
      let nearbyFailed = false;
      await runPool(Array.from(groups.entries()), NEARBY_CONCURRENCY, async ([key, group]) => {
        const anchor = group[0]!;
        try {
          nearbyByPin.set(key, await nearby(anchor.location.lat, anchor.location.lng));
        } catch {
          nearbyFailed = true;
          nearbyByPin.set(key, []);
        }
      });

      const detailsCache = new Map<string, TerraLocation>();
      const out: PlaceCard[] = [];
      for (const card of cards) {
        const items = nearbyByPin.get(pinKey(card.location.lat, card.location.lng)) ?? [];
        const loc = pickLocation(card.name, items);
        if (!loc) {
          out.push(card);
          continue;
        }
        let enrich = terraLocationToEnrichment(loc);
        const id = terraLocationId(loc);
        if (!enrich && id) {
          try {
            let detailed = detailsCache.get(id);
            if (!detailed) {
              detailed = await details(id);
              detailsCache.set(id, detailed);
            }
            enrich = terraLocationToEnrichment(detailed);
          } catch {
            nearbyFailed = true;
          }
        }
        out.push(enrich ? attachTripadvisorEnrichment(card, enrich) : card);
      }
      return {
        cards: out,
        skipped: nearbyFailed
          ? [{ provider: "TRIPADVISOR", reason_key: "errors.provider_failed" }]
          : [],
      };
    },
  };
}
