/**
 * ADR-046 / MVP-16 — Trip Store: PostgreSQL authority + in-process memory hot replica.
 *
 * Write: memory → PG (optimistic revision) → return new revision + patch.
 * Read: memory hit; miss / stale / cold → hydrate from PG.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "../db/client";
import { normalizeMustIncludeToken } from "./trip-intake";
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Nested merge so tips writes do not wipe visa (F76). */
export function mergeTripArtifacts(current: unknown, patch: unknown): Record<string, unknown> {
  const cur = isRecord(current) ? { ...current } : {};
  const p = isRecord(patch) ? patch : {};
  const out: Record<string, unknown> = { ...cur };
  if (p.tips !== undefined) {
    out.tips = {
      ...(isRecord(cur.tips) ? cur.tips : {}),
      ...(isRecord(p.tips) ? p.tips : {}),
    };
  }
  if (p.visa !== undefined) {
    out.visa = {
      ...(isRecord(cur.visa) ? cur.visa : {}),
      ...(isRecord(p.visa) ? p.visa : {}),
    };
  }
  for (const [key, value] of Object.entries(p)) {
    if (key === "tips" || key === "visa") continue;
    out[key] = value;
  }
  return out;
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
  /** F84: replace drops cards absent from the patch (default merge keeps F82 heat). */
  candidatesWrite?: "merge" | "replace";
}): Promise<{ revision: number; patch: TripPatch }> {
  const current = await getTripOrThrow(opts.callerKey, opts.tripId);
  if (current.revision !== opts.expectedRevision) {
    throw new TripStoreError("errors.trip_revision_conflict");
  }

  const nextRevision = current.revision + 1;
  const mergedArtifacts =
    opts.patch.artifacts !== undefined
      ? mergeTripArtifacts(current.artifacts, opts.patch.artifacts)
      : undefined;
  const data: Prisma.TripUpdateManyMutationInput = {
    revision: nextRevision,
  };
  if (opts.patch.locale !== undefined) data.locale = opts.patch.locale;
  if (opts.patch.status !== undefined) data.status = opts.patch.status;
  if (opts.patch.constraints !== undefined) data.constraints = jsonValue(opts.patch.constraints);
  const incomingPool = opts.patch.candidates as CandidatePool | undefined;
  const mergedCandidates =
    incomingPool !== undefined
      ? opts.candidatesWrite === "replace"
        ? {
            places: incomingPool.places ?? [],
            restaurants: incomingPool.restaurants ?? [],
          }
        : mergeCandidatesPreserveMustSee(
            current.candidates as CandidatePool | null | undefined,
            incomingPool,
          )
      : undefined;
  if (mergedCandidates !== undefined) data.candidates = jsonValue(mergedCandidates);
  if (opts.patch.skeleton !== undefined) data.skeleton = jsonValue(opts.patch.skeleton);
  if (opts.patch.cursor !== undefined) data.cursor = jsonValue(opts.patch.cursor);
  if (opts.patch.filled !== undefined) data.filled = jsonValue(opts.patch.filled);
  if (mergedArtifacts !== undefined) data.artifacts = jsonValue(mergedArtifacts);

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
    candidates: mergedCandidates !== undefined ? mergedCandidates : current.candidates,
    skeleton: opts.patch.skeleton !== undefined ? opts.patch.skeleton : current.skeleton,
    cursor: opts.patch.cursor !== undefined ? opts.patch.cursor : current.cursor,
    filled: opts.patch.filled !== undefined ? opts.patch.filled : current.filled,
    artifacts: mergedArtifacts !== undefined ? mergedArtifacts : current.artifacts,
    updatedAt: new Date(),
  };
  memory.set(opts.tripId, updated);
  return { revision: nextRevision, patch: opts.patch };
}

/**
 * Lazy-create (or attach) then apply patch. Uses current revision when
 * `expectedRevision` is omitted (typical first write after ensure).
 */
/** Internal write primitive (ADR-049). HTTP `patch_trip` stays constraints-only. */
export async function patchTrip(opts: {
  callerKey: string;
  tripId: string;
  expectedRevision: number;
  patch: TripPatch;
  candidatesWrite?: "merge" | "replace";
}): Promise<{ revision: number; patch: TripPatch }> {
  return commitPatch(opts);
}

export async function applyTripWrite(opts: {
  callerKey: string;
  tripId?: string;
  expectedRevision?: number;
  locale?: string;
  patch: TripPatch;
  candidatesWrite?: "merge" | "replace";
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
    candidatesWrite: opts.candidatesWrite,
  });
  return {
    trip_id: ensured.trip_id,
    revision: written.revision,
    patch: written.patch,
  };
}

type CandidatePool = {
  places?: Array<Record<string, unknown>>;
  restaurants?: Array<Record<string, unknown>>;
};

function mergeCandidatePool(
  current: Array<Record<string, unknown>>,
  incoming: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  const byName = new Map<string, Record<string, unknown>>();
  for (const card of current) {
    const name = typeof card.name === "string" ? normalizeMustIncludeToken(card.name) : "";
    if (name) byName.set(name, { ...card });
  }
  for (const card of incoming) {
    const name = typeof card.name === "string" ? normalizeMustIncludeToken(card.name) : "";
    if (!name) continue;
    const prev = byName.get(name);
    if (prev) {
      const merged = { ...prev, ...card };
      if (prev.must_see === true) merged.must_see = true;
      byName.set(name, merged);
    } else {
      byName.set(name, { ...card });
    }
  }
  return [...byName.values()];
}

/** F82: keep store `must_see` heat when make/discover patches a slimmer pool. */
export function mergeCandidatesPreserveMustSee(
  current: CandidatePool | null | undefined,
  incoming: CandidatePool,
): { places: Array<Record<string, unknown>>; restaurants: Array<Record<string, unknown>> } {
  const curPlaces = Array.isArray(current?.places) ? current.places : [];
  const curRestaurants = Array.isArray(current?.restaurants) ? current.restaurants : [];
  return {
    places: mergeCandidatePool(curPlaces, incoming.places ?? []),
    restaurants: mergeCandidatePool(curRestaurants, incoming.restaurants ?? []),
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
    if (c.user_requested !== undefined) out.user_requested = c.user_requested;
    if (typeof c.category === "string") out.category = c.category;
    if (typeof c.kind === "string") out.kind = c.kind;
    if (typeof c.provider === "string") out.provider = c.provider;
    if (typeof c.rating === "number") out.rating = c.rating;
    if (typeof c.user_ratings_total === "number") out.user_ratings_total = c.user_ratings_total;
    return out;
  };
  return {
    places: (candidates.places ?? []).map(slim),
    restaurants: (candidates.restaurants ?? []).map(slim),
  };
}

/** Empty HTTP/MCP `candidates` must not overwrite a discover pool already in the Trip. */
export function tripPatchCandidatesIfNonEmpty(
  places: Array<Record<string, unknown>>,
  restaurants: Array<Record<string, unknown>>,
): { candidates: ReturnType<typeof slimCandidatesForStore> } | Record<string, never> {
  if (places.length === 0 && restaurants.length === 0) return {};
  return { candidates: slimCandidatesForStore({ places, restaurants }) };
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
