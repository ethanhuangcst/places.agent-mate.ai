import { NextRequest, NextResponse } from "next/server";
import { clearSession } from "@/src/auth/session";
import { csrfOk } from "@/src/auth/csrf";
import { adminError } from "@/src/auth/admin";

export async function POST(request: NextRequest) {
  if (!csrfOk(request)) return adminError("errors.csrf", 403);
  await clearSession();
  return NextResponse.json({ ok: true });
}
