import { getVisaAdapter } from "../adapters/orizn/fixture";
import { OriznQuotaError, type VisaRequirementData } from "../adapters/orizn/types";
import { parseLocale, type Locale } from "./locales";
import { type ToolResult } from "./types";

const ALPHA3 = /^[A-Z]{3}$/;

export type VisaRequirementInput = {
  passport: string;
  destination: string;
  locale?: Locale;
  locales?: Locale[];
};

export function oriznLang(locale: Locale): string {
  return locale === "EN" ? "en" : "zh";
}

function localesFrom(input: VisaRequirementInput): { locale: Locale; pair: Locale[] } {
  const pair = (input.locales ?? []).filter(Boolean) as Locale[];
  const locale = parseLocale(input.locale ?? pair[0]);
  return { locale, pair: pair.length ? pair : [locale] };
}

function invalidCodeResult(locale: Locale, pair: Locale[]): ToolResult<VisaRequirementData | null> {
  return {
    data: null,
    skipped: [],
    locale,
    locales: pair,
    outcomeKey: "errors.visa_invalid_country_code",
  };
}

export async function visaRequirement(
  input: VisaRequirementInput,
): Promise<ToolResult<VisaRequirementData | null>> {
  const { locale, pair } = localesFrom(input);
  const passport = input.passport?.trim().toUpperCase() ?? "";
  const destination = input.destination?.trim().toUpperCase() ?? "";

  if (!ALPHA3.test(passport) || !ALPHA3.test(destination)) {
    return invalidCodeResult(locale, pair);
  }

  const adapter = getVisaAdapter();
  try {
    const data = await adapter.fetchRequirement({
      passport,
      destination,
      lang: oriznLang(locale),
    });
    return {
      data,
      skipped: [],
      locale,
      locales: pair,
    };
  } catch (err) {
    if (err instanceof OriznQuotaError) {
      return {
        data: null,
        skipped: [],
        locale,
        locales: pair,
        outcomeKey: "errors.visa_quota_exceeded",
      };
    }
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("orizn_unconfigured")) {
      return {
        data: null,
        skipped: [],
        locale,
        locales: pair,
        outcomeKey: "errors.visa_unconfigured",
      };
    }
    return {
      data: null,
      skipped: [],
      locale,
      locales: pair,
      outcomeKey: "errors.provider_failed",
    };
  }
}
