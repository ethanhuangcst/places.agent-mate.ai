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

/** Instruction for LLM traveler-facing reply text (refine, need_input, etc.). */
export function travelerReplyLanguageRule(locale: Locale): string {
  switch (locale) {
    case "CN":
      return "All traveler-facing reply text MUST be in Simplified Chinese (简体中文). Do not reply in English.";
    case "HK":
      return "All traveler-facing reply text MUST be in Traditional Chinese (香港繁體). Do not reply in English.";
    case "TW":
      return "All traveler-facing reply text MUST be in Traditional Chinese (台灣繁體). Do not reply in English.";
    default:
      return "All traveler-facing reply text MUST be in English.";
  }
}
