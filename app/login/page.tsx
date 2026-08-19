import { LoginScreen } from "@/src/ui/login-screen";
import { readSession } from "@/src/auth/session";
import { prisma } from "@/src/db/client";
import { redirect } from "next/navigation";

export default async function LoginPage() {
  const session = await readSession();
  if (session) {
    const user = await prisma.adminUser.findUnique({ where: { id: session.userId } });
    if (user && !user.passwordHash) redirect("/set-password");
    if (user) redirect("/admin/api-keys");
  }
  return <LoginScreen />;
}
