/**
 * True-agent plan_trip (ADR-054 / agent-poc-01 + full loop).
 *
 * Intake: model tool loop — geocode → search_places → commit_trip.
 * Full (when numDays + origin): model act-or-stop loop
 * (resolve_origin_stay / search_places / make_itinerary / plan_next_stop /
 * commit_artifacts / stop). Legacy fixed pipeline behind PLAN_TRIP_LEGACY_FULL_LOOP=1.
 */

import OpenAI from "openai";
import { filterEligibleAttractions } from "./eligible-attraction";
import {
  nextFillStep,
  skeletonFillHandoff,
  slimStop,
  type SkeletonEcho,
} from "./fill-handoff";
import { capClusterOccupancy, dedupeByCluster } from "./discover-dedupe";
import {
  configuredChatModel,
  createOpenAI,
  useFixtureLlm,
  withAbortTimeout,
} from "./itinerary-planner";
import { placesOntologyPrompt } from "./places-ontology";
import { parseLocale, type Locale } from "./locales";
import {
  createSkeletonChatCreate,
  makeItinerary,
  type ItinerarySkeleton,
  type MakeItineraryInput,
  type MakeItineraryResult,
} from "./make-itinerary";
import { filterAttractionPlaces, filterDiningPlaces, isLodgingPlace } from "./place-filters";
import {
  planNextStopFill,
  resolveStayDisplayCard,
  type PlanNextStopFillInput,
  type PlanNextStopFillResult,
  type PlanStopPoint,
} from "./plan-next-stop";
import { resolveDisplayPhotosForCards } from "./resolve-display-photo";
import {
  listPoisForDestination,
  safeUpsertEligiblePois,
  type DestinationAnchor,
} from "./destination-poi-registry";
import { artifactsTipsPatch, artifactsVisaPatch } from "./trip-artifacts";
import { dualWriteTrip, slimCandidatesForStore } from "./trip-dual-write";
import { ensureTrip, getTripOrThrow } from "./trip-store";
import { geocode, searchPlaces } from "./tools";
import { travelTips, type TravelTipsInput, type TravelTipsResult } from "./travel-tips";
import type { PlaceCard, SearchInput } from "./types";
import { visaRequirement } from "./visa-requirement";

const MAX_ITERATIONS = 8;
const MAX_FULL_ITERATIONS = 40;
const MUST_SEE_LIMIT = 8;
const CITY_RADIUS_KM = 80;
const LLM_TIMEOUT_MS = 60_000;
const MAX_FILL_STEPS = 80;

export type PlanTripStatus = "needs_input" | "planning" | "ready" | "failed";

export type PlanTripNeedOption = { id: string; label: string };

export type PlanTripNeedQuestion = {
  id: string;
  prompt: string;
  options?: PlanTripNeedOption[];
  multi?: boolean;
};

export type PlanTripNeedInput = {
  questions: PlanTripNeedQuestion[];
};

export type PlanTripTurn =
  | { type: "tool"; name: string; args: Record<string, unknown> }
  | { type: "stop" };

export type PlanTripTiming = {
  intake_s: number;
  origin_s?: number;
  skeleton_s?: number;
  fill_s?: number;
  tips_s?: number;
  total_s: number;
};

export type PlanTripFilledStop = {
  day_index: number;
  stop_index: number;
  stop: unknown;
  slot?: unknown;
  legs?: unknown;
  notes?: unknown;
};

export type PlanTripInput = {
  callerKey: string;
  city: string;
  locale?: Locale;
  trip_id?: string;
  revision?: number;
  numDays?: number;
  origin?: { name: string; lat?: number; lng?: number };
  pace?: "tight" | "medium" | "relaxed";
  /** Catalog key for L3 (`economy`/`mid`/`luxury`/…) or legacy `budget`/`premium`. */
  budget?: string;
  transit_preference?: string;
  trip_type?: string;
  party_size?: number;
  bounds?: { start: string; end: string };
  must_include?: string[];
  /** Scripted intake loop for tests (skips live LLM). */
  _testTurns?: PlanTripTurn[];
  /** Scripted full-loop tool sequence (model-chosen order in tests). */
  _testFullLoopTurns?: PlanTripTurn[];
  _testGeocode?: typeof geocode;
  _testSearchPlaces?: typeof searchPlaces;
  _testListPois?: (anchor: DestinationAnchor) => Promise<PlaceCard[]>;
  _testMakeItinerary?: (
    input: MakeItineraryInput,
  ) => Promise<MakeItineraryResult>;
  _testPlanNextStopFill?: (
    input: PlanNextStopFillInput,
  ) => Promise<PlanNextStopFillResult>;
  _testTravelTips?: (input: TravelTipsInput) => Promise<TravelTipsResult>;
  _testResolveStay?: typeof resolveStayDisplayCard;
};

export type PlanTripResult = {
  trip_id: string;
  revision: number;
  status: PlanTripStatus;
  need_input?: PlanTripNeedInput;
  tool_calls?: string[];
  itinerary?: {
    skeleton: ItinerarySkeleton;
    filledStops: PlanTripFilledStop[];
    artifacts?: Record<string, unknown>;
  };
  timing?: PlanTripTiming;
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
        "Search real map places by name. Returns grounded cards with coordinates from Google/AMAP. Omit providers[]. Do not invent lat/lng in arguments. Only search hits can become chips.",
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
        "Commit search-hit attraction cards as must_see candidates. Optional names filter grounded hits only — ungrounded names and cards without coordinates are dropped. Never invent place IDs or lat/lng.",
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
              properties: {
                id: { type: "string" },
                prompt: { type: "string" },
                multi: { type: "boolean" },
                options: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "string" },
                      label: { type: "string" },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
];

const FULL_TOOL_DEFS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "resolve_origin_stay",
      description: "Resolve the origin hotel into a stay PlaceCard. Call once.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "search_places",
      description:
        "Widen the attraction pool if skeleton density is low. Returns grounded cards only. Eligible + 80km. Do not invent lat/lng.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          address: { type: "string" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "make_itinerary",
      description: "Lay the day skeleton from the candidate pool. Do not skip.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "plan_next_stop",
      description:
        "Fill the next skeleton stop (directions + slot). Travel times come from directions/heuristics only — do not invent durations. Repeat until trip_complete.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "commit_artifacts",
      description: "Write travel tips and visa artifacts.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "stop",
      description: "Stop when the itinerary is filled.",
      parameters: { type: "object", properties: {} },
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
          hotel:
            "1. 请输入您的住宿地 / 每日行程起点。也可点「跳过这一题」，按不设起点规划。",
          start_time:
            "2. 每天行程开始时间？也可点「跳过这一题」，按上午 09:00 规划。",
          must_see:
            "3. 必去点：可多选，也可手动输入。也可点「跳过这一题」，按不设必去点规划。",
          other: "4. 其他要求？也可点「跳过这一题」。",
        }
      : {
          hotel:
            "1. Enter your stay or daily origin. You can skip this question — the trip is planned without an origin.",
          start_time:
            "2. Daily start time? You can skip this question — the trip starts at 09:00.",
          must_see:
            "3. Must-see places: multi-select or type. You can skip this question — the trip is planned without must-sees.",
          other: "4. Anything else? You can skip this question.",
        };
  return {
    questions: [
      { id: "hotel", prompt: prompts.hotel },
      { id: "start_time", prompt: prompts.start_time },
      { id: "must_see", prompt: prompts.must_see, multi: true },
      { id: "other", prompt: prompts.other },
    ],
  };
}

