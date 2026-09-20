import { describe, expect, it } from "vitest";
import {
  corridorSearchPoints,
  dayHasMealSlot,
  filterRestaurantsBySpend,
  insertMealIntoDayStops,
  mapSpendLevel,
  mealTimingAction,
  mealWindowForSlot,
  moveMealInDayStops,
  pickMealVenue,
  pickUnusedRestaurant,
  shouldInsertMeal,
  withinCorridorRadius,
} from "./meal-corridor";
import { type PlaceCard } from "./types";

function card(name: string, lat: number, lng: number, price_level?: string): PlaceCard {
  return {
    provider: "GOOGLE_MAPS",
    name,
    location: { lat, lng, crs: "WGS84" },
    category: "restaurant",
    ...(price_level ? { price_level } : {}),
    sources: [],
  };
}

function mealCard(opts: {
  name: string;
  lat: number;
  lng: number;
  provider?: PlaceCard["provider"];
  rating?: number;
  user_ratings_total?: number;
  category?: string;
  types?: string[];
  native_id: string;
}): PlaceCard {
  const provider = opts.provider ?? "GOOGLE_MAPS";
  return {
    provider,
    name: opts.name,
    location: { lat: opts.lat, lng: opts.lng, crs: "WGS84" },
    ...(opts.rating != null ? { rating: opts.rating } : {}),
    ...(opts.user_ratings_total != null ? { user_ratings_total: opts.user_ratings_total } : {}),
    ...(opts.category ? { category: opts.category } : {}),
    ...(opts.types ? { types: opts.types } : {}),
    sources: [{ provider, native_id: opts.native_id, deeplinks: {} }],
  };
}

