import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, adminError } from "@/src/auth/admin";
import { removeAdminUser, validateDeleteAdmin } from "@/src/auth/delete-admin";
import { deleteMailContent, sendAdminMail } from "@/src/auth/mail";
import { parseLocale } from "@/src/core/locales";
import { readLocaleCookie } from "@/src/auth/session";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(request: NextRequest, ctx: Ctx) {
  const gate = await requireAdmin(request);
  if ("error" in gate && gate.error) return gate.error;

  const { id } = await ctx.params;
  const check = await validateDeleteAdmin(gate.user.id, id);
  if ("error" in check) return adminError(check.error, check.status);

  const locale = parseLocale(await readLocaleCookie());
  const mail = deleteMailContent(locale);
  const sent = await sendAdminMail({
    to: check.email,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
  });
  if (!sent) return adminError("errors.delete_admin_failed", 502);

  await removeAdminUser(id);
  return NextResponse.json({ ok: true });
}
