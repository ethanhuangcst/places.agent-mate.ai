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
    ...(price_level ? { price_level } : {}),
    sources: [],
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
