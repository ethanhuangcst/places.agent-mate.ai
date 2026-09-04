/**
 * TC-M12-49-04 / TC-M19-79-01 / TC-M20-41-10 — discoverPlaces pool-then-heat.
 *
 * Isolates discoverPlaces by mocking the query assembler and vendor search.
 * Phase B uses real findIconicPlaces (heat on the existing pool).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { searchPlacesMock, searchRestaurantsMock } = vi.hoisted(() => ({
  searchPlacesMock: vi.fn(),
  searchRestaurantsMock: vi.fn(),
}));

vi.mock("./query-assembler", () => ({
  assembleDiscoverAttractionJobs: () => [{ query: "landmarks", providers: ["GOOGLE_MAPS"] }],
  assembleDiscoverRestaurantJobs: () => [],
  assembleAttractionSearchJobs: () => [],
  assembleRestaurantSearchJobs: () => [],
}));
vi.mock("./tools", () => ({
  searchPlaces: searchPlacesMock,
  searchRestaurants: searchRestaurantsMock,
  geocode: vi.fn().mockResolvedValue({ data: { lat: 0, lng: 0, crs: "WGS84" } }),
}));

import { discoverPlaces } from "./itinerary-planner";
import { clearIconicCache } from "./iconic-places-cache";
import type { PlaceCard } from "./types";

function card(
  name: string,
  opts?: { user_ratings_total?: number; category?: string },
): PlaceCard {
  return {
    provider: "GOOGLE_MAPS",
    name,
    category: opts?.category ?? "tourist_attraction",
    location: { lat: 0, lng: 0, crs: "WGS84" },
    user_ratings_total: opts?.user_ratings_total,
    sources: [],
  };
}

beforeEach(() => {
  searchPlacesMock.mockReset();
  searchRestaurantsMock.mockReset();
  clearIconicCache();
});

describe("TC-M20-41-10 discoverPlaces heat-on-pool after Phase A", () => {
  it("should_mark_must_see_from_existing_pool_heat_and_cap_at_max_number", async () => {
    searchPlacesMock.mockResolvedValue({
      data: [
        card("Low Signal", { user_ratings_total: 200 }),
        card("Hot Alpha", { user_ratings_total: 45_000 }),
        card("Hot Beta", { user_ratings_total: 12_000 }),
        card("Mid Spot", { user_ratings_total: 3_000 }),
      ],
    });

    const result = await discoverPlaces({
      city: "Sample City",
      bounds: { start: "2026-09-01", end: "2026-09-02" },
      locale: "EN",
      numDays: 1,
      max_number: 2,
    });

    expect(searchPlacesMock).toHaveBeenCalledTimes(1);
    expect(result.inferred_must_see).toEqual(["Hot Alpha", "Hot Beta"]);
    expect(result.candidates.places.find((p) => p.name === "Hot Alpha")?.must_see).toBe(true);
    expect(result.candidates.places.find((p) => p.name === "Hot Beta")?.must_see).toBe(true);
    expect(result.candidates.places.find((p) => p.name === "Mid Spot")?.must_see).toBeUndefined();
    expect(result.candidates.places.filter((p) => p.must_see).length).toBe(2);
  });

  it("should_skip_heat_mark_when_pool_empty", async () => {
    searchPlacesMock.mockResolvedValue({ data: [] });

    const result = await discoverPlaces({
      city: "Sample City",
      bounds: { start: "2026-09-01", end: "2026-09-04" },
      locale: "EN",
      numDays: 4,
    });

    expect(result.inferred_must_see).toEqual([]);
  });
});

describe("TC-M12-49-06 discoverPlaces user must_include supplement", () => {
  it("should_add_user_requested_without_overwriting_iconic_marks", async () => {
    searchPlacesMock.mockImplementation(async (input: { query: string }) =>
      input.query === "User Pick"
        ? { data: [card("User Pick Spot", { user_ratings_total: 50 })] }
        : { data: [card("Hot Alpha", { user_ratings_total: 45_000 })] },
    );

    const result = await discoverPlaces({
      city: "Sample City",
      bounds: { start: "2026-09-01", end: "2026-09-04" },
      locale: "EN",
      numDays: 4,
      must_include: ["User Pick"],
    });

    expect(result.candidates.places.find((p) => p.name === "Hot Alpha")?.must_see).toBe(true);
    const userPick = result.candidates.places.find((p) => p.name === "User Pick Spot");
    expect(userPick?.user_requested).toBe(true);
    expect(userPick?.must_see).toBeUndefined();
  });
});
