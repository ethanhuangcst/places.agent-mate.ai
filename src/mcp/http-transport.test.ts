/**
 * TC-M12-52-03 — `/mcp` stateless unit (ADR-045 §7).
 *
 * Exercises `handleMcp` directly with a tiny http.Server, mocking caller auth so
 * no DB is required. Asserts the stateless contract: no `mcp-session-id` header
 * issued, `initialize` and `tools/list` succeed without a session id, and a
 * stale `mcp-session-id` is ignored (not rejected).
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { describe, expect, it, beforeAll, afterAll, vi } from "vitest";

vi.mock("../auth/caller", () => ({
  authenticateCaller: async () => ({ ok: true, keyId: "test-key" }),
}));

import { handleMcp, closeMcpSessions } from "./http-transport";

const INIT_BODY = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "tc-m12-52-03", version: "0.0.0" },
  },
};

const TOOLS_LIST_BODY = { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} };

function post(base: string, body: unknown, extraHeaders: Record<string, string> = {}) {
  return fetch(`${base}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  });
}

describe("TC-M12-52-03 /mcp stateless (unit, no DB)", () => {
  let base = "";
  let server: ReturnType<typeof createServer>;

  beforeAll(async () => {
    server = createServer((req: IncomingMessage, res: ServerResponse) => {
      void handleMcp(req, res);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const addr = server.address();
    if (!addr || typeof addr === "string") throw new Error("no port");
    base = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
    closeMcpSessions();
    vi.restoreAllMocks();
  });

  it("should_not_issue_session_id_on_initialize", async () => {
    const res = await post(base, INIT_BODY);
    expect(res.status).toBeGreaterThanOrEqual(200);
    expect(res.status).toBeLessThan(300);
    expect(res.headers.get("mcp-session-id")).toBeNull();
  });

  it("should_accept_tools_list_without_session_id", async () => {
    const res = await post(base, TOOLS_LIST_BODY);
    expect(res.status).toBeGreaterThanOrEqual(200);
    expect(res.status).toBeLessThan(300);
    expect(res.headers.get("mcp-session-id")).toBeNull();
    const text = await res.text();
    expect(text).toMatch(/search_restaurants|discover_places|make_itinerary/);
  });

  it("should_accept_tools_call_without_session_id", async () => {
    const res = await post(base, {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "visa_requirement", arguments: { passport: "CHN", destination: "SGP", locale: "EN" } },
    });
    expect(res.status).toBeGreaterThanOrEqual(200);
    expect(res.status).toBeLessThan(300);
    expect(res.headers.get("mcp-session-id")).toBeNull();
    const text = await res.text();
    expect(text).toMatch(/visa_free|requirement/);
  });

  it("should_ignore_stale_session_id_not_reject", async () => {
    const res = await post(base, TOOLS_LIST_BODY, {
      "mcp-session-id": "00000000-0000-0000-0000-000000000000",
    });
    expect(res.status).toBeGreaterThanOrEqual(200);
    expect(res.status).toBeLessThan(300);
    expect(res.headers.get("mcp-session-id")).toBeNull();
  });

  it("should_return_405_for_get_and_delete", async () => {
    const getRes = await fetch(`${base}/mcp`, { method: "GET" });
    expect(getRes.status).toBe(405);
    const delRes = await fetch(`${base}/mcp`, { method: "DELETE" });
    expect(delRes.status).toBe(405);
  });
});
