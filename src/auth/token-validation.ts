import { prisma } from "../db/client";
import { hashToken } from "../core/crypto";

export type AdminTokenKind = "reset" | "invite";

async function findUserByToken(token: string) {
  const tokenHash = hashToken(token);
  const now = new Date();
  return prisma.adminUser.findFirst({
    where: {
      OR: [
        { resetTokenHash: tokenHash, resetTokenExpiresAt: { gt: now } },
        { inviteTokenHash: tokenHash, inviteTokenExpiresAt: { gt: now } },
      ],
    },
    select: {
      id: true,
      email: true,
      resetTokenHash: true,
      inviteTokenHash: true,
    },
  });
}

export async function adminTokenKind(token: string): Promise<AdminTokenKind | null> {
  const user = await findUserByToken(token);
  if (!user) return null;
  const tokenHash = hashToken(token);
  if (user.resetTokenHash === tokenHash) return "reset";
  if (user.inviteTokenHash === tokenHash) return "invite";
  return null;
}

export async function isSetPasswordTokenValid(token: string): Promise<boolean> {
  return (await adminTokenKind(token)) === "reset";
}

export async function isInviteTokenValid(token: string): Promise<boolean> {
  return (await adminTokenKind(token)) === "invite";
}

export async function inviteTokenEmail(token: string): Promise<string | null> {
  const user = await findUserByToken(token);
  if (!user || user.inviteTokenHash !== hashToken(token)) return null;
  return user.email;
}
