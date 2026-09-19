import { describe, expect, it } from "vitest";
import { travelerReplyLanguageRule } from "./locales";

describe("travelerReplyLanguageRule", () => {
  it("should_require_simplified_chinese_for_CN", () => {
    expect(travelerReplyLanguageRule("CN")).toMatch(/简体中文/);
  });

  it("should_require_english_for_EN", () => {
    expect(travelerReplyLanguageRule("EN")).toMatch(/English/);
  });
});
