/**
 * ADR-046 / MVP-16 — Trip Store: PostgreSQL authority + in-process memory hot replica.
 *
 * Write: memory → PG (optimistic revision) → return new revision + patch.
 * Read: memory hit; miss / stale / cold → hydrate from PG.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "../db/client";
import {
  TRIP_FIELD_KEYS,
  TripStoreError,
  type TripDocument,
  type TripFieldKey,
  type TripPatch,
  type TripWriteResult,
} from "./trip-types";

const DEFAULT_TTL_H = 24;

const memory = new Map<string, TripDocument>();

export function clearTripMemoryForTests(): void {
  memory.clear();
}

function ttlHours(): number {
  const raw = Number(process.env.TRIP_TTL_H ?? DEFAULT_TTL_H);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TTL_H;
}

function expiresAtFromNow(): Date {
  return new Date(Date.now() + ttlHours() * 3_600_000);
}

function rowToDoc(row: {
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
}): TripDocument {
  return {
    id: row.id,
    revision: row.revision,
    status: row.status,
    callerKey: row.callerKey,
    locale: row.locale,
    expiresAt: row.expiresAt,
    constraints: row.constraints ?? null,
    candidates: row.candidates ?? null,
    skeleton: row.skeleton ?? null,
    cursor: row.cursor ?? null,
    filled: row.filled ?? null,
    artifacts: row.artifacts ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function isExpired(doc: { expiresAt: Date }): boolean {
  return doc.expiresAt.getTime() <= Date.now();
}

async function loadFromPg(callerKey: string, tripId: string): Promise<TripDocument> {
  const row = await prisma.trip.findFirst({
    where: { id: tripId, callerKey },
  });
  if (!row || isExpired(row)) {
    memory.delete(tripId);
    throw new TripStoreError("errors.trip_not_found");
  }
  const doc = rowToDoc(row);
  memory.set(tripId, doc);
  return doc;
}

/** Load trip for caller; hydrate memory from PG when missing or expired in memory. */
export async function getTripOrThrow(
  callerKey: string,
  tripId: string,
): Promise<TripDocument> {
  const hit = memory.get(tripId);
  if (hit) {
    if (hit.callerKey !== callerKey || isExpired(hit)) {
      memory.delete(tripId);
      throw new TripStoreError("errors.trip_not_found");
    }
    return hit;
  }
  return loadFromPg(callerKey, tripId);
}

export async function ensureTrip(opts: {
  callerKey: string;
  tripId?: string;
  locale?: string;
}): Promise<{ trip_id: string; revision: number; created: boolean }> {
  if (opts.tripId) {
    const doc = await getTripOrThrow(opts.callerKey, opts.tripId);
    return { trip_id: doc.id, revision: doc.revision, created: false };
  }

  const row = await prisma.trip.create({
    data: {
      callerKey: opts.callerKey,
      locale: opts.locale ?? null,
      expiresAt: expiresAtFromNow(),
      revision: 1,
      status: "active",
    },
  });
  const doc = rowToDoc(row);
  memory.set(doc.id, doc);
  return { trip_id: doc.id, revision: doc.revision, created: true };
}

function jsonValue(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === null || value === undefined) return Prisma.JsonNull;
  return value as Prisma.InputJsonValue;
}

