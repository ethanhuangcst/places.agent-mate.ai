import { describe, expect, it } from "vitest";
import {
  applyNominatedMustSee,
  comparePoolHeat,
  markMustSeeByPoolHeat,
  poolHeatScore,
} from "./pool-heat-must-see";
import type { PlaceCard } from "./types";

function place(
  name: string,
  opts?: { user_ratings_total?: number; rating?: number; category?: string },
): PlaceCard {
  return {
    provider: "GOOGLE_MAPS",
    name,
    category: opts?.category ?? "tourist_attraction",
    location: { lat: 0, lng: 0, crs: "WGS84" },
    rating: opts?.rating,
    user_ratings_total: opts?.user_ratings_total,
    sources: [],
  };
}

describe("TC-M19-79-01 pool heat must-see", () => {
  it("should_rank_by_user_ratings_total_desc", () => {
    const low = place("Alpha Spot", { user_ratings_total: 100 });
    const high = place("Beta Landmark", { user_ratings_total: 50_000 });
    expect(poolHeatScore(high)).toBeGreaterThan(poolHeatScore(low));
    expect(comparePoolHeat(high, low)).toBeLessThan(0);
  });

  it("should_fallback_to_rating_when_review_count_missing", () => {
    const rated = place("Rated View", { rating: 4.8 });
    const plain = place("Plain Spot");
    expect(poolHeatScore(rated)).toBeGreaterThan(poolHeatScore(plain));
  });

  it("should_mark_top_k_attractions_must_see_without_city_names", () => {
    const pool = [
      place("Spot A", { user_ratings_total: 500 }),
      place("Spot B", { user_ratings_total: 12_000 }),
      place("Spot C", { user_ratings_total: 800 }),
      place("Spot D", { user_ratings_total: 40_000 }),
      place("Spot E", { user_ratings_total: 2_000 }),
    ];
    const names = markMustSeeByPoolHeat(pool, 3);
    expect(names).toEqual(["Spot D", "Spot B", "Spot E"]);
    expect(new Set(pool.filter((p) => p.must_see).map((p) => p.name))).toEqual(new Set(names));
    expect(pool.find((p) => p.name === "Spot A")?.must_see).toBeUndefined();
  });

  it("should_ignore_non_attraction_categories_for_heat_cap", () => {
    const pool = [
      place("Mall Plaza", { category: "shopping_mall", user_ratings_total: 999_999 }),
      place("Real Attraction", { user_ratings_total: 100 }),
    ];
    const names = markMustSeeByPoolHeat(pool, 1);
    expect(names).toEqual(["Real Attraction"]);
  });
});

describe("applyNominatedMustSee chip authority", () => {
  it("should_mark_nominated_cards_must_see_not_hottest_satellites", () => {
    const westLake = place("西湖", { user_ratings_total: 800 });
    const towerTicket = place("雷峰塔景区售票处", { user_ratings_total: 90_000 });
    const tower = place("雷峰塔", { user_ratings_total: 5_000 });
    const pool = [towerTicket, tower, westLake];
    const names = applyNominatedMustSee(pool, [westLake, tower], 5);
    expect(names).toEqual(["西湖", "雷峰塔"]);
    expect(westLake.must_see).toBe(true);
    expect(tower.must_see).toBe(true);
    expect(towerTicket.must_see).not.toBe(true);
  });

  it("should_fill_with_heat_when_nominations_empty", () => {
    const icon = place("西湖", { user_ratings_total: 100 });
    const hot = place("灵隐寺", { user_ratings_total: 50_000 });
    const names = applyNominatedMustSee([icon, hot], [], 2);
    expect(names).toEqual(["灵隐寺", "西湖"]);
  });

  it("should_use_heat_as_tie_break_when_two_pool_rows_match_one_nomination", () => {
    const a = place("Sintra", { user_ratings_total: 100 });
    const b = place("Sintra", { user_ratings_total: 9_000 });
    const nom = place("Sintra", { user_ratings_total: 1 });
    const names = applyNominatedMustSee([a, b], [nom], 1);
    expect(names).toEqual(["Sintra"]);
    expect(b.must_see).toBe(true);
    expect(a.must_see).not.toBe(true);
  });
});
