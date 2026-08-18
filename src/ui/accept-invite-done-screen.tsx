"use client";

import Link from "next/link";
import { AgentLogo } from "./chrome";
import { useT } from "./locale";
import { AuthShell } from "./shells";

export function AcceptInviteDoneScreen() {
  const tt = useT();

  return (
    <AuthShell>
      <div className="auth-card auth-work">
        <AgentLogo variant="auth" />
        <div className="callout callout-success" data-testid="accept-invite-done">
          <p className="callout-eyebrow" data-i18n="admin.accept_invite.done_eyebrow">
            {tt("admin.accept_invite.done_eyebrow")}
          </p>
          <p className="callout-title" data-i18n="admin.accept_invite.done_title">
            {tt("admin.accept_invite.done_title")}
          </p>
          <p className="callout-body" data-i18n="admin.accept_invite.done_lead">
            {tt("admin.accept_invite.done_lead")}
          </p>
          <div className="callout-action">
            <Link
              className="btn btn-page"
              href="/login/fresh"
              data-i18n="admin.accept_invite.sign_in"
              data-testid="accept-invite-sign-in"
            >
              {tt("admin.accept_invite.sign_in")}
            </Link>
          </div>
        </div>
      </div>
    </AuthShell>
  );
}
