import { describe, expect, it, vi } from "vitest";
import { createPlacesMcpServer } from "../src/mcp/create-server";
import { healthEnvelope } from "../src/http/envelope";
import { planNextStopFill } from "../src/core/plan-next-stop";
import * as makeItineraryMod from "../src/core/make-itinerary";

type RegisteredTool = {
  handler: (args: Record<string, unknown>) => Promise<{
    content: Array<{ type: string; text: string }>;
  }>;
};

function registeredTools(server: ReturnType<typeof createPlacesMcpServer>) {
  return (server as unknown as { _registeredTools: Record<string, RegisteredTool> })._registeredTools;
}

describe("F65 — plan_next_stop absorbs display (TC-M16-65)", () => {
  it("TC-M16-65-01: should_return_stop_display_from_origin_mode", async () => {
    const result = await planNextStopFill({
      origin_mode: true,
      next_stop: { name: "Hills Hotel", kind: "stay" },
      candidates: { places: [], restaurants: [] },
      time_from: "09:00",
      stay_role: "day_origin",
      locale: "EN",
    });
    expect(result.legs).toEqual([]);
    expect(result.stop_display?.slot).toEqual({ start: "09:00", end: "09:00" });
    expect(result.stop_display?.notes).toContain("origin_stop");
  });

  it("TC-M16-65-02: should_not_register_display_current_stop_on_http_or_mcp", () => {
    const tools = registeredTools(createPlacesMcpServer());
    expect(tools.display_current_stop).toBeUndefined();
    expect(healthEnvelope().data?.tools).not.toContain("display_current_stop");
    expect(healthEnvelope().data?.tools).toContain("plan_next_stop");
  });

  it("TC-M16-65-03: make_itinerary_handoff_should_point_to_plan_next_stop_origin", async () => {
    const spy = vi.spyOn(makeItineraryMod, "makeItinerary").mockResolvedValue({
      skeleton: {
        days: [
          {
            day_index: 1,
            day_theme: "t",
            stops: [
              { name: "Hotel", kind: "stay" },
              { name: "Tower", kind: "attraction" },
            ],
          },
        ],
      } as never,
      candidates_slim: { places: [], restaurants: [] },
    });
    const tools = registeredTools(createPlacesMcpServer());
    const res = await tools.make_itinerary.handler({
      city: "Lisbon",
      numDays: 2,
      locale: "EN",
      origin: { name: "Hotel" },
      candidates: {
        places: [{ name: "Belém Tower", location: { lat: 38.69, lng: -9.21, crs: "WGS84" } }],
        restaurants: [],
      },
    });
    spy.mockRestore();
    const envelope = JSON.parse(res.content[0].text) as {
      ok: boolean;
      data?: {
        next_action?: string;
        next_tool_call?: { name?: string; arguments?: { origin_mode?: boolean } };
      };
    };
    expect(envelope.ok).toBe(true);
    expect(envelope.data?.next_action).toBe("plan_next_stop");
    expect(envelope.data?.next_tool_call?.name).toBe("plan_next_stop");
    expect(envelope.data?.next_tool_call?.arguments?.origin_mode).toBe(true);
  });
});
