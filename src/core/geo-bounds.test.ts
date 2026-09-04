import { describe, expect, it } from "vitest";
import {
  DAY_THEME_CLUSTER_KM,
  DISCOVER_GEO_MAX_KM,
  filterCardsNearAnchor,
  pickSupplementaryMustIncludeHit,
  trimThemedDayOutliers,
} from "./geo-bounds";
import { haversineKm } from "./must-include-coverage";
import type { PlaceCard } from "./types";

function card(name: string, lat: number, lng: number): PlaceCard {
  return {
    provider: "GOOGLE_MAPS",
    name,
    location: { lat, lng, crs: "WGS84" },
    sources: [],
  };
}

const LISBON = { lat: 38.7223, lng: -9.1393 };
const BELEM = card("贝伦塔", 38.6916, -9.216);
const CASCAIS = card("卡斯凯什", 38.697, -9.4217);
const CABO = card("罗卡角", 38.7804, -9.4989);
const PENA = card("佩纳宫", 38.7876, -9.3906);
const PINK = card("Pink Street", 38.7072, -9.1438);
const SCULPTURE = card("Street Sculpture", 38.7346, -9.1371);
const YELLOWSTONE = card("黄石国家公园", 44.5979, -110.5612);
const QUELUZ = card("克卢什国家宫", 38.7506, -9.2593);
const HOTEL = { lat: 38.7304, lng: -9.1405 };

describe("pickSupplementaryMustIncludeHit", () => {
  it("should_accept_english_vendor_name_for_cn_token", () => {
    const hit = pickSupplementaryMustIncludeHit(
      [card("Cascais", 38.697, -9.4217)],
      "卡斯凯什",
      { city: "里斯本", existingNorm: new Set() },
    );
    expect(hit?.name).toBe("Cascais");
  });

  it("should_skip_city_named_hit", () => {
    const hit = pickSupplementaryMustIncludeHit(
      [card("里斯本", 38.72, -9.14)],
      "卡斯凯什",
      { city: "里斯本", existingNorm: new Set() },
    );
    expect(hit).toBeUndefined();
  });
});

describe("filterCardsNearAnchor", () => {
  it("should_keep_name_only_card_when_coordinates_missing", () => {
    const nameless = {
      provider: "GOOGLE_MAPS" as const,
      name: "Alfama",
      sources: [],
    };
    const kept = filterCardsNearAnchor([BELEM, nameless, YELLOWSTONE], LISBON);
    expect(kept.map((c) => c.name)).toEqual(["贝伦塔", "Alfama"]);
  });

  it("should_drop_other_continent_card_and_keep_metro_and_day_trip", () => {
    const kept = filterCardsNearAnchor(
      [BELEM, CASCAIS, CABO, YELLOWSTONE],
      LISBON,
    );
    expect(kept.map((c) => c.name)).toEqual(["贝伦塔", "卡斯凯什", "罗卡角"]);
    expect(haversineKm(LISBON, YELLOWSTONE.location)).toBeGreaterThan(DISCOVER_GEO_MAX_KM);
    expect(haversineKm(LISBON, CABO.location)).toBeLessThanOrEqual(DISCOVER_GEO_MAX_KM);
  });
});

describe("trimThemedDayOutliers", () => {
  it("should_drop_lisbon_fillers_from_cascais_day", () => {
    const pool = [CASCAIS, SCULPTURE, PINK, BELEM];
    const trimmed = trimThemedDayOutliers(
      {
        days: [
          {
            day_theme: "卡斯凯什海岸一日游",
            stops: [
              { name: "Hills Hotel Lisboa", kind: "stay" },
              { name: "卡斯凯什", kind: "attraction" },
              { name: "Street Sculpture", kind: "attraction" },
              { name: "Pink Street", kind: "attraction" },
            ],
          },
        ],
      },
      pool,
      ["贝伦区", "辛特拉", "卡斯凯什"],
    );
    expect(trimmed.days[0]?.stops.map((s) => s.name)).toEqual([
      "Hills Hotel Lisboa",
      "卡斯凯什",
    ]);
  });

  it("should_keep_sintra_cluster_including_cabo_da_roca", () => {
    const pool = [card("辛特拉", 38.8029, -9.3817), PENA, CABO, PINK];
    expect(haversineKm({ lat: 38.8029, lng: -9.3817 }, CABO.location)).toBeLessThanOrEqual(
      DAY_THEME_CLUSTER_KM,
    );
    const trimmed = trimThemedDayOutliers(
      {
        days: [
          {
            day_theme: "辛特拉山地古堡",
            stops: [
              { name: "Hills Hotel Lisboa", kind: "stay" },
              { name: "辛特拉", kind: "attraction" },
              { name: "佩纳宫", kind: "attraction" },
              { name: "罗卡角", kind: "attraction" },
            ],
          },
        ],
      },
      pool,
      ["辛特拉"],
    );
    expect(trimmed.days[0]?.stops.map((s) => s.name)).toEqual([
      "Hills Hotel Lisboa",
      "辛特拉",
      "佩纳宫",
      "罗卡角",
    ]);
  });

  it("should_drop_stop_closer_to_hotel_than_to_day_trip_anchor", () => {
    const sintra = card("辛特拉宫", 38.7977, -9.3907);
    const trimmed = trimThemedDayOutliers(
      {
        days: [
          {
            day_theme: "辛特拉一日游",
            stops: [
              { name: "Hills Hotel Lisboa", kind: "stay" },
              { name: "辛特拉宫", kind: "attraction" },
              { name: "佩纳宫", kind: "attraction" },
              { name: "克卢什国家宫", kind: "attraction" },
            ],
          },
        ],
      },
      [sintra, PENA, QUELUZ],
      ["辛特拉"],
      HOTEL,
    );
    expect(trimmed.days[0]?.stops.map((s) => s.name)).toEqual([
      "Hills Hotel Lisboa",
      "辛特拉宫",
      "佩纳宫",
    ]);
  });

  it("should_leave_city_day_unchanged_when_no_must_include_focus", () => {
    const pool = [PINK, SCULPTURE, BELEM];
    const day = {
      day_theme: "老城与观景台",
      stops: [
        { name: "Hills Hotel Lisboa", kind: "stay" },
        { name: "Pink Street", kind: "attraction" },
        { name: "Street Sculpture", kind: "attraction" },
      ],
    };
    const trimmed = trimThemedDayOutliers({ days: [day] }, pool, ["卡斯凯什"]);
    expect(trimmed.days[0]?.stops).toEqual(day.stops);
  });
});
