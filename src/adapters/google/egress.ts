/** Thrown when direct Google REST should trigger Worker MCP fallback (ADR-017). */
export class EgressFailureError extends Error {
  constructor(message = "google_egress_failure") {
    super(message);
    this.name = "EgressFailureError";
  }
}

const EGRESS_CODES = new Set([
  "ECONNRESET",
  "ETIMEDOUT",
  "ECONNREFUSED",
  "ENOTFOUND",
  "EAI_AGAIN",
  "UND_ERR_CONNECT_TIMEOUT",
]);

export function isEgressFailure(err: unknown, httpStatus?: number): boolean {
  if (err instanceof EgressFailureError) return true;
  if (httpStatus === 403 || httpStatus === 502 || httpStatus === 503) return true;
  const code = (err as NodeJS.ErrnoException | undefined)?.code;
  if (code && EGRESS_CODES.has(code)) return true;
  const msg = err instanceof Error ? err.message : String(err);
  return /timeout|fetch failed|network|aborted|egress/i.test(msg);
}

/** Abort / read timeout — not a reason to spend a second 25s on Worker MCP for dining search. */
export function isTimeoutFailure(err: unknown): boolean {
  if (err instanceof EgressFailureError) {
    return /timeout|aborted/i.test(err.message);
  }
  const name = err instanceof Error ? err.name : "";
  if (name === "AbortError" || name === "TimeoutError") return true;
  const code = (err as NodeJS.ErrnoException | undefined)?.code;
  if (code === "ETIMEDOUT" || code === "UND_ERR_CONNECT_TIMEOUT") return true;
  const msg = err instanceof Error ? err.message : String(err);
  return /timeout|aborted/i.test(msg);
}
