import { describe, expect, it } from "vitest";
import { NAME_MATCH_MIN, nameMatchScore, normalizePlaceName, pinKey } from "./match";

describe("Tripadvisor name match", () => {
  it("should_score_exact_normalized_names_as_one", () => {
    expect(nameMatchScore("Yat Lok Roast Goose", "yat lok roast goose")).toBe(1);
  });

  it("should_score_substring_names_above_threshold", () => {
    expect(nameMatchScore("Yat Lok Roast Goose", "Yat Lok")).toBeGreaterThanOrEqual(NAME_MATCH_MIN);
    expect(nameMatchScore("Yat Lok Roast Goose", "Yat Lok")).toBe(0.85);
  });

  it("should_score_cjk_bigrams_for_names_without_spaces", () => {
    expect(nameMatchScore("大茗烧烤", "大茗烧烤")).toBe(1);
    expect(nameMatchScore("喜炉家自助烤肉(紫藤路店)", "喜炉家自助烤肉")).toBeGreaterThanOrEqual(
      NAME_MATCH_MIN,
    );
  });

  it("should_reject_unrelated_names", () => {
    expect(nameMatchScore("Yat Lok Roast Goose", "L'Atelier de Joël Robuchon")).toBeLessThan(
      NAME_MATCH_MIN,
    );
  });

  it("should_cluster_pins_to_three_decimals", () => {
    expect(pinKey(22.2819, 114.158)).toBe(pinKey(22.28194, 114.1582));
    expect(normalizePlaceName("Yat-Lok!")).toBe("yat lok");
  });
});
