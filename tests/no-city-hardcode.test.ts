/**
 * ADR-042 Update §3 — CI guard: production source must not encode city POI names.
 * Scans src/core and src/mcp, excluding *.test.ts.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");
const SCAN_DIRS = [join(ROOT, "src", "core"), join(ROOT, "src", "mcp")];

/** City POI / district encyclopedia tokens — not venue-type vocabulary. */
const FORBIDDEN = [
  "田子坊",
  "城隍庙",
  "南京路",
  "淮海路",
  "新天地",
  "银座",
  "涩谷",
  "秋叶原",
  "上野",
  "浅草",
  "兵马俑",
  "大雁塔",
  "西湖十景",
  "断桥残雪",
  "苏堤春晓",
  "曲院风荷",
  "平湖秋月",
  "Castelo de São Jorge",
  "Saint George Castle",
];

function walkTs(dir: string, out: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      walkTs(full, out);
      continue;
    }
    if (!name.endsWith(".ts") && !name.endsWith(".tsx")) continue;
    if (name.endsWith(".test.ts") || name.endsWith(".test.tsx")) continue;
    out.push(full);
  }
}

describe("ADR-042 no-city-hardcode guard", () => {
  it("should_not_embed_city_poi_names_in_core_or_mcp_source", () => {
    const files: string[] = [];
    for (const d of SCAN_DIRS) walkTs(d, files);
    const hits: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      for (const token of FORBIDDEN) {
        if (text.includes(token)) {
          hits.push(`${relative(ROOT, file)}: ${token}`);
        }
      }
    }
    expect(hits).toEqual([]);
  });
});
