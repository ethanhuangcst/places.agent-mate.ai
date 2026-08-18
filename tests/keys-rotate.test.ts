import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/db/client";
import { generateCallerSecret } from "../src/core/crypto";
import { authenticateCaller } from "../src/auth/caller";

describe("caller key rotation", () => {
  beforeEach(async () => {
    await prisma.callerApiKey.deleteMany();
  });
  afterEach(async () => {
    await prisma.callerApiKey.deleteMany();
  });

  it("should_invalidate_previous_secret_when_hash_is_rotated", async () => {
    const first = generateCallerSecret();
    const row = await prisma.callerApiKey.create({
      data: {
        name: "rotate",
        keyHash: first.keyHash,
        prefix: first.prefix,
        status: "ACTIVE",
      },
    });
    const second = generateCallerSecret();
    await prisma.callerApiKey.update({
      where: { id: row.id },
      data: { keyHash: second.keyHash, prefix: second.prefix },
    });
    expect((await authenticateCaller(`Bearer ${first.secret}`)).ok).toBe(false);
    expect((await authenticateCaller(`Bearer ${second.secret}`)).ok).toBe(true);
  });
});
