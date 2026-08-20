import { describe, expect, it } from "vitest";
import { resolveFixtureGeocode } from "../src/adapters/fixtures";

describe("resolveFixtureGeocode — city coverage", () => {
  it("should resolve 北京三里屯 to Beijing, not HK", () => {
    const r = resolveFixtureGeocode("北京三里屯", "WGS84");
    expect(r.lat).toBeCloseTo(39.93, 1);
    expect(r.lng).toBeCloseTo(116.46, 1);
  });

  it("should resolve 成都春熙路 to Chengdu", () => {
    const r = resolveFixtureGeocode("成都市锦江区春熙路", "WGS84");
    expect(r.lat).toBeCloseTo(30.66, 1);
    expect(r.lng).toBeCloseTo(104.08, 1);
  });

  it("should resolve 广州塔 to Guangzhou", () => {
    const r = resolveFixtureGeocode("广州塔", "WGS84");
    expect(r.lat).toBeCloseTo(23.11, 1);
    expect(r.lng).toBeCloseTo(113.32, 1);
  });

  it("should resolve Lisboa to Lisbon, not HK", () => {
    const r = resolveFixtureGeocode("Lisboa", "WGS84");
    expect(r.lat).toBeCloseTo(38.72, 1);
    expect(r.lng).toBeCloseTo(-9.14, 1);
  });

  it("should resolve 澳门 to Macau", () => {
    const r = resolveFixtureGeocode("澳门大三巴牌坊", "WGS84");
    expect(r.lat).toBeCloseTo(22.19, 1);
    expect(r.lng).toBeCloseTo(113.54, 1);
  });

  it("should resolve Singapore to Singapore", () => {
    const r = resolveFixtureGeocode("Singapore Marina Bay", "WGS84");
    expect(r.lat).toBeCloseTo(1.28, 1);
    expect(r.lng).toBeCloseTo(103.86, 1);
  });

  it("should resolve 上海 to Shanghai (existing)", () => {
    const r = resolveFixtureGeocode("上海爱琴海购物公园", "WGS84");
    expect(r.lat).toBeCloseTo(31.17, 1);
  });

  it("should resolve Tokyo to Tokyo (existing)", () => {
    const r = resolveFixtureGeocode("東京上野", "WGS84");
    expect(r.lat).toBeCloseTo(35.72, 1);
  });

  it("should still default unknown query to HK", () => {
    const r = resolveFixtureGeocode("random place xyz", "WGS84");
    expect(r.lat).toBeCloseTo(22.28, 1);
    expect(r.lng).toBeCloseTo(114.16, 1);
  });
});
