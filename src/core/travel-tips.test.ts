import { describe, expect, it } from "vitest";
import {
  travelTips,
  TravelTipsTimeoutError,
  weatherContextForTips,
  tipsProseHasForbiddenEnglishWeatherTokens,
  buildTipsProseUserMessage,
} from "./travel-tips";
import type { ItinerarySkeleton } from "./make-itinerary";

/** Tips-prose only — ADR-069: iconic_places come from skeleton/pool, not an LLM. */
function tipsChat(tipsContent: string) {
  return (async () => ({
    choices: [{ message: { content: tipsContent } }],
  })) as never;
}

/** Sequential chat responses for validation-retry tests. */
function tipsChatSequence(...contents: string[]) {
  let i = 0;
  return (async () => {
    const content = contents[Math.min(i, contents.length - 1)]!;
    i += 1;
    return { choices: [{ message: { content } }] };
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


describe("travelTips (ADR-045 §4 / ADR-069)", () => {
  it("TC-M12-50-01: should_return_structured_fields_and_weather", async () => {
    const out = await travelTips({
      destination: "Lisbon",
      bounds: { start: "2026-09-01", end: "2026-09-03" },
      locale: "EN",
      skeleton,
      _testGeo: { lat: 38.72, lng: -9.14 },
      _testChatCreate: tipsChat(
        tipsJson({
          intro: "Lisbon is a sunlit coastal capital of seven hills and fado.",
          transit: "Trams and metro cover the center; walk the hills.",
          clothing: "Light layers and comfy shoes; a jacket at night.",
          safety: "Watch pickpockets on tram 28 and in tourist crowds.",
        }),
      ),
    });
    expect(out.iconic_places).toEqual(["Torre de Belém"]);
    expect(out.iconic_grounded).toBe(true);
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
      _testChatCreate: tipsChat(
        tipsJson({
          intro: "x".repeat(200),
          transit: "t",
          clothing: "c",
          safety: "s",
        }),
      ),
    });
    expect(out.intro.length).toBeLessThanOrEqual(80);
  });

  it("TC-M18-76-01: should_return_iconic_when_tips_prose_aborts", async () => {
    const abortChat = (async () => {
      const e = new Error("The user aborted the request");
      e.name = "AbortError";
      throw e;
    }) as never;
    const out = await travelTips({
      destination: "X",
      locale: "EN",
      skeleton,
      _testGeo: { lat: 38.72, lng: -9.14 },
      _testChatCreate: abortChat,
    });
    // Skeleton attractions survive tips-prose abort (ADR-069).
    expect(out.iconic_places).toEqual(["Torre de Belém"]);
    expect(out.iconic_grounded).toBe(true);
    expect(out.intro).toBe("");
    expect(out.transit).toBe("");
    expect(out.clothing).toBe("");
    expect(out.safety).toBe("");
  });

  it("TC-M12-50-03: should_throw_travel_tips_timeout_when_prose_aborts_without_iconic", async () => {
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
      _testChatCreate: tipsChat(
        tipsJson({
          intro: "i",
          transit: "t",
          clothing: "c",
          safety: "s",
        }),
      ),
    });
    expect(out.weather).toBeNull();
    expect(out.weather_unavailable).toBe(true);
    expect(out.intro).toBe("i");
  });

  it("TC-M12-50-06: should_seed_iconic_from_skeleton_stops", async () => {
    const out = await travelTips({
      destination: "Lisbon",
      locale: "EN",
      skeleton,
      _testGeo: { lat: 38.72, lng: -9.14 },
      _testChatCreate: tipsChat(
        tipsJson({ intro: "i", transit: "t", clothing: "c", safety: "s" }),
      ),
    });
    expect(out.iconic_grounded).toBe(true);
    expect(out.iconic_places).toEqual(["Torre de Belém"]);
  });

  it("TC-M12-50-08: should_produce_prose_when_weather_fails_with_skeleton_iconic", async () => {
    const out = await travelTips({
      destination: "X",
      locale: "EN",
      skeleton: {
        days: [
          {
            day_index: 1,
            day_theme: "Sintra",
            stops: [{ name: "Pena Palace", kind: "attraction" }],
          },
        ],
      },
      _testGeo: { lat: 0, lng: 0 }, // weather null
      _testChatCreate: tipsChat(
        tipsJson({ intro: "i", transit: "t", clothing: "c", safety: "s" }),
      ),
    });
    expect(out.weather).toBeNull();
    expect(out.weather_unavailable).toBe(true);
    expect(out.iconic_places).toEqual(["Pena Palace"]);
    expect(out.iconic_grounded).toBe(true);
    expect(out.intro).toBe("i");
  });

  it("TC-M12-50-11: should_return_empty_grounded_iconic_without_skeleton_or_pool", async () => {
    // No skeleton/pool → empty iconic_places; still grounded (no LLM inference).
    const out = await travelTips({
      destination: "Lisbon",
      locale: "EN",
      _testGeo: { lat: 38.72, lng: -9.14 },
      _testChatCreate: tipsChat(
        tipsJson({ intro: "i", transit: "t", clothing: "c", safety: "s" }),
      ),
    });
    expect(out.iconic_grounded).toBe(true);
    expect(out.iconic_places).toEqual([]);
  });
});

