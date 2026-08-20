import { describe, it, expect } from "vitest";
import { detectLanguage } from "./language-router";

describe("detectLanguage", () => {
  it("should use explicit locale when provided", () => {
    const ctx = detectLanguage({ locale: "HK", text: "hello world" });
    expect(ctx.searchLocale).toBe("HK");
    expect(ctx.promptLocale).toBe("HK");
    expect(ctx.detectedLanguage).toBe("zh");
  });

  it("should use explicit EN locale", () => {
    const ctx = detectLanguage({ locale: "EN", text: "北京市朝阳区" });
    expect(ctx.searchLocale).toBe("EN");
    expect(ctx.detectedLanguage).toBe("en");
  });

  it("should detect CJK text as zh", () => {
    const ctx = detectLanguage({ text: "北京市朝阳区银河SOHO附近" });
    expect(ctx.detectedLanguage).toBe("zh");
    expect(ctx.searchLocale).toBe("CN");
  });

  it("should fallback to EN for pure English", () => {
    const ctx = detectLanguage({ text: "Tokyo Tower ramen" });
    expect(ctx.detectedLanguage).toBe("en");
    expect(ctx.searchLocale).toBe("EN");
  });

  it("should handle mixed text (>30% CJK → zh)", () => {
    // "上海市南京西路abc" — 7 CJK / 10 total = 70% → zh
    const ctx = detectLanguage({ text: "上海市南京西路abc" });
    expect(ctx.detectedLanguage).toBe("zh");
  });

  it("should handle mixed text (<30% CJK → en)", () => {
    // "hello world 你好" — 2 CJK / 13 total ≈ 15% → en
    const ctx = detectLanguage({ text: "hello world 你好" });
    expect(ctx.detectedLanguage).toBe("en");
  });

  it("should fallback to EN when no input", () => {
    const ctx = detectLanguage({});
    expect(ctx.searchLocale).toBe("EN");
    expect(ctx.detectedLanguage).toBe("en");
  });
});
