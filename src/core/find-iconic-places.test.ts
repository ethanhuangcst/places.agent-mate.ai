import { describe, expect, it } from "vitest";
import { findIconicPlaces, iconicLimitForTripDays } from "./find-iconic-places";
import type { PlaceCard } from "./types";

function card(name: string, opts?: { user_ratings_total?: number; rating?: number }): PlaceCard {
  return {
    provider: "GOOGLE_MAPS",
    name,
    category: "tourist_attraction",
    location: { lat: 0, lng: 0, crs: "WGS84" },
    sources: [],
    user_ratings_total: opts?.user_ratings_total,
    rating: opts?.rating,
  };
}

const chat = (content: string) => async () => ({
  choices: [{ message: { content } }],
});

describe("findIconicPlaces — grounded heat-on-pool (ADR-045)", () => {
  it("should_mark_top_heat_from_existing_pool_without_llm", async () => {
    const places = [
      card("Low Signal", { user_ratings_total: 200 }),
      card("Hot Alpha", { user_ratings_total: 45_000 }),
      card("Hot Beta", { user_ratings_total: 12_000 }),
      card("Mid Spot", { user_ratings_total: 3_000 }),
    ];
    const out = await findIconicPlaces({
      city: "Lisbon",
      locale: "EN",
      pool: places,
      limit: 2,
      _testChatCreate: chat('["Low Signal"]'),
    });
    expect(out.grounded).toBe(true);
    expect(out.names).toEqual(["Hot Alpha", "Hot Beta"]);
    expect(places.find((p) => p.name === "Hot Alpha")?.must_see).toBe(true);
    expect(places.find((p) => p.name === "Hot Beta")?.must_see).toBe(true);
    expect(places.find((p) => p.name === "Low Signal")?.must_see).toBeUndefined();
  });

  it("should_cap_at_limit", async () => {
    const places = [
      card("A", { user_ratings_total: 4 }),
      card("B", { user_ratings_total: 3 }),
      card("C", { user_ratings_total: 2 }),
      card("D", { user_ratings_total: 1 }),
    ];
    const out = await findIconicPlaces({
      city: "X",
      locale: "EN",
      pool: places,
      limit: 2,
    });
    expect(out.names.length).toBe(2);
    expect(out.grounded).toBe(true);
  });

  it("should_use_rating_when_user_ratings_total_missing", async () => {
    const places = [card("Rated", { rating: 4.8 }), card("Unrated")];
    const out = await findIconicPlaces({
      city: "X",
      locale: "EN",
      pool: places,
      limit: 1,
    });
    expect(out.names).toEqual(["Rated"]);
  });

  it("should_return_empty_when_pool_empty_in_grounded_mode", async () => {
    const out = await findIconicPlaces({
      city: "Lisbon",
      locale: "EN",
      pool: [],
      limit: 3,
      _testChatCreate: chat('["X"]'),
    });
    expect(out.grounded).toBe(false);
  });

  it("should_return_empty_when_limit_zero", async () => {
    const out = await findIconicPlaces({
      city: "X",
      locale: "EN",
      pool: [card("A", { user_ratings_total: 9 })],
      limit: 0,
    });
    expect(out.names).toEqual([]);
  });
});

