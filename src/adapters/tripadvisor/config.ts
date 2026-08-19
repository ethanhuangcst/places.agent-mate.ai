export type TripadvisorAdapterConfig = {
  apiKey: string | undefined;
  baseUrl: string;
  requestTimeoutMs: number;
};

export function loadTripadvisorAdapterConfig(
  env: NodeJS.ProcessEnv = process.env,
): TripadvisorAdapterConfig {
  const base = env.TRIPADVISOR_BASE_URL?.trim() || "https://terra.tripadvisor.com/api";
  return {
    apiKey: env.TRIPADVISOR_API_KEY?.trim() || undefined,
    baseUrl: base.replace(/\/+$/, ""),
    requestTimeoutMs: 25_000,
  };
}
