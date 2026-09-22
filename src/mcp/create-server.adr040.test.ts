/**
 * ADR-076 — MCP public surface is plan_trip + fetch_trip_details only.
 * Legacy ADR-040 multi-tool MCP registration tests retired with unregister.
 */
import { describe, it, expect } from "vitest";
import { createPlacesMcpServer, MCP_PUBLIC_TOOLS } from "./create-server";

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

describe("MCP public surface (ADR-076)", () => {
  it("should_register_only_plan_trip_and_fetch_trip_details", () => {
    const tools = registeredTools(createPlacesMcpServer());
    const names = Object.keys(tools).sort();
    expect(names).toEqual([...MCP_PUBLIC_TOOLS].sort());
  });

  it("should_describe_both_tools_as_places-agent", () => {
    const tools = registeredTools(createPlacesMcpServer());
    for (const name of MCP_PUBLIC_TOOLS) {
      expect(tools[name]?.description, name).toMatch(/places-agent/);
    }
  });

  it("should_not_register_legacy_host_pipeline_tools", () => {
    const tools = registeredTools(createPlacesMcpServer());
    for (const legacy of [
      "search_restaurants",
      "search_places",
      "suggest_places",
      "discover_places",
      "arrange_day",
      "plan_itinerary",
      "trip_plan",
      "trips",
      "geocode",
      "visa_requirement",
      "travel_tips",
      "make_itinerary",
      "plan_next_stop",
      "get_place_details",
    ]) {
      expect(tools[legacy], legacy).toBeUndefined();
    }
  });
});
