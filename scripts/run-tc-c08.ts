/**
 * TC-C08 — Restaurant search (Shanghai 日料) over places-agent MCP /sse.
 * Prompt: 找上海爱琴海附近的日料店
 */
import { execSync } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { AGENT_ID } from "../src/core/locales";

const PORT = process.env.PORT ?? "3010";
const BASE = `http://localhost:${PORT}`;

const SHANGHAI_HINT =
  /上海|shanghai|爱琴海|愛琴海|aegean|闵行|閔行|minhang|吴中路|吳中路|1588/i;
const JAPANESE_HINT =
  /日料|日本料理|japanese|烧肉|燒肉|寿司|壽司|ramen|sushi|和牛|日式|将太|赤坂|akasaka|江户|江戶|wagyu|sapporo/i;

function callerKey(): string {
  if (process.env.CALLER_KEY?.trim()) return process.env.CALLER_KEY.trim();
  const out = execSync("npx tsx --env-file=.env.local scripts/issue-caller-key.ts tc-c08", {
    encoding: "utf8",
  });
  return (JSON.parse(out) as { secret: string }).secret;
}

function envelopeFromToolResult(result: unknown): {
  agent?: string;
  ok?: boolean;
  data?: unknown;
  skipped?: { provider: string; reason_key: string }[];
  outcome?: { key: string };
} {
  const content = (result as { content: { type: string; text?: string }[] }).content ?? [];
  const text = content
    .filter((part) => part.type === "text")
    .map((part) => part.text ?? "")
    .join("");
  return JSON.parse(text) as ReturnType<typeof envelopeFromToolResult>;
}

function assertTcC08(
  geo: ReturnType<typeof envelopeFromToolResult>,
  search: ReturnType<typeof envelopeFromToolResult>,
): void {
  if (geo.agent !== AGENT_ID || !geo.ok) {
    throw new Error(`geocode failed: ${JSON.stringify(geo)}`);
  }
  const coords = geo.data as { lat?: number; lng?: number } | null;
  if (!coords?.lat || !coords?.lng) {
    throw new Error(`geocode missing coords: ${JSON.stringify(geo)}`);
  }
  if (coords.lat < 30 || coords.lat > 32 || coords.lng < 120 || coords.lng > 122) {
    throw new Error(
      `expected Shanghai ~31N/121E, got ${coords.lat}, ${coords.lng} (HK is ~22/114)`,
    );
  }

  if (search.agent !== AGENT_ID || !search.ok) {
    throw new Error(`search failed: ${JSON.stringify(search)}`);
  }

  const cards = search.data as {
    name?: string;
    address?: string;
    location?: { lat?: number; lng?: number };
  }[];
  if (!Array.isArray(cards) || cards.length < 1) {
    throw new Error(`expected >=1 restaurant: ${JSON.stringify(search)}`);
  }

  const withShanghaiHint = cards.filter(
    (c) => SHANGHAI_HINT.test(c.address ?? "") || SHANGHAI_HINT.test(c.name ?? ""),
  );
  if (withShanghaiHint.length < 1) {
    throw new Error(
      `expected address/name mentioning 上海/爱琴海/Minhang: ${JSON.stringify(cards)}`,
    );
  }
}

async function main(): Promise<void> {
  const key = callerKey();
  const authHeaders = { Authorization: `Bearer ${key}` };
  const transport = new SSEClientTransport(new URL(`${BASE}/sse`), {
    eventSourceInit: { headers: authHeaders },
    requestInit: { headers: authHeaders },
  });
  const client = new Client({ name: "tc-c08-runner", version: "0.0.0" });
  await client.connect(transport);

  try {
    const geoRaw = await client.callTool({
      name: "geocode",
      arguments: { query: "上海爱琴海", locale: "CN", providers: ["AMAP"] },
    });
    const geo = envelopeFromToolResult(geoRaw);
    const coords = geo.data as { lat: number; lng: number; address?: string };

    const searchRaw = await client.callTool({
      name: "search_restaurants",
      arguments: {
        query: "日料",
        near: { lat: coords.lat, lng: coords.lng },
        locale: "CN",
        providers: ["AMAP"],
      },
    });
    const search = envelopeFromToolResult(searchRaw);
    assertTcC08(geo, search);

    const cards = search.data as { name?: string; address?: string }[];
    console.log(`TC-C08 PASS: geocode ${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`);
    console.log(`  ${cards.length} restaurant(s):`);
    for (const card of cards.slice(0, 5)) {
      console.log(`  - ${card.name}${card.address ? ` (${card.address})` : ""}`);
    }
    console.log(
      JSON.stringify(
        {
          prompt: "找上海爱琴海附近的日料店",
          geocode: { query: "上海爱琴海", lat: coords.lat, lng: coords.lng },
          search: { query: "日料", card_count: cards.length },
          agent: search.agent,
          ok: search.ok,
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
  console.error("TC-C08 FAIL:", err instanceof Error ? err.message : err);
  process.exit(1);
});
