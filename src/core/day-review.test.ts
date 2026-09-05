import { describe, expect, it } from "vitest";
import {
  resolveRepeatRestaurantName,
  shouldDropUnfilledForOvertime,
  swapUnfilledDetourPair,
} from "./day-review";

describe("day review F90-1 (TC-M23-91-07)", () => {
  it("should_never_drop_unfilled_attractions_for_overtime", () => {
    expect(shouldDropUnfilledForOvertime(90)).toBe(false);
    expect(shouldDropUnfilledForOvertime(0)).toBe(false);
  });

  it("should_swap_next_and_next_next_when_detour_over_40pct", () => {
    const remaining = [
      { name: "A", kind: "attraction" },
      { name: "B", kind: "attraction" },
      { name: "C", kind: "attraction" },
    ];
    const swapped = swapUnfilledDetourPair(remaining, 0.5);
    expect(swapped.map((s) => s.name)).toEqual(["B", "A", "C"]);
  });

  it("should_not_swap_when_detour_within_threshold", () => {
    const remaining = [
      { name: "A", kind: "attraction" },
      { name: "B", kind: "attraction" },
    ];
    expect(swapUnfilledDetourPair(remaining, 0.2).map((s) => s.name)).toEqual(["A", "B"]);
  });

  it("should_reuse_restaurant_when_no_unused_alternative", () => {
    expect(resolveRepeatRestaurantName("Cafe A", ["Cafe A"], [])).toBe("Cafe A");
    expect(resolveRepeatRestaurantName("Cafe A", ["Cafe A"], ["Cafe B"])).toBe("Cafe B");
  });
});
