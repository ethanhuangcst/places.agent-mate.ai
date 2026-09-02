import { describe, it, expect, vi } from "vitest";
import { createPlacesMcpServer } from "./create-server";
import * as planner from "../core/itinerary-planner";
import * as makeItineraryMod from "../core/make-itinerary";
import * as itinerary from "../core/itinerary";

type RegisteredTool = {
  description?: string;
  handler: (args: Record<string, unknown>) => Promise<{
    content: Array<{ type: string; text: string }>;
    isError?: boolean;
  }>;
};

function registeredTools(server: ReturnType<typeof createPlacesMcpServer>) {
  return (server as unknown as { _registeredTools: Record<string, RegisteredTool> })
    ._registeredTools;
}

describe("MCP ADR-040 tools", () => {
  it("should_gate_plan_itinerary_when_bounds_missing", async () => {
    const tools = registeredTools(createPlacesMcpServer());
    const res = await tools.plan_itinerary.handler({
      locale: "CN",
      destination: { name: "里斯本" },
      detail: "timed",
      preferences: { natural_language: "四天" },
    });
    const envelope = JSON.parse(res.content[0].text) as {
      data: {
        intake?: { status?: string; remaining_fields?: string[] };
        prefer_tool?: string;
        next_action?: string;
      };
    };
    expect(envelope.data.intake?.status).toBe("need_input");
    expect(envelope.data.prefer_tool).toBe("discover_places");
    expect(envelope.data.next_action).toBe("ask_in_chat_then_call_once");
    expect(envelope.data.intake?.remaining_fields).toEqual(
      expect.arrayContaining(["start_date", "num_days"]),
    );
  });

  it("should_not_advertise_plan_itinerary_as_default_for_推荐行程", () => {
    const tools = registeredTools(createPlacesMcpServer());
    expect(tools.plan_itinerary.description).toMatch(/DO NOT call/i);
    expect(tools.plan_itinerary.description).not.toMatch(/^places-agent:.*Triggers: 推荐行程/s);
    expect(tools.discover_places.description).toMatch(/DEFAULT for 推荐行程/);
  });

  it("should_register_trip_plan_and_trips_as_aliases_of_plan_itinerary", () => {
    const tools = registeredTools(createPlacesMcpServer());
    expect(tools.plan_itinerary).toBeTruthy();
    expect(tools.trip_plan).toBeTruthy();
    expect(tools.trips).toBeTruthy();
    expect(tools.trip_plan.description).toBe(tools.plan_itinerary.description);
    expect(tools.trips.description).toBe(tools.plan_itinerary.description);
  });

  it("should_return_all_missing_intake_questions_when_discover_empty", async () => {
    const tools = registeredTools(createPlacesMcpServer());
    const res = await tools.discover_places.handler({ locale: "CN" });
    const envelope = JSON.parse(res.content[0].text) as {
      ok: boolean;
      data: {
        intake: {
          status: string;
          field: string;
          question: string;
          remaining_fields?: string[];
          questions?: Array<{ field: string }>;
          host_action?: string;
        };
        next_action?: string;
        host_instructions?: string;
      };
    };
    expect(envelope.ok).toBe(true);
    expect(envelope.data.intake.status).toBe("need_input");
    expect(envelope.data.intake.host_action).toBe("ask_in_chat_then_call_once");
    expect(envelope.data.intake.remaining_fields).toEqual([
      "city",
      "start_date",
      "num_days",
    ]);
    expect(envelope.data.intake.questions?.length).toBe(8);
    expect(envelope.data.intake.question).toMatch(/消费|spend/i);
    expect(envelope.data.next_action).toBe("ask_in_chat_then_call_once");
    expect(envelope.data.host_instructions).toMatch(/ONCE|questionnaire|RULE 0|完整表单/i);
  });

  it("should_allow_arrange_without_origin", async () => {
    const spy = vi.spyOn(planner, "arrangeDay").mockResolvedValue({
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
    });
    const tools = registeredTools(createPlacesMcpServer());
    const res = await tools.arrange_day.handler({
      candidates: { places: [{ name: "A" }], restaurants: [] },
      dayIndex: 1,
      locale: "CN",
      city: "Lisbon",
    });
    const envelope = JSON.parse(res.content[0].text) as {
      ok: boolean;
      data: { intake?: unknown; next_action?: string };
    };
    expect(envelope.ok).toBe(true);
    expect(envelope.data.intake).toBeUndefined();
    expect(envelope.data.next_action).toMatch(/present_day/);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("should_instruct_host_to_continue_next_day_after_present", async () => {
    const spy = vi.spyOn(planner, "arrangeDay").mockResolvedValue({
      day_index: 1,
      blocks: [
        {
          name: "A",
          type: "attraction",
          start_time: "10:00",
          duration_min: 60,
          reason: "ok",
          photos: ["https://example.com/fat-photo?key=SECRET"],
        },
      ],
      photos_cover: "https://example.com/cover?key=SECRET",
    });
    const tools = registeredTools(createPlacesMcpServer());
    const res = await tools.arrange_day.handler({
      candidates: {
        places: [
          {
            name: "A",
            photos: [
              "https://example.com/p1?key=SECRET",
              "https://example.com/p2?key=SECRET",
            ],
          },
        ],
        restaurants: [],
      },
      dayIndex: 1,
      num_days: 4,
      locale: "CN",
      city: "Lisbon",
      origin: { name: "Hills Hotel" },
    });
    const envelope = JSON.parse(res.content[0].text) as {
      data: {
        next_action?: string;
        host_instructions?: string;
        blocks?: Array<{ photos?: string[] }>;
        photos_cover?: string;
      };
    };
    expect(envelope.data.next_action).toBe("present_day_then_continue");
    expect(envelope.data.host_instructions).toMatch(/no asking the user|no waiting for 继续|do it yourself/i);
    expect(envelope.data.host_instructions).toMatch(/Day 1 of 4/);
    expect(envelope.data.host_instructions).toMatch(/dayIndex=2/);
    expect(envelope.data.host_instructions).toMatch(/num_days=4/);
    expect(envelope.data.host_instructions).toMatch(/must_include/);
    expect(envelope.data.host_instructions).toMatch(/### HH:MM|MULTI-LINE|multi-line/i);
    expect(envelope.data.host_instructions).toMatch(/ONE day at a time|do NOT fire multiple arrange_day in parallel/i);
    expect(envelope.data.blocks?.[0]?.photos).toBeUndefined();
    expect(envelope.data.photos_cover).toBeUndefined();
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        candidates: expect.objectContaining({
          places: [expect.objectContaining({ name: "A" })],
        }),
      }),
    );
    const slimPlaces = (spy.mock.calls[0]?.[0] as { candidates: { places: Array<{ photos?: string[] }> } })
      .candidates.places;
    expect(slimPlaces[0]?.photos?.length).toBeLessThanOrEqual(1);
    expect(tools.arrange_day.description).toMatch(/LEGACY/i);
    expect(tools.arrange_day.description).toMatch(/num_days/i);
    expect(tools.arrange_day.description).toMatch(/must_include/i);
    expect(tools.arrange_day.description).not.toMatch(/await user 继续/i);
    expect(tools.discover_places.description).toMatch(/推荐西安三天行程|城市\+天数|MUST call/i);
    spy.mockRestore();
  });

  it("should_instruct_host_to_stop_after_last_day", async () => {
    const spy = vi.spyOn(planner, "arrangeDay").mockResolvedValue({
      day_index: 4,
      blocks: [
        {
          name: "Sintra",
          type: "attraction",
          start_time: "10:00",
          duration_min: 90,
          reason: "day trip",
        },
      ],
    });
    const tools = registeredTools(createPlacesMcpServer());
    const res = await tools.arrange_day.handler({
      candidates: { places: [{ name: "Sintra" }], restaurants: [] },
      dayIndex: 4,
      num_days: 4,
      locale: "CN",
      city: "Lisbon",
      origin: { name: "Hills Hotel" },
      presented_previous_day: true,
      preferences: { day_theme: "Sintra day trip" },
    });
    const envelope = JSON.parse(res.content[0].text) as {
      data: { host_instructions?: string; next_action?: string };
    };
    expect(envelope.data.next_action).toBe("present_day_then_overview");
    expect(envelope.data.host_instructions).toMatch(/LAST day \(Day 4 of 4\)/);
    expect(envelope.data.host_instructions).toMatch(/Do NOT call arrange_day again/);
    expect(envelope.data.host_instructions).not.toMatch(/dayIndex=5/);
    spy.mockRestore();
  });

  it("should_slim_discover_candidates_and_mention_day_trips", async () => {
    const spy = vi.spyOn(planner, "discoverPlaces").mockResolvedValue({
      candidates: {
        places: [
          {
            provider: "GOOGLE_MAPS",
            name: "Castle",
            location: { lat: 0, lng: 0, crs: "WGS84" },
            sources: [],
            photos: [
              "https://example.com/a?key=SECRET",
              "https://example.com/b?key=SECRET",
            ],
            hours: "24h",
          },
        ],
        restaurants: [],
      },
    });
    const tools = registeredTools(createPlacesMcpServer());
    const res = await tools.discover_places.handler({
      city: "Lisbon",
      bounds: { start: "2026-09-05", end: "2026-09-08" },
      locale: "CN",
      origin: { name: "Hills Hotel" },
    });
    const envelope = JSON.parse(res.content[0].text) as {
      data: {
        candidates: { places: Array<{ photos?: string[]; hours?: string }> };
        num_days?: number;
        host_instructions?: string;
      };
    };
    expect(envelope.data.num_days).toBe(4);
    expect(envelope.data.candidates.places[0]?.photos).toBeUndefined();
    expect(envelope.data.candidates.places[0]?.hours).toBeUndefined();
    expect(envelope.data.host_instructions).toMatch(/numDays=4|num_days=4/);
    expect(envelope.data.host_instructions).toMatch(/must_include/i);
    expect(envelope.data.host_instructions).toMatch(/make_itinerary/i);
    expect(envelope.data.host_instructions).toMatch(/candidates/i);
    expect(envelope.data.host_instructions).not.toMatch(/Call arrange_day dayIndex=1/i);
    expect(envelope.data.host_instructions).not.toMatch(/Sintra|Cascais/i);
    spy.mockRestore();
  });

  it("should_instruct_host_to_call_make_itinerary_not_arrange_day_after_discover", async () => {
    const spy = vi.spyOn(planner, "discoverPlaces").mockResolvedValue({
      candidates: {
        places: [
          {
            provider: "GOOGLE_MAPS",
            name: "Castle",
            location: { lat: 38.71, lng: -9.13, crs: "WGS84" },
            sources: [],
            photos: ["https://example.com/a"],
          },
        ],
        restaurants: [],
      },
      inferred_must_see: ["Castle"],
    });
    const tools = registeredTools(createPlacesMcpServer());
    const res = await tools.discover_places.handler({
      city: "Lisbon",
      bounds: { start: "2026-09-20", end: "2026-09-23" },
      locale: "CN",
      origin: { name: "Hills Hotel" },
    });
    const envelope = JSON.parse(res.content[0].text) as {
      data: { host_instructions?: string };
    };
    expect(envelope.data.host_instructions).toMatch(/make_itinerary/i);
    expect(envelope.data.host_instructions).toMatch(/candidates/i);
    expect(envelope.data.host_instructions).toMatch(/LEGACY|do NOT call arrange_day/i);
    expect(envelope.data.host_instructions).toMatch(/IMMEDIATELY call display_current_stop/);
    expect(envelope.data.host_instructions).toMatch(/travel_tips/);
    expect(tools.discover_places.description).toMatch(/make_itinerary/i);
    expect(tools.discover_places.description).toMatch(/LEGACY|do not use.*arrange_day/i);
    expect(tools.arrange_day.description).toMatch(/LEGACY/i);
    spy.mockRestore();
  });

  it("should_accept_make_itinerary_when_restaurants_omitted", async () => {
    const spy = vi.spyOn(makeItineraryMod, "makeItinerary").mockResolvedValue({
      skeleton: {
        days: [
          {
            day_index: 1,
            day_theme: "t",
            stops: [{ name: "Hills Hotel", kind: "stay" }],
          },
        ],
      } as never,
      candidates_slim: { places: [], restaurants: [] },
    });
    const tools = registeredTools(createPlacesMcpServer());
    const res = await tools.make_itinerary.handler({
      city: "Lisbon",
      numDays: 4,
      locale: "EN",
      origin: { name: "Hills Hotel" },
      candidates: {
        places: [
          {
            provider: "GOOGLE_MAPS",
            name: "Belém Tower",
            location: { lat: 38.69, lng: -9.21, crs: "WGS84" },
            sources: [],
          },
          "restaurants':[{",
        ],
      },
    });
    const envelope = JSON.parse(res.content[0].text) as {
      ok: boolean;
      outcome?: { key?: string };
      data?: {
        next_action?: string;
        prefer_tool?: string;
        next_tool_call?: { name?: string; arguments?: { stop?: { name?: string } } };
        host_instructions?: string;
      };
    };
    expect(envelope.ok).toBe(true);
    expect(envelope.outcome?.key).not.toBe("errors.make_itinerary_failed");
    expect(envelope.data?.next_action).toBe("display_current_stop");
    expect(envelope.data?.prefer_tool).toBe("display_current_stop");
    expect(envelope.data?.next_tool_call).toMatchObject({
      name: "display_current_stop",
      arguments: { stop: { name: "Hills Hotel", kind: "stay" }, time_from: "09:00" },
    });
    // ADR-045 §fill-chain: the first handoff must carry skeleton + cursor so the
    // agent can drive the whole fill loop with concrete next_tool_call at each step.
    expect(
      (envelope.data?.next_tool_call?.arguments as { skeleton?: unknown; cursor?: unknown }).skeleton,
    ).toBeDefined();
    expect(
      (envelope.data?.next_tool_call?.arguments as { cursor?: { day_index?: number; stop_index?: number } }).cursor,
    ).toEqual({ day_index: 1, stop_index: 0 });
    expect(envelope.data?.host_instructions).toMatch(/REQUIRED NEXT TOOL: execute next_tool_call/);
    expect(envelope.data?.host_instructions).toMatch(/display_current_stop/);
    expect(envelope.data?.host_instructions).toMatch(/travel_tips/);
    expect(spy).toHaveBeenCalled();
    const input = spy.mock.calls.at(-1)?.[0] as {
      candidates: { places: Array<{ name?: string }>; restaurants: unknown[] };
    };
    expect(input.candidates.restaurants).toEqual([]);
    expect(input.candidates.places.map((p) => p.name)).toEqual(["Belém Tower"]);
    spy.mockRestore();
  });

  it("should_redirect_travel_tips_to_display_current_stop_when_skeleton_present", async () => {
    const tools = registeredTools(createPlacesMcpServer());
    const res = await tools.travel_tips.handler({
      destination: "里斯本",
      locale: "CN",
      skeleton: {
        days: [
          {
            day_index: 1,
            day_theme: "贝伦区经典",
            stops: [
              { name: "Hills Hotel Lisboa", kind: "stay" },
              { name: "热罗尼莫斯修道院", kind: "attraction" },
            ],
          },
        ],
      },
    });
    const envelope = JSON.parse(res.content[0].text) as {
      ok: boolean;
      data?: {
        fill_redirect?: boolean;
        intro?: string;
        next_action?: string;
        prefer_tool?: string;
        next_tool_call?: { name?: string; arguments?: { stop?: { name?: string } } };
        host_instructions?: string;
      };
    };
    expect(envelope.ok).toBe(true);
    expect(envelope.data?.fill_redirect).toBe(true);
    expect(envelope.data?.intro).toBeUndefined();
    expect(envelope.data?.next_action).toBe("display_current_stop");
    expect(envelope.data?.prefer_tool).toBe("display_current_stop");
    expect(envelope.data?.next_tool_call).toMatchObject({
      name: "display_current_stop",
      arguments: { stop: { name: "Hills Hotel Lisboa", kind: "stay" }, time_from: "09:00" },
    });
    expect(envelope.data?.host_instructions).toMatch(/REQUIRED NEXT TOOL: execute next_tool_call/);
    expect(envelope.data?.host_instructions).toMatch(/display_current_stop/);
  });

  it("should_normalize_object_sources_and_pass_must_include", async () => {
    const spy = vi.spyOn(planner, "arrangeDay").mockResolvedValue({
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
    });
    const tools = registeredTools(createPlacesMcpServer());
    await tools.arrange_day.handler({
      candidates: {
        places: [
          {
            name: "A",
            location: { lat: 38.71, lng: -9.13, crs: "WGS84" },
            sources: {
              deeplinks: {
                google_web: "https://www.google.com/maps/search/?api=1&query=1",
              },
            },
          },
        ],
        restaurants: [],
      },
      dayIndex: 1,
      num_days: 4,
      locale: "CN",
      city: "Lisbon",
      origin: { name: "Hills Hotel" },
      preferences: { must_include: ["Sintra", "Cascais"], day_theme: "old town" },
    });
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        preferences: expect.objectContaining({
          must_include: ["Sintra", "Cascais"],
        }),
        candidates: expect.objectContaining({
          places: [
            expect.objectContaining({
              name: "A",
              sources: expect.any(Array),
            }),
          ],
        }),
      }),
    );
    spy.mockRestore();
  });

  it("should_return_ok_false_envelope_when_arrange_throws", async () => {
    const spy = vi.spyOn(planner, "arrangeDay").mockRejectedValue(new Error("boom"));
    const tools = registeredTools(createPlacesMcpServer());
    const res = await tools.arrange_day.handler({
      candidates: { places: [{ name: "A" }], restaurants: [] },
      dayIndex: 1,
      locale: "CN",
      city: "Lisbon",
      origin: { name: "Hills Hotel" },
    });
    const envelope = JSON.parse(res.content[0].text) as {
      ok: boolean;
      outcome?: { key?: string };
      data?: { detail?: string; host_instructions?: string };
    };
    expect(envelope.ok).toBe(false);
    expect(envelope.outcome?.key).toBe("errors.arrange_day_failed");
    expect(envelope.data?.detail).toMatch(/boom/);
    expect(envelope.data?.host_instructions).toMatch(/sources as an ARRAY/);
    spy.mockRestore();
  });

  it("should_force_mcp_arrange_day_to_agent_even_when_execution_host", async () => {
    const spy = vi.spyOn(planner, "arrangeDay").mockResolvedValue({
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
    });
    const tools = registeredTools(createPlacesMcpServer());
    await tools.arrange_day.handler({
      candidates: { places: [{ name: "A" }], restaurants: [] },
      dayIndex: 1,
      locale: "EN",
      origin: { name: "Hotel" },
      execution: "host",
    });
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ execution: "agent" }),
    );
    spy.mockRestore();
  });

  it("should_return_need_present_when_arrange_day2_without_ack", async () => {
    const spy = vi.spyOn(planner, "arrangeDay").mockResolvedValue({
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
    });
    const tools = registeredTools(createPlacesMcpServer());
    await tools.arrange_day.handler({
      candidates: { places: [{ name: "A" }], restaurants: [] },
      dayIndex: 1,
      locale: "CN",
      city: "Lisbon",
      origin: { name: "Hills Hotel" },
    });
    const res2 = await tools.arrange_day.handler({
      candidates: { places: [{ name: "B" }], restaurants: [] },
      dayIndex: 2,
      locale: "CN",
      city: "Lisbon",
      origin: { name: "Hills Hotel" },
    });
    const envelope = JSON.parse(res2.content[0].text) as {
      data: { need_present_previous_day?: boolean; day_index?: number };
    };
    expect(envelope.data.need_present_previous_day).toBe(true);
    expect(envelope.data.day_index).toBe(1);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it("should_default_mcp_arrange_day_execution_to_agent", async () => {
    const spy = vi.spyOn(planner, "arrangeDay").mockResolvedValue({
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
    });
    const tools = registeredTools(createPlacesMcpServer());
    await tools.arrange_day.handler({
      candidates: { places: [{ name: "A" }], restaurants: [] },
      dayIndex: 1,
      locale: "EN",
      origin: { name: "Hotel" },
    });
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ execution: "agent" }),
    );
    spy.mockRestore();
  });

  it("should_route_trip_plan_alias_through_skeleton_flow", async () => {
    // ADR-045 §5 / F51: aliases repoint to intake → discover_places → make_itinerary.
    const discoverSpy = vi.spyOn(planner, "discoverPlaces").mockResolvedValue({
      candidates: { places: [], restaurants: [] },
      inferred_must_see: [],
    });
    const makeSpy = vi.spyOn(makeItineraryMod, "makeItinerary").mockResolvedValue({
      skeleton: { days: [{ day_index: 1, day_theme: "t", stops: [] }] } as never,
      candidates_slim: { places: [], restaurants: [] },
    });
    const planSpy = vi.spyOn(itinerary, "planItinerary").mockResolvedValue({
      data: { detail: "timed", days: [] } as never,
      skipped: [],
      locale: "EN",
      locales: ["EN"],
    });
    const tools = registeredTools(createPlacesMcpServer());
    const res = await tools.trip_plan.handler({
      detail: "timed",
      origin: { name: "Lisbon" },
      bounds: { start: "2026-09-01", end: "2026-09-04" },
      locale: "EN",
    });
    const envelope = JSON.parse(res.content[0].text) as {
      ok: boolean;
      data: { skeleton?: { days: unknown[] }; next_action?: string; host_instructions?: string };
    };
    expect(discoverSpy).toHaveBeenCalledOnce();
    expect(makeSpy).toHaveBeenCalledOnce();
    expect(planSpy).not.toHaveBeenCalled();
    expect(envelope.ok).toBe(true);
    expect(envelope.data.skeleton?.days).toHaveLength(1);
    expect(envelope.data.next_action).toBe("display_current_stop");
    expect(envelope.data.host_instructions).toMatch(/REQUIRED NEXT TOOL: execute next_tool_call/);
    expect(envelope.data.host_instructions).toMatch(/display_current_stop/);
    discoverSpy.mockRestore();
    makeSpy.mockRestore();
    planSpy.mockRestore();
  });

  it("TC-M12-51-01: all aliases route through makeItinerary and return skeleton", async () => {
    for (const alias of ["plan_itinerary", "trip_plan", "trips"] as const) {
      const discoverSpy = vi.spyOn(planner, "discoverPlaces").mockResolvedValue({
        candidates: { places: [], restaurants: [] },
        inferred_must_see: [],
      });
      const makeSpy = vi.spyOn(makeItineraryMod, "makeItinerary").mockResolvedValue({
        skeleton: { days: [{ day_index: 1, day_theme: "t", stops: [] }] } as never,
        candidates_slim: { places: [], restaurants: [] },
      });
      const planSpy = vi.spyOn(itinerary, "planItinerary").mockResolvedValue({
        data: { detail: "timed", days: [] } as never,
        skipped: [],
        locale: "EN",
        locales: ["EN"],
      });
      const tools = registeredTools(createPlacesMcpServer());
      const res = await tools[alias].handler({
        detail: "timed",
        origin: { name: "Lisbon" },
        bounds: { start: "2026-09-01", end: "2026-09-04" },
        locale: "EN",
      });
      const envelope = JSON.parse(res.content[0].text) as {
        ok: boolean;
        data: { skeleton?: { days: unknown[] }; next_action?: string };
      };
      expect(discoverSpy).toHaveBeenCalledOnce();
      expect(makeSpy).toHaveBeenCalledOnce();
      expect(planSpy).not.toHaveBeenCalled();
      expect(envelope.ok).toBe(true);
      expect(envelope.data.skeleton?.days).toHaveLength(1);
      expect(envelope.data.next_action).toBe("display_current_stop");
      discoverSpy.mockRestore();
      makeSpy.mockRestore();
      planSpy.mockRestore();
    }
  });

  it("should_chain_next_tool_call_plan_next_stop_from_display_current_stop_mid_day", async () => {
    const tools = registeredTools(createPlacesMcpServer());
    const skeleton = {
      days: [
        {
          day_index: 1,
          day_theme: "贝伦",
          stops: [
            { name: "Hills Hotel Lisboa", kind: "stay" },
            { name: "热罗尼莫斯修道院", kind: "attraction" },
            { name: "贝伦塔", kind: "attraction" },
          ],
        },
      ],
    };
    const res = await tools.display_current_stop.handler({
      stop: { name: "Hills Hotel Lisboa", kind: "stay" },
      time_from: "09:00",
      skeleton,
      cursor: { day_index: 1, stop_index: 0 },
      locale: "CN",
    });
    const envelope = JSON.parse(res.content[0].text) as {
      ok: boolean;
      data: {
        next_action?: string;
        next_tool_call?: {
          name?: string;
          arguments?: {
            current_stop?: { name?: string };
            next_stop?: { name?: string };
            cursor?: { day_index?: number; stop_index?: number };
          };
        };
        host_instructions?: string;
      };
    };
    expect(envelope.ok).toBe(true);
    expect(envelope.data?.next_action).toBe("plan_next_stop");
    expect(envelope.data?.next_tool_call?.name).toBe("plan_next_stop");
    expect(envelope.data?.next_tool_call?.arguments?.current_stop?.name).toBe("Hills Hotel Lisboa");
    expect(envelope.data?.next_tool_call?.arguments?.next_stop?.name).toBe("热罗尼莫斯修道院");
    expect(envelope.data?.next_tool_call?.arguments?.cursor).toEqual({ day_index: 1, stop_index: 1 });
    expect(envelope.data?.host_instructions).toMatch(/Execute next_tool_call immediately/);
  });

  it("should_chain_next_tool_call_display_current_stop_for_next_day_from_last_stop_of_day", async () => {
    const tools = registeredTools(createPlacesMcpServer());
    const skeleton = {
      days: [
        {
          day_index: 1,
          day_theme: "贝伦",
          stops: [
            { name: "Hills Hotel Lisboa", kind: "stay" },
            { name: "贝伦塔", kind: "attraction" },
          ],
        },
        {
          day_index: 2,
          day_theme: "辛特拉",
          stops: [
            { name: "Hills Hotel Lisboa", kind: "stay" },
            { name: "佩纳宫", kind: "attraction" },
          ],
        },
      ],
    };
    const res = await tools.display_current_stop.handler({
      stop: { name: "贝伦塔", kind: "attraction" },
      time_from: "09:00",
      skeleton,
      cursor: { day_index: 1, stop_index: 1 },
      locale: "CN",
    });
    const envelope = JSON.parse(res.content[0].text) as {
      ok: boolean;
      data: {
        next_action?: string;
        next_tool_call?: {
          name?: string;
          arguments?: { stop?: { name?: string }; time_from?: string; cursor?: { day_index?: number } };
        };
      };
    };
    expect(envelope.ok).toBe(true);
    expect(envelope.data?.next_action).toBe("display_current_stop");
    expect(envelope.data?.next_tool_call?.name).toBe("display_current_stop");
    expect(envelope.data?.next_tool_call?.arguments?.stop?.name).toBe("Hills Hotel Lisboa");
    expect(envelope.data?.next_tool_call?.arguments?.time_from).toBe("09:00");
    expect(envelope.data?.next_tool_call?.arguments?.cursor?.day_index).toBe(2);
  });

  it("should_return_trip_complete_at_last_stop_of_trip", async () => {
    const tools = registeredTools(createPlacesMcpServer());
    const skeleton = {
      days: [
        {
          day_index: 1,
          day_theme: "贝伦",
          stops: [
            { name: "Hills Hotel Lisboa", kind: "stay" },
            { name: "贝伦塔", kind: "attraction" },
          ],
        },
      ],
    };
    const res = await tools.display_current_stop.handler({
      stop: { name: "贝伦塔", kind: "attraction" },
      time_from: "09:00",
      skeleton,
      cursor: { day_index: 1, stop_index: 1 },
      locale: "CN",
    });
    const envelope = JSON.parse(res.content[0].text) as {
      ok: boolean;
      data: { next_action?: string; next_tool_call?: unknown; host_instructions?: string };
    };
    expect(envelope.ok).toBe(true);
    expect(envelope.data?.next_action).toBe("trip_complete");
    expect(envelope.data?.next_tool_call).toBeUndefined();
    expect(envelope.data?.host_instructions).toMatch(/All stops are now filled/);
  });

  it("should_chain_next_tool_call_display_current_stop_from_plan_next_stop", async () => {
    const planNextStopMod = await import("../core/plan-next-stop");
    const legs = [{ mode: "walk", duration_min: 10, recommended: true }];
    vi.spyOn(planNextStopMod, "planNextStop").mockResolvedValue({
      next_stop: { name: "贝伦塔", location: { lat: 38.69, lng: -9.21, crs: "WGS84" } },
      legs: legs as never,
      transit_outcome: "heuristic",
      single_mode: false,
    });
    const tools = registeredTools(createPlacesMcpServer());
    const skeleton = {
      days: [
        {
          day_index: 1,
          day_theme: "贝伦",
          stops: [
            { name: "Hills Hotel Lisboa", kind: "stay" },
            { name: "热罗尼莫斯修道院", kind: "attraction" },
            { name: "贝伦塔", kind: "attraction" },
          ],
        },
      ],
    };
    const res = await tools.plan_next_stop.handler({
      current_stop: { name: "Hills Hotel Lisboa", kind: "stay" },
      next_stop: { name: "热罗尼莫斯修道院", kind: "attraction" },
      skeleton,
      cursor: { day_index: 1, stop_index: 1 },
      locale: "CN",
    });
    const envelope = JSON.parse(res.content[0].text) as {
      ok: boolean;
      data: {
        next_action?: string;
        next_tool_call?: {
          name?: string;
          arguments?: {
            stop?: { name?: string };
            legs_to_here?: unknown;
            previous_stop?: { name?: string };
            cursor?: { day_index?: number; stop_index?: number };
          };
        };
      };
    };
    expect(envelope.ok).toBe(true);
    expect(envelope.data?.next_action).toBe("display_current_stop");
    expect(envelope.data?.next_tool_call?.name).toBe("display_current_stop");
    expect(envelope.data?.next_tool_call?.arguments?.stop?.name).toBe("热罗尼莫斯修道院");
    expect(envelope.data?.next_tool_call?.arguments?.previous_stop?.name).toBe("Hills Hotel Lisboa");
    expect(envelope.data?.next_tool_call?.arguments?.legs_to_here).toEqual(legs);
    expect(envelope.data?.next_tool_call?.arguments?.cursor).toEqual({ day_index: 1, stop_index: 1 });
    vi.restoreAllMocks();
  });

  it("should_pass_slot_end_as_current_stop_end_time_on_plan_next_stop_chain (TC-M13-53-01)", async () => {
    const tools = registeredTools(createPlacesMcpServer());
    const skeleton = {
      days: [
        {
          day_index: 1,
          day_theme: "贝伦",
          stops: [
            { name: "Hills Hotel Lisboa", kind: "stay" },
            { name: "热罗尼莫斯修道院", kind: "attraction" },
            { name: "贝伦塔", kind: "attraction" },
          ],
        },
      ],
    };
    const stay = await tools.display_current_stop.handler({
      stop: { name: "Hills Hotel Lisboa", kind: "stay" },
      time_from: "09:00",
      skeleton,
      cursor: { day_index: 1, stop_index: 0 },
      locale: "CN",
    });
    const stayEnv = JSON.parse(stay.content[0].text) as {
      data: { slot?: { end?: string }; next_tool_call?: { arguments?: { current_stop?: { end_time?: string } } } };
    };
    expect(stayEnv.data.slot?.end).toBe("09:00");
    expect(stayEnv.data.next_tool_call?.arguments?.current_stop?.end_time).toBe("09:00");

    const planNextStopMod = await import("../core/plan-next-stop");
    const legs = [{ mode: "walk", duration_min: 44, recommended: true }];
    vi.spyOn(planNextStopMod, "planNextStop").mockResolvedValue({
      next_stop: { name: "热罗尼莫斯修道院", location: { lat: 38.69, lng: -9.21, crs: "WGS84" } },
      legs: legs as never,
      transit_outcome: "heuristic",
      single_mode: false,
    });
    const planRes = await tools.plan_next_stop.handler({
      current_stop: { name: "Hills Hotel Lisboa", kind: "stay", end_time: "09:00" },
      next_stop: { name: "热罗尼莫斯修道院", kind: "attraction" },
      skeleton,
      cursor: { day_index: 1, stop_index: 1 },
      locale: "CN",
    });
    const planEnv = JSON.parse(planRes.content[0].text) as {
      data: { next_tool_call?: { arguments?: { previous_stop?: { end_time?: string } } } };
    };
    expect(planEnv.data.next_tool_call?.arguments?.previous_stop?.end_time).toBe("09:00");
    vi.restoreAllMocks();
  });

  it("should_advance_slot_start_when_previous_end_time_and_leg_provided (TC-M13-53-02)", async () => {
    const tools = registeredTools(createPlacesMcpServer());
    const res = await tools.display_current_stop.handler({
      stop: { name: "热罗尼莫斯修道院", kind: "attraction" },
      previous_stop: { name: "Hills Hotel Lisboa", kind: "stay", end_time: "09:00" },
      legs_to_here: [{ mode: "transit", duration_min: 44, recommended: true }],
      locale: "CN",
    });
    const envelope = JSON.parse(res.content[0].text) as {
      data: { slot?: { start?: string; end?: string } };
    };
    expect(envelope.data.slot?.start).toBe("09:44");
    expect(envelope.data.slot?.end).toBe("11:14");
  });

  it("should_include_validation_detail_when_make_itinerary_fails (TC-M13-58-01)", async () => {
    const makeItineraryMod = await import("../core/make-itinerary");
    vi.spyOn(makeItineraryMod, "makeItinerary").mockRejectedValue(
      new Error("make_itinerary: skeleton validation failed — day 1 has 8 attraction stops > pace limit 6"),
    );
    const tools = registeredTools(createPlacesMcpServer());
    const res = await tools.make_itinerary.handler({
      city: "Shanghai",
      numDays: 3,
      locale: "CN",
      candidates: { places: [], restaurants: [] },
    });
    const envelope = JSON.parse(res.content[0].text) as {
      ok: boolean;
      data?: { detail?: string; host_instructions?: string };
    };
    expect(envelope.ok).toBe(false);
    expect(envelope.data?.detail).toMatch(/pace limit/);
    expect(envelope.data?.host_instructions).toMatch(/Do not invent/);
    vi.restoreAllMocks();
  });
});
