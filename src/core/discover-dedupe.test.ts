import { describe, expect, it } from "vitest";
import {
  attractionClusterKey,
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

describe("dedupeRestaurantsByStem", () => {
  it("should_keep_one_branch_per_stem", () => {
    const out = dedupeRestaurantsByStem([
      card("海底捞火锅(博乐里店)", 4.7),
      card("海底捞火锅(钟楼店)", 4.5),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.name).toContain("博乐里");
  });
});
