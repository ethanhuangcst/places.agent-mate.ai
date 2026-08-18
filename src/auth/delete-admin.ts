import { prisma } from "../db/client";

export type DeleteAdminValidation =
  | { ok: true; email: string }
  | { error: string; status: number };

export async function validateDeleteAdmin(
  actorUserId: string,
  targetUserId: string,
): Promise<DeleteAdminValidation> {
  if (actorUserId === targetUserId) {
    return { error: "errors.cannot_delete_self", status: 403 };
  }

  const target = await prisma.adminUser.findUnique({ where: { id: targetUserId } });
  if (!target) return { error: "errors.admin_not_found", status: 404 };

  const adminCount = await prisma.adminUser.count();
  if (adminCount <= 1) {
    return { error: "errors.cannot_delete_last_admin", status: 403 };
  }

  return { ok: true, email: target.email };
}

export async function removeAdminUser(targetUserId: string): Promise<void> {
  await prisma.adminUser.delete({ where: { id: targetUserId } });
}
