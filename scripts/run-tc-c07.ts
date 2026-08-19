/**
 * TC-C07 — GOOGLE_MAPS via Worker MCP fallback (ADR-017) over places-agent MCP /sse.
 * Requires: PLACES_VENDOR_MODE=live, GMAPS_MCP_*, GOOGLE_DIRECT_FORCE_FAIL=1 (or mainland block).
 */
import { execSync } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { AGENT_ID } from "../src/core/locales";

const PORT = process.env.PORT ?? "3010";
const BASE = `http://localhost:${PORT}`;

function callerKey(): string {
  if (process.env.CALLER_KEY?.trim()) return process.env.CALLER_KEY.trim();
  const out = execSync("npx tsx --env-file=.env.local scripts/issue-caller-key.ts tc-c07", {
    encoding: "utf8",
  });
  return (JSON.parse(out) as { secret: string }).secret;
}

function envelopeFromToolResult(result: unknown): {
  agent?: string;
  ok?: boolean;
  data?: unknown;
  skipped?: { provider: string; reason_key: string }[];
} {
  const content = (result as { content: { type: string; text?: string }[] }).content ?? [];
  const text = content
    .filter((part) => part.type === "text")
    .map((part) => part.text ?? "")
    .join("");
  return JSON.parse(text) as ReturnType<typeof envelopeFromToolResult>;
}

function assertTcC07(search: ReturnType<typeof envelopeFromToolResult>): void {
  if (search.agent !== AGENT_ID) {
    throw new Error(`expected agent ${AGENT_ID}, got ${search.agent}`);
  }
  if (!search.ok) {
    throw new Error(`search not ok: ${JSON.stringify(search)}`);
  }
  const cards = search.data as {
    provider?: string;
    name?: string;
    sources?: { provider?: string; native_id?: string }[];
  }[];
  if (!Array.isArray(cards) || cards.length < 1) {
    throw new Error(`expected >=1 card, got ${JSON.stringify(search)}`);
  }
  for (const card of cards) {
    if (card.provider !== "GOOGLE_MAPS") {
      throw new Error(`card.provider must be GOOGLE_MAPS: ${JSON.stringify(card)}`);
    }
    for (const source of card.sources ?? []) {
      if (source.provider !== "GOOGLE_MAPS") {
        throw new Error(`sources[].provider must be GOOGLE_MAPS: ${JSON.stringify(source)}`);
      }
      const nativeId = source.native_id ?? "";
      if (nativeId.startsWith("fixture_")) {
        throw new Error(`live mode must not return fixture_* ids: ${nativeId}`);
      }
    }
  }
}

async function main(): Promise<void> {
  const key = callerKey();
  const headers = { Authorization: `Bearer ${key}` };
  const transport = new SSEClientTransport(new URL(`${BASE}/sse`), {
    eventSourceInit: { headers },
    requestInit: { headers },
  });
  const client = new Client({ name: "tc-c07-runner", version: "0.0.0" });
  await client.connect(transport);

  try {
    const geoRaw = await client.callTool({
      name: "geocode",
      arguments: { query: "Central Hong Kong", locale: "EN" },
    });
    const geo = envelopeFromToolResult(geoRaw);
    const coords = geo.data as { lat?: number; lng?: number } | null;
    if (!geo.ok || !coords?.lat || !coords?.lng) {
      throw new Error(`geocode failed: ${JSON.stringify(geo)}`);
    }
    console.log(`geocode: ${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`);

    const searchRaw = await client.callTool({
      name: "search_restaurants",
      arguments: {
        query: "restaurant",
        near: { lat: coords.lat, lng: coords.lng },
        providers: ["GOOGLE_MAPS"],
        locale: "EN",
      },
    });
    const search = envelopeFromToolResult(searchRaw);
    assertTcC07(search);

    const cards = search.data as { name?: string; sources?: { native_id?: string }[] }[];
    console.log(`TC-C07 PASS: ${cards.length} live GOOGLE_MAPS card(s) via mcp__search_restaurants`);
    for (const card of cards.slice(0, 5)) {
      const nid = card.sources?.[0]?.native_id ?? "?";
      console.log(`  - ${card.name} (${nid})`);
    }
    console.log(
      JSON.stringify(
        {
          tool: "search_restaurants",
          arguments: {
            query: "restaurant",
            near: coords,
            providers: ["GOOGLE_MAPS"],
            locale: "EN",
          },
          agent: search.agent,
          ok: search.ok,
          card_count: cards.length,
        },
        null,
        2,
      ),
    );
  } finally {
    await client.close();
  }
}

void main().catch((err) => {
  console.error("TC-C07 FAIL:", err instanceof Error ? err.message : err);
  process.exit(1);
});
