"use client";

import Link from "next/link";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useState } from "react";
import { AdminApiError, adminJson } from "./admin-api";
import { bindFormSubmit } from "./auth-form";
import { AgentLogo } from "./chrome";
import { useT } from "./locale";
import { AuthShell } from "./shells";

const schema = z.object({
  email: z.string().trim().min(1),
});

type Values = z.infer<typeof schema>;

export function ResetScreen() {
  const tt = useT();
  const [sent, setSent] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const { register, handleSubmit } = useForm<Values>();

  async function onSubmit(values: Values) {
    const parsed = schema.safeParse(values);
    if (!parsed.success) return;
    setErrorKey(null);
    try {
      await adminJson("/api/admin/password/reset", {
        method: "POST",
        body: JSON.stringify(parsed.data),
      });
      setSent(true);
    } catch (err) {
      setErrorKey(err instanceof AdminApiError ? err.key : "errors.mail_failed");
    }
  }

  return (
    <AuthShell>
      <div className="auth-card auth-work">
        <AgentLogo href="/" variant="auth" />
        <h1 data-i18n="admin.reset.title">{tt("admin.reset.title")}</h1>
        {!sent ? (
          <p className="lead" data-i18n="admin.reset.lead">
            {tt("admin.reset.lead")}
          </p>
        ) : null}
        {sent ? (
          <div className="callout callout-success">
            <p className="callout-body" data-i18n="admin.reset.sent">
              {tt("admin.reset.sent")}
            </p>
          </div>
        ) : null}
        {errorKey ? (
          <p className="error" data-i18n={errorKey}>
            {tt(errorKey)}
          </p>
        ) : null}
        {!sent ? (
          <form className="form" noValidate onSubmit={bindFormSubmit(handleSubmit, onSubmit)}>
            <label>
              <span data-i18n="admin.reset.email">{tt("admin.reset.email")}</span>
              <input type="email" autoComplete="email" required {...register("email")} />
            </label>
            <div className="form-actions">
              <button className="btn" type="submit" data-i18n="admin.reset.submit">
                {tt("admin.reset.submit")}
              </button>
            </div>
          </form>
        ) : null}
        <Link className="back-link" href="/" data-i18n="admin.common.back_home">
          {tt("admin.common.back_home")}
        </Link>
      </div>
    </AuthShell>
  );
}
