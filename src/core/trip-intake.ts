/**
 * ADR-040 D3 / ADR-043 Option A — fixed trip intake form (not a random subset of questions).
 * Host always pastes the SAME 8-row form; known answers are filled in; defaults apply when skipped.
 * ChatBox often shows only `intake.question` — that string MUST be the full form every time.
 */

import { type Locale, parseLocale } from "./locales";

export type TripIntakeField =
  | "city"
  | "start_date"
  | "num_days"
  | "daily_origin"
  | "pace"
  | "spend_level"
  | "interests"
  | "must_include"
  | "party_size"
  | "ready";

export type TripIntakeQuestion = {
  field: Exclude<TripIntakeField, "ready">;
  question: string;
  /** When known from the call args, shown as prefilled. */
  known_value?: string;
  required: boolean;
};

export type SpendLevel = 1 | 2 | 3;

export type TripIntakeResult =
  | {
      status: "need_input";
      field: Exclude<TripIntakeField, "ready">;
      /** FULL fixed form — always all 8 rows. */
      question: string;
      host_action: "ask_in_chat_then_call_once";
      remaining_fields: Exclude<TripIntakeField, "ready">[];
      questions: TripIntakeQuestion[];
      /** Defaults applied when user skips optional / unset preference rows. */
      defaults: { pace: "medium"; spend_level: SpendLevel };
    }
  | {
      status: "ready";
      field: "ready";
      city: string;
      bounds: { start: string; end: string };
      numDays: number;
      pace: "tight" | "medium" | "relaxed";
      spend_level: SpendLevel;
    };

/** Map spend_level → legacy arrange budget id. */
export function spendLevelToBudget(level: SpendLevel): "budget" | "premium" {
  if (level <= 1) return "budget";
  if (level >= 3) return "premium";
  return "budget"; // level 2 适中: prefer value dining, prompt says moderate
}

export function parseSpendLevel(raw: unknown): SpendLevel | null {
  if (raw === 1 || raw === "1" || raw === "frugal" || raw === "节约") return 1;
  if (raw === 2 || raw === "2" || raw === "moderate" || raw === "适中") return 2;
  if (raw === 3 || raw === "3" || raw === "generous" || raw === "宽松" || raw === "premium") return 3;
  if (raw === "budget") return 1;
  return null;
}

export function parsePace(raw: unknown): "tight" | "medium" | "relaxed" | null {
  if (raw === "tight" || raw === "紧凑") return "tight";
  if (raw === "medium" || raw === "适中") return "medium";
  if (raw === "relaxed" || raw === "轻松") return "relaxed";
  return null;
}

/**
 * Canonical MCP trip-chat rules (Option A).
 */
export const MCP_TRIP_CHAT_RULES = [
  "RULE 0 — Chat first, tools second. BEFORE any discover_places / make_itinerary for a multi-day trip, paste the FIXED 8-row trip form (intake.question) in ONE message. Forbidden: one MCP call per question; forbidden: asking a random subset.",
  "RULE 1 — Fixed form rows: (1) city (2) start date (3) days/end (4) optional hotel (5) pace 轻松/适中/紧凑 default 适中 (6) spend 节约/适中/宽松 scale 1–3 default 2 (7) interests optional (8) must-include day-trips — list place names.",
  "RULE 2 — Fill known answers in the form; for unset pace/spend use defaults and say so. Call discover_places ONCE when rows 1–3 are answered. Then call make_itinerary ONCE with that candidates pool (do not drop the pool; do not pass empty candidates). Do not invent POIs. arrange_day is LEGACY — do not use it for new trips.",
  "RULE 3 — must_include: user lists names (e.g. 地点A、地点B) → keep ALL listed. Affirmed multi-option question without names → keep ALL offered options. Ambiguous → confirm. Pass must_include on make_itinerary. Enough days → one day per day-trip. No city hardcode catalogs.",
  "RULE 4 — After discover_places: call make_itinerary ONCE with numDays, origin, pace, budget, must_include, and the returned candidates. Then execute the returned next_tool_call chain (display_current_stop → plan_next_stop → display_current_stop …) WITHOUT stopping after each stop, until next_action is trip_complete. Pass skeleton and cursor exactly as provided in each next_tool_call.arguments. Do NOT stop after presenting one stop. Forbidden as a fill substitute: travel_tips, geocode-only research, rewrite/详细版 menus, or inventing times from knowledge. Do NOT call arrange_day for new trips.",
  "RULE 5 — No hotel: omit from_origin/to_destination on fill tools. Medium day fills through dinner ~20:00; ending before 16:00 is too short.",
  "RULE 6 — sources MUST stay an ARRAY. No truncation excuses. Never restart Day 1 mid-trip.",
  "RULE 7 — Present skeleton day cards first, then fill stops from the skeleton only — do not invent free-walk slots or places not in the pool.",
].join(" ");

