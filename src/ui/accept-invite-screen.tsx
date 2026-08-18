"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useRef, useState } from "react";
import { AdminApiError, adminJson } from "./admin-api";
import { bindFormSubmit } from "./auth-form";
import { AgentLogo, PasswordField } from "./chrome";
import { useT } from "./locale";
import { AuthShell } from "./shells";

const schema = z.object({
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  username: z.string().trim().min(1),
  password: z.string().min(1),
  confirm: z.string().min(1),
});

type Values = z.infer<typeof schema>;

type Props = {
  email: string;
  inviteToken: string;
};

export function AcceptInviteScreen({ email, inviteToken }: Props) {
  const tt = useT();
  const router = useRouter();
  const tokenRef = useRef(inviteToken);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const { register, handleSubmit } = useForm<Values>();

  async function onSubmit(values: Values) {
    if (pending) return;
    const parsed = schema.safeParse(values);
    if (!parsed.success) return;
    if (parsed.data.password !== parsed.data.confirm) {
      setErrorKey("errors.password_mismatch");
      return;
    }
    setErrorKey(null);
    setPending(true);
    try {
      await adminJson("/api/admin/accept-invite", {
        method: "POST",
        body: JSON.stringify({ ...parsed.data, token: tokenRef.current }),
      });
      router.push("/accept-invite?done=1");
      router.refresh();
    } catch (err) {
      const key =
        err instanceof AdminApiError ? err.key : "errors.invite_accept_failed";
      setErrorKey(key);
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthShell>
      <div className="auth-card auth-work">
        <AgentLogo variant="auth" />
        <h1 data-i18n="admin.accept_invite.title">{tt("admin.accept_invite.title")}</h1>
        <p className="lead" data-i18n="admin.accept_invite.lead">
          {tt("admin.accept_invite.lead")}
        </p>
        <p className="auth-status">
          <span data-i18n="admin.accept_invite.email_lead">{tt("admin.accept_invite.email_lead")}</span>{" "}
          <span className="mono">{email}</span>
        </p>
        {errorKey === "errors.password_mismatch" ? (
          <p className="error-inline" data-i18n={errorKey}>
            {tt(errorKey)}
          </p>
        ) : null}
        {errorKey && errorKey !== "errors.password_mismatch" ? (
          <p className="error" data-i18n={errorKey} data-testid="accept-invite-error">
            {tt(errorKey)}
          </p>
        ) : null}
        <form
          className="form"
          style={{ marginTop: "1.5rem" }}
          method="post"
          noValidate
          onSubmit={bindFormSubmit(handleSubmit, onSubmit)}
        >
          <label>
            <span data-i18n="admin.accept_invite.first_name">
              {tt("admin.accept_invite.first_name")}
            </span>
            <input type="text" autoComplete="given-name" required {...register("firstName")} />
          </label>
          <label>
            <span data-i18n="admin.accept_invite.last_name">
              {tt("admin.accept_invite.last_name")}
            </span>
            <input type="text" autoComplete="family-name" required {...register("lastName")} />
          </label>
          <label>
            <span data-i18n="admin.accept_invite.username">{tt("admin.accept_invite.username")}</span>
            <input type="text" autoComplete="username" required {...register("username")} />
          </label>
          <label>
            <span data-i18n="admin.accept_invite.password">{tt("admin.accept_invite.password")}</span>
            <PasswordField
              id="invite-password"
              autoComplete="new-password"
              required
              {...register("password")}
            />
          </label>
          <label>
            <span data-i18n="admin.accept_invite.confirm">{tt("admin.accept_invite.confirm")}</span>
            <input type="password" autoComplete="new-password" required {...register("confirm")} />
          </label>
          <div className="form-actions">
            <button
              className="btn"
              type="submit"
              disabled={pending}
              data-i18n="admin.accept_invite.submit"
              data-testid="accept-invite-submit"
            >
              {pending ? tt("admin.accept_invite.submitting") : tt("admin.accept_invite.submit")}
            </button>
          </div>
        </form>
      </div>
    </AuthShell>
  );
}
