/**
 * MCP public surface (ADR-076): only `plan_trip` + `fetch_trip_details`.
 * Search / geocode / visa / discover / make / fill remain on HTTP `/v1` for BFFs.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { AGENT_ID, parseLocale, type Locale } from "../core/locales";
import { planTrip } from "../core/plan-trip";
import { errorEnvelope, type Envelope } from "../http/envelope";
import { localeSchema, providerIdSchema } from "../http/schemas";
import type { FetchTripFields } from "../core/trip-types";
import { TripStoreError } from "../core/trip-dual-write";
import {
  fetchTripDetails,
  FETCH_TRIP_HOST_INSTRUCTIONS_ON_MISS,
} from "../core/fetch-trip-details";

function tripStoreErrorResult(err: unknown, locale: Locale): Envelope | null {
  if (!(err instanceof TripStoreError)) return null;
  return errorEnvelope(err.key, locale, [], {
    data: { host_instructions: FETCH_TRIP_HOST_INSTRUCTIONS_ON_MISS },
  });
}

function jsonResult(envelope: Envelope) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(envelope) }],
    isError: envelope.ok === false,
  };
}

const sharedShape = {
  providers: z.array(providerIdSchema).optional(),
  locale: localeSchema.optional(),
  locales: z.array(localeSchema).optional(),
  trip_id: z.string().min(1).optional(),
  revision: z.number().int().positive().optional(),
};

/** Public MCP tool names (ADR-076). */
export const MCP_PUBLIC_TOOLS = ["plan_trip", "fetch_trip_details"] as const;

export type CreatePlacesMcpOptions = {
  /** Bearer key id from authenticateCaller — isolates Trip rows (ADR-046). */
  callerKey?: string;
};

export function createPlacesMcpServer(opts: CreatePlacesMcpOptions = {}): McpServer {
  const callerKey = opts.callerKey ?? "anonymous";
  const server = new McpServer({
    name: AGENT_ID,
    version: "0.1.0",
  });

  server.registerTool(
    "fetch_trip_details",
    {
      description:
        "places-agent (MVP-16): Read slices of a stored trip by trip_id + fields[]. " +
        "Use after plan_trip returns trip_id. fields may include " +
        "constraints, candidates, skeleton, cursor, filled, artifacts, day (with day_index). " +
        "Do not invent itinerary content when trip_not_found.",
      inputSchema: {
        trip_id: z.string().min(1),
        fields: z.array(z.string().min(1)).min(1).default(["skeleton"]),
        day_index: z.number().int().positive().optional(),
        providers: sharedShape.providers,
        locale: sharedShape.locale,
        locales: sharedShape.locales,
        revision: sharedShape.revision,
      },
    },
    async (args) => {
      try {
        const result = await fetchTripDetails({
          callerKey,
          trip_id: args.trip_id,
          fields: args.fields as FetchTripFields,
          day_index: args.day_index,
        });
        return jsonResult({
          agent: AGENT_ID,
          ok: true,
          data: result,
        });
      } catch (err) {
        const fail = tripStoreErrorResult(err, args.locale ?? "EN");
        if (fail) return jsonResult(fail);
        return jsonResult(
          errorEnvelope("errors.provider_failed", args.locale ?? "EN", [], {
            data: { detail: err instanceof Error ? err.message : String(err) },
          }),
        );
      }
    },
  );

  server.registerTool(
    "plan_trip",
    {
      description:
        "places-agent: True-agent trip planner. Call when the user wants to arrange a trip / N-day itinerary / plan a trip. " +
        "Pass city (omit providers[]). With city only → status=needs_input + must-see chips (fetch candidates). " +
        "With numDays + origin (+ optional pace/budget/transit_preference/trip_type/bounds/must_include) → full loop: " +
        "intake → origin stay card → skeleton → fill all stops → travel tips; status=ready; response includes itinerary. " +
        "Do not invent place names. Prefer this tool for new trips (legacy discover/make/fill MCP tools are not registered).",
      inputSchema: {
        city: z.string().min(1),
        numDays: z.number().int().positive().max(14).optional(),
        origin: z
          .object({
            name: z.string().min(1),
            lat: z.number().optional(),
            lng: z.number().optional(),
          })
          .optional(),
        pace: z.enum(["tight", "medium", "relaxed"]).optional(),
        budget: z.enum(["budget", "premium"]).optional(),
        transit_preference: z.string().min(1).optional(),
        trip_type: z.string().min(1).optional(),
        bounds: z
          .object({
            start: z.string().min(1),
            end: z.string().min(1),
          })
          .optional(),
        must_include: z.array(z.string().min(1)).optional(),
        trip_id: sharedShape.trip_id,
        revision: sharedShape.revision,
        providers: sharedShape.providers,
        locale: sharedShape.locale,
        locales: sharedShape.locales,
      },
    },
    async (args) => {
      try {
        const result = await planTrip({
          callerKey,
          city: args.city,
          locale: parseLocale(args.locale),
          trip_id: args.trip_id,
          revision: args.revision,
          numDays: args.numDays,
          origin: args.origin,
          pace: args.pace,
          budget: args.budget,
          transit_preference: args.transit_preference,
          trip_type: args.trip_type,
          bounds: args.bounds,
          must_include: args.must_include,
        });
        if (result.status === "failed") {
          return jsonResult(
            errorEnvelope("errors.provider_failed", args.locale ?? "EN", [], { data: result }),
          );
        }
        return jsonResult({
          agent: AGENT_ID,
          ok: true,
          data: result,
        });
      } catch (err) {
        const fail = tripStoreErrorResult(err, args.locale ?? "EN");
        if (fail) return jsonResult(fail);
        return jsonResult(
          errorEnvelope("errors.provider_failed", args.locale ?? "EN", [], {
            data: { detail: err instanceof Error ? err.message : String(err) },
          }),
        );
      }
    },
  );

  return server;
}