describe("meal-corridor helpers (TC-M23-89)", () => {
  it("should_build_three_corridor_points_from_to", () => {
    const pts = corridorSearchPoints(
      { lat: 38.7, lng: -9.1, crs: "WGS84" },
      { lat: 38.72, lng: -9.14, crs: "WGS84" },
    );
    expect(pts).toHaveLength(3);
    expect(pts[1]!.lat).toBeCloseTo(38.71, 5);
    expect(pts[1]!.lng).toBeCloseTo(-9.12, 5);
  });

  it("should_prefer_lower_price_when_spend_is_budget", () => {
    const cards = [
      card("Fancy", 38.7, -9.1, "$$$"),
      card("Cheap", 38.7, -9.1, "$"),
      card("Mid", 38.7, -9.1, "$$"),
    ];
    const filtered = filterRestaurantsBySpend(cards, mapSpendLevel("budget"));
    expect(filtered.map((c) => c.name).sort()).toEqual(["Cheap", "Mid"]);
  });

  it("should_exclude_used_restaurant_names_across_picks", () => {
    const cards = [card("Ato", 38.7, -9.1), card("Maria", 38.7, -9.11)];
    expect(pickUnusedRestaurant(cards, ["Ato"])?.name).toBe("Maria");
    expect(pickUnusedRestaurant(cards, ["Ato", "Maria"])).toBeNull();
  });

  it("should_filter_within_corridor_radius_800m", () => {
    const near = { lat: 38.71, lng: -9.14, crs: "WGS84" as const };
    expect(withinCorridorRadius(near, card("Near", 38.7105, -9.1405))).toBe(true);
    expect(withinCorridorRadius(near, card("Far", 38.8, -9.3))).toBe(false);
  });

  it("should_accept_within_5km_hard_cap (S6B)", () => {
    const cabo = { lat: 38.7804, lng: -9.4989, crs: "WGS84" as const };
    expect(withinCorridorRadius(cabo, card("Local Cafe", 38.785, -9.49), 5)).toBe(true);
    // Lisbon ~43km from Cabo
    expect(withinCorridorRadius(cabo, card("Sense of Coffee", 38.71, -9.14), 5)).toBe(false);
  });

  it("should_use_lunch_and_dinner_windows (TC-M23-91)", () => {
    const lunch = mealWindowForSlot("lunch");
    expect(lunch.start).toBe(11 * 60 + 30);
    expect(lunch.end).toBe(14 * 60 + 30);
    expect(lunch.latestStart).toBe(13 * 60 + 30);
    expect(mealWindowForSlot("dinner", "relaxed").end).toBe(20 * 60);
    expect(mealWindowForSlot("dinner", "medium").latestStart).toBe(18 * 60);
    expect(mealWindowForSlot("dinner", "tight").duration).toBe(60);
    expect(mealTimingAction(10 * 60, "lunch")).toBe("fill"); // F92: early → snap/fill, not move_later
    expect(mealTimingAction(12 * 60, "lunch")).toBe("fill");
    expect(mealTimingAction(14 * 60, "lunch")).toBe("fill"); // past latest, still fill
    expect(mealTimingAction(15 * 60, "lunch")).toBe("move_earlier");
  });

  it("should_insert_dinner_when_relaxed_and_clock_in_dinner_window", () => {
    const dayStops = [
      { name: "Hotel", kind: "stay" },
      { name: "Castle", kind: "attraction" },
      { name: "lunch", kind: "meal", meal_slot: "lunch" },
      { name: "Tower", kind: "attraction" },
    ];
    expect(dayHasMealSlot(dayStops, "dinner")).toBe(false);
    expect(
      shouldInsertMeal({ clockMin: 18 * 60, dayStops, pace: "relaxed" }),
    ).toBe("dinner");
    const next = insertMealIntoDayStops(dayStops, "dinner", 3);
    expect(dayHasMealSlot(next, "dinner")).toBe(true);
    expect(next.findIndex((s) => s.meal_slot === "dinner")).toBeGreaterThan(
      next.findIndex((s) => s.name === "Tower"),
    );
  });

  it("should_insert_lunch_when_skeleton_has_no_lunch_and_clock_in_lunch_window", () => {
    const dayStops = [
      { name: "Hotel", kind: "stay" },
      { name: "Castle", kind: "attraction" },
      { name: "Tower", kind: "attraction" },
    ];
    expect(shouldInsertMeal({ clockMin: 12 * 60, dayStops })).toBe("lunch");
  });

  it("should_move_meal_later_when_arrival_before_window", () => {
    const dayStops = [
      { name: "Hotel", kind: "stay" },
      { name: "A", kind: "attraction" },
      { name: "lunch", kind: "meal", meal_slot: "lunch" },
      { name: "B", kind: "attraction" },
      { name: "C", kind: "attraction" },
    ];
    const moved = moveMealInDayStops(dayStops, "lunch", "later");
    expect(moved).not.toBeNull();
    const idx = moved!.findIndex((s) => s.meal_slot === "lunch");
    const bIdx = moved!.findIndex((s) => s.name === "B");
    expect(idx).toBe(bIdx + 1);
  });

  it("should_return_null_when_dinner_already_last_cannot_move_later", () => {
    const dayStops = [
      { name: "Hotel", kind: "stay" },
      { name: "A", kind: "attraction" },
      { name: "lunch", kind: "meal", meal_slot: "lunch" },
      { name: "B", kind: "attraction" },
      { name: "dinner", kind: "meal", meal_slot: "dinner" },
    ];
    expect(moveMealInDayStops(dayStops, "dinner", "later")).toBeNull();
  });
});

