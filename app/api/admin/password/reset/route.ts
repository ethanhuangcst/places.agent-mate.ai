import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/db/client";
import { hashToken } from "@/src/core/crypto";
import { csrfOk } from "@/src/auth/csrf";
import { adminError } from "@/src/auth/admin";
import { normalizeAdminEmail } from "@/src/auth/admin-email";
import { resetMailContent, sendAdminMail } from "@/src/auth/mail";
import { parseLocale } from "@/src/core/locales";
import { readLocaleCookie } from "@/src/auth/session";

export async function POST(request: NextRequest) {
  if (!csrfOk(request)) return adminError("errors.csrf", 403);
  const body = (await request.json().catch(() => ({}))) as { email?: string };
  const email = normalizeAdminEmail(body.email ?? "");
  if (!email) return NextResponse.json({ ok: true });
  const user = await prisma.adminUser.findUnique({ where: { email } });
  const locale = parseLocale(await readLocaleCookie());
  if (user) {
    const token = crypto.randomUUID();
    await prisma.adminUser.update({
      where: { id: user.id },
      data: {
        resetTokenHash: hashToken(token),
        resetTokenExpiresAt: new Date(Date.now() + 1000 * 60 * 60 * 4), // 4 hours
      },
    });
    const mail = resetMailContent(locale, token);
    const sent = await sendAdminMail({
      to: email,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    });
    if (!sent) return adminError("errors.mail_failed", 502);
  }
  return NextResponse.json({ ok: true });
}
