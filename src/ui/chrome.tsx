"use client";

import {
  forwardRef,
  useEffect,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import Link from "next/link";
import { HOSTNAME } from "../core/locales";
import { CopyIcon, EyeIcon } from "./icons";
import { useT } from "./locale";

export function SkipLink() {
  const tt = useT();
  return (
    <a className="sr-only" href="#content" data-i18n="admin.a11y.skip">
      {tt("admin.a11y.skip")}
    </a>
  );
}

export function SiteFooter() {
  const tt = useT();
  return (
    <footer className="site-footer">
      <p data-i18n="admin.footer.copyright">{tt("admin.footer.copyright")}</p>
    </footer>
  );
}

export function AgentLogo({
  href,
  variant,
}: {
  href?: string;
  variant: "home" | "auth" | "header";
}) {
  const homeSize = variant !== "header";
  const imgClass = homeSize ? "logo-full" : "logo-header-mark";
  const dim = homeSize ? 56 : 36;
  const className =
    variant === "home" ? "logo logo-home" : variant === "auth" ? "logo logo-auth" : "logo";
  const inner = (
    <>
      <img
        className={imgClass}
        src="/agent-logo.png"
        alt=""
        width={dim}
        height={dim}
      />
      <span className="logo-word">{HOSTNAME}</span>
    </>
  );
  if (href) {
    return (
      <Link className={className} href={href} aria-label={HOSTNAME}>
        {inner}
      </Link>
    );
  }
  return (
    <div className={className} aria-label={HOSTNAME}>
      {inner}
    </div>
  );
}

export const PasswordField = forwardRef<
  HTMLInputElement,
  { id: string; autoComplete: string } & InputHTMLAttributes<HTMLInputElement>
>(function PasswordField({ id, autoComplete, ...rest }, ref) {
  const [visible, setVisible] = useState(false);
  const tt = useT();
  const show = visible;
  return (
    <span className="password-field">
      <input
        id={id}
        ref={ref}
        type={show ? "text" : "password"}
        autoComplete={autoComplete}
        {...rest}
      />
      <button
        type="button"
        className="password-toggle"
        data-for={id}
        aria-label={tt(show ? "admin.login.hide_password" : "admin.login.show_password")}
        aria-pressed={show}
        onClick={() => setVisible((v) => !v)}
      >
        <EyeIcon />
      </button>
    </span>
  );
});
PasswordField.displayName = "PasswordField";

export function Dialog({
  open,
  onClose,
  title,
  body,
  error,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  body: string;
  error?: ReactNode;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <div
      className={open ? "dialog-backdrop is-open" : "dialog-backdrop"}
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="dialog">
        <h2 className="dialog-title">{title}</h2>
        <p className="dialog-body">{body}</p>
        {error}
        <div className="dialog-actions">{children}</div>
      </div>
    </div>
  );
}

export function SecretOncePanel({
  name,
  secret,
  onDone,
}: {
  name: string;
  secret: string;
  onDone: () => void;
}) {
  const tt = useT();
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(secret);
    } catch {
      /* clipboard may be unavailable; still acknowledge */
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className="key-panel secret-panel">
      <div className="key-meta">
        <span className="key-meta-label" data-i18n="admin.keys.name">
          {tt("admin.keys.name")}
        </span>
        <span className="key-meta-value">{name}</span>
      </div>
      <div className="key-meta">
        <span className="key-meta-label" data-i18n="admin.keys.secret">
          {tt("admin.keys.secret")}
        </span>
      </div>
      <div className="code-block">
        <pre>
          <code>{secret}</code>
        </pre>
        <button
          type="button"
          className="btn-copy"
          data-testid="copy-secret"
          aria-label={copied ? tt("admin.keys.copied_to_clipboard") : tt("admin.keys.copy")}
          onClick={() => void copy()}
        >
          <CopyIcon />
        </button>
      </div>
      <p
        className={copied ? "copy-status is-visible" : "copy-status"}
        role="status"
        aria-live="polite"
        data-testid="copy-secret-status"
        data-i18n="admin.keys.copied_to_clipboard"
        hidden={!copied}
      >
        {tt("admin.keys.copied_to_clipboard")}
      </p>
      <p className="warn" data-i18n="admin.keys.created_warn">
        {tt("admin.keys.created_warn")}
      </p>
      <div className="form-actions">
        <button type="button" className="btn" onClick={onDone} data-i18n="admin.common.done">
          {tt("admin.common.done")}
        </button>
      </div>
    </div>
  );
}
