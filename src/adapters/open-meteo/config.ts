export type OpenMeteoAdapterConfig = {
  apiKey: string | undefined;
  baseUrl: string;
  requestTimeoutMs: number;
};

export function loadOpenMeteoAdapterConfig(
  env: NodeJS.ProcessEnv = process.env,
): OpenMeteoAdapterConfig {
  const base = env.OPEN_METEO_BASE_URL?.trim() || "https://api.open-meteo.com/v1";
  return {
    apiKey: env.OPEN_METEO_API_KEY?.trim() || undefined,
    baseUrl: base.replace(/\/+$/, ""),
    requestTimeoutMs: 25_000,
  };
}
