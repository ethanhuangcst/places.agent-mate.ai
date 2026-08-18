import { type Locale } from "../core/locales";

export function formatIssuedDate(locale: Locale, isoDate: string): string {
  if (locale === "EN") return isoDate;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (!match) return isoDate;
  const year = match[1];
  const month = String(Number(match[2]));
  const day = String(Number(match[3]));
  return `${year}年${month}月${day}日`;
}
