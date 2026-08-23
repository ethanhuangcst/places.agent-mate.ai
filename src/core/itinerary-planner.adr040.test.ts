import { describe, it, expect, vi } from "vitest";
import {
  CANDIDATE_CAP,
  buildUserMessage,
  llmPlanItinerary,
  toDiscoverPlacesInput,
} from "./itinerary-planner";
import { type PlaceCard } from "./types";

function card(name: string): PlaceCard {
  return {
    provider: "GOOGLE_MAPS",
    name,
    location: { lat: 31.2, lng: 121.5, crs: "WGS84" },
    category: "attraction",
    sources: [],
  };
}

describe("ADR-040 plan_itinerary shell", () => {
  it("should_map_llm_plan_input_to_discoverPlaces_shape", () => {
    const mapped = toDiscoverPlacesInput({
      city: "Lisbon",
      numDays: 3,
      bounds: { start: "2026-09-01", end: "2026-09-03" },
      origin: { name: "Baixa" },
      locale: "EN",
      providers: ["GOOGLE_MAPS"],
    });
    expect(mapped).toEqual({
      city: "Lisbon",
      bounds: { start: "2026-09-01", end: "2026-09-03" },
      origin: { name: "Baixa" },
      locale: "EN",
      numDays: 3,
      providers: ["GOOGLE_MAPS"],
    });
  });

  it("should_use_candidate_cap_of_16", () => {
    expect(CANDIDATE_CAP).toBe(16);
  });

  it("should_include_party_size_in_user_message_when_set", () => {
    const msg = buildUserMessage({
      city: "Lisbon",
      numDays: 1,
      dayIndex: 1,
      locale: "EN",
      party_size: 4,
      candidates: { places: [card("Castelo")], restaurants: [] },
    });
    expect(msg).toContain("party_size: 4");
  });

  it("should_hint_large_group_pacing_when_party_size_ge_6", () => {
    const msg = buildUserMessage({
      city: "Lisbon",
      numDays: 1,
      dayIndex: 1,
      locale: "EN",
      party_size: 8,
      candidates: { places: [card("Castelo")], restaurants: [] },
    });
    expect(msg).toContain("party_size≥6");
  });

  it("should_call_arrangeDay_once_per_day_with_exclude_names", async () => {
    const arrangeCalls: Array<{ dayIndex: number; exclude?: string[] }> = [];
    const result = await llmPlanItinerary({
      city: "Lisbon",
      numDays: 2,
      bounds: { start: "2026-09-01", end: "2026-09-02" },
      locale: "EN",
      _testCandidates: {
        places: [card("A"), card("B"), card("C")],
        restaurants: [card("R1")],
      },
      _testArrangeDay: async (input) => {
        arrangeCalls.push({
          dayIndex: input.dayIndex,
          exclude: input.exclude_names
            ? [...input.exclude_names]
            : undefined,
        });
        const name = input.dayIndex === 1 ? "A" : "B";
        return {
          day_index: input.dayIndex,
          date: input.date,
          blocks: [
            {
              name,
              type: "attraction",
              start_time: "10:00",
              duration_min: 90,
              reason: "test",
            },
          ],
        };
      },
    });

    expect(arrangeCalls).toHaveLength(2);
    expect(arrangeCalls[0]).toEqual({ dayIndex: 1, exclude: undefined });
    expect(arrangeCalls[1]).toEqual({ dayIndex: 2, exclude: ["A"] });
    expect(result.days).toHaveLength(2);
    expect(result.days[0].blocks[0].name).toBe("A");
    expect(result.days[1].blocks[0].name).toBe("B");
  });

  it("should_force_execution_agent_on_shell_arrange_calls", async () => {
    const spy = vi.fn(async (input: { execution?: string }) => {
      expect(input.execution).toBe("agent");
      return {
        day_index: 1,
        blocks: [
          {
            name: "A",
            type: "attraction",
            start_time: "10:00",
            duration_min: 60,
            reason: "ok",
          },
        ],
      };
    });
    await llmPlanItinerary({
      city: "Lisbon",
      numDays: 1,
      bounds: { start: "2026-09-01", end: "2026-09-01" },
      locale: "EN",
      _testCandidates: { places: [card("A")], restaurants: [] },
      _testArrangeDay: spy,
    });
    expect(spy).toHaveBeenCalledOnce();
  });
});
