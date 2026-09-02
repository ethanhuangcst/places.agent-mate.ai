/**
 * Step-timed probe for make_itinerary (enrich + LLM attempts + repair/validate).
 * Usage: npx tsx --env-file=.env.local scripts/time-make-itinerary-steps.ts [City] [numDays]
 */
import { discoverPlaces, slimArrangeCandidates } from "../src/core/itinerary-planner";
import {
  createSkeletonChatCreate,
  llmSkeletonTimeoutMs,
  buildSkeletonUserMessage,
  validateSkeleton,
  remapStopNamesToPool,
  trimAreaAliasStops,
  reseatLateLunchStops,
  reseatStayToDayOrigin,
  dropCityNameStops,
  trimPaceOverages,
  type MakeItineraryInput,
} from "../src/core/make-itinerary";
import { assembleSystemPrompt } from "../src/agent/prompt-assembler";
import { loadGlossary } from "../src/agent/loop";
import { parseLocale } from "../src/core/locales";
import { geocode, searchPlaces, searchRestaurants } from "../src/core/tools";
import { normalizeMustIncludeToken, skeletonCoversMustInclude } from "../src/core/trip-intake";
import {
  filterCardsNearAnchor,
  pickSupplementaryMustIncludeHit,
} from "../src/core/geo-bounds";
import type { PlaceCard } from "../src/core/types";

function ms(t0: number) {
  return Math.round(performance.now() - t0);
}

function log(obj: Record<string, unknown>) {
  console.log(JSON.stringify(obj));
}

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1]!.trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return text.trim();
}

