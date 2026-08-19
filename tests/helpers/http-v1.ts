import { expect } from "vitest";
import { GET as getHealthRoute } from "../../app/v1/health/route";
import { POST as postChatRoute } from "../../app/v1/chat/route";
import { postTool } from "../../src/http/route";
import { type ToolName } from "../../src/http/dispatch";
import { prisma } from "../../src/db/client";
import { generateCallerSecret, hashPassword } from "../../src/core/crypto";
import { AGENT_ID } from "../../src/core/locales";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createPlacesMcpServer } from "../../src/mcp/create-server";

const ADMIN = {
  username: "admin",
  email: "me@ethanhuang.com",
};

export type V1Envelope<T = unknown> = {
  agent: string;
  ok: boolean;
  data?: T;
  outcome?: { key: string; locales?: Record<string, string> };
  skipped?: { provider: string; reason_key: string }[];
  locale?: string;
};

export type V1Response<T = unknown> = {
  status: number;
  body: V1Envelope<T>;
};

export async function resetCallerDb(): Promise<void> {
  await prisma.callerApiKey.deleteMany();
  await prisma.adminUser.deleteMany();
  await prisma.adminUser.create({
    data: {
      ...ADMIN,
      passwordHash: await hashPassword("devpass"),
    },
  });
}

export async function issueTestCallerKey(): Promise<string> {
  const generated = generateCallerSecret();
  await prisma.callerApiKey.create({
    data: {
      name: "http-tc-h",
      keyHash: generated.keyHash,
      prefix: generated.prefix,
      status: "ACTIVE",
    },
  });
  return `Bearer ${generated.secret}`;
}

export function parseEnvelope<T = unknown>(body: V1Envelope<T>): V1Envelope<T> {
  expect(body.agent).toBe(AGENT_ID);
  return body;
}

async function readResponse<T>(res: Response): Promise<V1Response<T>> {
  const body = (await res.json()) as V1Envelope<T>;
  return { status: res.status, body };
}

export async function getV1Health(): Promise<V1Response<{ tools: string[] }>> {
  const res = await getHealthRoute();
  return readResponse(res);
}

export async function postV1<T = unknown>(
  tool: ToolName,
  body: unknown,
  auth?: string,
): Promise<V1Response<T>> {
  const req = new Request(`http://localhost/v1/${tool}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(auth ? { Authorization: auth } : {}),
    },
    body: JSON.stringify(body),
  });
  const res = await postTool(tool, req);
  return readResponse(res);
}

export async function postV1Chat<T = unknown>(
  body: unknown,
  auth?: string,
): Promise<V1Response<T>> {
  const req = new Request("http://localhost/v1/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(auth ? { Authorization: auth } : {}),
    },
    body: JSON.stringify(body),
  });
  const res = await postChatRoute(req);
  return readResponse(res);
}

export async function callMcpTool(
  name: string,
  args: Record<string, unknown>,
): Promise<V1Envelope> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createPlacesMcpServer();
  const client = new Client({ name: "http-tc-h-parity", version: "0.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  const result = await client.callTool({ name, arguments: args });
  const text = (result.content as { type: string; text?: string }[])
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
  await client.close();
  await server.close();
  return JSON.parse(text) as V1Envelope;
}

/** Compare HTTP and MCP envelopes for Feature 11 parity (card count, names, skipped). */
export function assertEnvelopeParity(http: V1Envelope, mcp: V1Envelope): void {
  expect(mcp.agent).toBe(http.agent);
  expect(mcp.ok).toBe(http.ok);
  const httpCards = (http.data ?? []) as { name: string }[];
  const mcpCards = (mcp.data ?? []) as { name: string }[];
  expect(mcpCards.length).toBe(httpCards.length);
  const httpNames = httpCards.map((c) => c.name).sort();
  const mcpNames = mcpCards.map((c) => c.name).sort();
  expect(mcpNames).toEqual(httpNames);
  expect(mcp.skipped ?? []).toEqual(http.skipped ?? []);
}
