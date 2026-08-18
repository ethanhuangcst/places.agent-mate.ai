import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "../src/db/client";
import { hashToken } from "../src/core/crypto";
import {
  adminTokenKind,
  inviteTokenEmail,
  isInviteTokenValid,
} from "../src/auth/token-validation";

describe("token-validation invite vs reset", () => {
  const inviteEmail = "token-kind-invite@example.com";
  const resetEmail = "token-kind-reset@example.com";
  let inviteToken = "";
  let resetToken = "";

  afterEach(async () => {
    await prisma.adminUser.deleteMany({
      where: { email: { in: [inviteEmail, resetEmail] } },
    });
  });

  it("should_classify_invite_and_reset_tokens", async () => {
    inviteToken = crypto.randomUUID();
    resetToken = crypto.randomUUID();
    await prisma.adminUser.create({
      data: {
        email: inviteEmail,
        username: "pending-invite",
        passwordHash: "",
        inviteTokenHash: hashToken(inviteToken),
        inviteTokenExpiresAt: new Date(Date.now() + 3600_000),
      },
    });
    await prisma.adminUser.create({
      data: {
        email: resetEmail,
        username: "resetuser",
        passwordHash: "hash",
        resetTokenHash: hashToken(resetToken),
        resetTokenExpiresAt: new Date(Date.now() + 3600_000),
      },
    });

    expect(await adminTokenKind(inviteToken)).toBe("invite");
    expect(await adminTokenKind(resetToken)).toBe("reset");
    expect(await isInviteTokenValid(inviteToken)).toBe(true);
    expect(await isInviteTokenValid(resetToken)).toBe(false);
    expect(await inviteTokenEmail(inviteToken)).toBe(inviteEmail);
    expect(await inviteTokenEmail(resetToken)).toBeNull();
  });
});
