import { describe, it, expect } from "vitest";
import { getKeyword, getAttractionQueries, getMealQueries } from "./search-keywords";

describe("getKeyword", () => {
  it("should return EN keyword", () => {
    expect(getKeyword("museum", "EN")).toBe("museum");
  });

  it("should return CN keyword (simplified)", () => {
    expect(getKeyword("museum", "CN")).toBe("博物馆");
  });

  it("should return HK keyword (traditional)", () => {
    expect(getKeyword("museum", "HK")).toBe("博物館");
  });

  it("should return TW keyword", () => {
    expect(getKeyword("cafe", "TW")).toBe("咖啡廳 茶館");
  });

  it("HK and TW should differ on at least cafe", () => {
    expect(getKeyword("cafe", "HK")).not.toBe(getKeyword("cafe", "TW"));
  });

  it("should fallback to key string for unknown key", () => {
    expect(getKeyword("nonexistent_thing", "EN")).toBe("nonexistent_thing");
  });
});

describe("getAttractionQueries", () => {
  it("should return EN queries without CJK characters", () => {
    const queries = getAttractionQueries("Tokyo", "EN");
    expect(queries.length).toBeGreaterThanOrEqual(3);
    for (const q of queries) {
      expect(q).toContain("Tokyo");
      expect(q).not.toMatch(/[\u4e00-\u9fff]/); // no Chinese
    }
  });

  it("should return CN queries without English keywords", () => {
    const queries = getAttractionQueries("上海", "CN");
    expect(queries.length).toBeGreaterThanOrEqual(3);
    for (const q of queries) {
      expect(q).toContain("上海");
      expect(q).not.toMatch(/museum|park|castle/i);
    }
  });

  it("should work for any area (no city-specific hardcoding)", () => {
    const queries = getAttractionQueries("新加坡", "CN");
    expect(queries.length).toBeGreaterThanOrEqual(3);
    expect(queries[0]).toContain("新加坡");
    expect(queries[0]).toContain("博物馆");
  });
});

describe("getMealQueries", () => {
  it("should return cafe queries in TW locale", () => {
    const queries = getMealQueries("台北", "TW", "cafe");
    expect(queries.length).toBeGreaterThanOrEqual(1);
    expect(queries[0]).toContain("咖啡廳");
    expect(queries[0]).not.toMatch(/cafe|tea house/i);
  });

  it("should return dinner queries in EN locale", () => {
    const queries = getMealQueries("London", "EN", "dinner");
    expect(queries[0]).toContain("restaurant");
    expect(queries[0]).not.toMatch(/[\u4e00-\u9fff]/);
  });

  it("should return premium queries when spend is premium", () => {
    const queries = getMealQueries("Paris", "EN", "dinner", "premium");
    expect(queries[0]).toContain("fine dining");
  });

  it("should return budget queries when spend is budget", () => {
    const queries = getMealQueries("成都", "CN", "lunch", "budget");
    expect(queries.some((q) => q.includes("平价"))).toBe(true);
  });
});
