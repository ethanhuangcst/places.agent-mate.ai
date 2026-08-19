import { describe, expect, it } from "vitest";
import { selectAllIds, selectionState, toggleId } from "./key-selection";

describe("key-selection", () => {
  it("should_add_id_when_row_is_checked", () => {
    expect(toggleId(["a"], "b", true)).toEqual(["a", "b"]);
  });

  it("should_remove_id_when_row_is_unchecked", () => {
    expect(toggleId(["a", "b"], "a", false)).toEqual(["b"]);
  });

  it("should_select_all_ids_when_select_all_is_checked", () => {
    expect(selectAllIds(["a", "b"], true)).toEqual(["a", "b"]);
  });

  it("should_clear_selection_when_select_all_is_unchecked", () => {
    expect(selectAllIds(["a", "b"], false)).toEqual([]);
  });

  it("should_report_all_when_every_id_is_selected", () => {
    expect(selectionState(["a", "b"], ["b", "a"])).toBe("all");
  });

  it("should_report_some_when_subset_is_selected", () => {
    expect(selectionState(["a", "b"], ["a"])).toBe("some");
  });

  it("should_report_none_when_selection_is_empty", () => {
    expect(selectionState(["a", "b"], [])).toBe("none");
  });
});
