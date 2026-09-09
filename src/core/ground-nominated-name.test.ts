import { describe, expect, it } from "vitest";
import {
  groundNominatedName,
  nominateMustSeeViaLlm,
  stripLandmarkSuffix,
} from "./itinerary-planner";
import { type PlaceCard } from "./types";
import { type ToolResult } from "./types";

function card(
  name: string,
  overrides: Partial<PlaceCard> = {},
): PlaceCard {
  return {
    provider: "AMAP",
    name,
    category: "风景名胜;国家级景点",
    location: { lat: 30.24, lng: 120.15, crs: "GCJ-02" },
    sources: [{ provider: "AMAP", native_id: name, deeplinks: {} }],
    ...overrides,
  };
}

function ok(data: PlaceCard[]): ToolResult<PlaceCard[]> {
  return { data, skipped: [], locale: "CN", locales: ["CN", "EN"] };
}

/** Lisbon city center approx. */
const LISBON = { lat: 38.7223, lng: -9.1393 };
/** Sintra ~25km NW of Lisbon. */
const SINTRA = { lat: 38.7974, lng: -9.3904 };

describe("stripLandmarkSuffix", () => {
  it("should_strip_castle_and_keep_core", () => {
    expect(stripLandmarkSuffix("Sintra Castle")).toBe("Sintra");
    expect(stripLandmarkSuffix("Cabo da Roca")).toBeUndefined();
  });
});

describe("groundNominatedName", () => {
  it("should_prefer_suggest_temple_over_search_hotel_wall", async () => {
    const tip = card("灵隐寺");
    const hotels = [
      card("灵隐寺耿直哥度假别墅", { category: "住宿服务;宾馆酒店" }),
      card("灵隐若隐民宿", { category: "住宿服务;住宿服务相关" }),
    ];
    const grounded = await groundNominatedName({
      name: "灵隐寺",
      city: "杭州",
      locale: "CN",
      _testSuggestPlaces: async () => ok([tip]),
      _testSearchPlaces: async () => ok(hotels),
    });
    expect(grounded?.name).toBe("灵隐寺");
    expect(grounded?.nominated_name).toBe("灵隐寺");
  });

  it("should_skip_vague_lake_street_or_new_town_token", async () => {
    const grounded = await groundNominatedName({
      name: "西湖",
      city: "杭州",
      locale: "CN",
      _testSuggestPlaces: async () =>
        ok([card("杭州西湖风景名胜区")]),
      _testSearchPlaces: async () => ok([card("杭州西湖风景名胜区")]),
    });
    expect(grounded).toBeUndefined();
  });

  it("should_fall_back_to_search_same_name_without_scenic_suffix", async () => {
    const queries: string[] = [];
    const grounded = await groundNominatedName({
      name: "雷峰塔",
      city: "杭州",
      locale: "CN",
      _testSuggestPlaces: async () => ok([]),
      _testSearchPlaces: async (input) => {
        queries.push(input.query ?? "");
        return ok([card("雷峰塔景区")]);
      },
    });
    expect(queries).toEqual(["雷峰塔"]);
    expect(grounded?.name).toBe("雷峰塔景区");
    expect(grounded?.nominated_name).toBe("雷峰塔");
  });

  it("should_not_bind_wrong_place_via_attraction_suffix_for_foreign_alias", async () => {
    const queries: string[] = [];
    const grounded = await groundNominatedName({
      name: "Alcázar of São Jorge",
      city: "Lisbon",
      locale: "EN",
      providers: ["GOOGLE_MAPS"],
      _testSuggestPlaces: async () => ok([]),
      _testSearchPlaces: async (input) => {
        queries.push(input.query ?? "");
        // No overlap with query → pick returns undefined
        return ok([card("Belém Tower", { provider: "GOOGLE_MAPS" })]);
      },
    });
    expect(queries).toEqual(["Alcázar of São Jorge"]);
    expect(queries.some((q) => /attraction/i.test(q))).toBe(false);
    expect(grounded).toBeUndefined();
  });

  it("should_hydrate_tip_without_coords_via_search_of_tip_full_name", async () => {
    const tip = card("断桥残雪", {
      location: { lat: Number.NaN, lng: Number.NaN, crs: "GCJ-02" },
    });
    const grounded = await groundNominatedName({
      name: "断桥",
      city: "杭州",
      locale: "CN",
      _testSuggestPlaces: async () => ok([tip]),
      _testSearchPlaces: async (input) => {
        expect(input.query).toBe("断桥残雪");
        return ok([card("断桥残雪")]);
      },
    });
    expect(grounded?.name).toBe("断桥残雪");
    expect(grounded?.nominated_name).toBe("断桥");
  });

  it("should_broad_fallback_sintra_castle_to_palace_beyond_15km", async () => {
    const queries: string[] = [];
    const grounded = await groundNominatedName({
      name: "Sintra Castle",
      city: "Lisbon",
      locale: "EN",
      near: LISBON,
      providers: ["GOOGLE_MAPS"],
      _testSuggestPlaces: async () => ok([]),
      _testSearchPlaces: async (input) => {
        queries.push(input.query ?? "");
        if (input.query === "Sintra Castle") return ok([]);
        return ok([
          card("National Palace of Sintra", {
            provider: "GOOGLE_MAPS",
            location: { lat: SINTRA.lat, lng: SINTRA.lng, crs: "WGS84" },
            sources: [
              {
                provider: "GOOGLE_MAPS",
                native_id: "sintra-palace",
                deeplinks: {},
              },
            ],
          }),
        ]);
      },
    });
    expect(queries).toEqual(["Sintra Castle", "Sintra"]);
    expect(grounded?.name).toBe("National Palace of Sintra");
    expect(grounded?.nominated_name).toBe("Sintra Castle");
  });

  it("should_drop_cabo_da_roca_when_no_suffix_and_empty_search", async () => {
    const queries: string[] = [];
    const grounded = await groundNominatedName({
      name: "Cabo da Roca",
      city: "Lisbon",
      locale: "EN",
      near: LISBON,
      providers: ["GOOGLE_MAPS"],
      _testSuggestPlaces: async () => ok([]),
      _testSearchPlaces: async (input) => {
        queries.push(input.query ?? "");
        return ok([]);
      },
    });
    expect(queries).toEqual(["Cabo da Roca"]);
    expect(grounded).toBeUndefined();
  });
});

