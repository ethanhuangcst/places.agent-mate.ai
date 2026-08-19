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
