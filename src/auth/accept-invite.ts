import { prisma } from "../db/client";
import { hashPassword, hashToken } from "../core/crypto";
import { isValidUsername, normalizeUsername } from "./username";

export type AcceptInviteInput = {
  token: string;
  firstName: string;
  lastName: string;
  username: string;
  password: string;
  confirm: string;
};

export type AcceptInviteResult =
  | { ok: true; next: "sign_in" }
  | { error: string; status: number };

export async function acceptAdminInvite(
  input: AcceptInviteInput,
): Promise<AcceptInviteResult> {
  const token = input.token.trim();
  if (!token) return { error: "errors.invite_link_expired", status: 401 };

  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const username = normalizeUsername(input.username);
  if (!firstName || !lastName) return { error: "errors.name_required", status: 400 };
  if (!isValidUsername(username)) return { error: "errors.username_invalid", status: 400 };
  if (!input.password || input.password !== input.confirm) {
    return { error: "errors.password_mismatch", status: 400 };
  }

  const tokenHash = hashToken(token);
  const now = new Date();
  const user = await prisma.adminUser.findFirst({
    where: { inviteTokenHash: tokenHash, inviteTokenExpiresAt: { gt: now } },
  });
  if (!user) return { error: "errors.invite_link_expired", status: 401 };

  const taken = await prisma.adminUser.findFirst({
    where: { username, NOT: { id: user.id } },
    select: { id: true },
  });
  if (taken) return { error: "errors.username_taken", status: 409 };

  await prisma.adminUser.update({
    where: { id: user.id },
    data: {
      firstName,
      lastName,
      username,
      passwordHash: await hashPassword(input.password),
      inviteTokenHash: null,
      inviteTokenExpiresAt: null,
      resetTokenHash: null,
      resetTokenExpiresAt: null,
    },
  });

  return { ok: true, next: "sign_in" };
}
