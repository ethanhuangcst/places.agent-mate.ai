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

/** Destination-agnostic cluster key: normalized venue name (no city landmarks). */
export type AttractionCluster = string;

/** Coarse cluster key — normalized name only (ADR-042 Update: no city branches). */
export function attractionClusterKey(name: string): AttractionCluster {
  return normalizeVenueName(name) || "unknown";
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
