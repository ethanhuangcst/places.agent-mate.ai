/**
 * BUG-007 — HTTP make_itinerary / plan_next_stop must expose next_tool_call
 * so the HTTP /v1 harness can chain until trip_complete.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/db/client";
import { generateCallerSecret, hashPassword } from "../src/core/crypto";
import { dispatchTool } from "../src/http/dispatch";
import { clearTripMemoryForTests } from "../src/core/trip-store";
import { makeItinerary } from "../src/core/make-itinerary";
import { planNextStopFill } from "../src/core/plan-next-stop";

vi.mock("../src/core/make-itinerary", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/core/make-itinerary")>();
  return {
    ...actual,
    makeItinerary: vi.fn(),
    createSkeletonChatCreate: () => undefined,
  };
});

vi.mock("../src/core/plan-next-stop", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/core/plan-next-stop")>();
  return {
    ...actual,
    planNextStopFill: vi.fn(),
  };
});

const ADMIN = { username: "admin", email: "me@ethanhuang.com" };

const SKELETON = {
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
};

async function resetDb() {
  clearTripMemoryForTests();
  await prisma.trip.deleteMany();
  await prisma.callerApiKey.deleteMany();
  await prisma.adminUser.deleteMany();
  await prisma.adminUser.create({
    data: { ...ADMIN, passwordHash: await hashPassword("devpass") },
  });
}

describe("BUG-007 HTTP fill handoff envelope", () => {
  let bearer = "";
  let keyId = "";

  beforeEach(async () => {
    await resetDb();
    const generated = generateCallerSecret();
    const row = await prisma.callerApiKey.create({
      data: {
        name: "fill-handoff",
        keyHash: generated.keyHash,
        prefix: generated.prefix,
        status: "ACTIVE",
      },
    });
    keyId = row.id;
    bearer = `Bearer ${generated.secret}`;
    vi.mocked(makeItinerary).mockResolvedValue({
      skeleton: SKELETON,
      candidates_slim: { places: [{ name: "Plaza" }], restaurants: [] },
    } as never);
    vi.mocked(planNextStopFill).mockResolvedValue({
      next_stop: { name: "Hotel", kind: "stay" },
      stop_display: {
        stop: { name: "Hotel", kind: "stay", card: null, deeplinks: {} },
        slot: { start: "09:00", end: "09:00" },
        legs_to_here: [],
        from_origin: true,
        notes: [],
      },
      legs: [],
    } as never);
  });

  afterEach(async () => {
    clearTripMemoryForTests();
    await prisma.trip.deleteMany({ where: { callerKey: keyId } });
    await prisma.callerApiKey.deleteMany();
  });

  it("should_include_origin_mode_next_tool_call_on_make_itinerary", async () => {
    const made = await dispatchTool("make_itinerary", bearer, {
      city: "Lisbon",
      numDays: 1,
      candidates: { places: [{ name: "Plaza" }], restaurants: [] },
      locale: "EN",
    });
    expect(made.status).toBe(200);
    expect(made.envelope.ok).toBe(true);
    const data = made.envelope.data as {
      next_action?: string;
      next_tool_call?: {
        name: string;
        arguments: {
          origin_mode?: boolean;
          cursor?: { day_index: number; stop_index: number };
          skeleton?: unknown;
        };
      };
    };
    expect(data.next_action).toBe("plan_next_stop");
    expect(data.next_tool_call?.name).toBe("plan_next_stop");
    expect(data.next_tool_call?.arguments.origin_mode).toBe(true);
    expect(data.next_tool_call?.arguments.cursor).toEqual({
      day_index: 1,
      stop_index: 0,
    });
    expect(data.next_tool_call?.arguments.skeleton).toBeTruthy();
  });

  it("should_include_next_tool_call_or_trip_complete_on_plan_next_stop", async () => {
    const made = await dispatchTool("make_itinerary", bearer, {
      city: "Lisbon",
      numDays: 1,
      candidates: { places: [{ name: "Plaza" }], restaurants: [] },
      locale: "EN",
    });
    const madeData = made.envelope.data as {
      trip_id?: string;
      revision?: number;
      next_tool_call?: { arguments: Record<string, unknown> };
    };
    const args = madeData.next_tool_call?.arguments ?? {};
    const filled = await dispatchTool("plan_next_stop", bearer, {
      ...args,
      trip_id: madeData.trip_id,
      revision: madeData.revision,
      locale: "EN",
      with_stop_display: true,
      candidates: { places: [{ name: "Plaza" }], restaurants: [] },
    });
    expect(filled.status).toBe(200);
    expect(filled.envelope.ok).toBe(true);
    const data = filled.envelope.data as {
      next_action?: string;
      next_tool_call?: {
        name: string;
        arguments: {
          cursor?: { day_index: number; stop_index: number };
          next_stop?: { name?: string };
        };
      };
    };
    expect(data.next_action).toBe("plan_next_stop");
    expect(data.next_tool_call?.name).toBe("plan_next_stop");
    expect(data.next_tool_call?.arguments.cursor).toEqual({
      day_index: 1,
      stop_index: 1,
    });
    expect(data.next_tool_call?.arguments.next_stop?.name).toBe("Plaza");
  });
});
