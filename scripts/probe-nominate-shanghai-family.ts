import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildNominateMustSeeUserMessage,
  configuredChatModel,
  createOpenAI,
  extractChatCompletionText,
  parseNominatePlaceNames,
  type NominateTripPrefs,
} from "../src/core/itinerary-planner";

async function run(city: string, prefs: NominateTripPrefs) {
  const openai = createOpenAI();
  if (!openai) throw new Error("No live LLM config");
  const prompt = buildNominateMustSeeUserMessage(city, 0, 3, prefs);
  const completion = await openai.chat.completions.create({
    model: configuredChatModel(),
    messages: [{ role: "user", content: prompt }],
    max_completion_tokens: 800,
    temperature: 0.3,
  });
  const raw = extractChatCompletionText(completion) ?? "";
  return { prompt, raw, names: parseNominatePlaceNames(raw) };
}

function block(title: string, r: { prompt: string; raw: string; names: string[] }): string {
  const lines = r.names.map((n, i) => `${i + 1}. ${n}${i < 5 ? " **[top5]**" : ""}`);
  return [
    `### ${title}`,
    "",
    "Prompt:",
    "",
    "```",
    r.prompt,
    "```",
    "",
    lines.length ? lines.join("\n") : "_empty_",
    "",
    "<details><summary>raw</summary>",
    "",
    "```",
    r.raw.trim(),
    "```",
    "",
    "</details>",
    "",
  ].join("\n");
}

async function main() {
  const cn = await run("上海", {
    locale: "CN",
    party_size: 3,
    trip_type: "亲子玩乐",
    budget: "舒适",
    pace: "medium",
    transit_preference: "打车优先",
  });
  const en = await run("Shanghai", {
    locale: "EN",
    party_size: 3,
    trip_type: "family / kids play",
    budget: "comfort",
    pace: "medium",
    transit_preference: "taxi preferred",
  });
  const md = [
    "# Shanghai nominate — 亲子玩乐 / comfort",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Model: \`${configuredChatModel()}\``,
    "Params: 3 days · 3 people · 亲子玩乐 · 舒适 · 适中节奏 · 打车优先",
    "Simple prompt. First 5 marked **[top5]**. LLM only, not grounded.",
    "",
    block("上海 · CN", cn),
    block("Shanghai · EN", en),
  ].join("\n");
  const out = join(
    process.cwd(),
    "..",
    "specs",
    "knowledge",
    "agent",
    "nominate-must-see-shanghai-family.md",
  );
  writeFileSync(out, md, "utf8");
  console.log(`cn=${cn.names.length} en=${en.names.length} wrote ${out}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
