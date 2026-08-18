"use client";

import Link from "next/link";
import { AgentLogo, SiteFooter, SkipLink } from "./chrome";
import { LocaleSwitcher, useT } from "./locale";
import type { ReactNode } from "react";

export function HomeShell({ children }: { children: ReactNode }) {
  return (
    <div className="home-shell">
      <SkipLink />
      <div className="shell-locale">
        <LocaleSwitcher />
      </div>
      {children}
      <SiteFooter />
    </div>
  );
}

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="auth-shell">
      <SkipLink />
      <div className="shell-locale">
        <LocaleSwitcher />
      </div>
      <main id="content" className="auth-main">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}

export function GuideShell({ children }: { children: ReactNode }) {
  const tt = useT();
  return (
    <div className="guide-shell">
      <SkipLink />
      <header className="guide-header">
        <AgentLogo href="/" variant="header" />
        <div className="header-end">
          <Link className="header-guide" href="/" data-i18n="admin.common.back_home">
            {tt("admin.common.back_home")}
          </Link>
          <LocaleSwitcher />
        </div>
      </header>
      {children}
      <SiteFooter />
    </div>
  );
}
