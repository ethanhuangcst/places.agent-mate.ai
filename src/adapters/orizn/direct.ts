import { type OriznAdapterConfig } from "./config";
import {
  OriznQuotaError,
  type VisaAdapter,
  type VisaAdapterInput,
  type VisaRequirementData,
} from "./types";
import { mapOriznVisaPayload } from "./mapper";

export type FetchFn = typeof fetch;

type CacheEntry = { expiresAt: number; data: VisaRequirementData };

const cache = new Map<string, CacheEntry>();

export function resetOriznDirectCacheForTests(): void {
  cache.clear();
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
    throw new Error(`orizn_egress:${msg}`);
  } finally {
    clearTimeout(timer);
  }
}

function cacheKey(input: VisaAdapterInput): string {
  return `${input.passport}:${input.destination}:${input.lang}`;
}

export function createOriznDirectClient(
  config: OriznAdapterConfig,
  fetchFn: FetchFn = fetch,
): VisaAdapter {
  const ttlMs = config.cacheTtlHours * 3_600_000;

  return {
    async fetchRequirement(input: VisaAdapterInput): Promise<VisaRequirementData> {
      const key = cacheKey(input);
      const hit = cache.get(key);
      if (hit && hit.expiresAt > Date.now()) {
        return hit.data;
      }

      if (!config.apiKey) {
        throw new Error("orizn_unconfigured");
      }

      const qs = new URLSearchParams({
        passport: input.passport,
        destination: input.destination,
        lang: input.lang,
      });
      const url = `${config.baseUrl}/visa?${qs.toString()}`;
      const res = await fetchWithTimeout(
        fetchFn,
        url,
        { headers: { "x-api-key": config.apiKey } },
        config.requestTimeoutMs,
      );

      if (res.status === 403 || res.status === 429) {
        throw new OriznQuotaError();
      }
      if (!res.ok) {
        throw new Error(`orizn_http_${res.status}`);
      }

      const json = (await res.json()) as { data?: Record<string, unknown> };
      const data = mapOriznVisaPayload(input.passport, input.destination, json.data ?? {});
      cache.set(key, { expiresAt: Date.now() + ttlMs, data });
      return data;
    },
  };
}
