import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createPlacesMcpServer } from "../src/mcp/create-server";
import { AGENT_ID } from "../src/core/locales";

async function connectedClient() {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createPlacesMcpServer();
  const client = new Client({ name: "test-client", version: "0.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { client, server };
}

describe("MCP tools", () => {
  it("should_advertise_places-agent_on_initialize", async () => {
    const { client, server } = await connectedClient();
    expect(client.getServerVersion()?.name).toBe(AGENT_ID);
    await client.close();
    await server.close();
  });

  it("should_name_every_tool_description_as_places-agent", async () => {
    const { client, server } = await connectedClient();
    const listed = await client.listTools();
    expect(listed.tools.length).toBeGreaterThan(0);
    for (const tool of listed.tools) {
      expect(tool.description, tool.name).toMatch(/places-agent/);
    }
    await client.close();
    await server.close();
  });

  it("TC-M6-P0-04: should_advertise_mutual_exclusion_and_no_photo_echo_in_descriptions", async () => {
    const { client, server } = await connectedClient();
    const listed = await client.listTools();
    const byName = Object.fromEntries(
      listed.tools.map((t) => [t.name, t.description ?? ""]),
    );

    expect(byName.discover_places).toMatch(/plan_itinerary/i);
    expect(byName.discover_places).toMatch(/do not|never|互斥|勿/i);

    expect(byName.arrange_day).toMatch(/photos|hours/i);
    expect(byName.arrange_day).toMatch(/strip|do not (echo|pass|re-?send)|勿|禁/i);

    expect(byName.plan_itinerary).toMatch(/discover|arrange/i);
    expect(byName.plan_itinerary).toMatch(/do not|never|slow|勿|互斥/i);

    expect(byName.search_restaurants).toMatch(/discover_places|not a substitute|not substitute/i);
    expect(byName.search_places).toMatch(/discover_places|not a substitute|not substitute/i);

    await client.close();
    await server.close();
  });

  it("TC-M6-P0-01: should_accept_arrange_day_when_date_is_null", async () => {
    const { client, server } = await connectedClient();
    const result = await client.callTool({
      name: "arrange_day",
      arguments: {
        candidates: {
          places: [
            {
              provider: "GOOGLE_MAPS",
              name: "上海博物馆",
              category: "museum",
              rating: 4.5,
              location: { lat: 31.23, lng: 121.47, crs: "WGS84" },
              sources: [],
            },
          ],
          restaurants: [],
        },
        dayIndex: 1,
        date: null,
        locale: "CN",
      },
    });
    // Schema must accept null; fixture LLM may still fail — assert not input-validation -32602
    expect(result).not.toMatchObject({
      content: expect.arrayContaining([
        expect.objectContaining({ text: expect.stringMatching(/-32602|invalid_type|Expected string/) }),
      ]),
    });
    const isError = Boolean((result as { isError?: boolean }).isError);
    if (isError) {
      const text = (result.content as { type: string; text?: string }[])
        .filter((p) => p.type === "text")
        .map((p) => p.text ?? "")
        .join("");
      expect(text).not.toMatch(/Invalid arguments|date.*null|Expected string, received null/i);
    }
    await client.close();
    await server.close();
  });

  it("TC-M8-M35-01: should_advertise_mcp_always_agent_not_host_default", async () => {
    const { client, server } = await connectedClient();
    const listed = await client.listTools();
    const arrange = listed.tools.find((t) => t.name === "arrange_day");
    expect(arrange?.description).toMatch(/always.*agent|MCP always/i);
    expect(arrange?.description).toMatch(/Do not pass execution=host on MCP/i);
    await client.close();
    await server.close();
  });

  it("should_list_unprefixed_mvp_tools", async () => {
    const { client, server } = await connectedClient();
    const listed = await client.listTools();
    const names = listed.tools.map((tool) => tool.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "search_restaurants",
        "search_places",
        "plan_itinerary",
        "trip_plan",
        "trips",
        "get_place_details",
        "geocode",
        "visa_requirement",
        "discover_places",
        "arrange_day",
        "make_itinerary",
        "plan_next_stop",
        "display_current_stop",
        "travel_tips",
      ]),
    );
    expect(names).not.toContain("navigate");
    await client.close();
    await server.close();
  });

  it("should_return_same_search_meaning_as_http_core", async () => {
    const { client, server } = await connectedClient();
    const result = await client.callTool({
      name: "search_restaurants",
      arguments: { query: "Yat", providers: ["GOOGLE_MAPS"], locale: "EN" },
    });
    const text = (result.content as { type: string; text?: string }[])
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("");
    const envelope = JSON.parse(text) as {
      agent: string;
      ok: boolean;
      data: { name: string }[];
    };
    expect(envelope.agent).toBe(AGENT_ID);
    expect(envelope.ok).toBe(true);
    expect(envelope.data[0]?.name).toContain("Yat Lok");
    await client.close();
    await server.close();
  });

  it("should_return_same_place_search_meaning_as_http_core", async () => {
    const { client, server } = await connectedClient();
    const result = await client.callTool({
      name: "search_places",
      arguments: { query: "museum", providers: ["GOOGLE_MAPS"], locale: "EN" },
    });
    const text = (result.content as { type: string; text?: string }[])
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("");
    const envelope = JSON.parse(text) as {
      agent: string;
      ok: boolean;
      data: { category?: string }[];
    };
    expect(envelope.agent).toBe(AGENT_ID);
    expect(envelope.ok).toBe(true);
    expect(envelope.data.length).toBeGreaterThan(0);
    expect(envelope.data[0]?.category).not.toBe("restaurant");
    await client.close();
    await server.close();
  });

  it("TC-M11-48-09: should_call_visa_requirement_with_same_shape_as_http", async () => {
    const { client, server } = await connectedClient();
    const result = await client.callTool({
      name: "visa_requirement",
      arguments: { passport: "CHN", destination: "SGP", locale: "EN" },
    });
    const text = (result.content as { type: string; text?: string }[])
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("");
    const envelope = JSON.parse(text) as {
      agent: string;
      ok: boolean;
      data: { requirement: string; visa_free_days: number | null };
    };
    expect(envelope.agent).toBe(AGENT_ID);
    expect(envelope.ok).toBe(true);
    expect(envelope.data.requirement).toBe("visa_free");
    expect(envelope.data.visa_free_days).toBe(30);
    await client.close();
    await server.close();
  });
});
