/**
 * True-agent plan_trip (ADR-054 / agent-poc-01 + full loop).
 *
 * Intake: model tool loop — geocode → search_places → commit_trip.
 * Full (when numDays + origin): model act-or-stop loop
 * (resolve_origin_stay / search_places / make_itinerary / plan_next_stop /
 * commit_artifacts / stop). Legacy fixed pipeline behind PLAN_TRIP_LEGACY_FULL_LOOP=1.
 */

import OpenAI from "openai";
import { filterEligibleAttractions, isVagueAreaName } from "./eligible-attraction";
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
  nominateMustSeeViaLlm,
  useFixtureLlm,
  withAbortTimeout,
  type ItineraryChatCreate,
} from "./itinerary-planner";
import { placesOntologyPrompt, isSeasonMismatchedNominateName } from "./places-ontology";
import { parseLocale, type Locale } from "./locales";
import {
  createSkeletonChatCreate,
  makeItinerary,
  type ItinerarySkeleton,
  type MakeItineraryInput,
  type MakeItineraryResult,
} from "./make-itinerary";
import { filterDiningPlaces, isLodgingPlace } from "./place-filters";
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
import { normalizeMustIncludeToken } from "./trip-intake";
import { artifactsTipsPatch, artifactsVisaPatch } from "./trip-artifacts";
import { dualWriteTrip, slimCandidatesForStore } from "./trip-dual-write";
import { ensureTrip, getTripOrThrow } from "./trip-store";
import { geocode, searchPlaces } from "./tools";
import { travelTips, type TravelTipsInput, type TravelTipsResult } from "./travel-tips";
import type { PlaceCard, SearchInput } from "./types";
import { visaRequirement } from "./visa-requirement";
import { resolveFillTripStatus } from "./fill-trip-status";

const MAX_ITERATIONS = 8;
const MAX_FULL_ITERATIONS = 40;
const MUST_SEE_LIMIT = 8;
/** Default city grounding radius (km). Nearby day-trips within this stay local. */
export const CITY_RADIUS_KM = 80;
/** Widened radius after user affirms expand_radius (agent-discover-110d). */
export const EXPANDED_CITY_RADIUS_KM = CITY_RADIUS_KM * 2;
const LLM_TIMEOUT_MS = 60_000;
const MAX_FILL_STEPS = 80;

/** Question id for POI-scarcity expand-radius confirm (110d / 2play-plan-104). */
export const EXPAND_RADIUS_QUESTION_ID = "expand_radius" as const;

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
  /** Daily default departure time from takeoff (ADR-059). */
  start_time?: string;
  /** Free-text other requirements from takeoff (may be empty). */
  other?: string;
  /**
   * where2play MVP-T3: make/commit skeleton then stop.
   * Omit for MCP/full-loop callers (intake + fill unchanged).
   */
  skeleton_only?: boolean;
  /**
   * Answers to prior `need_input` questions (same trip_id).
   * `expand_radius`: `"yes"` / `"no"` (or option ids) — agent-discover-110d.
   * `hotel`: stay name, or `"skip"` / `"__skip__"` / `""` — MVP-T5 TD-4.
   */
  answers?: {
    expand_radius?: string | boolean;
    hotel?: string;
    [key: string]: string | boolean | string[] | undefined;
  };
  bounds?: { start: string; end: string };
  must_include?: string[];
  /** Optional map providers override (passed through to nominate/ground). */
  providers?: string[];
  /** Scripted intake loop for tests (skips live LLM). */
  _testTurns?: PlanTripTurn[];
  /** Scripted full-loop tool sequence (model-chosen order in tests). */
  _testFullLoopTurns?: PlanTripTurn[];
  _testGeocode?: typeof geocode;
  _testSearchPlaces?: typeof searchPlaces;
  _testListPois?: (anchor: DestinationAnchor) => Promise<PlaceCard[]>;
  /** Scripted OptA nominate LLM for skeleton discovery (110a). */
  _testNominateChatCreate?: ItineraryChatCreate;
  /** Override whole skeleton discovery (110a tests). */
  _testDiscoverPlacesForSkeleton?: (
    input: PlanTripInput,
    locale: Locale,
    state: { anchor: { lat: number; lng: number } | null },
    existing: PlaceCard[],
  ) => Promise<PlaceCard[]>;
  _testMakeItinerary?: (
    input: MakeItineraryInput,
  ) => Promise<MakeItineraryResult>;
  _testPlanNextStopFill?: (
    input: PlanNextStopFillInput,
  ) => Promise<PlanNextStopFillResult>;
  _testTravelTips?: (input: TravelTipsInput) => Promise<TravelTipsResult>;
  _testResolveStay?: typeof resolveStayDisplayCard;
};

