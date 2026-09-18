/**
 * MVP-T9 agent-chat-93e — plan_trip refine mode (chat 改行程).
 * Model loop on existing Trip: search_places → commit_trip.operations → stop.
 */

import OpenAI from "openai";
import { ItinerarySkeletonSchema, type ItinerarySkeleton } from "./make-itinerary";
import { dualWriteTrip } from "./trip-dual-write";
import { getTripOrThrow } from "./trip-store";
import { parseLocale, type Locale } from "./locales";
import { createOpenAI, useFixtureLlm } from "./itinerary-planner";
import { searchPlaces } from "./tools";
import { normalizeMustIncludeToken } from "./trip-intake";
import type { PlaceCard } from "./types";
import type {
  PlanTripFilledStop,
  PlanTripInput,
  PlanTripResult,
  PlanTripTurn,
} from "./plan-trip";

const MAX_REFINE_ITERATIONS = 12;

export type RefineOperation =
  | { op: "remove_stop"; day_index: number; stop_index: number }
  | { op: "replace_stop"; day_index: number; stop_index: number; name: string }
  | { op: "swap_stops"; day_index: number; from_index: number; to_index: number };

export type RefineFilledStop = PlanTripFilledStop;

function cloneSkeleton(s: ItinerarySkeleton): ItinerarySkeleton {
  return JSON.parse(JSON.stringify(s)) as ItinerarySkeleton;
}

function norm(s: string): string {
  return normalizeMustIncludeToken(s);
}

export function parseRefineOperations(raw: unknown): RefineOperation[] {
  if (!Array.isArray(raw)) return [];
  const out: RefineOperation[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const op = row.op;
    if (op === "remove_stop" && typeof row.day_index === "number" && typeof row.stop_index === "number") {
      out.push({ op: "remove_stop", day_index: row.day_index, stop_index: row.stop_index });
    } else if (
      op === "replace_stop" &&
      typeof row.day_index === "number" &&
      typeof row.stop_index === "number" &&
      typeof row.name === "string" &&
      row.name.trim()
    ) {
      out.push({
        op: "replace_stop",
        day_index: row.day_index,
        stop_index: row.stop_index,
        name: row.name.trim(),
      });
    } else if (
      op === "swap_stops" &&
      typeof row.day_index === "number" &&
      typeof row.from_index === "number" &&
      typeof row.to_index === "number"
    ) {
      out.push({
        op: "swap_stops",
        day_index: row.day_index,
        from_index: row.from_index,
        to_index: row.to_index,
      });
    }
  }
  return out;
}

export function applyRefineOperations(
  skeleton: ItinerarySkeleton,
  operations: RefineOperation[],
  resolveName: (name: string) => string | null,
): { skeleton: ItinerarySkeleton; changed: boolean; dropped: string[] } {
  const sk = cloneSkeleton(skeleton);
  let changed = false;
  const dropped: string[] = [];

  for (const op of operations) {
    const day = sk.days.find((d) => d.day_index === op.day_index);
    if (!day) continue;

    if (op.op === "remove_stop") {
      if (op.stop_index < 0 || op.stop_index >= day.stops.length) continue;
      if (day.stops.length <= 1) continue;
      day.stops.splice(op.stop_index, 1);
      changed = true;
    } else if (op.op === "swap_stops") {
      const { from_index, to_index } = op;
      if (
        from_index < 0 ||
        to_index < 0 ||
        from_index >= day.stops.length ||
        to_index >= day.stops.length ||
        from_index === to_index
      ) {
        continue;
      }
      const tmp = day.stops[from_index];
      day.stops[from_index] = day.stops[to_index];
      day.stops[to_index] = tmp;
      changed = true;
    } else if (op.op === "replace_stop") {
      if (op.stop_index < 0 || op.stop_index >= day.stops.length) continue;
      const resolved = resolveName(op.name);
      if (!resolved) {
        dropped.push(op.name);
        continue;
      }
      const stop = day.stops[op.stop_index];
      day.stops[op.stop_index] = { ...stop, name: resolved, kind: stop.kind ?? "attraction" };
      changed = true;
    }
  }

  return { skeleton: sk, changed, dropped };
}

export function reconcileFilledStops(
  filledStops: RefineFilledStop[],
  _oldSkeleton: ItinerarySkeleton,
  newSkeleton: ItinerarySkeleton,
): RefineFilledStop[] {
  const namesByDay = new Map<number, Set<string>>();
  for (const day of newSkeleton.days) {
    const set = new Set<string>();
    for (const s of day.stops) {
      set.add(norm(s.name ?? s.meal_slot ?? ""));
    }
    namesByDay.set(day.day_index, set);
  }

  return filledStops.filter((fs) => {
    const stopName =
      fs.stop && typeof fs.stop === "object" && "name" in fs.stop
        ? String((fs.stop as { name?: string }).name ?? "")
        : "";
    const daySet = namesByDay.get(fs.day_index);
    return daySet?.has(norm(stopName)) ?? false;
  });
}

