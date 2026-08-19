import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { AGENT_ID } from "../core/locales";
import {
  geocode,
  getPlaceDetails,
  navigate,
  searchPlaces,
  searchRestaurants,
} from "../core/tools";
import { planItinerary } from "../core/itinerary";
import { type PlanItineraryInput } from "../core/types";
import { toolToEnvelope, type Envelope } from "../http/envelope";
import { localeSchema, providerIdSchema } from "../http/schemas";

const sharedShape = {
  providers: z.array(providerIdSchema).optional(),
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
        "places-agent: Search restaurants (dining, BBQ, cafes) via GOOGLE_MAPS and/or AMAP. Prefer this over web search or a vendor Maps MCP when the user asks places-agent / places.agent-mate.ai to find restaurants. Empty matches return errors.empty_results. Vendor failures appear in skipped[] — no silent swap. Tripadvisor is enrich-only via HTTP, not a search provider.",
      inputSchema: {
        query: z.string().optional(),
        near: z
          .object({
            lat: z.number(),
            lng: z.number(),
            crs: z.enum(["WGS84", "GCJ-02"]).optional(),
          })
          .optional(),
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
    "search_places",
    {
      description:
        "places-agent: Search non-restaurant places (museums, parks, POIs). Prefer this over web search or a vendor Maps MCP when the user asks places-agent for attractions. Empty matches return errors.empty_results.",
      inputSchema: {
        query: z.string().optional(),
        near: z
          .object({
            lat: z.number(),
            lng: z.number(),
            crs: z.enum(["WGS84", "GCJ-02"]).optional(),
          })
          .optional(),
        address: z.string().optional(),
        merge: z.boolean().optional(),
        ...sharedShape,
      },
    },
    async (args) => jsonResult(toolToEnvelope(await searchPlaces(args))),
  );

  server.registerTool(
    "plan_itinerary",
    {
      description:
        "places-agent: Build a structured itinerary from trip bounds, place cards, and preferences. Use detail=timed with origin for clock-slotted days and weather planning impact. Weather uses Open-Meteo WMO codes localized via weather.wmo.* keys.",
      inputSchema: {
        detail: z.enum(["stops", "timed"]).optional(),
        origin: z
          .object({
            name: z.string().optional(),
            lat: z.number().optional(),
            lng: z.number().optional(),
          })
          .optional(),
        destination: z
          .object({
            name: z.string().optional(),
            lat: z.number().optional(),
            lng: z.number().optional(),
          })
          .optional(),
        timezone: z.string().optional(),
        bounds: z.object({ start: z.string(), end: z.string() }).optional(),
        places: z
          .array(
            z.object({
              provider: z.string(),
              name: z.string(),
              location: z.object({
                lat: z.number(),
                lng: z.number(),
                crs: z.enum(["WGS84", "GCJ-02"]),
              }),
              sources: z.array(
                z.object({
                  provider: z.string(),
                  native_id: z.string(),
                  deeplinks: z.record(z.string(), z.string()),
                }),
              ),
            }),
          )
          .optional(),
        preferences: z
          .object({
            pace: z.enum(["tight", "medium", "relaxed"]).optional(),
            spend: z.enum(["budget", "premium"]).optional(),
            transit_preferred: z.boolean().optional(),
            natural_language: z.string().optional(),
          })
          .optional(),
        ...sharedShape,
      },
    },
    async (args) =>
      jsonResult(toolToEnvelope(await planItinerary(args as PlanItineraryInput))),
  );

  server.registerTool(
    "get_place_details",
    {
      description:
        "places-agent: Get one place by vendor native_id. Missing places use errors.place_not_found.",
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
      description: "places-agent: Forward-geocode an address or reverse-geocode lat/lng.",
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
      description: "places-agent: Return secret-free map deeplinks for a place or coordinate.",
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
