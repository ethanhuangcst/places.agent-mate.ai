/** ADR-046 / MVP-16 — Trip Store document + patch types. */

export const TRIP_FIELD_KEYS = [
  "constraints",
  "candidates",
  "skeleton",
  "cursor",
  "filled",
  "artifacts",
] as const;

export type TripFieldKey = (typeof TRIP_FIELD_KEYS)[number];

export type TripDocument = {
  id: string;
  revision: number;
  status: string;
  callerKey: string;
  locale: string | null;
  expiresAt: Date;
  constraints: unknown;
  candidates: unknown;
  skeleton: unknown;
  cursor: unknown;
  filled: unknown;
  artifacts: unknown;
  createdAt: Date;
  updatedAt: Date;
};

export type TripPatch = Partial<Pick<TripDocument, TripFieldKey | "locale" | "status">>;

export type TripWriteResult = {
  trip_id: string;
  revision: number;
  patch: TripPatch;
};

export type FetchTripFields = Array<TripFieldKey | "day" | string>;

export class TripStoreError extends Error {
  readonly key: "errors.trip_not_found" | "errors.trip_revision_conflict";

  constructor(
    key: "errors.trip_not_found" | "errors.trip_revision_conflict",
    message?: string,
  ) {
    super(message ?? key);
    this.name = "TripStoreError";
    this.key = key;
  }
}
