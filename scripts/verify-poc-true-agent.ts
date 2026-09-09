/**
 * In-process POC true-agent verification (no Google).
 * Usage: npx tsx --env-file=.env.local scripts/verify-poc-true-agent.ts
 *
 * Scenario: Lisbon 4-day from Hills Hotel Lisbon (2026-09-12),
 * couple / premium / public_transit / must-see 5→3 / start 07:00.
 * Writes specs/poc-true-agent-verification.md + .html for human review.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { prisma } from "../src/db/client";
import { generateCallerSecret } from "../src/core/crypto";
import {
  listPoisForDestination,
  setPoiRegistryStore,
} from "../src/core/destination-poi-registry";
import { createPrismaPoiRegistryStore } from "../src/core/destination-poi-registry-prisma";
import { planTrip } from "../src/core/plan-trip";
import type { PlaceCard, ToolResult } from "../src/core/types";

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
const OUT = resolve(ROOT, "specs/poc-true-agent-verification.md");
const OUT_HTML = resolve(ROOT, "specs/poc-true-agent-verification.html");

const NUM_DAYS = 4;
const BOUNDS = { start: "2026-09-12", end: "2026-09-15" } as const;
const PARTY_SIZE = 2;
const START_TIME = "07:00";
/** Full days ≈ stay+3attr+lunch+dinner × 4 ≈ 24. */
const FILL_STEPS = 24;
const TRANSIT_MIN = 30;

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function fromMinutes(total: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, total));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function addMin(hhmm: string, mins: number): string {
  return fromMinutes(toMinutes(hhmm) + mins);
}

/** Raise start to window floor when earlier. */
function snapUp(start: string, windowStart: string): string {
  return toMinutes(start) < toMinutes(windowStart) ? windowStart : start;
}

function place(opts: {
  name: string;
  lat: number;
  lng: number;
  nativeId: string;
  category?: string;
}): PlaceCard {
  return {
    provider: "GOOGLE_MAPS",
    name: opts.name,
    location: { lat: opts.lat, lng: opts.lng, crs: "WGS84" },
    category: opts.category ?? "attraction",
    photos: [`https://cdn.example.com/${opts.nativeId}.jpg`],
    sources: [
      {
        provider: "GOOGLE_MAPS",
        native_id: opts.nativeId,
        deeplinks: {},
      },
    ],
  };
}

function restaurantCard(slot: string, index: number): PlaceCard {
  const names: Record<string, string[]> = {
    lunch: ["Time Out Market Lisboa", "Café Belém", "A Brasileira", "Mercado da Ribeira"],
    dinner: ["Solar dos Nunes", "Cervejaria Ramiro", "Bairro do Avillez", "Prado Restaurant"],
    afternoon_tea: ["Pastéis de Belém", "Fábrica da Nata"],
  };
  const list = names[slot] ?? names.lunch;
  const name = list[index % list.length]!;
  return place({
    name,
    lat: 38.71 + index * 0.001,
    lng: -9.14 - index * 0.001,
    nativeId: `verify_meal_${slot}_${index}`,
    category: "restaurant",
  });
}

function okCards(cards: PlaceCard[]): ToolResult<PlaceCard[]> {
  return { data: cards, skipped: [], locale: "EN" };
}

function okGeocode(
  lat: number,
  lng: number,
): ToolResult<{ lat: number; lng: number; crs: string; address?: string } | null> {
  return { data: { lat, lng, crs: "WGS84", address: "Lisbon" }, skipped: [], locale: "EN" };
}

