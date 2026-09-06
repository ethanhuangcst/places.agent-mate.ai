/**
 * Directions provider list (ADR-052 D7).
 * Caller-explicit providers[] win; otherwise resolveProviderStrategy.
 * When AMAP is already in the list and locale is CN/HK/TW, try AMAP first.
 */

import { resolveProviderStrategy } from "../adapters/provider-resolver";
import { type ProviderId } from "./providers";
import { parseLocale, type Locale } from "./locales";

export type DirectionProviderInput = {
  providers?: string[];
  location?: string;
  near?: { lat: number; lng: number };
  locale?: string | Locale;
};

function orderForDirections(
  providers: ProviderId[],
  locale?: string | Locale,
): ProviderId[] {
  const loc = locale ? parseLocale(locale) : undefined;
  const preferAmap = loc === "CN" || loc === "HK" || loc === "TW";
  if (preferAmap && providers.includes("AMAP") && providers[0] !== "AMAP") {
    return ["AMAP", ...providers.filter((p) => p !== "AMAP")];
  }
  return [...providers];
}

export async function resolvedDirectionProviders(
  input: DirectionProviderInput,
): Promise<ProviderId[]> {
  if (input.providers?.length) {
    return orderForDirections(input.providers as ProviderId[], input.locale);
  }
  const strategy = await resolveProviderStrategy({
    location: input.location,
    near: input.near,
    locale: input.locale,
  });
  return orderForDirections(strategy.searchProviders, input.locale);
}
