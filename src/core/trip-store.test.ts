/**
 * TC-M16-63-01..04 — Trip Store (PG authority + memory hot replica).
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../db/client";
import {
  clearTripMemoryForTests,
  commitPatch,
  ensureTrip,
  getTripOrThrow,
} from "./trip-store";
import { TripStoreError } from "./trip-types";

const CALLER = "tc-m16-63-caller";
const OTHER = "tc-m16-63-other";

async function wipe() {
  clearTripMemoryForTests();
  await prisma.trip.deleteMany({ where: { callerKey: { in: [CALLER, OTHER] } } });
}

beforeEach(wipe);
afterEach(wipe);

describe("TC-M16-63 Trip Store", () => {
  it("TC-M16-63-01 should_lazy_create_trip_when_no_trip_id", async () => {
    const created = await ensureTrip({ callerKey: CALLER, locale: "EN" });
    expect(created.created).toBe(true);
    expect(created.trip_id.length).toBeGreaterThan(8);
    expect(created.revision).toBe(1);

    const row = await prisma.trip.findUnique({ where: { id: created.trip_id } });
    expect(row?.callerKey).toBe(CALLER);
    expect(row?.revision).toBe(1);
    expect(row?.locale).toBe("EN");

    const again = await ensureTrip({
      callerKey: CALLER,
      tripId: created.trip_id,
    });
    expect(again.created).toBe(false);
    expect(again.trip_id).toBe(created.trip_id);
    expect(again.revision).toBe(1);
  });

  it("TC-M16-63-02 should_keep_memory_and_pg_in_sync_and_bump_revision", async () => {
    const { trip_id, revision } = await ensureTrip({ callerKey: CALLER });
    const patch = {
      skeleton: { days: [{ day_index: 1, stops: [{ name: "A", kind: "attraction" }] }] },
      candidates: { places: [{ name: "A", location: { lat: 1, lng: 2 } }], restaurants: [] },
    };
    const written = await commitPatch({
      callerKey: CALLER,
      tripId: trip_id,
      expectedRevision: revision,
      patch,
    });
    expect(written.revision).toBe(2);
    expect(written.patch.skeleton).toEqual(patch.skeleton);

    const mem = await getTripOrThrow(CALLER, trip_id);
    expect(mem.revision).toBe(2);
    expect(mem.skeleton).toEqual(patch.skeleton);

    clearTripMemoryForTests();
    const reloaded = await getTripOrThrow(CALLER, trip_id);
    expect(reloaded.revision).toBe(2);
    expect(reloaded.candidates).toEqual(patch.candidates);
  });

  it("TC-M16-63-03 should_fail_when_expected_revision_is_stale", async () => {
    const { trip_id, revision } = await ensureTrip({ callerKey: CALLER });
    await commitPatch({
      callerKey: CALLER,
      tripId: trip_id,
      expectedRevision: revision,
      patch: { cursor: { day_index: 1, stop_index: 0 } },
    });

    await expect(
      commitPatch({
        callerKey: CALLER,
        tripId: trip_id,
        expectedRevision: revision,
        patch: { cursor: { day_index: 1, stop_index: 1 } },
      }),
    ).rejects.toMatchObject({ key: "errors.trip_revision_conflict" } satisfies Partial<TripStoreError>);
  });

  it("TC-M16-63-04 should_return_trip_not_found_for_wrong_caller_or_expired", async () => {
    const { trip_id } = await ensureTrip({ callerKey: CALLER });

    await expect(getTripOrThrow(OTHER, trip_id)).rejects.toMatchObject({
      key: "errors.trip_not_found",
    });

    await prisma.trip.update({
      where: { id: trip_id },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });
    clearTripMemoryForTests();

    await expect(getTripOrThrow(CALLER, trip_id)).rejects.toMatchObject({
      key: "errors.trip_not_found",
    });

    await expect(
      ensureTrip({ callerKey: CALLER, tripId: "does-not-exist" }),
    ).rejects.toMatchObject({ key: "errors.trip_not_found" });
  });
});
