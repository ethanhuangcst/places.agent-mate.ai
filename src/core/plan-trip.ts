/**
 * True-agent plan_trip — POC intake (ADR-054 / agent-poc-01).
 *
 * Loop in-process: geocode → search_places → commit_trip (eligible + must_see + photos).
 * Hosts only see trip_id / revision / needs_input; chips via fetch_trip_details.
 */

import OpenAI from "openai";
import { filterEligibleAttractions } from "./eligible-attraction";
import { filterAttractionPlaces, filterDiningPlaces, isLodgingPlace } from "./place-filters";
import {
  configuredChatModel,
  createOpenAI,
  useFixtureLlm,
  withAbortTimeout,
} from "./itinerary-planner";
import { parseLocale, type Locale } from "./locales";
import { resolveDisplayPhotosForCards } from "./resolve-display-photo";
import { dualWriteTrip, slimCandidatesForStore } from "./trip-dual-write";
import { ensureTrip } from "./trip-store";
import { geocode, searchPlaces } from "./tools";
import type { PlaceCard, SearchInput, ToolResult } from "./types";

const MAX_ITERATIONS = 8;
const MUST_SEE_LIMIT = 5;
const CITY_RADIUS_KM = 80;
const LLM_TIMEOUT_MS = 60_000;

export type PlanTripStatus = "needs_input" | "planning" | "ready" | "failed";

export type PlanTripNeedInput = {
  questions: Array<{ id: string; prompt: string }>;
};

export type PlanTripTurn =
  | { type: "tool"; name: string; args: Record<string, unknown> }
  | { type: "stop" };

export type PlanTripInput = {
  callerKey: string;
  city: string;
  locale?: Locale;
  trip_id?: string;
  revision?: number;
  /** Scripted loop for tests (skips live LLM). */
  _testTurns?: PlanTripTurn[];
  _testGeocode?: typeof geocode;
  _testSearchPlaces?: typeof searchPlaces;
};

export type PlanTripResult = {
  trip_id: string;
  revision: number;
  status: PlanTripStatus;
  need_input?: PlanTripNeedInput;
  tool_calls?: string[];
};

const TOOL_DEFS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "geocode",
      description: "Geocode a city or address. Omit providers[] — agent auto-routes.",
      parameters: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_places",
      description:
        "Search attractions by name. Omit providers[]. Only search hits can become chips.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          address: { type: "string" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "commit_trip",
      description:
        "Commit verified attraction cards as must_see candidates. Optional names filter search hits only — ungrounded names are dropped.",
      parameters: {
        type: "object",
        properties: {
          names: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "ask_user",
      description: "Stop and ask the user for missing trip bounds. Do not guess.",
      parameters: {
        type: "object",
        properties: {
          questions: {
            type: "array",
            items: {
              type: "object",
              properties: { id: { type: "string" }, prompt: { type: "string" } },
            },
          },
        },
      },
    },
  },
];

function defaultFixtureTurns(city: string): PlanTripTurn[] {
  return [
    { type: "tool", name: "geocode", args: { query: city } },
    { type: "tool", name: "search_places", args: { query: city, address: city } },
    { type: "tool", name: "commit_trip", args: {} },
    { type: "stop" },
  ];
}

function defaultNeedInput(locale: Locale): PlanTripNeedInput {
  const prompts =
    locale === "CN" || locale === "HK" || locale === "TW"
      ? {
          dates: "行程起止日期？",
          hotel: "住宿酒店名称，或跳过？",
          pace: "节奏：紧凑 / 适中 / 轻松？",
        }
      : {
          dates: "What are the trip start and end dates?",
          hotel: "Hotel name, or skip?",
          pace: "Pace: tight / medium / relaxed?",
        };
  return {
    questions: [
      { id: "dates", prompt: prompts.dates },
      { id: "hotel", prompt: prompts.hotel },
      { id: "pace", prompt: prompts.pace },
    ],
  };
}

function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

