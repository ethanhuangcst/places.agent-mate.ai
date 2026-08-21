import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/src/auth/admin";
import { prisma } from "@/src/db/client";
import { generateCallerSecret } from "@/src/core/crypto";
import { withPrismaErrorHandler } from "@/src/lib/api-error-handler";

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin(request);
  if ("error" in gate && gate.error) return gate.error;
  const { id } = await ctx.params;
  return withPrismaErrorHandler(async () => {
    const generated = generateCallerSecret();
    const row = await prisma.callerApiKey.update({
      where: { id },
      data: { keyHash: generated.keyHash, prefix: generated.prefix },
    });
    return NextResponse.json({
      id: row.id,
      prefix: row.prefix,
      secret: generated.secret,
    });
  });
}
