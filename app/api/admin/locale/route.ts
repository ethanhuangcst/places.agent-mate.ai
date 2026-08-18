import { NextRequest, NextResponse } from "next/server";
import { parseLocale } from "@/src/core/locales";
import { writeLocaleCookie } from "@/src/auth/session";
import { csrfOk } from "@/src/auth/csrf";
import { adminError } from "@/src/auth/admin";

export async function POST(request: NextRequest) {
  if (!csrfOk(request)) return adminError("errors.csrf", 403);
  const body = (await request.json().catch(() => ({}))) as { locale?: string };
  const locale = parseLocale(body.locale);
  await writeLocaleCookie(locale);
  return NextResponse.json({ ok: true, locale });
}
