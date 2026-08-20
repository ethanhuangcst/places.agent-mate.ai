import { describe, it, expect } from "vitest";
import { resolveProviderStrategy } from "./provider-resolver";

describe("resolveProviderStrategy", () => {
  // === 大陆 → 策略2 only (AMAP) ===

  it("should select AMAP only for Shanghai (text)", () => {
    const r = resolveProviderStrategy({ location: "上海市南京西路" });
    expect(r.searchProviders).toEqual(["AMAP"]);
    expect(r.enrichProviders).toEqual([]);
  });

  it("should select AMAP only for Beijing (text)", () => {
    const r = resolveProviderStrategy({ location: "北京市朝阳区银河SOHO" });
    expect(r.searchProviders).toEqual(["AMAP"]);
    expect(r.enrichProviders).toEqual([]);
  });

  it("should select AMAP only for mainland coordinates", () => {
    const r = resolveProviderStrategy({ near: { lat: 39.9, lng: 116.4 } });
    expect(r.searchProviders).toEqual(["AMAP"]);
    expect(r.enrichProviders).toEqual([]);
  });

  it("should select AMAP only for Kunming (English text)", () => {
    const r = resolveProviderStrategy({ location: "Kunming hotel" });
    expect(r.searchProviders).toEqual(["AMAP"]);
  });

  it("should select AMAP regardless of locale for mainland", () => {
    const r = resolveProviderStrategy({ location: "上海市南京西路", locale: "EN" });
    expect(r.searchProviders).toEqual(["AMAP"]);
    expect(r.enrichProviders).toEqual([]);
  });

  // === 香港 → 策略1 + 策略2 (Google + AMAP + TripAdvisor) ===

  it("should select Google + AMAP for Hong Kong (text)", () => {
    const r = resolveProviderStrategy({ location: "Hong Kong Central" });
    expect(r.searchProviders).toEqual(["GOOGLE_MAPS", "AMAP"]);
    expect(r.enrichProviders).toEqual(["TRIPADVISOR"]);
  });

  it("should select Google + AMAP for 香港 (Chinese text)", () => {
    const r = resolveProviderStrategy({ location: "香港尖沙咀" });
    expect(r.searchProviders).toEqual(["GOOGLE_MAPS", "AMAP"]);
    expect(r.enrichProviders).toEqual(["TRIPADVISOR"]);
  });

  it("should select Google + AMAP for HK coordinates", () => {
    const r = resolveProviderStrategy({ near: { lat: 22.28, lng: 114.17 } });
    expect(r.searchProviders).toEqual(["GOOGLE_MAPS", "AMAP"]);
    expect(r.enrichProviders).toEqual(["TRIPADVISOR"]);
  });

  // === 其他 → 策略1 only (Google + TripAdvisor) ===

  it("should select Google only for Tokyo", () => {
    const r = resolveProviderStrategy({ location: "Tokyo Tower" });
    expect(r.searchProviders).toEqual(["GOOGLE_MAPS"]);
    expect(r.enrichProviders).toEqual(["TRIPADVISOR"]);
  });

  it("should select Google only for Lisbon", () => {
    const r = resolveProviderStrategy({ location: "Lisbon, Portugal" });
    expect(r.searchProviders).toEqual(["GOOGLE_MAPS"]);
    expect(r.enrichProviders).toEqual(["TRIPADVISOR"]);
  });

  it("should select Google only for Taiwan (台北)", () => {
    const r = resolveProviderStrategy({ location: "台北市信義區" });
    expect(r.searchProviders).toEqual(["GOOGLE_MAPS"]);
    expect(r.enrichProviders).toEqual(["TRIPADVISOR"]);
  });

  it("should select Google only for Taiwan coordinates", () => {
    const r = resolveProviderStrategy({ near: { lat: 25.03, lng: 121.56 } });
    expect(r.searchProviders).toEqual(["GOOGLE_MAPS"]);
    expect(r.enrichProviders).toEqual(["TRIPADVISOR"]);
  });

  it("should select Google only for Japan coordinates", () => {
    const r = resolveProviderStrategy({ near: { lat: 35.68, lng: 139.69 } });
    expect(r.searchProviders).toEqual(["GOOGLE_MAPS"]);
    expect(r.enrichProviders).toEqual(["TRIPADVISOR"]);
  });

  it("should default to Google when no location info", () => {
    const r = resolveProviderStrategy({});
    expect(r.searchProviders).toEqual(["GOOGLE_MAPS"]);
    expect(r.enrichProviders).toEqual(["TRIPADVISOR"]);
  });

  // === CJK heuristic ===

  it("should detect mainland by CJK character ratio", () => {
    const r = resolveProviderStrategy({ location: "昆明市五华区翠湖" });
    expect(r.searchProviders).toEqual(["AMAP"]);
  });

  // === 澳门 (Macau) — AMAP works, treated as mainland ===

  it("should select AMAP for 澳门 (Chinese text)", () => {
    const r = resolveProviderStrategy({ location: "澳门大三巴牌坊" });
    expect(r.searchProviders).toEqual(["AMAP"]);
    expect(r.enrichProviders).toEqual([]);
  });

  it("should select AMAP for Macau (English text)", () => {
    const r = resolveProviderStrategy({ location: "Macau Senado Square" });
    expect(r.searchProviders).toEqual(["AMAP"]);
    expect(r.enrichProviders).toEqual([]);
  });

  it("should select AMAP for Macau coordinates", () => {
    // Macau: lat 22.19, lng 113.54 — outside HK bounding box, inside China bounds
    const r = resolveProviderStrategy({ near: { lat: 22.19, lng: 113.54 } });
    expect(r.searchProviders).toEqual(["AMAP"]);
    expect(r.enrichProviders).toEqual([]);
  });

  // === 新加坡 (Singapore) — overseas, Google only ===

  it("should select Google for Singapore (English text)", () => {
    const r = resolveProviderStrategy({ location: "Singapore Marina Bay" });
    expect(r.searchProviders).toEqual(["GOOGLE_MAPS"]);
    expect(r.enrichProviders).toEqual(["TRIPADVISOR"]);
  });

  it("should select Google for Singapore coordinates", () => {
    const r = resolveProviderStrategy({ near: { lat: 1.35, lng: 103.8 } });
    expect(r.searchProviders).toEqual(["GOOGLE_MAPS"]);
    expect(r.enrichProviders).toEqual(["TRIPADVISOR"]);
  });

  it("should select Google for 新加坡 (CJK text, not misdetected as mainland)", () => {
    const r = resolveProviderStrategy({ location: "新加坡滨海湾" });
    expect(r.searchProviders).toEqual(["GOOGLE_MAPS"]);
    expect(r.enrichProviders).toEqual(["TRIPADVISOR"]);
  });

  // === Coordinate boundary edge cases ===

  it("should detect HK at bounding box edge (lat 22.15, lng 113.83)", () => {
    const r = resolveProviderStrategy({ near: { lat: 22.15, lng: 113.83 } });
    expect(r.searchProviders).toEqual(["GOOGLE_MAPS", "AMAP"]);
  });

  it("should detect mainland just outside HK box (lat 22.20, lng 113.82)", () => {
    // lng 113.82 < HK box min 113.83 → falls to China mainland check
    const r = resolveProviderStrategy({ near: { lat: 22.20, lng: 113.82 } });
    expect(r.searchProviders).toEqual(["AMAP"]);
  });

  it("should detect 'other' below China bounds (lat 17.99)", () => {
    const r = resolveProviderStrategy({ near: { lat: 17.99, lng: 110.0 } });
    expect(r.searchProviders).toEqual(["GOOGLE_MAPS"]);
    expect(r.enrichProviders).toEqual(["TRIPADVISOR"]);
  });

  // === Other overseas CJK cities ===

  it("should select Google for 大阪 (CJK text)", () => {
    const r = resolveProviderStrategy({ location: "大阪道頓堀" });
    expect(r.searchProviders).toEqual(["GOOGLE_MAPS"]);
  });

  it("should select Google for 曼谷 (CJK text)", () => {
    const r = resolveProviderStrategy({ location: "曼谷暹罗广场" });
    expect(r.searchProviders).toEqual(["GOOGLE_MAPS"]);
  });
});