function attachCollectedChips(
  need: PlanTripNeedInput,
  collected: PlaceCard[],
): PlanTripNeedInput {
  const chips = capClusterOccupancy(dedupeByCluster(collected), 3).slice(
    0,
    MUST_SEE_LIMIT,
  );
  const options = chips
    .map((c) => {
      const label = mustSeeChipLabel(c);
      if (!label) return null;
      return { id: c.name.trim() || label, label };
    })
    .filter((o): o is { id: string; label: string } => Boolean(o));
  if (!options.length) return need;
  return {
    questions: need.questions.map((q) => {
      if (q.id !== "must_see") return q;
      if (q.options?.length) return q;
      return {
        ...q,
        multi: true,
        options,
      };
    }),
  };
}

/** Chip UI label: nominate short name when present (vendor name stays on card). */
export function mustSeeChipLabel(card: PlaceCard): string {
  return (card.nominated_name?.trim() || card.name?.trim() || "").trim();
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

function hasMapPin(card: PlaceCard): boolean {
  const lat = card.location?.lat;
  const lng = card.location?.lng;
  return Number.isFinite(lat) && Number.isFinite(lng);
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

function intakeEligible(
  cards: PlaceCard[],
  anchor: { lat: number; lng: number } | null,
): PlaceCard[] {
  return filterEligibleAttractions(cards)
    .filter((c) => hasMapPin(c))
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

/** Widen attraction pool beyond must_see chips so skeleton LLM has day density. */
async function expandPlacesForSkeleton(
  input: PlanTripInput,
  locale: Locale,
  state: LoopState,
  existing: PlaceCard[],
): Promise<PlaceCard[]> {
  const normalizeName = (n?: string) => (n ?? "").trim().toLowerCase();
  const keyOf = (c: PlaceCard) =>
    c.sources?.[0]?.native_id?.trim() || `${c.provider}:${normalizeName(c.name)}`;
  const byKey = new Map<string, PlaceCard>();
  for (const c of existing) byKey.set(keyOf(c), c);

  const fn = input._testSearchPlaces ?? searchPlaces;
  for (const query of recoverQueries(input.city, locale)) {
    try {
      const result = await fn({
        query,
        address: input.city,
        locale,
        near: state.anchor ?? undefined,
      });
      for (const c of intakeEligible(result.data ?? [], state.anchor)) {
        const k = keyOf(c);
        if (!byKey.has(k)) byKey.set(k, c);
      }
    } catch {
      /* keep existing */
    }
  }
  return [...byKey.values()];
}

function systemPrompt(city: string, locale: Locale): string {
  return [
    "You are places-agent planning intake. The host already gave a destination city.",
    `City: ${city}. Locale: ${locale}.`,
    placesOntologyPrompt(locale),
    "Hold the loop. Call tools until chips are committed, then stop.",
    "1. geocode the city (omit providers[]).",
    "2. search_places for must-see venues that pin on the map (omit providers[]). Prefer specific venue names, not whole lakes/streets/districts. When the trip is long enough (about 3+ days), include at least one reachable day or half-day trip. Do not invent city tables. One chip per landmark cluster.",
    "3. On mainland China use Chinese POI names, not generic area labels that match shops/hotels.",
    "4. commit_trip with only search-hit names. Never commit ungrounded names. Do not commit hotels or shops.",
    "5. Only after search/commit: ask_user with all four questions at once: hotel (verified stay options), start_time, must_see (search-hit chips, multi), other. Put search-hit names in must_see.options. Do not invent chips. Prefer not to ask_user before any search_places.",
    "6. After ask_user, stop. Caller will resubmit answers on the same trip_id.",
    "Do not invent coordinates. Do not write a skeleton.",
  ].join("\n");
}

function fullSystemPrompt(input: PlanTripInput, locale: Locale): string {
  return [
    "You are places-agent scheduling. Trip bounds: city, numDays, origin, pace, budget.",
    `City: ${input.city}. Days: ${input.numDays}. Origin: ${input.origin?.name ?? "unknown"}. Locale: ${locale}.`,
    placesOntologyPrompt(locale),
    "Candidates pool already has must_see chips. Build a complete itinerary:",
    "1. resolve_origin_stay (once).",
    "2. search_places to widen pool if density low.",
    "3. make_itinerary to lay skeleton.",
    "4. plan_next_stop for each stop until trip_complete.",
    "5. commit_artifacts for tips/visa.",
    "6. stop.",
    "You choose the next tool each turn. Do not skip make_itinerary.",
    "Do not repeat the same physical place (ADR-058). Stop when filled.",
  ].join("\n");
}

function defaultFullLoopTurns(): PlanTripTurn[] {
  const fills: PlanTripTurn[] = Array.from({ length: 20 }, () => ({
    type: "tool" as const,
    name: "plan_next_stop",
    args: {},
  }));
  return [
    { type: "tool", name: "resolve_origin_stay", args: {} },
    { type: "tool", name: "search_places", args: {} },
    { type: "tool", name: "make_itinerary", args: {} },
    ...fills,
    { type: "tool", name: "commit_artifacts", args: {} },
    { type: "stop" },
  ];
}

function secondsSince(t0: number): number {
  return Math.round(((Date.now() - t0) / 1000) * 100) / 100;
}

function asPlaceCards(raw: unknown): PlaceCard[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((c): c is PlaceCard => Boolean(c && typeof c === "object"));
}

function toPlanStop(s: {
  name?: string;
  kind?: string;
  meal_slot?: string;
  provider?: string;
  native_id?: string;
  visit_part?: string;
  end_time?: string;
}): PlanStopPoint {
  const kind =
    s.kind === "stay" || s.kind === "attraction" || s.kind === "meal" ? s.kind : undefined;
  const stop: PlanStopPoint = {
    name: s.name ?? s.meal_slot ?? "stop",
    kind,
    meal_slot: s.meal_slot as PlanStopPoint["meal_slot"],
    provider: s.provider,
    native_id: s.native_id,
    visit_part: s.visit_part as PlanStopPoint["visit_part"],
  };
  if (s.end_time) stop.end_time = s.end_time;
  return stop;
}

function asMakeBudget(v: string | undefined): "budget" | "premium" | undefined {
  return v === "budget" || v === "premium" ? v : undefined;
}

type LoopState = {
  collected: PlaceCard[];
  anchor: { lat: number; lng: number } | null;
  committed: boolean;
  asked: PlanTripNeedInput | null;
};

type FullLoopCtx = {
  originStay: PlaceCard | null;
  skeleton: ItinerarySkeleton | null;
  filledStops: PlanTripFilledStop[];
  artifacts: Record<string, unknown>;
  nextArgs: Record<string, unknown> | undefined;
  pool: { places: PlaceCard[]; restaurants: PlaceCard[] };
  discovered: PlaceCard[];
  done: boolean;
  tripComplete: boolean;
  fillStarted: number | null;
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
    : input.must_include?.length
      ? input.must_include
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
  selected = capClusterOccupancy(dedupeByCluster([...byId.values()]), 3).slice(
    0,
    MUST_SEE_LIMIT,
  );
  if (!selected.length) {
    return { trip_id: tripId, revision: expectedRevision ?? 1 };
  }
  for (const card of selected) {
    card.must_see = true;
  }
  const withPhotos = await resolveDisplayPhotosForCards(selected);
  // ADR-056: backfill city stops pool after photos resolve, before trip write.
  await safeUpsertEligiblePois(withPhotos, {
    city: input.city,
    lat: state.anchor?.lat,
    lng: state.anchor?.lng,
  });
  const written = await dualWriteTrip({
    callerKey: input.callerKey,
    tripId,
    expectedRevision,
    locale,
    candidatesWrite: "replace",
    patch: {
      constraints: {
        city: input.city,
        ...(input.numDays ? { numDays: input.numDays } : {}),
        ...(input.pace ? { pace: input.pace } : {}),
        ...(input.budget ? { budget: input.budget } : {}),
        ...(input.transit_preference
          ? { transit_preference: input.transit_preference }
          : {}),
        ...(input.trip_type ? { trip_type: input.trip_type } : {}),
        ...(input.bounds ? { bounds: input.bounds } : {}),
        ...(input.must_include?.length ? { must_include: input.must_include } : {}),
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
      .map((q): PlanTripNeedQuestion | null => {
        if (!q || typeof q !== "object") return null;
        const row = q as {
          id?: unknown;
          prompt?: unknown;
          multi?: unknown;
          options?: unknown;
        };
        if (typeof row.id !== "string" || typeof row.prompt !== "string") return null;
        const options = Array.isArray(row.options)
          ? row.options
              .map((o): PlanTripNeedOption | null => {
                if (!o || typeof o !== "object") return null;
                const opt = o as { id?: unknown; label?: unknown };
                if (typeof opt.label !== "string") return null;
                const id = typeof opt.id === "string" ? opt.id : opt.label;
                return { id, label: opt.label };
              })
              .filter((o): o is PlanTripNeedOption => o != null)
          : undefined;
        return {
          id: row.id,
          prompt: row.prompt,
          ...(row.multi === true ? { multi: true } : {}),
          ...(options?.length ? { options } : {}),
        };
      })
      .filter((q): q is PlanTripNeedQuestion => q != null);
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

function registryChipEligible(
  cards: PlaceCard[],
  anchor: { lat: number; lng: number } | null,
): PlaceCard[] {
  return filterEligibleAttractions(cards)
    .filter((c) => hasMapPin(c))
    .filter((c) => !isLodgingPlace(c))
    .filter((c) => filterDiningPlaces([c]).length === 0)
    .filter((c) => withinCityRadius(c, anchor));
}

async function seedCollectedFromCityRegistry(
  input: PlanTripInput,
  locale: Locale,
  state: LoopState,
): Promise<void> {
  if (!state.anchor) {
    await runGeocode({ query: input.city }, input, locale, state);
  }
  if (state.anchor) {
    state.collected = registryChipEligible(state.collected, state.anchor);
  }
  if (state.collected.length) return;
  if (!state.anchor) return;

  const listFn = input._testListPois ?? listPoisForDestination;
  let cards: PlaceCard[] = [];
  try {
    cards = await listFn({
      city: input.city,
      lat: state.anchor.lat,
      lng: state.anchor.lng,
    });
  } catch {
    return;
  }
  state.collected = registryChipEligible(cards, state.anchor).slice(0, MUST_SEE_LIMIT);
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
  tools: OpenAI.Chat.Completions.ChatCompletionTool[] = TOOL_DEFS,
): Promise<OpenAI.Chat.Completions.ChatCompletionMessage> {
  const completion = await withAbortTimeout(LLM_TIMEOUT_MS, (signal) =>
    openai.chat.completions.create(
      {
        model: configuredChatModel(),
        messages: history,
        tools,
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

async function loadExistingMustSee(
  input: PlanTripInput,
): Promise<PlaceCard[]> {
  if (!input.trip_id) return [];
  try {
    const doc = await getTripOrThrow(input.callerKey, input.trip_id);
    const places =
      (doc.candidates as { places?: PlaceCard[] } | null)?.places ?? [];
    return places.filter((p) => p.must_see === true && hasMapPin(p));
  } catch {
    return [];
  }
}

/** Same trip_id (e.g. locale switch): reuse committed must_see chips — no re-search. */
async function seedExistingMustSeeChips(
  input: PlanTripInput,
  state: LoopState,
): Promise<void> {
  const existing = await loadExistingMustSee(input);
  if (!existing.length) return;
  state.collected = dedupeByCluster([...state.collected, ...existing]);
}

async function runIntakeLoop(
  input: PlanTripInput,
  locale: Locale,
  tripId: string,
  revisionRef: { current?: number },
  state: LoopState,
  toolCalls: string[],
): Promise<void> {
  const fixture =
    Boolean(input._testTurns) ||
    Boolean(input._testGeocode) ||
    Boolean(input._testSearchPlaces) ||
    useFixtureLlm();
  const turns = input._testTurns ?? (fixture ? defaultFixtureTurns(input.city) : null);
  const openai = fixture ? null : createOpenAI();

  await seedExistingMustSeeChips(input, state);

  if (turns) {
    for (const turn of turns) {
      if (turn.type === "stop") break;
      toolCalls.push(turn.name);
      await executeInternal(
        turn.name,
        turn.args,
        input,
        locale,
        tripId,
        revisionRef,
        state,
      );
      if (state.asked) break;
    }
  } else if (openai) {
    const history: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt(input.city, locale) },
      { role: "user", content: `Plan intake chips for ${input.city}.` },
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
          tripId,
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
  await seedCollectedFromCityRegistry(input, locale, state);
  if (!state.committed && state.collected.length) {
    const written = await commitTripInternal(
      input.must_include?.length ? { names: input.must_include } : {},
      input,
      locale,
      tripId,
      revisionRef.current,
      state,
    );
    revisionRef.current = written.revision;
  }
}

async function resolveOriginStay(
  input: PlanTripInput,
  locale: Locale,
  state: LoopState,
): Promise<PlaceCard | null> {
  if (!input.origin?.name) return null;
  const resolve = input._testResolveStay ?? resolveStayDisplayCard;
  const stop: PlanStopPoint = {
    name: input.origin.name,
    kind: "stay",
    lat: input.origin.lat,
    lng: input.origin.lng,
  };
  return resolve({
    stop,
    pool: [],
    city: input.city,
    near: state.anchor
      ? { lat: state.anchor.lat, lng: state.anchor.lng, crs: "WGS84" }
      : input.origin.lat != null && input.origin.lng != null
        ? { lat: input.origin.lat, lng: input.origin.lng, crs: "WGS84" }
        : null,
    locale,
    _testSearchPlaces: input._testSearchPlaces
      ? async (opts) => {
          const res = await input._testSearchPlaces!({
            query: opts.query,
            address: opts.address,
            near: opts.near,
            locale,
          });
          return res.data ?? [];
        }
      : undefined,
  });
}

function emptyFullCtx(): FullLoopCtx {
  return {
    originStay: null,
    skeleton: null,
    filledStops: [],
    artifacts: {},
    nextArgs: undefined,
    pool: { places: [], restaurants: [] },
    discovered: [],
    done: false,
    tripComplete: false,
    fillStarted: null,
  };
}

function rememberDiscovered(ctx: FullLoopCtx, cards: PlaceCard[]): void {
  const keyOf = (c: PlaceCard) =>
    c.sources?.[0]?.native_id?.trim() || `${c.provider}:${c.name}`;
  const seen = new Set(ctx.discovered.map(keyOf));
  for (const card of intakeEligible(cards, null)) {
    const k = keyOf(card);
    if (seen.has(k)) continue;
    seen.add(k);
    ctx.discovered.push(card);
  }
}

async function executeFullTool(
  name: string,
  _args: Record<string, unknown>,
  input: PlanTripInput,
  locale: Locale,
  tripId: string,
  revisionRef: { current?: number },
  state: LoopState,
  ctx: FullLoopCtx,
  timing: PlanTripTiming,
): Promise<unknown> {
  if (name === "stop") {
    ctx.done = true;
    return { stopped: true };
  }
  if (name === "resolve_origin_stay") {
    const tOrigin = Date.now();
    const originStay = await resolveOriginStay(input, locale, state);
    if (!originStay) return { error: "origin_stay_unresolved" };
    ctx.originStay = originStay;
    const originWritten = await dualWriteTrip({
      callerKey: input.callerKey,
      tripId,
      expectedRevision: revisionRef.current,
      locale,
      patch: {
        constraints: {
          city: input.city,
          numDays: input.numDays,
          pace: input.pace,
          budget: input.budget,
          transit_preference: input.transit_preference,
          trip_type: input.trip_type,
          bounds: input.bounds,
          must_include: input.must_include,
          origin: {
            name: originStay.name,
            lat: originStay.location?.lat,
            lng: originStay.location?.lng,
          },
          originStay: originStay as unknown as Record<string, unknown>,
        },
      },
    });
    revisionRef.current = originWritten.revision;
    timing.origin_s = secondsSince(tOrigin);
    return { name: originStay.name, lat: originStay.location?.lat, lng: originStay.location?.lng };
  }
  if (name === "search_places") {
    const doc = await getTripOrThrow(input.callerKey, tripId);
    const candidatesRaw = (doc.candidates ?? {}) as {
      places?: unknown;
      restaurants?: unknown;
    };
    const seedPlaces = asPlaceCards(candidatesRaw.places);
    const expandedPlaces = await expandPlacesForSkeleton(input, locale, state, seedPlaces);
    rememberDiscovered(ctx, expandedPlaces);
    if (expandedPlaces.length > seedPlaces.length) {
      const expandedWrite = await dualWriteTrip({
        callerKey: input.callerKey,
        tripId,
        expectedRevision: revisionRef.current,
        locale,
        candidatesWrite: "replace",
        patch: {
          candidates: slimCandidatesForStore({
            places: expandedPlaces as unknown as Array<Record<string, unknown>>,
            restaurants: asPlaceCards(candidatesRaw.restaurants) as unknown as Array<
              Record<string, unknown>
            >,
          }),
        },
      });
      revisionRef.current = expandedWrite.revision;
    }
    return { pool_size: expandedPlaces.length };
  }
  if (name === "make_itinerary") {
    if (!ctx.originStay) {
      const origin = await resolveOriginStay(input, locale, state);
      if (!origin) return { error: "origin_stay_required" };
      ctx.originStay = origin;
    }
    const tSkeleton = Date.now();
    const doc = await getTripOrThrow(input.callerKey, tripId);
    const candidatesRaw = (doc.candidates ?? {}) as {
      places?: unknown;
      restaurants?: unknown;
    };
    const seedPlaces = asPlaceCards(candidatesRaw.places);
    const expandedPlaces =
      seedPlaces.length > 0
        ? seedPlaces
        : await expandPlacesForSkeleton(input, locale, state, seedPlaces);
    rememberDiscovered(ctx, expandedPlaces);
    const candidates = {
      places: expandedPlaces,
      restaurants: asPlaceCards(candidatesRaw.restaurants),
    };
    const nlParts = [
      input.trip_type,
      input.transit_preference,
      input.pace ? `pace=${input.pace}` : undefined,
      input.budget ? `budget=${input.budget}` : undefined,
    ].filter(Boolean);
    const makeInput: MakeItineraryInput = {
      city: input.city,
      numDays: input.numDays!,
      candidates,
      origin: {
        name: ctx.originStay.name,
        lat: ctx.originStay.location?.lat,
        lng: ctx.originStay.location?.lng,
      },
      pace: input.pace,
      budget: asMakeBudget(input.budget),
      must_include: input.must_include,
      natural_language: nlParts.join("；") || undefined,
      locale,
    };
    const makeFn =
      input._testMakeItinerary ??
      (async (mi: MakeItineraryInput) =>
        makeItinerary(mi, { create: createSkeletonChatCreate() ?? undefined }));
    const SKELETON_OUTER_ATTEMPTS = 3;
    let made: MakeItineraryResult | undefined;
    let skeletonErr: unknown;
    for (let attempt = 0; attempt < SKELETON_OUTER_ATTEMPTS; attempt++) {
      try {
        made = await makeFn(makeInput);
        skeletonErr = undefined;
        break;
      } catch (err) {
        skeletonErr = err;
        console.error(
          `plan_trip: make_itinerary attempt ${attempt + 1}/${SKELETON_OUTER_ATTEMPTS} failed`,
          err instanceof Error ? err.message : err,
        );
      }
    }
    if (!made) {
      throw skeletonErr instanceof Error
        ? skeletonErr
        : new Error("plan_trip: make_itinerary failed");
    }
    const skeletonWritten = await dualWriteTrip({
      callerKey: input.callerKey,
      tripId,
      expectedRevision: revisionRef.current,
      locale,
      candidatesWrite: "replace",
      patch: {
        skeleton: made.skeleton as unknown as Record<string, unknown>,
        candidates: slimCandidatesForStore({
          places: made.candidates_slim.places as unknown as Array<Record<string, unknown>>,
          restaurants:
            made.candidates_slim.restaurants as unknown as Array<Record<string, unknown>>,
        }),
      },
    });
    revisionRef.current = skeletonWritten.revision;
    timing.skeleton_s = secondsSince(tSkeleton);
    ctx.skeleton = made.skeleton;
    rememberDiscovered(ctx, made.candidates_slim.places);
    const handoff = skeletonFillHandoff(
      ctx.skeleton,
      locale,
      input.city,
      { trip_id: tripId, revision: revisionRef.current },
    );
    ctx.nextArgs = handoff.next_tool_call?.arguments as Record<string, unknown> | undefined;
    const poolDoc = await getTripOrThrow(input.callerKey, tripId);
    const poolRaw = (poolDoc.candidates ?? {}) as {
      places?: unknown;
      restaurants?: unknown;
    };
    ctx.pool = {
      places: [ctx.originStay, ...asPlaceCards(poolRaw.places)],
      restaurants: asPlaceCards(poolRaw.restaurants),
    };
    return { days: ctx.skeleton.days.length, next: Boolean(ctx.nextArgs) };
  }
  if (name === "plan_next_stop") {
    if (!ctx.skeleton) return { error: "skeleton_required" };
    if (ctx.tripComplete || !ctx.nextArgs) {
      ctx.tripComplete = true;
      return { trip_complete: true };
    }
    if (ctx.fillStarted == null) ctx.fillStarted = Date.now();
    const fillFn = input._testPlanNextStopFill ?? planNextStopFill;
    const nextArgs = ctx.nextArgs;
    const cursor = nextArgs.cursor as { day_index: number; stop_index: number } | undefined;
    const dayStops =
      ctx.skeleton.days.find((d) => d.day_index === cursor?.day_index)?.stops ?? [];
    const fillInput: PlanNextStopFillInput = {
      origin_mode: nextArgs.origin_mode === true,
      with_stop_display: true,
      current_stop: nextArgs.current_stop
        ? toPlanStop(nextArgs.current_stop as PlanStopPoint)
        : undefined,
      next_stop: toPlanStop(nextArgs.next_stop as PlanStopPoint),
      candidates: ctx.pool,
      city: input.city,
      anchor: state.anchor
        ? { lat: state.anchor.lat, lng: state.anchor.lng, crs: "WGS84" }
        : undefined,
      transit_preference: input.transit_preference,
      pace: input.pace,
      budget: asMakeBudget(input.budget),
      time_from: typeof nextArgs.time_from === "string" ? nextArgs.time_from : undefined,
      stay_role: nextArgs.stay_role as PlanNextStopFillInput["stay_role"],
      day_stops: dayStops.map((s) => slimStop(s)),
      locale,
      _testSearchPlaces: input._testSearchPlaces
        ? async (opts) => {
            const res = await input._testSearchPlaces!({
              query: opts.query,
              address: opts.address,
              near: opts.near,
              locale,
            });
            return res.data ?? [];
          }
        : undefined,
      _testGeocode: input._testGeocode
        ? async (query: string) => {
            const res = await input._testGeocode!({ query, locale });
            const hit = res.data;
            if (hit && Number.isFinite(hit.lat) && Number.isFinite(hit.lng)) {
              return { lat: hit.lat, lng: hit.lng };
            }
            return null;
          }
        : undefined,
    };
    const filled = await fillFn(fillInput);
    if (filled.skeleton_patched && filled.patched_day_stops && cursor) {
      ctx.skeleton = {
        ...ctx.skeleton,
        days: ctx.skeleton.days.map((d) =>
          d.day_index === cursor.day_index
            ? {
                ...d,
                stops: filled.patched_day_stops!.map((s) => ({
                  name: s.name,
                  kind: (s.kind as "stay" | "attraction" | "meal") ?? "attraction",
                  meal_slot: s.meal_slot as "lunch" | "dinner" | "afternoon_tea" | undefined,
                  provider: s.provider,
                  native_id: s.native_id,
                })),
              }
            : d,
        ),
      };
      const patchedWrite = await dualWriteTrip({
        callerKey: input.callerKey,
        tripId,
        expectedRevision: revisionRef.current,
        locale,
        patch: {
          skeleton: ctx.skeleton as unknown as Record<string, unknown>,
        },
      });
      revisionRef.current = patchedWrite.revision;
    }
    if (filled.venue_card) {
      ctx.pool = {
        ...ctx.pool,
        restaurants: [...ctx.pool.restaurants, filled.venue_card],
      };
    }
    const display = filled.stop_display;
    if (cursor && !filled.skeleton_patched) {
      ctx.filledStops.push({
        day_index: cursor.day_index,
        stop_index: cursor.stop_index,
        stop: display?.stop ?? nextArgs.next_stop,
        slot: display?.slot,
        legs: filled.legs,
        notes: display?.notes,
      });
      const fillWrite = await dualWriteTrip({
        callerKey: input.callerKey,
        tripId,
        expectedRevision: revisionRef.current,
        locale,
        patch: {
          filled: {
            stop: nextArgs.next_stop,
            slot: display?.slot,
            legs: filled.legs,
          },
          cursor,
        },
      });
      revisionRef.current = fillWrite.revision;
    }
    if (!cursor) {
      ctx.tripComplete = true;
      timing.fill_s = secondsSince(ctx.fillStarted);
      return { trip_complete: true };
    }
    const echo: SkeletonEcho = {
      days: ctx.skeleton.days.map((d) => ({
        day_index: d.day_index,
        day_theme: d.day_theme,
        stops: d.stops.map((s) => slimStop(s)),
      })),
    };
    const stepNext = nextFillStep(
      echo,
      cursor,
      locale,
      display?.slot?.end,
      input.city,
    );
    if (stepNext.next_action === "trip_complete") {
      ctx.nextArgs = undefined;
      ctx.tripComplete = true;
      timing.fill_s = secondsSince(ctx.fillStarted);
      return { trip_complete: true, filled: ctx.filledStops.length };
    }
    ctx.nextArgs = stepNext.next_tool_call.arguments;
    timing.fill_s = secondsSince(ctx.fillStarted);
    return { trip_complete: false, filled: ctx.filledStops.length };
  }
  if (name === "commit_artifacts") {
    if (!ctx.skeleton) return { error: "skeleton_required" };
    const tTips = Date.now();
    const tipsInput: TravelTipsInput = {
      destination: input.city,
      bounds: input.bounds,
      trip_type: input.trip_type,
      pace: input.pace,
      skeleton: ctx.skeleton,
      constraints: [input.transit_preference, input.trip_type].filter(Boolean).join("；") || undefined,
      locale,
    };
    let tips: TravelTipsResult | null = null;
    try {
      tips = input._testTravelTips
        ? await input._testTravelTips(tipsInput)
        : await travelTips(tipsInput);
    } catch {
      tips = null;
    }
    let artifacts: Record<string, unknown> = {};
    if (tips) {
      artifacts = { ...artifacts, ...artifactsTipsPatch(tips) };
    }
    try {
      const visa = await visaRequirement({
        passport: "CHN",
        destination: "CHN",
        locale,
      });
      if (visa.data || visa.outcomeKey) {
        artifacts = {
          ...artifacts,
          ...artifactsVisaPatch(visa.data, visa.outcomeKey),
        };
      }
    } catch {
      /* visa optional */
    }
    ctx.artifacts = artifacts;
    if (Object.keys(artifacts).length) {
      const artWrite = await dualWriteTrip({
        callerKey: input.callerKey,
        tripId,
        expectedRevision: revisionRef.current,
        locale,
        patch: { artifacts },
      });
      revisionRef.current = artWrite.revision;
    }
    timing.tips_s = secondsSince(tTips);
    return { artifacts: Object.keys(artifacts) };
  }
  return { error: `unknown_tool:${name}` };
}

async function runFullLoopAgent(
  input: PlanTripInput,
  locale: Locale,
  tripId: string,
  revisionRef: { current?: number },
  state: LoopState,
  toolCalls: string[],
  timing: PlanTripTiming,
): Promise<PlanTripResult["itinerary"] | null> {
  if (!input.numDays || !input.origin?.name) return null;
  const ctx = emptyFullCtx();
  const fixture =
    Boolean(input._testFullLoopTurns) ||
    Boolean(input._testMakeItinerary) ||
    Boolean(input._testPlanNextStopFill) ||
    Boolean(input._testGeocode) ||
    Boolean(input._testSearchPlaces) ||
    useFixtureLlm();
  const turns = input._testFullLoopTurns ?? (fixture ? defaultFullLoopTurns() : null);
  const openai = fixture ? null : createOpenAI();

  const runOne = async (name: string, args: Record<string, unknown>) => {
    toolCalls.push(name);
    return executeFullTool(
      name,
      args,
      input,
      locale,
      tripId,
      revisionRef,
      state,
      ctx,
      timing,
    );
  };

  if (turns) {
    for (const turn of turns) {
      if (turn.type === "stop") {
        ctx.done = true;
        break;
      }
      await runOne(turn.name, turn.args);
      if (ctx.done) break;
    }
  } else if (openai) {
    const history: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: "system", content: fullSystemPrompt(input, locale) },
      { role: "user", content: `Schedule a ${input.numDays}-day trip in ${input.city}.` },
    ];
    for (let i = 0; i < MAX_FULL_ITERATIONS; i++) {
      let assistant: OpenAI.Chat.Completions.ChatCompletionMessage;
      try {
        assistant = await nextLiveTurn(openai, history, FULL_TOOL_DEFS);
      } catch {
        break;
      }
      history.push(assistant);
      const calls = assistant.tool_calls ?? [];
      if (!calls.length) break;
      for (const call of calls) {
        if (call.type !== "function") continue;
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(call.function.arguments || "{}") as Record<string, unknown>;
        } catch {
          args = {};
        }
        const payload = await runOne(call.function.name, args);
        history.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(payload),
        });
        if (ctx.done) break;
      }
      if (ctx.done) break;
    }
  }

  if (ctx.discovered.length) {
    await safeUpsertEligiblePois(ctx.discovered, {
      city: input.city,
      lat: state.anchor?.lat,
      lng: state.anchor?.lng,
    });
  }
  if (!ctx.skeleton) return null;
  return {
    skeleton: ctx.skeleton,
    filledStops: ctx.filledStops,
    artifacts: Object.keys(ctx.artifacts).length ? ctx.artifacts : undefined,
  };
}

async function runFullLoop(
  input: PlanTripInput,
  locale: Locale,
  tripId: string,
  revisionRef: { current?: number },
  state: LoopState,
  toolCalls: string[],
  timing: PlanTripTiming,
): Promise<PlanTripResult["itinerary"] | null> {
  if (!input.numDays || !input.origin?.name) return null;

  const tOrigin = Date.now();
  const originStay = await resolveOriginStay(input, locale, state);
  if (!originStay) {
    return null;
  }
  const originWritten = await dualWriteTrip({
    callerKey: input.callerKey,
    tripId,
    expectedRevision: revisionRef.current,
    locale,
    patch: {
      constraints: {
        city: input.city,
        numDays: input.numDays,
        pace: input.pace,
        budget: input.budget,
        transit_preference: input.transit_preference,
        trip_type: input.trip_type,
        bounds: input.bounds,
        must_include: input.must_include,
        origin: {
          name: originStay.name,
          lat: originStay.location?.lat,
          lng: originStay.location?.lng,
        },
        originStay: originStay as unknown as Record<string, unknown>,
      },
    },
  });
  revisionRef.current = originWritten.revision;
  timing.origin_s = secondsSince(tOrigin);
  toolCalls.push("resolve_origin_stay");

  const tSkeleton = Date.now();
  const doc = await getTripOrThrow(input.callerKey, tripId);
  const candidatesRaw = (doc.candidates ?? {}) as {
    places?: unknown;
    restaurants?: unknown;
  };
  const seedPlaces = asPlaceCards(candidatesRaw.places);
  const expandedPlaces = await expandPlacesForSkeleton(
    input,
    locale,
    state,
    seedPlaces,
  );
  if (expandedPlaces.length > seedPlaces.length) {
    const expandedWrite = await dualWriteTrip({
      callerKey: input.callerKey,
      tripId,
      expectedRevision: revisionRef.current,
      locale,
      candidatesWrite: "replace",
      patch: {
        candidates: slimCandidatesForStore({
          places: expandedPlaces as unknown as Array<Record<string, unknown>>,
          restaurants: asPlaceCards(candidatesRaw.restaurants) as unknown as Array<
            Record<string, unknown>
          >,
        }),
      },
    });
    revisionRef.current = expandedWrite.revision;
    toolCalls.push("expand_candidates");
  }
  const candidates = {
    places: expandedPlaces,
    restaurants: asPlaceCards(candidatesRaw.restaurants),
  };
  const nlParts = [
    input.trip_type,
    input.transit_preference,
    input.pace ? `pace=${input.pace}` : undefined,
    input.budget ? `budget=${input.budget}` : undefined,
  ].filter(Boolean);
  const makeInput: MakeItineraryInput = {
    city: input.city,
    numDays: input.numDays,
    candidates,
    origin: {
      name: originStay.name,
      lat: originStay.location?.lat,
      lng: originStay.location?.lng,
    },
    pace: input.pace,
    budget: asMakeBudget(input.budget),
    must_include: input.must_include,
    natural_language: nlParts.join("；") || undefined,
    locale,
  };
  const makeFn =
    input._testMakeItinerary ??
    (async (mi: MakeItineraryInput) =>
      makeItinerary(mi, { create: createSkeletonChatCreate() ?? undefined }));
  // Live LLM skeletons can fail validation (duplicate venues); retry a few times.
  const SKELETON_OUTER_ATTEMPTS = 3;
  let made: MakeItineraryResult | undefined;
  let skeletonErr: unknown;
  for (let attempt = 0; attempt < SKELETON_OUTER_ATTEMPTS; attempt++) {
    try {
      made = await makeFn(makeInput);
      skeletonErr = undefined;
      break;
    } catch (err) {
      skeletonErr = err;
      console.error(
        `plan_trip: make_itinerary attempt ${attempt + 1}/${SKELETON_OUTER_ATTEMPTS} failed`,
        err instanceof Error ? err.message : err,
      );
    }
  }
  if (!made) {
    throw skeletonErr instanceof Error
      ? skeletonErr
      : new Error("plan_trip: make_itinerary failed");
  }
  toolCalls.push("make_itinerary");
  const skeletonWritten = await dualWriteTrip({
    callerKey: input.callerKey,
    tripId,
    expectedRevision: revisionRef.current,
    locale,
    candidatesWrite: "replace",
    patch: {
      skeleton: made.skeleton as unknown as Record<string, unknown>,
      candidates: slimCandidatesForStore({
        places: made.candidates_slim.places as unknown as Array<Record<string, unknown>>,
        restaurants:
          made.candidates_slim.restaurants as unknown as Array<Record<string, unknown>>,
      }),
    },
  });
  revisionRef.current = skeletonWritten.revision;
  timing.skeleton_s = secondsSince(tSkeleton);

  const tFill = Date.now();
  const filledStops: PlanTripFilledStop[] = [];
  let skeletonWorking: ItinerarySkeleton = made.skeleton;
  const handoff = skeletonFillHandoff(
    skeletonWorking,
    locale,
    input.city,
    { trip_id: tripId, revision: revisionRef.current },
  );
  let nextArgs = handoff.next_tool_call?.arguments as Record<string, unknown> | undefined;
  const fillFn = input._testPlanNextStopFill ?? planNextStopFill;
  const poolDoc = await getTripOrThrow(input.callerKey, tripId);
  const poolRaw = (poolDoc.candidates ?? {}) as {
    places?: unknown;
    restaurants?: unknown;
  };
  let pool = {
    places: [
      originStay,
      ...asPlaceCards(poolRaw.places),
    ],
    restaurants: asPlaceCards(poolRaw.restaurants),
  };

  for (let step = 0; step < MAX_FILL_STEPS && nextArgs; step++) {
    const cursor = nextArgs.cursor as { day_index: number; stop_index: number } | undefined;
    const dayStops =
      skeletonWorking.days.find((d) => d.day_index === cursor?.day_index)?.stops ??
      [];
    const fillInput: PlanNextStopFillInput = {
      origin_mode: nextArgs.origin_mode === true,
      with_stop_display: true,
      current_stop: nextArgs.current_stop
        ? toPlanStop(nextArgs.current_stop as PlanStopPoint)
        : undefined,
      next_stop: toPlanStop(nextArgs.next_stop as PlanStopPoint),
      candidates: pool,
      city: input.city,
      anchor: state.anchor
        ? { lat: state.anchor.lat, lng: state.anchor.lng, crs: "WGS84" }
        : undefined,
      transit_preference: input.transit_preference,
      pace: input.pace,
      budget: asMakeBudget(input.budget),
      time_from: typeof nextArgs.time_from === "string" ? nextArgs.time_from : undefined,
      stay_role: nextArgs.stay_role as PlanNextStopFillInput["stay_role"],
      day_stops: dayStops.map((s) => slimStop(s)),
      locale,
      _testSearchPlaces: input._testSearchPlaces
        ? async (opts) => {
            const res = await input._testSearchPlaces!({
              query: opts.query,
              address: opts.address,
              near: opts.near,
              locale,
            });
            return res.data ?? [];
          }
        : undefined,
      _testGeocode: input._testGeocode
        ? async (query: string) => {
            const res = await input._testGeocode!({ query, locale });
            const hit = res.data;
            if (hit && Number.isFinite(hit.lat) && Number.isFinite(hit.lng)) {
              return { lat: hit.lat, lng: hit.lng };
            }
            return null;
          }
        : undefined,
    };
    const filled = await fillFn(fillInput);
    toolCalls.push("plan_next_stop");

    if (filled.skeleton_patched && filled.patched_day_stops && cursor) {
      skeletonWorking = {
        ...skeletonWorking,
        days: skeletonWorking.days.map((d) =>
          d.day_index === cursor.day_index
            ? {
                ...d,
                stops: filled.patched_day_stops!.map((s) => ({
                  name: s.name,
                  kind: (s.kind as "stay" | "attraction" | "meal") ?? "attraction",
                  meal_slot: s.meal_slot as "lunch" | "dinner" | "afternoon_tea" | undefined,
                  provider: s.provider,
                  native_id: s.native_id,
                })),
              }
            : d,
        ),
      };
      const patchedWrite = await dualWriteTrip({
        callerKey: input.callerKey,
        tripId,
        expectedRevision: revisionRef.current,
        locale,
        patch: {
          skeleton: skeletonWorking as unknown as Record<string, unknown>,
        },
      });
      revisionRef.current = patchedWrite.revision;
    }

    if (filled.venue_card) {
      pool = {
        ...pool,
        restaurants: [...pool.restaurants, filled.venue_card],
      };
    }

    const display = filled.stop_display;
    if (cursor && !filled.skeleton_patched) {
      filledStops.push({
        day_index: cursor.day_index,
        stop_index: cursor.stop_index,
        stop: display?.stop ?? nextArgs.next_stop,
        slot: display?.slot,
        legs: filled.legs,
        notes: display?.notes,
      });
      const fillWrite = await dualWriteTrip({
        callerKey: input.callerKey,
        tripId,
        expectedRevision: revisionRef.current,
        locale,
        patch: {
          filled: {
            stop: nextArgs.next_stop,
            slot: display?.slot,
            legs: filled.legs,
          },
          cursor,
        },
      });
      revisionRef.current = fillWrite.revision;
    }

    if (!cursor) break;
    const echo: SkeletonEcho = {
      days: skeletonWorking.days.map((d) => ({
        day_index: d.day_index,
        day_theme: d.day_theme,
        stops: d.stops.map((s) => slimStop(s)),
      })),
    };
    const stepNext = nextFillStep(
      echo,
      cursor,
      locale,
      display?.slot?.end,
      input.city,
    );
    if (stepNext.next_action === "trip_complete") {
      nextArgs = undefined;
      break;
    }
    nextArgs = stepNext.next_tool_call.arguments;
  }
  timing.fill_s = secondsSince(tFill);

  const tTips = Date.now();
  const tipsInput: TravelTipsInput = {
    destination: input.city,
    bounds: input.bounds,
    trip_type: input.trip_type,
    pace: input.pace,
    skeleton: skeletonWorking,
    constraints: [input.transit_preference, input.trip_type].filter(Boolean).join("；") || undefined,
    locale,
  };
  let tips: TravelTipsResult | null = null;
  try {
    tips = input._testTravelTips
      ? await input._testTravelTips(tipsInput)
      : await travelTips(tipsInput);
    toolCalls.push("travel_tips");
  } catch {
    tips = null;
  }
  let artifacts: Record<string, unknown> = {};
  if (tips) {
    artifacts = { ...artifacts, ...artifactsTipsPatch(tips) };
  }
  try {
    const visa = await visaRequirement({
      passport: "CHN",
      destination: "CHN",
      locale,
    });
    if (visa.data || visa.outcomeKey) {
      artifacts = {
        ...artifacts,
        ...artifactsVisaPatch(visa.data, visa.outcomeKey),
      };
      toolCalls.push("visa_requirement");
    }
  } catch {
    /* visa optional for domestic */
  }
  if (Object.keys(artifacts).length) {
    const artWrite = await dualWriteTrip({
      callerKey: input.callerKey,
      tripId,
      expectedRevision: revisionRef.current,
      locale,
      patch: { artifacts },
    });
    revisionRef.current = artWrite.revision;
  }
  timing.tips_s = secondsSince(tTips);

  return {
    skeleton: skeletonWorking,
    filledStops,
    artifacts: Object.keys(artifacts).length ? artifacts : undefined,
  };
}

export async function planTrip(input: PlanTripInput): Promise<PlanTripResult> {
  const t0 = Date.now();
  const locale = parseLocale(input.locale);
  const city = input.city.trim();
  if (!city) {
    return {
      trip_id: input.trip_id ?? "",
      revision: input.revision ?? 1,
      status: "failed",
      timing: { intake_s: 0, total_s: 0 },
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
  const timing: PlanTripTiming = { intake_s: 0, total_s: 0 };

  const tIntake = Date.now();
  await runIntakeLoop(input, locale, ensured.trip_id, revisionRef, state, toolCalls);
  timing.intake_s = secondsSince(tIntake);

  const wantsFull = Boolean(input.numDays && input.origin?.name);
  if (!state.committed) {
    timing.total_s = secondsSince(t0);
    // Intake (no origin yet): still ask hotel / time / must-see. Do not 502 the assistant.
    if (!wantsFull) {
      return {
        trip_id: ensured.trip_id,
        revision: revisionRef.current ?? ensured.revision,
        status: "needs_input",
        need_input: attachCollectedChips(
          state.asked ?? defaultNeedInput(locale),
          state.collected,
        ),
        tool_calls: toolCalls,
        timing,
      };
    }
    return {
      trip_id: ensured.trip_id,
      revision: revisionRef.current ?? ensured.revision,
      status: "failed",
      tool_calls: toolCalls,
      timing,
    };
  }

  if (!wantsFull) {
    timing.total_s = secondsSince(t0);
  return {
    trip_id: ensured.trip_id,
    revision: revisionRef.current ?? ensured.revision,
    status: "needs_input",
      need_input: attachCollectedChips(
        state.asked ?? defaultNeedInput(locale),
        state.collected,
      ),
    tool_calls: toolCalls,
      timing,
    };
  }

  try {
    const useLegacy = process.env.PLAN_TRIP_LEGACY_FULL_LOOP === "1";
    const itinerary = useLegacy
      ? await runFullLoop(
          input,
          locale,
          ensured.trip_id,
          revisionRef,
          state,
          toolCalls,
          timing,
        )
      : await runFullLoopAgent(
          input,
          locale,
          ensured.trip_id,
          revisionRef,
          state,
          toolCalls,
          timing,
        );
    timing.total_s = secondsSince(t0);
    if (!itinerary || !itinerary.filledStops.length) {
      return {
        trip_id: ensured.trip_id,
        revision: revisionRef.current ?? ensured.revision,
        status: "failed",
        tool_calls: toolCalls,
        timing,
        itinerary: itinerary ?? undefined,
      };
    }
    return {
      trip_id: ensured.trip_id,
      revision: revisionRef.current ?? ensured.revision,
      status: "ready",
      tool_calls: toolCalls,
      timing,
      itinerary,
    };
  } catch (err) {
    console.error(
      "plan_trip: full loop failed",
      err instanceof Error ? err.message : err,
    );
    timing.total_s = secondsSince(t0);
    return {
      trip_id: ensured.trip_id,
      revision: revisionRef.current ?? ensured.revision,
      status: "failed",
      tool_calls: toolCalls,
      timing,
    };
  }
}
