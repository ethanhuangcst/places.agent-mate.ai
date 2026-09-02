/**
 * TC-M16-64 contract — HTTP fetch_trip_details + make_itinerary trip_id dual-write.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/db/client";
import { generateCallerSecret, hashPassword } from "../src/core/crypto";
import { dispatchTool } from "../src/http/dispatch";
import { clearTripMemoryForTests } from "../src/core/trip-store";
import { makeItinerary } from "../src/core/make-itinerary";

vi.mock("../src/core/make-itinerary", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/core/make-itinerary")>();
  return {
    ...actual,
    makeItinerary: vi.fn(),
    createSkeletonChatCreate: () => undefined,
  };
});

const ADMIN = { username: "admin", email: "me@ethanhuang.com" };

async function resetDb() {
  clearTripMemoryForTests();
  await prisma.trip.deleteMany();
  await prisma.callerApiKey.deleteMany();
  await prisma.adminUser.deleteMany();
  await prisma.adminUser.create({
    data: { ...ADMIN, passwordHash: await hashPassword("devpass") },
  });
}

describe("TC-M16-64 HTTP fetch_trip_details contract", () => {
  let bearer = "";
  let keyId = "";

  beforeEach(async () => {
    await resetDb();
    const generated = generateCallerSecret();
    const row = await prisma.callerApiKey.create({
      data: {
        name: "m16",
        keyHash: generated.keyHash,
        prefix: generated.prefix,
        status: "ACTIVE",
      },
    });
    keyId = row.id;
    bearer = `Bearer ${generated.secret}`;
    vi.mocked(makeItinerary).mockResolvedValue({
      skeleton: {
        days: [
          {
            day_index: 1,
            day_theme: "Centro",
            stops: [
              { name: "Hotel", kind: "stay" },
              { name: "Plaza", kind: "attraction" },
            ],
          },
        ],
      },
    } as never);
  });

  afterEach(async () => {
    clearTripMemoryForTests();
    await prisma.trip.deleteMany({ where: { callerKey: keyId } });
    await prisma.callerApiKey.deleteMany();
  });

  it("should_return_trip_id_from_make_itinerary_and_fetch_skeleton", async () => {
    const made = await dispatchTool("make_itinerary", bearer, {
      city: "Lisbon",
      numDays: 1,
      candidates: { places: [{ name: "Plaza" }], restaurants: [] },
      locale: "EN",
    });
    expect(made.status).toBe(200);
    expect(made.envelope.ok).toBe(true);
    const data = made.envelope.data as {
      trip_id: string;
      revision: number;
      skeleton: unknown;
    };
    expect(data.trip_id).toBeTruthy();
    expect(data.revision).toBeGreaterThanOrEqual(2);
    expect(data.skeleton).toBeTruthy();

    const fetched = await dispatchTool("fetch_trip_details", bearer, {
      trip_id: data.trip_id,
      fields: ["skeleton", "constraints"],
      locale: "EN",
    });
    expect(fetched.status).toBe(200);
    expect(fetched.envelope.ok).toBe(true);
    const slice = fetched.envelope.data as {
      trip_id: string;
      revision: number;
      data: { skeleton: unknown; constraints: { city?: string } };
    };
    expect(slice.trip_id).toBe(data.trip_id);
    expect(slice.data.skeleton).toEqual(data.skeleton);
    expect(slice.data.constraints?.city).toBe("Lisbon");
  });

  it("should_return_structured_trip_not_found_without_fabrication", async () => {
    const fetched = await dispatchTool("fetch_trip_details", bearer, {
      trip_id: "missing-trip-id",
      fields: ["skeleton"],
      locale: "EN",
    });
    expect(fetched.status).toBe(404);
    expect(fetched.envelope.ok).toBe(false);
    expect(fetched.envelope.outcome?.key).toBe("errors.trip_not_found");
    const errData = fetched.envelope.data as { host_instructions?: string };
    expect(errData.host_instructions).toMatch(/Do not invent/i);
  });
});
