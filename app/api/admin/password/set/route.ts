import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/db/client";
import { hashPassword, hashToken } from "@/src/core/crypto";
import { writeSession, readSession, clearSession } from "@/src/auth/session";
import { csrfOk } from "@/src/auth/csrf";
import { adminError } from "@/src/auth/admin";

export async function POST(request: NextRequest) {
  if (!csrfOk(request)) return adminError("errors.csrf", 403);
  const body = (await request.json().catch(() => ({}))) as {
    password?: string;
    confirm?: string;
    token?: string;
  };
  if (!body.password || body.password !== body.confirm) {
    return adminError("errors.password_mismatch", 400);
  }
  const now = new Date();
  let user = null;
  const usesToken = Boolean(body.token?.trim());
  if (usesToken) {
    const tokenHash = hashToken(body.token!.trim());
    user = await prisma.adminUser.findFirst({
      where: { resetTokenHash: tokenHash, resetTokenExpiresAt: { gt: now } },
    });
    if (!user) return adminError("errors.reset_link_expired", 401);
  } else {
    const session = await readSession();
    if (!session) return adminError("errors.session_expired", 401);
    user = await prisma.adminUser.findUnique({ where: { id: session.userId } });
    if (!user) return adminError("errors.session_expired", 401);
  }
  await prisma.adminUser.update({
    where: { id: user.id },
    data: {
      passwordHash: await hashPassword(body.password),
      resetTokenHash: null,
      resetTokenExpiresAt: null,
    },
  });
  if (usesToken) {
    await clearSession();
    return NextResponse.json({ ok: true, next: "sign_in" as const });
  }
  await writeSession({ userId: user.id, username: user.username });
  return NextResponse.json({ ok: true, next: "admin" as const });
}
