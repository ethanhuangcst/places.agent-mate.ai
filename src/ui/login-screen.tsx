"use client";

import Link from "next/link";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { AdminApiError, adminJson } from "./admin-api";
import { bindFormSubmit } from "./auth-form";
import { AgentLogo, PasswordField } from "./chrome";
import { useT } from "./locale";
import { AuthShell } from "./shells";
import { useState } from "react";

const schema = z.object({
  identity: z.string().trim().min(1),
  password: z.string().min(1),
});

type Values = z.infer<typeof schema>;

export function LoginScreen() {
  const tt = useT();
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const { register, handleSubmit } = useForm<Values>();

  async function onSubmit(values: Values) {
    const parsed = schema.safeParse(values);
    if (!parsed.success) {
      setErrorKey("errors.login_failed");
      return;
    }
    setErrorKey(null);
    try {
      const result = await adminJson<{ mustSetPassword?: boolean }>(
        "/api/admin/login",
        { method: "POST", body: JSON.stringify(parsed.data) },
      );
      // Hard redirect — Safari's password-save dialog interrupts
      // client-side router.push, so use location.href instead.
      const dest = result.mustSetPassword ? "/set-password" : "/admin/api-keys";
      window.location.href = dest;
    } catch (err) {
      setErrorKey(err instanceof AdminApiError ? err.key : "errors.login_failed");
    }
  }

  return (
    <AuthShell>
      <div className="auth-card auth-card-login">
        <AgentLogo href="/" variant="auth" />
        <p className="auth-status" role="status" data-testid="register-disabled">
          <span className="auth-status-text" data-i18n="admin.register.disabled_prefix">
            {tt("admin.register.disabled_prefix")}
          </span>
          <span className="contact-admin">
            <button
              type="button"
              className="contact-admin-trigger"
              aria-describedby="login-wechat-qr"
              data-testid="contact-admin"
              data-i18n="admin.register.contact_admin"
            >
              {tt("admin.register.contact_admin")}
            </button>
            <span
              id="login-wechat-qr"
              className="contact-admin-pop"
              role="tooltip"
              data-testid="contact-admin-qr"
            >
              <img
                src="/EthanWeChat.png"
                alt={tt("admin.register.wechat_qr_alt")}
                width={180}
                height={180}
                data-i18n="admin.register.wechat_qr_alt"
              />
              <span
                className="contact-admin-caption"
                data-i18n="admin.register.wechat_qr_caption"
              >
                {tt("admin.register.wechat_qr_caption")}
              </span>
            </span>
          </span>
          <span className="auth-status-text" data-i18n="admin.register.disabled_suffix">
            {tt("admin.register.disabled_suffix")}
          </span>
          <code className="auth-status-key">api-key</code>
        </p>
        <div className="auth-login-panel auth-work">
          <h1 data-i18n="admin.login.title">{tt("admin.login.title")}</h1>
          <p
            className="error"
            data-error=""
            hidden={!errorKey}
            data-i18n={errorKey ?? "errors.login_failed"}
            data-testid="login-error"
          >
            {tt(errorKey ?? "errors.login_failed")}
          </p>
          <form className="form" noValidate onSubmit={bindFormSubmit(handleSubmit, onSubmit)}>
            <label>
              <span data-i18n="admin.login.username">{tt("admin.login.username")}</span>
              <input type="text" autoComplete="username" required {...register("identity")} />
            </label>
            <label>
              <span data-i18n="admin.login.password">{tt("admin.login.password")}</span>
              <PasswordField
                id="password"
                autoComplete="current-password"
                required
                {...register("password")}
              />
            </label>
            <div className="form-actions">
              <button
                className="btn"
                type="submit"
                data-i18n="admin.login.submit"
                data-testid="login-submit"
              >
                {tt("admin.login.submit")}
              </button>
              <Link className="btn-text" href="/reset-password" data-i18n="admin.login.reset_link">
                {tt("admin.login.reset_link")}
              </Link>
            </div>
          </form>
          <Link className="back-link" href="/" data-i18n="admin.common.back_home">
            {tt("admin.common.back_home")}
          </Link>
        </div>
      </div>
    </AuthShell>
  );
}
