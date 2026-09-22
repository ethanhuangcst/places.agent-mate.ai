import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createPlacesMcpServer, MCP_PUBLIC_TOOLS } from "../src/mcp/create-server";
import { AGENT_ID } from "../src/core/locales";

async function connectedClient() {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createPlacesMcpServer();
  const client = new Client({ name: "test-client", version: "0.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { client, server };
}

describe("MCP tools (ADR-076 public surface)", () => {
  it("should_advertise_places-agent_on_initialize", async () => {
    const { client, server } = await connectedClient();
    expect(client.getServerVersion()?.name).toBe(AGENT_ID);
    await client.close();
    await server.close();
  });

  it("should_name_every_tool_description_as_places-agent", async () => {
    const { client, server } = await connectedClient();
    const listed = await client.listTools();
    expect(listed.tools.length).toBe(MCP_PUBLIC_TOOLS.length);
    for (const tool of listed.tools) {
      expect(tool.description, tool.name).toMatch(/places-agent/);
    }
    await client.close();
    await server.close();
  });

  it("should_list_only_plan_trip_and_fetch_trip_details", async () => {
    const { client, server } = await connectedClient();
    const listed = await client.listTools();
    const names = listed.tools.map((tool) => tool.name).sort();
    expect(names).toEqual([...MCP_PUBLIC_TOOLS].sort());
    expect(names).not.toContain("arrange_day");
    expect(names).not.toContain("discover_places");
    expect(names).not.toContain("make_itinerary");
    expect(names).not.toContain("search_restaurants");
    await client.close();
    await server.close();
  });

  it("should_accept_fetch_trip_details_call", async () => {
    const { client, server } = await connectedClient();
    const result = await client.callTool({
      name: "fetch_trip_details",
      arguments: { trip_id: "missing-trip", fields: ["skeleton"], locale: "EN" },
    });
    const text = (result.content as { type: string; text?: string }[])
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("");
    const envelope = JSON.parse(text) as { agent?: string; ok?: boolean; outcome?: { key?: string } };
    expect(envelope.agent).toBe(AGENT_ID);
    // Missing trip returns structured error — not a protocol failure.
    expect(typeof envelope.ok).toBe("boolean");
    await client.close();
    await server.close();
  });
});
