import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "../src/db/client";
import { hashPassword, hashToken } from "../src/core/crypto";
import { acceptAdminInvite } from "../src/auth/accept-invite";

describe("acceptAdminInvite", () => {
  const email = "accept-api-test@example.com";

  afterEach(async () => {
    await prisma.adminUser.deleteMany({
      where: { email: { in: [email, "other@example.com"] } },
    });
  });

  async function seedPending(token: string) {
    await prisma.adminUser.create({
      data: {
        email,
        username: `pending-${token.slice(0, 8)}`,
        passwordHash: "",
        inviteTokenHash: hashToken(token),
        inviteTokenExpiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      },
    });
  }

  it("should_create_admin_when_invite_token_is_valid", async () => {
    const token = crypto.randomUUID();
    await seedPending(token);

    const result = await acceptAdminInvite({
      token,
      firstName: "Accept",
      lastName: "Test",
      username: "accepttest",
      password: "devpass123",
      confirm: "devpass123",
    });

    expect(result).toEqual({ ok: true, next: "sign_in" });

    const user = await prisma.adminUser.findUnique({ where: { email } });
    expect(user?.username).toBe("accepttest");
    expect(user?.firstName).toBe("Accept");
    expect(user?.lastName).toBe("Test");
    expect(user?.passwordHash).not.toBe("");
    expect(user?.inviteTokenHash).toBeNull();
  });

  it("should_reject_empty_token", async () => {
    const result = await acceptAdminInvite({
      token: "",
      firstName: "A",
      lastName: "B",
      username: "abuser",
      password: "x",
      confirm: "x",
    });
    expect(result).toEqual({ error: "errors.invite_link_expired", status: 401 });
  });

  it("should_reject_expired_token", async () => {
    const token = crypto.randomUUID();
    await prisma.adminUser.create({
      data: {
        email,
        username: `pending-${token.slice(0, 8)}`,
        passwordHash: "",
        inviteTokenHash: hashToken(token),
        inviteTokenExpiresAt: new Date(Date.now() - 1000),
      },
    });

    const result = await acceptAdminInvite({
      token,
      firstName: "A",
      lastName: "B",
      username: "abuser",
      password: "devpass123",
      confirm: "devpass123",
    });
    expect(result).toEqual({ error: "errors.invite_link_expired", status: 401 });
  });

  it("should_reject_password_mismatch", async () => {
    const token = crypto.randomUUID();
    await seedPending(token);

    const result = await acceptAdminInvite({
      token,
      firstName: "A",
      lastName: "B",
      username: "abuser",
      password: "one",
      confirm: "two",
    });
    expect(result).toEqual({ error: "errors.password_mismatch", status: 400 });
  });

  it("should_reject_invalid_username", async () => {
    const token = crypto.randomUUID();
    await seedPending(token);

    const result = await acceptAdminInvite({
      token,
      firstName: "A",
      lastName: "B",
      username: "ab",
      password: "devpass123",
      confirm: "devpass123",
    });
    expect(result).toEqual({ error: "errors.username_invalid", status: 400 });
  });

  it("should_reject_username_taken", async () => {
    const token = crypto.randomUUID();
    await seedPending(token);
    await prisma.adminUser.create({
      data: {
        email: "other@example.com",
        username: "takenname",
        passwordHash: await hashPassword("x"),
      },
    });

    const result = await acceptAdminInvite({
      token,
      firstName: "A",
      lastName: "B",
      username: "takenname",
      password: "devpass123",
      confirm: "devpass123",
    });
    expect(result).toEqual({ error: "errors.username_taken", status: 409 });
  });
});
