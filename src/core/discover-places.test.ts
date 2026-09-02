/**
 * TC-M12-49-04 / -06 — discoverPlaces parallel + backfill (ADR-045 §3).
 *
 * Isolates discoverPlaces by mocking findIconicPlaces, the query assembler
 * (so searchCandidatePools produces a controlled/empty pool), and tools.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { findIconicPlacesMock, searchPlacesMock, searchRestaurantsMock } = vi.hoisted(() => ({
  findIconicPlacesMock: vi.fn(),
  searchPlacesMock: vi.fn(),
  searchRestaurantsMock: vi.fn(),
}));

vi.mock("./find-iconic-places", () => ({
  findIconicPlaces: findIconicPlacesMock,
}));
vi.mock("./query-assembler", () => ({
  assembleDiscoverAttractionJobs: () => [],
  assembleDiscoverRestaurantJobs: () => [],
  assembleAttractionSearchJobs: () => [],
  assembleRestaurantSearchJobs: () => [],
}));
vi.mock("./tools", () => ({
  searchPlaces: searchPlacesMock,
  searchRestaurants: searchRestaurantsMock,
  geocode: vi.fn(),
}));

import { discoverPlaces } from "./itinerary-planner";
import { clearIconicCache } from "./iconic-places-cache";
import type { PlaceCard } from "./types";

function card(name: string, category = "tourist_attraction"): PlaceCard {
  return {
    provider: "GOOGLE_MAPS",
    name,
    category,
    location: { lat: 0, lng: 0, crs: "WGS84" },
    sources: [],
  };
}

beforeEach(() => {
  findIconicPlacesMock.mockReset();
  searchPlacesMock.mockReset();
  searchRestaurantsMock.mockReset();
  clearIconicCache();
});

describe("TC-M12-49-04 discoverPlaces parallel (ADR-045 §3)", () => {
  it("should_invoke_findIconicPlaces_and_reflect_iconic_in_inferred_must_see", async () => {
    findIconicPlacesMock.mockResolvedValue({
      names: ["Pena Palace"],
      grounded: false,
    });
    searchPlacesMock.mockResolvedValue({ data: [card("Pena Palace", "palace")] });

    const result = await discoverPlaces({
      city: "Lisbon",
      bounds: { start: "2026-09-01", end: "2026-09-04" },
      locale: "EN",
      numDays: 4,
    });

    expect(findIconicPlacesMock).toHaveBeenCalledTimes(1);
    expect(findIconicPlacesMock).toHaveBeenCalledWith(
      expect.objectContaining({ city: "Lisbon", limit: 3 }),
    );
    // Iconic name grounded via backfill and flagged must_see.
    const pena = result.candidates.places.find((p) => p.name === "Pena Palace");
    expect(pena?.must_see).toBe(true);
    expect(result.inferred_must_see).toEqual(["Pena Palace"]);
  });
});

describe("TC-M12-49-06 discoverPlaces backfill drop (ADR-045 §3)", () => {
  it("should_drop_iconic_names_not_found_by_backfill", async () => {
    findIconicPlacesMock.mockResolvedValue({
      names: ["Pena Palace", "Ghost Castle"],
      grounded: false,
    });
    searchPlacesMock.mockImplementation(async (input: { query: string }) =>
      input.query === "Pena Palace"
        ? { data: [card("Pena Palace", "palace")] }
        : { data: [] },
    );

    const result = await discoverPlaces({
      city: "Lisbon",
      bounds: { start: "2026-09-01", end: "2026-09-04" },
      locale: "EN",
      numDays: 4,
    });

    const names = result.candidates.places.map((p) => p.name);
    expect(names).toContain("Pena Palace");
    expect(names).not.toContain("Ghost Castle");
    // Ghost Castle dropped from inferred_must_see (cannot be scheduled).
    expect(result.inferred_must_see).toEqual(["Pena Palace"]);
  });

  it("should_return_empty_inferred_when_no_iconic_found", async () => {
    findIconicPlacesMock.mockResolvedValue({ names: ["Nowhere"], grounded: false });
    searchPlacesMock.mockResolvedValue({ data: [] });

    const result = await discoverPlaces({
      city: "Lisbon",
      bounds: { start: "2026-09-01", end: "2026-09-04" },
      locale: "EN",
      numDays: 4,
    });

    expect(result.candidates.places).toEqual([]);
    expect(result.inferred_must_see).toEqual([]);
  });
});
