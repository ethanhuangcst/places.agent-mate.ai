export type GoogleAdapterConfig = {
  apiKey: string | undefined;
  placesBaseUrl: string;
  geocodeBaseUrl: string;
  mcpUrl: string | undefined;
  mcpBearer: string | undefined;
  directForceFail: boolean;
  requestTimeoutMs: number;
};

function truthyEnv(name: string, env: NodeJS.ProcessEnv = process.env): boolean {
  const v = env[name];
  return v === "1" || v === "true" || v === "yes";
}

export function loadGoogleAdapterConfig(
  env: NodeJS.ProcessEnv = process.env,
): GoogleAdapterConfig {
  return {
    apiKey: env.GOOGLE_MAPS_API_KEY?.trim() || undefined,
    placesBaseUrl:
      env.GOOGLE_PLACES_BASE_URL?.trim() || "https://places.googleapis.com/v1",
    geocodeBaseUrl:
      env.GOOGLE_MAPS_BASE_URL?.trim() || "https://maps.googleapis.com",
    mcpUrl: env.GMAPS_MCP_URL?.trim() || undefined,
    mcpBearer: env.GMAPS_MCP_BEARER?.trim() || undefined,
    directForceFail: truthyEnv("GOOGLE_DIRECT_FORCE_FAIL", env),
    requestTimeoutMs: 25_000,
  };
}

export function hasDirectGoogle(config: GoogleAdapterConfig): boolean {
  return Boolean(config.apiKey) && !config.directForceFail;
}

export function hasWorkerMcp(config: GoogleAdapterConfig): boolean {
  return Boolean(config.mcpUrl && config.mcpBearer);
}

/** Fail fast in production if dev-only test flags or bad base URLs are set. */
export function assertGoogleProductionSafety(
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (env.NODE_ENV !== "production") return;

  if (truthyEnv("GOOGLE_DIRECT_FORCE_FAIL", env)) {
    throw new Error("GOOGLE_DIRECT_FORCE_FAIL is not allowed in production");
  }

  const mapsBase = env.GOOGLE_MAPS_BASE_URL?.trim();
  if (mapsBase && !mapsBase.includes("maps.googleapis.com")) {
    throw new Error("GOOGLE_MAPS_BASE_URL must point at maps.googleapis.com in production");
  }

  const placesBase = env.GOOGLE_PLACES_BASE_URL?.trim();
  if (placesBase && !placesBase.includes("places.googleapis.com")) {
    throw new Error("GOOGLE_PLACES_BASE_URL must point at places.googleapis.com in production");
  }
}