export async function commitPatch(opts: {
  callerKey: string;
  tripId: string;
  expectedRevision: number;
  patch: TripPatch;
}): Promise<{ revision: number; patch: TripPatch }> {
  const current = await getTripOrThrow(opts.callerKey, opts.tripId);
  if (current.revision !== opts.expectedRevision) {
    throw new TripStoreError("errors.trip_revision_conflict");
  }

  const nextRevision = current.revision + 1;
  const data: Prisma.TripUpdateManyMutationInput = {
    revision: nextRevision,
  };
  if (opts.patch.locale !== undefined) data.locale = opts.patch.locale;
  if (opts.patch.status !== undefined) data.status = opts.patch.status;
  if (opts.patch.constraints !== undefined) data.constraints = jsonValue(opts.patch.constraints);
  if (opts.patch.candidates !== undefined) data.candidates = jsonValue(opts.patch.candidates);
  if (opts.patch.skeleton !== undefined) data.skeleton = jsonValue(opts.patch.skeleton);
  if (opts.patch.cursor !== undefined) data.cursor = jsonValue(opts.patch.cursor);
  if (opts.patch.filled !== undefined) data.filled = jsonValue(opts.patch.filled);
  if (opts.patch.artifacts !== undefined) data.artifacts = jsonValue(opts.patch.artifacts);

  const result = await prisma.trip.updateMany({
    where: {
      id: opts.tripId,
      callerKey: opts.callerKey,
      revision: opts.expectedRevision,
    },
    data,
  });
  if (result.count !== 1) {
    memory.delete(opts.tripId);
    throw new TripStoreError("errors.trip_revision_conflict");
  }

  const updated: TripDocument = {
    ...current,
    revision: nextRevision,
    locale: opts.patch.locale !== undefined ? opts.patch.locale : current.locale,
    status: opts.patch.status !== undefined ? opts.patch.status : current.status,
    constraints:
      opts.patch.constraints !== undefined ? opts.patch.constraints : current.constraints,
    candidates:
      opts.patch.candidates !== undefined ? opts.patch.candidates : current.candidates,
    skeleton: opts.patch.skeleton !== undefined ? opts.patch.skeleton : current.skeleton,
    cursor: opts.patch.cursor !== undefined ? opts.patch.cursor : current.cursor,
    filled: opts.patch.filled !== undefined ? opts.patch.filled : current.filled,
    artifacts:
      opts.patch.artifacts !== undefined ? opts.patch.artifacts : current.artifacts,
    updatedAt: new Date(),
  };
  memory.set(opts.tripId, updated);
  return { revision: nextRevision, patch: opts.patch };
}

/**
 * Lazy-create (or attach) then apply patch. Uses current revision when
 * `expectedRevision` is omitted (typical first write after ensure).
 */
export async function applyTripWrite(opts: {
  callerKey: string;
  tripId?: string;
  expectedRevision?: number;
  locale?: string;
  patch: TripPatch;
}): Promise<TripWriteResult> {
  const ensured = await ensureTrip({
    callerKey: opts.callerKey,
    tripId: opts.tripId,
    locale: opts.locale,
  });
  const expected = opts.expectedRevision ?? ensured.revision;
  const written = await commitPatch({
    callerKey: opts.callerKey,
    tripId: ensured.trip_id,
    expectedRevision: expected,
    patch: opts.patch,
  });
  return {
    trip_id: ensured.trip_id,
    revision: written.revision,
    patch: written.patch,
  };
}

/** Slim candidates for PG (name/location/category — avoid full photo blobs). */
export function slimCandidatesForStore(candidates: {
  places?: Array<Record<string, unknown>>;
  restaurants?: Array<Record<string, unknown>>;
}): { places: Array<Record<string, unknown>>; restaurants: Array<Record<string, unknown>> } {
  const slim = (c: Record<string, unknown>): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    if (typeof c.name === "string") out.name = c.name;
    if (c.location && typeof c.location === "object") out.location = c.location;
    if (c.must_see !== undefined) out.must_see = c.must_see;
    if (typeof c.category === "string") out.category = c.category;
    if (typeof c.kind === "string") out.kind = c.kind;
    return out;
  };
  return {
    places: (candidates.places ?? []).map(slim),
    restaurants: (candidates.restaurants ?? []).map(slim),
  };
}

export function pickTripFields(
  doc: TripDocument,
  fields: string[],
  dayIndex?: number,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of fields) {
    if ((TRIP_FIELD_KEYS as readonly string[]).includes(field)) {
      out[field] = doc[field as TripFieldKey];
      continue;
    }
    if (field === "day" || /^day_\d+$/.test(field)) {
      const idx =
        field === "day"
          ? dayIndex
          : Number(field.slice(4));
      const skeleton = doc.skeleton as
        | { days?: Array<{ day_index?: number }> }
        | null
        | undefined;
      const days = skeleton?.days ?? [];
      const day =
        typeof idx === "number"
          ? days.find((d) => d.day_index === idx) ?? days[idx - 1]
          : undefined;
      out[field === "day" ? "day" : field] = day ?? null;
    }
  }
  return out;
}
