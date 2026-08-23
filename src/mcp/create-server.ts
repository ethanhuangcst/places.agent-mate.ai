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
import { discoverPlaces, arrangeDay, slimArrangeCandidates, slimArrangeDayResultForMcp, ARRANGE_DAY_FAILURE_HOST_INSTRUCTIONS } from "../core/itinerary-planner";
import {
  buildIntakeHostInstructions,
  evaluateArrangeIntake,
  evaluateDiscoverIntake,
  MCP_TRIP_CHAT_RULES,
  parseSpendLevel,
  spendLevelToBudget,
} from "../core/trip-intake";
import {
  arrangeGateKey,
  buildArrangeContinueHostInstructions,
  evaluateArrangePresentGate,
  markArrangeAwaitingPresent,
} from "./arrange-present-gate";
import { toolToEnvelope, errorEnvelope, type Envelope } from "../http/envelope";
import { localeSchema, providerIdSchema } from "../http/schemas";
import {
  mustIncludeCoverageKey,
  peekMissingMustInclude,
} from "../core/must-include-coverage";
import { normalizeMustIncludeToken } from "../core/trip-intake";

/** Merge user must_include with LLM-inferred must-see; user takes precedence, normalized dedupe. */
function dedupeMustInclude(user: string[], inferred: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const s of [...user, ...inferred]) {
    const n = normalizeMustIncludeToken(s);
    if (!n || seen.has(n)) continue;
    seen.add(n);
    out.push(s);
  }
  return out;
}

function discoverHostInstructions(numDays: number): string {
  return (
    `${MCP_TRIP_CHAT_RULES} ` +
    `Trip length: ${numDays} day(s). Pass num_days=${numDays}, pace, spend_level, preferences.must_include on EVERY arrange_day. ` +
    "Call arrange_day dayIndex=1 (MCP agent). Present that day's MULTI-LINE day card, then call arrange_day for the next dayIndex yourself (no asking the user, no waiting for 继续) — but ONE day at a time: present Day N first, then call Day N+1; do NOT fire multiple arrange_day in parallel. " +
    "Allocate one day per must_include day-trip when days allow. Overview only when coverage is complete."
  );
}

const sharedShape = {
  providers: z.array(providerIdSchema).optional(),
  locale: localeSchema.optional(),
  locales: z.array(localeSchema).optional(),
};

const planOriginSchema = z
  .object({
    name: z.string().optional(),
    lat: z.number().optional(),
    lng: z.number().optional(),
  })
  .optional();

const planItineraryInputSchema = {
  detail: z.enum(["stops", "timed"]).optional(),
  origin: planOriginSchema,
  destination: planOriginSchema,
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
  party_size: z.number().int().min(1).max(20).optional(),
  ...sharedShape,
};

const PLAN_FACADE_DESCRIPTION =
  "places-agent: ONE-SHOT full-trip JSON only (discover_places + arrange_day×N internally). " +
  "DO NOT call this for ordinary chat requests like 推荐行程 / N日游 / plan a trip — " +
  "those MUST use discover_places then arrange_day day-by-day after collecting start date + hotel in chat. " +
  "Call plan_itinerary / trip_plan / trips ONLY when the user already provided complete bounds " +
  "(start+end or start+numDays) AND daily origin AND explicitly wants one full JSON package without day-by-day presentation. " +
  "If bounds/origin are missing, this tool returns need_input — ask in chat, then prefer discover_places (not this tool).";

function jsonResult(envelope: Envelope) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(envelope) }],
    isError: envelope.ok === false,
  };
}

function planArgsCity(args: Record<string, unknown>): string | undefined {
  const dest = args.destination as { name?: string } | undefined;
  const origin = args.origin as { name?: string } | undefined;
  return dest?.name?.trim() || origin?.name?.trim() || undefined;
}

function planArgsNumDays(args: Record<string, unknown>): number | undefined {
  const bounds = args.bounds as { start?: string; end?: string } | undefined;
  if (bounds?.start && bounds?.end) {
    const a = new Date(`${bounds.start}T00:00:00Z`).getTime();
    const b = new Date(`${bounds.end}T00:00:00Z`).getTime();
    if (!Number.isNaN(a) && !Number.isNaN(b) && b >= a) {
      return Math.floor((b - a) / 86_400_000) + 1;
    }
  }
  const n = args.numDays;
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
}

