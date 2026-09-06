import { describe, expect, it, vi } from "vitest";
import {
  chatLlmModelCandidates,
  chatLlmProviderQueue,
  createChatWithModelFallback,
  isLlmModelDeniedError,
  resolveChatLlmConfig,
} from "./llm-chat-config";

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

  it("should_list_qwen_plus_then_fallback_models", () => {
    expect(
      chatLlmModelCandidates({
        QWEN_API_KEY: "sk-qwen",
        QWEN_CHAT_MODEL: "qwen-plus",
        QWEN_CHAT_MODEL_FALLBACK: "qwen-flash / qwen-turbo",
      }),
    ).toEqual(["qwen-plus", "qwen-flash", "qwen-turbo"]);
  });

  it("should_retry_next_model_when_access_denied", async () => {
    const create = vi.fn(async (params: { model: string }) => {
      if (params.model === "qwen-plus") {
        throw new Error("403 Access to model denied. Please make sure you are eligible for using the model.");
      }
      return { choices: [{ message: { content: "{}" } }] };
    });
    const out = await createChatWithModelFallback(
      create,
      { model: "qwen-plus", messages: [], max_completion_tokens: 8, temperature: 0.3 },
      { signal: AbortSignal.timeout(5_000) },
      ["qwen-plus", "qwen-flash"],
    );
    expect(out.choices[0]?.message?.content).toBe("{}");
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[1]?.[0]?.model).toBe("qwen-flash");
  });

  it("should_detect_model_denied_errors", () => {
    expect(isLlmModelDeniedError(new Error("403 Access to model denied"))).toBe(true);
    expect(isLlmModelDeniedError(new Error("rate limited"))).toBe(false);
    expect(
      isLlmModelDeniedError(
        Object.assign(new Error("Forbidden"), {
          status: 403,
          code: "AccessDenied.Unpurchased",
        }),
      ),
    ).toBe(true);
    expect(isLlmModelDeniedError(new Error("403 AccessDenied.Unpurchased"))).toBe(true);
    expect(isLlmModelDeniedError(Object.assign(new Error("rate limited"), { status: 429 }))).toBe(
      false,
    );
  });

  it("should_queue_openai_cn_after_qwen_when_both_keys_set", () => {
    const queue = chatLlmProviderQueue({
      QWEN_API_KEY: "sk-qwen",
      QWEN_CHAT_MODEL: "qwen-plus",
      OPENAI_API_KEY: "sk-old",
      OPENAI_CHAT_MODEL: "gpt-5.4",
      OPENAI_BASE_URL: "https://legacy.example/v1",
    });
    expect(queue.map((c) => c.provider)).toEqual(["qwen", "openai_cn"]);
    expect(queue[1]?.model).toBe("gpt-5.4");
  });

  it("should_queue_openai_cn_first_when_CHAT_LLM_PRIMARY_is_openai_cn", () => {
    const queue = chatLlmProviderQueue({
      CHAT_LLM_PRIMARY: "openai_cn",
      QWEN_API_KEY: "sk-qwen",
      QWEN_CHAT_MODEL: "qwen-plus",
      OPENAI_API_KEY: "sk-old",
      OPENAI_CHAT_MODEL: "gpt-5.4",
      OPENAI_BASE_URL: "https://legacy.example/v1",
    });
    expect(queue.map((c) => c.provider)).toEqual(["openai_cn", "qwen"]);
    expect(queue[0]?.model).toBe("gpt-5.4");
  });

  it("should_keep_qwen_first_when_CHAT_LLM_PRIMARY_is_qwen_or_unset", () => {
    const env = {
      QWEN_API_KEY: "sk-qwen",
      QWEN_CHAT_MODEL: "qwen-plus",
      OPENAI_API_KEY: "sk-old",
      OPENAI_CHAT_MODEL: "gpt-5.4",
    };
    expect(chatLlmProviderQueue(env).map((c) => c.provider)).toEqual(["qwen", "openai_cn"]);
    expect(
      chatLlmProviderQueue({ ...env, CHAT_LLM_PRIMARY: "qwen" }).map((c) => c.provider),
    ).toEqual(["qwen", "openai_cn"]);
  });
});