async function withAbortTimeout<T>(timeoutMs: number, fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fn(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

async function enrichTimed(input: MakeItineraryInput) {
  const steps: Array<Record<string, unknown>> = [];
  let places = [...input.candidates.places];
  let restaurants = [...input.candidates.restaurants];
  const city = input.city.trim();
  const locale = input.locale;

  {
    const t = performance.now();
    if (restaurants.length === 0 && city) {
      try {
        const res = await searchRestaurants({ address: city, query: city, locale });
        const cityNorm = normalizeMustIncludeToken(city);
        restaurants = (res.data ?? [])
          .filter(
            (c) =>
              typeof c.name === "string" &&
              c.name.trim() &&
              normalizeMustIncludeToken(c.name) !== cityNorm,
          )
          .slice(0, 12);
      } catch {
        restaurants = [];
      }
    }
    steps.push({ step: "1a.enrich.searchRestaurants_if_empty", ms: ms(t) });
  }

  const uncovered = (input.must_include ?? []).filter(
    (tok) => tok.trim() && !skeletonCoversMustInclude(tok, places.map((p) => p.name)),
  );
  {
    const t = performance.now();
    if (uncovered.length && city) {
      const extras = await Promise.all(
        uncovered.map((token) =>
          searchPlaces({ address: city, query: token.trim(), locale }).catch(() => ({
            data: [] as PlaceCard[],
          })),
        ),
      );
      const existingNorm = new Set(places.map((p) => normalizeMustIncludeToken(p.name)));
      extras.forEach((res, i) => {
        const token = uncovered[i] ?? "";
        const found = pickSupplementaryMustIncludeHit(res.data ?? [], token, {
          city,
          existingNorm,
        });
        if (!found) return;
        found.must_see = true;
        existingNorm.add(normalizeMustIncludeToken(found.name));
        places.unshift(found);
      });
    }
    steps.push({
      step: "1b.enrich.supplementary_must_include_search",
      ms: ms(t),
      uncovered: uncovered.length,
    });
  }

  {
    const t = performance.now();
    for (const token of input.must_include ?? []) {
      const tok = token.trim();
      if (!tok) continue;
      const covering = places.filter((p) => skeletonCoversMustInclude(tok, [p.name])).length;
      if (covering >= 3) continue;
      let geo: { lat: number; lng: number } | null = null;
      try {
        const g = await geocode({ query: tok, locale });
        if (g.data?.lat != null && g.data?.lng != null) {
          geo = { lat: g.data.lat, lng: g.data.lng };
        }
      } catch {
        geo = null;
      }
      if (!geo) continue;
      try {
        const res = await searchPlaces({
          query: tok,
          near: { lat: geo.lat, lng: geo.lng },
          locale,
        });
        const existingNorm = new Set(places.map((p) => normalizeMustIncludeToken(p.name)));
        for (const card of res.data ?? []) {
          const n = normalizeMustIncludeToken(card.name);
          if (!n || existingNorm.has(n)) continue;
          if (city && n === normalizeMustIncludeToken(city)) continue;
          card.must_see = true;
          existingNorm.add(n);
          places.push(card);
          if (places.filter((p) => skeletonCoversMustInclude(tok, [p.name])).length >= 8) break;
        }
      } catch {
        /* keep */
      }
    }
    steps.push({ step: "1c.enrich.area_must_include_geocode_nearby", ms: ms(t) });
  }

  {
    const t = performance.now();
    let anchor =
      input.origin?.lat != null && input.origin?.lng != null
        ? { lat: input.origin.lat, lng: input.origin.lng }
        : null;
    if (!anchor && city) {
      try {
        const g = await geocode({ query: city, locale });
        if (g.data?.lat != null && g.data?.lng != null) {
          anchor = { lat: g.data.lat, lng: g.data.lng };
        }
      } catch {
        anchor = null;
      }
    }
    if (anchor) {
      places = filterCardsNearAnchor(places, anchor);
      restaurants = filterCardsNearAnchor(restaurants, anchor);
    }
    steps.push({ step: "1d.enrich.geocode_city_anchor_filter", ms: ms(t) });
  }

  return { input: { ...input, candidates: { places, restaurants } }, steps };
}

async function main() {
  const city = process.argv[2] ?? "Tokyo";
  const numDays = Number(process.argv[3] ?? 5);
  const budgetMs = llmSkeletonTimeoutMs();
  log({ probe: "make_itinerary_steps", city, numDays, LLM_SKELETON_TIMEOUT_MS: budgetMs });

  let t = performance.now();
  const disc = await discoverPlaces({
    city,
    numDays,
    bounds: { start: "2026-10-10", end: "2026-10-14" },
    locale: "EN",
    providers: ["GOOGLE_MAPS", "AMAP", "TRIPADVISOR"],
  });
  log({
    step: "0.discover_places_NOT_in_make_itinerary",
    ms: ms(t),
    places: disc.candidates.places.length,
    restaurants: disc.candidates.restaurants.length,
  });

  const baseInput: MakeItineraryInput = {
    city,
    numDays,
    candidates: disc.candidates,
    pace: "medium",
    budget: "budget",
    locale: "EN",
  };

  const tAll = performance.now();
  const { input: enriched, steps: enrichSteps } = await enrichTimed(baseInput);
  for (const s of enrichSteps) log(s);

  t = performance.now();
  slimArrangeCandidates(enriched.candidates);
  log({ step: "2.slimArrangeCandidates", ms: ms(t) });

  t = performance.now();
  const locale = parseLocale(enriched.locale);
  const systemPrompt = assembleSystemPrompt({
    locale,
    intent: "itinerary-skeleton",
    budget: enriched.budget,
    glossary: loadGlossary(locale) ?? undefined,
  });
  const userMessage = buildSkeletonUserMessage({ ...enriched, locale });
  log({
    step: "3.assemble_prompts",
    ms: ms(t),
    system_chars: systemPrompt.length,
    user_chars: userMessage.length,
  });

  const pool = {
    places: enriched.candidates.places,
    restaurants: enriched.candidates.restaurants,
    stays: enriched.origin?.name ? [enriched.origin.name] : [],
  };

  const create = createSkeletonChatCreate();
  if (!create) throw new Error("no OPENAI_API_KEY / createSkeletonChatCreate null");

  let lastError: string | null = null;
  let done = false;
  for (let attempt = 0; attempt < 2 && !done; attempt++) {
    const messages = [
      { role: "system" as const, content: systemPrompt },
      {
        role: "user" as const,
        content:
          attempt === 0
            ? userMessage
            : `${userMessage}\n\nPrevious errors:\n${lastError}\n\nFix and return valid JSON.`,
      },
    ];
    t = performance.now();
    let raw: string | null = null;
    try {
      const completion = await withAbortTimeout(budgetMs, (signal) =>
        create(
          {
            model: process.env.OPENAI_CHAT_MODEL ?? "gpt-4o",
            messages,
            max_completion_tokens: 2048,
            temperature: 0.3,
          },
          { signal },
        ),
      );
      const text = (completion as { choices?: Array<{ message?: { content?: string | null } }> })
        ?.choices?.[0]?.message?.content;
      raw = typeof text === "string" && text.trim() ? text.trim() : null;
      log({
        step: `4.llm_attempt_${attempt + 1}`,
        ms: ms(t),
        timed_out: false,
        raw_chars: raw?.length ?? 0,
        budget_ms: budgetMs,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log({
        step: `4.llm_attempt_${attempt + 1}`,
        ms: ms(t),
        timed_out: true,
        error: msg.slice(0, 160),
        prior_validation: lastError?.slice(0, 160) ?? null,
        budget_ms: budgetMs,
      });
      break;
    }

    t = performance.now();
    if (!raw) {
      lastError = "empty LLM response";
      log({ step: `5.post_attempt_${attempt + 1}`, ms: ms(t), ok: false, error: lastError });
      continue;
    }
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(extractJson(raw));
    } catch {
      lastError = "LLM response is not valid JSON";
      log({ step: `5.post_attempt_${attempt + 1}`, ms: ms(t), ok: false, error: lastError });
      continue;
    }
    parsedJson = remapStopNamesToPool(parsedJson, pool);
    parsedJson = trimAreaAliasStops(parsedJson, enriched.must_include ?? [], enriched.city);
    parsedJson = reseatLateLunchStops(parsedJson);
    parsedJson = reseatStayToDayOrigin(parsedJson);
    parsedJson = dropCityNameStops(parsedJson, enriched.city);
    parsedJson = trimPaceOverages(parsedJson, enriched.pace);
    parsedJson = reseatLateLunchStops(parsedJson);
    const validated = validateSkeleton(
      parsedJson,
      pool,
      enriched.must_include ?? [],
      enriched.pace,
      enriched.city,
    );
    log({
      step: `5.post_attempt_${attempt + 1}_repair_validate`,
      ms: ms(t),
      ok: validated.ok,
      error: validated.ok ? null : validated.error.slice(0, 200),
    });
    if (validated.ok) done = true;
    else lastError = validated.error;
  }

  log({
    step: "6.emit_skeleton_events_build_next_tool_call",
    ms: 0,
    note: "CPU only; typically <5ms in handler after skeleton ready",
  });
  log({ step: "TOTAL_inside_make_itinerary", ms: ms(tAll), done });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