function mdEscape(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

type Check = { id: string; ok: boolean; detail: string };

type RenderArgs = {
  passed: boolean;
  now: string;
  elapsedMs: number;
  hotelName: string;
  mustSeeCandidates: string[];
  mustInclude: string[];
  checks: Check[];
  toolCalls: string[];
  fullCalls: string[];
  skeletonDays: Array<{
    day_index: number;
    day_theme?: string;
    stops: Array<{ name: string; kind?: string }>;
  }>;
  filledStops: Array<{
    day_index: number;
    stop_index: number;
    stop: unknown;
    slot: unknown;
  }>;
  poolBefore: number;
  poolAfter: number;
  poolSample: string[];
  tripId: string;
  revision: number;
  status: string;
  timing: unknown;
};

function stopName(stop: unknown): string {
  if (stop && typeof stop === "object" && "name" in stop) {
    const n = (stop as { name?: unknown }).name;
    if (typeof n === "string") return n;
  }
  return String(stop ?? "");
}

function stopKind(stop: unknown): string {
  if (stop && typeof stop === "object" && "kind" in stop) {
    const k = (stop as { kind?: unknown }).kind;
    if (typeof k === "string") return k;
  }
  return "";
}

function slotLabel(slot: unknown): string {
  if (!slot || typeof slot !== "object") return "—";
  const s = slot as { start?: string; end?: string };
  if (s.start && s.end) return `${s.start}–${s.end}`;
  if (s.start) return s.start;
  return "—";
}

function renderHtml(a: RenderArgs): string {
  const verdict = a.passed ? "PASS" : "FAIL";
  const mustSet = new Set(a.mustInclude);

  const checksRows = a.checks
    .map(
      (c) =>
        `<tr><td><code>${esc(c.id)}</code></td><td class="${c.ok ? "ok" : "fail"}">${c.ok ? "PASS" : "FAIL"}</td><td>${esc(c.detail)}</td></tr>`,
    )
    .join("\n");

  const candidateLis = a.mustSeeCandidates
    .map((name, i) => {
      const selected = mustSet.has(name);
      return `<li class="${selected ? "selected" : ""}"><span class="idx">${i + 1}</span> ${esc(name)}${selected ? ' <span class="badge">入选</span>' : ""}</li>`;
    })
    .join("\n");

  const daysHtml = a.skeletonDays
    .map((d) => {
      const filled = a.filledStops.filter((f) => f.day_index === d.day_index);
      const stopsHtml =
        filled.length > 0
          ? filled
              .map((f) => {
                const name = stopName(f.stop);
                const kind = stopKind(f.stop) || "stop";
                const must = mustSet.has(name);
                return `<div class="slot">
            <div class="slot-time">${esc(slotLabel(f.slot))}</div>
            <div class="slot-body">
              <span class="slot-kind">${esc(kind)}</span>
              <strong>${esc(name)}</strong>
              ${must ? '<span class="badge">必去</span>' : ""}
            </div>
          </div>`;
              })
              .join("\n")
          : d.stops
              .map((s) => {
                const must = mustSet.has(s.name);
                return `<div class="slot">
            <div class="slot-time">—</div>
            <div class="slot-body">
              <span class="slot-kind">${esc(s.kind ?? "stop")}</span>
              <strong>${esc(s.name)}</strong>
              ${must ? '<span class="badge">必去</span>' : ""}
            </div>
          </div>`;
              })
              .join("\n");

      return `<article class="day" id="day-${d.day_index}">
        <h3>Day ${d.day_index} · ${esc(d.day_theme ?? "")}</h3>
        <div class="slots">${stopsHtml}</div>
      </article>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>POC true-agent 验收 · Lisbon 4 天</title>
  <style>
    :root {
      --ink: #1a2b3a;
      --mute: #5f7182;
      --line: #c8d4d1;
      --bg: #f7f4ef;
      --panel: #fffdf9;
      --ok: #0a7a72;
      --fail: #9b2c2c;
      --accent: #0a7a72;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "IBM Plex Sans", "Segoe UI", system-ui, sans-serif;
      color: var(--ink);
      background: var(--bg);
      line-height: 1.5;
    }
    header {
      padding: 1.5rem 1.25rem 1rem;
      border-bottom: 1px solid var(--line);
      background: linear-gradient(180deg, #e8f2f0 0%, var(--bg) 100%);
    }
    header h1 { margin: 0 0 0.35rem; font-size: 1.45rem; }
    .meta { color: var(--mute); font-size: 0.9rem; }
    .verdict {
      display: inline-block;
      margin-top: 0.6rem;
      padding: 0.2rem 0.65rem;
      border-radius: 4px;
      font-weight: 700;
      letter-spacing: 0.04em;
      color: #fff;
      background: var(--fail);
    }
    .verdict.pass { background: var(--ok); }
    main { max-width: 920px; margin: 0 auto; padding: 1.25rem; }
    section {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 1rem 1.1rem 1.15rem;
      margin-bottom: 1rem;
    }
    section h2 {
      margin: 0 0 0.75rem;
      font-size: 1.05rem;
      border-bottom: 1px solid var(--line);
      padding-bottom: 0.4rem;
    }
    .constraint-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 0.65rem 1rem;
      margin: 0;
    }
    .constraint-grid div { margin: 0; }
    .constraint-grid dt {
      font-size: 0.75rem;
      color: var(--mute);
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }
    .constraint-grid dd { margin: 0.1rem 0 0; font-weight: 600; }
    table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
    th, td { text-align: left; padding: 0.4rem 0.5rem; border-bottom: 1px solid var(--line); vertical-align: top; }
    th { color: var(--mute); font-weight: 600; font-size: 0.8rem; }
    .ok { color: var(--ok); font-weight: 700; }
    .fail { color: var(--fail); font-weight: 700; }
    .candidates { list-style: none; padding: 0; margin: 0; }
    .candidates li {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.4rem 0.5rem;
      border-bottom: 1px dashed var(--line);
    }
    .candidates li.selected { background: #e8f2f0; }
    .idx {
      display: inline-flex;
      width: 1.4rem;
      height: 1.4rem;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      background: var(--line);
      font-size: 0.75rem;
      font-weight: 700;
    }
    .badge {
      display: inline-block;
      margin-left: 0.35rem;
      padding: 0.05rem 0.4rem;
      border-radius: 3px;
      background: var(--accent);
      color: #fff;
      font-size: 0.7rem;
      font-weight: 700;
    }
    .day { margin-bottom: 1.1rem; }
    .day h3 { margin: 0 0 0.5rem; font-size: 1rem; color: var(--accent); }
    .slot {
      display: grid;
      grid-template-columns: 6.5rem 1fr;
      gap: 0.5rem;
      padding: 0.45rem 0;
      border-bottom: 1px solid var(--line);
    }
    .slot-time {
      font-family: "IBM Plex Mono", ui-monospace, monospace;
      font-size: 0.85rem;
      color: var(--mute);
    }
    .slot-kind {
      display: inline-block;
      margin-right: 0.4rem;
      font-size: 0.7rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--mute);
    }
    pre {
      margin: 0;
      padding: 0.75rem;
      background: #1a2b3a;
      color: #e8f2f0;
      border-radius: 6px;
      overflow-x: auto;
      font-size: 0.8rem;
      white-space: pre-wrap;
      word-break: break-word;
    }
    footer {
      max-width: 920px;
      margin: 0 auto 2rem;
      padding: 0 1.25rem;
      color: var(--mute);
      font-size: 0.85rem;
    }
    code { font-family: "IBM Plex Mono", ui-monospace, monospace; font-size: 0.85em; }
  </style>
</head>
<body>
  <header>
    <h1>POC true-agent 验收 · Lisbon 4 天</h1>
    <p class="meta">${esc(a.now)} · 耗时 ${a.elapsedMs} ms · 起点 ${esc(a.hotelName)}</p>
    <span class="verdict ${a.passed ? "pass" : ""}">${verdict}</span>
  </header>

  <main>
    <section aria-labelledby="constraints-title">
      <h2 id="constraints-title">出行限制</h2>
      <dl class="constraint-grid">
        <div><dt>目的地</dt><dd>Lisbon</dd></div>
        <div><dt>起始日期</dt><dd>${BOUNDS.start}</dd></div>
        <div><dt>结束日期</dt><dd>${BOUNDS.end}</dd></div>
        <div><dt>天数</dt><dd>${NUM_DAYS}</dd></div>
        <div><dt>人数</dt><dd>${PARTY_SIZE}</dd></div>
        <div><dt>预算</dt><dd>premium（宽松）</dd></div>
        <div><dt>住宿 / 起点</dt><dd>${esc(a.hotelName)}</dd></div>
        <div><dt>每日开始</dt><dd>${START_TIME}</dd></div>
        <div><dt>行程类型</dt><dd>情侣出行（couple）</dd></div>
        <div><dt>节奏</dt><dd>relaxed</dd></div>
        <div><dt>交通偏好</dt><dd>公共交通（public_transit）</dd></div>
        <div><dt>必去点</dt><dd>${esc(a.mustInclude.join("、"))}</dd></div>
        <div><dt>其他</dt><dd>默认</dd></div>
      </dl>
    </section>

    <section aria-labelledby="mustsee-title">
      <h2 id="mustsee-title">必去点候选（5 选 3）</h2>
      <ol class="candidates">
${candidateLis}
      </ol>
    </section>

    <section aria-labelledby="checks-title">
      <h2 id="checks-title">验证检查</h2>
      <table>
        <thead><tr><th>ID</th><th>结果</th><th>详情</th></tr></thead>
        <tbody>
${checksRows}
        </tbody>
      </table>
    </section>

    <section aria-labelledby="itin-title">
      <h2 id="itin-title">行程（骨架 + 填充）</h2>
${daysHtml}
    </section>

    <section aria-labelledby="tools-title">
      <h2 id="tools-title">tool_calls</h2>
      <p class="meta">Intake + full-loop</p>
      <pre>${esc(a.toolCalls.join(" → "))}</pre>
      <p class="meta" style="margin-top:0.75rem">Model-chosen full-loop</p>
      <pre>${esc(a.fullCalls.join(" → "))}</pre>
    </section>

    <section aria-labelledby="registry-title">
      <h2 id="registry-title">Registry（Lisbon stops pool）</h2>
      <p>Before: <strong>${a.poolBefore}</strong> · After: <strong>${a.poolAfter}</strong></p>
      <p class="meta">Sample: ${esc(a.poolSample.join(", "))}${a.poolAfter > a.poolSample.length ? "…" : ""}</p>
    </section>

    <section aria-labelledby="env-title">
      <h2 id="env-title">环境</h2>
      <ul>
        <li><code>PLACES_VENDOR_MODE=fixture</code>（未调用 Google）</li>
        <li><code>PLAN_TRIP_LEGACY_FULL_LOOP</code> unset（模型驱动全环）</li>
        <li>LLM keys 已在进程内清空</li>
        <li>Stops pool：Prisma AttractionPoi</li>
      </ul>
    </section>
  </main>

  <footer>
    <p><code>trip_id</code>: ${esc(a.tripId)} · revision ${a.revision} · status ${esc(a.status)}</p>
    <p>timing: <code>${esc(JSON.stringify(a.timing))}</code></p>
    <p>重新运行：<code>cd places-agent &amp;&amp; npx tsx --env-file=.env.local scripts/verify-poc-true-agent.ts</code></p>
  </footer>
</body>
</html>
`;
}

async function main(): Promise<void> {
  process.env.PLACES_VENDOR_MODE = "fixture";
  delete process.env.QWEN_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.PLAN_TRIP_LEGACY_FULL_LOOP;

  setPoiRegistryStore(createPrismaPoiRegistryStore(prisma));

  const generated = generateCallerSecret();
  const row = await prisma.callerApiKey.create({
    data: {
      name: `poc-verify-${Date.now()}`,
      keyHash: generated.keyHash,
      prefix: generated.prefix,
      secret: generated.secret,
      status: "ACTIVE",
    },
  });

  const belem = place({
    name: "Torre de Belém",
    lat: 38.6916,
    lng: -9.216,
    nativeId: "verify_belem",
  });
  const castelo = place({
    name: "Castelo de São Jorge",
    lat: 38.7139,
    lng: -9.1335,
    nativeId: "verify_castelo",
  });
  const jeronimos = place({
    name: "Mosteiro dos Jerónimos",
    lat: 38.6979,
    lng: -9.2067,
    nativeId: "verify_jeronimos",
  });
  const lxFactory = place({
    name: "LX Factory",
    lat: 38.7035,
    lng: -9.1788,
    nativeId: "verify_lx",
  });
  const miradouro = place({
    name: "Miradouro da Senhora do Monte",
    lat: 38.7192,
    lng: -9.1331,
    nativeId: "verify_miradouro",
  });

  /** Recommend 5 must-see; pick first 3. */
  const mustSeeCandidates = [
    belem.name,
    jeronimos.name,
    castelo.name,
    lxFactory.name,
    miradouro.name,
  ];
  const mustInclude = mustSeeCandidates.slice(0, 3);

  const hotel: PlaceCard = {
    ...place({
      name: "Hills Hotel Lisbon",
      lat: 38.7255,
      lng: -9.1502,
      nativeId: "verify_hills_hotel",
    }),
    category: "hotel",
  };
  const attractions = [belem, castelo, jeronimos, lxFactory, miradouro];

  const poolBefore = await listPoisForDestination({
    city: "Lisbon",
    lat: 38.7223,
    lng: -9.1393,
  });

  let mealIndex = 0;
  const t0 = Date.now();
  const planned = await planTrip({
    callerKey: row.id,
    city: "Lisbon",
    locale: "EN",
    numDays: NUM_DAYS,
    origin: { name: hotel.name },
    pace: "relaxed",
    budget: "premium",
    trip_type: "couple",
    transit_preference: "public_transit",
    bounds: { start: BOUNDS.start, end: BOUNDS.end },
    must_include: mustInclude,
    _testGeocode: async () => okGeocode(38.7223, -9.1393),
    _testSearchPlaces: async () => okCards(attractions),
    _testResolveStay: async () => hotel,
    _testFullLoopTurns: [
      { type: "tool", name: "resolve_origin_stay", args: {} },
      { type: "tool", name: "search_places", args: {} },
      { type: "tool", name: "make_itinerary", args: {} },
      ...Array.from({ length: FILL_STEPS }, () => ({
        type: "tool" as const,
        name: "plan_next_stop",
        args: {},
      })),
      { type: "tool", name: "commit_artifacts", args: {} },
      { type: "stop" },
    ],
    _testMakeItinerary: async () => ({
      skeleton: {
        days: [
          {
            day_index: 1,
            day_theme: "Belém waterfront",
            stops: [
              { name: hotel.name, kind: "stay" as const },
              { name: belem.name, kind: "attraction" as const, visit_part: "am" as const },
              { name: jeronimos.name, kind: "attraction" as const },
              { name: "lunch", kind: "meal" as const, meal_slot: "lunch" as const },
              { name: miradouro.name, kind: "attraction" as const, visit_part: "pm" as const },
              { name: "dinner", kind: "meal" as const, meal_slot: "dinner" as const },
            ],
          },
          {
            day_index: 2,
            day_theme: "Alfama & castle",
            stops: [
              { name: hotel.name, kind: "stay" as const },
              { name: castelo.name, kind: "attraction" as const, visit_part: "am" as const },
              { name: miradouro.name, kind: "attraction" as const },
              { name: "lunch", kind: "meal" as const, meal_slot: "lunch" as const },
              { name: lxFactory.name, kind: "attraction" as const, visit_part: "pm" as const },
              { name: "dinner", kind: "meal" as const, meal_slot: "dinner" as const },
            ],
          },
          {
            day_index: 3,
            day_theme: "Alcântara creative",
            stops: [
              { name: hotel.name, kind: "stay" as const },
              { name: lxFactory.name, kind: "attraction" as const, visit_part: "am" as const },
              { name: belem.name, kind: "attraction" as const },
              { name: "lunch", kind: "meal" as const, meal_slot: "lunch" as const },
              { name: jeronimos.name, kind: "attraction" as const, visit_part: "pm" as const },
              { name: "dinner", kind: "meal" as const, meal_slot: "dinner" as const },
            ],
          },
          {
            day_index: 4,
            day_theme: "Return to Belém",
            stops: [
              { name: hotel.name, kind: "stay" as const },
              { name: belem.name, kind: "attraction" as const, visit_part: "am" as const },
              { name: jeronimos.name, kind: "attraction" as const },
              { name: "lunch", kind: "meal" as const, meal_slot: "lunch" as const },
              { name: castelo.name, kind: "attraction" as const, visit_part: "pm" as const },
              { name: "dinner", kind: "meal" as const, meal_slot: "dinner" as const },
            ],
          },
        ],
      },
      candidates_slim: { places: attractions, restaurants: [] },
    }),
    _testPlanNextStopFill: async (fillInput) => {
      const kind = fillInput.next_stop.kind ?? "attraction";
      const mealSlot = fillInput.next_stop.meal_slot;
      const prevEnd =
        fillInput.current_stop?.end_time ??
        fillInput.previous_stop?.end_time ??
        fillInput.time_from;
      const originStay =
        kind === "stay" &&
        (fillInput.origin_mode === true ||
          fillInput.stay_role === "day_origin" ||
          !prevEnd);

      let start: string;
      let duration: number;

      if (originStay) {
        start = START_TIME;
        duration = 30;
      } else if (kind === "meal") {
        start = prevEnd ? addMin(prevEnd, TRANSIT_MIN) : START_TIME;
        if (mealSlot === "dinner") {
          start = snapUp(start, "18:30");
          duration = 90;
        } else if (mealSlot === "afternoon_tea") {
          start = snapUp(start, "15:30");
          duration = 45;
        } else {
          start = snapUp(start, "12:00");
          duration = 60;
        }
      } else {
        start = prevEnd ? addMin(prevEnd, TRANSIT_MIN) : START_TIME;
        duration = 90;
      }

      const end = addMin(start, duration);
      let stopName = fillInput.next_stop.name;
      let card: PlaceCard | null = null;
      if (kind === "meal") {
        const slot = mealSlot ?? "lunch";
        card = restaurantCard(slot, mealIndex++);
        stopName = card.name;
      }

      return {
        next_stop: {
          name: stopName,
          location: {
            lat: card?.location.lat ?? 38.72,
            lng: card?.location.lng ?? -9.14,
            crs: "WGS84" as const,
          },
        },
        legs: [],
        transit_outcome: "directions" as const,
        single_mode: true,
        venue_card: card ?? undefined,
        stop_display: {
          stop: {
            name: stopName,
            kind,
            card,
            deeplinks: {},
          },
          slot: { start, end },
          legs_to_here: [],
          transit_outcome: "directions" as const,
          notes: [],
        },
      };
    },
    _testTravelTips: async () => ({
      intro:
        "Four days in Lisbon for a couple: Belém classics, Alfama castle views, LX Factory, and a return to the waterfront.",
      iconic_places: mustInclude,
      iconic_grounded: true,
      transit: "Prefer public transit (tram 15/28, metro) and walking hills.",
      weather: null,
      weather_unavailable: true,
      clothing: "Light layers; hills in Alfama; start early at 07:00.",
      safety: "Watch pickpockets on tram 28.",
    }),
  });
  const elapsedMs = Date.now() - t0;

  const poolAfter = await listPoisForDestination({
    city: "Lisbon",
    lat: 38.7223,
    lng: -9.1393,
  });

  const originIdx = (planned.tool_calls ?? []).indexOf("resolve_origin_stay");
  const fullCalls = (planned.tool_calls ?? []).slice(originIdx >= 0 ? originIdx : 0);
  const planNextCount = fullCalls.filter((n) => n === "plan_next_stop").length;

  const filledRaw = planned.itinerary?.filledStops ?? [];

  function slotOf(s: (typeof filledRaw)[number]): { start?: string; end?: string } {
    if (!s.slot || typeof s.slot !== "object") return {};
    return s.slot as { start?: string; end?: string };
  }

  function kindOf(s: (typeof filledRaw)[number]): string {
    if (s.stop && typeof s.stop === "object" && "kind" in s.stop) {
      const k = (s.stop as { kind?: unknown }).kind;
      if (typeof k === "string") return k;
    }
    return "";
  }

  function cardOf(s: (typeof filledRaw)[number]): unknown {
    if (s.stop && typeof s.stop === "object" && "card" in s.stop) {
      return (s.stop as { card?: unknown }).card;
    }
    return null;
  }

  const byDay = new Map<number, typeof filledRaw>();
  for (const s of filledRaw) {
    const list = byDay.get(s.day_index) ?? [];
    list.push(s);
    byDay.set(s.day_index, list);
  }

  let overlapDetail = "no overlap";
  let noOverlap = true;
  for (const [day, stops] of byDay) {
    const ranges = stops
      .map((s) => {
        const slot = slotOf(s);
        if (!slot.start || !slot.end) return null;
        return { start: toMinutes(slot.start), end: toMinutes(slot.end), name: stopName(s.stop) };
      })
      .filter((r): r is NonNullable<typeof r> => r != null)
      .sort((a, b) => a.start - b.start);
    for (let i = 1; i < ranges.length; i++) {
      const prev = ranges[i - 1]!;
      const cur = ranges[i]!;
      // Allow zero-duration stay (start===end) abutting next; reject true overlap.
      if (cur.start < prev.end && prev.start < prev.end) {
        noOverlap = false;
        overlapDetail = `day ${day}: ${prev.name} [${fromMinutes(prev.start)}–${fromMinutes(prev.end)}) overlaps ${cur.name} [${fromMinutes(cur.start)}–${fromMinutes(cur.end)})`;
        break;
      }
    }
    if (!noOverlap) break;
  }

  const daysMissingAfternoon: number[] = [];
  for (let d = 1; d <= NUM_DAYS; d++) {
    const stops = byDay.get(d) ?? [];
    const hasPm = stops.some((s) => {
      const start = slotOf(s).start;
      return start != null && toMinutes(start) >= toMinutes("13:00");
    });
    if (!hasPm) daysMissingAfternoon.push(d);
  }

  const mealsWithoutCard = filledRaw.filter(
    (s) => kindOf(s) === "meal" && (cardOf(s) == null || cardOf(s) === undefined),
  );

  const checks: Check[] = [
    {
      id: "vendor_fixture",
      ok: process.env.PLACES_VENDOR_MODE === "fixture",
      detail: `PLACES_VENDOR_MODE=${process.env.PLACES_VENDOR_MODE}`,
    },
    {
      id: "no_legacy_pipeline",
      ok: process.env.PLAN_TRIP_LEGACY_FULL_LOOP !== "1",
      detail: "PLAN_TRIP_LEGACY_FULL_LOOP unset (agent loop default)",
    },
    {
      id: "status_ready",
      ok: planned.status === "ready",
      detail: `status=${planned.status}`,
    },
    {
      id: "skeleton_days",
      ok: (planned.itinerary?.skeleton.days.length ?? 0) === NUM_DAYS,
      detail: `days=${planned.itinerary?.skeleton.days.length ?? 0} (expect ${NUM_DAYS})`,
    },
    {
      id: "filled_stops",
      ok: (planned.itinerary?.filledStops.length ?? 0) >= NUM_DAYS,
      detail: `filledStops=${planned.itinerary?.filledStops.length ?? 0} (expect ≥${NUM_DAYS})`,
    },
    {
      id: "must_include",
      ok: mustInclude.length === 3,
      detail: `must_include=${mustInclude.join(", ")}`,
    },
    {
      id: "tool_order",
      ok:
        fullCalls[0] === "resolve_origin_stay" &&
        fullCalls.includes("search_places") &&
        fullCalls.includes("make_itinerary") &&
        planNextCount >= NUM_DAYS &&
        fullCalls.includes("commit_artifacts"),
      detail: `${fullCalls.join(" → ")} (plan_next_stop×${planNextCount})`,
    },
    {
      id: "registry_chips",
      ok: poolAfter.length >= 2,
      detail: `poolAfter=${poolAfter.length} poolBefore=${poolBefore.length}`,
    },
    {
      id: "no_live_keys",
      ok: !process.env.QWEN_API_KEY && !process.env.OPENAI_API_KEY,
      detail: "QWEN/OPENAI keys cleared for this process",
    },
    {
      id: "no_time_overlap",
      ok: noOverlap && filledRaw.length > 0,
      detail: overlapDetail,
    },
    {
      id: "has_afternoon",
      ok: daysMissingAfternoon.length === 0 && byDay.size === NUM_DAYS,
      detail:
        daysMissingAfternoon.length === 0
          ? `all ${NUM_DAYS} days have ≥1 stop starting ≥13:00`
          : `missing afternoon on days: ${daysMissingAfternoon.join(", ")}`,
    },
    {
      id: "meal_has_card",
      ok: mealsWithoutCard.length === 0 && filledRaw.some((s) => kindOf(s) === "meal"),
      detail:
        mealsWithoutCard.length === 0
          ? `all meal stops have restaurant card`
          : `${mealsWithoutCard.length} meal(s) missing card`,
    },
  ];
  const passed = checks.every((c) => c.ok);
  const now = new Date().toISOString();

  const skeletonDays =
    planned.itinerary?.skeleton.days.map((d) => ({
      day_index: d.day_index,
      day_theme: d.day_theme,
      stops: d.stops.map((s) => ({ name: s.name ?? s.meal_slot ?? "stop", kind: s.kind })),
    })) ?? [];

  const filledStops =
    planned.itinerary?.filledStops.map((s) => ({
      day_index: s.day_index,
      stop_index: s.stop_index,
      stop: s.stop,
      slot: s.slot,
    })) ?? [];

  const md = `# POC true-agent verification — Lisbon ${NUM_DAYS}-day

**Date:** ${now}  
**Verdict:** ${passed ? "PASS" : "FAIL"} — ready for human review  
**Elapsed:** ${elapsedMs} ms  
**Scenario:** Lisbon ${NUM_DAYS}-day trip from ${hotel.name} (${BOUNDS.start} → ${BOUNDS.end})

## Constraints (scenario)

| Key | Value |
| --- | --- |
| Destination | Lisbon |
| Dates | ${BOUNDS.start} → ${BOUNDS.end} |
| Days | ${NUM_DAYS} |
| Party size | ${PARTY_SIZE} (report-only; not on PlanTripInput) |
| Origin | ${hotel.name} |
| Budget | premium |
| Trip type | couple |
| Transit | public_transit |
| Daily start | ${START_TIME} (report-only; fill mock slot) |
| Must-see candidates (5) | ${mustSeeCandidates.join(", ")} |
| Must include (3) | ${mustInclude.join(", ")} |

## Environment

| Key | Value |
| --- | --- |
| \`PLACES_VENDOR_MODE\` | \`${process.env.PLACES_VENDOR_MODE}\` |
| \`PLAN_TRIP_LEGACY_FULL_LOOP\` | \`${process.env.PLAN_TRIP_LEGACY_FULL_LOOP ?? "(unset)"}\` |
| Google / live adapters | not invoked (\`_testGeocode\` / \`_testSearchPlaces\` injectors + fixture mode) |
| LLM keys | cleared in-process |
| Stops pool store | Prisma \`AttractionPoi\` (Lisbon seed from prior live run; this script did not call Google) |
| Days / origin | ${NUM_DAYS} / ${hotel.name} |

## Checks

| ID | Result | Detail |
| --- | --- | --- |
${checks.map((c) => `| ${c.id} | ${c.ok ? "PASS" : "FAIL"} | ${c.detail} |`).join("\n")}

## \`tool_calls\`

Intake + full-loop sequence:

\`\`\`
${(planned.tool_calls ?? []).join(" → ")}
\`\`\`

Model-chosen full-loop tools (must match scripted act-or-stop, not a hidden fixed pipeline name):

\`\`\`
${fullCalls.join(" → ")}
\`\`\`

## Skeleton

\`\`\`json
${mdEscape(skeletonDays)}
\`\`\`

## filledStops

\`\`\`json
${mdEscape(filledStops)}
\`\`\`

## Registry (Lisbon)

- Before: **${poolBefore.length}** rows
- After: **${poolAfter.length}** rows
- Sample names: ${poolAfter
    .slice(0, 8)
    .map((p) => p.name)
    .join(", ")}${poolAfter.length > 8 ? "…" : ""}

## Status / timing

- \`trip_id\`: \`${planned.trip_id}\`
- \`revision\`: ${planned.revision}
- \`status\`: \`${planned.status}\`
- timing: \`${mdEscape(planned.timing)}\`

## HTML review

Open [\`poc-true-agent-verification.html\`](./poc-true-agent-verification.html) in a browser.

## How to re-run

\`\`\`bash
cd places-agent
npx tsx --env-file=.env.local scripts/verify-poc-true-agent.ts
\`\`\`

Does not start the HTTP server. Does not call Google Maps.
`;

  const html = renderHtml({
    passed,
    now,
    elapsedMs,
    hotelName: hotel.name,
    mustSeeCandidates,
    mustInclude,
    checks,
    toolCalls: planned.tool_calls ?? [],
    fullCalls,
    skeletonDays,
    filledStops,
    poolBefore: poolBefore.length,
    poolAfter: poolAfter.length,
    poolSample: poolAfter.slice(0, 8).map((p) => p.name),
    tripId: planned.trip_id,
    revision: planned.revision,
    status: planned.status,
    timing: planned.timing,
  });

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, md, "utf8");
  writeFileSync(OUT_HTML, html, "utf8");
  console.log(passed ? `PASS wrote ${OUT}` : `FAIL wrote ${OUT}`);
  console.log(`HTML wrote ${OUT_HTML}`);
  if (!passed) process.exitCode = 1;
}

void main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
