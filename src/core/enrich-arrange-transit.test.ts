import { describe, expect, it, vi } from "vitest";
import { enrichArrangeDayWithTransit } from "./enrich-arrange-transit";
import { arrangeDay } from "./itinerary-planner";
import type { PlaceCard } from "./types";

function place(name: string, lat: number, lng: number): PlaceCard {
  return {
    provider: "AMAP",
    name,
    category: "风景名胜",
    rating: 4.5,
    location: { lat, lng, crs: "GCJ-02" },
    sources: [{ provider: "AMAP", native_id: name, deeplinks: {} }],
  };
}

describe("Feature 37 arrange real transit", () => {
  it("should_attach_directions_legs_when_resolve_succeeds", async () => {
    const places = [
      place("大雁塔", 34.22, 108.96),
      place("西安城墙", 34.26, 108.94),
    ];
    const resolveDuration = vi.fn(async () => ({ duration_min: 25, distance_m: 3000 }));
    const enriched = await enrichArrangeDayWithTransit({
      day: {
        day_index: 1,
        blocks: [
          {
            name: "大雁塔",
            type: "attraction",
            start_time: "10:00",
            duration_min: 90,
            reason: "a",
          },
          {
            name: "西安城墙",
            type: "attraction",
            start_time: "14:00",
            duration_min: 90,
            reason: "b",
          },
        ],
      },
      candidates: places,
      origin: { name: "酒店", lat: 34.23, lng: 108.95 },
      resolveDuration,
    });

    expect(enriched.blocks[0]?.legs_to_here?.length).toBeGreaterThan(0);
    expect(enriched.blocks[0]?.legs_to_here?.some((l) => l.source === "directions")).toBe(true);
    expect(enriched.blocks[1]?.legs_to_here?.some((l) => l.source === "directions")).toBe(true);
    expect(enriched.from_origin?.duration_min).toBe(25);
    expect(enriched.transit_outcome).toBe("directions");
    const blob = JSON.stringify(enriched);
    expect(blob).not.toMatch(/key=|Bearer |sk-/);
  });

  it("should_degrade_to_heuristic_when_directions_fail", async () => {
    const places = [place("大雁塔", 34.22, 108.96)];
    const enriched = await enrichArrangeDayWithTransit({
      day: {
        day_index: 1,
        blocks: [
          {
            name: "大雁塔",
            type: "attraction",
            start_time: "10:00",
            duration_min: 90,
            reason: "a",
          },
        ],
      },
      candidates: places,
      origin: { name: "酒店", lat: 34.23, lng: 108.95 },
      resolveDuration: async () => {
        throw new Error("down");
      },
    });
    expect(enriched.blocks[0]?.legs_to_here?.every((l) => l.source === "heuristic")).toBe(true);
    expect(enriched.transit_outcome).toBe("heuristic");
  });

  it("should_enrich_via_arrangeDay_with_injected_resolver", async () => {
    const places = [
      place("大雁塔", 34.22, 108.96),
      place("西安城墙", 34.26, 108.94),
    ];
    const lunch: PlaceCard = {
      provider: "AMAP",
      name: "Lunch Spot",
      category: "restaurant",
      rating: 4.5,
      location: { lat: 34.24, lng: 108.95, crs: "GCJ-02" },
      sources: [{ provider: "AMAP", native_id: "lunch", deeplinks: {} }],
    };
    const dinner: PlaceCard = {
      provider: "AMAP",
      name: "Dinner Spot",
      category: "restaurant",
      rating: 4.5,
      location: { lat: 34.25, lng: 108.94, crs: "GCJ-02" },
      sources: [{ provider: "AMAP", native_id: "dinner", deeplinks: {} }],
    };
    const dayJson = JSON.stringify({
      days: [
        {
          day_index: 1,
          blocks: [
            {
              name: "大雁塔",
              type: "attraction",
              start_time: "10:00",
              duration_min: 90,
              reason: "a",
            },
            {
              name: "Lunch Spot",
              type: "lunch",
              start_time: "12:30",
              duration_min: 60,
              reason: "lunch",
            },
            {
              name: "西安城墙",
              type: "attraction",
              start_time: "14:00",
              duration_min: 90,
              reason: "b",
            },
            {
              name: "Dinner Spot",
              type: "dinner",
              start_time: "19:00",
              duration_min: 90,
              reason: "dinner",
            },
          ],
        },
      ],
    });
    const result = await arrangeDay({
      candidates: { places, restaurants: [lunch, dinner] },
      dayIndex: 1,
      city: "西安",
      locale: "CN",
      origin: { name: "酒店", lat: 34.23, lng: 108.95 },
      _testChatCreate: async () => ({
        choices: [{ message: { content: dayJson } }],
      }),
      _testResolveDuration: async () => ({ duration_min: 18 }),
    });
    expect("execution" in result && result.execution === "host").toBe(false);
    if ("blocks" in result) {
      expect(result.blocks[1]?.legs_to_here?.some((l) => l.source === "directions")).toBe(true);
      expect(result.transit_outcome).toBe("directions");
    }
  });
});
