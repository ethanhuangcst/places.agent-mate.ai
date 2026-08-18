import { describe, it, expect } from "vitest";
import { t, resolveOutcome } from "./i18n";
import { parseLocale, isLocale } from "./locales";

describe("i18n", () => {
  it("should_resolve_en_catalog_when_locale_is_en", () => {
    expect(t("EN", "admin.home.login")).toBe("Sign in");
  });

  it("should_use_distinct_hk_and_tw_wording_for_keys", () => {
    expect(t("HK", "admin.nav.keys")).not.toBe(t("TW", "admin.nav.keys"));
    expect(t("HK", "admin.home.login")).toBe("登入");
    expect(t("TW", "admin.keys.title")).toContain("金鑰");
    expect(t("HK", "admin.keys.title")).toContain("密鑰");
  });

  it("should_fall_back_to_en_then_key_when_translation_missing", () => {
    expect(t("CN", "this.key.does.not.exist")).toBe("this.key.does.not.exist");
  });

  it("should_interpolate_name_in_hello", () => {
    expect(t("EN", "admin.landing.hello", { name: "admin" })).toBe("Hello, admin");
  });

  it("should_parse_unknown_locale_as_en", () => {
    expect(parseLocale("XX")).toBe("EN");
    expect(isLocale("HK")).toBe(true);
  });

  it("should_include_requested_locales_on_outcome", () => {
    const outcome = resolveOutcome("CN", "errors.login_failed", ["EN"]);
    expect(outcome.key).toBe("errors.login_failed");
    expect(outcome.locales.CN).toBeTruthy();
    expect(outcome.locales.EN).toBeTruthy();
  });
});