describe("nominateMustSeeViaLlm native_id dedup", () => {
  it("should_keep_first_card_when_same_native_id_different_names", async () => {
    const cards = await nominateMustSeeViaLlm({
      city: "Lisbon",
      locale: "EN",
      numDays: 4,
      limit: 8,
      existingPool: [],
      near: LISBON,
      _testChatCreate: async () =>
        ({
          choices: [
            {
              message: {
                content: JSON.stringify([
                  "Belém Tower",
                  "Torre de Belém",
                ]),
              },
            },
          ],
        }) as never,
      _testSuggestPlaces: async () => ok([]),
      _testSearchPlaces: async (input) => {
        const q = input.query ?? "";
        if (q === "Belém Tower") {
          return ok([
            card("Belém Tower", {
              provider: "GOOGLE_MAPS",
              location: { lat: 38.6916, lng: -9.216, crs: "WGS84" },
              sources: [
                {
                  provider: "GOOGLE_MAPS",
                  native_id: "belem-shared",
                  deeplinks: {},
                },
              ],
            }),
          ]);
        }
        return ok([
          card("Torre de Belém", {
            provider: "GOOGLE_MAPS",
            location: { lat: 38.6916, lng: -9.216, crs: "WGS84" },
            sources: [
              {
                provider: "GOOGLE_MAPS",
                native_id: "belem-shared",
                deeplinks: {},
              },
            ],
          }),
        ]);
      },
    });
    expect(cards).toHaveLength(1);
    expect(cards[0]?.name).toBe("Belém Tower");
  });
});
