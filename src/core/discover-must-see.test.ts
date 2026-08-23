import { describe, expect, it } from "vitest";
import {
  localDiningTokensForCity,
  mustSeeCatalogKeys,
  mustSeeQueriesForCity,
  mustSeeTokensForCity,
  nameMatchesMustSeeTokens,
} from "./discover-must-see";

/**
 * ADR-042 Update (2026-08-23): the per-city CATALOG has been emptied. Source
 * must contain no city POI knowledge; must-see inference is LLM-driven
 * (discover-must-see-llm). These tests lock the empty state so a city
 * encyclopedia cannot silently return.
 */
describe("discover-must-see (ADR-042 Update — empty catalog)", () => {
  it("should_have_no_city_keys_in_catalog", () => {
    expect(mustSeeCatalogKeys()).toEqual([]);
  });

  it("should_return_empty_queries_for_every_city", () => {
    for (const city of ["西安", "北京", "上海", "Lisbon", "NowhereVille"]) {
      expect(mustSeeQueriesForCity(city)).toEqual({ attractions: [], restaurants: [] });
      expect(mustSeeTokensForCity(city)).toEqual([]);
      expect(localDiningTokensForCity(city)).toEqual([]);
    }
  });

  it("should_match_must_see_tokens_in_names_when_tokens_provided", () => {
    // nameMatchesMustSeeTokens is a pure helper; tokens come from callers (now always empty).
    expect(nameMatchesMustSeeTokens("秦始皇兵马俑博物馆", ["兵马俑"])).toBe(true);
    expect(nameMatchesMustSeeTokens("西安博物院", ["兵马俑"])).toBe(false);
    expect(nameMatchesMustSeeTokens("any", [])).toBe(false);
  });
});
