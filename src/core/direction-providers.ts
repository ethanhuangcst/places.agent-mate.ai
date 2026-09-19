/**
 * Directions provider list (ADR-052 D7).
 * Caller-explicit providers[] win; otherwise resolveProviderStrategy.
 * When reordering an explicit list, prefer the destination region's primary
 * provider (from resolveProviderStrategy) — not UI locale.
 */

import { resolveProviderStrategy } from "../adapters/provider-resolver";
import { type ProviderId } from "./providers";
import { type Locale } from "./locales";

export type DirectionProviderInput = {
  providers?: string[];
  location?: string;
  near?: { lat: number; lng: number };
  locale?: string | Locale;
};

async function orderForDirections(
  providers: ProviderId[],
  input: DirectionProviderInput,
): Promise<ProviderId[]> {
  if (providers.length <= 1) return [...providers];

  const strategy = await resolveProviderStrategy({
    location: input.location,
    near: input.near,
    locale: input.locale,
  });
  const preferred = strategy.searchProviders[0];
  if (preferred && providers.includes(preferred) && providers[0] !== preferred) {
    return [preferred, ...providers.filter((p) => p !== preferred)];
  }
  return [...providers];
}

export async function resolvedDirectionProviders(
  input: DirectionProviderInput,
): Promise<ProviderId[]> {
  if (input.providers?.length) {
    return orderForDirections(input.providers as ProviderId[], input);
  }
  const strategy = await resolveProviderStrategy({
    location: input.location,
    near: input.near,
    locale: input.locale,
  });
  return orderForDirections(strategy.searchProviders, input);
}
