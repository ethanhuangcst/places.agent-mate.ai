import { describe, it, expect } from "vitest";
import { dedupeMustInclude, mergeMustInclude } from "./must-include-merge";

describe("dedupeMustInclude", () => {
  it("should_keep_user_precedence_and_dedupe_normalized", () => {
    const result = dedupeMustInclude(
      ["Belém Tower", "Praça do Comércio"],
      ["Belém tower", "Praça Do Comércio", "Alfama"],
    );
    // "Belém Tower" dedupes with "Belém tower" (case-insensitive); user wins.
    // "Praça do Comércio" dedupes with "Praça Do Comércio"; user wins.
    expect(result).toEqual(["Belém Tower", "Praça do Comércio", "Alfama"]);
  });

  it("should_drop_empty_and_whitespace_only_tokens", () => {
    const result = dedupeMustInclude(["  ", "Alpha"], ["", "Beta"]);
    expect(result).toEqual(["Alpha", "Beta"]);
  });

  it("should_dedupe_cjk_punctuation_variants", () => {
    // normalizeMustIncludeToken strips ，and 、 so the two inferred variants
    // collapse to the same token; the user token "大雁塔" is distinct.
    const result = dedupeMustInclude(["大雁塔"], ["大雁塔，西安", "大雁塔、西安"]);
    expect(result).toEqual(["大雁塔", "大雁塔，西安"]);
  });
});

describe("mergeMustInclude", () => {
  it("should_truncate_to_limit_with_user_priority", () => {
    const result = mergeMustInclude(
      ["A", "B"],
      ["C", "D", "E"],
      3,
    );
    expect(result).toEqual(["A", "B", "C"]);
  });

  it("should_return_all_when_under_limit", () => {
    const result = mergeMustInclude(["A"], ["B"], 5);
    expect(result).toEqual(["A", "B"]);
  });

  it("should_dedupe_before_truncation", () => {
    const result = mergeMustInclude(["A", "a"], ["A", "B"], 3);
    expect(result).toEqual(["A", "B"]);
  });
});
