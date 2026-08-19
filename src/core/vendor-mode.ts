/** True when adapters must call real vendors — never fixture fall-through (ADR-021). */
export function isLiveVendorMode(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.PLACES_VENDOR_MODE === "live";
}

/** Live Tripadvisor Terra enricher module is shipped. */
export function hasTripadvisorLiveEnrich(): boolean {
  return true;
}
