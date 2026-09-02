import { isLiveVendorMode } from "../../core/vendor-mode";

export type OriznAdapterConfig = {
  apiKey: string | undefined;
  baseUrl: string;
  cacheTtlHours: number;
  requestTimeoutMs: number;
};

export function loadOriznAdapterConfig(
  env: NodeJS.ProcessEnv = process.env,
): OriznAdapterConfig {
  const base = env.ORIZN_VISA_BASE_URL?.trim() || "https://visa.orizn.app/api/v1";
  const ttlRaw = env.ORIZN_CACHE_TTL_H?.trim();
  const cacheTtlHours = ttlRaw ? Number(ttlRaw) : 24;
  const apiKey = env.ORIZN_API_KEY?.trim() || undefined;
  return {
    apiKey: isLiveVendorMode(env) && !apiKey ? undefined : apiKey,
    baseUrl: base.replace(/\/+$/, ""),
    cacheTtlHours: Number.isFinite(cacheTtlHours) && cacheTtlHours > 0 ? cacheTtlHours : 24,
    requestTimeoutMs: 25_000,
  };
}
