import { describe, expect, it } from "vitest";
import { inferMustSeeFromPool } from "./discover-must-see-llm";
import type { PlaceCard } from "./types";

function card(name: string): PlaceCard {
  return {
    provider: "GOOGLE_MAPS",
    name,
    location: { lat: 0, lng: 0, crs: "WGS84" },
    sources: [],
  };
}

describe("inferMustSeeFromPool (ADR-042 Update)", () => {
  it("should_return_pool_validated_names_from_llm", async () => {
    const places = [
      card("Belém Tower"),
      card("Jerónimos Monastery"),
      card("Pena Palace"),
      card("Cascais Marina"),
    ];
    const out = await inferMustSeeFromPool({
      places,
      _testChatCreate: async () => ({
        choices: [
          {
            message: {
              content: '["Pena Palace", "Belém Tower", "Jerónimos Monastery"]',
            },
          },
        ],
      }),
    });
    expect(out).toEqual(["Pena Palace", "Belém Tower", "Jerónimos Monastery"]);
  });

  it("should_cap_at_three", async () => {
    const places = [card("A"), card("B"), card("C"), card("D")];
    const out = await inferMustSeeFromPool({
      places,
      _testChatCreate: async () => ({
        choices: [{ message: { content: '["A","B","C","D"]' } }],
      }),
    });
    expect(out.length).toBe(3);
  });

  it("should_drop_hallucinated_names_not_in_pool", async () => {
    const places = [card("Pena Palace"), card("Belém Tower")];
    const out = await inferMustSeeFromPool({
      places,
      _testChatCreate: async () => ({
        choices: [
          {
            message: {
              content: '["Pena Palace", "Eiffel Tower", "Big Ben"]',
            },
          },
        ],
      }),
    });
    expect(out).toEqual(["Pena Palace"]);
  });

  it("should_dedupe_normalized_names", async () => {
    const places = [card("Pena Palace"), card("Belém Tower")];
    const out = await inferMustSeeFromPool({
      places,
      _testChatCreate: async () => ({
        choices: [
          {
            message: {
              content: '["Pena Palace", "pena palace", "  Pena Palace  "]',
            },
          },
        ],
      }),
    });
    expect(out).toEqual(["Pena Palace"]);
  });

  it("should_return_empty_when_llm_returns_empty", async () => {
    const places = [card("A")];
    const out = await inferMustSeeFromPool({
      places,
      _testChatCreate: async () => ({ choices: [{ message: { content: "[]" } }] }),
    });
    expect(out).toEqual([]);
  });

  it("should_return_empty_on_unparseable_json", async () => {
    const places = [card("A")];
    const out = await inferMustSeeFromPool({
      places,
      _testChatCreate: async () => ({
        choices: [{ message: { content: "not json at all" } }],
      }),
    });
    expect(out).toEqual([]);
  });

  it("should_return_empty_on_llm_throw", async () => {
    const places = [card("A")];
    const out = await inferMustSeeFromPool({
      places,
      _testChatCreate: async () => {
        throw new Error("boom");
      },
    });
    expect(out).toEqual([]);
  });

  it("should_return_empty_when_pool_empty", async () => {
    const out = await inferMustSeeFromPool({
      places: [],
      _testChatCreate: async () => ({
        choices: [{ message: { content: '["X"]' } }],
      }),
    });
    expect(out).toEqual([]);
  });

  it("should_handle_markdown_fenced_json", async () => {
    const places = [card("Pena Palace"), card("Belém Tower")];
    const out = await inferMustSeeFromPool({
      places,
      _testChatCreate: async () => ({
        choices: [
          {
            message: {
              content: "```json\n[\"Pena Palace\", \"Belém Tower\"]\n```",
            },
          },
        ],
      }),
    });
    expect(out).toEqual(["Pena Palace", "Belém Tower"]);
  });
});
