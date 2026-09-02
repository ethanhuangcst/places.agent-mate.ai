import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { AGENT_ID, parseLocale, type Locale } from "../core/locales";
import {
  geocode,
  getPlaceDetails,
  searchPlaces,
  searchRestaurants,
} from "../core/tools";
import { discoverPlaces, arrangeDay, slimArrangeCandidates, slimArrangeDayResultForMcp, ARRANGE_DAY_FAILURE_HOST_INSTRUCTIONS } from "../core/itinerary-planner";
import {
  buildIntakeHostInstructions,
  evaluateArrangeIntake,
  evaluateDiscoverIntake,
  MCP_TRIP_CHAT_RULES,
  MCP_NO_INVENT_RULE,
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
import { makeItinerary, createSkeletonChatCreate } from "../core/make-itinerary";
import { displayCurrentStop, planNextStop } from "../core/plan-next-stop";
import { visaRequirement } from "../core/visa-requirement";
import { travelTips, TravelTipsTimeoutError } from "../core/travel-tips";
import {
  mustIncludeCoverageKey,
  peekMissingMustInclude,
} from "../core/must-include-coverage";
import { mergeMustInclude } from "../core/must-include-merge";

function discoverHostInstructions(numDays: number): string {
  return (
    `${MCP_TRIP_CHAT_RULES} ` +
    `Trip length: ${numDays} day(s). Next: call make_itinerary ONCE with numDays=${numDays}, origin, pace, budget, must_include, ` +
    "and the candidates pool from this response (pass places; restaurants may be omitted — server fills dining if empty; do not echo photos). " +
    "After make_itinerary succeeds, IMMEDIATELY call display_current_stop for Day 1 stay (see next_tool_call). " +
    "Do not call travel_tips or write a 详细版 from knowledge. " +
    "Do NOT call arrange_day for this trip — arrange_day is LEGACY. " +
    MCP_NO_INVENT_RULE
  );
}

const MCP_SKELETON_HOST_INSTRUCTIONS =
  "REQUIRED NEXT TOOL: execute next_tool_call (display_current_stop for Day 1 first stay, time_from=09:00) immediately. " +
  "Pass skeleton and cursor exactly as provided in next_tool_call.arguments. Candidates may be omitted — pass stop name only. " +
  "Then keep executing each returned next_tool_call (plan_next_stop → display_current_stop) without stopping, " +
  "until next_action is trip_complete. Present each tool-filled stop (card + transit + times) as you go. " +
  "FORBIDDEN until fill tools have run: travel_tips, offering 详细版/优化版 menus, " +
  "or writing a timetable from your own knowledge. Do NOT stop after one stop. " +
  "arrange_day is LEGACY. " +
  MCP_NO_INVENT_RULE;

const MCP_FILL_CONTINUE_HOST_INSTRUCTIONS =
  "Execute next_tool_call immediately — do not stop, do not summarize, do not call travel_tips, do not offer 详细版. " +
  "Pass skeleton and cursor exactly as provided in next_tool_call.arguments. " +
  "Continue the chain until next_action is trip_complete. " +
  MCP_NO_INVENT_RULE;

const MCP_TRIP_COMPLETE_HOST_INSTRUCTIONS =
  "All stops are now filled. Present the complete itinerary (day-by-day cards with times and transit) to the user. " +
  "Do not call any more fill tools. Do not invent extra stops or times. " +
  MCP_NO_INVENT_RULE;

type SkeletonEchoStop = { name: string; kind: string; meal_slot?: string };
type SkeletonEchoDay = { day_index: number; day_theme?: string; stops: SkeletonEchoStop[] };
type SkeletonEcho = { days: SkeletonEchoDay[] };
type FillCursor = { day_index: number; stop_index: number };

function slimStop(s: { name: string; kind?: string; meal_slot?: string }): SkeletonEchoStop {
  const out: SkeletonEchoStop = { name: s.name, kind: s.kind ?? "attraction" };
  if (s.meal_slot) out.meal_slot = s.meal_slot;
  return out;
}

function stayRoleForFillStop(
  stop: { kind?: string },
  cursor: FillCursor,
): "day_origin" | "return" | undefined {
  if (stop.kind !== "stay") return undefined;
  return cursor.stop_index === 0 ? "day_origin" : "return";
}

type FillStop = SkeletonEchoStop & { end_time?: string };

type NextFillStep =
  | {
      next_action: "plan_next_stop";
      next_tool_call: {
        name: "plan_next_stop";
        arguments: {
          current_stop: FillStop;
          next_stop: SkeletonEchoStop;
          skeleton: SkeletonEcho;
          cursor: FillCursor;
          locale: string;
        };
      };
    }
  | {
      next_action: "display_current_stop";
      next_tool_call: {
        name: "display_current_stop";
        arguments: {
          stop: SkeletonEchoStop;
          time_from: "09:00";
          skeleton: SkeletonEcho;
          cursor: FillCursor;
          locale: string;
        };
      };
    }
  | { next_action: "trip_complete"; next_tool_call: undefined };

/**
 * Compute the concrete next tool call after filling the stop at `cursor`.
 * The host only has to execute the returned next_tool_call verbatim; the
 * skeleton + cursor ride along so the agent can drive the whole loop without
 * the host deciding what comes next (which is where it stalled after one stop).
 */
function nextFillStep(
  skeleton: SkeletonEcho,
  cursor: FillCursor,
  locale: string,
  endTime?: string,
  city?: string,
): NextFillStep {
  const day = skeleton.days.find((d) => d.day_index === cursor.day_index);
  if (!day) return { next_action: "trip_complete", next_tool_call: undefined };
  const stops = day.stops;
  if (cursor.stop_index + 1 < stops.length) {
    const current = stops[cursor.stop_index];
    const next = stops[cursor.stop_index + 1];
    const currentStop: FillStop = slimStop(current);
    if (endTime) currentStop.end_time = endTime;
    return {
      next_action: "plan_next_stop",
      next_tool_call: {
        name: "plan_next_stop",
        arguments: {
          current_stop: currentStop,
          next_stop: slimStop(next),
          skeleton,
          cursor: { day_index: cursor.day_index, stop_index: cursor.stop_index + 1 },
          locale,
          ...(city ? { city } : {}),
        },
      },
    };
  }
  // End of day → next day opens at its first stop (the stay), no inbound transit.
  const nextDay = skeleton.days
    .filter((d) => d.day_index > cursor.day_index)
    .sort((a, b) => a.day_index - b.day_index)[0];
  if (nextDay && nextDay.stops.length > 0) {
    return {
      next_action: "display_current_stop",
      next_tool_call: {
        name: "display_current_stop",
        arguments: {
          stop: slimStop(nextDay.stops[0]),
          time_from: "09:00",
          skeleton,
          cursor: { day_index: nextDay.day_index, stop_index: 0 },
          locale,
          ...(city ? { city } : {}),
        },
      },
    };
  }
  return { next_action: "trip_complete", next_tool_call: undefined };
}

function skeletonFillHandoff(
  skeleton: { days?: Array<{ day_index?: number; day_theme?: string; stops?: Array<{ name: string; kind?: string; meal_slot?: string }> }> },
  locale: string,
  city?: string,
): {
  next_action: "display_current_stop";
  prefer_tool: "display_current_stop";
  next_tool_call?: {
    name: "display_current_stop";
    arguments: {
      stop: SkeletonEchoStop;
      time_from: "09:00";
      skeleton: SkeletonEcho;
      cursor: FillCursor;
      locale: string;
    };
  };
  host_instructions: string;
} {
  const day1 = skeleton.days?.find((d) => d.day_index === 1) ?? skeleton.days?.[0];
  const stayIdx = day1?.stops?.findIndex((s) => s.kind === "stay") ?? -1;
  const stay =
    stayIdx >= 0 ? day1?.stops?.[stayIdx] : day1?.stops?.[0];
  const dayIndex = day1?.day_index ?? 1;
  const stopIndex = stayIdx >= 0 ? stayIdx : 0;
  // Rebuild a minimal skeleton echo (names/kinds only) to ride along the chain.
  const echo: SkeletonEcho = {
    days: (skeleton.days ?? []).map((d) => ({
      day_index: d.day_index ?? 0,
      day_theme: d.day_theme,
      stops: (d.stops ?? []).map((s) => slimStop(s)),
    })),
  };
  return {
    next_action: "display_current_stop",
    prefer_tool: "display_current_stop",
    next_tool_call: stay
      ? {
          name: "display_current_stop",
          arguments: {
            stop: slimStop(stay),
            time_from: "09:00",
            skeleton: echo,
            cursor: { day_index: dayIndex, stop_index: stopIndex },
            locale,
            ...(city ? { city } : {}),
          },
        }
      : undefined,
    host_instructions: MCP_SKELETON_HOST_INSTRUCTIONS,
  };
}

function skeletonHasStops(
  skeleton: unknown,
): skeleton is { days: Array<{ day_index?: number; stops?: Array<{ name: string; kind?: string }> }> } {
  if (!skeleton || typeof skeleton !== "object") return false;
  const days = (skeleton as { days?: unknown }).days;
  if (!Array.isArray(days)) return false;
  return days.some((d) => {
    const stops = (d as { stops?: unknown }).stops;
    return Array.isArray(stops) && stops.length > 0;
  });
}

const sharedShape = {
  providers: z.array(providerIdSchema).optional(),
  locale: localeSchema.optional(),
  locales: z.array(localeSchema).optional(),
};

/** Minimal skeleton echo that rides along the fill chain so the agent can
 * compute the next concrete tool call at every step. Names/kinds only. */
const skeletonEchoSchema = z
  .object({
    days: z.array(
      z.object({
        day_index: z.number().int(),
        day_theme: z.string().optional(),
        stops: z.array(
          z.object({
            name: z.string(),
            kind: z.string(),
            meal_slot: z.string().optional(),
          }),
        ),
      }),
    ),
  })
  .optional();

const cursorSchema = z
  .object({
    day_index: z.number().int().min(1),
    stop_index: z.number().int().min(0),
  })
  .optional();

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
  "places-agent: Alias that runs the skeleton flow (discover_places → make_itinerary). " +
  "For ordinary chat 推荐行程 / N日游 / plan a trip: collect the 8-row form, call discover_places, " +
  "then make_itinerary with that candidates pool. DO NOT call arrange_day for new trips — it is LEGACY. " +
  "If bounds are missing, this tool returns need_input — ask in chat, then call discover_places.";

/** Hosts (ChatBox) often omit restaurants or append a truncated leftover string. */
function namedCardsFromHost(raw: unknown): never[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (item): item is never =>
      !!item &&
      typeof item === "object" &&
      typeof (item as { name?: unknown }).name === "string" &&
      (item as { name: string }).name.trim().length > 0,
  );
}

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
  const locale: Locale = parseLocale((args.locale as string | undefined) ?? "EN");
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
          "\nAfter answers: call discover_places ONCE, then make_itinerary with that pool. " +
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
          "\nAfter answers: call discover_places, then make_itinerary with that pool.",
      },
    });
  }

  // ADR-045 §5 / F51 — aliases repoint to the skeleton flow:
  // discover_places → make_itinerary. Returns the stop-order skeleton; the
  // host then fills stops incrementally via plan_next_stop + display_current_stop.
  const numDays = discoverGate.numDays ?? planArgsNumDays(args) ?? 1;
  const origin =
    (args.origin as { name?: string; lat?: number; lng?: number } | undefined) ?? {
      name: discoverGate.city,
    };

  const discover = await discoverPlaces({
    city: discoverGate.city,
    bounds: discoverGate.bounds,
    origin,
    locale,
    numDays,
    providers: args.providers as string[] | undefined,
    must_include: args.must_include as string[] | undefined,
  });

  const skeleton = await makeItinerary(
    {
      city: discoverGate.city,
      numDays,
      candidates: discover.candidates,
      origin,
      pace: args.pace as "tight" | "medium" | "relaxed" | undefined,
      budget: args.budget as "budget" | "premium" | undefined,
      must_include: args.must_include as string[] | undefined,
      natural_language: args.natural_language as string | undefined,
      locale,
    },
    { create: createSkeletonChatCreate() ?? undefined },
  );

  return jsonResult({
    agent: AGENT_ID,
    ok: true,
    data: {
      skeleton: skeleton.skeleton,
      inferred_must_see: discover.inferred_must_see,
      ...skeletonFillHandoff(skeleton.skeleton, locale),
    },
  });
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
        "DEFAULT for 推荐行程 / N日游. L1 candidate pool. After this succeeds, call make_itinerary ONCE with the returned candidates (do not drop the pool; do not pass empty candidates). " +
        "Then execute the returned next_tool_call chain (display_current_stop → plan_next_stop → display_current_stop …) without stopping until trip_complete — do not call travel_tips or write a 详细版. arrange_day is LEGACY — do not use it for new trips. " +
        "plan_itinerary / trip_plan / trips aliases run the same skeleton flow. " +
        `${MCP_TRIP_CHAT_RULES} ` +
        "BEFORE calling: paste the FIXED 8-row trip form (city, start, days, optional hotel, pace, spend 1–3, interests, must_include). " +
        "Do NOT call once per field. Early call → need_input with full form.",
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
        must_include: args.must_include,
      });
      // ADR-043 D9 P0 + ADR-042 Update: register must_include in the session so later
      // arrange_day calls stay sticky even if the host omits preferences.must_include.
      // Merge user-provided must_include with LLM-inferred must-see (user takes precedence).
      const inferred = result.inferred_must_see ?? [];
      const mergedMustInclude = mergeMustInclude(args.must_include ?? [], inferred);
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
          candidates: slimArrangeCandidates(result.candidates, {
            omitPhotos: true,
            compactEcho: true,
          }),
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
        "LEGACY — do NOT use for new trips. Prefer discover_places → make_itinerary → plan_next_stop. " +
        "places-agent: Arrange ONE day (Day N). MCP always agent (start_time + legs_to_here). Do not pass execution=host on MCP. " +
        "Hotel optional. Default pace=medium, spend_level=2 (适中). Pass num_days + preferences.must_include every call. " +
        "candidates may be empty — server auto-discovers from city (prefer passing discover_places pool when available; do not invent POIs). " +
        "Server force-schedules a must_include ONLY on a day whose day_theme names it (e.g. day_theme=地点A一日) — pass must_include every call and day_theme on the day you want each day-trip; otherwise the token waits for a later themed day (last-day gate still guarantees coverage). " +
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
    "visa_requirement",
    {
      description:
        "places-agent: Visa requirement for a passport nationality traveling to a destination country. " +
        "Input ISO 3166-1 alpha-3 passport and destination codes. Returns requirement type, documents, process, " +
        "and official source when available. Data from Orizn — confirm with destination immigration authorities.",
      inputSchema: {
        passport: z.string().min(1),
        destination: z.string().min(1),
        ...sharedShape,
      },
    },
    async (args) => jsonResult(toolToEnvelope(await visaRequirement(args))),
  );

  server.registerTool(
    "travel_tips",
    {
      description:
        "places-agent (MVP-12): Standalone destination tips only — ≤80-char intro + up to 3 iconic places + " +
        "local transit + weather + clothing + safety. NOT a substitute for filling an itinerary. " +
        "After make_itinerary, do NOT call this; use display_current_stop + plan_next_stop. " +
        "Do not use this to write a day-by-day timetable. May be called before any trip tools. " +
        "20s timeout; degrades weather/iconic on failure.",
      inputSchema: {
        destination: z.string().min(1),
        bounds: z.object({ start: z.string(), end: z.string() }).optional(),
        trip_type: z.string().optional(),
        pace: z.enum(["tight", "medium", "relaxed"]).optional(),
        skeleton: z.any().optional(),
        constraints: z.string().optional(),
        pool: z.array(z.string()).optional(),
        ...sharedShape,
      },
    },
    async (args) => {
      if (skeletonHasStops(args.skeleton)) {
        return jsonResult({
          agent: AGENT_ID,
          ok: true,
          data: {
            fill_redirect: true,
            ...skeletonFillHandoff(args.skeleton, args.locale ?? "EN"),
          },
        });
      }
      try {
        const result = await travelTips({
          destination: args.destination,
          bounds: args.bounds,
          trip_type: args.trip_type,
          pace: args.pace,
          skeleton: args.skeleton,
          constraints: args.constraints,
          pool: args.pool,
          locale: args.locale ?? "EN",
          providers: args.providers,
        });
        return jsonResult({ agent: AGENT_ID, ok: true, data: result });
      } catch (err) {
        const key =
          err instanceof TravelTipsTimeoutError
            ? "errors.travel_tips_timeout"
            : "errors.travel_tips_failed";
        return jsonResult(
          errorEnvelope(key, args.locale ?? "EN", [], {
            data: { detail: err instanceof Error ? err.message : String(err) },
          }),
        );
      }
    },
  );

  server.registerTool(
    "make_itinerary",
    {
      description:
        "places-agent (MVP-10 skeleton): Build the multi-day STOP-ORDER skeleton in ONE LLM call — " +
        "days[].day_theme + stops[].{name, kind(stay|attraction|meal), meal_slot} with NO times and NO transit. " +
        "Call AFTER discover_places (pass its candidates pool; stop names must come from it). " +
        "candidates.restaurants may be omitted (defaults to []; server searches dining if empty). Do not echo photos. " +
        "REQUIRED after success: execute the returned next_tool_call (display_current_stop for Day 1 stay), then keep executing each subsequent next_tool_call (plan_next_stop → display_current_stop) without stopping until next_action is trip_complete. Pass skeleton and cursor exactly as provided in next_tool_call.arguments. Do not call travel_tips or write a 详细版 from knowledge. " +
        "MCP returns the full skeleton JSON (streaming events are HTTP-only).",
      inputSchema: {
        city: z.string().min(1),
        numDays: z.number().int().min(1).max(14),
        candidates: z
          .object({
            places: z.array(z.any()).optional().default([]),
            restaurants: z.array(z.any()).optional().default([]),
          })
          .optional()
          .default({ places: [], restaurants: [] }),
        origin: planOriginSchema,
        pace: z.enum(["tight", "medium", "relaxed"]).optional(),
        budget: z.enum(["budget", "premium"]).optional(),
        must_include: z.array(z.string()).optional(),
        natural_language: z.string().optional(),
        ...sharedShape,
      },
    },
    async (args) => {
      try {
        const result = await makeItinerary({
          city: args.city,
          numDays: args.numDays,
          candidates: {
            places: namedCardsFromHost(args.candidates?.places),
            restaurants: namedCardsFromHost(args.candidates?.restaurants),
          },
          origin: args.origin,
          pace: args.pace,
          budget: args.budget,
          must_include: args.must_include,
          natural_language: args.natural_language,
          locale: args.locale ?? "EN",
        }, { create: createSkeletonChatCreate() ?? undefined });
        return jsonResult({
          agent: AGENT_ID,
          ok: true,
          data: {
            skeleton: result.skeleton,
            ...skeletonFillHandoff(result.skeleton, args.locale ?? "EN", args.city),
          },
        });
      } catch (err) {
        return jsonResult(
          errorEnvelope("errors.make_itinerary_failed", args.locale ?? "EN", [], {
            data: {
              detail: err instanceof Error ? err.message : String(err),
              host_instructions:
                "Do not invent an itinerary. Tell the traveler make_itinerary failed (see data.detail). They may reduce days, must_include, or retry.",
            },
          }),
        );
      }
    },
  );

  server.registerTool(
    "plan_next_stop",
    {
      description:
        "places-agent (MVP-10 fill): Serial transit legs current_stop → next_stop (no LLM). " +
        "Name-only stops are geocoded first; pass transit_preference (e.g. 打卡电车/打车) to narrow to that single mode, " +
        "otherwise dual-mode legs (walk/transit/drive) are returned with one recommended. " +
        "Candidates may be omitted (name-only stops are geocoded). Do not echo the discover pool. " +
        "After this, immediately call display_current_stop(next_stop) with the returned legs.",
      inputSchema: {
        current_stop: z.object({
          name: z.string().min(1),
          kind: z.enum(["stay", "attraction", "meal"]).optional(),
          meal_slot: z.enum(["lunch", "afternoon_tea", "dinner"]).optional(),
          lat: z.number().optional(),
          lng: z.number().optional(),
          end_time: z.string().optional(),
        }),
        next_stop: z.object({
          name: z.string().min(1),
          kind: z.enum(["stay", "attraction", "meal"]).optional(),
          meal_slot: z.enum(["lunch", "afternoon_tea", "dinner"]).optional(),
          lat: z.number().optional(),
          lng: z.number().optional(),
        }),
        candidates: z
          .object({
            places: z.array(z.any()),
            restaurants: z.array(z.any()),
          })
          .optional()
          .default({ places: [], restaurants: [] }),
        transit_preference: z.string().optional(),
        city: z.string().optional(),
        skeleton: skeletonEchoSchema,
        cursor: cursorSchema,
        ...sharedShape,
      },
    },
    async (args) => {
      try {
        const anchor =
          typeof args.current_stop.lat === "number" && typeof args.current_stop.lng === "number"
            ? { lat: args.current_stop.lat, lng: args.current_stop.lng, crs: "WGS84" as const }
            : undefined;
        const result = await planNextStop({
          current_stop: args.current_stop,
          next_stop: args.next_stop,
          candidates: {
            places: (args.candidates?.places ?? []) as never[],
            restaurants: (args.candidates?.restaurants ?? []) as never[],
          },
          city: args.city,
          anchor,
          transit_preference: args.transit_preference,
          providers: args.providers,
          locale: args.locale ?? "EN",
        });
        const skeleton = args.skeleton as SkeletonEcho | undefined;
        const cursor = args.cursor as FillCursor | undefined;
        const nextToolCall =
          skeleton && cursor
            ? {
                name: "display_current_stop" as const,
                arguments: {
                  stop: slimStop(args.next_stop),
                  legs_to_here: result.legs,
                  previous_stop: {
                    ...slimStop(args.current_stop),
                    ...(args.current_stop.end_time ? { end_time: args.current_stop.end_time } : {}),
                  },
                  stay_role: stayRoleForFillStop(slimStop(args.next_stop), cursor),
                  skeleton,
                  cursor,
                  locale: args.locale ?? "EN",
                  ...(args.city ? { city: args.city } : {}),
                },
              }
            : undefined;
        return jsonResult({
          agent: AGENT_ID,
          ok: true,
          data: {
            ...result,
            next_action: "display_current_stop",
            ...(nextToolCall ? { next_tool_call: nextToolCall } : {}),
            host_instructions: MCP_FILL_CONTINUE_HOST_INSTRUCTIONS,
          },
        });
      } catch (err) {
        return jsonResult(
          errorEnvelope("errors.provider_failed", args.locale ?? "EN", [], {
            data: { detail: err instanceof Error ? err.message : String(err) },
          }),
        );
      }
    },
  );

  server.registerTool(
    "display_current_stop",
    {
      description:
        "places-agent (MVP-10 fill): Attach the rich stop card (PlaceCard slim + deeplinks), inbound legs, " +
        "and back-filled slot times (prev end + recommended leg; F42 station-timing adjustment) for ONE stop. " +
        "Origin stays render without legs (from_origin summary instead). No LLM. " +
        "Candidates may be omitted. Do not echo the discover pool. " +
        "Then immediately plan_next_stop for the next skeleton stop. Do not call travel_tips.",
      inputSchema: {
        stop: z.object({
          name: z.string().min(1),
          kind: z.enum(["stay", "attraction", "meal"]).optional(),
          meal_slot: z.enum(["lunch", "afternoon_tea", "dinner"]).optional(),
          lat: z.number().optional(),
          lng: z.number().optional(),
        }),
        candidates: z
          .object({
            places: z.array(z.any()),
            restaurants: z.array(z.any()),
          })
          .optional()
          .default({ places: [], restaurants: [] }),
        previous_stop: z
          .object({
            name: z.string().optional(),
            end_time: z.string().optional(),
            kind: z.enum(["stay", "attraction", "meal"]).optional(),
          })
          .optional(),
        legs_to_here: z.array(z.any()).optional(),
        default_duration_min: z.number().int().min(10).max(480).optional(),
        time_from: z.string().optional(),
        stay_role: z.enum(["day_origin", "return", "midday"]).optional(),
        city: z.string().optional(),
        skeleton: skeletonEchoSchema,
        cursor: cursorSchema,
        ...sharedShape,
      },
    },
    async (args) => {
      try {
        const skeleton = args.skeleton as SkeletonEcho | undefined;
        const cursor = args.cursor as FillCursor | undefined;
        const locale = args.locale ?? "EN";
        const stay_role =
          args.stay_role ??
          (skeleton && cursor ? stayRoleForFillStop(slimStop(args.stop), cursor) : undefined);
        const result = displayCurrentStop({
          stop: args.stop,
          candidates: {
            places: (args.candidates?.places ?? []) as never[],
            restaurants: (args.candidates?.restaurants ?? []) as never[],
          },
          previous_stop: args.previous_stop,
          legs_to_here: args.legs_to_here as never,
          default_duration_min: args.default_duration_min,
          time_from: args.time_from,
          stay_role,
          locale: args.locale ?? "EN",
        });
        if (skeleton && cursor) {
          const step = nextFillStep(skeleton, cursor, locale, result.slot.end, args.city);
          const tripComplete = step.next_action === "trip_complete";
          return jsonResult({
            agent: AGENT_ID,
            ok: true,
            data: {
              ...result,
              next_action: step.next_action,
              ...(step.next_tool_call ? { next_tool_call: step.next_tool_call } : {}),
              host_instructions: tripComplete
                ? MCP_TRIP_COMPLETE_HOST_INSTRUCTIONS
                : MCP_FILL_CONTINUE_HOST_INSTRUCTIONS,
            },
          });
        }
        // Backward compat: no skeleton/cursor → prose-only (host may stall).
        return jsonResult({
          agent: AGENT_ID,
          ok: true,
          data: {
            ...result,
            next_action: "present_stop_then_continue",
            host_instructions: MCP_FILL_CONTINUE_HOST_INSTRUCTIONS,
          },
        });
      } catch (err) {
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
