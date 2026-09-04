import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/db/client";
import { generateCallerSecret, hashPassword } from "../src/core/crypto";
import { dispatchTool } from "../src/http/dispatch";
import { AGENT_ID } from "../src/core/locales";
import { travelTips, TravelTipsTimeoutError } from "../src/core/travel-tips";

vi.mock("../src/core/travel-tips", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/core/travel-tips")>();
  return { ...actual, travelTips: vi.fn() };
});

const ADMIN = { username: "admin", email: "me@ethanhuang.com" };

async function resetDb() {
  await prisma.callerApiKey.deleteMany();
  await prisma.adminUser.deleteMany();
  await prisma.adminUser.create({
    data: { ...ADMIN, passwordHash: await hashPassword("devpass") },
  });
}

async function makeCaller() {
  const generated = generateCallerSecret();
  await prisma.callerApiKey.create({
    data: {
      name: "test",
      keyHash: generated.keyHash,
      prefix: generated.prefix,
      status: "ACTIVE",
    },
  });
  return generated.secret;
}

const sampleResult = {
  intro: "Lisbon is a sunlit coastal capital.",
  iconic_places: ["Belém Tower"],
  iconic_grounded: false,
  transit: "Trams and metro.",
  weather: null,
  weather_unavailable: true,
  clothing: "Light layers.",
  safety: "Watch pickpockets.",
};

describe("TC-M12-50-05 travel_tips HTTP dispatch envelope", () => {
  beforeEach(async () => {
    await resetDb();
    vi.mocked(travelTips).mockReset();
  });
  afterEach(async () => {
    await prisma.trip.deleteMany();
    await prisma.callerApiKey.deleteMany();
  });

  it("should_return_200_with_structured_envelope_on_success", async () => {
    vi.mocked(travelTips).mockResolvedValue(sampleResult as never);
    const secret = await makeCaller();
    const result = await dispatchTool("travel_tips", `Bearer ${secret}`, {
      destination: "Lisbon",
      locale: "EN",
    });
    expect(result.status).toBe(200);
    expect(result.envelope.ok).toBe(true);
    expect(result.envelope.agent).toBe(AGENT_ID);
    expect((result.envelope.data as { iconic_places: string[] }).iconic_places).toEqual(["Belém Tower"]);
  });

  it("should_return_400_when_destination_missing", async () => {
    const secret = await makeCaller();
    const result = await dispatchTool("travel_tips", `Bearer ${secret}`, { locale: "EN" });
    expect(result.status).toBe(400);
    expect(result.envelope.ok).toBe(false);
    expect(result.envelope.outcome?.key).toBe("errors.invalid_input");
  });

  it("should_return_502_travel_tips_failed_on_generic_error", async () => {
    vi.mocked(travelTips).mockRejectedValue(new Error("boom"));
    const secret = await makeCaller();
    const result = await dispatchTool("travel_tips", `Bearer ${secret}`, {
      destination: "Lisbon",
      locale: "EN",
    });
    expect(result.status).toBe(502);
    expect(result.envelope.outcome?.key).toBe("errors.travel_tips_failed");
  });

  it("should_return_502_travel_tips_timeout_on_timeout_error", async () => {
    vi.mocked(travelTips).mockRejectedValue(new TravelTipsTimeoutError());
    const secret = await makeCaller();
    const result = await dispatchTool("travel_tips", `Bearer ${secret}`, {
      destination: "Lisbon",
      locale: "EN",
    });
    expect(result.status).toBe(502);
    expect(result.envelope.outcome?.key).toBe("errors.travel_tips_timeout");
  });

  it("TC-M18-76-01 should_dual_write_iconic_artifacts_and_return_trip_id", async () => {
    vi.mocked(travelTips).mockResolvedValue({
      ...sampleResult,
      intro: "",
      transit: "",
      clothing: "",
      safety: "",
    } as never);
    const secret = await makeCaller();
    const result = await dispatchTool("travel_tips", `Bearer ${secret}`, {
      destination: "Lisbon",
      locale: "EN",
    });
    expect(result.status).toBe(200);
    const data = result.envelope.data as {
      iconic_places: string[];
      trip_id: string;
      revision: number;
    };
    expect(data.iconic_places).toEqual(["Belém Tower"]);
    expect(data.trip_id).toBeTruthy();
    const fetched = await dispatchTool("fetch_trip_details", `Bearer ${secret}`, {
      trip_id: data.trip_id,
      fields: ["artifacts"],
      locale: "EN",
    });
    expect(fetched.status).toBe(200);
    const arts = (fetched.envelope.data as { data: { artifacts: { tips: { iconic_places: string[] } } } })
      .data.artifacts;
    expect(arts.tips.iconic_places).toEqual(["Belém Tower"]);
  });

  it("TC-M18-76-02 should_write_visa_artifacts_without_wiping_tips", async () => {
    vi.mocked(travelTips).mockResolvedValue(sampleResult as never);
    const secret = await makeCaller();
    const tips = await dispatchTool("travel_tips", `Bearer ${secret}`, {
      destination: "Lisbon",
      locale: "EN",
    });
    const tripId = (tips.envelope.data as { trip_id: string }).trip_id;
    const visa = await dispatchTool("visa_requirement", `Bearer ${secret}`, {
      passport: "CHN",
      destination: "JPN",
      trip_id: tripId,
      revision: (tips.envelope.data as { revision: number }).revision,
      locale: "EN",
    });
    expect(visa.status).toBe(200);
    const fetched = await dispatchTool("fetch_trip_details", `Bearer ${secret}`, {
      trip_id: tripId,
      fields: ["artifacts"],
      locale: "EN",
    });
    const arts = (fetched.envelope.data as {
      data: { artifacts: { tips: { iconic_places: string[] }; visa: { destination: string } } };
    }).data.artifacts;
    expect(arts.tips.iconic_places).toEqual(["Belém Tower"]);
    expect(arts.visa.destination).toBe("JPN");
  });
});
