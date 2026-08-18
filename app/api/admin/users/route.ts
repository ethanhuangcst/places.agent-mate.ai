import { NextResponse } from "next/server";
import { requireAdmin } from "@/src/auth/admin";
import { prisma } from "@/src/db/client";
import { adminDisplayName } from "@/src/auth/username";

export async function GET(request: Request) {
  const gate = await requireAdmin(request);
  if ("error" in gate && gate.error) return gate.error;
  const users = await prisma.adminUser.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      username: true,
      firstName: true,
      lastName: true,
      email: true,
      passwordHash: true,
      createdAt: true,
    },
  });
  return NextResponse.json({
    users: users.map((u) => ({
      id: u.id,
      name: adminDisplayName(u),
      email: u.email,
      status: u.passwordHash ? "ACTIVE" : "PENDING",
    })),
  });
}
