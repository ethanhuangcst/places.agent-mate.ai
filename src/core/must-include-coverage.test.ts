import { describe, expect, it, beforeEach } from "vitest";
import {
  MUST_INCLUDE_RADIUS_KM,
  applyMustIncludeDayEvidence,
  blockCoversMustIncludeToken,
  getMustIncludeCoverageSnapshot,
  haversineKm,
  mergeMustIncludeIntoCandidates,
  mustIncludeCoverageKey,
  peekMissingMustInclude,
  resetMustIncludeCoverageSessions,
  selectMustIncludeFocusToken,
} from "./must-include-coverage";
import { mustIncludeTokenCovered } from "./trip-intake";
import type { PlaceCard } from "./types";

const SINTRA = { lat: 38.8029, lng: -9.3817 };
const QUELUZ = { lat: 38.7506, lng: -9.2593 };
const BELEM = { lat: 38.6916, lng: -9.216 };
const CASCAIS = { lat: 38.697, lng: -9.4217 };
const PENA: PlaceCard = {
  provider: "GOOGLE_MAPS",
  name: "Pena Palace",
  location: { lat: 38.7877, lng: -9.3906, crs: "WGS84" },
  sources: [
    {
      provider: "GOOGLE_MAPS",
      native_id: "ChIJ_pena",
      deeplinks: { google_web: "https://maps.google.com/?q=Pena" },
    },
  ],
};

describe("must-include-coverage (ADR-043 D7)", () => {
  beforeEach(() => {
    resetMustIncludeCoverageSessions();
  });

  it("should_select_theme_aligned_missing_token_first", () => {
    expect(
      selectMustIncludeFocusToken({
        must_include: ["辛特拉", "卡斯凯什"],
        missing: ["辛特拉", "卡斯凯什"],
        day_theme: "卡斯凯什海岸线与贝伦",
      }),
    ).toBe("卡斯凯什");
  });

  it("should_return_null_when_theme_does_not_match", () => {
    // ADR-043 D9 精简 follow-up: theme-gated focus. A non-matching theme means
    // the host themed this day for something else — do not pre-empt a missing
    // must_include token onto it.
    expect(
      selectMustIncludeFocusToken({
        must_include: ["辛特拉", "卡斯凯什"],
        missing: ["辛特拉", "卡斯凯什"],
        day_theme: "老城漫步",
      }),
    ).toBeNull();
  });

  it("should_return_null_when_no_day_theme", () => {
    // No theme → no forced focus; the token stays for a future themed day.
    expect(
      selectMustIncludeFocusToken({
        must_include: ["辛特拉", "卡斯凯什"],
        missing: ["辛特拉", "卡斯凯什"],
      }),
    ).toBeNull();
  });

  it("should_restrict_focus_to_call_must_include_subset_over_session_missing", () => {
    // Host passes only the user's explicit subset with a matching theme; focus
    // must be the user's explicit token, not a sticky inferred one.
    expect(
      selectMustIncludeFocusToken({
        must_include: ["辛特拉"],
        missing: ["贝伦塔", "热罗尼莫斯修道院", "辛特拉"],
        day_theme: "辛特拉一日",
      }),
    ).toBe("辛特拉");
  });

  it("should_not_cover_from_day_theme_alone", () => {
    const key = mustIncludeCoverageKey({
      city: "里斯本",
      originName: "H",
      locale: "CN",
    });
    const snap = applyMustIncludeDayEvidence({
      key,
      must_include: ["辛特拉", "卡斯凯什"],
      blocks: [],
      focusToken: "辛特拉",
      focusPool: [PENA],
      focusAnchor: { ...SINTRA, aliases: ["Sintra"] },
    });
    expect(snap.missing).toEqual(["辛特拉", "卡斯凯什"]);
    expect(snap.covered).toEqual([]);
  });

  it("should_not_cover_sintra_when_blocks_are_queluz_only", () => {
    const key = mustIncludeCoverageKey({ city: "Lisbon", locale: "CN" });
    const queluzKm = haversineKm(SINTRA, QUELUZ);
    expect(queluzKm).toBeGreaterThan(MUST_INCLUDE_RADIUS_KM);

    const snap = applyMustIncludeDayEvidence({
      key,
      must_include: ["辛特拉"],
      blocks: [
        {
          name: "克卢什国家宫",
          type: "attraction",
          location: QUELUZ,
        },
      ],
      focusToken: "辛特拉",
      focusPool: [PENA],
      focusAnchor: { ...SINTRA, aliases: ["Sintra", "辛特拉"] },
    });
    expect(snap.missing).toContain("辛特拉");
  });

  it("should_not_cover_cascais_when_blocks_are_belem_only", () => {
    const key = mustIncludeCoverageKey({ city: "Lisbon", locale: "CN" });
    expect(haversineKm(CASCAIS, BELEM)).toBeGreaterThan(MUST_INCLUDE_RADIUS_KM);

    const snap = applyMustIncludeDayEvidence({
      key,
      must_include: ["卡斯凯什"],
      blocks: [
        {
          name: "贝伦塔",
          type: "attraction",
          location: BELEM,
        },
      ],
      focusToken: "卡斯凯什",
      focusPool: [
        {
          provider: "GOOGLE_MAPS",
          name: "Boca do Inferno",
          location: { lat: CASCAIS.lat, lng: CASCAIS.lng, crs: "WGS84" },
          sources: [
            {
              provider: "GOOGLE_MAPS",
              native_id: "ChIJ_cascais",
              deeplinks: {},
            },
          ],
        },
      ],
      focusAnchor: { ...CASCAIS, aliases: ["Cascais", "卡斯凯什"] },
    });
    expect(snap.missing).toContain("卡斯凯什");
  });

  it("should_cover_when_block_native_id_in_focus_pool", () => {
    const key = mustIncludeCoverageKey({ city: "Lisbon", locale: "CN" });
    const snap = applyMustIncludeDayEvidence({
      key,
      must_include: ["辛特拉"],
      blocks: [{ name: "Pena Palace", type: "attraction" }],
      focusToken: "辛特拉",
      focusPool: [PENA],
      focusAnchor: { ...SINTRA, aliases: ["Sintra"] },
      candidates: [PENA],
    });
    expect(snap.covered).toContain("辛特拉");
    expect(snap.missing).toEqual([]);
  });

  it("should_cover_when_block_near_anchor_and_name_matches_alias", () => {
    expect(
      blockCoversMustIncludeToken({
        token: "辛特拉",
        blockName: "Sintra National Palace",
        blockType: "attraction",
        blockLocation: { lat: 38.797, lng: -9.3905 },
        focusPool: [],
        anchor: { ...SINTRA, aliases: ["Sintra", "辛特拉"] },
      }),
    ).toBe(true);
  });

  it("should_not_treat_empty_haystack_as_cover", () => {
    expect(mustIncludeTokenCovered("辛特拉", ["", "  "])).toBe(false);
    expect(mustIncludeTokenCovered("辛特拉", ["佩纳宫", ""])).toBe(false);
  });

  it("should_merge_must_include_pool_without_dropping_city_candidates", () => {
    const city: PlaceCard = {
      provider: "GOOGLE_MAPS",
      name: "圣若热城堡",
      location: { lat: 38.71, lng: -9.13, crs: "WGS84" },
      sources: [],
    };
    const merged = mergeMustIncludeIntoCandidates(
      { places: [city], restaurants: [] },
      [PENA],
    );
    expect(merged.places.map((p) => p.name)).toEqual([
      "圣若热城堡",
      "Pena Palace",
    ]);
  });
});

