import { describe, it, expect } from "vitest";
import { assembleSystemPrompt } from "./prompt-assembler";

describe("assembleSystemPrompt", () => {
  it("TC-M6-PA01: should load base.en.md for EN locale", () => {
    const prompt = assembleSystemPrompt({ locale: "EN", intent: "chat" });
    expect(prompt).toContain("places-agent");
    expect(prompt).toContain("place discovery assistant");
  });

  it("TC-M6-PA02: should load base.zh.md for CN locale", () => {
    const prompt = assembleSystemPrompt({ locale: "CN", intent: "chat" });
    expect(prompt).toContain("地点发现助手");
  });

  it("TC-M6-PA03: should use zh base for CN + overlay", () => {
    const prompt = assembleSystemPrompt({ locale: "CN", intent: "meal" });
    expect(prompt).toContain("地点发现助手"); // zh base
    expect(prompt).toContain("Meal search context"); // overlay (EN, shared across locales)
  });

  it("TC-M6-PA04: should use en base for EN + overlay", () => {
    const prompt = assembleSystemPrompt({ locale: "EN", intent: "meal" });
    expect(prompt).toContain("place discovery assistant"); // en base
    expect(prompt).toContain("Meal search context"); // overlay
  });

  it("TC-M6-PA05: should append itinerary-planner overlay", () => {
    const prompt = assembleSystemPrompt({ locale: "EN", intent: "itinerary" });
    expect(prompt).toContain("Itinerary planner");
    expect(prompt).toContain("Self-check before output");
    expect(prompt).toContain("day_index");
  });

  it("TC-M6-PA06: should append meal-search overlay", () => {
    const prompt = assembleSystemPrompt({ locale: "EN", intent: "meal" });
    expect(prompt).toContain("Meal search context");
    expect(prompt).toContain("cuisine");
  });

  it("TC-M6-PA07: should append budget hint for premium", () => {
    const prompt = assembleSystemPrompt({ locale: "EN", intent: "meal", budget: "premium" });
    expect(prompt).toContain("fine dining");
    expect(prompt).toContain("Michelin");
  });

  it("TC-M6-PA08: should return only base when intent=chat", () => {
    const prompt = assembleSystemPrompt({ locale: "EN", intent: "chat" });
    // chat has no overlay file
    expect(prompt).toContain("places-agent");
    expect(prompt).not.toContain("Itinerary planner");
    expect(prompt).not.toContain("Meal search context");
  });

  it("should append time-of-day hint", () => {
    const prompt = assembleSystemPrompt({ locale: "EN", intent: "meal", timeOfDay: "evening" });
    expect(prompt).toContain("dinner options");
  });

  it("should append glossary for HK", () => {
    const glossary = "taxi: 的士\nmetro: 港鐵";
    const prompt = assembleSystemPrompt({ locale: "HK", intent: "chat", glossary });
    expect(prompt).toContain("Travel glossary:");
    expect(prompt).toContain("的士");
  });

  it("should use zh base for HK and TW locales", () => {
    const hk = assembleSystemPrompt({ locale: "HK", intent: "chat" });
    const tw = assembleSystemPrompt({ locale: "TW", intent: "chat" });
    expect(hk).toContain("地点发现助手");
    expect(tw).toContain("地点发现助手");
  });
});
