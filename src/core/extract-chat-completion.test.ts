import { describe, it, expect } from "vitest";
import { extractChatCompletionText } from "./itinerary-planner";

describe("extractChatCompletionText", () => {
  it("should_read_content_from_standard_choices", () => {
    expect(
      extractChatCompletionText({
        choices: [{ message: { content: '{"ok":true}' } }],
      }),
    ).toBe('{"ok":true}');
  });

  it("should_return_null_when_choices_empty", () => {
    expect(extractChatCompletionText({ choices: [] })).toBeNull();
    expect(
      extractChatCompletionText({ choices: [{ message: { content: "" } }] }),
    ).toBeNull();
  });

  it("should_throw_clear_error_when_gateway_returns_html_string", () => {
    expect(() =>
      extractChatCompletionText("<!doctype html><html><body>login</body></html>"),
    ).toThrow(/HTML|OPENAI_BASE_URL/i);
  });

  it("should_throw_clear_error_when_choices_missing", () => {
    expect(() => extractChatCompletionText({ id: "x" })).toThrow(/choices/i);
  });

  it("should_not_throw_typeerror_on_undefined_choices_access", () => {
    expect(() => extractChatCompletionText({})).not.toThrow(
      /Cannot read properties of undefined/,
    );
  });
});
