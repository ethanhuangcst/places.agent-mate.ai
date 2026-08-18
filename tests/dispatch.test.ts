import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/db/client";
import { generateCallerSecret, hashPassword } from "../src/core/crypto";
import { authenticateCaller } from "../src/auth/caller";
import { dispatchTool } from "../src/http/dispatch";
import { AGENT_ID } from "../src/core/locales";

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
});