describe("must-include-coverage D9 (sticky)", () => {
  beforeEach(() => {
    resetMustIncludeCoverageSessions();
  });

  it("should_keep_covered_sticky_across_days_and_not_refocus_covered", () => {
    const key = mustIncludeCoverageKey({ city: "里斯本", locale: "CN" });
    peekMissingMustInclude(key, ["辛特拉", "卡斯凯什"]);
    // Day 1 covers 辛特拉 via injected Pena block.
    const d1 = applyMustIncludeDayEvidence({
      key,
      must_include: ["辛特拉", "卡斯凯什"],
      blocks: [{ name: "Pena Palace", type: "attraction" }],
      focusToken: "辛特拉",
      focusPool: [PENA],
      focusAnchor: { ...SINTRA, aliases: ["Sintra", "辛特拉"] },
      candidates: [PENA],
    });
    expect(d1.covered).toContain("辛特拉");
    expect(d1.missing).toContain("卡斯凯什");

    // Day 2 — 辛特拉 must remain covered (sticky); with a Cascais theme, focus must be 卡斯凯什, not 辛特拉.
    const snap = getMustIncludeCoverageSnapshot(key);
    expect(snap.covered).toContain("辛特拉");
    expect(snap.missing).toEqual(["卡斯凯什"]);
    expect(
      selectMustIncludeFocusToken({
        must_include: ["辛特拉", "卡斯凯什"],
        missing: snap.missing,
        day_theme: "卡斯凯什海岸线",
      }),
    ).toBe("卡斯凯什");

    // Day 2 covers 卡斯凯什 → both covered, no remaining focus for later days.
    const boca: PlaceCard = {
      provider: "GOOGLE_MAPS",
      name: "Boca do Inferno",
      location: { lat: CASCAIS.lat, lng: CASCAIS.lng, crs: "WGS84" },
      sources: [{ provider: "GOOGLE_MAPS", native_id: "ChIJ_cascais", deeplinks: {} }],
    };
    applyMustIncludeDayEvidence({
      key,
      must_include: ["辛特拉", "卡斯凯什"],
      blocks: [{ name: "Boca do Inferno", type: "attraction" }],
      focusToken: "卡斯凯什",
      focusPool: [boca],
      focusAnchor: { ...CASCAIS, aliases: ["Cascais", "卡斯凯什"] },
      candidates: [boca],
    });
    const snap2 = getMustIncludeCoverageSnapshot(key);
    expect(snap2.covered.sort()).toEqual(["卡斯凯什", "辛特拉"].sort());
    expect(snap2.missing).toEqual([]);
    // Day 3/4 — nothing left to focus.
    expect(
      selectMustIncludeFocusToken({
        must_include: ["辛特拉", "卡斯凯什"],
        missing: snap2.missing,
      }),
    ).toBeNull();
  });
});
