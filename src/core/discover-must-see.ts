/**
 * Destination-agnostic must-see search queries for discover_places.
 *
 * ADR-042 Update (2026-08-23): the per-city CATALOG has been emptied. Source
 * code must contain no city POI knowledge. Must-see identification now comes
 * from LLM inference over the discovered candidate pool
 * (`discover-must-see-llm.ts`), not from a hardcoded encyclopedia.
 *
 * The exported functions remain as no-op stubs so query-assembler / ranking
 * keep working without city-specific boosts. They always return empty.
 */

export type MustSeeEntry = {
  tokens: string[];
  attractionQueries: string[];
  restaurantQueries: string[];
  localDiningTokens?: string[];
};

/** Empty — ADR-042 Update. No city POI knowledge in source. */
const CATALOG: Record<string, MustSeeEntry> = {};

export function mustSeeEntryForCity(_city: string): MustSeeEntry | null {
  return null;
}

/** ADR-042 Update: returns [] (catalog emptied). */
export function mustSeeCatalogKeys(): string[] {
  return Object.keys(CATALOG);
}

export function mustSeeQueriesForCity(_city: string): {
  attractions: string[];
  restaurants: string[];
} {
  return { attractions: [], restaurants: [] };
}

export function mustSeeTokensForCity(_city: string): string[] {
  return [];
}

/** Local dining name tokens for Arm A restaurant ranking — empty (ADR-042 Update). */
export function localDiningTokensForCity(_city: string): string[] {
  return [];
}

/** True if card name matches any must-see token (case-insensitive for Latin). */
export function nameMatchesMustSeeTokens(name: string, tokens: string[]): boolean {
  if (!tokens.length || !name.trim()) return false;
  const n = name.trim();
  const nLower = n.toLowerCase();
  return tokens.some((t) => {
    const tok = t.trim();
    if (!tok) return false;
    if (/[\u4e00-\u9fff]/.test(tok)) return n.includes(tok);
    return nLower.includes(tok.toLowerCase());
  });
}
