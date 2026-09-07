/**
 * Fill-chain handoff helpers (shared by MCP host orchestration and plan_trip).
 * Ported from mcp/create-server.ts so plan_trip can drive the loop in-process.
 */

import { MCP_NO_INVENT_RULE } from "./trip-intake";

export const MCP_SKELETON_HOST_INSTRUCTIONS =
  "REQUIRED NEXT TOOL: execute next_tool_call (plan_next_stop origin_mode for Day 1 first stay, time_from=09:00) immediately. " +
  "Pass skeleton and cursor exactly as provided in next_tool_call.arguments. Candidates may be omitted — pass stop name only. " +
  "Then keep executing each returned next_tool_call (plan_next_stop with with_stop_display) without stopping, " +
  "until next_action is trip_complete. Present each tool-filled stop (card + transit + times) as you go. " +
  "FORBIDDEN until fill tools have run: travel_tips, offering 详细版/优化版 menus, " +
  "or writing a timetable from your own knowledge. Do NOT stop after one stop. " +
  "arrange_day is LEGACY. " +
  MCP_NO_INVENT_RULE;

export const MCP_FILL_CONTINUE_HOST_INSTRUCTIONS =
  "Execute next_tool_call immediately — do not stop, do not summarize, do not call travel_tips, do not offer 详细版. " +
  "Pass skeleton and cursor exactly as provided in next_tool_call.arguments. " +
  "Continue the chain until next_action is trip_complete. " +
  MCP_NO_INVENT_RULE;

export const MCP_TRIP_COMPLETE_HOST_INSTRUCTIONS =
  "All stops are now filled. Present the complete itinerary (day-by-day cards with times and transit) to the user. " +
  "Do not call any more fill tools. Do not invent extra stops or times. " +
  MCP_NO_INVENT_RULE;

export type SkeletonEchoStop = {
  name: string;
  kind: string;
  meal_slot?: string;
  provider?: string;
  native_id?: string;
  visit_part?: string;
};
export type SkeletonEchoDay = {
  day_index: number;
  day_theme?: string;
  stops: SkeletonEchoStop[];
};
export type SkeletonEcho = { days: SkeletonEchoDay[] };
export type FillCursor = { day_index: number; stop_index: number };
export type FillStop = SkeletonEchoStop & { end_time?: string };

export type NextFillStep =
  | {
      next_action: "plan_next_stop";
      next_tool_call: {
        name: "plan_next_stop";
        arguments: Record<string, unknown>;
      };
    }
  | { next_action: "trip_complete"; next_tool_call: undefined };

export function slimStop(s: {
  name?: string;
  kind?: string;
  meal_slot?: string;
  provider?: string;
  native_id?: string;
  visit_part?: string;
}): SkeletonEchoStop {
  const out: SkeletonEchoStop = {
    name: s.name ?? s.meal_slot ?? "stop",
    kind: s.kind ?? "attraction",
  };
  if (s.meal_slot) out.meal_slot = s.meal_slot;
  if (s.provider) out.provider = s.provider;
  if (s.native_id) out.native_id = s.native_id;
  if (s.visit_part) out.visit_part = s.visit_part;
  return out;
}

export function stayRoleForFillStop(
  stop: { kind?: string },
  cursor: FillCursor,
): "day_origin" | "return" | undefined {
  if (stop.kind !== "stay") return undefined;
  return cursor.stop_index === 0 ? "day_origin" : "return";
}

/**
 * Compute the concrete next tool call after filling the stop at `cursor`.
 */
export function nextFillStep(
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
  const nextDay = skeleton.days
    .filter((d) => d.day_index > cursor.day_index)
    .sort((a, b) => a.day_index - b.day_index)[0];
  if (nextDay && nextDay.stops.length > 0) {
    return {
      next_action: "plan_next_stop",
      next_tool_call: {
        name: "plan_next_stop",
        arguments: {
          origin_mode: true,
          next_stop: slimStop(nextDay.stops[0]),
          time_from: "09:00",
          stay_role: stayRoleForFillStop(slimStop(nextDay.stops[0]), {
            day_index: nextDay.day_index,
            stop_index: 0,
          }),
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

export function skeletonFillHandoff(
  skeleton: {
    days?: Array<{
      day_index?: number;
      day_theme?: string;
      stops?: Array<{
        name?: string;
        kind?: string;
        meal_slot?: string;
        provider?: string;
        native_id?: string;
        visit_part?: string;
      }>;
    }>;
  },
  locale: string,
  city?: string,
  tripMeta?: { trip_id?: string; revision?: number },
): {
  next_action: "plan_next_stop";
  prefer_tool: "plan_next_stop";
  next_tool_call?: {
    name: "plan_next_stop";
    arguments: Record<string, unknown>;
  };
  host_instructions: string;
} {
  const day1 = skeleton.days?.find((d) => d.day_index === 1) ?? skeleton.days?.[0];
  const stayIdx = day1?.stops?.findIndex((s) => s.kind === "stay") ?? -1;
  const stay = stayIdx >= 0 ? day1?.stops?.[stayIdx] : day1?.stops?.[0];
  const dayIndex = day1?.day_index ?? 1;
  const stopIndex = stayIdx >= 0 ? stayIdx : 0;
  const echo: SkeletonEcho = {
    days: (skeleton.days ?? []).map((d) => ({
      day_index: d.day_index ?? 0,
      day_theme: d.day_theme,
      stops: (d.stops ?? []).map((s) => slimStop(s)),
    })),
  };
  return {
    next_action: "plan_next_stop",
    prefer_tool: "plan_next_stop",
    next_tool_call: stay
      ? {
          name: "plan_next_stop",
          arguments: {
            origin_mode: true,
            next_stop: slimStop(stay),
            time_from: "09:00",
            stay_role: stayRoleForFillStop(slimStop(stay), {
              day_index: dayIndex,
              stop_index: stopIndex,
            }),
            skeleton: echo,
            cursor: { day_index: dayIndex, stop_index: stopIndex },
            locale,
            ...(city ? { city } : {}),
            ...(tripMeta?.trip_id
              ? { trip_id: tripMeta.trip_id, revision: tripMeta.revision }
              : {}),
          },
        }
      : undefined,
    host_instructions: MCP_SKELETON_HOST_INSTRUCTIONS,
  };
}

export function skeletonHasStops(
  skeleton: unknown,
): skeleton is {
  days: Array<{
    day_index?: number;
    stops?: Array<{
      name?: string;
      kind?: string;
      meal_slot?: string;
      provider?: string;
      native_id?: string;
      visit_part?: string;
    }>;
  }>;
} {
  if (!skeleton || typeof skeleton !== "object") return false;
  const days = (skeleton as { days?: unknown }).days;
  if (!Array.isArray(days)) return false;
  return days.some((d) => {
    const stops = (d as { stops?: unknown }).stops;
    return Array.isArray(stops) && stops.length > 0;
  });
}
