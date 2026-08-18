import { prisma } from "../db/client";
import { hashCallerSecret } from "../core/crypto";

export async function authenticateCaller(
  authorization: string | null,
): Promise<{ ok: true; keyId: string } | { ok: false }> {
  if (!authorization?.toLowerCase().startsWith("bearer ")) {
    return { ok: false };
  }
  const secret = authorization.slice(7).trim();
  if (!secret) return { ok: false };
  const keyHash = hashCallerSecret(secret);
  const row = await prisma.callerApiKey.findUnique({ where: { keyHash } });
  if (!row || row.status !== "ACTIVE") return { ok: false };
  await prisma.callerApiKey.update({
    where: { id: row.id },
    data: { lastUsedAt: new Date() },
  });
  return { ok: true, keyId: row.id };
}
