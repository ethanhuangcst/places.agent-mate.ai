import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, adminError } from "@/src/auth/admin";
import { deleteCallerKeys, parseBulkDeleteIds } from "@/src/auth/delete-caller-keys";
import { prisma } from "@/src/db/client";
import { generateCallerSecret } from "@/src/core/crypto";

export async function GET(request: Request) {
  const gate = await requireAdmin(request);
  if ("error" in gate && gate.error) return gate.error;
  const keys = await prisma.callerApiKey.findMany({
    where: { status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({
    keys: keys.map((k) => ({
      id: k.id,
      name: k.name,
      description: k.description,
      prefix: k.prefix,
      status: k.status,
      issued: k.createdAt.toISOString().slice(0, 10),
    })),
  });
}

export async function POST(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ("error" in gate && gate.error) return gate.error;
  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    description?: string;
  };
  if (!body.name?.trim()) return adminError("admin.keys.name", 400);
  const generated = generateCallerSecret();
  const row = await prisma.callerApiKey.create({
    data: {
      name: body.name.trim(),
      description: body.description?.trim() ?? "",
      keyHash: generated.keyHash,
      prefix: generated.prefix,
      status: "ACTIVE",
    },
  });
  return NextResponse.json({
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    secret: generated.secret,
  });
}

export async function DELETE(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ("error" in gate && gate.error) return gate.error;
  const body: unknown = await request.json().catch(() => ({}));
  const parsed = parseBulkDeleteIds(body);
  if ("error" in parsed) return adminError(parsed.error, parsed.status);
  const deleted = await deleteCallerKeys(parsed.ids);
  return NextResponse.json({ ok: true, deleted });
}
