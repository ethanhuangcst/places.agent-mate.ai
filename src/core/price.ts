/** Google Places API priceLevel enum → normalized symbol. */
const GOOGLE_PRICE_MAP: Record<string, string> = {
  PRICE_LEVEL_FREE: "FREE",
  PRICE_LEVEL_INEXPENSIVE: "$",
  PRICE_LEVEL_MODERATE: "$$",
  PRICE_LEVEL_EXPENSIVE: "$$$",
  PRICE_LEVEL_VERY_EXPENSIVE: "$$$$",
};

export function normalizeGooglePrice(raw?: string): string | undefined {
  if (!raw) return undefined;
  return GOOGLE_PRICE_MAP[raw];
}

/** AMAP biz_ext.cost (人均消费, CNY) → normalized symbol + raw value. */
export function normalizeAmapCost(
  cost?: number,
): { price_level?: string; price_per_person?: number } {
  if (cost == null || !Number.isFinite(cost) || cost <= 0) return {};
  let level: string;
  if (cost < 50) level = "$";
  else if (cost < 150) level = "$$";
  else if (cost < 400) level = "$$$";
  else level = "$$$$";
  return { price_level: level, price_per_person: cost };
}
