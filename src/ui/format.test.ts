import { describe, it, expect } from "vitest";
import { formatIssuedDate } from "./format";

describe("formatIssuedDate", () => {
  it("should_keep_iso_date_when_locale_is_en", () => {
    expect(formatIssuedDate("EN", "2026-08-17")).toBe("2026-08-17");
  });

  it("should_use_year_month_day_when_locale_is_cn_hk_or_tw", () => {
    expect(formatIssuedDate("CN", "2026-08-17")).toBe("2026年8月17日");
    expect(formatIssuedDate("HK", "2026-01-05")).toBe("2026年1月5日");
    expect(formatIssuedDate("TW", "2026-12-01")).toBe("2026年12月1日");
  });

  it("should_return_original_when_date_is_not_iso", () => {
    expect(formatIssuedDate("CN", "unknown")).toBe("unknown");
  });
});
