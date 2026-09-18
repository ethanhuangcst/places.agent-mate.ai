/**
 * MVP-T9 agent-chat-93e — plan_trip refine mode.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../db/client";
import { generateCallerSecret, hashPassword } from "./crypto";
import { planTrip } from "./plan-trip";
import { applyRefineOperations, parseRefineOperations } from "./plan-trip-refine";
import { dualWriteTrip } from "./trip-dual-write";
import { clearTripMemoryForTests, ensureTrip } from "./trip-store";
import type { ItinerarySkeleton } from "./make-itinerary";
import type { PlaceCard } from "./types";
import type { ToolResult } from "./types";
import { planTripBody } from "../http/schemas";

const ADMIN = { username: "admin", email: "me@ethanhuang.com" };

const FIXTURE_SKELETON: ItinerarySkeleton = {
  days: [
    {
      day_index: 1,
      day_theme: "西湖",
      stops: [
        { name: "酒店", kind: "stay" },
        { name: "苏堤", kind: "attraction" },
        { name: "雷峰塔", kind: "attraction" },
        { name: "lunch", kind: "meal", meal_slot: "lunch" },
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

function okCards(cards: PlaceCard[]): ToolResult<PlaceCard[]> {
  return { data: cards, skipped: [], locale: "CN" };
}

describe("planTripRefine (agent-chat-93e)", () => {
  let callerKey = "";

  beforeEach(async () => {
    process.env.PLACES_VENDOR_MODE = "fixture";
    delete process.env.QWEN_API_KEY;
    delete process.env.OPENAI_API_KEY;
    await resetDb();
    const generated = generateCallerSecret();
    const row = await prisma.callerApiKey.create({
      data: {
        name: "plan-trip-refine",
        keyHash: generated.keyHash,
        prefix: generated.prefix,
        status: "ACTIVE",
      },
    });
    callerKey = row.id;
  });

  afterEach(async () => {
    clearTripMemoryForTests();
  });

  async function seedTrip(): Promise<{ tripId: string; revision: number }> {
    const ensured = await ensureTrip({ callerKey, locale: "CN" });
    const written = await dualWriteTrip({
      callerKey,
      tripId: ensured.trip_id,
      expectedRevision: ensured.revision,
      locale: "CN",
      patch: {
        constraints: { city: "杭州", numDays: 1 },
        skeleton: FIXTURE_SKELETON as unknown as Record<string, unknown>,
        artifacts: {
          filled_stops: [
            {
              day_index: 1,
              stop_index: 1,
              stop: { name: "苏堤", kind: "attraction" },
              slot: { start: "09:30", end: "11:00" },
            },
          ],
        },
      },
    });
    return { tripId: ensured.trip_id, revision: written.revision };
  }

  it("should_remove_stop_and_bump_revision_when_refine_commit", async () => {
    const { tripId, revision } = await seedTrip();
    const result = await planTrip({
      callerKey,
      city: "杭州",
      locale: "CN",
      trip_id: tripId,
      revision,
      refine: { instruction: "删掉雷峰塔" },
      _testRefineTurns: [
        {
          type: "tool",
          name: "commit_trip",
          args: {
            operations: [{ op: "remove_stop", day_index: 1, stop_index: 2 }],
            reply: "已删除雷峰塔。",
          },
        },
        { type: "stop" },
      ],
    });

    expect(result.status).toBe("ready");
    expect(result.revision).toBeGreaterThan(revision);
    expect(result.reply).toBe("已删除雷峰塔。");
    const day = result.itinerary?.skeleton.days[0];
    expect(day?.stops.map((s) => s.name)).toEqual(["酒店", "苏堤", "lunch"]);
    expect(result.tool_calls).toContain("commit_trip");
  });

  it("should_keep_revision_when_stop_without_operations", async () => {
    const { tripId, revision } = await seedTrip();
    const result = await planTrip({
      callerKey,
      city: "杭州",
      locale: "CN",
      trip_id: tripId,
      revision,
      refine: { instruction: "行程很好，不用改" },
      _testRefineTurns: [
        { type: "tool", name: "stop", args: { reply: "好的，行程保持不变。" } },
      ],
    });

    expect(result.status).toBe("ready");
    expect(result.revision).toBe(revision);
    expect(result.reply).toBe("好的，行程保持不变。");
    expect(result.itinerary?.skeleton.days[0]?.stops.length).toBe(4);
  });

  it("should_drop_ungrounded_replace_stop_name", async () => {
    const { tripId, revision } = await seedTrip();
    const result = await planTrip({
      callerKey,
      city: "杭州",
      locale: "CN",
      trip_id: tripId,
      revision,
      refine: { instruction: "把雷峰塔换成虚构景点" },
      _testRefineTurns: [
        {
          type: "tool",
          name: "commit_trip",
          args: {
            operations: [
              { op: "replace_stop", day_index: 1, stop_index: 2, name: "虚构不存在的塔" },
            ],
          },
        },
        { type: "stop" },
      ],
    });

    expect(result.status).toBe("ready");
    expect(result.revision).toBe(revision);
    expect(result.itinerary?.skeleton.days[0]?.stops[2]?.name).toBe("雷峰塔");
  });

  it("should_apply_grounded_replace_from_search", async () => {
    const { tripId, revision } = await seedTrip();
    const result = await planTrip({
      callerKey,
      city: "杭州",
      locale: "CN",
      trip_id: tripId,
      revision,
      refine: { instruction: "把雷峰塔换成灵隐寺" },
      _testSearchPlaces: async () =>
        okCards([
          {
            provider: "AMAP",
            name: "灵隐寺",
            location: { lat: 30.24, lng: 120.1, crs: "WGS84" },
            category: "attraction",
            sources: [{ provider: "AMAP", native_id: "lingyin", deeplinks: {} }],
          },
        ]),
      _testRefineTurns: [
        { type: "tool", name: "search_places", args: { query: "灵隐寺" } },
        {
          type: "tool",
          name: "commit_trip",
          args: {
            operations: [{ op: "replace_stop", day_index: 1, stop_index: 2, name: "灵隐寺" }],
            reply: "已替换为灵隐寺。",
          },
        },
        { type: "stop" },
      ],
    });

    expect(result.status).toBe("ready");
    expect(result.revision).toBeGreaterThan(revision);
    expect(result.itinerary?.skeleton.days[0]?.stops[2]?.name).toBe("灵隐寺");
  });
});

describe("applyRefineOperations unit", () => {
  it("should_parse_and_swap_stops", () => {
    const ops = parseRefineOperations([
      { op: "swap_stops", day_index: 1, from_index: 1, to_index: 2 },
    ]);
    const { skeleton, changed } = applyRefineOperations(FIXTURE_SKELETON, ops, (n) => n);
    expect(changed).toBe(true);
    expect(skeleton.days[0]?.stops[1]?.name).toBe("雷峰塔");
    expect(skeleton.days[0]?.stops[2]?.name).toBe("苏堤");
  });
});

describe("planTripBody refine contract", () => {
  it("should_require_trip_id_when_refine_present", () => {
    const bad = planTripBody.safeParse({
      refine: { instruction: "删掉一个景点" },
    });
    expect(bad.success).toBe(false);

    const ok = planTripBody.safeParse({
      trip_id: "trip-1",
      refine: { instruction: "删掉一个景点" },
    });
    expect(ok.success).toBe(true);
  });
});
