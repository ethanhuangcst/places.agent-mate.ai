import { NextResponse } from "next/server";
import { readSession } from "@/src/auth/session";
import { prisma } from "@/src/db/client";
import { adminDisplayName } from "@/src/auth/username";

export async function GET() {
  const session = await readSession();
  if (!session) return NextResponse.json({ name: null });
  const user = await prisma.adminUser.findUnique({ where: { id: session.userId } });
  if (!user) return NextResponse.json({ name: null });
  return NextResponse.json({
    id: user.id,
    name: adminDisplayName(user) ?? user.username,
    email: user.email,
    mustSetPassword: !user.passwordHash,
  });
}
