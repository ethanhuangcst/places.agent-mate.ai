import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/db/client";
import { generateCallerSecret, hashPassword } from "../src/core/crypto";
import { authenticateCaller } from "../src/auth/caller";
import { dispatchTool } from "../src/http/dispatch";
import { AGENT_ID } from "../src/core/locales";
import { arrangeDay, discoverPlaces } from "../src/core/itinerary-planner";

vi.mock("../src/core/itinerary-planner", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/core/itinerary-planner")>();
  return {
    ...actual,
    discoverPlaces: vi.fn(),
    arrangeDay: vi.fn(),
  };
});

const ADMIN = {
  username: "admin",
  email: "me@ethanhuang.com",
};

async function resetDb() {
  await prisma.callerApiKey.deleteMany();
  await prisma.adminUser.deleteMany();
  await prisma.adminUser.create({
    data: {
      ...ADMIN,
      passwordHash: await hashPassword("devpass"),
    },
  });
}

describe("caller auth and HTTP dispatch", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterEach(async () => {
    await prisma.callerApiKey.deleteMany();
  });

  it("should_reject_missing_bearer_with_unauthorized_key", async () => {
    const result = await dispatchTool("search_restaurants", null, { query: "Yat" });
    expect(result.status).toBe(401);
    expect(result.envelope.agent).toBe(AGENT_ID);
    expect(result.envelope.ok).toBe(false);
    expect(result.envelope.outcome?.key).toBe("errors.caller_unauthorized");
  });

  it("should_search_restaurants_when_caller_key_is_valid", async () => {
    const generated = generateCallerSecret();
    await prisma.callerApiKey.create({
      data: {
        name: "test",
        keyHash: generated.keyHash,
        prefix: generated.prefix,
        status: "ACTIVE",
      },
    });
    const result = await dispatchTool(
      "search_restaurants",
      `Bearer ${generated.secret}`,
      { query: "Yat", providers: ["GOOGLE_MAPS"], locale: "EN" },
    );
    expect(result.status).toBe(200);
    expect(result.envelope.agent).toBe(AGENT_ID);
    expect(result.envelope.ok).toBe(true);
    expect(Array.isArray(result.envelope.data)).toBe(true);
    const cards = result.envelope.data as { sources: { provider: string }[] }[];
    expect(cards[0]?.sources[0]?.provider).toBe("GOOGLE_MAPS");
  });

  it("should_search_places_when_caller_key_is_valid", async () => {
    const generated = generateCallerSecret();
    await prisma.callerApiKey.create({
      data: {
        name: "test",
        keyHash: generated.keyHash,
        prefix: generated.prefix,
        status: "ACTIVE",
      },
    });
    const result = await dispatchTool(
      "search_places",
      `Bearer ${generated.secret}`,
      { query: "museum", providers: ["GOOGLE_MAPS"], locale: "EN" },
    );
    expect(result.status).toBe(200);
    expect(result.envelope.agent).toBe(AGENT_ID);
    expect(result.envelope.ok).toBe(true);
    const cards = result.envelope.data as { category?: string }[];
    expect(cards.length).toBeGreaterThan(0);
    expect(cards[0]?.category).not.toBe("restaurant");
  });

  it("should_return_empty_results_key_when_no_match", async () => {
    const generated = generateCallerSecret();
    await prisma.callerApiKey.create({
      data: {
        name: "test",
        keyHash: generated.keyHash,
        prefix: generated.prefix,
        status: "ACTIVE",
      },
    });
    const result = await dispatchTool(
      "search_restaurants",
      `Bearer ${generated.secret}`,
      { query: "__empty__", providers: ["GOOGLE_MAPS"] },
    );
    expect(result.status).toBe(200);
    expect(result.envelope.data).toEqual([]);
    expect(result.envelope.outcome?.key).toBe("errors.empty_results");
  });

  it("should_reject_revoked_key", async () => {
    const generated = generateCallerSecret();
    await prisma.callerApiKey.create({
      data: {
        name: "revoked",
        keyHash: generated.keyHash,
        prefix: generated.prefix,
        status: "REVOKED",
      },
    });
    const auth = await authenticateCaller(`Bearer ${generated.secret}`);
    expect(auth.ok).toBe(false);
  });

  it("should_include_locale_pair_on_outcome", async () => {
    const generated = generateCallerSecret();
    await prisma.callerApiKey.create({
      data: {
        name: "test",
        keyHash: generated.keyHash,
        prefix: generated.prefix,
        status: "ACTIVE",
      },
    });
    const result = await dispatchTool(
      "search_restaurants",
      `Bearer ${generated.secret}`,
      {
        query: "__empty__",
        providers: ["GOOGLE_MAPS"],
        locale: "HK",
        locales: ["HK", "EN"],
      },
    );
    expect(result.envelope.locale).toBe("HK");
    expect(result.envelope.outcome?.locales?.HK).toBeTruthy();
    expect(result.envelope.outcome?.locales?.EN).toBeTruthy();
  });

  it("should_reject_invalid_get_place_details_and_plan_bodies", async () => {
    const generated = generateCallerSecret();
    await prisma.callerApiKey.create({
      data: {
        name: "test",
        keyHash: generated.keyHash,
        prefix: generated.prefix,
        status: "ACTIVE",
      },
    });
    const auth = `Bearer ${generated.secret}`;
    const badDetails = await dispatchTool("get_place_details", auth, { provider: "" });
    expect(badDetails.status).toBe(400);
    const okDetails = await dispatchTool("get_place_details", auth, {
      provider: "GOOGLE_MAPS",
      native_id: "fixture_yat_lok",
    });
    expect(okDetails.status).toBe(200);
    const badPlan = await dispatchTool("plan_itinerary", auth, { bounds: { start: 1 } });
    expect(badPlan.status).toBe(400);
  });

  it("should_return_candidates_when_discover_places_http_is_valid", async () => {
    const generated = generateCallerSecret();
    await prisma.callerApiKey.create({
      data: {
        name: "test",
        keyHash: generated.keyHash,
        prefix: generated.prefix,
        status: "ACTIVE",
      },
    });
    vi.mocked(discoverPlaces).mockResolvedValue({
      candidates: { places: [{ name: "Museum" } as never], restaurants: [] },
      weather: [{ date: "2026-08-25", label: "sunny" }],
    });
    const result = await dispatchTool("discover_places", `Bearer ${generated.secret}`, {
      city: "Shanghai",
      bounds: { start: "2026-08-25T00:00:00Z", end: "2026-08-25T23:59:59Z" },
      locale: "EN",
    });
    expect(result.status).toBe(200);
    expect(result.envelope.ok).toBe(true);
    expect(result.envelope.agent).toBe(AGENT_ID);
    const data = result.envelope.data as { candidates: { places: { name: string }[] } };
    expect(data.candidates.places[0]?.name).toBe("Museum");
  });

  it("should_reject_discover_places_when_city_missing", async () => {
    const generated = generateCallerSecret();
    await prisma.callerApiKey.create({
      data: {
        name: "test",
        keyHash: generated.keyHash,
        prefix: generated.prefix,
        status: "ACTIVE",
      },
    });
    const result = await dispatchTool("discover_places", `Bearer ${generated.secret}`, {
      bounds: { start: "2026-08-25T00:00:00Z", end: "2026-08-25T23:59:59Z" },
    });
    expect(result.status).toBe(400);
    expect(result.envelope.outcome?.key).toBe("errors.invalid_input");
  });

  it("should_return_must_include_coverage_on_arrange_day_http", async () => {
    const generated = generateCallerSecret();
    await prisma.callerApiKey.create({
      data: {
        name: "test",
        keyHash: generated.keyHash,
        prefix: generated.prefix,
        status: "ACTIVE",
      },
    });
    vi.mocked(arrangeDay).mockResolvedValue({
      day_index: 2,
      blocks: [
        {
          name: "克卢什国家宫",
          type: "attraction",
          start_time: "10:00",
          duration_min: 90,
          reason: "wrong town",
        },
      ],
      must_include_coverage: {
        must_include: ["辛特拉", "卡斯凯什"],
        covered: [],
        missing: ["辛特拉", "卡斯凯什"],
      },
      must_include_focus: "辛特拉",
    } as never);
    const result = await dispatchTool("arrange_day", `Bearer ${generated.secret}`, {
      candidates: {
        places: [{ name: "克卢什国家宫" }],
        restaurants: [],
      },
      dayIndex: 2,
      city: "里斯本",
      locale: "CN",
      preferences: {
        must_include: ["辛特拉", "卡斯凯什"],
        day_theme: "辛特拉整日短途",
      },
    });
    expect(result.status).toBe(200);
    expect(result.envelope.ok).toBe(true);
    const data = result.envelope.data as {
      must_include_coverage: { missing: string[]; covered: string[] };
    };
    expect(data.must_include_coverage.missing).toEqual(["辛特拉", "卡斯凯什"]);
    expect(data.must_include_coverage.covered).toEqual([]);
  });

  it("should_return_empty_missing_when_must_include_coverage_complete_http", async () => {
    const generated = generateCallerSecret();
    await prisma.callerApiKey.create({
      data: {
        name: "test",
        keyHash: generated.keyHash,
        prefix: generated.prefix,
        status: "ACTIVE",
      },
    });
    vi.mocked(arrangeDay).mockResolvedValue({
      day_index: 2,
      blocks: [
        {
          name: "Pena Palace",
          type: "attraction",
          start_time: "10:00",
          duration_min: 90,
          reason: "sintra",
        },
      ],
      must_include_coverage: {
        must_include: ["辛特拉"],
        covered: ["辛特拉"],
        missing: [],
      },
    } as never);
    const result = await dispatchTool("arrange_day", `Bearer ${generated.secret}`, {
      candidates: { places: [{ name: "Pena Palace" }], restaurants: [] },
      dayIndex: 2,
      locale: "CN",
      preferences: { must_include: ["辛特拉"] },
    });
    const data = result.envelope.data as {
      must_include_coverage: { missing: string[] };
    };
    expect(data.must_include_coverage.missing).toEqual([]);
  });

  it("should_return_502_when_discover_places_throws", async () => {
    const generated = generateCallerSecret();
    await prisma.callerApiKey.create({
      data: {
        name: "test",
        keyHash: generated.keyHash,
        prefix: generated.prefix,
        status: "ACTIVE",
      },
    });
    vi.mocked(discoverPlaces).mockRejectedValue(new Error("vendor down"));
    const result = await dispatchTool("discover_places", `Bearer ${generated.secret}`, {
      city: "Shanghai",
      bounds: { start: "2026-08-25T00:00:00Z", end: "2026-08-25T23:59:59Z" },
      locale: "EN",
    });
    expect(result.status).toBe(502);
    expect(result.envelope.ok).toBe(false);
    expect(result.envelope.outcome?.key).toBe("errors.discover_places_failed");
  });

  it("should_return_502_when_arrange_day_throws", async () => {
    const generated = generateCallerSecret();
    await prisma.callerApiKey.create({
      data: {
        name: "test",
        keyHash: generated.keyHash,
        prefix: generated.prefix,
        status: "ACTIVE",
      },
    });
    vi.mocked(arrangeDay).mockRejectedValue(new Error("llm down"));
    const result = await dispatchTool("arrange_day", `Bearer ${generated.secret}`, {
      candidates: { places: [{ name: "Museum" }], restaurants: [] },
      dayIndex: 1,
      locale: "EN",
    });
    expect(result.status).toBe(502);
    expect(result.envelope.ok).toBe(false);
    expect(result.envelope.outcome?.key).toBe("errors.arrange_day_failed");
  });

  it("TC-M11-48-08: should_return_visa_requirement_fixture_envelope", async () => {
    const generated = generateCallerSecret();
    await prisma.callerApiKey.create({
      data: {
        name: "test",
        keyHash: generated.keyHash,
        prefix: generated.prefix,
        status: "ACTIVE",
      },
    });
    const result = await dispatchTool("visa_requirement", `Bearer ${generated.secret}`, {
      passport: "CHN",
      destination: "JPN",
      locale: "CN",
    });
    expect(result.status).toBe(200);
    expect(result.envelope.ok).toBe(true);
    expect(result.envelope.agent).toBe(AGENT_ID);
    const data = result.envelope.data as {
      requirement: string;
      passport: string;
      destination: string;
    };
    expect(data.passport).toBe("CHN");
    expect(data.destination).toBe("JPN");
    expect(data.requirement).toBe("visa_required");
  });

  it("should_accept_omitted_candidates_and_fail_without_city_for_auto_discover", async () => {
    const generated = generateCallerSecret();
    await prisma.callerApiKey.create({
      data: {
        name: "test",
        keyHash: generated.keyHash,
        prefix: generated.prefix,
        status: "ACTIVE",
      },
    });
    // ADR-043 D8: candidates optional (default empty). Without city, auto-discover cannot run.
    const result = await dispatchTool("arrange_day", `Bearer ${generated.secret}`, {
      dayIndex: 1,
      locale: "EN",
    });
    expect(result.status).toBe(502);
    expect(result.envelope.outcome?.key).toBe("errors.arrange_day_failed");
  });
});
