import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { AGENT_ID } from "../core/locales";
import {
  geocode,
  getPlaceDetails,
  navigate,
  searchRestaurants,
} from "../core/tools";
import { toolToEnvelope, type Envelope } from "../http/envelope";
import { localeSchema } from "../http/schemas";

const sharedShape = {
  providers: z.array(z.string()).optional(),
  locale: localeSchema.optional(),
  locales: z.array(localeSchema).optional(),
};

function jsonResult(envelope: Envelope) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(envelope) }],
    isError: envelope.ok === false,
  };
}

export function createPlacesMcpServer(): McpServer {
  const server = new McpServer({
    name: AGENT_ID,
    version: "0.1.0",
  });

  server.registerTool(
    "search_restaurants",
    {
      description:
        "Search restaurants. Empty matches return errors.empty_results. Vendor failures appear in skipped[] — no silent swap.",
      inputSchema: {
        query: z.string().optional(),
        near: z.object({ lat: z.number(), lng: z.number() }).optional(),
        address: z.string().optional(),
        open_now: z.boolean().optional(),
        cuisine: z.string().optional(),
        merge: z.boolean().optional(),
        ...sharedShape,
      },
    },
    async (args) => jsonResult(toolToEnvelope(await searchRestaurants(args))),
  );

  server.registerTool(
    "get_place_details",
    {
      description:
        "Get one place by vendor native_id. Missing places use errors.place_not_found.",
      inputSchema: {
        provider: z.string(),
        native_id: z.string(),
        ...sharedShape,
      },
    },
    async (args) => jsonResult(toolToEnvelope(await getPlaceDetails(args))),
  );

  server.registerTool(
    "geocode",
    {
      description: "Forward-geocode an address or reverse-geocode lat/lng.",
      inputSchema: {
        query: z.string().optional(),
        lat: z.number().optional(),
        lng: z.number().optional(),
        ...sharedShape,
      },
    },
    async (args) => jsonResult(toolToEnvelope(await geocode(args))),
  );

  server.registerTool(
    "navigate",
    {
      description: "Return secret-free map deeplinks for a place or coordinate.",
      inputSchema: {
        native_id: z.string().optional(),
        name: z.string().optional(),
        lat: z.number().optional(),
        lng: z.number().optional(),
        provider: z.string().optional(),
        ...sharedShape,
      },
    },
    async (args) => jsonResult(toolToEnvelope(await navigate(args))),
  );

  return server;
}
