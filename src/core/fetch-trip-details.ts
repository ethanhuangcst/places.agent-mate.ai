/**
 * ADR-046 / MVP-16 F64 — read trip slices by trip_id + fields[].
 */

import { getTripOrThrow, pickTripFields } from "./trip-store";
import type { FetchTripFields } from "./trip-types";

export type FetchTripDetailsInput = {
  callerKey: string;
  trip_id: string;
  fields: FetchTripFields;
  day_index?: number;
};

export type FetchTripDetailsResult = {
  trip_id: string;
  revision: number;
  data: Record<string, unknown>;
};

export async function fetchTripDetails(
  input: FetchTripDetailsInput,
): Promise<FetchTripDetailsResult> {
  const doc = await getTripOrThrow(input.callerKey, input.trip_id);
  const fields = input.fields.length ? input.fields : ["skeleton"];
  return {
    trip_id: doc.id,
    revision: doc.revision,
    data: pickTripFields(doc, fields, input.day_index),
  };
}

export const FETCH_TRIP_HOST_INSTRUCTIONS_ON_MISS =
  "Do not invent itinerary content. Tell the traveler the trip could not be loaded (trip_not_found). " +
  "They may restart discover_places / make_itinerary to obtain a new trip_id.";