function readFilledStopsFromArtifacts(artifacts: unknown): RefineFilledStop[] {
  if (!artifacts || typeof artifacts !== "object") return [];
  const raw = (artifacts as { filled_stops?: unknown }).filled_stops;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (x): x is RefineFilledStop =>
      Boolean(x && typeof x === "object" && typeof (x as RefineFilledStop).day_index === "number"),
  );
}

function buildGroundingMap(
  candidates: PlaceCard[],
  searched: PlaceCard[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const card of [...candidates, ...searched]) {
    if (typeof card.name === "string" && card.name.trim()) {
      map.set(norm(card.name), card.name.trim());
    }
  }
  return map;
}

function refineSystemPrompt(city: string, locale: Locale, skeleton: ItinerarySkeleton): string {
  const summary = skeleton.days
    .map((d) => {
      const stops = d.stops.map((s, i) => `  [${i}] ${s.name ?? s.meal_slot ?? "stop"} (${s.kind ?? "?"})`).join("\n");
      return `Day ${d.day_index} — ${d.day_theme}\n${stops}`;
    })
    .join("\n\n");
  return [
    "You refine an EXISTING trip skeleton. Do NOT rebuild from scratch.",
    `Locale: ${locale}. City: ${city}.`,
    "Tools: search_places (ground new names), commit_trip (operations[] + optional reply), stop (optional reply).",
    "commit_trip.operations ops: remove_stop, replace_stop (grounded name only), swap_stops.",
    "stop_index is 0-based within the day's stops array.",
    "Never invent place names for replace_stop — only names from search_places or candidates.",
    "",
    "Current skeleton:",
    summary,
  ].join("\n");
}

