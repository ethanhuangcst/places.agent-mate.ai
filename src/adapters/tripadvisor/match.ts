export const NAME_MATCH_MIN = 0.55;

export function normalizePlaceName(name: string): string {
  return name
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(normalized: string): string[] {
  if (!normalized) return [];
  if (/\s/.test(normalized)) return normalized.split(" ").filter(Boolean);
  if (/[\u3040-\u30ff\u3400-\u9fff]/.test(normalized) && normalized.length >= 2) {
    const grams: string[] = [];
    for (let i = 0; i < normalized.length - 1; i++) {
      grams.push(normalized.slice(i, i + 2));
    }
    return grams;
  }
  return [normalized];
}

export function nameMatchScore(cardName: string, terraName: string): number {
  const a = normalizePlaceName(cardName);
  const b = normalizePlaceName(terraName);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.85;
  const ta = new Set(tokens(a));
  const tb = new Set(tokens(b));
  let inter = 0;
  for (const t of ta) {
    if (tb.has(t)) inter += 1;
  }
  const union = ta.size + tb.size - inter;
  return union === 0 ? 0 : inter / union;
}

export function pinKey(lat: number, lng: number): string {
  return `${lat.toFixed(3)},${lng.toFixed(3)}`;
}
