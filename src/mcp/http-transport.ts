/**
 * MCP Streamable HTTP + SSE session wiring (Feature 38).
 * Kept free of Next.js so process-level tests can mount a tiny http.Server.
 */

import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { createPlacesMcpServer } from "./create-server";
import { SessionManager } from "./session-manager";
import { authenticateCaller } from "../auth/caller";
import { errorEnvelope } from "../http/envelope";

export const mcpSessions = new SessionManager();
export const sseSessions = new SessionManager();

function authorizationOf(req: IncomingMessage): string | null {
  const header = req.headers.authorization;
  if (!header) return null;
  return Array.isArray(header) ? (header[0] ?? null) : header;
}

export async function requireCaller(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const auth = await authenticateCaller(authorizationOf(req));
  if (auth.ok) return true;
  res.statusCode = 401;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(errorEnvelope("errors.caller_unauthorized")));
  return false;
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

/** Clear JSON-RPC error for missing/expired Streamable sessions (no stacks/secrets). */
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

export async function handleMcp(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!(await requireCaller(req, res))) return;
  const sessionIdHeader = req.headers["mcp-session-id"];
  const sessionId = Array.isArray(sessionIdHeader) ? sessionIdHeader[0] : sessionIdHeader;

  if (req.method === "GET" || req.method === "DELETE") {
    const existing = sessionId
      ? (mcpSessions.get(sessionId) as StreamableHTTPServerTransport | undefined)
      : undefined;
    if (!existing) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify(
          mcpInvalidSessionBody(sessionId ? "expired_or_unknown_session" : "missing_session"),
        ),
      );
      return;
    }
    await existing.handleRequest(req, res);
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

  let transport = sessionId
    ? (mcpSessions.get(sessionId) as StreamableHTTPServerTransport | undefined)
    : undefined;

  // Stale session id + initialize → start a fresh session (ignore stale id)
  if (!transport && isInitializeRequest(body)) {
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id) => {
        mcpSessions.add(id, transport as StreamableHTTPServerTransport);
      },
    });
    transport.onclose = () => {
      const id = transport?.sessionId;
      if (id) mcpSessions.delete(id);
    };
    const server = createPlacesMcpServer();
    await server.connect(transport);
  }

  if (!transport) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify(
        mcpInvalidSessionBody(sessionId ? "expired_or_unknown_session" : "missing_session"),
      ),
    );
    return;
  }
  await transport.handleRequest(req, res, body);
}

export async function handleSse(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!(await requireCaller(req, res))) return;
  const transport = new SSEServerTransport("/messages", res);
  const server = createPlacesMcpServer();
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
  if (!(await requireCaller(req, res))) return;
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
  mcpSessions.close();
  sseSessions.close();
}
