import { describe, expect, it } from "vitest";
import {
  parseAmapGeocodeAdmin,
  parseGoogleAddressComponents,
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
      city: "台湾省",
    });
  });
});
