import { Suspense } from "react";
import { redirect } from "next/navigation";
import { SetPasswordScreen } from "@/src/ui/set-password-screen";
import { adminTokenKind, isSetPasswordTokenValid } from "@/src/auth/token-validation";

type Props = {
  searchParams: Promise<{ token?: string }>;
};

export default async function SetPasswordPage({ searchParams }: Props) {
  const { token: rawToken } = await searchParams;
  const token = rawToken?.trim() ?? "";
  if (token) {
    const kind = await adminTokenKind(token);
    if (kind === "invite") {
      redirect(`/accept-invite?token=${encodeURIComponent(token)}`);
    }
  }
  const tokenValid = token ? await isSetPasswordTokenValid(token) : null;

  return (
    <Suspense>
      <SetPasswordScreen tokenValid={tokenValid} resetToken={token} />
    </Suspense>
  );
}
