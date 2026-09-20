import { describe, expect, it } from "vitest";
import {
  parseAmapGeocodeAdmin,
  parseGoogleAddressComponents,
  amapAdminString,
  isAmapDestEligibleGeoLevel,
  isAmapDestEligiblePoiType,
} from "./geocode-hit";

describe("parseGoogleAddressComponents", () => {
  it("should_extract_country_and_locality", () => {
    const parsed = parseGoogleAddressComponents([
      { long_name: "Lisbon", types: ["locality", "political"] },
      { long_name: "Portugal", types: ["country", "political"] },
    ]);
    expect(parsed).toEqual({ country: "Portugal", city: "Lisbon" });
  });

  it("should_fall_back_to_admin_area_when_no_locality", () => {
    const parsed = parseGoogleAddressComponents([
      { long_name: "Taipei", types: ["administrative_area_level_1", "political"] },
      { long_name: "Taiwan", types: ["country", "political"] },
    ]);
    expect(parsed).toEqual({ country: "Taiwan", city: "Taipei" });
  });

  it("should_return_empty_when_components_missing", () => {
    expect(parseGoogleAddressComponents(undefined)).toEqual({});
    expect(parseGoogleAddressComponents([])).toEqual({});
  });

  it("should_use_country_as_city_when_city_state_has_no_locality", () => {
    expect(
      parseGoogleAddressComponents([
        { long_name: "香港", types: ["country", "political"] },
      ]),
    ).toEqual({ country: "香港", city: "香港" });
    expect(
      parseGoogleAddressComponents([
        { long_name: "Hong Kong", types: ["country", "political"] },
      ]),
    ).toEqual({ country: "Hong Kong", city: "Hong Kong" });
    expect(
      parseGoogleAddressComponents([
        { long_name: "Macao", types: ["country", "political"] },
      ]),
    ).toEqual({ country: "Macao", city: "Macao" });
  });
});

describe("parseAmapGeocodeAdmin", () => {
  it("should_prefer_city_over_province", () => {
    expect(
      parseAmapGeocodeAdmin({
        country: "中国",
        province: "上海市",
        city: "上海市",
        district: "闵行区",
      }),
    ).toEqual({ country: "中国", city: "上海市" });
  });

  it("should_use_province_when_city_blank", () => {
    expect(parseAmapGeocodeAdmin({ province: "台湾省", city: "" })).toEqual({
      country: "中国",
      city: "台湾省",
    });
  });

  it("should_treat_empty_array_city_as_missing", () => {
    expect(
      parseAmapGeocodeAdmin({
        country: "中国",
        province: "河南省",
        city: [],
        district: "济源市",
      }),
    ).toEqual({ country: "中国", city: "济源市" });
  });

  it("should_default_country_china_when_admin_present", () => {
    expect(parseAmapGeocodeAdmin({ province: "浙江省", city: "杭州市" })).toEqual({
      country: "中国",
      city: "杭州市",
    });
  });
});

describe("amap dest eligibility (agent-geocode-114)", () => {
  it("should_reject_residential_geo_level", () => {
    expect(isAmapDestEligibleGeoLevel("住宅区")).toBe(false);
    expect(isAmapDestEligibleGeoLevel("道路")).toBe(false);
    expect(isAmapDestEligibleGeoLevel("市")).toBe(true);
    expect(isAmapDestEligibleGeoLevel("兴趣点")).toBe(true);
    expect(isAmapDestEligibleGeoLevel(undefined)).toBe(true);
    expect(isAmapDestEligibleGeoLevel("")).toBe(true);
  });

  it("should_accept_scenic_poi_types_and_reject_housing", () => {
    expect(isAmapDestEligiblePoiType("风景名胜;风景名胜;国家级景点")).toBe(true);
    expect(isAmapDestEligiblePoiType("地名地址信息;自然地名;岛屿")).toBe(true);
    expect(isAmapDestEligiblePoiType("商务住宅;住宅区;住宅小区")).toBe(false);
    expect(isAmapDestEligiblePoiType("餐饮服务;中餐厅")).toBe(false);
  });

  it("should_treat_non_string_admin_as_empty", () => {
    expect(amapAdminString([])).toBeUndefined();
    expect(amapAdminString("  厦门市  ")).toBe("厦门市");
  });
});
