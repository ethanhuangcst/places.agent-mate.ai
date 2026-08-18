import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "../src/db/client";
import { hashPassword } from "../src/core/crypto";
import { validateDeleteAdmin, removeAdminUser } from "../src/auth/delete-admin";

describe("validateDeleteAdmin", () => {
  const actorEmail = "delete-actor@example.com";
  const targetEmail = "delete-target@example.com";
  let actorId = "";
  let targetId = "";

  afterEach(async () => {
    await prisma.adminUser.deleteMany({
      where: { email: { in: [actorEmail, targetEmail, "solo@example.com"] } },
    });
    actorId = "";
    targetId = "";
  });

  async function seedPair() {
    const actor = await prisma.adminUser.create({
      data: {
        email: actorEmail,
        username: "delete-actor",
        passwordHash: await hashPassword("pass"),
      },
    });
    const target = await prisma.adminUser.create({
      data: {
        email: targetEmail,
        username: "delete-target",
        passwordHash: await hashPassword("pass"),
      },
    });
    actorId = actor.id;
    targetId = target.id;
  }

  it("should_allow_delete_when_actor_and_target_differ_and_more_than_one_admin", async () => {
    await seedPair();
    const result = await validateDeleteAdmin(actorId, targetId);
    expect(result).toEqual({ ok: true, email: targetEmail });
  });

  it("should_reject_self_delete", async () => {
    await seedPair();
    const result = await validateDeleteAdmin(actorId, actorId);
    expect(result).toEqual({ error: "errors.cannot_delete_self", status: 403 });
  });

  it("should_reject_delete_when_target_missing", async () => {
    await seedPair();
    const result = await validateDeleteAdmin(actorId, "missing-id");
    expect(result).toEqual({ error: "errors.admin_not_found", status: 404 });
  });

  it("should_reject_delete_when_only_one_admin_exists", async () => {
    const solo = await prisma.adminUser.create({
      data: {
        email: "solo@example.com",
        username: "solo-admin",
        passwordHash: await hashPassword("pass"),
      },
    });
    const result = await validateDeleteAdmin(solo.id, solo.id);
    expect(result).toEqual({ error: "errors.cannot_delete_self", status: 403 });
  });

  it("should_remove_admin_user_from_database", async () => {
    await seedPair();
    await removeAdminUser(targetId);
    const gone = await prisma.adminUser.findUnique({ where: { id: targetId } });
    expect(gone).toBeNull();
  });
});
