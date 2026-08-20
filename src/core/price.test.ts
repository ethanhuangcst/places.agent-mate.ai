import { describe, it, expect } from "vitest";
import { normalizeGooglePrice, normalizeAmapCost } from "./price";

describe("normalizeGooglePrice", () => {
  it("TC-M3b-PR01: should map PRICE_LEVEL_MODERATE to $$", () => {
    expect(normalizeGooglePrice("PRICE_LEVEL_MODERATE")).toBe("$$");
  });

  it("should map all Google price levels", () => {
    expect(normalizeGooglePrice("PRICE_LEVEL_FREE")).toBe("FREE");
    expect(normalizeGooglePrice("PRICE_LEVEL_INEXPENSIVE")).toBe("$");
    expect(normalizeGooglePrice("PRICE_LEVEL_EXPENSIVE")).toBe("$$$");
    expect(normalizeGooglePrice("PRICE_LEVEL_VERY_EXPENSIVE")).toBe("$$$$");
  });

  it("TC-M3b-PR03: should return undefined when unavailable", () => {
    expect(normalizeGooglePrice(undefined)).toBeUndefined();
    expect(normalizeGooglePrice("")).toBeUndefined();
    expect(normalizeGooglePrice("UNKNOWN_LEVEL")).toBeUndefined();
  });
});

describe("normalizeAmapCost", () => {
  it("TC-M3b-PR02: should map cost 80 to $$ with price_per_person", () => {
    const result = normalizeAmapCost(80);
    expect(result.price_level).toBe("$$");
    expect(result.price_per_person).toBe(80);
  });

  it("should map cost ranges correctly", () => {
    expect(normalizeAmapCost(30).price_level).toBe("$");
    expect(normalizeAmapCost(49).price_level).toBe("$");
    expect(normalizeAmapCost(50).price_level).toBe("$$");
    expect(normalizeAmapCost(150).price_level).toBe("$$$");
    expect(normalizeAmapCost(400).price_level).toBe("$$$$");
    expect(normalizeAmapCost(1000).price_level).toBe("$$$$");
  });

  it("TC-M3b-PR03: should return empty when unavailable", () => {
    expect(normalizeAmapCost(undefined)).toEqual({});
    expect(normalizeAmapCost(0)).toEqual({});
    expect(normalizeAmapCost(-1)).toEqual({});
    expect(normalizeAmapCost(NaN)).toEqual({});
  });
});
