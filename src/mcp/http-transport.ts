/**
 * MCP Streamable HTTP + SSE session wiring.
 *
 * ADR-045 §7 — `/mcp` (Streamable HTTP) is STATELESS: no session id is issued
 * or validated, every request is independent. This eliminates the
 * `mcp_session_invalid` failure class (server restarts / TTL expiry / clients
 * that don't re-initialize). No tool depends on the MCP transport session:
 * `must-include-coverage` and `arrange-present-gate` are keyed by
 * `city|origin|locale`, not by session id.
 *
 * `/sse` (legacy SSE transport) remains stateful and untouched.
 *
 * Kept free of Next.js so process-level tests can mount a tiny http.Server.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { createPlacesMcpServer } from "./create-server";
import { SessionManager } from "./session-manager";
import { authenticateCaller } from "../auth/caller";
import { errorEnvelope } from "../http/envelope";

export const sseSessions = new SessionManager();

function authorizationOf(req: IncomingMessage): string | null {
  const header = req.headers.authorization;
  if (!header) return null;
  return Array.isArray(header) ? (header[0] ?? null) : header;
}

export async function requireCaller(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<{ ok: true; keyId: string } | { ok: false }> {
  const auth = await authenticateCaller(authorizationOf(req));
  if (auth.ok) return { ok: true, keyId: auth.keyId };
  res.statusCode = 401;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(errorEnvelope("errors.caller_unauthorized")));
  return { ok: false };
}

async function readJsonBody(req: IncomingMessage): Promise<{ ok: true; data: unknown } | { ok: false }> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return { ok: true, data: undefined };
  try {
    return { ok: true, data: JSON.parse(raw) as unknown };
  } catch {
    return { ok: false };
  }
}

/**
 * Clear JSON-RPC error for missing/expired SSE sessions (no stacks/secrets).
 * Kept for the legacy `/sse` + `/messages` path; the stateless `/mcp` path no
 * longer emits it.
 */
export function mcpInvalidSessionBody(reason: "missing_session" | "expired_or_unknown_session") {
  return {
    jsonrpc: "2.0" as const,
    error: {
      code: -32000,
      message:
        reason === "missing_session"
          ? "No MCP session. POST an initialize request first (omit mcp-session-id)."
          : "MCP session expired or unknown. Re-initialize (POST initialize without the stale mcp-session-id).",
      data: { outcomeKey: "errors.mcp_session_invalid", reason },
    },
    id: null,
  };
}

// --- Stateless Streamable HTTP transport (ADR-045 §7) ----------------------
//
// ADR-045 §7: `/mcp` is stateless. `sessionIdGenerator: undefined` means the
// SDK issues no `mcp-session-id` header and performs no session validation.
// Each request is independent; no per-session state is retained across
// requests, so server restarts / TTL expiry / clients that don't
// re-initialize cannot break subsequent calls.
//
// A fresh transport + server is created per request. This is the most robust
// stateless pattern: no shared state can leak between requests (the shared
// transport variant was found to error after a prior `initialize` on the
// same instance). `createPlacesMcpServer()` is cheap (tool registration
// only), and MCP tool results are returned synchronously in the
// `tools/call` response, so per-request construction has no correctness cost.

async function createStatelessTransport(callerKey: string): Promise<StreamableHTTPServerTransport> {
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  const server = createPlacesMcpServer({ callerKey });
  await server.connect(transport);
  return transport;
}

export async function handleMcp(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const auth = await requireCaller(req, res);
  if (!auth.ok) return;

  // Stateless: no SSE uplink, no session to delete.
  if (req.method === "GET" || req.method === "DELETE") {
    res.statusCode = 405;
    res.setHeader("Allow", "POST");
    res.end("Method not allowed");
    return;
  }

  if (req.method !== "POST") {
    res.statusCode = 405;
    res.end("Method not allowed");
    return;
  }

  const parsed = await readJsonBody(req);
  if (!parsed.ok) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32700, message: "Parse error" }, id: null }));
    return;
  }
  const body = parsed.data;

  const transport = await createStatelessTransport(auth.keyId);
  await transport.handleRequest(req, res, body);
}

// --- Legacy SSE transport (stateful, unchanged) -----------------------------

export async function handleSse(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const auth = await requireCaller(req, res);
  if (!auth.ok) return;
  const transport = new SSEServerTransport("/messages", res);
  const server = createPlacesMcpServer({ callerKey: auth.keyId });
  sseSessions.add(transport.sessionId, transport);
  transport.onclose = () => {
    sseSessions.delete(transport.sessionId);
  };
  await server.connect(transport);
}

export async function handleSseMessage(
  req: IncomingMessage,
  res: ServerResponse,
  sessionId: string | undefined,
): Promise<void> {
  const auth = await requireCaller(req, res);
  if (!auth.ok) return;
  const transport = sessionId
    ? (sseSessions.get(sessionId) as SSEServerTransport | undefined)
    : undefined;
  if (!transport) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json");
    const body = mcpInvalidSessionBody(sessionId ? "expired_or_unknown_session" : "missing_session");
    body.error.message =
      "Unknown SSE session. GET /sse to open a new SSE session, then POST /messages?sessionId=…";
    res.end(JSON.stringify(body));
    return;
  }
  await transport.handlePostMessage(req, res);
}

export function closeMcpSessions(): void {
  sseSessions.close();
}