const REFINE_TOOL_DEFS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "search_places",
      description: "Search grounded place names for replace_stop.",
      parameters: {
        type: "object",
        properties: { query: { type: "string" }, address: { type: "string" } },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "commit_trip",
      description:
        "Apply skeleton patch operations. include reply for the traveler when done with edits.",
      parameters: {
        type: "object",
        properties: {
          operations: {
            type: "array",
            items: {
              type: "object",
              properties: {
                op: { type: "string", enum: ["remove_stop", "replace_stop", "swap_stops"] },
                day_index: { type: "number" },
                stop_index: { type: "number" },
                from_index: { type: "number" },
                to_index: { type: "number" },
                name: { type: "string" },
              },
            },
          },
          reply: { type: "string" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "stop",
      description: "Finish refine with a natural-language reply (no skeleton change).",
      parameters: {
        type: "object",
        properties: { reply: { type: "string" } },
      },
    },
  },
];

type RefineState = {
  skeleton: ItinerarySkeleton;
  filledStops: RefineFilledStop[];
  searched: PlaceCard[];
  candidates: PlaceCard[];
  reply: string | null;
  changed: boolean;
  done: boolean;
};

async function runRefineSearch(
  args: Record<string, unknown>,
  input: PlanTripInput,
  locale: Locale,
  state: RefineState,
): Promise<{ count: number }> {
  const query = typeof args.query === "string" ? args.query : input.city;
  const searchFn = input._testSearchPlaces ?? searchPlaces;
  const result = await searchFn({
    query,
    address: typeof args.address === "string" ? args.address : input.city,
    locale,
  });
  const cards = result.data ?? [];
  state.searched = [...state.searched, ...cards];
  return { count: cards.length };
}

async function runRefineCommit(
  args: Record<string, unknown>,
  tripId: string,
  revisionRef: { current?: number },
  input: PlanTripInput,
  locale: Locale,
  state: RefineState,
): Promise<{ changed: boolean; dropped: string[] }> {
  const operations = parseRefineOperations(args.operations);
  const grounding = buildGroundingMap(state.candidates, state.searched);
  const resolveName = (name: string): string | null => {
    const n = norm(name);
    if (grounding.has(n)) return grounding.get(n)!;
    if (name.trim() === "lunch" || name.trim() === "dinner" || name.trim() === "afternoon_tea") {
      return name.trim();
    }
    return null;
  };

  const before = cloneSkeleton(state.skeleton);
  const applied = applyRefineOperations(state.skeleton, operations, resolveName);
  state.skeleton = applied.skeleton;
  if (applied.changed) {
    state.changed = true;
    state.filledStops = reconcileFilledStops(state.filledStops, before, state.skeleton);
    const parsed = ItinerarySkeletonSchema.safeParse(state.skeleton);
    if (!parsed.success) {
      state.skeleton = before;
      return { changed: false, dropped: applied.dropped };
    }
    const written = await dualWriteTrip({
      callerKey: input.callerKey,
      tripId,
      expectedRevision: revisionRef.current,
      locale,
      patch: {
        skeleton: state.skeleton as unknown as Record<string, unknown>,
        artifacts: {
          filled_stops: state.filledStops,
        },
      },
      candidatesWrite: "merge",
    });
    revisionRef.current = written.revision;
  }

  if (typeof args.reply === "string" && args.reply.trim()) {
    state.reply = args.reply.trim();
  }
  return { changed: applied.changed, dropped: applied.dropped };
}

async function executeRefineTool(
  name: string,
  args: Record<string, unknown>,
  input: PlanTripInput,
  locale: Locale,
  tripId: string,
  revisionRef: { current?: number },
  state: RefineState,
): Promise<unknown> {
  if (name === "search_places") return runRefineSearch(args, input, locale, state);
  if (name === "commit_trip") return runRefineCommit(args, tripId, revisionRef, input, locale, state);
  if (name === "stop") {
    state.done = true;
    if (typeof args.reply === "string" && args.reply.trim()) {
      state.reply = args.reply.trim();
    }
    return { stopped: true };
  }
  return { error: `unknown_tool:${name}` };
}

function secondsSince(t0: number): number {
  return Math.round((Date.now() - t0) / 1000);
}

export async function planTripRefine(
  input: PlanTripInput,
  t0: number,
  locale: Locale,
): Promise<PlanTripResult> {
  const instruction = input.refine?.instruction?.trim() ?? "";
  if (!input.trip_id || !instruction) {
    return {
      trip_id: input.trip_id ?? "",
      revision: input.revision ?? 1,
      status: "failed",
      timing: { intake_s: 0, total_s: secondsSince(t0) },
    };
  }

  let doc;
  try {
    doc = await getTripOrThrow(input.callerKey, input.trip_id);
  } catch {
    return {
      trip_id: input.trip_id,
      revision: input.revision ?? 1,
      status: "failed",
      timing: { intake_s: 0, total_s: secondsSince(t0) },
    };
  }

  const revisionRef = { current: input.revision ?? doc.revision };
  const constraints = (doc.constraints ?? {}) as { city?: string };
  const city = input.city?.trim() || constraints.city?.trim() || "";
  const rawSkeleton = doc.skeleton;
  const parsedSk = ItinerarySkeletonSchema.safeParse(rawSkeleton);
  if (!parsedSk.success) {
    return {
      trip_id: doc.id,
      revision: revisionRef.current,
      status: "failed",
      timing: { intake_s: 0, total_s: secondsSince(t0) },
    };
  }

  const candidates =
    ((doc.candidates as { places?: PlaceCard[] } | null)?.places ?? []).filter(Boolean);
  const filledStops = readFilledStopsFromArtifacts(doc.artifacts);

  const state: RefineState = {
    skeleton: parsedSk.data,
    filledStops,
    searched: [],
    candidates,
    reply: null,
    changed: false,
    done: false,
  };

  const toolCalls: string[] = [];
  const fixture =
    Boolean(input._testRefineTurns) ||
    Boolean(input._testSearchPlaces) ||
    useFixtureLlm();
  const turns = input._testRefineTurns ?? null;
  const openai = fixture ? null : createOpenAI();

  if (turns) {
    for (const turn of turns) {
      if (turn.type === "stop") {
        state.done = true;
        break;
      }
      toolCalls.push(turn.name);
      await executeRefineTool(
        turn.name,
        turn.args,
        input,
        locale,
        doc.id,
        revisionRef,
        state,
      );
      if (state.done) break;
    }
  } else if (openai) {
    const history: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: "system", content: refineSystemPrompt(city, locale, state.skeleton) },
      { role: "user", content: instruction },
    ];
    for (let i = 0; i < MAX_REFINE_ITERATIONS; i++) {
      const completion = await openai.chat.completions.create({
        model: process.env.QWEN_CHAT_MODEL?.trim() || "qwen-plus",
        messages: history,
        tools: REFINE_TOOL_DEFS,
      });
      const assistant = completion.choices[0]?.message;
      if (!assistant) break;
      history.push(assistant);
      const calls = assistant.tool_calls ?? [];
      if (!calls.length) {
        if (assistant.content?.trim()) state.reply = assistant.content.trim();
        break;
      }
      for (const call of calls) {
        if (call.type !== "function") continue;
        const args = JSON.parse(call.function.arguments || "{}") as Record<string, unknown>;
        toolCalls.push(call.function.name);
        await executeRefineTool(
          call.function.name,
          args,
          input,
          locale,
          doc.id,
          revisionRef,
          state,
        );
        history.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify({ ok: true }),
        });
        if (state.done) break;
      }
      if (state.done) break;
    }
  }

  const timing = { intake_s: 0, total_s: secondsSince(t0) };
  return {
    trip_id: doc.id,
    revision: revisionRef.current ?? doc.revision,
    status: "ready",
    tool_calls: toolCalls,
    reply: state.reply ?? undefined,
    timing,
    itinerary: {
      skeleton: state.skeleton,
      filledStops: state.filledStops,
    },
  };
}
