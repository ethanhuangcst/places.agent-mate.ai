import EN from "../../messages/EN.json";
import CN from "../../messages/CN.json";
import HK from "../../messages/HK.json";
import TW from "../../messages/TW.json";
import { type Locale } from "./locales";

const CATALOGS: Record<Locale, Record<string, string>> = {
  EN: EN as Record<string, string>,
  CN: CN as Record<string, string>,
  HK: HK as Record<string, string>,
  TW: TW as Record<string, string>,
};

export function t(
  locale: Locale,
  key: string,
  vars?: Record<string, string>,
): string {
  const primary = CATALOGS[locale]?.[key];
  const en = CATALOGS.EN[key];
  let value = primary || en || key;
  if (vars) {
    for (const [name, replacement] of Object.entries(vars)) {
      value = value.replaceAll(`{${name}}`, replacement);
    }
  }
  return value;
}

export function resolveOutcome(
  locale: Locale,
  key: string,
  extraLocales: Locale[] = [],
): { key: string; locales: Partial<Record<Locale, string>> } {
  const locales: Partial<Record<Locale, string>> = {
    [locale]: t(locale, key),
  };
  for (const extra of extraLocales) {
    locales[extra] = t(extra, key);
  }
  return { key, locales };
}
