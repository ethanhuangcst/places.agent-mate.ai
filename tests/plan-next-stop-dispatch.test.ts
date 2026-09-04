import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/db/client";
import { generateCallerSecret, hashPassword } from "../src/core/crypto";
import { dispatchTool } from "../src/http/dispatch";
import { AGENT_ID } from "../src/core/locales";
import { planNextStopFill } from "../src/core/plan-next-stop";

vi.mock("../src/core/plan-next-stop", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/core/plan-next-stop")>();
  return {
    ...actual,
    planNextStopFill: vi.fn(),
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

describe("dispatch — plan_next_stop (TC-M10-44-03 / F65)", () => {
  beforeEach(async () => {
    await resetDb();
    vi.mocked(planNextStopFill).mockReset();
  });
  afterEach(async () => {
    await prisma.callerApiKey.deleteMany();
  });

  it("should_return_200_with_legs_and_stop_display_when_plan_next_stop_valid", async () => {
    const auth = await makeKey();
    vi.mocked(planNextStopFill).mockResolvedValue({
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
      stop_display: {
        stop: { name: "Pastéis de Belém", kind: "meal", card: null, deeplinks: {} },
        legs_to_here: [],
        slot: { start: "12:00", end: "13:00" },
        transit_outcome: "directions",
        notes: [],
      },
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
    const data = result.envelope.data as {
      transit_outcome: string;
      legs: unknown[];
      slot: { start: string; end: string };
    };
    expect(data.transit_outcome).toBe("directions");
    expect(data.legs).toHaveLength(1);
    expect(data.slot).toEqual({ start: "12:00", end: "13:00" });
  });

  it("should_return_502_when_plan_next_stop_throws", async () => {
    const auth = await makeKey();
    vi.mocked(planNextStopFill).mockRejectedValue(new Error("vendor down"));
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

  it("should_return_invalid_input_and_log_issues_when_end_time_not_hhmm", async () => {
    const auth = await makeKey();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await dispatchTool("plan_next_stop", auth, {
      current_stop: { name: "Hotel", kind: "stay", end_time: "9:00" },
      next_stop: { name: "Tower", kind: "attraction" },
      locale: "EN",
    });
    expect(result.status).toBe(400);
    expect(result.envelope.outcome?.key).toBe("errors.invalid_input");
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });

  it("should_allow_origin_mode_without_current_stop", async () => {
    const auth = await makeKey();
    vi.mocked(planNextStopFill).mockResolvedValue({
      next_stop: { name: "Hotel", location: null },
      legs: [],
      transit_outcome: "heuristic",
      single_mode: false,
      stop_display: {
        stop: { name: "Hotel", kind: "stay", card: null, deeplinks: {} },
        legs_to_here: [],
        slot: { start: "09:00", end: "09:00" },
        transit_outcome: "heuristic",
        notes: ["origin_stop"],
      },
    });
    const result = await dispatchTool("plan_next_stop", auth, {
      origin_mode: true,
      next_stop: { name: "Hotel", kind: "stay" },
      time_from: "09:00",
      locale: "EN",
    });
    expect(result.status).toBe(200);
    expect(result.envelope.ok).toBe(true);
  });
});
