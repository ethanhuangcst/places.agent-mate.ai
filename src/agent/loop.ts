import fs from "node:fs";
import path from "node:path";
import OpenAI from "openai";
import {
  geocode,
  getPlaceDetails,
  navigate,
  searchPlaces,
  searchRestaurants,
} from "../core/tools";
import { planItinerary } from "../core/itinerary";
import { parseLocale, type Locale } from "../core/locales";
import { t } from "../core/i18n";
import { type PlaceCard } from "../core/types";

export type ChatAttachment = {
  filename: string;
  mime_type: string;
  content_base64: string;
};

export type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export type ChatInput = {
  messages: ChatMessage[];
  locale?: Locale;
  locales?: Locale[];
  attachments?: ChatAttachment[];
};

export type ChatResult = {
  message: { role: "assistant"; content: string; key?: string };
  tool_calls?: string[];
  locale: Locale;
  outcomeKey?: string;
};

const MAX_ITERATIONS = 8;
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/plain",
]);

function loadPrompt(): string {
  const id = process.env.PROMPT_ID ?? "chat.v1";
  const file = path.join(process.cwd(), "prompts/chat", `${id.replace("chat.", "")}.md`);
  if (fs.existsSync(file)) return fs.readFileSync(file, "utf8");
  return "You are places-agent. Use tools for place facts.";
}

function loadGlossary(locale: Locale): string {
  if (locale !== "HK" && locale !== "TW") return "";
  const id = process.env.GLOSSARY_ID ?? "travel.v1";
  const file = path.join(process.cwd(), "prompts/glossaries", `${id.replace("travel.", "")}.json`);
  if (!fs.existsSync(file)) return "";
  const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Record<
    string,
    Record<string, string>
  >;
  const lines = Object.entries(raw).map(
    ([sense, map]) => `${sense}: ${map[locale] ?? map.EN ?? ""}`,
  );
  return lines.join("\n");
}

function truncateToolResult(data: unknown): unknown {
  if (Array.isArray(data)) {
    return (data as PlaceCard[]).slice(0, 5).map((card) => ({
      name: card.name,
      provider: card.provider,
      location: card.location,
      rating: card.rating,
      category: card.category,
      sources: card.sources?.map((s) => ({
        provider: s.provider,
        native_id: s.native_id,
      })),
      skipped_reason: undefined,
    }));
  }
  return data;
}

async function executeTool(name: string, args: Record<string, unknown>) {
  switch (name) {
    case "search_restaurants":
      return searchRestaurants(args as Parameters<typeof searchRestaurants>[0]);
    case "search_places":
      return searchPlaces(args as Parameters<typeof searchPlaces>[0]);
    case "get_place_details":
      return getPlaceDetails(args as Parameters<typeof getPlaceDetails>[0]);
    case "geocode":
      return geocode(args as Parameters<typeof geocode>[0]);
    case "navigate":
      return navigate(args as Parameters<typeof navigate>[0]);
    case "plan_itinerary":
      return planItinerary(args as Parameters<typeof planItinerary>[0]);
    default:
      throw new Error(`unknown_tool:${name}`);
  }
}

