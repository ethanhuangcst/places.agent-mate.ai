import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AcceptInviteScreen } from "@/src/ui/accept-invite-screen";
import { AcceptInviteDoneScreen } from "@/src/ui/accept-invite-done-screen";
import { AcceptInviteExpiredScreen } from "@/src/ui/accept-invite-expired-screen";
import {
  acceptInviteQueryHasLeakedFields,
  acceptInviteRedirectAfterLeak,
} from "@/src/auth/accept-invite-query";
import {
  adminTokenKind,
  inviteTokenEmail,
  isInviteTokenValid,
} from "@/src/auth/token-validation";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AcceptInvitePage({ searchParams }: Props) {
  const params = await searchParams;

  if (params.done === "1") {
    return (
      <Suspense>
        <AcceptInviteDoneScreen />
      </Suspense>
    );
  }

  if (params.expired === "1") {
    return (
      <Suspense>
        <AcceptInviteExpiredScreen />
      </Suspense>
    );
  }

  const rawToken = typeof params.token === "string" ? params.token : "";
  const token = rawToken.trim();

  if (acceptInviteQueryHasLeakedFields(params)) {
    redirect(acceptInviteRedirectAfterLeak(token));
  }

  if (!token) {
    return (
      <Suspense>
        <AcceptInviteExpiredScreen />
      </Suspense>
    );
  }

  const kind = await adminTokenKind(token);
  if (kind === "reset") {
    redirect(`/set-password?token=${encodeURIComponent(token)}`);
  }

  const tokenValid = await isInviteTokenValid(token);
  if (!tokenValid) {
    return (
      <Suspense>
        <AcceptInviteExpiredScreen />
      </Suspense>
    );
  }

  const email = await inviteTokenEmail(token);
  if (!email) {
    return (
      <Suspense>
        <AcceptInviteExpiredScreen />
      </Suspense>
    );
  }

  return (
    <Suspense>
      <AcceptInviteScreen email={email} inviteToken={token} />
    </Suspense>
  );
}
