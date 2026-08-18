import { redirect } from "next/navigation";
import { readSession } from "@/src/auth/session";
import { prisma } from "@/src/db/client";
import { AppChrome } from "@/src/ui/app-chrome";
import type { ReactNode } from "react";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await readSession();
  if (!session) redirect("/login");
  const user = await prisma.adminUser.findUnique({ where: { id: session.userId } });
  if (!user) redirect("/login");
  if (!user.passwordHash) redirect("/set-password");
  return <AppChrome>{children}</AppChrome>;
}
