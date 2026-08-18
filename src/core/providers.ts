export const PROVIDER_IDS = ["AMAP", "GOOGLE_MAPS", "TRIPADVISOR"] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export type Skip = { provider: string; reason_key: string };

export function isProviderId(value: string): value is ProviderId {
  return (PROVIDER_IDS as readonly string[]).includes(value);
}

export function configuredProviders(): Set<ProviderId> {
  const live = process.env.PLACES_VENDOR_MODE === "live";
  const set = new Set<ProviderId>();
  if (!live) {
    set.add("GOOGLE_MAPS");
    set.add("AMAP");
    set.add("TRIPADVISOR");
    return set;
  }
  if (process.env.AMAP_API_KEY) set.add("AMAP");
  if (process.env.GOOGLE_MAPS_API_KEY || process.env.GMAPS_MCP_BEARER) {
    set.add("GOOGLE_MAPS");
  }
  if (process.env.TRIPADVISOR_API_KEY) set.add("TRIPADVISOR");
  return set;
}

const CAPABILITY: Record<
  ProviderId,
  { search: boolean; details: boolean; geocode: boolean; navigate: boolean }
> = {
  AMAP: { search: true, details: true, geocode: true, navigate: true },
  GOOGLE_MAPS: { search: true, details: true, geocode: true, navigate: true },
  TRIPADVISOR: { search: false, details: false, geocode: false, navigate: false },
};

export type Capability = keyof (typeof CAPABILITY)["AMAP"];

export function validateProviders(
  requested: string[] | undefined,
  capability: Capability,
): { providers: ProviderId[]; skipped: Skip[] } {
  const configured = configuredProviders();
  const list = requested?.length ? requested : ["GOOGLE_MAPS"];
  const providers: ProviderId[] = [];
  const skipped: Skip[] = [];
  for (const raw of list) {
    if (!isProviderId(raw)) {
      skipped.push({ provider: raw, reason_key: "errors.capability_unsupported" });
      continue;
    }
    if (!configured.has(raw)) {
      skipped.push({ provider: raw, reason_key: "errors.provider_unconfigured" });
      continue;
    }
    if (!CAPABILITY[raw][capability]) {
      skipped.push({ provider: raw, reason_key: "errors.capability_unsupported" });
      continue;
    }
    providers.push(raw);
  }
  return { providers, skipped };
}
