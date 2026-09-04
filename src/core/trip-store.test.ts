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
  mergeCandidatesPreserveMustSee,
  slimCandidatesForStore,
  tripPatchCandidatesIfNonEmpty,
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

  it("TC-M18-76 should_merge_artifacts_tips_without_wiping_visa", async () => {
    const { trip_id, revision } = await ensureTrip({ callerKey: CALLER });
    await commitPatch({
      callerKey: CALLER,
      tripId: trip_id,
      expectedRevision: revision,
      patch: { artifacts: { visa: { requirement: "visa_free" } } },
    });
    const afterVisa = await getTripOrThrow(CALLER, trip_id);
    await commitPatch({
      callerKey: CALLER,
      tripId: trip_id,
      expectedRevision: afterVisa.revision,
      patch: { artifacts: { tips: { iconic_places: ["Alpha"] } } },
    });
    const merged = await getTripOrThrow(CALLER, trip_id);
    expect(merged.artifacts).toEqual({
      visa: { requirement: "visa_free" },
      tips: { iconic_places: ["Alpha"] },
    });
  });
});

describe("slim candidates for Trip patch", () => {
  it("should_omit_candidates_when_both_pools_empty", () => {
    expect(tripPatchCandidatesIfNonEmpty([], [])).toEqual({});
  });

  it("should_keep_heat_signals_on_non_empty_pool", () => {
    const patch = tripPatchCandidatesIfNonEmpty(
      [
        {
          name: "Belém Tower",
          provider: "GOOGLE_MAPS",
          rating: 4.7,
          user_ratings_total: 12000,
        },
      ],
      [],
    );
    expect(patch.candidates?.places[0]).toMatchObject({
      name: "Belém Tower",
      provider: "GOOGLE_MAPS",
      rating: 4.7,
      user_ratings_total: 12000,
    });
  });

  it("should_keep_user_requested_in_slimCandidatesForStore", () => {
    expect(
      slimCandidatesForStore({
        places: [{ name: "A", user_requested: true }],
        restaurants: [],
      }).places[0],
    ).toMatchObject({ name: "A", user_requested: true });
  });

  it("TC-M19-82-01 should_preserve_store_must_see_when_incoming_pool_is_slimmer", () => {
    const store = {
      places: [
        { name: "Belém Tower", must_see: true },
        { name: "Jerónimos Monastery", must_see: true },
        { name: "Castelo de São Jorge", must_see: true },
        { name: "Pena Palace", must_see: true },
        { name: "Sintra", must_see: true },
        { name: "Cabo da Roca", must_see: true },
        { name: "LX Factory", must_see: true },
        { name: "Time Out Market", must_see: true },
        { name: "Generic Cafe" },
      ],
      restaurants: [],
    };
    const incoming = {
      places: [
        { name: "Belém Tower", must_see: true, user_requested: true },
        { name: "Jerónimos Monastery", user_requested: true },
        { name: "Sintra", user_requested: true },
      ],
      restaurants: [],
    };
    const merged = mergeCandidatesPreserveMustSee(store, incoming);
    expect(merged.places.filter((p) => p.must_see === true)).toHaveLength(8);
    expect(merged.places.filter((p) => p.user_requested === true)).toHaveLength(3);
  });

  it("TC-M19-82-01 should_merge_candidates_on_commitPatch_without_dropping_heat", async () => {
    const { trip_id, revision } = await ensureTrip({ callerKey: CALLER });
    const heatPool = {
      places: Array.from({ length: 8 }, (_, i) => ({
        name: `Heat Place ${i + 1}`,
        must_see: true,
      })),
      restaurants: [],
    };
    await commitPatch({
      callerKey: CALLER,
      tripId: trip_id,
      expectedRevision: revision,
      patch: { candidates: heatPool },
    });
    const afterDiscover = await getTripOrThrow(CALLER, trip_id);
    const slimMake = {
      places: [
        { name: "Heat Place 1", user_requested: true },
        { name: "Heat Place 2", user_requested: true },
        { name: "Heat Place 3", user_requested: true },
      ],
      restaurants: [],
    };
    await commitPatch({
      callerKey: CALLER,
      tripId: trip_id,
      expectedRevision: afterDiscover.revision,
      patch: {
        candidates: slimCandidatesForStore(slimMake),
        constraints: { must_include: ["Heat Place 1", "Heat Place 2", "Heat Place 3"] },
      },
    });
    const afterMake = await getTripOrThrow(CALLER, trip_id);
    const places = (afterMake.candidates as { places?: Array<{ must_see?: boolean }> })?.places ?? [];
    expect(places.filter((p) => p.must_see === true)).toHaveLength(8);
    expect((afterMake.constraints as { must_include?: string[] })?.must_include).toHaveLength(3);
  });

  it("TC-M22-84-03 should_drop_dirty_place_when_patchTrip_replaces_candidates", async () => {
    const { patchTrip } = await import("./trip-store");
    const { trip_id, revision } = await ensureTrip({ callerKey: CALLER });
    await commitPatch({
      callerKey: CALLER,
      tripId: trip_id,
      expectedRevision: revision,
      patch: {
        candidates: {
          places: [{ name: "西湖十景" }, { name: "雷峰塔", location: { lat: 1, lng: 2 } }],
          restaurants: [],
        },
      },
    });
    const after = await getTripOrThrow(CALLER, trip_id);
    await patchTrip({
      callerKey: CALLER,
      tripId: trip_id,
      expectedRevision: after.revision,
      candidatesWrite: "replace",
      patch: {
        candidates: {
          places: [{ name: "雷峰塔", location: { lat: 1, lng: 2 } }],
          restaurants: [],
        },
      },
    });
    const cleaned = await getTripOrThrow(CALLER, trip_id);
    const names = ((cleaned.candidates as { places?: Array<{ name?: string }> })?.places ?? []).map(
      (p) => p.name,
    );
    expect(names).toEqual(["雷峰塔"]);
    expect(cleaned.revision).toBe(after.revision + 1);
  });
});