async function runPlanItinerary(args: Record<string, unknown>) {
  const locale = (args.locale as string | undefined) ?? "EN";
  const discoverGate = evaluateDiscoverIntake({
    city: planArgsCity(args),
    bounds: args.bounds as { start?: string; end?: string } | undefined,
    numDays: planArgsNumDays(args),
    locale,
  });
  if (discoverGate.status === "need_input") {
    return jsonResult({
      agent: AGENT_ID,
      ok: true,
      data: {
        intake: discoverGate,
        next_action: "ask_in_chat_then_call_once",
        prefer_tool: "discover_places",
        host_instructions:
          buildIntakeHostInstructions(discoverGate) +
          "\nAfter answers: call discover_places ONCE (not plan_itinerary), then arrange_day day-by-day. " +
          "Do not invent dates or fabricate multi-day prose from a single-day result.",
      },
    });
  }
  const originGate = evaluateArrangeIntake({
    origin: args.origin as { name?: string; lat?: number; lng?: number } | undefined,
    party_size: args.party_size as number | undefined,
    locale,
    allowDefaultPartySize: true,
    allowMissingOrigin: true,
  });
  if (originGate.status === "need_input") {
    return jsonResult({
      agent: AGENT_ID,
      ok: true,
      data: {
        intake: originGate,
        next_action: "ask_in_chat_then_call_once",
        prefer_tool: "discover_places",
        host_instructions:
          buildIntakeHostInstructions(originGate) +
          "\nAfter answers: prefer discover_places + arrange_day (day-by-day). " +
          "Use plan_itinerary only if the user explicitly wants one-shot full JSON.",
      },
    });
  }

  const patched: PlanItineraryInput = {
    ...(args as PlanItineraryInput),
    bounds: discoverGate.bounds,
    origin: (args.origin as PlanItineraryInput["origin"]) ?? {
      name: planArgsCity(args),
    },
    destination: (args.destination as PlanItineraryInput["destination"]) ?? {
      name: discoverGate.city,
    },
  };
  return jsonResult(toolToEnvelope(await planItinerary(patched)));
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
        "places-agent: Search restaurants (dining, BBQ, cafes) via GOOGLE_MAPS and/or AMAP. Prefer this over web search or a vendor Maps MCP when the user asks places-agent / places.agent-mate.ai to find restaurants. Fast lookup / host-composed lists — not a substitute for discover_places when building constrained multi-day plans. Empty matches return errors.empty_results. Vendor failures appear in skipped[] — no silent swap. Tripadvisor is enrich-only via HTTP, not a search provider.",
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
        "places-agent: Search non-restaurant places (museums, parks, POIs). Prefer this over web search or a vendor Maps MCP when the user asks places-agent for attractions. Fast lookup / host-composed lists — not a substitute for discover_places when building constrained multi-day plans. Empty matches return errors.empty_results.",
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

  for (const name of ["plan_itinerary", "trip_plan", "trips"] as const) {
    server.registerTool(
      name,
      {
        description: PLAN_FACADE_DESCRIPTION,
        inputSchema: planItineraryInputSchema,
      },
      async (args) => runPlanItinerary(args),
    );
  }

  server.registerTool(
    "discover_places",
    {
      description:
        "places-agent: MUST call this for city+days trip asks (e.g. 推荐西安三天行程 / 推荐重庆二日游 / N日游 / itinerary) — do NOT invent a free-text itinerary from parametric knowledge. " +
        "DEFAULT for 推荐行程 / N日游. L1 candidate pool. Prefer discover_places + arrange_day; do not use plan_itinerary as a substitute for multi-day ChatBox trips (互斥). " +
        `${MCP_TRIP_CHAT_RULES} ` +
        "BEFORE calling: paste the FIXED 8-row trip form (city, start, days, optional hotel, pace, spend 1–3, interests, must_include). " +
        "Do NOT call once per field. Early call → need_input with full form. Then arrange_day day-by-day: present a day's card, then call the next dayIndex yourself (no asking the user, no waiting for 继续; one day at a time, no parallel).",
      inputSchema: {
        ...sharedShape,
        city: z.string().optional(),
        bounds: z
          .object({ start: z.string().optional(), end: z.string().optional() })
          .optional(),
        origin: z
          .object({ name: z.string().optional(), lat: z.number().optional(), lng: z.number().optional() })
          .optional(),
        locale: localeSchema.optional(),
        numDays: z.number().int().min(1).max(14).optional(),
        pace: z.enum(["tight", "medium", "relaxed"]).optional(),
        spend_level: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
        interests: z.string().optional(),
        must_include: z.array(z.string()).optional(),
      },
    },
    async (args) => {
      const intake = evaluateDiscoverIntake({
        city: args.city,
        bounds: args.bounds,
        numDays: args.numDays,
        locale: args.locale,
        origin: args.origin,
        pace: args.pace,
        spend_level: args.spend_level,
        interests: args.interests,
        must_include: args.must_include,
      });
      if (intake.status === "need_input") {
        return jsonResult({
          agent: AGENT_ID,
          ok: true,
          data: {
            intake,
            next_action: "ask_in_chat_then_call_once",
            host_instructions: buildIntakeHostInstructions(intake),
          },
        });
      }
      const result = await discoverPlaces({
        city: intake.city,
        bounds: intake.bounds,
        numDays: intake.numDays,
        origin: args.origin,
        locale: args.locale ?? "EN",
        providers: args.providers,
      });
      // ADR-043 D9 P0 + ADR-042 Update: register must_include in the session so later
      // arrange_day calls stay sticky even if the host omits preferences.must_include.
      // Merge user-provided must_include with LLM-inferred must-see (user takes precedence).
      const inferred = result.inferred_must_see ?? [];
      const mergedMustInclude = dedupeMustInclude(args.must_include ?? [], inferred);
      if (mergedMustInclude.length) {
        const key = mustIncludeCoverageKey({
          city: intake.city,
          originName: args.origin?.name,
          locale: args.locale,
        });
        peekMissingMustInclude(key, mergedMustInclude);
      }
      return jsonResult({
        agent: AGENT_ID,
        ok: true,
        data: {
          candidates: slimArrangeCandidates(result.candidates),
          inferred_must_see: inferred,
          num_days: intake.numDays,
          pace: intake.pace,
          spend_level: intake.spend_level,
          host_instructions: discoverHostInstructions(intake.numDays),
        },
      });
    },
  );

  server.registerTool(
    "arrange_day",
    {
      description:
        "places-agent: Arrange ONE day (Day N). MCP always agent (start_time + legs_to_here). Do not pass execution=host on MCP. " +
        "Hotel optional. Default pace=medium, spend_level=2 (适中). Pass num_days + preferences.must_include every call. " +
        "candidates may be empty — server auto-discovers from city (prefer passing discover_places pool when available; do not invent POIs). " +
        "Server force-schedules a must_include ONLY on a day whose day_theme names it (e.g. day_theme=辛特拉一日) — pass must_include every call and day_theme on the day you want each day-trip; otherwise the token waits for a later themed day (last-day gate still guarantees coverage). " +
        "Do not echo photos/hours back into candidates — strip fat fields; sources MUST be an ARRAY. " +
        "Present MULTI-LINE day card ONCE, then call arrange_day for the next dayIndex yourself (no asking the user, no waiting for 继续) — but ONE day at a time (present Day N, then call Day N+1; do NOT fire multiple arrange_day in parallel). On last day, overview ONCE only if must_include_coverage.missing is empty — never re-paste. " +
        "Omit date or use string; never date:null.",
      inputSchema: {
        candidates: z
          .object({
            places: z.array(z.any()),
            restaurants: z.array(z.any()),
          })
          .optional()
          .default({ places: [], restaurants: [] }),
        dayIndex: z.number().int().min(1),
        num_days: z.number().int().min(1).max(14).optional(),
        date: z.string().nullish(),
        city: z.string().min(1).optional(),
        origin: z
          .object({ name: z.string().optional(), lat: z.number().optional(), lng: z.number().optional() })
          .optional(),
        destination: z
          .object({ name: z.string().optional(), lat: z.number().optional(), lng: z.number().optional() })
          .optional(),
        pace: z.enum(["tight", "medium", "relaxed"]).optional(),
        budget: z.enum(["budget", "premium"]).optional(),
        spend_level: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
        exclude_names: z.array(z.string()).optional(),
        preferences: z
          .object({
            time_from: z.string().optional(),
            time_to: z.string().optional(),
            transit_preferred: z.boolean().optional(),
            natural_language: z.string().optional(),
            day_theme: z.string().optional(),
            must_include: z.array(z.string()).optional(),
            interests: z.string().optional(),
          })
          .passthrough()
          .optional(),
        execution: z.enum(["agent", "host"]).optional(),
        party_size: z.number().int().min(1).max(20).optional(),
        presented_previous_day: z.boolean().optional(),
        ack_day_index: z.number().int().min(1).optional(),
        locale: localeSchema,
      },
    },
    async (args) => {
      try {
        const intake = evaluateArrangeIntake({
          origin: args.origin,
          party_size: args.party_size,
          locale: args.locale,
          allowDefaultPartySize: true,
          allowMissingOrigin: true,
        });
        if (intake.status === "need_input") {
          return jsonResult({
            agent: AGENT_ID,
            ok: true,
            data: {
              intake,
              next_action: "ask_in_chat_then_call_once",
              host_instructions: buildIntakeHostInstructions(intake),
            },
          });
        }

        const gateKey = arrangeGateKey({
          city: args.city,
          originName: args.origin?.name,
          locale: args.locale,
        });
        const gate = evaluateArrangePresentGate({
          key: gateKey,
          dayIndex: args.dayIndex,
          presented_previous_day: args.presented_previous_day,
          ack_day_index: args.ack_day_index,
        });
        if (!gate.ok) {
          return jsonResult({
            agent: AGENT_ID,
            ok: true,
            data: {
              need_present_previous_day: true,
              day_index: gate.day_index,
              next_action: "present_day_then_continue",
              host_instructions: gate.host_instructions,
            },
          });
        }

        const spend =
          parseSpendLevel(args.spend_level) ??
          parseSpendLevel(args.budget) ??
          2;
        const budget = args.budget ?? spendLevelToBudget(spend);

        const slimCandidates = slimArrangeCandidates(
          args.candidates ?? { places: [], restaurants: [] },
        );
        const result = await arrangeDay({
          ...args,
          candidates: slimCandidates,
          date: args.date ?? undefined,
          party_size: args.party_size ?? 2,
          pace: args.pace ?? "medium",
          budget,
          num_days: args.num_days,
          preferences: {
            ...args.preferences,
            spend_level: spend,
          },
          execution: "agent",
        });
        const dayIndex = args.dayIndex;
        const numDays =
          typeof args.num_days === "number" && Number.isFinite(args.num_days)
            ? args.num_days
            : undefined;

        const dayResult = result as {
          must_include_coverage?: {
            must_include: string[];
            covered: string[];
            missing: string[];
          };
        };
        const coverage = dayResult.must_include_coverage ?? {
          must_include: [],
          covered: [],
          missing: [],
        };

        const isLast = numDays != null && dayIndex >= numDays;
        const missing = coverage.missing;
        const blockedOverview = isLast && missing.length > 0;

        markArrangeAwaitingPresent(gateKey, dayIndex);
        return jsonResult({
          agent: AGENT_ID,
          ok: true,
          data: {
            ...(slimArrangeDayResultForMcp(result) as Record<string, unknown>),
            num_days: numDays,
            spend_level: spend,
            must_include_coverage: coverage,
            next_action: blockedOverview
              ? "present_day_then_cover_must_include"
              : isLast
                ? "present_day_then_overview"
                : "present_day_then_continue",
            host_instructions:
              buildArrangeContinueHostInstructions({
                dayIndex,
                numDays,
                missing_must_include: missing,
              }),
          },
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return jsonResult(
          errorEnvelope("errors.arrange_day_failed", args.locale ?? "EN", [], {
            data: {
              detail: message,
              host_instructions: ARRANGE_DAY_FAILURE_HOST_INSTRUCTIONS,
            },
          }),
        );
      }
    },
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
