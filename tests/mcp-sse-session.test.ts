/**
 * TC-M12-52 — MCP `/mcp` stateless (ADR-045 §7).
 * No session id issued/validated; every request independent; GET/DELETE → 405.
 */
import { createServer } from "node:http";
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import {
  handleMcp,
  closeMcpSessions,
  mcpInvalidSessionBody,
} from "../src/mcp/http-transport";
import { generateCallerSecret } from "../src/core/crypto";
import { prisma } from "../src/db/client";

const INIT_BODY = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "tc-m12-s52", version: "0.0.0" },
  },
};

const TOOLS_LIST_BODY = {
  jsonrpc: "2.0",
  id: 2,
  method: "tools/list",
  params: {},
};

describe("TC-M12-52 MCP /mcp stateless", () => {
  let base = "";
  let secret = "";
  let server: ReturnType<typeof createServer>;

  beforeAll(async () => {
    const generated = generateCallerSecret();
    secret = generated.secret;
    await prisma.callerApiKey.create({
      data: {
        name: "mcp-stateless-e2e",
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

  it("should_not_issue_or_validate_session_id_on_initialize", async () => {
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
    // Stateless: no mcp-session-id header issued.
    expect(init.headers.get("mcp-session-id")).toBeNull();
  });

  it("should_accept_tools_call_without_session_id", async () => {
    const res = await fetch(`${base}/sse`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify(TOOLS_LIST_BODY),
    });
    expect(res.status).toBeGreaterThanOrEqual(200);
    expect(res.status).toBeLessThan(300);
    expect(res.headers.get("mcp-session-id")).toBeNull();
    const text = await res.text();
    expect(text).toMatch(/search_restaurants|discover_places|make_itinerary/);
  });

  it("should_ignore_stale_session_id_and_not_reject", async () => {
    const res = await fetch(`${base}/sse`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "mcp-session-id": "00000000-0000-0000-0000-000000000000",
      },
      body: JSON.stringify(TOOLS_LIST_BODY),
    });
    // Stateless: stale id is ignored, request still succeeds (no 400/404).
    expect(res.status).toBeGreaterThanOrEqual(200);
    expect(res.status).toBeLessThan(300);
    expect(res.headers.get("mcp-session-id")).toBeNull();
  });

  it("should_return_405_for_get_and_delete", async () => {
    const getRes = await fetch(`${base}/mcp`, {
      method: "GET",
      headers: { Authorization: `Bearer ${secret}` },
    });
    expect(getRes.status).toBe(405);

    const delRes = await fetch(`${base}/mcp`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${secret}` },
    });
    expect(delRes.status).toBe(405);
  });

  it("should_document_invalid_session_body_shape_for_sse_legacy", () => {
    // mcpInvalidSessionBody is retained for the legacy /sse + /messages path.
    const body = mcpInvalidSessionBody("missing_session");
    expect(body.error.data.outcomeKey).toBe("errors.mcp_session_invalid");
    expect(body.error.message).not.toMatch(/stack/i);
  });
});
