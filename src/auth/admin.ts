import "server-only";
import { NextResponse } from "next/server";
import { readSession } from "./session";
import { csrfOk } from "./csrf";
import { prisma } from "../db/client";

export function adminError(key: string, status = 400) {
  return NextResponse.json({ error: { key } }, { status });
}

export async function requireAdmin(request: Request) {
  if (request.method !== "GET" && !csrfOk(request)) {
    return { error: adminError("errors.csrf", 403) as NextResponse };
  }
  const session = await readSession();
  if (!session) {
    return { error: adminError("errors.session_expired", 401) as NextResponse };
  }
  const user = await prisma.adminUser.findUnique({ where: { id: session.userId } });
  if (!user) {
    return { error: adminError("errors.session_expired", 401) as NextResponse };
  }
  return { user };
}