/**
 * ADR-045 §8 — global anti-fabrication rule, appended to every host_instructions
 * emission. Stateless `/mcp` (§7) eliminates session failures, but other
 * failures (provider timeout, rate limit) can still occur; this prevents the
 * host LLM from inventing an itinerary from parametric knowledge on failure.
 */
export const MCP_NO_INVENT_RULE =
  "NO INVENTING: never fabricate an itinerary, stop times, transit, or restaurants from your own knowledge — " +
  "not on failure and not after a successful skeleton. " +
  "If a tool fails, tell the user the planning service is temporarily unavailable and ask them to retry. " +
  "You must not present fabricated concrete itineraries as if they came from the tools. " +
  "After make_itinerary you MUST execute the returned next_tool_call chain (display_current_stop → plan_next_stop → display_current_stop …) until trip_complete — do NOT stop after one stop (candidates optional). " +
  "Forbidden as a fill substitute: travel_tips, geocode-only research, or writing a 详细版 from parametric knowledge.";

const FORM_COPY: Record<
  "city" | "start_date" | "num_days" | "daily_origin" | "pace" | "spend_level" | "interests" | "must_include",
  Record<"EN" | "CN", string>
> = {
  city: {
    EN: "City / area",
    CN: "城市/地区",
  },
  start_date: {
    EN: "Start date (YYYY-MM-DD)",
    CN: "开始日期（YYYY-MM-DD）",
  },
  num_days: {
    EN: "Number of days (or end date)",
    CN: "天数（或结束日期）",
  },
  daily_origin: {
    EN: "Daily hotel / landmark (optional — skip if unknown)",
    CN: "每日酒店/地标（可选，不知道可跳过）",
  },
  pace: {
    EN: "Pace: relaxed / medium / tight (default medium)",
    CN: "节奏：轻松 / 适中 / 紧凑（默认适中）",
  },
  spend_level: {
    EN: "Spend level 1–3: 1 frugal / 2 moderate / 3 generous (default 2)",
    CN: "消费 1–3：1 节约 / 2 适中 / 3 宽松（默认 2 适中）",
  },
  interests: {
    EN: "Interests (optional): historic / food / beach / neighborhoods / nightlife / walking / markets",
    CN: "兴趣（可选）：历史 / 美食 / 海边 / 街区 / 夜生活 / 街头漫步 / 市集",
  },
  must_include: {
    EN: "Must-include / day trips — list place names (optional). Example: Place A, Place B",
    CN: "必去/一日游 — 请写出地名（可选）。例如：地点A、地点B",
  },
};

function lang(locale: Locale): "EN" | "CN" {
  return locale === "EN" ? "EN" : "CN";
}

function parseYmd(s: string | undefined): string | null {
  if (!s || typeof s !== "string") return null;
  const t = s.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  const d = new Date(`${t}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return t;
}

function addDaysYmd(start: string, daysOffset: number): string {
  const d = new Date(`${start}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + daysOffset);
  return d.toISOString().slice(0, 10);
}

function dayCountInclusive(start: string, end: string): number {
  const a = new Date(`${start}T00:00:00Z`).getTime();
  const b = new Date(`${end}T00:00:00Z`).getTime();
  if (b < a) return 0;
  return Math.floor((b - a) / 86_400_000) + 1;
}

export type DiscoverIntakeArgs = {
  city?: string;
  bounds?: { start?: string; end?: string };
  numDays?: number;
  locale?: Locale | string;
  origin?: { name?: string; lat?: number; lng?: number };
  pace?: string;
  spend_level?: unknown;
  interests?: string;
  must_include?: string[] | string;
  /** @deprecated hotel never blocks discover */
  requireOrigin?: boolean;
};

function knownMustInclude(raw: string[] | string | undefined): string | undefined {
  if (Array.isArray(raw)) {
    const s = raw.map((x) => String(x).trim()).filter(Boolean).join("、");
    return s || undefined;
  }
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  return undefined;
}

