"use client";

import {
  createContext,
  useCallback,
  useContext,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { t } from "../core/i18n";
import { LOCALES, type Locale } from "../core/locales";
import { AdminApiError, adminJson } from "./admin-api";

const LocaleContext = createContext<Locale>("EN");

export function LocaleProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useLocale(): Locale {
  return useContext(LocaleContext);
}

export function useT() {
  const locale = useLocale();
  return useCallback(
    (key: string, vars?: Record<string, string>) => t(locale, key, vars),
    [locale],
  );
}

export function LocaleSwitcher() {
  const locale = useLocale();
  const tt = useT();
  const router = useRouter();

  async function switchLocale(next: Locale) {
    if (next === locale) return;
    try {
      await adminJson("/api/admin/locale", {
        method: "POST",
        body: JSON.stringify({ locale: next }),
      });
    } catch (err) {
      if (!(err instanceof AdminApiError)) throw err;
    }
    router.refresh();
  }

  return (
    <div
      className="locale-switch"
      role="group"
      aria-label={tt("admin.a11y.locale")}
      data-i18n="admin.a11y.locale"
    >
      {LOCALES.map((code) => {
        const active = code === locale;
        return (
          <button
            key={code}
            type="button"
            data-locale={code}
            data-testid={`locale-${code}`}
            className={active ? "is-active" : undefined}
            aria-pressed={active}
            onClick={() => void switchLocale(code)}
          >
            {code}
          </button>
        );
      })}
    </div>
  );
}
