export type ChatLlmProvider = "qwen" | "openai_cn";

export type ChatLlmConfig = {
  provider: ChatLlmProvider;
  apiKey: string;
  baseURL: string | undefined;
  model: string;
};

function parseModelList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean);
}

function firstFallbackModel(raw: string | undefined): string | undefined {
  return parseModelList(raw)[0];
}

/** Env bag for unit tests (Next augments ProcessEnv with required NODE_ENV). */
export type ChatLlmEnv = Partial<NodeJS.ProcessEnv> & Record<string, string | undefined>;

/** Primary + `QWEN_CHAT_MODEL_FALLBACK` (slash-separated). Deduped, order preserved. */
export function chatLlmModelCandidates(env: ChatLlmEnv = process.env): string[] {
  const cfg = resolveChatLlmConfig(env);
  if (!cfg) return [];
  if (cfg.provider === "qwen") {
    const listed = [env.QWEN_CHAT_MODEL?.trim(), ...parseModelList(env.QWEN_CHAT_MODEL_FALLBACK)].filter(
      (s): s is string => Boolean(s),
    );
    return [...new Set(listed.length ? listed : [cfg.model])];
  }
  return [cfg.model];
}

function llmErrorField(err: unknown, key: "code" | "status" | "type"): unknown {
  if (!err || typeof err !== "object") return undefined;
  const o = err as Record<string, unknown>;
  if (o[key] != null) return o[key];
  const nested = o.error;
  if (nested && typeof nested === "object") return (nested as Record<string, unknown>)[key];
  return undefined;
}

/** Qwen 403 Unpurchased / unknown model — retry next model or OPENAI_CN. */
export function isLlmModelDeniedError(err: unknown): boolean {
  const extra =
    err && typeof err === "object" && "error" in err
      ? String((err as { error?: { message?: string } }).error?.message ?? "")
      : "";
  const code = String(llmErrorField(err, "code") ?? "");
  const status = Number(llmErrorField(err, "status"));
  const msg = `${err instanceof Error ? err.message : String(err)} ${extra} ${code}`;
  if (/accessdenied|unpurchased|access to model denied|model_not_found|does not exist|unknown model/i.test(msg)) {
    return true;
  }
  return status === 403;
}

type ChatCreateParams = {
  model: string;
  messages: unknown[];
  max_completion_tokens: number;
  temperature: number;
};

export async function createChatWithModelFallback<T>(
  create: (params: ChatCreateParams, options: { signal: AbortSignal }) => Promise<T>,
  params: ChatCreateParams,
  options: { signal: AbortSignal },
  models: string[],
): Promise<T> {
  const queue = models.length ? models : [params.model];
  let last: unknown;
  for (const model of queue) {
    try {
      return await create({ ...params, model }, options);
    } catch (err) {
      last = err;
      if (!isLlmModelDeniedError(err)) throw err;
    }
  }
  throw last instanceof Error ? last : new Error(String(last));
}

/** Prefer Qwen (ADR-047). Fall back to OPENAI_CN when QWEN_API_KEY is empty. */
export function resolveChatLlmConfig(
  env: ChatLlmEnv = process.env,
): ChatLlmConfig | null {
  const qwen = env.QWEN_API_KEY?.trim();
  if (qwen && qwen !== "fixture") {
    return {
      provider: "qwen",
      apiKey: qwen,
      baseURL: env.QWEN_BASE_URL?.trim() || undefined,
      model: env.QWEN_CHAT_MODEL?.trim() || firstFallbackModel(env.QWEN_CHAT_MODEL_FALLBACK) || "qwen-plus",
    };
  }
  const openai = env.OPENAI_API_KEY?.trim();
  if (!openai || openai === "fixture") return null;
  return {
    provider: "openai_cn",
    apiKey: openai,
    baseURL: env.OPENAI_BASE_URL?.trim() || undefined,
    model: env.OPENAI_CHAT_MODEL?.trim() || "gpt-5.4",
  };
}

export function chatLlmConfigured(env: ChatLlmEnv = process.env): boolean {
  return resolveChatLlmConfig(env) != null;
}

/**
 * Default: Qwen first (ADR-047), then OPENAI_CN when both keys exist.
 * Optional `CHAT_LLM_PRIMARY=openai_cn|qwen` reorders for local/dev (does not change ADR default).
 */
export function chatLlmProviderQueue(env: ChatLlmEnv = process.env): ChatLlmConfig[] {
  const qwenSlot = (() => {
    const key = env.QWEN_API_KEY?.trim();
    if (!key || key === "fixture") return null;
    return {
      provider: "qwen" as const,
      apiKey: key,
      baseURL: env.QWEN_BASE_URL?.trim() || undefined,
      model:
        env.QWEN_CHAT_MODEL?.trim() ||
        firstFallbackModel(env.QWEN_CHAT_MODEL_FALLBACK) ||
        "qwen-plus",
    };
  })();
  const openaiSlot = (() => {
    const key = env.OPENAI_API_KEY?.trim();
    if (!key || key === "fixture") return null;
    return {
      provider: "openai_cn" as const,
      apiKey: key,
      baseURL: env.OPENAI_BASE_URL?.trim() || undefined,
      model: env.OPENAI_CHAT_MODEL?.trim() || "gpt-5.4",
    };
  })();

  const preferOpenAi =
    (env.CHAT_LLM_PRIMARY ?? "").trim().toLowerCase() === "openai_cn";

  if (preferOpenAi) {
    const queue: ChatLlmConfig[] = [];
    if (openaiSlot) queue.push(openaiSlot);
    if (qwenSlot) queue.push(qwenSlot);
    return queue;
  }

  const queue: ChatLlmConfig[] = [];
  if (qwenSlot) queue.push(qwenSlot);
  else if (openaiSlot) queue.push(openaiSlot);
  if (qwenSlot && openaiSlot) queue.push(openaiSlot);
  return queue;
}
