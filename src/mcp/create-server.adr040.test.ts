import { describe, it, expect, vi } from "vitest";
import { createPlacesMcpServer } from "./create-server";
import * as planner from "../core/itinerary-planner";
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
    expect(tools.arrange_day.description).toMatch(/num_days/i);
    expect(tools.arrange_day.description).toMatch(/must_include/i);
    expect(tools.arrange_day.description).toMatch(/ONE day at a time|do NOT fire multiple arrange_day in parallel/i);
    expect(tools.arrange_day.description).toMatch(/force-schedules|auto-search|HARD MUST SCHEDULE/i);
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
    expect(envelope.data.candidates.places[0]?.photos?.length).toBe(1);
    expect(envelope.data.candidates.places[0]?.hours).toBeUndefined();
    expect(envelope.data.host_instructions).toMatch(/num_days=4/);
    expect(envelope.data.host_instructions).toMatch(/must_include/i);
    expect(envelope.data.host_instructions).toMatch(/no asking the user|no waiting for 继续|ONE day at a time|do NOT fire multiple arrange_day in parallel/i);
    expect(envelope.data.host_instructions).toMatch(/MULTI-LINE|8-row|must_include/i);
    expect(envelope.data.host_instructions).not.toMatch(/Sintra|Cascais/i);
    spy.mockRestore();
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

  it("should_route_trip_plan_alias_through_same_planItinerary", async () => {
    const spy = vi.spyOn(itinerary, "planItinerary").mockResolvedValue({
      data: { detail: "timed", days: [] } as never,
      skipped: [],
      locale: "EN",
      locales: ["EN"],
    });
    const tools = registeredTools(createPlacesMcpServer());
    await tools.trip_plan.handler({
      detail: "timed",
      origin: { name: "Lisbon" },
      bounds: { start: "2026-09-01", end: "2026-09-01" },
      locale: "EN",
    });
    expect(spy).toHaveBeenCalledOnce();
    spy.mockRestore();
  });
});
