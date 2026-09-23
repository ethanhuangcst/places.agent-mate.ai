import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { discoverPlaces, arrangeDay } from "../src/core/itinerary-planner";
import * as tools from "../src/core/tools";

vi.mock("../src/core/tools", async () => {
  const actual = await vi.importActual<typeof import("../src/core/tools")>("../src/core/tools");
  return {
    ...actual,
    searchPlaces: vi.fn(),
    searchRestaurants: vi.fn(),
    geocode: vi.fn(),
  };
});

vi.mock("openai", () => ({
  default: class OpenAI {
    chat = { completions: { create: vi.fn() } };
  },
}));

describe("discoverPlaces progressive", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(tools.geocode).mockResolvedValue({
      ok: true,
      outcomeKey: "ok",
      data: { lat: 25.03, lng: 121.56, crs: "WGS84", address: "台北" },
      locale: "CN",
      skipped: [],
    } as never);
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should_emit_candidate_events_then_discover_done", async () => {
    vi.mocked(tools.searchPlaces).mockResolvedValue({
      ok: true,
      outcomeKey: "ok",
      data: [
        {
          name: "Place A",
          provider: "GOOGLE_MAPS",
          category: "museum",
          location: { lat: 25.03, lng: 121.56, crs: "WGS84" },
          sources: [{ provider: "GOOGLE_MAPS", native_id: "a", deeplinks: {} }],
        },
        {
          name: "Place B",
          provider: "GOOGLE_MAPS",
          category: "park",
          location: { lat: 25.04, lng: 121.55, crs: "WGS84" },
          sources: [{ provider: "GOOGLE_MAPS", native_id: "b", deeplinks: {} }],
        },
      ],
      locale: "CN",
      skipped: [],
    } as never);
    vi.mocked(tools.searchRestaurants).mockResolvedValue({
      ok: true,
      outcomeKey: "ok",
      data: [
        {
          name: "Rest A",
          provider: "GOOGLE_MAPS",
          category: "restaurant",
          location: { lat: 25.03, lng: 121.56, crs: "WGS84" },
          sources: [{ provider: "GOOGLE_MAPS", native_id: "r", deeplinks: {} }],
        },
      ],
      locale: "CN",
      skipped: [],
    } as never);

    const events: Array<{ type: string }> = [];
    const result = await discoverPlaces(
      {
        city: "台北",
        bounds: { start: "2026-08-22", end: "2026-08-24" },
        locale: "CN",
        numDays: 3,
      },
      { onEvent: (e) => events.push(e) },
    );

    expect(result.candidates.places).toHaveLength(2);
    expect(result.candidates.restaurants).toHaveLength(1);
    expect(events.map((e) => e.type)).toEqual([
      "candidate",
      "candidate",
      "candidate",
      "discover_done",
    ]);
  });
});

describe("arrangeDay exclude_names", () => {
  it("should_filter_excluded_before_llm_when_empty_pool_throws_or_skips", async () => {
    // With all names excluded, candidate set is empty; LLM not configured in unit → throws
    await expect(
      arrangeDay({
        candidates: {
          places: [{ name: "Only", provider: "GOOGLE_MAPS" } as never],
          restaurants: [],
        },
        dayIndex: 1,
        locale: "CN",
        exclude_names: ["Only"],
      }),
    ).rejects.toThrow();
  });
});
