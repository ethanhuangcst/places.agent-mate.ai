import type { Metadata } from "next";
import type { ReactNode } from "react";
import { LOCALE_LANG, HOSTNAME, parseLocale } from "@/src/core/locales";
import { t } from "@/src/core/i18n";
import { readLocaleCookie } from "@/src/auth/session";
import { Providers } from "@/src/ui/providers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const locale = parseLocale(await readLocaleCookie());
  return {
    title: HOSTNAME,
    description: t(locale, "admin.meta.description"),
    icons: {
      icon: "/favicon.png",
      apple: "/apple-icon.png",
    },
  };
}

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const locale = parseLocale(await readLocaleCookie());
  return (
    <html lang={LOCALE_LANG[locale]}>
      <body>
        <Providers locale={locale}>{children}</Providers>
      </body>
    </html>
  );
}
