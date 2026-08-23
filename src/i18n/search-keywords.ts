import { type Locale } from "../core/locales";

type KeywordSet = Record<Locale, string>;

const KW: Record<string, KeywordSet> = {
  museum:        { EN: "museum",                CN: "博物馆",           HK: "博物館",           TW: "博物館" },
  park:          { EN: "park garden",           CN: "公园 园林",        HK: "公園 園林",        TW: "公園 園林" },
  historic:      { EN: "historic site landmark",CN: "古迹 名胜",       HK: "古跡 名勝",       TW: "古跡 名勝" },
  temple:        { EN: "temple",                CN: "寺庙",             HK: "寺廟",             TW: "寺廟" },
  gallery:       { EN: "art gallery",           CN: "美术馆",           HK: "美術館",           TW: "美術館" },
  viewpoint:     { EN: "viewpoint",             CN: "景点",             HK: "景點",             TW: "景點" },
  castle:        { EN: "castle palace monument",CN: "城堡 宫殿 纪念碑", HK: "城堡 宮殿 紀念碑", TW: "城堡 宮殿 紀念碑" },
  things_to_do:  { EN: "things to do",          CN: "好玩的",           HK: "好玩嘅",           TW: "好玩的景點" },
  restaurant:    { EN: "restaurant",            CN: "餐厅",             HK: "餐廳",             TW: "餐廳" },
  local_food:    { EN: "local food specialty",  CN: "特色美食 本地菜", HK: "特色美食 本地菜", TW: "特色美食 本地菜" },
  must_see:      { EN: "must see landmarks",    CN: "必去景点 地标",   HK: "必去景點 地標",   TW: "必去景點 地標" },
  cafe:          { EN: "cafe tea house",        CN: "咖啡馆 茶馆",     HK: "咖啡店 茶館",     TW: "咖啡廳 茶館" },
  fine_dining:   { EN: "fine dining michelin",  CN: "高端餐厅 米其林", HK: "高級餐廳 米其林", TW: "精緻餐廳 米其林" },
  budget_dining: { EN: "affordable local food", CN: "平价餐厅",        HK: "平價餐廳",        TW: "平價餐廳" },
  more_restaurant:{ EN: "more restaurants",     CN: "更多餐厅",        HK: "更多餐廳",        TW: "更多餐廳" },
  night_market:  { EN: "night market street food",CN: "夜市 小吃",     HK: "夜市 小食",       TW: "夜市 小吃" },
  brunch:        { EN: "brunch breakfast",      CN: "早午餐 早餐",     HK: "早午餐 早餐",     TW: "早午餐 早餐" },
};

/** Lookup a single keyword in the given locale. Fallback: EN. */
export function getKeyword(key: string, locale: Locale): string {
  const set = KW[key];
  if (!set) return key;
  return set[locale] ?? set.EN;
}

/** Generate attraction search queries for an area in the given locale. */
export function getAttractionQueries(area: string, locale: Locale): string[] {
  const k = (key: string) => getKeyword(key, locale);
  return [
    `${area} ${k("must_see")}`,
    `${area} ${k("museum")} ${k("historic")}`,
    `${area} ${k("castle")} ${k("gallery")} ${k("temple")}`,
    `${area} ${k("park")} ${k("viewpoint")}`,
    `${area} ${k("things_to_do")}`,
  ];
}

/** Destination-agnostic hot attraction templates (ADR-043 / ADR-042 — not a city encyclopedia). */
export function getHotAttractionQueries(area: string, locale: Locale): string[] {
  const k = (key: string) => getKeyword(key, locale);
  return [
    `${area} ${k("must_see")}`,
    `${area} top attractions landmarks`,
    `${area} famous sightseeing`,
    `${area} ${k("historic")} ${k("museum")}`,
  ];
}

/** Discover-oriented dining queries — prefer local specialty over generic restaurant. */
export function getDiscoverDiningQueries(area: string, locale: Locale): string[] {
  const k = (key: string) => getKeyword(key, locale);
  return [
    `${area} ${k("local_food")}`,
    `${area} ${k("night_market")}`,
    `${area} ${k("restaurant")}`,
  ];
}

/**
 * Generate meal search queries for an area in the given locale.
 * @param kind — "lunch" | "dinner" | "cafe"
 * @param spend — "budget" | "premium" | undefined
 * @param dayIndex — 1-based day index (for query variation)
 */
export function getMealQueries(
  area: string,
  locale: Locale,
  kind: "lunch" | "dinner" | "cafe",
  spend?: "budget" | "premium",
  dayIndex?: number,
): string[] {
  const k = (key: string) => getKeyword(key, locale);
  const suffix = dayIndex && dayIndex > 1 ? ` ${dayIndex}` : "";

  if (kind === "cafe") {
    return [
      `${area} ${k("cafe")}`,
      `${area} ${k("cafe")}${suffix}`,
    ];
  }

  const base = spend === "premium" ? k("fine_dining") : k("restaurant");
  const extra = spend === "budget" ? k("budget_dining") : k("more_restaurant");
  return [
    `${area} ${base}`,
    `${area} ${extra}${suffix}`,
  ];
}
