/**
 * ADR-069: discoverPlaces builds the pool via search + nominate merge —
 * no heat must_see marking, no inferred_must_see, no iconic-places-cache.
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
});

describe("ADR-069 discoverPlaces pool without must_see heat", () => {
  it("should_return_search_pool_without_must_see_or_inferred_must_see", async () => {
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
    expect(result).not.toHaveProperty("inferred_must_see");
    expect(result.candidates.places.map((p) => p.name)).toEqual(
      expect.arrayContaining(["Hot Alpha", "Hot Beta", "Mid Spot", "Low Signal"]),
    );
    for (const p of result.candidates.places) {
      expect((p as { must_see?: boolean }).must_see).toBeUndefined();
    }
  });

  it("should_return_empty_places_when_pool_empty", async () => {
    searchPlacesMock.mockResolvedValue({ data: [] });

    const result = await discoverPlaces({
      city: "Sample City",
      bounds: { start: "2026-09-01", end: "2026-09-04" },
      locale: "EN",
      numDays: 4,
    });

    expect(result).not.toHaveProperty("inferred_must_see");
    expect(result.candidates.places).toEqual([]);
  });
});

describe("TC-M12-49-06 discoverPlaces user must_include supplement", () => {
  it("should_add_user_requested_without_must_see_marks", async () => {
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

    const userPick = result.candidates.places.find((p) => p.name === "User Pick Spot");
    expect(userPick?.user_requested).toBe(true);
    expect((userPick as { must_see?: boolean } | undefined)?.must_see).toBeUndefined();
    for (const p of result.candidates.places) {
      expect((p as { must_see?: boolean }).must_see).toBeUndefined();
    }
  });
});
