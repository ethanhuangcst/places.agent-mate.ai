import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../db/client";
import { generateCallerSecret } from "../core/crypto";
import { authenticateCaller } from "./caller";
import { deleteCallerKeys, parseBulkDeleteIds } from "./delete-caller-keys";

describe("parseBulkDeleteIds", () => {
  it("should_reject_empty_ids_with_invalid_input", () => {
    expect(parseBulkDeleteIds({ ids: [] })).toEqual({
      error: "errors.invalid_input",
      status: 400,
    });
  });

  it("should_reject_missing_ids_with_invalid_input", () => {
    expect(parseBulkDeleteIds({})).toEqual({
      error: "errors.invalid_input",
      status: 400,
    });
  });

  it("should_dedupe_and_trim_valid_ids", () => {
    expect(parseBulkDeleteIds({ ids: [" a ", "b", "a"] })).toEqual({
      ok: true,
      ids: ["a", "b"],
    });
  });

  it("should_reject_more_than_100_ids", () => {
    const ids = Array.from({ length: 101 }, (_, i) => `id-${i}`);
    expect(parseBulkDeleteIds({ ids })).toEqual({
      error: "errors.invalid_input",
      status: 400,
    });
  });
});

describe("deleteCallerKeys", () => {
  beforeEach(async () => {
    await prisma.callerApiKey.deleteMany();
  });
  afterEach(async () => {
    await prisma.callerApiKey.deleteMany();
  });

  it("should_remove_selected_keys_and_reject_those_secrets", async () => {
    const first = generateCallerSecret();
    const second = generateCallerSecret();
    const keep = generateCallerSecret();
    const rowA = await prisma.callerApiKey.create({
      data: {
        name: "bulk-a",
        keyHash: first.keyHash,
        prefix: first.prefix,
        status: "ACTIVE",
      },
    });
    const rowB = await prisma.callerApiKey.create({
      data: {
        name: "bulk-b",
        keyHash: second.keyHash,
        prefix: second.prefix,
        status: "ACTIVE",
      },
    });
    const rowKeep = await prisma.callerApiKey.create({
      data: {
        name: "keep",
        keyHash: keep.keyHash,
        prefix: keep.prefix,
        status: "ACTIVE",
      },
    });

    const deleted = await deleteCallerKeys([rowA.id, rowB.id]);
    expect(deleted).toBe(2);
    expect(await prisma.callerApiKey.findUnique({ where: { id: rowA.id } })).toBeNull();
    expect(await prisma.callerApiKey.findUnique({ where: { id: rowKeep.id } })).not.toBeNull();
    expect((await authenticateCaller(`Bearer ${first.secret}`)).ok).toBe(false);
    expect((await authenticateCaller(`Bearer ${second.secret}`)).ok).toBe(false);
    expect((await authenticateCaller(`Bearer ${keep.secret}`)).ok).toBe(true);
  });

  it("should_ignore_unknown_ids_when_deleting", async () => {
    const deleted = await deleteCallerKeys(["missing-id"]);
    expect(deleted).toBe(0);
  });
});
