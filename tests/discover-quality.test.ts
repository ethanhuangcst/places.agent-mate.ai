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

function card(name: string, category: string, rating?: number): PlaceCard {
  return {
    provider: "AMAP",
    name,
    category,
    rating,
    location: { lat: 34.26, lng: 108.94, crs: "GCJ-02" },
    sources: [{ provider: "AMAP", native_id: name, deeplinks: {} }],
  };
}

describe("discoverPlaces quality (ADR-038)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should_prefer_must_see_diversity_and_drop_fragments_without_openai", async () => {
    vi.mocked(tools.searchPlaces).mockResolvedValue({
      ok: true,
      outcomeKey: "ok",
      data: [
        card("西安园林", "公司企业;公司;公司"),
        card("西安博物院", "科教文化服务;博物馆;博物馆", 4.8),
        card("秦始皇兵马俑博物馆", "风景名胜;风景名胜;旅游景点", 4.9),
        card("西安城墙", "风景名胜;风景名胜;旅游景点", 4.7),
        card("西安城墙-敌楼", "风景名胜;风景名胜相关;旅游景点", 3.3),
        card("西安城墙安远门", "风景名胜;风景名胜;国家级景点", 4.6),
        card("大雁塔", "风景名胜;风景名胜;旅游景点", 4.8),
        card("大雁塔南广场", "风景名胜;风景名胜相关;旅游景点", 4.6),
        card("兵马俑华山直通车大雁塔发车点", "风景名胜;风景名胜相关;旅游景点", 3.4),
        card("兵马俑(公交站)", "公交站"),
      ],
    } as never);

    vi.mocked(tools.searchRestaurants).mockResolvedValue({
      ok: true,
      outcomeKey: "ok",
      data: [
        card("老马家肉夹馍(回民街店)", "restaurant", 4.5),
        card("必胜客(文景店)", "restaurant", 4.6),
      ],
    } as never);

    const result = await discoverPlaces({
      city: "西安",
      bounds: { start: "2026-08-22", end: "2026-08-24" },
      locale: "CN",
      numDays: 3,
      providers: ["AMAP"],
    });

    const names = result.candidates.places.map((p) => p.name);
    expect(names.some((n) => /兵马俑|秦始皇/.test(n))).toBe(true);
    expect(names.some((n) => /大雁塔/.test(n))).toBe(true);
    expect(names.some((n) => /城墙/.test(n))).toBe(true);
    expect(names.filter((n) => /城墙/.test(n)).length).toBeLessThanOrEqual(2);
    expect(names).not.toContain("西安园林");
    expect(names.some((n) => /直通车|公交站|敌楼/.test(n))).toBe(false);
    expect(chatCreate).not.toHaveBeenCalled();
    expect(tools.searchPlaces).toHaveBeenCalled();
  });
});
