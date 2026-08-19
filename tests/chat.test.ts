import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { runChatLoop, configuredChatModel } from "../src/agent/loop";
import { t } from "../src/core/i18n";

describe("runChatLoop", () => {
  const prev = process.env.PLACES_VENDOR_MODE;

  beforeEach(() => {
    process.env.PLACES_VENDOR_MODE = "fixture";
    delete process.env.OPENAI_API_KEY;
  });

  afterEach(() => {
    if (prev === undefined) delete process.env.PLACES_VENDOR_MODE;
    else process.env.PLACES_VENDOR_MODE = prev;
  });

  it("should_invoke_search_restaurants_for_ramen_question", async () => {
    const result = await runChatLoop({
      locale: "EN",
      messages: [{ role: "user", content: "ramen near Tsim Sha Tsui" }],
    });
    expect(result.tool_calls).toContain("search_restaurants");
    expect(result.message.content.length).toBeGreaterThan(0);
    expect(result.outcomeKey).toBeUndefined();
  });

  it("should_return_keyed_error_for_unsupported_upload", async () => {
    const result = await runChatLoop({
      locale: "CN",
      messages: [{ role: "user", content: "what is this place" }],
      attachments: [
        {
          filename: "x.exe",
          mime_type: "application/x-msdownload",
          content_base64: Buffer.from("test").toString("base64"),
        },
      ],
    });
    expect(result.outcomeKey).toBe("errors.upload_unsupported");
    expect(result.message.key).toBe("errors.upload_unsupported");
    expect(result.message.content).toBe(t("CN", "errors.upload_unsupported"));
  });

  it("should_return_keyed_error_for_oversized_upload", async () => {
    const big = Buffer.alloc(6 * 1024 * 1024, 1);
    const result = await runChatLoop({
      locale: "EN",
      messages: [{ role: "user", content: "photo place" }],
      attachments: [
        {
          filename: "big.jpg",
          mime_type: "image/jpeg",
          content_base64: big.toString("base64"),
        },
      ],
    });
    expect(result.outcomeKey).toBe("errors.upload_too_large");
  });

  it("should_use_single_configured_model_regardless_of_destination", () => {
    expect(configuredChatModel()).toBe(process.env.OPENAI_CHAT_MODEL ?? "gpt-5.4");
  });
});
