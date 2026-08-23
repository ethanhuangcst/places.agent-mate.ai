/**
 * ADR-043 — MCP arrange day soft gate + host_instructions.
 * must_include hard coverage lives in core/must-include-coverage (HTTP = MCP).
 */

import {
  applyMustIncludeDayEvidence,
  getMustIncludeCoverageSnapshot,
  resetMustIncludeCoverageSessions,
} from "../core/must-include-coverage";

type GateEntry = { dayIndex: number; at: number };

const pendingPresent = new Map<string, GateEntry>();
const TTL_MS = 60 * 60 * 1000;

export function arrangeGateKey(input: {
  city?: string;
  originName?: string;
  locale?: string;
}): string {
  return [
    (input.city ?? "").trim().toLowerCase(),
    (input.originName ?? "").trim().toLowerCase(),
    (input.locale ?? "EN").trim().toUpperCase(),
  ].join("|");
}

export function clearArrangePresentGate(key: string): void {
  pendingPresent.delete(key);
}

/** For tests. */
export function resetArrangePresentGates(): void {
  pendingPresent.clear();
  resetMustIncludeCoverageSessions();
}

export type ArrangeGateResult =
  | { ok: true }
  | {
      ok: false;
      need_present_previous_day: true;
      day_index: number;
      host_instructions: string;
    };

/**
 * If a previous arrange on this key awaits presentation and caller advances dayIndex
 * without ack, block. Ack via presented_previous_day / ack_day_index.
 */
export function evaluateArrangePresentGate(input: {
  key: string;
  dayIndex: number;
  presented_previous_day?: boolean;
  ack_day_index?: number;
}): ArrangeGateResult {
  const now = Date.now();
  const pending = pendingPresent.get(input.key);
  if (pending && now - pending.at > TTL_MS) {
    pendingPresent.delete(input.key);
  }
  const current = pendingPresent.get(input.key);
  if (!current) return { ok: true };

  const acked =
    input.presented_previous_day === true ||
    (typeof input.ack_day_index === "number" && input.ack_day_index === current.dayIndex);

  if (acked) {
    pendingPresent.delete(input.key);
    return { ok: true };
  }

  if (input.dayIndex > current.dayIndex) {
    return {
      ok: false,
      need_present_previous_day: true,
      day_index: current.dayIndex,
      host_instructions:
        `Present Day ${current.dayIndex} NOW using the MULTI-LINE day-card format (see RULE 7). ` +
        `Then call arrange_day with presented_previous_day=true ` +
        `(or ack_day_index=${current.dayIndex}) for dayIndex=${current.dayIndex + 1} — do it yourself right after presenting, without asking the user and without waiting for 继续. ` +
        `Call arrange_day ONE day at a time (get Day N, present it, then call Day N+1) — do NOT fire multiple arrange_day in parallel. Do not restart from Day 1.`,
    };
  }
  return { ok: true };
}

export function markArrangeAwaitingPresent(key: string, dayIndex: number): void {
  pendingPresent.set(key, { dayIndex, at: Date.now() });
}

/** Multi-line day card contract (Figure-2 style). Forbidden: single-line `|` bullets. */
export const DAY_CARD_FORMAT_INSTRUCTIONS = [
  "DAY CARD FORMAT (mandatory multi-line — NEVER compress into one bullet with | ):",
  "Header: **Day N｜YYYY-MM-DD｜theme** then one line for origin (if any).",
  "For EACH block use EXACTLY this shape:",
  "### HH:MM–HH:MM｜Place name",
  "reason (1–2 sentences)",
  "",
  "- 前往：{mode} 约 {duration_min} 分钟",
  "- [查看路线](recommended leg deeplink)",
  "- [查看地点](map deeplink from sources[].deeplinks)",
  "Prefer recommended legs_to_here; never push a multi-hour walk when transit/drive is much shorter.",
  "End of day: return note (only if origin known) + progress Day N of M.",
  "Only list blocks returned by arrange_day. Forbidden: inventing free-walk or filler slots not in blocks[].",
].join(" ");

