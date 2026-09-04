/**
 * TC-M16-64 — fetch_trip_details field slices + invalid id.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../db/client";
import { applyTripWrite, clearTripMemoryForTests } from "./trip-store";
import { fetchTripDetails } from "./fetch-trip-details";
import { TripStoreError } from "./trip-types";

const CALLER = "tc-m16-64-caller";

async function wipe() {
  clearTripMemoryForTests();
  await prisma.trip.deleteMany({ where: { callerKey: CALLER } });
}

beforeEach(wipe);
afterEach(wipe);

describe("TC-M16-64 fetch_trip_details", () => {
  it("TC-M16-64-01 should_return_requested_field_slices", async () => {
    const written = await applyTripWrite({
      callerKey: CALLER,
      locale: "EN",
      patch: {
        skeleton: {
          days: [
            { day_index: 1, day_theme: "Old town", stops: [{ name: "A", kind: "attraction" }] },
            { day_index: 2, day_theme: "Coast", stops: [{ name: "B", kind: "attraction" }] },
          ],
        },
        cursor: { day_index: 1, stop_index: 0 },
        constraints: { city: "Lisbon", numDays: 2 },
      },
    });

    const slice = await fetchTripDetails({
      callerKey: CALLER,
      trip_id: written.trip_id,
      fields: ["skeleton", "cursor", "day"],
      day_index: 2,
    });

    expect(slice.trip_id).toBe(written.trip_id);
    expect(slice.revision).toBe(written.revision);
    expect(slice.data.skeleton).toMatchObject({
      days: expect.arrayContaining([expect.objectContaining({ day_index: 1 })]),
    });
    expect(slice.data.cursor).toEqual({ day_index: 1, stop_index: 0 });
    expect(slice.data.day).toMatchObject({ day_index: 2, day_theme: "Coast" });
    expect(slice.data).not.toHaveProperty("constraints");
  });

  it("TC-M18-76 should_return_artifacts_field_slice", async () => {
    const written = await applyTripWrite({
      callerKey: CALLER,
      locale: "EN",
      patch: { artifacts: { tips: { iconic_places: ["Alpha"] } } },
    });
    const slice = await fetchTripDetails({
      callerKey: CALLER,
      trip_id: written.trip_id,
      fields: ["artifacts"],
    });
    expect(slice.data.artifacts).toEqual({ tips: { iconic_places: ["Alpha"] } });
  });

  it("TC-M16-64-02 should_throw_trip_not_found_for_invalid_id", async () => {
    await expect(
      fetchTripDetails({
        callerKey: CALLER,
        trip_id: "missing-trip",
        fields: ["skeleton"],
      }),
    ).rejects.toBeInstanceOf(TripStoreError);

    await expect(
      fetchTripDetails({
        callerKey: CALLER,
        trip_id: "missing-trip",
        fields: ["skeleton"],
      }),
    ).rejects.toMatchObject({ key: "errors.trip_not_found" });
  });
});
