/**
 * Probe: Hangzhou+AMAP and Lisbon+GMAP — nominate → suggest/search ground → chips.
 *   npx tsx --env-file=.env.local scripts/probe-hangzhou-4d-amap-trueagent.ts
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildNominateMustSeeUserMessage,
  configuredChatModel,
  createOpenAI,
  extractChatCompletionText,
  groundNominatedName,
  parseNominatePlaceNames,
} from "../src/core/itinerary-planner";
import { geocode } from "../src/core/tools";
import {
  attractionClusterKey,
  capClusterOccupancy,
} from "../src/core/discover-dedupe";
import { isVagueAreaName } from "../src/core/eligible-attraction";
import { mustSeeChipLabel } from "../src/core/plan-trip";
import type { PlaceCard } from "../src/core/types";

const NUM_DAYS = 4;
const BOUNDS = { start: "2026-07-01", end: "2026-07-04" };
const MIN_CHIPS = 5;
const MIN_GROUND_RATE = 0.6;
const SUBURB_KM = 20;

type Case = {
  label: string;
  city: string;
  locale: "CN" | "EN";
  providers: string[];
};

const CASES: Case[] = [
  { label: "杭州 · AMAP", city: "杭州", locale: "CN", providers: ["AMAP"] },
  {
    label: "Lisbon · GMAP",
    city: "Lisbon",
    locale: "EN",
    providers: ["GOOGLE_MAPS"],
  },
];

function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

function maxClusterCount(chips: PlaceCard[]): number {
  const counts = new Map<string, number>();
  let max = 0;
  for (const c of chips) {
    const key = attractionClusterKey(
      c.nominated_name?.trim() || c.name || "",
    );
    const n = (counts.get(key) ?? 0) + 1;
    counts.set(key, n);
    if (n > max) max = n;
  }
  return max;
}

/** Honest suburb gate: at least one chip > SUBURB_KM from city anchor (coords required). */
function hasSuburbChip(
  chips: PlaceCard[],
  anchor: { lat: number; lng: number },
): boolean {
  for (const c of chips) {
    if (
      Number.isFinite(c.location?.lat) &&
      Number.isFinite(c.location?.lng) &&
      haversineKm(anchor, { lat: c.location.lat, lng: c.location.lng }) >
        SUBURB_KM
    ) {
      return true;
    }
  }
  return false;
}

async function runCase(c: Case, model: string) {
  const prefs = {
    locale: c.locale,
    party_size: 2,
    trip_type: "couple_romance",
    budget: "comfort",
    pace: "medium",
    transit_preference: "drive_walk",
    bounds: BOUNDS,
  };
  const prompt = buildNominateMustSeeUserMessage(c.city, 0, NUM_DAYS, prefs);
  const hasDates = /2026-07-01/.test(prompt) && /2026-07-04/.test(prompt);
  const hasSeason =
    c.locale === "CN" ? /夏季/.test(prompt) : /summer/i.test(prompt);

  const openai = createOpenAI();
  if (!openai) throw new Error("No live LLM");
  const completion = await openai.chat.completions.create({
    model,
    messages: [{ role: "user", content: prompt }],
    max_completion_tokens: 800,
    temperature: 0.3,
  });
  const raw = extractChatCompletionText(completion) ?? "";
  const names = parseNominatePlaceNames(raw);

  const geo = await geocode({
    query: c.city,
    providers: c.providers,
    locale: c.locale,
  });
  const anchor = geo.data;
  if (!anchor) throw new Error(`geocode failed: ${c.city}`);

  const grounding: Array<{
    name: string;
    hit: boolean;
    cardName: string;
    chipLabel: string;
    card?: PlaceCard;
  }> = [];
  for (const name of names) {
    const card = await groundNominatedName({
      name,
      city: c.city,
      locale: c.locale,
      providers: c.providers,
      near: { lat: anchor.lat, lng: anchor.lng },
    });
    grounding.push({
      name,
      hit: Boolean(card),
      cardName: card?.name ?? "—",
      chipLabel: card ? mustSeeChipLabel(card) : "—",
      card,
    });
    await new Promise((r) => setTimeout(r, 150));
  }

  // Match product behavior: isVagueAreaName rejects whole-area tokens
  // (District/Area/湖/街/城/新城…) of any length/locale before grounding.
  const attemptable = names.filter((n) => !isVagueAreaName(n));
  const groundedOrdered = grounding
    .filter((g) => g.card)
    .map((g) => g.card!);
  const chips = capClusterOccupancy(groundedOrdered, 3).slice(0, 8);
  const groundRate = attemptable.length
    ? grounding.filter((g) => g.hit && attemptable.includes(g.name)).length /
      attemptable.length
    : 0;
  const duanQiao = names.some((n) => /断桥残雪|残雪/.test(n));
  const junkChip = chips.some((ch) =>
    /眼镜|民宿|美宿|家禽|别墅|度假|营业厅|女装|娱乐厅|KTV|旗舰|宾利|汽车|地铁站/.test(
      ch.name ?? "",
    ),
  );
  const clusterMax = maxClusterCount(chips);
  const suburbOk =
    NUM_DAYS < 3 || hasSuburbChip(chips, anchor);
  const pass =
    hasDates &&
    hasSeason &&
    chips.length >= MIN_CHIPS &&
    groundRate >= MIN_GROUND_RATE &&
    !duanQiao &&
    !junkChip &&
    suburbOk;

  return {
    c,
    prompt,
    raw,
    names,
    grounding,
    chips,
    hasDates,
    hasSeason,
    groundRate,
    duanQiao,
    junkChip,
    clusterMax,
    suburbOk,
    pass,
  };
}

