import { describe, it, expect } from "vitest";
import {
  LlmItinerarySchema,
  validateItinerary,
  buildUserMessage,
  type LlmItineraryOutput,
} from "./itinerary-planner";
import { type PlaceCard } from "./types";

const validOutput: LlmItineraryOutput = {
  days: [
    {
      day_index: 1,
      date: "2026-08-25",
      blocks: [
        {
          name: "上海博物馆",
          type: "attraction",
          start_time: "10:00",
          duration_min: 90,
          reason: "上海最著名的博物馆",
        },
        {
          name: "南翔小笼",
          type: "lunch",
          start_time: "12:00",
          duration_min: 60,
          reason: "正宗小笼包",
          alternatives: [{ name: "绿波廊", reason: "老字号餐厅" }],
        },
      ],
    },
  ],
};

const candidates = new Set(["上海博物馆", "南翔小笼", "绿波廊", "豫园", "外滩"]);

describe("LlmItinerarySchema", () => {
  it("TC-M6-IT04: should pass for valid output", () => {
    const result = LlmItinerarySchema.safeParse(validOutput);
    expect(result.success).toBe(true);
  });

  it("TC-M6-IT02: should require reason field", () => {
    const noReason = {
      days: [{
        day_index: 1,
        blocks: [{ name: "X", type: "attraction", start_time: "10:00", duration_min: 90 }],
      }],
    };
    const result = LlmItinerarySchema.safeParse(noReason);
    expect(result.success).toBe(false);
  });

  it("TC-M6-IT03: should require duration_min", () => {
    const noDuration = {
      days: [{
        day_index: 1,
        blocks: [{ name: "X", type: "attraction", start_time: "10:00", reason: "good" }],
      }],
    };
    const result = LlmItinerarySchema.safeParse(noDuration);
    expect(result.success).toBe(false);
  });

  it("TC-M6-IT05: should reject invalid start_time format", () => {
    const badTime = {
      days: [{
        day_index: 1,
        blocks: [{ name: "X", type: "attraction", start_time: "10am", duration_min: 90, reason: "ok" }],
      }],
    };
    const result = LlmItinerarySchema.safeParse(badTime);
    expect(result.success).toBe(false);
  });

  it("should accept from_origin and to_destination", () => {
    const withTransport = {
      ...validOutput,
      days: [{
        ...validOutput.days[0],
        from_origin: { transport: "metro", duration_min: 25, depart_time: "09:30" },
        to_destination: { transport: "taxi", duration_min: 40, arrive_time: "18:30" },
      }],
    };
    const result = LlmItinerarySchema.safeParse(withTransport);
    expect(result.success).toBe(true);
  });

  it("should accept output without from_origin (no origin provided)", () => {
    const result = LlmItinerarySchema.safeParse(validOutput);
    expect(result.success).toBe(true);
    expect(validOutput.days[0].from_origin).toBeUndefined();
  });
});

describe("validateItinerary", () => {
  it("TC-M6-IT07: should return no errors for valid output", () => {
    const errors = validateItinerary(validOutput, candidates, 5);
    expect(errors).toHaveLength(0);
  });

  it("TC-M6-IT07b: should detect invented place name", () => {
    const invented: LlmItineraryOutput = {
      days: [{
        day_index: 1,
        blocks: [{
          name: "不存在的餐厅",
          type: "lunch",
          start_time: "12:00",
          duration_min: 60,
          reason: "虚构的",
        }],
      }],
    };
    const errors = validateItinerary(invented, candidates, 5);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toContain("not found in candidate");
  });

  it("TC-M6-IT08: should detect pace limit exceeded", () => {
    const tooMany: LlmItineraryOutput = {
      days: [{
        day_index: 1,
        blocks: Array.from({ length: 7 }, (_, i) => ({
          name: [...candidates][i % candidates.size],
          type: "attraction" as const,
          start_time: `${10 + i}:00`,
          duration_min: 60,
          reason: "ok",
        })),
      }],
    };
    const errors = validateItinerary(tooMany, candidates, 5);
    expect(errors.some((e) => e.message.includes("Too many blocks"))).toBe(true);
  });
});

describe("buildUserMessage", () => {
  const samplePlace: PlaceCard = {
    provider: "GOOGLE_MAPS",
    name: "上海博物馆",
    category: "museum",
    rating: 4.5,
    location: { lat: 31.23, lng: 121.47, crs: "WGS84" },
    sources: [{ provider: "GOOGLE_MAPS", native_id: "test1", deeplinks: {} }],
  };

  it("TC-M6-IT09: should include candidate lat/lng in message", () => {
    const msg = buildUserMessage({
      city: "上海",
      numDays: 2,
      candidates: { places: [samplePlace], restaurants: [] },
      locale: "CN",
    });
    expect(msg).toContain("31.2300");
    expect(msg).toContain("121.4700");
    expect(msg).toContain("上海博物馆");
  });

  it("should include origin when provided", () => {
    const msg = buildUserMessage({
      city: "上海",
      numDays: 1,
      candidates: { places: [], restaurants: [] },
      origin: { name: "外滩", lat: 31.24, lng: 121.49 },
      locale: "EN",
    });
    expect(msg).toContain("Origin: 外滩");
  });

  it("should note 'not specified' when no origin", () => {
    const msg = buildUserMessage({
      city: "Tokyo",
      numDays: 1,
      candidates: { places: [], restaurants: [] },
      locale: "EN",
    });
    expect(msg).toContain("not specified");
    expect(msg).toContain("10:00");
  });

  it("should include pace limit", () => {
    const msg = buildUserMessage({
      city: "HK",
      numDays: 1,
      candidates: { places: [], restaurants: [] },
      pace: "tight",
      locale: "EN",
    });
    expect(msg).toContain("max places per day: 6");
  });
});
