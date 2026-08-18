"use client";

import Link from "next/link";
import { AgentLogo } from "@/src/ui/chrome";
import { useT } from "@/src/ui/locale";
import { HomeShell } from "@/src/ui/shells";

export default function HomePage() {
  const tt = useT();
  return (
    <HomeShell>
      <main id="content" className="home-main">
        <div className="home-card">
          <AgentLogo variant="home" />
          <p className="tagline" data-i18n="admin.home.tagline">
            {tt("admin.home.tagline")}
          </p>
          <div className="home-actions">
            <Link
              className="home-link"
              href="/instructions"
              target="_blank"
              rel="noopener noreferrer"
              data-i18n="admin.home.instructions_link"
              data-testid="admin-home-instructions"
            >
              {tt("admin.home.instructions_link")}
            </Link>
            <Link
              className="btn btn-page"
              href="/login"
              data-i18n="admin.home.login"
              data-testid="admin-login"
            >
              {tt("admin.home.login")}
            </Link>
          </div>
        </div>
      </main>
    </HomeShell>
  );
}
