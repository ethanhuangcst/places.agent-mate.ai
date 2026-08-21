"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useState } from "react";
import { AdminApiError, adminJson } from "./admin-api";
import { bindFormSubmit } from "./auth-form";
import { AgentLogo, PasswordField } from "./chrome";
import { useT } from "./locale";
import { AuthShell } from "./shells";

const schema = z.object({
  password: z.string().min(1),
  confirm: z.string().min(1),
});

type Values = z.infer<typeof schema>;

type Props = {
  tokenValid: boolean | null;
  resetToken?: string;
};

export function SetPasswordScreen({ tokenValid, resetToken = "" }: Props) {
  const tt = useT();
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = resetToken || searchParams.get("token") || undefined;
  const isResetFlow = Boolean(token);
  const tokenExpired = isResetFlow && tokenValid === false;
  const [linkExpired, setLinkExpired] = useState(tokenExpired);
  const [done, setDone] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const { register, handleSubmit } = useForm<Values>();

  async function onSubmit(values: Values) {
    const parsed = schema.safeParse(values);
    if (!parsed.success) return;
    if (parsed.data.password !== parsed.data.confirm) {
      setErrorKey("errors.password_mismatch");
      return;
    }
    setErrorKey(null);
    try {
      const result = await adminJson<{ ok: true; next?: "sign_in" | "admin" }>(
        "/api/admin/password/set",
        {
          method: "POST",
          body: JSON.stringify({ ...parsed.data, token }),
        },
      );
      if (result.next === "sign_in" || isResetFlow) {
        setDone(true);
        return;
      }
      router.push("/admin/api-keys");
      router.refresh();
    } catch (err) {
      const key =
        err instanceof AdminApiError ? err.key : "errors.reset_link_expired";
      if (key === "errors.reset_link_expired") {
        setLinkExpired(true);
        setErrorKey(null);
      } else {
        setErrorKey(key);
      }
    }
  }

  if (done) {
    return (
      <AuthShell>
        <div className="auth-card auth-work">
          <AgentLogo variant="auth" />
          <div className="callout callout-success">
            <p className="callout-eyebrow" data-i18n="admin.set_password.done_eyebrow">
              {tt("admin.set_password.done_eyebrow")}
            </p>
            <p className="callout-title" data-i18n="admin.set_password.done_title" data-testid="set-password-done">
              {tt("admin.set_password.done_title")}
            </p>
            <p className="callout-body" data-i18n="admin.set_password.done_lead">
              {tt("admin.set_password.done_lead")}
            </p>
            <div className="callout-action">
              <Link
                className="btn btn-page"
                href="/login/fresh"
                data-i18n="admin.set_password.sign_in"
              >
                {tt("admin.set_password.sign_in")}
              </Link>
            </div>
          </div>
        </div>
      </AuthShell>
    );
  }

  if (linkExpired) {
    return (
      <AuthShell>
        <div className="auth-card auth-work">
          <AgentLogo variant="auth" />
          <div className="callout callout-error">
            <p className="callout-eyebrow" data-i18n="errors.reset_link_expired_eyebrow">
              {tt("errors.reset_link_expired_eyebrow")}
            </p>
            <p className="callout-title" data-i18n="errors.reset_link_expired_title">
              {tt("errors.reset_link_expired_title")}
            </p>
            <p className="callout-body" data-i18n="errors.reset_link_expired_body">
              {tt("errors.reset_link_expired_body")}
            </p>
            <div className="callout-action">
              <Link
                className="btn btn-ghost btn-page"
                href="/reset-password"
                data-i18n="errors.reset_link_expired_action"
              >
                {tt("errors.reset_link_expired_action")}
              </Link>
            </div>
          </div>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <div className="auth-card auth-work">
        <AgentLogo variant="auth" />
        <h1 data-i18n="admin.set_password.title">{tt("admin.set_password.title")}</h1>
        {isResetFlow ? (
          <p className="lead" data-i18n="admin.set_password.reset_lead">
            {tt("admin.set_password.reset_lead")}
          </p>
        ) : (
          <p className="lead" data-i18n="admin.set_password.lead">
            {tt("admin.set_password.lead")}
          </p>
        )}
        {errorKey === "errors.password_mismatch" ? (
          <p className="error-inline" data-i18n={errorKey}>
            {tt(errorKey)}
          </p>
        ) : null}
        {errorKey && errorKey !== "errors.password_mismatch" ? (
          <p className="error" data-i18n={errorKey}>
            {tt(errorKey)}
          </p>
        ) : null}
        <form
          className="form"
          style={{ marginTop: "1.5rem" }}
          noValidate
          onSubmit={bindFormSubmit(handleSubmit, onSubmit)}
        >
          <label>
            <span data-i18n="admin.set_password.new">{tt("admin.set_password.new")}</span>
            <PasswordField
              id="new-password"
              autoComplete="new-password"
              required
              {...register("password")}
            />
          </label>
          <label>
            <span data-i18n="admin.set_password.confirm">
              {tt("admin.set_password.confirm")}
            </span>
            <input type="password" autoComplete="new-password" required {...register("confirm")} />
          </label>
          <div className="form-actions">
            <button className="btn" type="submit" data-i18n="admin.set_password.submit" data-testid="set-password-submit">
              {tt("admin.set_password.submit")}
            </button>
          </div>
        </form>
      </div>
    </AuthShell>
  );
}