export type PlanTripPhase =
  | "trip_created"
  | "skeleton_generating"
  | "skeleton_ready"
  | "failed";

export type PlanTripPhaseEvent = {
  phase: PlanTripPhase;
  trip_id?: string;
  revision?: number;
  error?: { key: string };
};

export type PlanTripResult = {
  trip_id: string;
  revision: number;
  status: PlanTripStatus;
  need_input?: PlanTripNeedInput;
  tool_calls?: string[];
  phases?: PlanTripPhaseEvent[];
  itinerary?: {
    skeleton: ItinerarySkeleton;
    filledStops: PlanTripFilledStop[];
    artifacts?: Record<string, unknown>;
    /** TD-9: model reached trip_complete before applyFillTripStatusGate. */
    fillReachedTripComplete?: boolean;
    validationPool?: {
      places: PlaceCard[];
      restaurants: PlaceCard[];
      stays: string[];
    };
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

/** S1 / TD-3 A: stop only after full fill (trip_complete). */
export const FULL_LOOP_STOP_TOOL_DESCRIPTION =
  "Stop only after every non-stay skeleton stop has been filled with plan_next_stop and the last plan_next_stop returned trip_complete. Do not stop after a partial day or a few stops. Call commit_artifacts before stop when tips/visa are ready.";

/** S1 / TD-3 B: full-loop system prompt builder (exported for unit tests). */
export function buildFullLoopSystemPrompt(
  input: PlanTripInput,
  locale: Locale,
): string {
  return [
    "You are places-agent scheduling. Trip bounds: city, numDays, origin, pace, budget.",
    `City: ${input.city}. Days: ${input.numDays}. Origin: ${input.origin?.name ?? "unknown"}. Locale: ${locale}.`,
    placesOntologyPrompt(locale),
    "Candidates pool already has must_see chips. Build a complete itinerary:",
    "1. resolve_origin_stay (once).",
    "2. search_places to widen pool if density low.",
    "3. make_itinerary to lay skeleton.",
    "4. Call plan_next_stop once per remaining skeleton stop (day by day, stop by stop) until plan_next_stop returns trip_complete. Do not call stop or commit_artifacts while unfilled skeleton stops remain.",
    "5. commit_artifacts for tips/visa only after trip_complete.",
    "6. stop only after trip_complete and commit_artifacts.",
    "You choose the next tool each turn. Do not skip make_itinerary.",
    "Do not repeat the same physical place (ADR-058).",
    "Never stop early with only a few stops filled. Partial fill is not done.",
  ].join("\n");
}

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
      description: FULL_LOOP_STOP_TOOL_DESCRIPTION,
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
  radiusKm: number = CITY_RADIUS_KM,
): boolean {
  if (!anchor) return true;
  const lat = card.location?.lat;
  const lng = card.location?.lng;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  return haversineKm(anchor, { lat, lng }) <= radiusKm;
}

/** Parse expand_radius answer: yes / no / unanswered. */
export function resolveExpandRadiusAnswer(
  answers: PlanTripInput["answers"] | undefined,
): "yes" | "no" | undefined {
  const raw = answers?.expand_radius;
  if (raw == null) return undefined;
  if (typeof raw === "boolean") return raw ? "yes" : "no";
  const s = String(raw).trim().toLowerCase();
  if (["yes", "y", "true", "1", "affirm", "expand"].includes(s)) return "yes";
  if (["no", "n", "false", "0", "decline", "skip", "local"].includes(s)) return "no";
  return undefined;
}

/** MVP-T5 TD-4: parse hotel answer — name, skip, or unanswered. */
export type HotelAnswer =
  | { kind: "name"; name: string }
  | { kind: "skip" }
  | { kind: "unanswered" };

export function resolveHotelAnswer(
  answers: PlanTripInput["answers"] | undefined,
): HotelAnswer {
  if (answers == null || answers.hotel === undefined) return { kind: "unanswered" };
  const raw = String(answers.hotel).trim();
  if (raw === "" || raw.toLowerCase() === "skip" || raw === "__skip__") {
    return { kind: "skip" };
  }
  return { kind: "name", name: raw };
}

function expandRadiusNeedInput(locale: Locale, radiusKm: number): PlanTripNeedInput {
  const isCjk = locale === "CN" || locale === "HK" || locale === "TW";
  return {
    questions: [
      {
        id: EXPAND_RADIUS_QUESTION_ID,
        prompt: isCjk
          ? `附近景点较少。是否扩大搜索范围至约 ${radiusKm} 公里（可能包含周边城市景点）？`
          : `Few attractions nearby. Expand search radius to about ${radiusKm} km (may include nearby areas)?`,
        multi: false,
        options: [
          { id: "yes", label: isCjk ? "是，扩大范围" : "Yes, expand" },
          { id: "no", label: isCjk ? "否，仅用本地" : "No, keep local only" },
        ],
      },
    ],
  };
}

function filterPlacesByRadius(
  cards: PlaceCard[],
  anchor: { lat: number; lng: number } | null,
  radiusKm: number,
): PlaceCard[] {
  return cards.filter((c) => withinCityRadius(c, anchor, radiusKm));
}

function countGroundedAttractions(cards: PlaceCard[]): number {
  // Use eligibility (ADR-042 / nominate ground), NOT discover ATTRACTION_ALLOW.
  // AMAP West Lake titles (苏堤 / 灵隐寺 / 雷峰塔景区) often lack category and
  // fail ATTRACTION_ALLOW — that falsely triggered expand_radius for Hangzhou.
  return cards.filter(
    (c) =>
      hasMapPin(c) &&
      !isLodgingPlace(c) &&
      filterDiningPlaces([c]).length === 0 &&
      filterEligibleAttractions([c]).length > 0,
  ).length;
}

/**
 * 110d: ask expand_radius when local pool is thin (attractions < days).
 * Always prompt before hard-filling a thin destination (e.g. 江阴 14d) —
 * even when expandableAttractionCount is 0 (user may decline and accept deviation).
 * Avoids auto-merging nearby-city POIs until the user affirms.
 */
export function shouldAskExpandRadius(opts: {
  localAttractionCount: number;
  expandableAttractionCount: number;
  numDays: number;
  expandAnswer: "yes" | "no" | undefined;
}): boolean {
  if (opts.expandAnswer !== undefined) return false;
  if (!(opts.numDays > 0)) return false;
  if (opts.localAttractionCount >= opts.numDays) return false;
  // expandableAttractionCount retained for callers/metrics; thin pool alone gates the ask.
  void opts.expandableAttractionCount;
  return true;
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

function intakeEligible(
  cards: PlaceCard[],
  anchor: { lat: number; lng: number } | null,
): PlaceCard[] {
  return filterEligibleAttractions(cards)
    .filter((c) => hasMapPin(c))
    .filter((c) => !isLodgingPlace(c))
    .filter((c) => filterDiningPlaces([c]).length === 0)
    .filter((c) => withinCityRadius(c, anchor));
}

const SKELETON_PREF_QUERY_CAP = 3;

/** One short preference token from free-text other — never a city POI encyclopedia. */
function pickOtherQueryToken(other: string | undefined): string | undefined {
  const t = (other ?? "").trim();
  if (!t) return undefined;
  const known = [
    "儿童",
    "親子",
    "亲子",
    "历史",
    "歷史",
    "kids",
    "children",
    "historic",
    "heritage",
  ];
  for (const kw of known) {
    if (t.toLowerCase().includes(kw.toLowerCase()) || t.includes(kw)) {
      if (kw === "親子") return "亲子";
      if (kw === "歷史") return "历史";
      return kw;
    }
  }
  const cjk = t.match(/[\u4e00-\u9fff]{2,4}/);
  if (cjk) return cjk[0];
  const word = t.match(/[A-Za-z]{3,12}/);
  return word?.[0]?.toLowerCase();
}

/**
 * Baseline museum/landmark + capped preference templates (agent-itinerary-103).
 * Destination-agnostic locale templates only (ADR-042) — no city→POI tables.
 */
export function skeletonPoolQueries(
  city: string,
  locale: Locale,
  prefs?: { trip_type?: string; other?: string },
): string[] {
  const c = city.trim();
  if (!c) return [];
  const isCjk = locale === "CN" || locale === "HK" || locale === "TW";
  const baseline = isCjk
    ? [`${c} 博物馆`, `${c} 景点`]
    : [`${c} museum`, `${c} landmark`];

  const type = (prefs?.trip_type ?? "").trim();
  const other = (prefs?.other ?? "").trim();
  const typeKey = type.toLowerCase().replace(/\s+/g, "_");
  const blob = `${type} ${other}`;

  const wantsKids =
    typeKey === "family_kids" ||
    /亲子|兒童|儿童|歲|岁|kids|children|family_kids/i.test(blob);
  const wantsFood =
    typeKey === "food_checkin" ||
    typeKey === "food" ||
    /吃喝|美食|food_checkin|food\s*check/i.test(type);
  const wantsHistory = /历史|歷史|historic|heritage|探访历史/i.test(blob);

  const extras: string[] = [];
  if (wantsKids) {
    // Prefer 主题公园 / theme park under cap (agent-itinerary-106 / ADR-066).
    if (isCjk) extras.push(`${c} 亲子`, `${c} 主题公园`, `${c} 游乐园`);
    else extras.push(`${c} kids`, `${c} theme park`, `${c} zoo`, `${c} aquarium`);
  }
  if (wantsFood) {
    if (isCjk) extras.push(`${c} 美食景点`);
    else extras.push(`${c} food attraction`);
  }
  if (wantsHistory) {
    extras.push(isCjk ? `${c} 历史` : `${c} historic`);
  }
  const otherTok = pickOtherQueryToken(other);
  if (otherTok) {
    const q = `${c} ${otherTok}`;
    if (!extras.some((e) => e.toLowerCase() === q.toLowerCase())) {
      extras.push(q);
    }
  }

  const capped = extras.slice(0, SKELETON_PREF_QUERY_CAP);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const q of [...baseline, ...capped]) {
    const k = q.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(q);
  }
  return out;
}

/** Widen attraction pool via LLM OptA nominate → clean → ground (ADR-067 / 110a). */
const DISCOVER_POOL_LIMIT = 30;

async function discoverPlacesForSkeleton(
  input: PlanTripInput,
  locale: Locale,
  state: LoopState,
  existing: PlaceCard[],
): Promise<PlaceCard[]> {
  if (input._testDiscoverPlacesForSkeleton) {
    return input._testDiscoverPlacesForSkeleton(input, locale, state, existing);
  }

  const normalizeName = (n?: string) => (n ?? "").trim().toLowerCase();
  const keyOf = (c: PlaceCard) =>
    c.sources?.[0]?.native_id?.trim() || `${c.provider}:${normalizeName(c.name)}`;
  const byKey = new Map<string, PlaceCard>();
  for (const c of existing) byKey.set(keyOf(c), c);

  const mustSeed = (input.must_include ?? [])
    .map((n) => n.trim())
    .filter(Boolean)
    .map((name) =>
      existing.find(
        (p) => normalizeMustIncludeToken(p.name) === normalizeMustIncludeToken(name),
      ),
    )
    .filter((c): c is PlaceCard => Boolean(c));
  for (const c of mustSeed) byKey.set(keyOf(c), c);

  if (!state.anchor) {
    await runGeocode({ query: input.city }, input, locale, state);
  }
  const near = state.anchor ?? undefined;
  const anchor: DestinationAnchor = {
    city: input.city,
    lat: near?.lat,
    lng: near?.lng,
  };

  // C5: one registry list for cache hits (passed as existingPool to nominate).
  const listFn = input._testListPois ?? listPoisForDestination;
  let registered: PlaceCard[] = [];
  try {
    registered = await listFn(anchor);
  } catch {
    registered = [];
  }
  const registryNative = new Set(
    registered
      .map((c) => c.sources?.[0]?.native_id?.trim())
      .filter((id): id is string => Boolean(id)),
  );

  const grounded = await nominateMustSeeViaLlm({
    city: input.city,
    locale,
    numDays: input.numDays ?? 1,
    limit: DISCOVER_POOL_LIMIT,
    existingPool: registered,
    providers: input.providers,
    near,
    trip_type: input.trip_type,
    pace: input.pace,
    budget: input.budget,
    party_size: input.party_size,
    transit_preference: input.transit_preference,
    bounds: input.bounds,
    origin_name: input.origin?.name,
    must_include: input.must_include,
    other: input.other,
    start_time: input.start_time,
    maxPerCluster: DISCOVER_POOL_LIMIT,
    _testChatCreate: input._testNominateChatCreate,
    _testSearchPlaces: input._testSearchPlaces,
  });

  if (!grounded.length) {
    // C6: LLM empty / timeout — do not hang; proceed with existing (may be empty).
    console.warn(
      "plan_trip: discoverPlacesForSkeleton — nominate returned empty; proceeding with existing candidates",
    );
    return [...byKey.values()].slice(0, DISCOVER_POOL_LIMIT);
  }

  const toUpsert: PlaceCard[] = [];
  let added = 0;
  for (const card of grounded) {
    if (added >= DISCOVER_POOL_LIMIT) break;
    const label = card.nominated_name ?? card.name;
    if (isVagueAreaName(label) || isVagueAreaName(card.name)) continue;
    if (isSeasonMismatchedNominateName(label, input.bounds)) continue;
    if (isSeasonMismatchedNominateName(card.name, input.bounds)) continue;
    const eligible = filterEligibleAttractions([card]);
    if (!eligible.length) {
      console.warn(
        `plan_trip: discoverPlacesForSkeleton — dropped ineligible card: ${card.name}`,
      );
      continue;
    }
    const next = eligible[0]!;
    const k = keyOf(next);
    if (byKey.has(k)) continue;
    byKey.set(k, next);
    added += 1;
    const nid = next.sources?.[0]?.native_id?.trim();
    if (!nid || !registryNative.has(nid)) {
      toUpsert.push(next);
    }
  }

  if (toUpsert.length) {
    await safeUpsertEligiblePois(toUpsert, anchor);
  }

  return [...byKey.values()].slice(0, DISCOVER_POOL_LIMIT);
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
  return buildFullLoopSystemPrompt(input, locale);
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
  for (const query of skeletonPoolQueries(input.city, locale, {
    trip_type: input.trip_type,
    other: input.other,
  })) {
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
    // ADR-069: chips are the committed candidates pool (no must_see heat flag).
    return places.filter((p) => hasMapPin(p));
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

/** Name-only stay when lodging search/pick fails — keeps full loop moving (TD-5). */
function nameOnlyOriginStay(input: PlanTripInput, state: LoopState): PlaceCard | null {
  if (!input.origin?.name) return null;
  return {
    // Destination-agnostic default (ADR-026 "other" → Google); not a China AMAP assumption.
    provider: "GOOGLE_MAPS",
    name: input.origin.name,
    location:
      input.origin.lat != null && input.origin.lng != null
        ? { lat: input.origin.lat, lng: input.origin.lng, crs: "WGS84" }
        : state.anchor
          ? { lat: state.anchor.lat, lng: state.anchor.lng, crs: "WGS84" }
          : { lat: 0, lng: 0, crs: "WGS84" },
    sources: [],
  };
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
    providers: input.providers,
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
    // Once-guard: do not re-search / burn iterations when stay already settled (TD-5).
    if (ctx.originStay) {
      return {
        name: ctx.originStay.name,
        lat: ctx.originStay.location?.lat,
        lng: ctx.originStay.location?.lng,
        already_resolved: true,
      };
    }
    const tOrigin = Date.now();
    let originStay = await resolveOriginStay(input, locale, state);
    let degraded = false;
    if (!originStay) {
      originStay = nameOnlyOriginStay(input, state);
      degraded = Boolean(originStay);
    }
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
    return {
      name: originStay.name,
      lat: originStay.location?.lat,
      lng: originStay.location?.lng,
      ...(degraded ? { degraded: true, reason: "origin_stay_name_only" } : {}),
    };
  }
  if (name === "search_places") {
    const doc = await getTripOrThrow(input.callerKey, tripId);
    const candidatesRaw = (doc.candidates ?? {}) as {
      places?: unknown;
      restaurants?: unknown;
    };
    const seedPlaces = asPlaceCards(candidatesRaw.places);
    const expandedPlaces = await discoverPlacesForSkeleton(input, locale, state, seedPlaces);
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
      const origin =
        (await resolveOriginStay(input, locale, state)) ?? nameOnlyOriginStay(input, state);
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
        : await discoverPlacesForSkeleton(input, locale, state, seedPlaces);
    rememberDiscovered(ctx, expandedPlaces);
    const candidates = {
      places: expandedPlaces,
      restaurants: asPlaceCards(candidatesRaw.restaurants),
    };
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
      budget: input.budget,
      must_include: input.must_include,
      trip_type: input.trip_type,
      party_size: input.party_size,
      transit_preference: input.transit_preference,
      start_time: input.start_time,
      other: input.other,
      bounds: input.bounds,
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
    fillReachedTripComplete: ctx.tripComplete,
    validationPool: {
      places: ctx.pool.places,
      restaurants: ctx.pool.restaurants,
      stays: ctx.originStay?.name ? [ctx.originStay.name] : [],
    },
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
  opts?: { stopAfterSkeleton?: boolean },
): Promise<PlanTripResult["itinerary"] | null> {
  if (!input.numDays) return null;
  // Full fill loop still needs a stay origin; skeleton-only may proceed without one.
  if (!opts?.stopAfterSkeleton && !input.origin?.name) return null;

  const tOrigin = Date.now();
  let originStay: PlaceCard | null = null;
  if (input.origin?.name) {
    originStay = await resolveOriginStay(input, locale, state);
    // Name-only fallback: lodging search miss must not abort skeleton (Tokyo CN title / custom hotel).
    if (!originStay) {
      originStay = nameOnlyOriginStay(input, state);
    }
  }
  if (!originStay && !opts?.stopAfterSkeleton) {
    return null;
  }
  if (originStay) {
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
        ...(typeof input.party_size === "number" ? { party_size: input.party_size } : {}),
        ...(input.start_time?.trim() ? { start_time: input.start_time.trim() } : {}),
        ...(input.other != null ? { other: input.other } : {}),
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
  } else {
    timing.origin_s = secondsSince(tOrigin);
  }

  const tSkeleton = Date.now();
  const doc = await getTripOrThrow(input.callerKey, tripId);
  const candidatesRaw = (doc.candidates ?? {}) as {
    places?: unknown;
    restaurants?: unknown;
  };
  const seedPlaces = asPlaceCards(candidatesRaw.places);
  const discoveredPlaces = await discoverPlacesForSkeleton(
    input,
    locale,
    state,
    seedPlaces,
  );

  // 110d: local filter by default; expand only after affirmative expand_radius answer.
  const expandAnswer = resolveExpandRadiusAnswer(input.answers);
  const radiusKm =
    expandAnswer === "yes" ? EXPANDED_CITY_RADIUS_KM : CITY_RADIUS_KM;
  const localPlaces = filterPlacesByRadius(
    discoveredPlaces,
    state.anchor,
    CITY_RADIUS_KM,
  );
  const expandedPlaces = filterPlacesByRadius(
    discoveredPlaces,
    state.anchor,
    EXPANDED_CITY_RADIUS_KM,
  );
  const localAttractions = countGroundedAttractions(localPlaces);
  const expandableAttractions =
    countGroundedAttractions(expandedPlaces) - localAttractions;

  if (
    shouldAskExpandRadius({
      localAttractionCount: localAttractions,
      expandableAttractionCount: expandableAttractions,
      numDays: input.numDays,
      expandAnswer,
    })
  ) {
    // Persist local-only candidates — do not auto-merge nearby-city POIs.
    if (localPlaces.length > 0 || seedPlaces.length > 0) {
      const localWrite = await dualWriteTrip({
        callerKey: input.callerKey,
        tripId,
        expectedRevision: revisionRef.current,
        locale,
        candidatesWrite: "replace",
        patch: {
          candidates: slimCandidatesForStore({
            places: localPlaces as unknown as Array<Record<string, unknown>>,
            restaurants: asPlaceCards(candidatesRaw.restaurants) as unknown as Array<
              Record<string, unknown>
            >,
          }),
        },
      });
      revisionRef.current = localWrite.revision;
    }
    state.asked = expandRadiusNeedInput(locale, EXPANDED_CITY_RADIUS_KM);
    timing.skeleton_s = secondsSince(tSkeleton);
    return null;
  }

  const radiusFilteredPlaces =
    expandAnswer === "yes" ? expandedPlaces : localPlaces;

  if (radiusFilteredPlaces.length > seedPlaces.length || expandAnswer !== undefined) {
    const expandedWrite = await dualWriteTrip({
      callerKey: input.callerKey,
      tripId,
      expectedRevision: revisionRef.current,
      locale,
      candidatesWrite: "replace",
      patch: {
        candidates: slimCandidatesForStore({
          places: radiusFilteredPlaces as unknown as Array<Record<string, unknown>>,
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
    places: radiusFilteredPlaces,
    restaurants: asPlaceCards(candidatesRaw.restaurants),
  };
  const makeInput: MakeItineraryInput = {
    city: input.city,
    numDays: input.numDays,
    candidates,
    ...(originStay
      ? {
          origin: {
            name: originStay.name,
            lat: originStay.location?.lat,
            lng: originStay.location?.lng,
          },
        }
      : {}),
    pace: input.pace,
    budget: input.budget,
    must_include: input.must_include,
    trip_type: input.trip_type,
    party_size: input.party_size,
    transit_preference: input.transit_preference,
    start_time: input.start_time,
    other: input.other,
    bounds: input.bounds,
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

  if (opts?.stopAfterSkeleton) {
    return {
      skeleton: made.skeleton,
      filledStops: [],
    };
  }

  const tFill = Date.now();
  const filledStops: PlanTripFilledStop[] = [];
  let fillReachedTripComplete = false;
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
      ...(originStay ? [originStay] : []),
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
      fillReachedTripComplete = true;
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
    fillReachedTripComplete,
    validationPool: {
      places: pool.places,
      restaurants: pool.restaurants,
      stays: originStay?.name ? [originStay.name] : input.origin?.name ? [input.origin.name] : [],
    },
  };
}

type FullLoopItinerary = NonNullable<PlanTripResult["itinerary"]> & {
  fillReachedTripComplete?: boolean;
  validationPool?: {
    places: PlaceCard[];
    restaurants: PlaceCard[];
    stays: string[];
  };
};

async function applyFillTripStatusGate(
  input: PlanTripInput,
  locale: Locale,
  tripId: string,
  revisionRef: { current?: number },
  itinerary: FullLoopItinerary,
): Promise<{ status: "ready" | "failed"; itinerary: FullLoopItinerary }> {
  if (!itinerary.filledStops.length) {
    return { status: "failed", itinerary };
  }
  const pool = itinerary.validationPool ?? {
    places: [],
    restaurants: [],
    stays: input.origin?.name ? [input.origin.name] : [],
  };
  const resolved = resolveFillTripStatus({
    skeleton: itinerary.skeleton,
    filledStops: itinerary.filledStops.map((fs) => ({
      day_index: fs.day_index,
      stop_index: fs.stop_index,
      stop: fs.stop as { kind?: string; meal_slot?: string; name?: string },
    })),
    pool,
    mustInclude: input.must_include ?? [],
    numDays: input.numDays,
    pace: input.pace,
    city: input.city,
    fillReachedTripComplete: itinerary.fillReachedTripComplete === true,
  });
  if (resolved.deviations?.length) {
    const skWrite = await dualWriteTrip({
      callerKey: input.callerKey,
      tripId,
      expectedRevision: revisionRef.current,
      locale,
      patch: {
        skeleton: resolved.skeleton as unknown as Record<string, unknown>,
      },
    });
    revisionRef.current = skWrite.revision;
  }
  return {
    status: resolved.status,
    itinerary: { ...itinerary, skeleton: resolved.skeleton },
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

  if (input.skeleton_only) {
    return planTripSkeletonOnly(input, t0, locale, city);
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

  // MVP-T5 TD-4: apply answers.hotel before origin gate.
  const hotelAns = resolveHotelAnswer(input.answers);
  let effective: PlanTripInput = input;
  let hotelSkipped = false;
  if (hotelAns.kind === "name") {
    effective = {
      ...input,
      origin: {
        name: hotelAns.name,
        ...(input.origin?.lat != null ? { lat: input.origin.lat } : {}),
        ...(input.origin?.lng != null ? { lng: input.origin.lng } : {}),
      },
    };
  } else if (hotelAns.kind === "skip") {
    hotelSkipped = true;
  }

  const wantsFull = Boolean(effective.numDays && effective.origin?.name);
  if (!state.committed) {
    timing.total_s = secondsSince(t0);
    // Intake (no origin yet): still ask hotel / time / must-see. Do not 502 the assistant.
    if (!wantsFull && !hotelSkipped) {
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
    if (!wantsFull && hotelSkipped) {
      // Hotel skipped but intake never committed — still cannot schedule.
      return {
        trip_id: ensured.trip_id,
        revision: revisionRef.current ?? ensured.revision,
        status: "failed",
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
    if (hotelSkipped && effective.numDays) {
      // TD-4: skip hotel → skeleton without origin (no full fill claim).
      try {
        const itinerary = await runFullLoop(
          effective,
          locale,
          ensured.trip_id,
          revisionRef,
          state,
          toolCalls,
          timing,
          { stopAfterSkeleton: true },
        );
        timing.total_s = secondsSince(t0);
        if (state.asked?.questions.some((q) => q.id === EXPAND_RADIUS_QUESTION_ID)) {
          return {
            trip_id: ensured.trip_id,
            revision: revisionRef.current ?? ensured.revision,
            status: "needs_input",
            need_input: state.asked,
            tool_calls: toolCalls,
            timing,
          };
        }
        if (!itinerary?.skeleton) {
          return {
            trip_id: ensured.trip_id,
            revision: revisionRef.current ?? ensured.revision,
            status: "failed",
            tool_calls: toolCalls,
            timing,
          };
        }
        return {
          trip_id: ensured.trip_id,
          revision: revisionRef.current ?? ensured.revision,
          status: "ready",
          tool_calls: toolCalls,
          timing,
          itinerary: {
            skeleton: itinerary.skeleton,
            filledStops: [],
          },
        };
      } catch (err) {
        console.error(
          "plan_trip: hotel-skip skeleton failed",
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
          effective,
          locale,
          ensured.trip_id,
          revisionRef,
          state,
          toolCalls,
          timing,
        )
      : await runFullLoopAgent(
          effective,
          locale,
          ensured.trip_id,
          revisionRef,
          state,
          toolCalls,
          timing,
        );
    timing.total_s = secondsSince(t0);
    if (state.asked?.questions.some((q) => q.id === EXPAND_RADIUS_QUESTION_ID)) {
      return {
        trip_id: ensured.trip_id,
        revision: revisionRef.current ?? ensured.revision,
        status: "needs_input",
        need_input: state.asked,
        tool_calls: toolCalls,
        timing,
      };
    }
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
    const gated = await applyFillTripStatusGate(
      effective,
      locale,
      ensured.trip_id,
      revisionRef,
      itinerary as FullLoopItinerary,
    );
    return {
      trip_id: ensured.trip_id,
      revision: revisionRef.current ?? ensured.revision,
      status: gated.status,
      tool_calls: toolCalls,
      timing,
      itinerary: {
        skeleton: gated.itinerary.skeleton,
        filledStops: gated.itinerary.filledStops,
        artifacts: gated.itinerary.artifacts,
      },
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

/** MVP-T3: takeoff bounds → trip_id + skeleton; no 4Q; no fill. */
async function planTripSkeletonOnly(
  input: PlanTripInput,
  t0: number,
  locale: Locale,
  city: string,
): Promise<PlanTripResult> {
  const phases: PlanTripPhaseEvent[] = [];
  const timing: PlanTripTiming = { intake_s: 0, total_s: 0 };
  const toolCalls: string[] = [];

  if (!input.numDays) {
    return {
      trip_id: input.trip_id ?? "",
      revision: input.revision ?? 1,
      status: "failed",
      phases: [{ phase: "failed", error: { key: "errors.validation" } }],
      timing: { intake_s: 0, total_s: secondsSince(t0) },
    };
  }

  const ensured = await ensureTrip({
    callerKey: input.callerKey,
    tripId: input.trip_id,
    locale,
  });
  const revisionRef = { current: input.revision ?? ensured.revision };
  phases.push({ phase: "trip_created", trip_id: ensured.trip_id });

  const state: LoopState = {
    collected: [],
    anchor: null,
    committed: false,
    asked: null,
  };

  try {
    await runGeocode({ query: city }, input, locale, state);
    toolCalls.push("geocode");

    const boundsWritten = await dualWriteTrip({
      callerKey: input.callerKey,
      tripId: ensured.trip_id,
      expectedRevision: revisionRef.current,
      locale,
      patch: {
        constraints: {
          city,
          numDays: input.numDays,
          pace: input.pace,
          budget: input.budget,
          transit_preference: input.transit_preference,
          trip_type: input.trip_type,
          bounds: input.bounds,
          must_include: input.must_include,
          ...(typeof input.party_size === "number" ? { party_size: input.party_size } : {}),
          ...(input.start_time?.trim() ? { start_time: input.start_time.trim() } : {}),
          ...(input.other != null ? { other: input.other } : {}),
          ...(input.origin?.name
            ? {
                origin: {
                  name: input.origin.name,
                  ...(input.origin.lat != null ? { lat: input.origin.lat } : {}),
                  ...(input.origin.lng != null ? { lng: input.origin.lng } : {}),
                },
              }
            : {}),
        },
      },
    });
    revisionRef.current = boundsWritten.revision;

    phases.push({ phase: "skeleton_generating", trip_id: ensured.trip_id });

    const itinerary = await runFullLoop(
      input,
      locale,
      ensured.trip_id,
      revisionRef,
      state,
      toolCalls,
      timing,
      { stopAfterSkeleton: true },
    );
    timing.total_s = secondsSince(t0);

    // 110d: expand_radius confirm — do not proceed to skeleton until answered.
    if (state.asked?.questions.some((q) => q.id === EXPAND_RADIUS_QUESTION_ID)) {
      return {
        trip_id: ensured.trip_id,
        revision: revisionRef.current ?? ensured.revision,
        status: "needs_input",
        need_input: state.asked,
        tool_calls: toolCalls,
        phases,
        timing,
      };
    }

    if (!itinerary?.skeleton) {
      phases.push({
        phase: "failed",
        trip_id: ensured.trip_id,
        error: { key: "errors.skeleton_failed" },
      });
      return {
        trip_id: ensured.trip_id,
        revision: revisionRef.current ?? ensured.revision,
        status: "failed",
        tool_calls: toolCalls,
        phases,
        timing,
      };
    }

    phases.push({
      phase: "skeleton_ready",
      trip_id: ensured.trip_id,
      revision: revisionRef.current,
    });
    return {
      trip_id: ensured.trip_id,
      revision: revisionRef.current ?? ensured.revision,
      status: "ready",
      tool_calls: toolCalls,
      phases,
      timing,
      itinerary: {
        skeleton: itinerary.skeleton,
        filledStops: [],
      },
    };
  } catch (err) {
    console.error(
      "plan_trip: skeleton_only failed",
      err instanceof Error ? err.message : err,
    );
    timing.total_s = secondsSince(t0);
    phases.push({
      phase: "failed",
      trip_id: ensured.trip_id,
      error: { key: "errors.skeleton_failed" },
    });
    return {
      trip_id: ensured.trip_id,
      revision: revisionRef.current ?? ensured.revision,
      status: "failed",
      tool_calls: toolCalls,
      phases,
      timing,
    };
  }
}
