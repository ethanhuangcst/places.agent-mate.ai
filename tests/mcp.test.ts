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

  it("should_list_unprefixed_mvp_tools", async () => {
    const { client, server } = await connectedClient();
    const listed = await client.listTools();
    const names = listed.tools.map((tool) => tool.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "search_restaurants",
        "get_place_details",
        "geocode",
        "navigate",
      ]),
    );
    expect(names).not.toContain("search_places");
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
});
