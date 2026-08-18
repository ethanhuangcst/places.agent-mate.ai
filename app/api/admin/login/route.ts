import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/db/client";
import { verifyPassword } from "@/src/core/crypto";
import { writeSession } from "@/src/auth/session";
import { csrfOk } from "@/src/auth/csrf";
import { normalizeAdminEmail } from "@/src/auth/admin-email";
import { adminError } from "@/src/auth/admin";

export async function POST(request: NextRequest) {
  if (!csrfOk(request)) return adminError("errors.csrf", 403);
  const body = (await request.json().catch(() => ({}))) as {
    identity?: string;
    password?: string;
  };
  const identity = body.identity?.trim() ?? "";
  const password = body.password ?? "";
  const user = await prisma.adminUser.findFirst({
    where: {
      OR: [
        { username: identity },
        ...(identity.includes("@") ? [{ email: normalizeAdminEmail(identity) }] : []),
      ],
    },
  });
  if (!user || !user.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
    return adminError("errors.login_failed", 401);
  }
  await writeSession({ userId: user.id, username: user.username });
  return NextResponse.json({
    ok: true,
    mustSetPassword: !user.passwordHash,
    name: user.username,
  });
}
