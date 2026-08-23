/**
 * TC-M8-U34-01 — Discover Arm A (Feature 34 / performance Q2)
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { discoverPlaces } from "../src/core/itinerary-planner";
import * as tools from "../src/core/tools";
import type { PlaceCard } from "../src/core/types";

const chatCreate = vi.fn();

vi.mock("../src/core/tools", async () => {
  const actual = await vi.importActual<typeof import("../src/core/tools")>("../src/core/tools");
  return {
    ...actual,
    searchPlaces: vi.fn(),
    searchRestaurants: vi.fn(),
  };
});

vi.mock("openai", () => ({
  default: class OpenAI {
    chat = { completions: { create: chatCreate } };
  },
}));

function card(
  name: string,
  category: string,
  opts?: {
    rating?: number;
    provider?: PlaceCard["provider"];
    address?: string;
    lat?: number;
    lng?: number;
  },
): PlaceCard {
  const provider = opts?.provider ?? "AMAP";
  return {
    provider,
    name,
    category,
    rating: opts?.rating,
    address: opts?.address,
    location: {
      lat: opts?.lat ?? 34.26,
      lng: opts?.lng ?? 108.94,
      crs: "GCJ-02",
    },
    sources: [{ provider, native_id: name, deeplinks: {} }],
  };
}

describe("TC-M8-U34-01 discover Arm A", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should_fill_pool_from_generic_templates_without_openai_after_adr042_update", async () => {
    // ADR-042 Update: no city-specific seeds. Generic templates (e.g. "西安 景点")
    // fill the pool; discover must not call OpenAI for the candidate search.
    vi.mocked(tools.searchPlaces).mockImplementation(async (input) => {
      const q = input.query ?? "";
      // Any generic Xi'an attraction query returns a real attraction card.
      if (/西安|xian/i.test(q)) {
        return {
          ok: true,
          outcomeKey: "ok",
          data: [
            card("陕西历史博物馆", "科教文化服务;博物馆;博物馆", { rating: 4.9 }),
            card("大雁塔", "风景名胜;风景名胜;旅游景点", { rating: 4.8 }),
          ],
        } as never;
      }
      return { ok: true, outcomeKey: "ok", data: [] } as never;
    });

    vi.mocked(tools.searchRestaurants).mockResolvedValue({
      ok: true,
      outcomeKey: "ok",
      data: [
        card("老马家肉夹馍(回民街店)", "restaurant", { rating: 4.5 }),
      ],
    } as never);

    const result = await discoverPlaces({
      city: "西安",
      bounds: { start: "2026-08-22", end: "2026-08-24" },
      locale: "CN",
      numDays: 3,
      providers: ["AMAP", "GOOGLE_MAPS"],
    });

    const placeQueries = vi.mocked(tools.searchPlaces).mock.calls.map((c) => c[0]?.query ?? "");
    // No city-encyclopedia seeds emitted (ADR-042 Update).
    expect(placeQueries.some((q) => /秦始皇帝陵博物院/.test(q))).toBe(false);
    // Generic queries still fire and fill the pool.
    expect(result.candidates.places.length).toBeGreaterThan(0);
    const names = result.candidates.places.map((p) => p.name);
    expect(names.some((n) => /博物院|大雁塔/.test(n))).toBe(true);
    // Candidate search must not call the LLM.
    expect(chatCreate).not.toHaveBeenCalled();
  });

  it("should_rank_local_dining_ahead_of_chain_noise", async () => {
    vi.mocked(tools.searchPlaces).mockResolvedValue({
      ok: true,
      outcomeKey: "ok",
      data: [card("大雁塔", "风景名胜;风景名胜;旅游景点", { rating: 4.8 })],
    } as never);

    vi.mocked(tools.searchRestaurants).mockResolvedValue({
      ok: true,
      outcomeKey: "ok",
      data: [
        card("必胜客(文景店)", "restaurant", {
          rating: 4.9,
          address: "西安经开区文景路1号",
        }),
        card("老孙家泡馍(回民街店)", "restaurant", {
          rating: 4.4,
          address: "西安回民街",
        }),
        card("德发长饺子", "restaurant", {
          rating: 4.3,
          address: "西安钟楼",
        }),
      ],
    } as never);

    const result = await discoverPlaces({
      city: "西安",
      bounds: { start: "2026-08-22", end: "2026-08-24" },
      locale: "CN",
      numDays: 1,
      providers: ["AMAP"],
    });

    const restNames = result.candidates.restaurants.map((r) => r.name);
    expect(restNames[0]).toMatch(/泡馍|德发长|肉夹|回民/);
    expect(restNames.indexOf("必胜客(文景店)")).toBeGreaterThan(0);
    expect(chatCreate).not.toHaveBeenCalled();
  });

  it("should_default_mainland_discover_to_dual_providers_when_omitted", async () => {
    vi.mocked(tools.searchPlaces).mockResolvedValue({
      ok: true,
      outcomeKey: "ok",
      data: [card("大雁塔", "风景名胜;风景名胜;旅游景点", { rating: 4.8 })],
    } as never);
    vi.mocked(tools.searchRestaurants).mockResolvedValue({
      ok: true,
      outcomeKey: "ok",
      data: [card("老马家肉夹馍", "restaurant", { rating: 4.5 })],
    } as never);

    await discoverPlaces({
      city: "西安",
      bounds: { start: "2026-08-22", end: "2026-08-24" },
      locale: "CN",
      numDays: 1,
      // providers omitted → Arm A mainland dual-source
    });

    const placeProviderSets = vi.mocked(tools.searchPlaces).mock.calls.map((c) => c[0]?.providers ?? []);
    const flat = placeProviderSets.flat();
    expect(flat).toContain("AMAP");
    expect(flat).toContain("GOOGLE_MAPS");
  });
});
