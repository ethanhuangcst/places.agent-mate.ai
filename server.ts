import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { parse } from "node:url";
import { randomUUID } from "node:crypto";
import next from "next";
import { loadEnvConfig } from "@next/env";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { createPlacesMcpServer } from "./src/mcp/create-server";
import { authenticateCaller } from "./src/auth/caller";
import { errorEnvelope } from "./src/http/envelope";

loadEnvConfig(process.cwd());

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "localhost";
const port = Number(process.env.PORT || 3000);

const mcpTransports = new Map<string, StreamableHTTPServerTransport>();
const sseSessions = new Map<string, SSEServerTransport>();

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

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return undefined;
  return JSON.parse(raw) as unknown;
}

async function handleMcp(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!(await requireCaller(req, res))) return;
  const sessionIdHeader = req.headers["mcp-session-id"];
  const sessionId = Array.isArray(sessionIdHeader) ? sessionIdHeader[0] : sessionIdHeader;

  if (req.method === "GET" || req.method === "DELETE") {
    const existing = sessionId ? mcpTransports.get(sessionId) : undefined;
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

  const body = await readJsonBody(req);
  let transport = sessionId ? mcpTransports.get(sessionId) : undefined;
  if (!transport && isInitializeRequest(body)) {
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id) => {
        mcpTransports.set(id, transport as StreamableHTTPServerTransport);
      },
    });
    transport.onclose = () => {
      const id = transport?.sessionId;
      if (id) mcpTransports.delete(id);
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
  sseSessions.set(transport.sessionId, transport);
  transport.onclose = () => {
    sseSessions.delete(transport.sessionId);
  };
  await server.connect(transport);
  await transport.start();
}

async function handleSseMessage(req: IncomingMessage, res: ServerResponse, sessionId: string | undefined) {
  if (!(await requireCaller(req, res))) return;
  const transport = sessionId ? sseSessions.get(sessionId) : undefined;
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
  createServer(async (req, res) => {
    try {
      const parsed = parse(req.url ?? "/", true);
      const pathname = parsed.pathname ?? "/";
      if (pathname === "/mcp") {
        await handleMcp(req, res);
        return;
      }
      if (pathname === "/sse" && req.method === "GET") {
        await handleSse(req, res);
        return;
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
  }).listen(port, () => {
    console.log(`places-agent listening on http://${hostname}:${port}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
