import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, adminError } from "@/src/auth/admin";
import { prisma } from "@/src/db/client";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: Ctx) {
  const gate = await requireAdmin(request);
  if ("error" in gate && gate.error) return gate.error;
  const { id } = await ctx.params;
  const row = await prisma.callerApiKey.findUnique({ where: { id } });
  if (!row) return adminError("errors.place_not_found", 404);
  return NextResponse.json({
    id: row.id,
    name: row.name,
    description: row.description,
    prefix: row.prefix,
    status: row.status,
  });
}

export async function PATCH(request: NextRequest, ctx: Ctx) {
  const gate = await requireAdmin(request);
  if ("error" in gate && gate.error) return gate.error;
  const { id } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    description?: string;
  };
  const row = await prisma.callerApiKey.update({
    where: { id },
    data: {
      ...(body.name != null ? { name: body.name } : {}),
      ...(body.description != null ? { description: body.description } : {}),
    },
  });
  return NextResponse.json({ id: row.id, name: row.name, description: row.description });
}

export async function DELETE(request: NextRequest, ctx: Ctx) {
  const gate = await requireAdmin(request);
  if ("error" in gate && gate.error) return gate.error;
  const { id } = await ctx.params;
  await prisma.callerApiKey.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
