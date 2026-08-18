import { NextRequest, NextResponse } from "next/server";
import { adminError } from "@/src/auth/admin";
import { csrfOk } from "@/src/auth/csrf";
import { acceptAdminInvite } from "@/src/auth/accept-invite";
import { inviteTokenEmail } from "@/src/auth/token-validation";
import { clearSession } from "@/src/auth/session";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token")?.trim() ?? "";
  if (!token) return adminError("errors.invite_link_expired", 400);
  const email = await inviteTokenEmail(token);
  if (!email) return adminError("errors.invite_link_expired", 400);
  return NextResponse.json({ email });
}

export async function POST(request: NextRequest) {
  if (!csrfOk(request)) return adminError("errors.csrf", 403);
  const body = (await request.json().catch(() => ({}))) as {
    token?: string;
    firstName?: string;
    lastName?: string;
    username?: string;
    password?: string;
    confirm?: string;
  };

  const result = await acceptAdminInvite({
    token: body.token ?? "",
    firstName: body.firstName ?? "",
    lastName: body.lastName ?? "",
    username: body.username ?? "",
    password: body.password ?? "",
    confirm: body.confirm ?? "",
  });

  if ("error" in result) return adminError(result.error, result.status);
  await clearSession();
  return NextResponse.json({ ok: true, next: result.next });
}
