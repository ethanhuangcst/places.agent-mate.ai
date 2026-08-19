const CUISINE_MAP: Record<string, string> = {
  barbecue: "烧烤",
  bbq: "烧烤",
  hotpot: "火锅",
  japanese: "日料",
};

function hasCjk(value: string): boolean {
  return /[\u3040-\u30ff\u3400-\u9fff]/.test(value);
}

export function mapCuisine(cuisine?: string): string | undefined {
  const trimmed = cuisine?.trim();
  if (!trimmed) return undefined;
  if (hasCjk(trimmed)) return trimmed;
  return CUISINE_MAP[trimmed.toLowerCase()] ?? trimmed;
}

export function amapKeywords(input: { query?: string; cuisine?: string }): string {
  const parts = [input.query?.trim(), mapCuisine(input.cuisine)].filter(
    (part): part is string => Boolean(part),
  );
  return [...new Set(parts)].join(" ");
}
