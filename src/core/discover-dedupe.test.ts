import { describe, expect, it } from "vitest";
import {
  attractionClusterKey,
  capClusterOccupancy,
  dedupeByCluster,
  dedupeRestaurantsByStem,
  ensureMustSeeDiversity,
} from "./discover-dedupe";
import { type PlaceCard } from "./types";

function card(name: string, rating?: number): PlaceCard {
  return {
    provider: "AMAP",
    name,
    category: "风景名胜",
    rating,
    location: { lat: 34.2, lng: 108.9, crs: "GCJ-02" },
    sources: [{ provider: "AMAP", native_id: name, deeplinks: {} }],
  };
}

/**
 * ADR-042 Update (2026-08-23): Xi'an-specific cluster branches removed.
 * Clustering is now destination-agnostic (normalized name only).
 */
describe("attractionClusterKey (ADR-042 Update — no city branches)", () => {
  it("should_return_normalized_name_only_no_city_landmarks", () => {
    // No "wall"/"terracotta"/"dayan" special cases — pure normalized name.
    expect(attractionClusterKey("西安城墙")).toBe("西安城墙");
    expect(attractionClusterKey("秦始皇帝陵博物院")).toBe("秦始皇帝陵博物院");
    expect(attractionClusterKey("大雁塔")).toBe("大雁塔");
    expect(attractionClusterKey("Pena Palace")).toBe("penapalace");
    expect(attractionClusterKey("  ")).toBe("unknown");
  });
});

describe("dedupeByCluster", () => {
  it("should_keep_one_per_exact_normalized_name", () => {
    const out = dedupeByCluster([
      card("Pena Palace", 4.8),
      card("Pena Palace", 4.5),
      card("Belém Tower", 4.7),
    ]);
    expect(out).toHaveLength(2);
    const pena = out.find((c) => c.name === "Pena Palace");
    expect(pena?.rating).toBe(4.8);
  });

  it("should_collapse_leifeng_pagoda_satellites_to_parent (前缀族聚类)", () => {
    // 雷峰塔, 雷峰塔景区, 雷峰塔景区售票处, 雷峰塔重建记 → all cluster to 雷峰塔
    const out = dedupeByCluster([
      card("雷峰塔", 4.5),
      card("雷峰塔景区", 4.2),
      card("雷峰塔景区售票处", 3.8),
      card("雷峰塔重建记", 4.0),
    ]);
    expect(out).toHaveLength(1);
    // Best score: 雷峰塔 (primary name, no satellite suffix, shortest)
    expect(out[0]!.name).toBe("雷峰塔");
  });

  it("should_not_collapse_memorial_hall_into_parent", () => {
    const out = dedupeByCluster([
      card("西湖", 4.9),
      card("中国茶叶博物馆", 4.6),
    ]);
    expect(out).toHaveLength(2);
  });

  it("should_not_collapse_unrelated_names_with_similar_starts", () => {
    // 雷峰塔 and 雷峰塔附近餐厅 should NOT collapse (餐厅 is not a satellite suffix)
    const out = dedupeByCluster([
      card("雷峰塔", 4.5),
      card("雷峰塔附近餐厅", 4.0),
    ]);
    expect(out).toHaveLength(2);
  });
});

describe("ensureMustSeeDiversity", () => {
  it("should_be_a_stable_pass_through_after_adr042_update", () => {
    const input = [
      card("西安博物院", 4.9),
      card("西安城墙", 4.7),
      card("大雁塔", 4.8),
    ];
    const out = ensureMustSeeDiversity(input);
    // No Xi'an-specific reordering — input order preserved.
    expect(out.map((c) => c.name)).toEqual([
      "西安博物院",
      "西安城墙",
      "大雁塔",
    ]);
  });
});

describe("capClusterOccupancy", () => {
  it("should_keep_at_most_three_per_cluster_preserving_order", () => {
    const out = capClusterOccupancy(
      [
        card("雷峰塔"),
        card("雷峰塔景区"),
        card("雷峰塔重建记"),
        card("雷峰塔景区售票处"),
        card("灵隐寺"),
      ],
      3,
    );
    expect(out.map((c) => c.name)).toEqual([
      "雷峰塔",
      "雷峰塔景区",
      "雷峰塔重建记",
      "灵隐寺",
    ]);
  });

  it("should_use_nominated_name_for_cluster_key_when_present", () => {
    const a: PlaceCard = {
      ...card("断桥残雪"),
      nominated_name: "断桥",
    };
    const b: PlaceCard = {
      ...card("断桥残雪石碑"),
      nominated_name: "断桥",
    };
    const c: PlaceCard = {
      ...card("苏堤春晓"),
      nominated_name: "苏堤",
    };
    // Same nominated stem maps via satellite strip of vendor names differently;
    // use identical nominated_name → same key after normalize.
    const out = capClusterOccupancy([a, b, c], 1);
    expect(out).toHaveLength(2);
    expect(out[0]!.nominated_name).toBe("断桥");
    expect(out[1]!.nominated_name).toBe("苏堤");
  });
});