/**
 * Always build the fixed 8-row form. Hard gaps (city/start/days) determine need_input vs ready.
 */
export function buildFixedTripForm(args: {
  locale: Locale;
  city?: string;
  start?: string | null;
  numDays?: number | null;
  end?: string | null;
  originName?: string;
  pace?: string | null;
  spend_level?: SpendLevel | null;
  interests?: string;
  must_include?: string;
}): { question: string; questions: TripIntakeQuestion[]; remaining_hard: Exclude<TripIntakeField, "ready">[] } {
  const L = lang(args.locale);
  const remaining_hard: Exclude<TripIntakeField, "ready">[] = [];
  if (!args.city?.trim()) remaining_hard.push("city");
  if (!args.start) remaining_hard.push("start_date");
  if (args.numDays == null || args.numDays < 1) remaining_hard.push("num_days");

  const rows: TripIntakeQuestion[] = [
    {
      field: "city",
      question: FORM_COPY.city[L],
      known_value: args.city?.trim() || undefined,
      required: true,
    },
    {
      field: "start_date",
      question: FORM_COPY.start_date[L],
      known_value: args.start ?? undefined,
      required: true,
    },
    {
      field: "num_days",
      question: FORM_COPY.num_days[L],
      known_value:
        args.numDays != null
          ? String(args.numDays)
          : args.end
            ? `end ${args.end}`
            : undefined,
      required: true,
    },
    {
      field: "daily_origin",
      question: FORM_COPY.daily_origin[L],
      known_value: args.originName?.trim() || undefined,
      required: false,
    },
    {
      field: "pace",
      question: FORM_COPY.pace[L],
      known_value: args.pace ?? "medium",
      required: true,
    },
    {
      field: "spend_level",
      question: FORM_COPY.spend_level[L],
      known_value: String(args.spend_level ?? 2),
      required: true,
    },
    {
      field: "interests",
      question: FORM_COPY.interests[L],
      known_value: args.interests?.trim() || undefined,
      required: false,
    },
    {
      field: "must_include",
      question: FORM_COPY.must_include[L],
      known_value: args.must_include,
      required: false,
    },
  ];

  const header =
    L === "EN"
      ? "Trip form — answer ALL rows in ONE message (do not answer only #1). Known values shown; blanks use defaults where noted:"
      : "行程表 — 请在一条消息里回答全部行（不要只回第 1 行）。已填项已标出；未填的节奏/消费用默认：";

  const lines = rows.map((r, i) => {
    const req = r.required ? (L === "EN" ? "required" : "必填") : L === "EN" ? "optional" : "可选";
    const known = r.known_value
      ? L === "EN"
        ? ` [filled: ${r.known_value}]`
        : ` 【已填：${r.known_value}】`
      : "";
    return `${i + 1}. (${req}) ${r.question}${known}`;
  });

  return {
    question: `${header}\n${lines.join("\n")}`,
    questions: rows,
    remaining_hard,
  };
}

export function evaluateDiscoverIntake(args: DiscoverIntakeArgs): TripIntakeResult {
  const locale = parseLocale(args.locale);
  const city = args.city?.trim() ?? "";
  const start = parseYmd(args.bounds?.start);
  const endRaw = parseYmd(args.bounds?.end);
  let numDays =
    typeof args.numDays === "number" && Number.isFinite(args.numDays)
      ? Math.max(1, Math.min(14, Math.floor(args.numDays)))
      : null;
  let end = endRaw;

  if (start) {
    if (end && numDays == null) numDays = dayCountInclusive(start, end);
    if (!end && numDays != null) end = addDaysYmd(start, Math.max(0, numDays - 1));
  }

  const daysResolved = Boolean(start && end && numDays && numDays >= 1);
  if (!daysResolved) {
    if (numDays == null && !endRaw) {
      /* keep numDays null */
    } else if (start && (!end || !numDays || numDays < 1)) {
      numDays = null;
    }
  }

  const pace = parsePace(args.pace) ?? "medium";
  const spend_level = parseSpendLevel(args.spend_level) ?? 2;
  const form = buildFixedTripForm({
    locale,
    city: city || undefined,
    start,
    numDays: daysResolved ? numDays : numDays,
    end: endRaw,
    originName: args.origin?.name,
    pace,
    spend_level,
    interests: args.interests,
    must_include: knownMustInclude(args.must_include),
  });

  if (form.remaining_hard.length > 0) {
    return {
      status: "need_input",
      field: form.remaining_hard[0]!,
      question: form.question,
      host_action: "ask_in_chat_then_call_once",
      remaining_fields: form.remaining_hard,
      questions: form.questions,
      defaults: { pace: "medium", spend_level: 2 },
    };
  }

  return {
    status: "ready",
    field: "ready",
    city,
    bounds: { start: start!, end: end! },
    numDays: numDays!,
    pace,
    spend_level,
  };
}

