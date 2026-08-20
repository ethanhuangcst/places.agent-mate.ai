import { type Locale, parseLocale } from "../core/locales";

export interface LanguageContext {
  /** Detected base language: "zh", "en", or BCP-47 prefix. */
  detectedLanguage: "zh" | "en" | string;
  /** Locale for search-keywords lookup. */
  searchLocale: Locale;
  /** Locale for system prompt selection. */
  promptLocale: Locale;
}

/**
 * Detect language from explicit locale, text content, or fallback.
 * Rules:
 *   1. Explicit locale → use directly
 *   2. Text CJK ratio >30% → zh / CN
 *   3. Fallback → en / EN
 */
export function detectLanguage(input: {
  locale?: Locale | string;
  text?: string;
}): LanguageContext {
  // Rule 1: explicit locale
  if (input.locale) {
    const locale = parseLocale(input.locale);
    const lang = locale === "EN" ? "en" : "zh";
    return { detectedLanguage: lang, searchLocale: locale, promptLocale: locale };
  }

  // Rule 2: CJK detection from text
  if (input.text) {
    const total = input.text.length;
    if (total > 0) {
      const cjk = input.text.match(/[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/g)?.length ?? 0;
      if (cjk / total > 0.3) {
        return { detectedLanguage: "zh", searchLocale: "CN", promptLocale: "CN" };
      }
    }
  }

  // Rule 3: fallback
  return { detectedLanguage: "en", searchLocale: "EN", promptLocale: "EN" };
}
