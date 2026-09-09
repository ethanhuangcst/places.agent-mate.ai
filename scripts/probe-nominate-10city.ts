/**
 * Live nominate-must-see audit (prompt only, no city POI tables).
 *   npx tsx --env-file=.env.local scripts/probe-nominate-10city.ts
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import OpenAI from "openai";
import { buildNominateMustSeeUserMessage } from "../src/core/itinerary-planner";
import { configuredChatModel, createOpenAI } from "../src/core/itinerary-planner";
import { extractChatCompletionText } from "../src/core/itinerary-planner";

const LIMIT = 12;
const NUM_DAYS = 4;
const TOP_N = 5;

const CITIES: Array<{ cn: string; en: string }> = [
  { cn: "杭州", en: "Hangzhou" },
  { cn: "厦门", en: "Xiamen" },
  { cn: "香港", en: "Hong Kong" },
  { cn: "台北", en: "Taipei" },
  { cn: "里斯本", en: "Lisbon" },
  { cn: "上海", en: "Shanghai" },
  { cn: "西安", en: "Xi'an" },
  { cn: "伦敦", en: "London" },
  { cn: "新加坡", en: "Singapore" },
  { cn: "清迈", en: "Chiang Mai" },
];

function parseNames(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const text = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonStr = text ? text[1]!.trim() : raw.trim();
    const start = jsonStr.indexOf("[");
    const end = jsonStr.lastIndexOf("]");
    const arrStr = start >= 0 && end > start ? jsonStr.slice(start, end + 1) : jsonStr;
    const parsed = JSON.parse(arrStr) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
  } catch {
    return [];
  }
}

async function nominate(
  openai: OpenAI,
  city: string,
  locale: "CN" | "EN",
  tripType: string,
): Promise<{ names: string[]; prompt: string; raw: string }> {
  const prompt = buildNominateMustSeeUserMessage(city, LIMIT, NUM_DAYS, {
    trip_type: tripType,
    pace: "medium",
    locale,
  });
  const completion = await openai.chat.completions.create({
    model: configuredChatModel(),
    messages: [{ role: "user", content: prompt }],
    max_completion_tokens: 800,
    temperature: 0.3,
  });
  const raw = extractChatCompletionText(completion) ?? "";
  return { names: parseNames(raw), prompt, raw };
}

function formatBlock(city: string, locale: string, names: string[]): string {
  const lines = names.map((n, i) => {
    const rank = i + 1;
    const tag = rank <= TOP_N ? " **[top5]**" : "";
    return `${rank}. ${n}${tag}`;
  });
  return `### ${city} · ${locale}\n\n${lines.length ? lines.join("\n") : "_empty_"}\n`;
}

async function main() {
  const openai = createOpenAI();
  if (!openai) {
    throw new Error("No live LLM config (QWEN_API_KEY or OPENAI_API_KEY)");
  }
  const model = configuredChatModel();
  const rows: string[] = [
    `# Must-see nominate audit — 10 cities × CN/EN`,
    ``,
    `Generated: ${new Date().toISOString()}`,
    `Model: \`${model}\``,
    `Prompt: current \`buildNominateMustSeeUserMessage\` (trip prefs + day-trip + one cluster).`,
    `Fixed params: numDays=${NUM_DAYS}, pace=medium, trip_type=城市漫游 / city wander (locale-matched).`,
    `Limit: ${LIMIT} names; first ${TOP_N} marked **[top5]**. LLM names only (not grounded search).`,
    `Not a product encyclopedia (ADR-042).`,
    ``,
  ];

  for (const c of CITIES) {
    const cn = await nominate(openai, c.cn, "CN", "城市漫游");
    const en = await nominate(openai, c.en, "EN", "city wander");
    rows.push(`## ${c.cn} / ${c.en}`, ``);
    rows.push(formatBlock(c.cn, "CN", cn.names));
    rows.push(formatBlock(c.en, "EN", en.names));
    console.error(`ok ${c.cn}/${c.en} cn=${cn.names.length} en=${en.names.length}`);
  }

  const out = join(
    process.cwd(),
    "..",
    "specs",
    "knowledge",
    "agent",
    "nominate-must-see-10city-audit.md",
  );
  writeFileSync(out, rows.join("\n"), "utf8");
  console.log(`wrote ${out}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
