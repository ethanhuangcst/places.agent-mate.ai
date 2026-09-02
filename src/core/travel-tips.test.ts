import { describe, expect, it } from "vitest";
import { travelTips, TravelTipsTimeoutError } from "./travel-tips";
import type { ItinerarySkeleton } from "./make-itinerary";

/** One injected create serves both LLM calls; distinguish by prompt shape. */
function dualChat(iconicContent: string, tipsContent: string) {
  return (async (params: { messages: Array<{ content: string }> }) => {
    const user = params.messages[params.messages.length - 1]?.content ?? "";
    if (user.includes("JSON array")) {
      return { choices: [{ message: { content: iconicContent } }] };
    }
    return { choices: [{ message: { content: tipsContent } }] };
  }) as never;
}

function tipsJson(o: Record<string, string>): string {
  return JSON.stringify(o);
}

const skeleton: ItinerarySkeleton = {
  days: [
    {
      day_index: 1,
      day_theme: "Belém",
      stops: [
        { name: "Torre de Belém", kind: "attraction" },
        { name: "Pastéis de Belém", kind: "meal", meal_slot: "lunch" },
      ],
    },
  ],
};

describe("travelTips (ADR-045 §4)", () => {
  it("TC-M12-50-01: should_return_structured_fields_and_weather", async () => {
    const out = await travelTips({
      destination: "Lisbon",
      bounds: { start: "2026-09-01", end: "2026-09-03" },
      locale: "EN",
      _testGeo: { lat: 38.72, lng: -9.14 },
      _testChatCreate: dualChat(
        '["Belém Tower", "Jerónimos Monastery", "Pena Palace"]',
        tipsJson({
          intro: "Lisbon is a sunlit coastal capital of seven hills and fado.",
          transit: "Trams and metro cover the center; walk the hills.",
          clothing: "Light layers and comfy shoes; a jacket at night.",
          safety: "Watch pickpockets on tram 28 and in tourist crowds.",
        }),
      ),
    });
    expect(out.iconic_places).toEqual(["Belém Tower", "Jerónimos Monastery", "Pena Palace"]);
    expect(out.iconic_grounded).toBe(false);
    expect(out.intro).toMatch(/Lisbon/i);
    expect(out.transit.length).toBeGreaterThan(0);
    expect(out.clothing.length).toBeGreaterThan(0);
    expect(out.safety.length).toBeGreaterThan(0);
    expect(out.weather).not.toBeNull();
    expect(out.weather?.severity).toMatch(/fair|caution|adverse|severe/);
    expect(out.weather_unavailable).toBe(false);
  });

  it("TC-M12-50-02: should_truncate_intro_to_80_chars", async () => {
    const out = await travelTips({
      destination: "X",
      locale: "EN",
      _testGeo: { lat: 38.72, lng: -9.14 },
      _testChatCreate: dualChat("[]", tipsJson({
        intro: "x".repeat(200),
        transit: "t",
        clothing: "c",
        safety: "s",
      })),
    });
    expect(out.intro.length).toBeLessThanOrEqual(80);
  });

  it("TC-M12-50-03: should_throw_travel_tips_timeout_when_tips_prose_aborts", async () => {
    const abortChat = (async () => {
      const e = new Error("The user aborted the request");
      e.name = "AbortError";
      throw e;
    }) as never;
    await expect(
      travelTips({
        destination: "X",
        locale: "EN",
        _testGeo: { lat: 38.72, lng: -9.14 },
        _testChatCreate: abortChat,
      }),
    ).rejects.toBeInstanceOf(TravelTipsTimeoutError);
  });

  it("TC-M12-50-04: should_degrade_weather_when_adapter_returns_null", async () => {
    const out = await travelTips({
      destination: "Nowhere",
      locale: "EN",
      // fixture weather adapter returns null for lat=0,lng=0
      _testGeo: { lat: 0, lng: 0 },
      _testChatCreate: dualChat("[]", tipsJson({
        intro: "i",
        transit: "t",
        clothing: "c",
        safety: "s",
      })),
    });
    expect(out.weather).toBeNull();
    expect(out.weather_unavailable).toBe(true);
    expect(out.intro).toBe("i");
  });

  it("TC-M12-50-06: should_seed_iconic_pool_from_skeleton_and_ground", async () => {
    const out = await travelTips({
      destination: "Lisbon",
      locale: "EN",
      skeleton,
      _testGeo: { lat: 38.72, lng: -9.14 },
      _testChatCreate: dualChat(
        '["Torre de Belém"]',
        tipsJson({ intro: "i", transit: "t", clothing: "c", safety: "s" }),
      ),
    });
    // skeleton attraction names seed the pool → grounded mode → names pool-validated.
    expect(out.iconic_grounded).toBe(true);
    expect(out.iconic_places).toEqual(["Torre de Belém"]);
  });

  it("TC-M12-50-08: should_produce_prose_when_weather_fails_but_iconic_succeeds", async () => {
    const out = await travelTips({
      destination: "X",
      locale: "EN",
      _testGeo: { lat: 0, lng: 0 }, // weather null
      _testChatCreate: dualChat(
        '["Pena Palace"]',
        tipsJson({ intro: "i", transit: "t", clothing: "c", safety: "s" }),
      ),
    });
    expect(out.weather).toBeNull();
    expect(out.weather_unavailable).toBe(true);
    expect(out.iconic_places).toEqual(["Pena Palace"]);
    expect(out.intro).toBe("i");
  });

  it("TC-M12-50-11: should_return_ungrounded_iconic_without_secondary_verification", async () => {
    // No skeleton/pool → ungrounded; names returned as-is (grounded:false), no throw.
    const out = await travelTips({
      destination: "Lisbon",
      locale: "EN",
      _testGeo: { lat: 38.72, lng: -9.14 },
      _testChatCreate: dualChat(
        '["Pena Palace", "Belém Tower", "Castelo de São Jorge"]',
        tipsJson({ intro: "i", transit: "t", clothing: "c", safety: "s" }),
      ),
    });
    expect(out.iconic_grounded).toBe(false);
    expect(out.iconic_places.length).toBe(3);
  });
});
