export const LOCALES = ["EN", "CN", "HK", "TW"] as const;
export type Locale = (typeof LOCALES)[number];

export const LOCALE_LANG: Record<Locale, string> = {
  EN: "en",
  CN: "zh-CN",
  HK: "zh-HK",
  TW: "zh-TW",
};

export const AGENT_ID = "places-agent" as const;
export const HOSTNAME = "places.agent-mate.ai" as const;

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

export function parseLocale(value: string | null | undefined): Locale {
  if (value && isLocale(value)) return value;
  return "EN";
}