describe("tips-prose locale / weather context (drizzle mix fix)", () => {
  it("should_omit_english_driver_enums_from_CN_weather_context", () => {
    const ctx = weatherContextForTips("CN", {
      severity: "caution",
      drivers: ["drizzle"],
      temp_min: 18,
      temp_max: 24,
      summary_key: "itinerary.weather.impact_caution",
      summary: "天气需注意，已对步行增加少量缓冲。",
    });
    expect(ctx).not.toMatch(/\bdrizzle\b/i);
    expect(ctx).not.toMatch(/\bcaution\b/i);
    expect(ctx).not.toMatch(/\bseverity\b/i);
    expect(ctx).toContain("毛毛雨");
    expect(ctx).toContain("天气需注意");
  });

  it("should_build_CN_user_message_without_drizzle_token", () => {
    const msg = buildTipsProseUserMessage(
      { destination: "杭州", locale: "CN" },
      {
        severity: "caution",
        drivers: ["drizzle", "rain"],
        temp_min: 16,
        temp_max: 22,
        summary_key: "itinerary.weather.impact_caution",
        summary: "天气需注意，已对步行增加少量缓冲。",
      },
      { names: ["西湖"], grounded: true },
    );
    // Weather facts use localized labels — not raw enum injection like "drivers: drizzle".
    expect(msg).not.toMatch(/drivers:\s*drizzle/i);
    expect(msg).not.toMatch(/severity:\s*caution/i);
    expect(msg).toContain("毛毛雨");
    expect(msg).toContain("降雨");
    expect(msg).toMatch(/Never use English weather tokens/);
  });

  it("should_flag_CN_clothing_that_echoes_drizzle", () => {
    expect(
      tipsProseHasForbiddenEnglishWeatherTokens("CN", {
        intro: "杭州湖光山色。",
        transit: "地铁便利。",
        clothing: "备折叠伞防 drizzle。",
        safety: "注意防盗。",
      }),
    ).toBe(true);
    expect(
      tipsProseHasForbiddenEnglishWeatherTokens("CN", {
        intro: "杭州湖光山色。",
        transit: "地铁便利。",
        clothing: "备折叠伞防毛毛雨。",
        safety: "注意防盗。",
      }),
    ).toBe(false);
    expect(
      tipsProseHasForbiddenEnglishWeatherTokens("EN", {
        intro: "i",
        transit: "t",
        clothing: "Pack for drizzle.",
        safety: "s",
      }),
    ).toBe(false);
  });

  it("should_retry_and_accept_CN_prose_without_english_weather_tokens", async () => {
    const out = await travelTips({
      destination: "杭州",
      locale: "CN",
      skeleton: {
        days: [
          {
            day_index: 1,
            day_theme: "西湖",
            stops: [{ name: "西湖", kind: "attraction" }],
          },
        ],
      },
      _testGeo: { lat: 30.25, lng: 120.16 },
      _testChatCreate: tipsChatSequence(
        tipsJson({
          intro: "杭州以西湖闻名。",
          transit: "地铁与公交方便。",
          clothing: "备折叠伞防 drizzle。",
          safety: "人多注意防盗。",
        }),
        tipsJson({
          intro: "杭州以西湖闻名。",
          transit: "地铁与公交方便。",
          clothing: "备折叠伞防毛毛雨。",
          safety: "人多注意防盗。",
        }),
      ),
    });
    expect(out.clothing).toBe("备折叠伞防毛毛雨。");
    expect(out.clothing).not.toMatch(/\bdrizzle\b/i);
  });
});
