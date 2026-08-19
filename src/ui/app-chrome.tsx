"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { adminJson, type SessionResponse } from "./admin-api";
import { AgentLogo, SiteFooter, SkipLink } from "./chrome";
import { LocaleSwitcher, useT } from "./locale";

export function AppChrome({
  children,
  navActive,
}: {
  children: ReactNode;
  navActive?: "keys" | "users" | "none";
}) {
  const tt = useT();
  const router = useRouter();
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);
  const session = useQuery({
    queryKey: ["admin-session"],
    queryFn: () => adminJson<SessionResponse>("/api/admin/session"),
  });

  const name = session.data?.name;

  const active =
    navActive ??
    (pathname.startsWith("/admin/users")
      ? "users"
      : pathname.startsWith("/admin/api-keys") || pathname === "/admin"
        ? "keys"
        : "none");

  async function signOut() {
    await adminJson("/api/admin/logout", { method: "POST" }).catch(() => undefined);
    router.push("/");
    router.refresh();
  }

  return (
    <div className={navOpen ? "app-shell is-nav-open" : "app-shell"}>
      <SkipLink />
      <header className="app-header">
        <AgentLogo href="/admin/api-keys" variant="header" />
        <button
          type="button"
          className="menu-toggle"
          data-i18n="admin.nav.menu"
          onClick={() => setNavOpen((v) => !v)}
        >
          {tt("admin.nav.menu")}
        </button>
        <div className="header-end">
          <Link
            className="header-guide"
            href="/instructions"
            target="_blank"
            rel="noopener noreferrer"
            data-i18n="admin.landing.instructions_link"
            data-testid="landing-instructions"
          >
            {tt("admin.landing.instructions_link")}
          </Link>
          <p className="hello" data-i18n="admin.landing.hello" data-testid="admin-hello">
            {name
              ? tt("admin.landing.hello", { name })
              : tt("admin.common.loading")}
          </p>
          <LocaleSwitcher />
        </div>
      </header>
      <div className="app-body">
        <aside className="sidebar">
          <nav className="nav">
            <Link
              className={active === "keys" ? "active" : undefined}
              href="/admin/api-keys"
              data-i18n="admin.nav.keys"
              data-testid="nav-keys"
            >
              {tt("admin.nav.keys")}
            </Link>
            <Link
              className={active === "users" ? "active" : undefined}
              href="/admin/users"
              data-i18n="admin.nav.admins"
              data-testid="nav-users"
            >
              {tt("admin.nav.admins")}
            </Link>
            <button
              type="button"
              className="nav-signout"
              data-i18n="admin.nav.sign_out"
              data-testid="nav-sign-out"
              onClick={() => void signOut()}
            >
              {tt("admin.nav.sign_out")}
            </button>
          </nav>
        </aside>
        {children}
      </div>
      <SiteFooter />
    </div>
  );
}
