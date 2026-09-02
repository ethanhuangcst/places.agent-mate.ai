import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type Locale } from "../core/locales";

export interface PromptContext {
  locale: Locale;
  intent: "meal" | "place" | "itinerary" | "itinerary-skeleton" | "travel-tips" | "chat";
  budget?: "budget" | "premium";
  timeOfDay?: "morning" | "afternoon" | "evening";
  glossary?: string;
}

const PROMPTS_DIR = join(process.cwd(), "prompts");

function loadFile(path: string): string | null {
  try {
    return readFileSync(join(PROMPTS_DIR, path), "utf-8").trim();
  } catch {
    return null;
  }
}

function loadBase(locale: Locale): string {
  const lang = locale === "EN" ? "en" : "zh";
  return loadFile(`base.${lang}.md`) ?? loadFile("base.en.md") ?? "";
}

const INTENT_TO_OVERLAY: Record<string, string> = {
  meal: "overlays/meal-search.md",
  place: "overlays/place-search.md",
  itinerary: "overlays/itinerary-planner.md",
  "itinerary-skeleton": "overlays/itinerary-skeleton.md",
  "travel-tips": "overlays/travel-tips.md",
};

function loadOverlay(intent: string): string | null {
  const path = INTENT_TO_OVERLAY[intent];
  return path ? loadFile(path) : null;
}

// Budget and time-of-day are short enough to inline as constants
const BUDGET_HINTS: Record<string, string> = {
  budget:
    "The user has a limited budget. Prioritize affordable, good-value options. Avoid fine dining and premium venues.",
  premium:
    "The user prefers premium experiences. Prioritize fine dining, Michelin-starred, and high-end venues.",
};

const TIME_HINTS: Record<string, string> = {
  morning: "It is morning. Consider breakfast/brunch options and venues that open early.",
  afternoon: "It is afternoon. Consider lunch options, parks, and afternoon activities.",
  evening: "It is evening. Consider dinner options, nightlife, and evening entertainment.",
};

/**
 * Assemble a system prompt from base template + intent overlay + optional extras.
 *
 * Order: base → overlay → budget hint → time hint → glossary
 */
export function assembleSystemPrompt(ctx: PromptContext): string {
  const parts: string[] = [];

  // 1. Base template (locale-specific)
  const base = loadBase(ctx.locale);
  if (base) parts.push(base);

  // 2. Intent overlay
  const overlay = loadOverlay(ctx.intent);
  if (overlay) parts.push(overlay);

  // 3. Budget hint (inline)
  if (ctx.budget && BUDGET_HINTS[ctx.budget]) {
    parts.push(BUDGET_HINTS[ctx.budget]);
  }

  // 4. Time-of-day hint (inline)
  if (ctx.timeOfDay && TIME_HINTS[ctx.timeOfDay]) {
    parts.push(TIME_HINTS[ctx.timeOfDay]);
  }

  // 5. Glossary (HK/TW)
  if (ctx.glossary) {
    parts.push(`Travel glossary:\n${ctx.glossary}`);
  }

  return parts.join("\n\n");
}
