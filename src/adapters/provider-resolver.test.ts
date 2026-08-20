import { describe, it, expect } from "vitest";
import { resolveProviderStrategy, type GeocodeFn } from "./provider-resolver";

/** No-op geocode — simulates offline / no geocode injected */
const noGeocode = undefined;

/** Mock geocode that returns formatted address based on known patterns */
const mockGeocode: GeocodeFn = async (query) => {
  const q = query.toLowerCase();
  if (q.includes("紫藤路") || q.includes("三里屯") || q.includes("春熙路"))
    return { address: "Shanghai, China", lat: 31.17, lng: 121.37 };
  if (q.includes("中環") || q.includes("中环") || q.includes("深水埗"))
    return { address: "Central, Hong Kong", lat: 22.28, lng: 114.16 };
  if (q.includes("銀座") || q.includes("银座"))
    return { address: "Ginza, Chuo City, Tokyo, Japan", lat: 35.67, lng: 139.76 };
  if (q.includes("明洞"))
    return { address: "Myeong-dong, Seoul, South Korea", lat: 37.56, lng: 126.99 };
  if (q.includes("臺北") || q.includes("台北"))
    return { address: "Taipei City, Taiwan", lat: 25.03, lng: 121.56 };
  return null;
};

/** Failing geocode — simulates network error */
const failingGeocode: GeocodeFn = async () => { throw new Error("network timeout"); };

