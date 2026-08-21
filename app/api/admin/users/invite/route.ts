import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, adminError } from "@/src/auth/admin";
import { prisma } from "@/src/db/client";
import { hashToken } from "@/src/core/crypto";
import { normalizeAdminEmail } from "@/src/auth/admin-email";
import { inviteMailContent, sendAdminMail } from "@/src/auth/mail";
import { parseLocale } from "@/src/core/locales";
import { readLocaleCookie } from "@/src/auth/session";
import { pendingUsername } from "@/src/auth/username";
import { withPrismaErrorHandler } from "@/src/lib/api-error-handler";

export async function POST(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ("error" in gate && gate.error) return gate.error;
  const body = (await request.json().catch(() => ({}))) as { email?: string };
  const email = normalizeAdminEmail(body.email ?? "");
  if (!email) return adminError("errors.invite_failed", 400);
  const token = crypto.randomUUID();
  return withPrismaErrorHandler(async () => {
  await prisma.adminUser.upsert({
    where: { email },
    update: {
      inviteTokenHash: hashToken(token),
      inviteTokenExpiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
    },
    create: {
      email,
      username: pendingUsername(),
      passwordHash: "",
      inviteTokenHash: hashToken(token),
      inviteTokenExpiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
    },
  });
  const locale = parseLocale(await readLocaleCookie());
  const mail = inviteMailContent(locale, token);
  const sent = await sendAdminMail({
    to: email,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
  });
  if (!sent) return adminError("errors.invite_failed", 502);
  return NextResponse.json({ ok: true });
  });
}
