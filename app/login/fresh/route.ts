import { clearSession } from "@/src/auth/session";
import { redirect } from "next/navigation";

/** Clears admin session cookie then shows the login form (Route Handler — cookies are writable here). */
export async function GET() {
  await clearSession();
  redirect("/login");
}
