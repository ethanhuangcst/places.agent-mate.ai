/**
 * Query Language Policy (QLP) — agent-design §5.2.3.
 *
 * Provider selection (ADR-026/030) and query language are linked:
 * - QLP-A (AMAP): always Simplified Chinese keywords (AMAP ignores English).
 * - QLP-G (Google): EN; if UI locale ≠ EN, also run locale keywords in parallel.
 *
 * Do not choose search language from UI locale alone (EN UI + 哈尔滨 must still
 * hit AMAP with CN queries when AMAP is in the provider set).
 */

import {
  getAttractionQueries,
  getDiscoverDiningQueries,
  getHotAttractionQueries,
  getKeyword,
} from "../i18n/search-keywords";
import { mustSeeQueriesForCity } from "./discover-must-see";
import { type Locale, parseLocale } from "./locales";

export type SearchJob = {
  /** Subset of providers for this call (QLP splits AMAP vs Google). */
  providers: string[];
  query: string;
};

function uniqueJobs(jobs: SearchJob[]): SearchJob[] {
  const seen = new Set<string>();
  const out: SearchJob[] = [];
  for (const job of jobs) {
    const key = `${job.providers.join(",")}|${job.query}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(job);
  }
  return out;
}

/**
 * Build attraction search jobs for discover / LLM Phase 1.
 * Caps AMAP to two catalog templates to bound latency.
 */
export function assembleAttractionSearchJobs(input: {
  city: string;
  providers: string[];
  uiLocale: Locale | string;
}): SearchJob[] {
  const city = input.city.trim();
  const uiLocale = parseLocale(input.uiLocale);
  const providers = input.providers.length ? input.providers : ["GOOGLE_MAPS"];
  const hasAmap = providers.includes("AMAP");
  const hasGoogle = providers.includes("GOOGLE_MAPS");
  const jobs: SearchJob[] = [];

  if (hasAmap) {
    // QLP-A: pure CN — never English on AMAP (legacy Phase1 / timed: first 2 templates)
    for (const query of getAttractionQueries(city, "CN").slice(0, 2)) {
      jobs.push({ providers: ["AMAP"], query });
    }
  }

  if (hasGoogle) {
    // QLP-G: EN always
    const en = getAttractionQueries(city, "EN")[0];
    if (en) jobs.push({ providers: ["GOOGLE_MAPS"], query: en });
    // + UI locale when ≠ EN (parallel bilingual)
    if (uiLocale !== "EN") {
      const loc = getAttractionQueries(city, uiLocale)[0];
      if (loc) jobs.push({ providers: ["GOOGLE_MAPS"], query: loc });
    }
  }

  if (!jobs.length) {
    jobs.push({
      providers,
      query: getAttractionQueries(city, "EN")[0] ?? "attractions landmarks",
    });
  }

  return uniqueJobs(jobs);
}

/** Restaurant / dining jobs — same QLP as attractions (generic restaurant keyword). */
export function assembleRestaurantSearchJobs(input: {
  city: string;
  providers: string[];
  uiLocale: Locale | string;
}): SearchJob[] {
  const city = input.city.trim();
  const uiLocale = parseLocale(input.uiLocale);
  const providers = input.providers.length ? input.providers : ["GOOGLE_MAPS"];
  const hasAmap = providers.includes("AMAP");
  const hasGoogle = providers.includes("GOOGLE_MAPS");
  const jobs: SearchJob[] = [];

  if (hasAmap) {
    jobs.push({
      providers: ["AMAP"],
      query: `${city} ${getKeyword("restaurant", "CN")}`.trim(),
    });
  }

  if (hasGoogle) {
    jobs.push({
      providers: ["GOOGLE_MAPS"],
      query: `${city} ${getKeyword("restaurant", "EN")}`.trim(),
    });
    if (uiLocale !== "EN") {
      jobs.push({
        providers: ["GOOGLE_MAPS"],
        query: `${city} ${getKeyword("restaurant", uiLocale)}`.trim(),
      });
    }
  }

  if (!jobs.length) {
    jobs.push({
      providers,
      query: `${city} ${getKeyword("restaurant", "EN")}`.trim(),
    });
  }

  return uniqueJobs(jobs);
}

/**
 * Discover L1 attraction jobs (ADR-038): must-see seeds first, then improved QLP generics.
 * AMAP stays CN-only (QLP-A).
 */
export function assembleDiscoverAttractionJobs(input: {
  city: string;
  providers: string[];
  uiLocale: Locale | string;
}): SearchJob[] {
  const city = input.city.trim();
  const uiLocale = parseLocale(input.uiLocale);
  const providers = input.providers.length ? input.providers : ["GOOGLE_MAPS"];
  const hasAmap = providers.includes("AMAP");
  const hasGoogle = providers.includes("GOOGLE_MAPS");
  const jobs: SearchJob[] = [];
  const seeds = mustSeeQueriesForCity(city).attractions;

  if (hasAmap) {
    for (const query of seeds) {
      jobs.push({ providers: ["AMAP"], query });
    }
    // must_see + museum/historic (skip park/garden-heavy template as early AMAP job)
    for (const query of getAttractionQueries(city, "CN").slice(0, 3)) {
      jobs.push({ providers: ["AMAP"], query });
    }
  }

  if (hasGoogle) {
    // ADR-043: destination-agnostic hot templates first (not city encyclopedia)
    for (const query of getHotAttractionQueries(city, "EN").slice(0, 3)) {
      jobs.push({ providers: ["GOOGLE_MAPS"], query });
    }
    if (uiLocale !== "EN") {
      for (const query of getHotAttractionQueries(city, uiLocale).slice(0, 2)) {
        jobs.push({ providers: ["GOOGLE_MAPS"], query });
      }
    }
    // Temporary frozen CATALOG boost only (ADR-042 — do not grow)
    for (const query of seeds) {
      jobs.push({ providers: ["GOOGLE_MAPS"], query });
    }
    const enExtra = getAttractionQueries(city, "EN").slice(1, 3);
    for (const query of enExtra) {
      jobs.push({ providers: ["GOOGLE_MAPS"], query });
    }
  }

  if (!jobs.length) {
    return assembleAttractionSearchJobs(input);
  }

  return uniqueJobs(jobs);
}

/** Discover L1 dining jobs: local specialty + night market + restaurant; seeds first. */
export function assembleDiscoverRestaurantJobs(input: {
  city: string;
  providers: string[];
  uiLocale: Locale | string;
}): SearchJob[] {
  const city = input.city.trim();
  const uiLocale = parseLocale(input.uiLocale);
  const providers = input.providers.length ? input.providers : ["GOOGLE_MAPS"];
  const hasAmap = providers.includes("AMAP");
  const hasGoogle = providers.includes("GOOGLE_MAPS");
  const jobs: SearchJob[] = [];
  const seeds = mustSeeQueriesForCity(city).restaurants;

  if (hasAmap) {
    for (const query of seeds) {
      jobs.push({ providers: ["AMAP"], query });
    }
    for (const query of getDiscoverDiningQueries(city, "CN").slice(0, 2)) {
      jobs.push({ providers: ["AMAP"], query });
    }
  }

  if (hasGoogle) {
    for (const query of seeds) {
      jobs.push({ providers: ["GOOGLE_MAPS"], query });
    }
    const en = getDiscoverDiningQueries(city, "EN")[0];
    if (en) jobs.push({ providers: ["GOOGLE_MAPS"], query: en });
    if (uiLocale !== "EN") {
      const loc = getDiscoverDiningQueries(city, uiLocale)[0];
      if (loc) jobs.push({ providers: ["GOOGLE_MAPS"], query: loc });
    }
  }

  if (!jobs.length) {
    return assembleRestaurantSearchJobs(input);
  }

  return uniqueJobs(jobs);
}