describe("findIconicPlaces — ungrounded (ADR-045 §1)", () => {
  it("should_return_llm_names_and_grounded_false", async () => {
    const out = await findIconicPlaces({
      city: "Lisbon",
      locale: "EN",
      limit: 3,
      _testChatCreate: chat('["Belém Tower", "Jerónimos Monastery", "Pena Palace"]'),
    });
    expect(out.grounded).toBe(false);
    expect(out.names).toEqual(["Belém Tower", "Jerónimos Monastery", "Pena Palace"]);
  });

  it("should_cap_at_limit_ungrounded", async () => {
    const out = await findIconicPlaces({
      city: "Lisbon",
      locale: "EN",
      limit: 2,
      _testChatCreate: chat('["A","B","C"]'),
    });
    expect(out.names.length).toBe(2);
  });

  it("should_dedupe_ungrounded", async () => {
    const out = await findIconicPlaces({
      city: "Lisbon",
      locale: "EN",
      limit: 5,
      _testChatCreate: chat('["Pena Palace", "pena palace", "PENA PALACE"]'),
    });
    expect(out.names).toEqual(["Pena Palace"]);
  });

  it("should_include_day_trip_instruction_when_numDays_gte_3", async () => {
    let userMessage = "";
    const out = await findIconicPlaces({
      city: "Porto",
      locale: "EN",
      limit: 6,
      numDays: 4,
      _testChatCreate: async (params) => {
        const content = params.messages?.[0]?.content;
        userMessage = typeof content === "string" ? content : "";
        return { choices: [{ message: { content: '["Riverfront", "Nearby day-trip area"]' } }] };
      },
    });
    expect(userMessage).toMatch(/day-trip/i);
    expect(userMessage).toMatch(/4 days/);
    expect(out.names.some((n) => /area|riverfront/i.test(n))).toBe(true);
  });

  it("should_omit_day_trip_instruction_when_numDays_is_1", async () => {
    let userMessage = "";
    await findIconicPlaces({
      city: "Porto",
      locale: "EN",
      limit: 3,
      numDays: 1,
      _testChatCreate: async (params) => {
        const content = params.messages?.[0]?.content;
        userMessage = typeof content === "string" ? content : "";
        return { choices: [{ message: { content: '["Old town"]' } }] };
      },
    });
    expect(userMessage).not.toMatch(/day-trip/i);
  });
});

describe("findIconicPlaces — ungrounded robustness", () => {
  it("should_return_empty_on_unparseable_json", async () => {
    const out = await findIconicPlaces({
      city: "X",
      locale: "EN",
      limit: 3,
      _testChatCreate: chat("not json at all"),
    });
    expect(out.names).toEqual([]);
    expect(out.grounded).toBe(false);
  });

  it("should_return_empty_on_llm_throw", async () => {
    const out = await findIconicPlaces({
      city: "X",
      locale: "EN",
      limit: 3,
      _testChatCreate: async () => {
        throw new Error("boom");
      },
    });
    expect(out.names).toEqual([]);
  });

  it("should_handle_markdown_fenced_json", async () => {
    const out = await findIconicPlaces({
      city: "Lisbon",
      locale: "EN",
      limit: 3,
      _testChatCreate: chat("```json\n[\"Pena Palace\", \"Belém Tower\"]\n```"),
    });
    expect(out.names).toEqual(["Pena Palace", "Belém Tower"]);
  });
});

describe("iconicLimitForTripDays", () => {
  it("should_scale_with_trip_length", () => {
    expect(iconicLimitForTripDays(1)).toBe(3);
    expect(iconicLimitForTripDays(4)).toBe(6);
    expect(iconicLimitForTripDays(14)).toBe(12);
  });
});

describe("TC-M18-74 ranking is pool heat only", () => {
  function rated(name: string, user_ratings_total: number, lat: number, lng: number): PlaceCard {
    return {
      provider: "GOOGLE_MAPS",
      name,
      category: "tourist_attraction",
      location: { lat, lng, crs: "WGS84" },
      sources: [],
      user_ratings_total,
    };
  }

  it("TC-M18-74-01 should_prefer_higher_user_ratings_total", async () => {
    const pool = [
      rated("Cold Spot", 10, 0, 0),
      rated("Hot Spot", 9000, 0.01, 0.01),
      rated("Warm Spot", 100, 0.02, 0.02),
    ];
    const out = await findIconicPlaces({
      city: "X",
      locale: "EN",
      pool,
      limit: 2,
    });
    expect(out.names[0]).toBe("Hot Spot");
    expect(out.names).toEqual(["Hot Spot", "Warm Spot"]);
  });

  it("TC-M18-74-02 should_not_inject_low_heat_outer_poi", async () => {
    const pool = [
      rated("Inner A", 50, 0, 0),
      rated("Inner B", 40, 0.01, 0.01),
      rated("Outer Peak", 5, 0.5, 0.5),
    ];
    const out = await findIconicPlaces({
      city: "X",
      locale: "EN",
      pool,
      limit: 2,
      numDays: 4,
    });
    expect(out.names).toEqual(["Inner A", "Inner B"]);
    expect(out.names).not.toContain("Outer Peak");
  });
});