export type ArrangeIntakeArgs = {
  origin?: { name?: string; lat?: number; lng?: number };
  party_size?: number;
  locale?: Locale | string;
  allowDefaultPartySize?: boolean;
  allowMissingOrigin?: boolean;
};

function originMissing(origin?: { name?: string; lat?: number; lng?: number }): boolean {
  const originName = origin?.name?.trim() ?? "";
  const hasCoords = origin?.lat != null && origin?.lng != null;
  return !originName && !hasCoords;
}

export function evaluateArrangeIntake(args: ArrangeIntakeArgs): TripIntakeResult | { status: "ok" } {
  const locale = parseLocale(args.locale);
  const allowMissingOrigin = args.allowMissingOrigin !== false;
  const missing: Exclude<TripIntakeField, "ready">[] = [];
  if (!allowMissingOrigin && originMissing(args.origin)) missing.push("daily_origin");
  if (args.party_size == null && args.allowDefaultPartySize === false) missing.push("party_size");
  if (!missing.length) return { status: "ok" };

  const form = buildFixedTripForm({
    locale,
    originName: args.origin?.name,
  });
  return {
    status: "need_input",
    field: missing[0]!,
    question: form.question,
    host_action: "ask_in_chat_then_call_once",
    remaining_fields: missing,
    questions: form.questions.filter((q) => missing.includes(q.field) || q.field === "daily_origin"),
    defaults: { pace: "medium", spend_level: 2 },
  };
}

export function buildIntakeHostInstructions(
  intake: Extract<TripIntakeResult, { status: "need_input" }>,
): string {
  return (
    `${MCP_TRIP_CHAT_RULES} ` +
    `SAFETY NET: Paste intake.question (the FULL 8-row form) into chat as-is. Do not rewrite rows or drop interest examples on row 7. Do not drop rows. ` +
    `After rows 1–3 are answered, call discover_places ONCE (pass pace, spend_level, origin, must_include when known). ` +
    `Then call make_itinerary ONCE with the returned candidates pool. arrange_day is LEGACY — do not use it for new trips. ` +
    `Defaults if skipped: pace=medium, spend_level=2.\n` +
    `完整表单：\n${intake.question}\n` +
    MCP_NO_INVENT_RULE
  );
}

/** Normalize for must_include coverage matching. */
export function normalizeMustIncludeToken(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[，,、]/g, "");
}

/**
 * True if token is covered by day_theme or any scheduled name (substring either way).
 * Do not weaken this so a town token (e.g. 辛特拉) matches an unrelated palace name.
 */
export function mustIncludeTokenCovered(
  token: string,
  haystacks: string[],
): boolean {
  const t = normalizeMustIncludeToken(token);
  if (!t) return true;
  return haystacks.some((h) => {
    const n = normalizeMustIncludeToken(h);
    if (!n) return false;
    return n.includes(t) || t.includes(n);
  });
}

/**
 * Strip destination-agnostic area / day-trip suffixes so "贝伦区" can be
 * covered by "贝伦塔". Does not invent city POI lists (ADR-042).
 */
export function stripAreaSuffix(token: string): string {
  const stripped = token
    .trim()
    .replace(/\s*(day[\s-]?trip|area|district)$/i, "")
    .replace(/(一日游|一日|一带|附近|地区|区)$/u, "")
    .trim();
  return stripped.length >= 2 ? stripped : token.trim();
}

/**
 * Skeleton / pool coverage for must_include: exact/substring match, or the
 * area-core after suffix strip (区 / 一带 / 一日游). Used by make_itinerary
 * validation — not by arrange_day's stricter mustIncludeTokenCovered.
 */
export function skeletonCoversMustInclude(
  token: string,
  haystacks: string[],
): boolean {
  if (mustIncludeTokenCovered(token, haystacks)) return true;
  const core = stripAreaSuffix(token);
  return core !== token.trim() && mustIncludeTokenCovered(core, haystacks);
}
