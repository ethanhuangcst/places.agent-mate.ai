/**
 * Shared trip dual-write helpers for MCP/HTTP tool envelopes (ADR-046 P0).
 */

import {
  applyTripWrite,
  slimCandidatesForStore,
} from "./trip-store";
import { TripStoreError, type TripPatch, type TripWriteResult } from "./trip-types";

export type TripMeta = {
  trip_id: string;
  revision: number;
  patch?: TripPatch;
};

export function tripMetaFromWrite(written: TripWriteResult): TripMeta {
  return {
    trip_id: written.trip_id,
    revision: written.revision,
    patch: written.patch,
  };
}

export async function dualWriteTrip(opts: {
  callerKey: string;
  tripId?: string;
  expectedRevision?: number;
  locale?: string;
  patch: TripPatch;
}): Promise<TripMeta> {
  const written = await applyTripWrite(opts);
  return tripMetaFromWrite(written);
}

export async function dualWriteTripIfPresent(opts: {
  callerKey: string;
  tripId?: string;
  expectedRevision?: number;
  locale?: string;
  patch: TripPatch;
}): Promise<TripMeta | undefined> {
  if (!opts.tripId) return undefined;
  return dualWriteTrip(opts);
}

export { slimCandidatesForStore, TripStoreError };
