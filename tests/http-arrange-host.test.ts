/**
 * TC-M8-H35-01 — Mode H HTTP / core arrange_day execution=host
 */
import { describe, expect, it, vi } from "vitest";
import { arrangeDay } from "../src/core/itinerary-planner";
import { arrangeDayBody } from "../src/http/schemas";
import { dispatchTool } from "../src/http/dispatch";
import { generateCallerSecret } from "../src/core/crypto";
import { prisma } from "../src/db/client";
import type { PlaceCard } from "../src/core/types";

const chatCreate = vi.fn();

vi.mock("openai", () => ({
  default: class OpenAI {
    chat = { completions: { create: chatCreate } };
  },
}));

function place(name: string): PlaceCard {
  return {
    provider: "AMAP",
    name,
    category: "风景名胜",
    rating: 4.5,
    location: { lat: 34.26, lng: 108.94, crs: "GCJ-02" },
    photos: ["https://example.com/a.jpg"],
    hours: "09:00-17:00",
    sources: [
      {
        provider: "AMAP",
        native_id: name,
        deeplinks: { amap: "https://uri.amap.com/marker?position=1,2&key=SECRET" },
      },
    ],
  };
}

describe("TC-M8-H35-01 Mode H host handoff", () => {
  it("should_return_prompts_without_calling_llm_when_execution_host", async () => {
    chatCreate.mockClear();
    const result = await arrangeDay({
      candidates: {
        places: [place("大雁塔"), place("秦始皇兵马俑博物馆")],
        restaurants: [place("老马家肉夹馍")],
      },
      dayIndex: 1,
      city: "西安",
      locale: "CN",
      execution: "host",
      _testChatCreate: chatCreate,
    });

    expect(result).toMatchObject({ execution: "host" });
    if (!("execution" in result) || result.execution !== "host") {
      throw new Error("expected host handoff");
    }
    expect(result.system_prompt.length).toBeGreaterThan(20);
    expect(result.user_prompt).toContain("大雁塔");
    expect(result.host_instructions).toMatch(/立即执行|DO NOW|写进/i);
    expect(result.day_index).toBe(1);
    expect(result.candidates_slim.places[0]?.photos).toEqual(["https://example.com/a.jpg"]);
    expect(result.candidates_slim.places[0]?.sources?.[0]?.deeplinks?.amap).toMatch(
      /uri\.amap\.com/,
    );
    expect(result.output_contract).toMatch(/JSON/i);
    expect(chatCreate).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toMatch(/SECRET|sk-/);
  });

  it("should_accept_execution_host_in_http_schema", () => {
    const parsed = arrangeDayBody.safeParse({
      candidates: { places: [{ name: "大雁塔" }], restaurants: [] },
      dayIndex: 1,
      locale: "CN",
      execution: "host",
    });
    expect(parsed.success).toBe(true);
  });

  it("should_include_transit_preference_in_host_user_prompt", async () => {
    chatCreate.mockClear();
    const result = await arrangeDay({
      candidates: {
        places: [place("大雁塔")],
        restaurants: [],
      },
      dayIndex: 1,
      city: "西安",
      locale: "CN",
      execution: "host",
      preferences: { transit_preferred: true },
      _testChatCreate: chatCreate,
    });
    expect(result).toMatchObject({ execution: "host" });
    if (!("user_prompt" in result)) throw new Error("expected host");
    expect(result.user_prompt).toMatch(/transit|metro|public/i);
    expect(chatCreate).not.toHaveBeenCalled();
  });

  it("should_dispatch_host_handoff_over_http", async () => {
    const generated = generateCallerSecret();
    await prisma.callerApiKey.create({
      data: {
        name: "mode-h-test",
        keyHash: generated.keyHash,
        prefix: generated.prefix,
        status: "ACTIVE",
      },
    });
    const result = await dispatchTool("arrange_day", `Bearer ${generated.secret}`, {
      candidates: {
        places: [place("大雁塔")],
        restaurants: [],
      },
      dayIndex: 1,
      city: "西安",
      locale: "CN",
      execution: "host",
    });
    expect(result.status).toBe(200);
    expect(result.envelope.ok).toBe(true);
    const data = result.envelope.data as {
      execution?: string;
      system_prompt?: string;
      user_prompt?: string;
      candidates_slim?: unknown;
      output_contract?: string;
    };
    expect(data.execution).toBe("host");
    expect(data.system_prompt).toBeTruthy();
    expect(data.user_prompt).toBeTruthy();
    expect(data.candidates_slim).toBeTruthy();
    expect(data.output_contract).toBeTruthy();
    expect(JSON.stringify(result.envelope)).not.toMatch(/Bearer |sk-/);
  });
});
