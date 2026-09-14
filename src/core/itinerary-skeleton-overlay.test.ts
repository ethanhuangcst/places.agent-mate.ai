
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function loadOverlay(): string {
  const path = join(__dirname, "../../prompts/overlays/itinerary-skeleton.md");
  return readFileSync(path, "utf8");
}

describe("itinerary-skeleton overlay (agent-itinerary-107)", () => {
  it("should_forbid_off_pool_names_without_disney_brand (TC-T3-107-02)", () => {
    const md = loadOverlay();
    expect(md).toMatch(/Never invent off-pool venue names/);
    expect(md).not.toMatch(/Never invent Disney/);
  });
});

describe("itinerary-skeleton overlay 2a-none (agent-discover-110b)", () => {
  it("should_omit_season_hard_drop_and_prefer_season_rule_section (TC-T3-110b-01)", () => {
    const md = loadOverlay();
    expect(md).not.toMatch(/hard-drop/i);
    expect(md).not.toMatch(/prefer-season|prefer\s+pool cards that fit that season/i);
    expect(md).not.toMatch(/do\s+\*\*not\*\*\s+hard-drop candidate-pool names solely for season/i);
    expect(md).not.toMatch(/season rule/i);
  });

  it("should_label_other_without_preference_suffix (TC-T3-110b-01)", () => {
    const md = loadOverlay();
    expect(md).not.toMatch(/Other \(preference\)/);
    expect(md).not.toMatch(/其他（偏好）/);
    expect(md).toMatch(/\bOther\b/);
  });

  it("should_keep_attraction_names_pool_only (TC-T3-110b-01)", () => {
    const md = loadOverlay();
    expect(md).toMatch(/Pool only|candidate list|Never invent off-pool/i);
  });
});
