"use client";

import { AgentLogo } from "./chrome";
import { useT } from "./locale";
import { AuthShell } from "./shells";

export function AcceptInviteExpiredScreen() {
  const tt = useT();

  return (
    <AuthShell>
      <div className="auth-card auth-work">
        <AgentLogo variant="auth" />
        <div className="callout callout-error">
          <p className="callout-eyebrow" data-i18n="errors.invite_link_expired_eyebrow">
            {tt("errors.invite_link_expired_eyebrow")}
          </p>
          <p className="callout-title" data-i18n="errors.invite_link_expired_title">
            {tt("errors.invite_link_expired_title")}
          </p>
          <p className="callout-body" data-i18n="errors.invite_link_expired_body">
            {tt("errors.invite_link_expired_body")}
          </p>
        </div>
      </div>
    </AuthShell>
  );
}
