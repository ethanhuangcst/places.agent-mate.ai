import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/db/client";
import { generateCallerSecret, hashPassword } from "../src/core/crypto";
import { dispatchTool } from "../src/http/dispatch";
import { AGENT_ID } from "../src/core/locales";
import { planNextStop, displayCurrentStop } from "../src/core/plan-next-stop";

vi.mock("../src/core/plan-next-stop", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/core/plan-next-stop")>();
  return {
    ...actual,
    planNextStop: vi.fn(),
    displayCurrentStop: vi.fn(),
  };
});

const ADMIN = { username: "admin", email: "me@ethanhuang.com" };

async function resetDb() {
  await prisma.callerApiKey.deleteMany();
  await prisma.adminUser.deleteMany();
  await prisma.adminUser.create({
    data: { ...ADMIN, passwordHash: await hashPassword("devpass") },
  });
}

async function makeKey() {
  const generated = generateCallerSecret();
  await prisma.callerApiKey.create({
    data: {
      name: "test",
      keyHash: generated.keyHash,
      prefix: generated.prefix,
      status: "ACTIVE",
    },
  });
  return `Bearer ${generated.secret}`;
}

describe("dispatch — plan_next_stop / display_current_stop (TC-M10-44-03)", () => {
  beforeEach(async () => {
    await resetDb();
    vi.mocked(planNextStop).mockReset();
    vi.mocked(displayCurrentStop).mockReset();
  });
  afterEach(async () => {
    await prisma.callerApiKey.deleteMany();
  });

  it("should_return_200_with_legs_when_plan_next_stop_valid", async () => {
    const auth = await makeKey();
    vi.mocked(planNextStop).mockResolvedValue({
      next_stop: { name: "Pastéis de Belém", location: { lat: 38.7, lng: -9.1, crs: "WGS84" } },
      legs: [
        {
          mode: "transit",
          duration_min: 12,
          base_duration_min: 12,
          weather_buffer_min: 0,
          recommended: true,
          deeplinks: { google_web: "https://maps.google.com" },
          source: "directions",
        },
      ],
      transit_outcome: "directions",
      single_mode: false,
    });
    const result = await dispatchTool("plan_next_stop", auth, {
      current_stop: { name: "Torre de Belém", lat: 38.69, lng: -9.21 },
      next_stop: { name: "Pastéis de Belém", lat: 38.7, lng: -9.1 },
      candidates: { places: [], restaurants: [] },
      locale: "EN",
    });
    expect(result.status).toBe(200);
    expect(result.envelope.ok).toBe(true);
    expect(result.envelope.agent).toBe(AGENT_ID);
    const data = result.envelope.data as { transit_outcome: string; legs: unknown[] };
    expect(data.transit_outcome).toBe("directions");
    expect(data.legs).toHaveLength(1);
  });

  it("should_return_502_when_plan_next_stop_throws", async () => {
    const auth = await makeKey();
    vi.mocked(planNextStop).mockRejectedValue(new Error("vendor down"));
    const result = await dispatchTool("plan_next_stop", auth, {
      current_stop: { name: "A" },
      next_stop: { name: "B" },
      locale: "EN",
    });
    expect(result.status).toBe(502);
    expect(result.envelope.outcome?.key).toBe("errors.provider_failed");
  });

  it("should_return_400_when_plan_next_stop_body_invalid", async () => {
    const auth = await makeKey();
    const result = await dispatchTool("plan_next_stop", auth, {
      current_stop: { name: "" },
      next_stop: { name: "B" },
      locale: "EN",
    });
    expect(result.status).toBe(400);
    expect(result.envelope.outcome?.key).toBe("errors.invalid_input");
  });

  it("should_return_200_with_slot_when_display_current_stop_valid", async () => {
    const auth = await makeKey();
    vi.mocked(displayCurrentStop).mockReturnValue({
      stop: { name: "Torre de Belém", kind: "attraction", card: null, deeplinks: {} },
      legs_to_here: [],
      slot: { start: "10:00", end: "11:30" },
      transit_outcome: "heuristic",
      notes: [],
    });
    const result = await dispatchTool("display_current_stop", auth, {
      stop: { name: "Torre de Belém", kind: "attraction" },
      candidates: { places: [], restaurants: [] },
      locale: "EN",
    });
    expect(result.status).toBe(200);
    expect(result.envelope.ok).toBe(true);
    const data = result.envelope.data as { slot: { start: string; end: string } };
    expect(data.slot).toEqual({ start: "10:00", end: "11:30" });
  });

  it("should_return_400_when_display_current_stop_body_invalid", async () => {
    const auth = await makeKey();
    const result = await dispatchTool("display_current_stop", auth, {
      stop: { name: "" },
      locale: "EN",
    });
    expect(result.status).toBe(400);
    expect(result.envelope.outcome?.key).toBe("errors.invalid_input");
  });
});
