import { describe, expect, it } from "vitest";
import { findIconicPlaces } from "./find-iconic-places";
import type { PlaceCard } from "./types";

function card(name: string): PlaceCard {
  return {
    provider: "GOOGLE_MAPS",
    name,
    location: { lat: 0, lng: 0, crs: "WGS84" },
    sources: [],
  };
}

const chat = (content: string) => async () => ({
  choices: [{ message: { content } }],
});

describe("findIconicPlaces — grounded (ADR-045 §1)", () => {
  it("should_return_pool_validated_names_and_grounded_true", async () => {
    const places = [card("Belém Tower"), card("Jerónimos Monastery"), card("Pena Palace"), card("Cascais Marina")];
    const out = await findIconicPlaces({
      city: "Lisbon",
      locale: "EN",
      pool: places,
      limit: 3,
      _testChatCreate: chat('["Pena Palace", "Belém Tower", "Jerónimos Monastery"]'),
    });
    expect(out.grounded).toBe(true);
    expect(out.names).toEqual(["Pena Palace", "Belém Tower", "Jerónimos Monastery"]);
  });

  it("should_cap_at_limit", async () => {
    const places = [card("A"), card("B"), card("C"), card("D")];
    const out = await findIconicPlaces({
      city: "X",
      locale: "EN",
      pool: places,
      limit: 2,
      _testChatCreate: chat('["A","B","C","D"]'),
    });
    expect(out.names.length).toBe(2);
    expect(out.grounded).toBe(true);
  });

  it("should_drop_hallucinated_names_not_in_pool", async () => {
    const places = [card("Pena Palace"), card("Belém Tower")];
    const out = await findIconicPlaces({
      city: "Lisbon",
      locale: "EN",
      pool: places,
      limit: 3,
      _testChatCreate: chat('["Pena Palace", "Eiffel Tower", "Big Ben"]'),
    });
    expect(out.names).toEqual(["Pena Palace"]);
  });

  it("should_dedupe_normalized_names", async () => {
    const places = [card("Pena Palace"), card("Belém Tower")];
    const out = await findIconicPlaces({
      city: "Lisbon",
      locale: "EN",
      pool: places,
      limit: 3,
      _testChatCreate: chat('["Pena Palace", "pena palace", "  Pena Palace  "]'),
    });
    expect(out.names).toEqual(["Pena Palace"]);
  });

  it("should_return_empty_when_pool_empty_in_grounded_mode", async () => {
    const out = await findIconicPlaces({
      city: "Lisbon",
      locale: "EN",
      pool: [],
      limit: 3,
      _testChatCreate: chat('["X"]'),
    });
    // empty pool → ungrounded mode, not grounded
    expect(out.grounded).toBe(false);
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
});

describe("findIconicPlaces — robustness", () => {
  it("should_return_empty_on_unparseable_json", async () => {
    const out = await findIconicPlaces({
      city: "X",
      locale: "EN",
      pool: [card("A")],
      limit: 3,
      _testChatCreate: chat("not json at all"),
    });
    expect(out.names).toEqual([]);
  });

  it("should_return_empty_on_llm_throw", async () => {
    const out = await findIconicPlaces({
      city: "X",
      locale: "EN",
      pool: [card("A")],
      limit: 3,
      _testChatCreate: async () => {
        throw new Error("boom");
      },
    });
    expect(out.names).toEqual([]);
  });

  it("should_handle_markdown_fenced_json", async () => {
    const places = [card("Pena Palace"), card("Belém Tower")];
    const out = await findIconicPlaces({
      city: "Lisbon",
      locale: "EN",
      pool: places,
      limit: 3,
      _testChatCreate: chat("```json\n[\"Pena Palace\", \"Belém Tower\"]\n```"),
    });
    expect(out.names).toEqual(["Pena Palace", "Belém Tower"]);
  });

  it("should_return_empty_when_limit_zero", async () => {
    const out = await findIconicPlaces({
      city: "X",
      locale: "EN",
      pool: [card("A")],
      limit: 0,
      _testChatCreate: chat('["A"]'),
    });
    expect(out.names).toEqual([]);
  });
});
