/**
 * Discover pool near-duplicate clustering + restaurant stem dedupe.
 *
 * ADR-042 Update (2026-08-23): the Xi'an-specific landmark cluster branches
 * (wall / bell_drum / terracotta / dayan / huaqing / muslim_street) and the
 * must-see diversity reorder have been removed — source must contain no city
 * POI knowledge. Clustering now uses a destination-agnostic normalized name
 * key. Must-see prioritization is LLM-driven (discover-must-see-llm).
 */

import { type PlaceCard } from "./types";
import { normalizeVenueName } from "./place-filters";

/** Destination-agnostic cluster key: normalized name + prefix-family clustering.
 * ADR-042 compliant: no city-specific logic, just generic suffix stripping. */
export type AttractionCluster = string;

/** Common scenic-area / sub-POI suffixes that indicate a satellite of a parent landmark.
 * Stripping these collapses 雷峰塔景区 / 雷峰塔景区售票处 / 雷峰塔重建记 → 雷峰塔. */
const SATELLITE_SUFFIXES = [
  "景区售票处",
  "景区游客中心",
  "景区管理处",
  "景区",
  "风景区",
  "旅游区",
  "售票处",
  "游客中心",
  "管理处",
  "重建记",
  "入口",
  "出口",
  "停车场",
  "南门",
  "北门",
  "东门",
  "西门",
  "正门",
  "侧门",
  "检票口",
  "观景台",
  "瞭望台",
];

/** Coarse cluster key — normalized name with satellite-suffix stripping (ADR-042: no city branches). */
export function attractionClusterKey(name: string): AttractionCluster {
  const normalized = normalizeVenueName(name);
  if (!normalized) return "unknown";
  // Try stripping known satellite suffixes to find the parent landmark name.
  // This is a generic, destination-agnostic rule (not a city encyclopedia).
  for (const suffix of SATELLITE_SUFFIXES) {
    const suffixNorm = normalizeVenueName(suffix);
    if (suffixNorm && normalized.endsWith(suffixNorm) && normalized.length > suffixNorm.length) {
      return normalized.slice(0, -suffixNorm.length);
    }
  }
  return normalized;
}

function isPrimaryLandmarkName(name: string): boolean {
  const n = name.trim();
  // Prefer names without dash/parenthetical satellites
  if (/[-–—(（]/.test(n)) return false;
  return true;
}

function cardScore(card: PlaceCard): number {
  const rating = typeof card.rating === "number" ? card.rating : 0;
  const primaryBonus = isPrimaryLandmarkName(card.name ?? "") ? 10 : 0;
  const shortBonus = Math.max(0, 24 - (card.name?.length ?? 24)) * 0.05;
  return rating + primaryBonus + shortBonus;
}

/** Keep one card per normalized-name cluster (best score). */
export function dedupeByCluster(cards: PlaceCard[]): PlaceCard[] {
  const best = new Map<string, PlaceCard>();
  for (const card of cards) {
    const key = attractionClusterKey(card.name ?? "");
    const prev = best.get(key);
    if (!prev || cardScore(card) > cardScore(prev)) {
      best.set(key, card);
    }
  }
  return [...best.values()];
}

/**
 * After dedupe, keep at most `maxPerCluster` cards per coarse cluster,
 * preserving input order (nominate order). Extra same-cluster cards drop
 * so later day-trip / other-cluster hits can fill the chip limit.
 */
export function capClusterOccupancy(
  cards: PlaceCard[],
  maxPerCluster = 3,
): PlaceCard[] {
  const cap = Math.max(1, Math.floor(maxPerCluster));
  const counts = new Map<string, number>();
  const out: PlaceCard[] = [];
  for (const card of cards) {
    const key = attractionClusterKey(
      card.nominated_name?.trim() || card.name || "",
    );
    const n = counts.get(key) ?? 0;
    if (n >= cap) continue;
    counts.set(key, n + 1);
    out.push(card);
  }
  return out;
}

/**
 * ADR-042 Update: must-see diversity reorder removed (was Xi'an-specific).
 * Now a stable pass-through; order is preserved as discovered.
 */
export function ensureMustSeeDiversity(cards: PlaceCard[]): PlaceCard[] {
  return cards;
}

/** Light restaurant stem dedupe: strip branch parentheses then unique. */
export function dedupeRestaurantsByStem(cards: PlaceCard[]): PlaceCard[] {
  const best = new Map<string, PlaceCard>();
  for (const card of cards) {
    const stem = (card.name ?? "")
      .replace(/[（(][^）)]*[）)]/g, "")
      .trim();
    const key = normalizeVenueName(stem) || normalizeVenueName(card.name ?? "");
    if (!key) continue;
    const prev = best.get(key);
    if (!prev || cardScore(card) > cardScore(prev)) {
      best.set(key, card);
    }
  }
  return [...best.values()];
}
