import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { parse } from "node:url";
import { randomUUID } from "node:crypto";
import next from "next";
import { loadEnvConfig } from "@next/env";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { createPlacesMcpServer } from "./src/mcp/create-server";
import { SessionManager } from "./src/mcp/session-manager";
import { authenticateCaller } from "./src/auth/caller";
import { errorEnvelope } from "./src/http/envelope";
import { assertGoogleProductionSafety } from "./src/adapters/google/config";

loadEnvConfig(process.cwd());
assertGoogleProductionSafety();

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "localhost";
const port = Number(process.env.PORT || 3000);

const mcpSessions = new SessionManager();
const sseSessions = new SessionManager();

function authorizationOf(req: IncomingMessage): string | null {
  const header = req.headers.authorization;
  if (!header) return null;
  return Array.isArray(header) ? (header[0] ?? null) : header;
}

async function requireCaller(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
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

async function handleMcp(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!(await requireCaller(req, res))) return;
  const sessionIdHeader = req.headers["mcp-session-id"];
  const sessionId = Array.isArray(sessionIdHeader) ? sessionIdHeader[0] : sessionIdHeader;

  if (req.method === "GET" || req.method === "DELETE") {
    const existing = sessionId
      ? (mcpSessions.get(sessionId) as StreamableHTTPServerTransport | undefined)
      : undefined;
    if (!existing) {
      res.statusCode = 400;
      res.end("Invalid or missing session ID");
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
      JSON.stringify({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Bad Request: No valid session ID provided" },
        id: null,
      }),
    );
    return;
  }
  await transport.handleRequest(req, res, body);
}

async function handleSse(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!(await requireCaller(req, res))) return;
  const transport = new SSEServerTransport("/messages", res);
  const server = createPlacesMcpServer();
  sseSessions.add(transport.sessionId, transport);
  transport.onclose = () => {
    sseSessions.delete(transport.sessionId);
  };
  await server.connect(transport);
}

async function handleSseMessage(req: IncomingMessage, res: ServerResponse, sessionId: string | undefined) {
  if (!(await requireCaller(req, res))) return;
  const transport = sessionId
    ? (sseSessions.get(sessionId) as SSEServerTransport | undefined)
    : undefined;
  if (!transport) {
    res.statusCode = 404;
    res.end("Unknown SSE session");
    return;
  }
  await transport.handlePostMessage(req, res);
}

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

async function main() {
  await app.prepare();
  const httpServer = createServer(async (req, res) => {
    try {
      const parsed = parse(req.url ?? "/", true);
      const pathname = parsed.pathname ?? "/";
      if (pathname === "/mcp") {
        await handleMcp(req, res);
        return;
      }
      // ChatBox Streamable HTTP may POST initialize to the same URL as GET /sse (spec §1.2).
      if (pathname === "/sse") {
        if (req.method === "GET") {
          await handleSse(req, res);
          return;
        }
        if (req.method === "POST") {
          await handleMcp(req, res);
          return;
        }
      }
      if (pathname === "/messages" && req.method === "POST") {
        const sessionId = typeof parsed.query.sessionId === "string" ? parsed.query.sessionId : undefined;
        await handleSseMessage(req, res, sessionId);
        return;
      }
      await handle(req, res, parsed);
    } catch (err) {
      console.error(err);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.end("internal error");
      }
    }
  });

  httpServer.listen(port, () => {
    console.log(`places-agent listening on http://${hostname}:${port}`);
  });

  function gracefulShutdown(signal: string) {
    console.log(`${signal} received, shutting down...`);
    httpServer.close(() => {
      mcpSessions.close();
      sseSessions.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  }

  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
