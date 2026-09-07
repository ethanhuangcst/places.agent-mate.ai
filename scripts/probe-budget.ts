/**
 * Probe budget gate — counts outbound probe HTTP calls and aborts when the
 * configured Google daily call budget is exceeded.
 *
 * Env:
 *   GOOGLE_DAILY_BUDGET_CALLS  — max calls allowed (default: 200). Set lower in dev.
 *   PROBE_BUDGET_FILE          — where to persist the counter (default: tmp/.probe-budget.json)
 *
 * Usage in a probe script:
 *   import { budgetFetch, readBudget } from "./probe-budget";
 *   const res = await budgetFetch(url, init);
 *   console.log(readBudget());
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";

type BudgetState = { date: string; calls: number; google_calls: number };

const BUDGET_FILE =
  process.env.PROBE_BUDGET_FILE?.trim() ||
  join(process.cwd(), "tmp", ".probe-budget.json");
const DEFAULT_BUDGET = Number(process.env.GOOGLE_DAILY_BUDGET_CALLS ?? "200");

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function readBudget(): BudgetState {
  try {
    if (existsSync(BUDGET_FILE)) {
      const raw = JSON.parse(readFileSync(BUDGET_FILE, "utf8")) as BudgetState;
      if (raw.date === today()) return raw;
    }
  } catch {
    /* corrupt, reset */
  }
  return { date: today(), calls: 0, google_calls: 0 };
}

function writeBudget(state: BudgetState): void {
  try {
    mkdirSync(dirname(BUDGET_FILE), { recursive: true });
    writeFileSync(BUDGET_FILE, JSON.stringify(state));
  } catch {
    /* non-fatal */
  }
}

/** Fetch wrapper that counts calls and aborts on budget overrun. */
export async function budgetFetch(
  url: string | URL,
  init?: RequestInit,
): Promise<Response> {
  const state = readBudget();
  state.calls += 1;
  // Heuristic: count as Google call if the probe targets a Google-path city
  // (the server-side provider routing decides actual Google usage; this is a
  // proxy gate to stop runaway probe loops before they hit quota).
  const googleish = /lisbon|portugal|europe|overseas/i.test(String(url)) ||
    process.env.PROBE_COUNT_AS_GOOGLE === "1";
  if (googleish) state.google_calls += 1;
  writeBudget(state);

  const budget = Number(process.env.GOOGLE_DAILY_BUDGET_CALLS ?? DEFAULT_BUDGET);
  if (Number.isFinite(budget) && budget > 0 && state.calls > budget) {
    throw new Error(
      `probe budget exceeded: ${state.calls} calls > ${budget} (google_calls=${state.google_calls}). ` +
        `Set GOOGLE_DAILY_BUDGET_CALLS higher or clear ${BUDGET_FILE}.`,
    );
  }
  return fetch(url, init);
}
