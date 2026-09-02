import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/db/client";
import { generateCallerSecret, hashPassword } from "../src/core/crypto";
import { postTool } from "../src/http/route";
import { makeItinerary } from "../src/core/make-itinerary";

vi.mock("../src/core/make-itinerary", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/core/make-itinerary")>();
  return { ...actual, makeItinerary: vi.fn() };
});

const ADMIN = { username: "admin", email: "me@ethanhuang.com" };

async function resetDb() {
  await prisma.callerApiKey.deleteMany();
  await prisma.adminUser.deleteMany();
  await prisma.adminUser.create({
    data: { ...ADMIN, passwordHash: await hashPassword("devpass") },
  });
}

async function readNdjson(response: Response): Promise<Array<Record<string, unknown>>> {
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("application/x-ndjson; charset=utf-8");
  const text = await response.text();
  return text
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

describe("postTool NDJSON — make_itinerary (TC-M10-43-03)", () => {
  beforeEach(async () => {
    await resetDb();
    vi.mocked(makeItinerary).mockReset();
  });
  afterEach(async () => {
    await prisma.callerApiKey.deleteMany();
  });

  it("should_return_ndjson_content_type_and_stream_skeleton_events", async () => {
    const generated = generateCallerSecret();
    await prisma.callerApiKey.create({
      data: {
        name: "test",
        keyHash: generated.keyHash,
        prefix: generated.prefix,
        status: "ACTIVE",
      },
    });

    vi.mocked(makeItinerary).mockImplementation(async (_input, opts) => {
      opts?.onEvent?.({ type: "skeleton_start", total_days: 1 });
      opts?.onEvent?.({
        type: "skeleton_day",
        day: { day_index: 1, day_theme: "Belém", stops: [{ name: "Torre", kind: "attraction" }] },
      });
      opts?.onEvent?.({ type: "skeleton_done", days_count: 1 });
      return { skeleton: { days: [] }, candidates_slim: { places: [], restaurants: [] } };
    });

    const request = new Request("http://localhost/v1/make_itinerary", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/x-ndjson",
        authorization: `Bearer ${generated.secret}`,
      },
      body: JSON.stringify({
        city: "Lisbon",
        numDays: 1,
        candidates: { places: [{ name: "Torre" }], restaurants: [] },
        locale: "EN",
      }),
    });

    const response = await postTool("make_itinerary", request);
    const events = await readNdjson(response);
    expect(events.map((e) => e.type)).toEqual(["skeleton_start", "skeleton_day", "skeleton_done"]);
  });

  it("should_fall_back_to_json_when_accept_header_missing", async () => {
    const generated = generateCallerSecret();
    await prisma.callerApiKey.create({
      data: {
        name: "test",
        keyHash: generated.keyHash,
        prefix: generated.prefix,
        status: "ACTIVE",
      },
    });
    vi.mocked(makeItinerary).mockResolvedValue({
      skeleton: { days: [] },
      candidates_slim: { places: [], restaurants: [] },
    });
    const request = new Request("http://localhost/v1/make_itinerary", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${generated.secret}`,
      },
      body: JSON.stringify({
        city: "Lisbon",
        numDays: 1,
        candidates: { places: [], restaurants: [] },
        locale: "EN",
      }),
    });
    const response = await postTool("make_itinerary", request);
    expect(response.headers.get("content-type")).toContain("application/json");
    const body = (await response.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });
});
