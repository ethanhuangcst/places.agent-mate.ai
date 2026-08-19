export type AmapAdapterConfig = {
  apiKey: string | undefined;
  baseUrl: string;
  requestTimeoutMs: number;
};

export function loadAmapAdapterConfig(
  env: NodeJS.ProcessEnv = process.env,
): AmapAdapterConfig {
  const base = env.AMAP_BASE_URL?.trim() || "https://restapi.amap.com";
  return {
    apiKey: env.AMAP_API_KEY?.trim() || undefined,
    baseUrl: base.replace(/\/+$/, ""),
    requestTimeoutMs: 25_000,
  };
}
