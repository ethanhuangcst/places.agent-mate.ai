import { describe, expect, it } from "vitest";
import { resolveChatLlmConfig } from "./llm-chat-config";

describe("resolveChatLlmConfig", () => {
  it("should_prefer_qwen_when_QWEN_API_KEY_is_set", () => {
    const cfg = resolveChatLlmConfig({
      QWEN_API_KEY: "sk-qwen",
      QWEN_BASE_URL: "https://example.com/compatible-mode/v1",
      QWEN_CHAT_MODEL: "qwen-plus",
      OPENAI_API_KEY: "sk-old",
      OPENAI_CHAT_MODEL: "gpt-5.4",
    });
    expect(cfg).toEqual({
      provider: "qwen",
      apiKey: "sk-qwen",
      baseURL: "https://example.com/compatible-mode/v1",
      model: "qwen-plus",
    });
  });

  it("should_fall_back_to_openai_cn_when_qwen_key_empty", () => {
    const cfg = resolveChatLlmConfig({
      QWEN_API_KEY: "",
      OPENAI_API_KEY: "sk-old",
      OPENAI_BASE_URL: "https://legacy.example/v1",
      OPENAI_CHAT_MODEL: "gpt-5.4",
    });
    expect(cfg?.provider).toBe("openai_cn");
    expect(cfg?.apiKey).toBe("sk-old");
  });

  it("should_return_null_when_no_keys", () => {
    expect(resolveChatLlmConfig({})).toBeNull();
  });
});