async function main() {
  const openai = createOpenAI();
  if (!openai) throw new Error("No live LLM config");
  const model = configuredChatModel();
  const results = [];
  for (const c of CASES) {
    const r = await runCase(c, model);
    results.push(r);
    console.error(
      `${c.label}: names=${r.names.length} chips=${r.chips.length} rate=${r.groundRate.toFixed(2)} clusterMax=${r.clusterMax} suburb=${r.suburbOk} pass=${r.pass}`,
    );
  }

  const sections = results.map((r) =>
    [
      `## ${r.c.label}`,
      "",
      `- Dates in prompt: **${r.hasDates ? "yes" : "NO"}**`,
      `- Season word: **${r.hasSeason ? "yes" : "NO"}**`,
      `- Names: ${r.names.length} · grounded rate: **${(r.groundRate * 100).toFixed(0)}%** (need ≥${MIN_GROUND_RATE * 100}%)`,
      `- Chips: **${r.chips.length}** (need ≥${MIN_CHIPS})`,
      `- 残雪 in names: **${r.duanQiao ? "yes — fail" : "no"}**`,
      `- Junk chips: **${r.junkChip ? "yes — fail" : "no"}**`,
      `- Max same cluster (display): **${r.clusterMax}**`,
      `- Suburb chip >${SUBURB_KM}km from anchor (numDays≥3): **${r.suburbOk ? "yes" : "NO"}**`,
      `- Gate: **${r.pass ? "PASS" : "FAIL"}**`,
      "",
      "### Prompt",
      "",
      "```",
      r.prompt,
      "```",
      "",
      "### Parsed names",
      "",
      r.names.length
        ? r.names.map((n, i) => `${i + 1}. ${n}`).join("\n")
        : "_empty_",
      "",
      "### Grounding (suggest→search)",
      "",
      "| # | nominate | hit | vendor name | chip label |",
      "| --- | --- | --- | --- | --- |",
      ...r.grounding.map(
        (g, i) =>
          `| ${i + 1} | ${g.name} | ${g.hit ? "yes" : "**no**"} | ${g.cardName} | ${g.chipLabel} |`,
      ),
      "",
      "### Chips (label = nominated short name)",
      "",
      r.chips.length
        ? r.chips
            .map(
              (c, i) =>
                `${i + 1}. ${mustSeeChipLabel(c)} _(vendor: ${c.name})_`,
            )
            .join("\n")
        : "_empty_",
      "",
      "<details><summary>raw</summary>",
      "",
      "```",
      r.raw.trim(),
      "```",
      "",
      "</details>",
      "",
    ].join("\n"),
  );

  const allPass = results.every((r) => r.pass);
  const md = [
    "# Nominate probe — Hangzhou AMAP + Lisbon GMAP",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Model: \`${model}\``,
    `Bounds: ${BOUNDS.start}..${BOUNDS.end} · ${NUM_DAYS} days · couple_romance`,
    `Ground: suggest → hydrate → search → broad-fallback (strip suffix, >15km). Cap cluster 3. native_id dedupe.`,
    `Quality: chips≥${MIN_CHIPS}, ground≥${MIN_GROUND_RATE}, no 残雪 in LLM names, no junk chips, ≥1 chip >${SUBURB_KM}km from city anchor when numDays≥3 (distance gate; clusterMax display-only).`,
    `Overall: **${allPass ? "PASS" : "FAIL"}**`,
    "",
    ...sections,
  ].join("\n");

  const out = join(
    process.cwd(),
    "..",
    "specs",
    "knowledge",
    "agent",
    "hangzhou-4d-amap-trueagent-probe.md",
  );
  writeFileSync(out, md, "utf8");
  console.log(`overall=${allPass ? "PASS" : "FAIL"} wrote ${out}`);
  if (!allPass) process.exit(2);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