function withinCityRadius(
  card: PlaceCard,
  anchor: { lat: number; lng: number } | null,
): boolean {
  if (!anchor) return true;
  const lat = card.location?.lat;
  const lng = card.location?.lng;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  return haversineKm(anchor, { lat, lng }) <= CITY_RADIUS_KM;
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

function isAttractionish(card: PlaceCard): boolean {
  if (filterAttractionPlaces([card]).length > 0) return true;
  return /attraction|museum|park|landmark|temple|景点|名胜|博物館|博物馆|公园/i.test(
    `${card.category ?? ""} ${card.name}`,
  );
}

function intakeEligible(cards: PlaceCard[], anchor: { lat: number; lng: number } | null): PlaceCard[] {
  return filterEligibleAttractions(cards)
    .filter((c) => !isLodgingPlace(c))
    .filter((c) => filterDiningPlaces([c]).length === 0)
    .filter((c) => isAttractionish(c))
    .filter((c) => withinCityRadius(c, anchor));
}

function recoverQueries(city: string, locale: Locale): string[] {
  if (locale === "CN" || locale === "HK" || locale === "TW") {
    return [`${city} 博物馆`, `${city} 景点`];
  }
  return [`${city} museum`, `${city} landmark`];
}

function systemPrompt(city: string, locale: Locale): string {
  return [
    "You are places-agent planning intake. The host already gave a destination city.",
    `City: ${city}. Locale: ${locale}.`,
    "Hold the loop. Call tools until chips are committed, then stop.",
    "1. geocode the city (omit providers[]).",
    "2. Nominate 3–5 specific attraction names (temple, museum, peak, bridge) from parametric knowledge — no city tables in source.",
    "3. search_places for each exact name (omit providers[]). On mainland China use Chinese POI names, not generic area labels that match shops/hotels.",
    "4. commit_trip with only search-hit names. Never commit ungrounded names. Do not commit hotels or shops.",
    "5. After commit, stop. Remaining bounds come back as need_input.",
    "Do not invent coordinates. Do not write a skeleton.",
  ].join("\n");
}

type LoopState = {
  collected: PlaceCard[];
  anchor: { lat: number; lng: number } | null;
  committed: boolean;
  asked: PlanTripNeedInput | null;
};

async function runGeocode(
  args: Record<string, unknown>,
  input: PlanTripInput,
  locale: Locale,
  state: LoopState,
): Promise<unknown> {
  const query = typeof args.query === "string" ? args.query : input.city;
  const fn = input._testGeocode ?? geocode;
  const result = await fn({ query, locale });
  const hit = result.data;
  if (hit && Number.isFinite(hit.lat) && Number.isFinite(hit.lng)) {
    state.anchor = { lat: hit.lat, lng: hit.lng };
  }
  return result.data ?? result;
}

async function runSearchPlaces(
  args: Record<string, unknown>,
  input: PlanTripInput,
  locale: Locale,
  state: LoopState,
): Promise<unknown> {
  const query = typeof args.query === "string" ? args.query : input.city;
  const address = typeof args.address === "string" ? args.address : input.city;
  const searchInput: SearchInput = {
    query,
    address,
    locale,
    near: state.anchor ?? undefined,
  };
  const fn = input._testSearchPlaces ?? searchPlaces;
  const result = await fn(searchInput);
  const cards = intakeEligible(result.data ?? [], state.anchor);
  state.collected.push(...cards);
  return cards.map((c) => ({
    name: c.name,
    provider: c.provider,
    native_id: c.sources[0]?.native_id,
    location: c.location,
  }));
}

async function commitTripInternal(
  args: Record<string, unknown>,
  input: PlanTripInput,
  locale: Locale,
  tripId: string,
  expectedRevision: number | undefined,
  state: LoopState,
): Promise<{ trip_id: string; revision: number }> {
  const requested = Array.isArray(args.names)
    ? (args.names as unknown[]).filter((n): n is string => typeof n === "string")
    : null;
  let selected = intakeEligible(state.collected, state.anchor);
  if (requested?.length) {
    const want = new Set(requested.map(normalizeName));
    selected = selected.filter((c) => want.has(normalizeName(c.name)));
  }
  const byId = new Map<string, PlaceCard>();
  for (const card of selected) {
    const id = card.sources[0]?.native_id ?? card.name;
    if (!byId.has(id)) byId.set(id, card);
  }
  selected = [...byId.values()].slice(0, MUST_SEE_LIMIT);
  if (!selected.length) {
    return { trip_id: tripId, revision: expectedRevision ?? 1 };
  }
  for (const card of selected) {
    card.must_see = true;
  }
  const withPhotos = await resolveDisplayPhotosForCards(selected);
  const written = await dualWriteTrip({
    callerKey: input.callerKey,
    tripId,
    expectedRevision,
    locale,
    candidatesWrite: "replace",
    patch: {
      constraints: {
        city: input.city,
        origin: state.anchor
          ? { lat: state.anchor.lat, lng: state.anchor.lng }
          : undefined,
      },
      candidates: slimCandidatesForStore({
        places: withPhotos as unknown as Array<Record<string, unknown>>,
        restaurants: [],
      }),
    },
  });
  state.committed = true;
  return { trip_id: written.trip_id, revision: written.revision };
}

function parseAskUser(args: Record<string, unknown>, locale: Locale): PlanTripNeedInput {
  const raw = args.questions;
  if (Array.isArray(raw) && raw.length) {
    const questions = raw
      .map((q) => {
        if (!q || typeof q !== "object") return null;
        const row = q as { id?: unknown; prompt?: unknown };
        if (typeof row.id !== "string" || typeof row.prompt !== "string") return null;
        return { id: row.id, prompt: row.prompt };
      })
      .filter((q): q is { id: string; prompt: string } => q != null);
    if (questions.length) return { questions };
  }
  return defaultNeedInput(locale);
}

async function executeInternal(
  name: string,
  args: Record<string, unknown>,
  input: PlanTripInput,
  locale: Locale,
  tripId: string,
  revisionRef: { current?: number },
  state: LoopState,
): Promise<unknown> {
  if (name === "geocode") return runGeocode(args, input, locale, state);
  if (name === "search_places") return runSearchPlaces(args, input, locale, state);
  if (name === "commit_trip") {
    const written = await commitTripInternal(
      args,
      input,
      locale,
      tripId,
      revisionRef.current,
      state,
    );
    revisionRef.current = written.revision;
    return written;
  }
  if (name === "ask_user") {
    state.asked = parseAskUser(args, locale);
    return { stopped: true };
  }
  return { error: `unknown_tool:${name}` };
}

async function recoverPoolIfEmpty(
  input: PlanTripInput,
  locale: Locale,
  state: LoopState,
): Promise<void> {
  if (state.collected.length) return;
  const fn = input._testSearchPlaces ?? searchPlaces;
  for (const query of recoverQueries(input.city, locale)) {
    const result = await fn({
      query,
      address: input.city,
      locale,
      near: state.anchor ?? undefined,
    });
    state.collected.push(...intakeEligible(result.data ?? [], state.anchor));
    if (state.collected.length >= MUST_SEE_LIMIT) break;
  }
}

async function nextLiveTurn(
  openai: OpenAI,
  history: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
): Promise<OpenAI.Chat.Completions.ChatCompletionMessage> {
  const completion = await withAbortTimeout(LLM_TIMEOUT_MS, (signal) =>
    openai.chat.completions.create(
      {
        model: configuredChatModel(),
        messages: history,
        tools: TOOL_DEFS,
        max_completion_tokens: 1024,
      },
      { signal },
    ),
  );
  const message = completion?.choices?.[0]?.message;
  if (!message) {
    throw new Error("empty_llm_message");
  }
  return message;
}

export async function planTrip(input: PlanTripInput): Promise<PlanTripResult> {
  const locale = parseLocale(input.locale);
  const city = input.city.trim();
  if (!city) {
    return {
      trip_id: input.trip_id ?? "",
      revision: input.revision ?? 1,
      status: "failed",
    };
  }

  const ensured = await ensureTrip({
    callerKey: input.callerKey,
    tripId: input.trip_id,
    locale,
  });
  const revisionRef = { current: input.revision ?? ensured.revision };
  const toolCalls: string[] = [];
  const state: LoopState = {
    collected: [],
    anchor: null,
    committed: false,
    asked: null,
  };

  const fixture =
    Boolean(input._testTurns) ||
    Boolean(input._testGeocode) ||
    Boolean(input._testSearchPlaces) ||
    useFixtureLlm();
  const turns = input._testTurns ?? (fixture ? defaultFixtureTurns(city) : null);
  const openai = fixture ? null : createOpenAI();

  if (turns) {
    for (const turn of turns) {
      if (turn.type === "stop") break;
      toolCalls.push(turn.name);
      await executeInternal(
        turn.name,
        turn.args,
        input,
        locale,
        ensured.trip_id,
        revisionRef,
        state,
      );
      if (state.asked) break;
    }
  } else if (openai) {
    const history: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt(city, locale) },
      { role: "user", content: `Plan intake chips for ${city}.` },
    ];
    for (let i = 0; i < MAX_ITERATIONS; i++) {
      let assistant: OpenAI.Chat.Completions.ChatCompletionMessage;
      try {
        assistant = await nextLiveTurn(openai, history);
      } catch {
        break;
      }
      history.push(assistant);
      const calls = assistant.tool_calls ?? [];
      if (!calls.length) break;
      for (const call of calls) {
        if (call.type !== "function") continue;
        const name = call.function.name;
        toolCalls.push(name);
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(call.function.arguments || "{}") as Record<string, unknown>;
        } catch {
          args = {};
        }
        const payload = await executeInternal(
          name,
          args,
          input,
          locale,
          ensured.trip_id,
          revisionRef,
          state,
        );
        history.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(payload),
        });
        if (state.asked) break;
      }
      if (state.committed || state.asked) break;
    }
  }

  if (!state.committed) {
    await recoverPoolIfEmpty(input, locale, state);
  }
  if (!state.committed && state.collected.length) {
    const written = await commitTripInternal(
      {},
      input,
      locale,
      ensured.trip_id,
      revisionRef.current,
      state,
    );
    revisionRef.current = written.revision;
  }

  if (!state.committed) {
    return {
      trip_id: ensured.trip_id,
      revision: revisionRef.current ?? ensured.revision,
      status: "failed",
      tool_calls: toolCalls,
    };
  }

  return {
    trip_id: ensured.trip_id,
    revision: revisionRef.current ?? ensured.revision,
    status: "needs_input",
    need_input: state.asked ?? defaultNeedInput(locale),
    tool_calls: toolCalls,
  };
}