/** agent-meal-116 — fill rank by PlaceCard fields; no name denylist. */
describe("meal pick rank (TC-M116)", () => {
  const near = { lat: 38.71, lng: -9.14, crs: "WGS84" as const };

  it("should_prefer_gated_rating_over_nearer_low_score (TC-M116-01)", () => {
    const low = mealCard({
      name: "Near Low",
      lat: near.lat + 0.0005,
      lng: near.lng,
      rating: 2.2,
      user_ratings_total: 50,
      category: "restaurant",
      native_id: "g-low",
    });
    const high = mealCard({
      name: "Far High",
      lat: near.lat + 0.003,
      lng: near.lng,
      rating: 4.5,
      user_ratings_total: 50,
      category: "restaurant",
      native_id: "g-high",
    });
    const pick = pickMealVenue([low, high], [], { near });
    expect(pick?.card.name).toBe("Far High");
    expect(pick?.lowSignal).toBe(false);
  });

  it("should_allow_name_with_canteen_chars_when_restaurant_high_rated (TC-M116-02)", () => {
    const canteenTyped = mealCard({
      name: "Staff Cafe",
      lat: near.lat + 0.0003,
      lng: near.lng,
      rating: 4.9,
      user_ratings_total: 10,
      category: "cafeteria",
      types: ["cafeteria"],
      native_id: "g-caf",
    });
    const namedCanteen = mealCard({
      name: "园区食堂饭店",
      lat: near.lat + 0.002,
      lng: near.lng,
      rating: 4.8,
      user_ratings_total: 80,
      category: "restaurant",
      types: ["restaurant"],
      native_id: "g-rest",
    });
    const pick = pickMealVenue([canteenTyped, namedCanteen], [], { near });
    expect(pick?.card.name).toBe("园区食堂饭店");
  });

  it("should_exclude_google_cafeteria_and_food_court (TC-M116-03)", () => {
    const caf = mealCard({
      name: "Cafeteria A",
      lat: near.lat,
      lng: near.lng,
      rating: 4.9,
      user_ratings_total: 100,
      types: ["cafeteria"],
      native_id: "g-caf2",
    });
    const court = mealCard({
      name: "Food Court B",
      lat: near.lat,
      lng: near.lng + 0.001,
      rating: 4.8,
      user_ratings_total: 100,
      category: "food_court",
      native_id: "g-fc",
    });
    const rest = mealCard({
      name: "Real Restaurant",
      lat: near.lat + 0.002,
      lng: near.lng,
      rating: 4.0,
      user_ratings_total: 40,
      category: "restaurant",
      native_id: "g-rest2",
    });
    expect(pickMealVenue([caf, court, rest], [], { near })?.card.name).toBe("Real Restaurant");
  });

  it("should_apply_google_review_floor_only_when_count_present (TC-M116-04)", () => {
    const noCount = mealCard({
      name: "No Count",
      lat: near.lat,
      lng: near.lng,
      rating: 4.0,
      category: "restaurant",
      native_id: "g-nc",
    });
    const fewReviews = mealCard({
      name: "Few Reviews",
      lat: near.lat + 0.001,
      lng: near.lng,
      rating: 4.0,
      user_ratings_total: 5,
      category: "restaurant",
      native_id: "g-few",
    });
    const pick = pickMealVenue([fewReviews, noCount], [], { near });
    expect(pick?.card.name).toBe("No Count");
  });

  it("should_not_champion_unrated_when_gated_card_exists (TC-M116-05)", () => {
    const unrated = mealCard({
      name: "Unrated Near",
      lat: near.lat + 0.0002,
      lng: near.lng,
      provider: "AMAP",
      native_id: "a-u",
    });
    const rated = mealCard({
      name: "Rated Farther",
      lat: near.lat + 0.002,
      lng: near.lng,
      provider: "AMAP",
      rating: 4.2,
      native_id: "a-r",
    });
    expect(pickMealVenue([unrated, rated], [], { near })?.card.name).toBe("Rated Farther");
  });

  it("should_rank_amap_by_rating_without_review_count (TC-M116-06)", () => {
    const low = mealCard({
      name: "Amap Low",
      lat: near.lat,
      lng: near.lng,
      provider: "AMAP",
      rating: 2.0,
      native_id: "a-low",
    });
    const high = mealCard({
      name: "Amap High",
      lat: near.lat + 0.002,
      lng: near.lng,
      provider: "AMAP",
      rating: 4.0,
      native_id: "a-high",
    });
    expect(pickMealVenue([low, high], [], { near })?.card.name).toBe("Amap High");
  });

  it("should_still_place_best_when_all_below_gate_and_set_low_signal (TC-M116-07)", () => {
    const a = mealCard({
      name: "Weak A",
      lat: near.lat,
      lng: near.lng,
      rating: 2.0,
      user_ratings_total: 50,
      category: "restaurant",
      native_id: "g-wa",
    });
    const b = mealCard({
      name: "Weak B",
      lat: near.lat + 0.001,
      lng: near.lng,
      rating: 3.0,
      user_ratings_total: 50,
      category: "restaurant",
      native_id: "g-wb",
    });
    const pick = pickMealVenue([a, b], [], { near });
    expect(pick?.card.name).toBe("Weak B");
    expect(pick?.lowSignal).toBe(true);
  });

  it("should_prefer_unused_native_id_over_name (TC-M116-08)", () => {
    const used = mealCard({
      name: "Same Display",
      lat: near.lat,
      lng: near.lng,
      rating: 4.5,
      user_ratings_total: 30,
      category: "restaurant",
      native_id: "g-used",
    });
    const other = mealCard({
      name: "Other Place",
      lat: near.lat + 0.001,
      lng: near.lng,
      rating: 4.4,
      user_ratings_total: 30,
      category: "restaurant",
      native_id: "g-free",
    });
    const pick = pickMealVenue([used, other], ["g-used"], { near });
    expect(pick?.card.sources[0]?.native_id).toBe("g-free");
  });
});

