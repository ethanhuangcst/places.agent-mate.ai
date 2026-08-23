import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * ADR-042 Update (2026-08-23) — no city POI knowledge in source.
 *
 * Guard test: scans production source files (excluding tests) for a denylist
 * of city-specific landmark / district names. If any token reappears, this test
 * fails and points at the offending file + line. Must-see identification is
 * LLM-driven (discover-must-see-llm); source must stay destination-agnostic.
 *
 * Test fixtures (test files) are allowed to use city names — they document
 * behavior, not product knowledge.
 */

const ROOT = join(__dirname, "..", "src");

const SOURCE_DIRS = ["core", "mcp", "http", "adapters", "agent", "i18n"];

const CITY_POI_DENYLIST = [
  // Xi'an
  "兵马俑", "兵馬俑", "秦始皇", "秦始皇帝陵", "大雁塔", "大慈恩寺",
  "华清", "華清", "骊山", "驪山", "回民街", "钟鼓楼", "钟楼", "鐘樓",
  "鼓楼", "鼓樓", "陕西历史",
  // Beijing
  "故宫", "天安门", "颐和园", "天坛", "南锣鼓巷",
  // Shanghai
  "外滩", "东方明珠", "豫园", "迪士尼",
  // Guangzhou
  "广州塔", "琶醍", "陈家祠",
  // Chengdu
  "宽窄巷子", "锦里", "武侯祠", "杜甫草堂",
  // Hangzhou
  "灵隐", "西溪湿地", "河坊街",
  // Xi'an far districts (FAR_DISTRICT_HINT)
  "凤城", "浐灞", "未央大道", "高新一路", "丈八",
];

function isTestFile(path: string): boolean {
  return /\.test\.ts$/i.test(path);
}

/** Fixtures are test scaffolding for fixture-LLM mode, not product knowledge. */
function isFixtureFile(path: string): boolean {
  return /fixture/i.test(path);
}

function listSourceFiles(dir: string, acc: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return acc;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      listSourceFiles(full, acc);
    } else if (/\.ts$/i.test(entry) && !isTestFile(full) && !isFixtureFile(full)) {
      acc.push(full);
    }
  }
  return acc;
}

describe("ADR-042 Update — no city POI knowledge in source (guard)", () => {
  it("should_have_no_city_specific_poi_tokens_in_production_source", () => {
    const files: string[] = [];
    for (const sub of SOURCE_DIRS) {
      listSourceFiles(join(ROOT, sub), files);
    }
    expect(files.length).toBeGreaterThan(0);

    const offenders: string[] = [];
    for (const file of files) {
      const content = readFileSync(file, "utf8");
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        for (const token of CITY_POI_DENYLIST) {
          if (line.includes(token)) {
            offenders.push(`${file}:${i + 1} contains "${token}"`);
          }
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