describe("resolveProviderStrategy", () => {

  // === 坐标判断 (priority 1, no API call) ===

  it("mainland coordinates → AMAP", async () => {
    const r = await resolveProviderStrategy({ near: { lat: 39.9, lng: 116.4 } });
    expect(r.searchProviders).toEqual(["AMAP"]);
  });

  it("HK coordinates → Google + AMAP", async () => {
    const r = await resolveProviderStrategy({ near: { lat: 22.28, lng: 114.17 } });
    expect(r.searchProviders).toEqual(["GOOGLE_MAPS", "AMAP"]);
  });

  it("Taiwan coordinates → Google only", async () => {
    const r = await resolveProviderStrategy({ near: { lat: 25.03, lng: 121.56 } });
    expect(r.searchProviders).toEqual(["GOOGLE_MAPS"]);
  });

  it("Japan coordinates → Google only", async () => {
    const r = await resolveProviderStrategy({ near: { lat: 35.68, lng: 139.69 } });
    expect(r.searchProviders).toEqual(["GOOGLE_MAPS"]);
  });

  // === Google Geocode 判断 (priority 2) ===

  it("紫藤路128弄 + geocode → China → AMAP", async () => {
    const r = await resolveProviderStrategy({ location: "紫藤路128弄" }, mockGeocode);
    expect(r.searchProviders).toEqual(["AMAP"]);
  });

  it("short street label + geocode coords without country in address → mainland AMAP", async () => {
    const streetGeocode: GeocodeFn = async () => ({
      address: "吴中路",
      lat: 31.17,
      lng: 121.37,
    });
    const r = await resolveProviderStrategy({ location: "吴中路" }, streetGeocode);
    expect(r.searchProviders).toEqual(["AMAP"]);
  });

  it("中環 + geocode → Hong Kong → Google + AMAP", async () => {
    const r = await resolveProviderStrategy({ location: "中環" }, mockGeocode);
    expect(r.searchProviders).toEqual(["GOOGLE_MAPS", "AMAP"]);
  });

  it("銀座 + geocode → Japan → Google only", async () => {
    const r = await resolveProviderStrategy({ location: "銀座" }, mockGeocode);
    expect(r.searchProviders).toEqual(["GOOGLE_MAPS"]);
  });

  it("明洞 + geocode → Korea → Google only", async () => {
    const r = await resolveProviderStrategy({ location: "明洞" }, mockGeocode);
    expect(r.searchProviders).toEqual(["GOOGLE_MAPS"]);
  });

  it("臺北遠山 + geocode → Taiwan → Google only", async () => {
    const r = await resolveProviderStrategy({ location: "臺北遠山" }, mockGeocode);
    expect(r.searchProviders).toEqual(["GOOGLE_MAPS"]);
  });

  // === Geocode failure → fallback to markers ===

  it("geocode fails → falls back to markers → 上海 → AMAP", async () => {
    const r = await resolveProviderStrategy({ location: "上海市南京西路" }, failingGeocode);
    expect(r.searchProviders).toEqual(["AMAP"]);
  });

  it("geocode fails → falls back to markers → 香港 → Google + AMAP", async () => {
    const r = await resolveProviderStrategy({ location: "香港尖沙咀" }, failingGeocode);
    expect(r.searchProviders).toEqual(["GOOGLE_MAPS", "AMAP"]);
  });

  it("geocode fails → unknown CJK text → default Google (no CJK fallback)", async () => {
    const r = await resolveProviderStrategy({ location: "銀座" }, failingGeocode);
    // Without geocode, "銀座" matches no marker → default "other" → Google
    expect(r.searchProviders).toEqual(["GOOGLE_MAPS"]);
  });

  // === Marker-only (no geocode injected) ===

  it("Shanghai text, no geocode → markers → AMAP", async () => {
    const r = await resolveProviderStrategy({ location: "上海市南京西路" }, noGeocode);
    expect(r.searchProviders).toEqual(["AMAP"]);
  });

  it("Hong Kong text, no geocode → markers → Google + AMAP", async () => {
    const r = await resolveProviderStrategy({ location: "Hong Kong Central" }, noGeocode);
    expect(r.searchProviders).toEqual(["GOOGLE_MAPS", "AMAP"]);
  });

  it("中環 text, no geocode → HK marker → Google + AMAP", async () => {
    const r = await resolveProviderStrategy({ location: "中環" }, noGeocode);
    expect(r.searchProviders).toEqual(["GOOGLE_MAPS", "AMAP"]);
  });

  it("台北 text, no geocode → TW marker → Google only", async () => {
    const r = await resolveProviderStrategy({ location: "台北市信義區" }, noGeocode);
    expect(r.searchProviders).toEqual(["GOOGLE_MAPS"]);
  });

  it("Tokyo text, no geocode → no marker match → default Google", async () => {
    const r = await resolveProviderStrategy({ location: "Tokyo Tower" }, noGeocode);
    expect(r.searchProviders).toEqual(["GOOGLE_MAPS"]);
  });

  it("Macau text, no geocode → china-cities match → AMAP", async () => {
    const r = await resolveProviderStrategy({ location: "澳门大三巴牌坊" }, noGeocode);
    expect(r.searchProviders).toEqual(["AMAP"]);
  });

  // === CJK text with no marker match → default Google (NOT mainland) ===

  it("銀座 without geocode → no marker → default Google (not AMAP)", async () => {
    const r = await resolveProviderStrategy({ location: "銀座" }, noGeocode);
    expect(r.searchProviders).toEqual(["GOOGLE_MAPS"]);
  });

  it("明洞 without geocode → no marker → default Google (not AMAP)", async () => {
    const r = await resolveProviderStrategy({ location: "明洞" }, noGeocode);
    expect(r.searchProviders).toEqual(["GOOGLE_MAPS"]);
  });

  it("新加坡滨海湾 without geocode → no marker → default Google", async () => {
    const r = await resolveProviderStrategy({ location: "新加坡滨海湾" }, noGeocode);
    expect(r.searchProviders).toEqual(["GOOGLE_MAPS"]);
  });

  // === No input → default Google ===

  it("empty input → default Google", async () => {
    const r = await resolveProviderStrategy({});
    expect(r.searchProviders).toEqual(["GOOGLE_MAPS"]);
  });

  // === Coordinates take priority over geocode ===

  it("coords override geocode — HK coords + mainland text → hongkong", async () => {
    const r = await resolveProviderStrategy(
      { location: "上海", near: { lat: 22.28, lng: 114.17 } },
      mockGeocode,
    );
    expect(r.searchProviders).toEqual(["GOOGLE_MAPS", "AMAP"]);
  });
});
