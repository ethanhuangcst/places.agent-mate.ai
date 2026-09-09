import { describe, expect, it } from "vitest";
import { mustSeeChipLabel } from "./plan-trip";
import { type PlaceCard } from "./types";

function card(name: string, nominated?: string): PlaceCard {
  return {
    provider: "AMAP",
    name,
    nominated_name: nominated,
    location: { lat: 30.2, lng: 120.1, crs: "GCJ-02" },
    sources: [{ provider: "AMAP", native_id: name, deeplinks: {} }],
  };
}

describe("mustSeeChipLabel", () => {
  it("should_use_nominated_short_name_when_vendor_name_differs", () => {
    expect(mustSeeChipLabel(card("断桥残雪", "断桥"))).toBe("断桥");
  });

  it("should_fall_back_to_vendor_name_when_nominated_absent", () => {
    expect(mustSeeChipLabel(card("雷峰塔景区"))).toBe("雷峰塔景区");
  });
});