/**
 * @deprecated Prefer arrangeDay's must_include_coverage (D7 hard evidence).
 * Kept for tests / thin wrappers — applies **block names only** (never day_theme).
 */
export function recordMustIncludeCoverage(input: {
  key: string;
  must_include?: string[];
  day_theme?: string;
  block_names?: string[];
}): { must_include: string[]; covered: string[]; missing: string[] } {
  void input.day_theme; // intentionally ignored (ADR-043 D7)
  return applyMustIncludeDayEvidence({
    key: input.key,
    must_include: input.must_include,
    blocks: (input.block_names ?? []).map((name) => ({ name, type: "attraction" })),
  });
}

export function getMustIncludeCoverage(key: string): {
  must_include: string[];
  covered: string[];
  missing: string[];
} {
  return getMustIncludeCoverageSnapshot(key);
}

/**
 * ADR-043 Option A — sequential one-day-per-turn + multi-line card + must_include gate on last day.
 * Server auto-searches must_include inside arrangeDay — host need not call search_places.
 * Empty candidates are auto-discovered from city (D8).
 */
export function buildArrangeContinueHostInstructions(opts: {
  dayIndex: number;
  numDays?: number;
  missing_must_include?: string[];
}): string {
  const { dayIndex, numDays, missing_must_include } = opts;
  const present =
    `Present Day ${dayIndex} to the user NOW. ${DAY_CARD_FORMAT_INSTRUCTIONS} ` +
    `Keep sources as an ARRAY. Do not invent truncation excuses.`;

  const missing = (missing_must_include ?? []).filter(Boolean);
  const isLast = numDays != null && dayIndex >= numDays;

  if (isLast && missing.length > 0) {
    return (
      `${present} ` +
      `BLOCKED OVERVIEW: must_include still missing: ${missing.join(", ")}. ` +
      `Do NOT write the multi-day overview yet. Call arrange_day for dayIndex=${dayIndex + 1} ` +
      `(or replace an unused day) with preferences.must_include (and optional day_theme naming the missing place), ` +
      `presented_previous_day=true — do it yourself right after presenting, no asking the user, no waiting for 继续. ` +
      `Server force-schedules the missing place only when day_theme names it — pass day_theme naming the missing place. Do not invent POIs. ` +
      `One missing day-trip town → one arrange call. Call arrange_day ONE day at a time (no parallel). Do not drop any missing item.`
    );
  }

  if (isLast) {
    return (
      `${present} ` +
      `This is the LAST day (Day ${dayIndex} of ${numDays}). ` +
      `Present Day ${dayIndex} ONCE only. Then write a short multi-day overview (one theme line per day) ONCE. Then STOP. ` +
      `Forbidden: re-pasting Day ${dayIndex}, repeating the overview, inventing free-walk blocks, or calling arrange_day again. ` +
      `Do NOT call arrange_day again. Do not invent Day ${dayIndex + 1}.`
    );
  }

  if (numDays != null) {
    return (
      `${present} ` +
      `Progress: Day ${dayIndex} of ${numDays} — NOT the last day. ` +
      `After the Day ${dayIndex} card is visible to the user, call arrange_day for dayIndex=${dayIndex + 1} ` +
      `yourself (no asking the user, no waiting for 继续) — but ONE day at a time: present Day ${dayIndex} first, then call Day ${dayIndex + 1}; do NOT fire multiple arrange_day in parallel ` +
      `with presented_previous_day=true, num_days=${numDays}, exclude_names = names already scheduled, ` +
      `same preferences.must_include (optional day_theme for the next uncovered must_include). ` +
      `Server force-schedules a must_include only on a day whose day_theme names it — pass must_include every call and day_theme on each day-trip day. ` +
      `Empty candidates are OK (server auto-discovers from city). Prefer passing the discover pool when available. ` +
      `Do not restart Day 1.`
    );
  }

  return (
    `${present} ` +
    `Then call arrange_day for dayIndex=${dayIndex + 1} with presented_previous_day=true yourself (no asking the user, no waiting for 继续; one day at a time, no parallel). ` +
    `Pass num_days and must_include when known.`
  );
}