/** agent-meal-118 — Google meal type gate + Bayesian rank. */
describe("meal pick type and bayes (TC-M118)", () => {
  const near = { lat: 38.71, lng: -9.14, crs: "WGS84" as const };

  it("should_prefer_restaurant_primary_over_breakfast_types0 (TC-M118-01)", () => {
    const artis = mealCard({
      name: "ARTIS CHUNXI",
      lat: near.lat,
      lng: near.lng,
      rating: 5.0,
      user_ratings_total: 46,
      types: ["breakfast_restaurant", "cafe", "restaurant"],
      native_id: "g-artis",
    });
    const real = mealCard({
      name: "Real Dinner",
      lat: near.lat + 0.002,
      lng: near.lng,
      rating: 4.6,
      user_ratings_total: 80,
      category: "restaurant",
      types: ["restaurant"],
      native_id: "g-real",
    });
    const pick = pickMealVenue([artis, real], [], { near, query: "restaurant" });
    expect(pick?.card.name).toBe("Real Dinner");
  });

  it("should_keep_restaurant_eligible_when_types_also_list_cafe (TC-M118-02)", () => {
    const rest = mealCard({
      name: "Bistro",
      lat: near.lat,
      lng: near.lng,
      rating: 4.5,
      user_ratings_total: 100,
      category: "restaurant",
      types: ["restaurant", "cafe", "food"],
      native_id: "g-bistro",
    });
    const pick = pickMealVenue([rest], [], { near, query: "restaurant" });
    expect(pick?.card.name).toBe("Bistro");
  });

  it("should_allow_cafe_primary_on_cafe_query (TC-M118-03)", () => {
    const cafe = mealCard({
      name: "Corner Cafe",
      lat: near.lat,
      lng: near.lng,
      rating: 4.4,
      user_ratings_total: 40,
      category: "cafe",
      types: ["cafe"],
      native_id: "g-cafe",
    });
    const pick = pickMealVenue([cafe], [], { near, query: "cafe" });
    expect(pick?.card.name).toBe("Corner Cafe");
  });

  it("should_prefer_more_reviews_over_perfect_few (TC-M118-04)", () => {
    const fewPerfect = mealCard({
      name: "Five Twenty",
      lat: near.lat,
      lng: near.lng,
      rating: 5.0,
      user_ratings_total: 20,
      category: "restaurant",
      native_id: "g-a",
    });
    const moreReviews = mealCard({
      name: "Four Five Hundred",
      lat: near.lat + 0.001,
      lng: near.lng,
      rating: 4.5,
      user_ratings_total: 100,
      category: "restaurant",
      native_id: "g-b",
    });
    const pick = pickMealVenue([fewPerfect, moreReviews], [], { near, query: "restaurant" });
    expect(pick?.card.name).toBe("Four Five Hundred");
  });

  it("should_rank_amap_by_raw_rating_without_bayes (TC-M118-05)", () => {
    const low = mealCard({
      name: "Amap 4.0",
      lat: near.lat,
      lng: near.lng,
      provider: "AMAP",
      rating: 4.0,
      native_id: "a-40",
    });
    const high = mealCard({
      name: "Amap 4.6",
      lat: near.lat + 0.002,
      lng: near.lng,
      provider: "AMAP",
      rating: 4.6,
      native_id: "a-46",
    });
    expect(pickMealVenue([low, high], [], { near })?.card.name).toBe("Amap 4.6");
  });
});
