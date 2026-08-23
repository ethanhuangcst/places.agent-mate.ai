import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { parse } from "node:url";
import next from "next";
import { loadEnvConfig } from "@next/env";
import {
  closeMcpSessions,
  handleMcp,
  handleSse,
  handleSseMessage,
} from "./src/mcp/http-transport";
import { assertGoogleProductionSafety } from "./src/adapters/google/config";

loadEnvConfig(process.cwd());
assertGoogleProductionSafety();

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "localhost";
const port = Number(process.env.PORT || 3000);

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
      closeMcpSessions();
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
