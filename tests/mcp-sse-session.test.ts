/**
 * TC-M8-S38-01 — MCP Streamable session missing/expired → clear error; initialize recovers.
 */
import { createServer } from "node:http";
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { handleMcp, closeMcpSessions, mcpInvalidSessionBody } from "../src/mcp/http-transport";
import { generateCallerSecret } from "../src/core/crypto";
import { prisma } from "../src/db/client";

const INIT_BODY = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "tc-m8-s38", version: "0.0.0" },
  },
};

describe("TC-M8-S38-01 MCP SSE/Streamable session", () => {
  let base = "";
  let secret = "";
  let server: ReturnType<typeof createServer>;

  beforeAll(async () => {
    const generated = generateCallerSecret();
    secret = generated.secret;
    await prisma.callerApiKey.create({
      data: {
        name: "mcp-session-e2e",
        keyHash: generated.keyHash,
        prefix: generated.prefix,
        status: "ACTIVE",
      },
    });

    server = createServer((req, res) => {
      void handleMcp(req, res);
    });
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const addr = server.address();
    if (!addr || typeof addr === "string") throw new Error("no port");
    base = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    closeMcpSessions();
  });

  it("should_return_clear_error_when_session_missing", async () => {
    const res = await fetch(`${base}/sse`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
        params: {},
      }),
    });
    expect(res.status).toBe(400);
    const json = (await res.json()) as {
      error?: { message?: string; data?: { outcomeKey?: string; reason?: string } };
    };
    expect(json.error?.data?.outcomeKey).toBe("errors.mcp_session_invalid");
    expect(json.error?.data?.reason).toBe("missing_session");
    expect(json.error?.message).toMatch(/initialize/i);
    expect(JSON.stringify(json)).not.toMatch(/stack|Bearer |sk-/i);
  });

  it("should_return_clear_error_when_session_expired_then_recover_via_initialize", async () => {
    const stale = await fetch(`${base}/sse`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "mcp-session-id": "00000000-0000-0000-0000-000000000000",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/list",
        params: {},
      }),
    });
    expect(stale.status).toBe(400);
    const staleJson = (await stale.json()) as {
      error?: { data?: { reason?: string }; message?: string };
    };
    expect(staleJson.error?.data?.reason).toBe("expired_or_unknown_session");
    expect(staleJson.error?.message).toMatch(/Re-initialize|expired/i);

    const init = await fetch(`${base}/sse`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify(INIT_BODY),
    });
    expect(init.status).toBeGreaterThanOrEqual(200);
    expect(init.status).toBeLessThan(300);
    const sessionId = init.headers.get("mcp-session-id");
    expect(sessionId).toBeTruthy();

    const listed = await fetch(`${base}/sse`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "mcp-session-id": sessionId!,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 4,
        method: "tools/list",
        params: {},
      }),
    });
    expect(listed.status).toBeGreaterThanOrEqual(200);
    expect(listed.status).toBeLessThan(300);
    const listText = await listed.text();
    expect(listText).toMatch(/search_restaurants|discover_places|arrange_day/);
  });

  it("should_document_invalid_session_body_shape", () => {
    const body = mcpInvalidSessionBody("missing_session");
    expect(body.error.data.outcomeKey).toBe("errors.mcp_session_invalid");
    expect(body.error.message).not.toMatch(/stack/i);
  });
});