const TOOL_DEFS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "search_restaurants",
      description: "Search restaurants near a location or keyword.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          near: {
            type: "object",
            properties: { lat: { type: "number" }, lng: { type: "number" } },
          },
          providers: { type: "array", items: { type: "string" } },
          locale: { type: "string" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_places",
      description: "Search museums, parks, and non-restaurant POIs.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          near: {
            type: "object",
            properties: { lat: { type: "number" }, lng: { type: "number" } },
          },
          providers: { type: "array", items: { type: "string" } },
          locale: { type: "string" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_place_details",
      description: "Get details for a vendor native place id.",
      parameters: {
        type: "object",
        properties: {
          provider: { type: "string" },
          native_id: { type: "string" },
          locale: { type: "string" },
        },
        required: ["provider", "native_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "geocode",
      description: "Geocode an address or reverse-geocode coordinates.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          lat: { type: "number" },
          lng: { type: "number" },
          providers: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "navigate",
      description: "Return secret-free map deeplinks for a place.",
      parameters: {
        type: "object",
        properties: {
          native_id: { type: "string" },
          provider: { type: "string" },
          lat: { type: "number" },
          lng: { type: "number" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "plan_itinerary",
      description: "Build a structured itinerary from bounds, places, and preferences.",
      parameters: {
        type: "object",
        properties: {
          bounds: {
            type: "object",
            properties: { start: { type: "string" }, end: { type: "string" } },
          },
          places: { type: "array", items: { type: "object" } },
          preferences: { type: "object" },
          locale: { type: "string" },
        },
      },
    },
  },
];

function validateAttachments(attachments?: ChatAttachment[]): string | null {
  if (!attachments?.length) return null;
  for (const file of attachments) {
    if (!ALLOWED_MIMES.has(file.mime_type)) return "errors.upload_unsupported";
    const bytes = Buffer.from(file.content_base64, "base64").byteLength;
    if (bytes > MAX_ATTACHMENT_BYTES) return "errors.upload_too_large";
  }
  return null;
}

function attachmentHint(attachments?: ChatAttachment[]): string {
  if (!attachments?.length) return "";
  return attachments
    .map((a) => `[attachment:${a.mime_type}:${a.filename}]`)
    .join(" ");
}

type FixtureTurn =
  | { type: "tool"; name: string; args: Record<string, unknown> }
  | { type: "text"; content: string };

function fixtureTurn(userText: string, toolCallsSoFar: string[]): FixtureTurn {
  const lower = userText.toLowerCase();
  if (toolCallsSoFar.length === 0 && /ramen|restaurant|dining|eat/.test(lower)) {
    return {
      type: "tool",
      name: "search_restaurants",
      args: {
        query: "ramen",
        providers: ["GOOGLE_MAPS"],
        locale: "EN",
      },
    };
  }
  if (toolCallsSoFar.length === 0 && /museum|poi|attraction|place/.test(lower)) {
    return {
      type: "tool",
      name: "search_places",
      args: { query: "museum", providers: ["GOOGLE_MAPS"], locale: "EN" },
    };
  }
  return {
    type: "text",
    content: "Here are tool-backed results for your question.",
  };
}

function useFixtureLlm(): boolean {
  return (
    process.env.QUANZIL_MODE === "fixture" ||
    !process.env.OPENAI_API_KEY ||
    process.env.PLACES_VENDOR_MODE === "fixture"
  );
}

function createClient(): OpenAI | null {
  if (useFixtureLlm()) return null;
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL ?? "https://quanzil.com/v1",
  });
}

export async function runChatLoop(input: ChatInput): Promise<ChatResult> {
  const locale = parseLocale(input.locale);
  const attachmentError = validateAttachments(input.attachments);
  if (attachmentError) {
    return {
      message: {
        role: "assistant",
        content: t(locale, attachmentError),
        key: attachmentError,
      },
      locale,
      outcomeKey: attachmentError,
    };
  }

  const glossary = loadGlossary(locale);
  const system = [
    loadPrompt(),
    `Output locale: ${locale}`,
    glossary ? `Travel glossary:\n${glossary}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const lastUser = [...input.messages].reverse().find((m) => m.role === "user");
  const userText = `${lastUser?.content ?? ""} ${attachmentHint(input.attachments)}`.trim();

  const openai = createClient();
  const history: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: system },
    ...input.messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  const toolCallsMade: string[] = [];

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    let assistantMessage: OpenAI.Chat.Completions.ChatCompletionMessage;

    if (!openai) {
      const turn = fixtureTurn(userText, toolCallsMade);
      if (turn.type === "tool") {
        assistantMessage = {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: `call_${i}`,
              type: "function",
              function: { name: turn.name, arguments: JSON.stringify(turn.args) },
            },
          ],
          refusal: null,
        };
      } else {
        return {
          message: { role: "assistant", content: turn.content },
          tool_calls: toolCallsMade,
          locale,
        };
      }
    } else {
      const completion = await openai.chat.completions.create({
        model: process.env.OPENAI_CHAT_MODEL ?? "gpt-5.4",
        messages: history,
        tools: TOOL_DEFS,
        max_completion_tokens: 1024,
      });
      assistantMessage = completion.choices[0]?.message;
      if (!assistantMessage) {
        return {
          message: {
            role: "assistant",
            content: t(locale, "errors.chat_failed"),
            key: "errors.chat_failed",
          },
          locale,
          outcomeKey: "errors.chat_failed",
        };
      }
    }

    history.push(assistantMessage);

    const calls = assistantMessage.tool_calls ?? [];
    if (!calls.length) {
      const text = assistantMessage.content ?? "";
      return {
        message: { role: "assistant", content: text },
        tool_calls: toolCallsMade,
        locale,
      };
    }

    for (const call of calls) {
      if (call.type !== "function") continue;
      const name = call.function.name;
      toolCallsMade.push(name);
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.function.arguments || "{}") as Record<string, unknown>;
      } catch {
        args = {};
      }
      args.locale = args.locale ?? locale;
      const result = await executeTool(name, args);
      history.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(truncateToolResult(result.data ?? result)),
      });
    }
  }

  return {
    message: {
      role: "assistant",
      content: t(locale, "errors.chat_failed"),
      key: "errors.chat_failed",
    },
    locale,
    outcomeKey: "errors.chat_failed",
  };
}

export function configuredChatModel(): string {
  return process.env.OPENAI_CHAT_MODEL ?? "gpt-5.4";
}
