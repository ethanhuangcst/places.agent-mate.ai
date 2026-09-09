/**
 * L2 system ontology + L3 nominate user lines (agent-itinerary-95).
 * Field schemas stay in code (L0) — never paste PlaceCard/transit tables into L3.
 */

import type { Locale } from "./locales";

export type NominateTripPrefs = {
  trip_type?: string;
  pace?: string;
  budget?: string;
  locale?: string;
  party_size?: number;
  transit_preference?: string;
  /** Calendar bounds already known on the trip (YYYY-MM-DD). */
  bounds?: { start?: string; end?: string };
  origin_name?: string;
  must_include?: string[];
  other?: string;
};

type CatalogLocale = "EN" | "CN" | "HK" | "TW";

function catalogLocale(locale?: string): CatalogLocale {
  if (locale === "CN" || locale === "HK" || locale === "TW") return locale;
  return "EN";
}

const TRIP_TYPE: Record<string, Record<CatalogLocale, string>> = {
  family_kids: { EN: "Kids fun", CN: "亲子玩乐", HK: "親子玩樂", TW: "親子玩樂" },
  couple_romance: { EN: "Couple romance", CN: "情侣浪漫", HK: "情侶浪漫", TW: "情侶浪漫" },
  food_checkin: { EN: "Food check-in", CN: "吃喝打卡", HK: "吃喝打卡", TW: "吃喝打卡" },
  family_vacation: { EN: "Family trip", CN: "家庭度假", HK: "家庭度假", TW: "家庭度假" },
  city: { EN: "City wander", CN: "城市漫游", HK: "城市漫遊", TW: "城市漫遊" },
  couple: { EN: "Couple trip", CN: "情侣出游", HK: "情侶出遊", TW: "情侶出遊" },
  family: { EN: "Family vacation", CN: "家庭度假", HK: "家庭度假", TW: "家庭度假" },
  solo: { EN: "Solo", CN: "个人放松", HK: "個人放鬆", TW: "個人放鬆" },
  food: { EN: "Food trip", CN: "美食之旅", HK: "美食之旅", TW: "美食之旅" },
  friends: { EN: "Friends", CN: "朋友", HK: "朋友", TW: "朋友" },
  business: { EN: "Business", CN: "商务", HK: "商務", TW: "商務" },
};

const BUDGET: Record<string, Record<CatalogLocale, string>> = {
  economy: { EN: "Economy", CN: "经济", HK: "經濟", TW: "經濟" },
  budget: { EN: "Economy", CN: "经济", HK: "經濟", TW: "經濟" },
  mid: { EN: "Mid", CN: "适中", HK: "適中", TW: "適中" },
  comfort: { EN: "Comfort", CN: "舒适", HK: "舒適", TW: "舒適" },
  luxury: { EN: "Luxury", CN: "豪华", HK: "豪華", TW: "豪華" },
  premium: { EN: "Luxury", CN: "豪华", HK: "豪華", TW: "豪華" },
};

const PACE: Record<string, Record<CatalogLocale, string>> = {
  tight: { EN: "Tight", CN: "紧凑节奏", HK: "緊湊節奏", TW: "緊湊節奏" },
  medium: { EN: "Balanced", CN: "适中节奏", HK: "適中節奏", TW: "適中節奏" },
  relaxed: { EN: "Relaxed", CN: "轻松节奏", HK: "輕鬆節奏", TW: "輕鬆節奏" },
};

const TRANSIT: Record<string, Record<CatalogLocale, string>> = {
  transit_walk: {
    EN: "Transit / metro first",
    CN: "公交地铁优先",
    HK: "公交地鐵優先",
    TW: "公交地鐵優先",
  },
  drive_walk: {
    EN: "Taxi first",
    CN: "打车优先",
    HK: "打車優先",
    TW: "打車優先",
  },
};

function resolveCatalog(
  table: Record<string, Record<CatalogLocale, string>>,
  raw: string | undefined,
  loc: CatalogLocale,
): string {
  const v = (raw ?? "").trim();
  if (!v) return "";
  const key = v.toLowerCase().replace(/\s+/g, "_");
  const hit = table[key] ?? table[v];
  if (hit) return hit[loc];
  return v;
}

/** L2 — short ontology for system prompts (not the nominate user line). */
export function placesOntologyPrompt(locale: Locale | string = "EN"): string {
  const loc = catalogLocale(locale);
  if (loc === "CN") {
    return [
      "[#起点] 每天行程的住宿或起点，必须是已验真、地图上可查的一个点。",
      "[#景点] 可落到地图上的一个点，不是整座湖、整座山、整座古城。",
      "[#餐厅] 午餐或晚餐的店，必须是地图上可查的一个点。",
      "[#交通] 上一点到下一点之间的移动；时长只来自 directions 或系统启发式。",
      "禁止编造坐标、商家编号（native_id）和交通耗时。",
      "坐标与 sources 只来自地图工具结果。",
    ].join("\n");
  }
  if (loc === "HK" || loc === "TW") {
    return [
      "[#起點] 每天行程的住宿或起點，必須是已驗真、地圖上可查的一個點。",
      "[#景點] 可落到地圖上的一個點，不是整座湖、整座山、整座古城。",
      "[#餐廳] 午餐或晚餐的店，必須是地圖上可查的一個點。",
      "[#交通] 上一點到下一點之間的移動；時長只來自 directions 或系統啟發式。",
      "禁止編造座標、商家編號（native_id）和交通耗時。",
      "座標與 sources 只來自地圖工具結果。",
    ].join("\n");
  }
  return [
    "[#origin] Daily stay / start — a verified map pin.",
    "[#attraction] A map pin you can visit, not an entire lake, mountain, or old town.",
    "[#restaurant] A lunch/dinner venue that pins on the map.",
    "[#transit] Move between two pins; durations only from directions or system heuristics.",
    "Do not invent coordinates, native_id, or travel times.",
    "Coordinates and sources come only from map tool results.",
  ].join("\n");
}

function isoDate(raw?: string): string {
  const s = (raw ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}

function formatNominateDateBit(
  bounds: { start?: string; end?: string } | undefined,
  loc: CatalogLocale,
): string {
  const start = isoDate(bounds?.start);
  const end = isoDate(bounds?.end);
  if (!start && !end) return "";
  if (start && end && start !== end) {
    return loc === "EN" ? `${start} to ${end}` : `${start}至${end}`;
  }
  return start || end;
}

/** Calendar month + NH meteorological season. Destination-agnostic (ADR-042). */
export function formatNominateSeasonBit(
  bounds: { start?: string; end?: string } | undefined,
  loc: CatalogLocale,
): string {
  const start = isoDate(bounds?.start);
  if (!start) return "";
  const month = Number(start.slice(5, 7));
  if (!Number.isFinite(month) || month < 1 || month > 12) return "";
  const season =
    month === 12 || month <= 2
      ? { EN: "winter", CN: "冬季", HK: "冬季", TW: "冬季" }
      : month <= 5
        ? { EN: "spring", CN: "春季", HK: "春季", TW: "春季" }
        : month <= 8
          ? { EN: "summer", CN: "夏季", HK: "夏季", TW: "夏季" }
          : { EN: "autumn", CN: "秋季", HK: "秋季", TW: "秋季" };
  const monthBit =
    loc === "EN" ? start.slice(0, 7) : `${month}月`;
  return `${monthBit} ${season[loc]}`;
}

function formatPrefixedBit(
  raw: string | undefined,
  loc: CatalogLocale,
  labels: Record<CatalogLocale, string>,
): string {
  const v = (raw ?? "").trim();
  if (!v) return "";
  return `${labels[loc]} ${v}`;
}

function formatMustIncludeBit(
  names: string[] | undefined,
  loc: CatalogLocale,
): string {
  const list = (names ?? []).map((n) => n.trim()).filter(Boolean);
  if (!list.length) return "";
  const joined = list.join(loc === "EN" ? ", " : "、");
  const label =
    loc === "EN" ? "must-see" : loc === "CN" ? "必去" : "必去";
  return `${label} ${joined}`;
}

const MAX_NOMINATE_NAME_CHARS = 40;

/** Strip decorations so the leftover can be sent to search_places. */
export function sanitizeNominateName(raw: string): string {
  let s = raw.trim();
  s = s.replace(/^[-*•]\s+/, "").replace(/^\d+[.)、]\s*/, "");
  s = s.replace(/（[^）]*）/g, "").replace(/\([^)]*\)/g, "");
  s = s.replace(/[（）()]+/g, "").trim();
  return s;
}

export function isNominateProseLine(s: string): boolean {
  const t = s.trim();
  if (!t) return true;
  if (t.length > MAX_NOMINATE_NAME_CHARS) return true;
  if (/^#{1,6}\s/.test(t)) return true;
  if (/^(以下|注[:：]|說明|说明|Note\b|Preamble\b)/i.test(t)) return true;
  if (/必去推荐|must-see|推荐（|recommend/i.test(t) && t.length < 80 && !/[，,]/.test(t)) {
    return true;
  }
  return false;
}

/**
 * L3 nominate user message — pinable names only, no itinerary, no invented coords.
 * `limit` is ignored in the prompt (chips truncate in code); kept for call-site compat.
 * Known trip fields present on the call must appear on the parameter line (ADR-059).
 */
export function buildNominateMustSeeUserMessage(
  city: string,
  _limit: number,
  numDays: number,
  prefs?: NominateTripPrefs,
): string {
  const loc = catalogLocale(prefs?.locale);
  const days =
    Number.isFinite(numDays) && numDays > 0 ? Math.round(numDays) : undefined;
  const party =
    prefs?.party_size && prefs.party_size > 0 ? Math.round(prefs.party_size) : undefined;
  const type = resolveCatalog(TRIP_TYPE, prefs?.trip_type, loc);
  const budget = resolveCatalog(BUDGET, prefs?.budget, loc);
  const pace = resolveCatalog(PACE, prefs?.pace, loc);
  const transit = resolveCatalog(TRANSIT, prefs?.transit_preference, loc);
  const dayBit =
    days != null ? (loc === "EN" ? `${days} days` : `${days}天`) : "";
  const partyBit =
    party != null ? (loc === "EN" ? `${party} people` : `${party}人`) : "";
  const dateBit = formatNominateDateBit(prefs?.bounds, loc);
  const seasonBit = formatNominateSeasonBit(prefs?.bounds, loc);
  const originBit = formatPrefixedBit(
    prefs?.origin_name,
    loc,
    { EN: "origin", CN: "起点", HK: "起點", TW: "起點" },
  );
  const mustBit = formatMustIncludeBit(prefs?.must_include, loc);
  const otherBit = (prefs?.other ?? "").trim();
  const tripLine = [
    city.trim(),
    dayBit,
    dateBit,
    seasonBit,
    partyBit,
    type,
    budget,
    pace,
    transit,
    originBit,
    mustBit,
    otherBit,
  ]
    .filter(Boolean)
    .join(" ");
  const nearby =
    days != null && days >= 3
      ? loc === "EN"
        ? " When the destination has well-known nearby places reachable as a day or half-day trip, include at least one."
        : loc === "HK"
          ? "目的地近郊有可安排一日遊/半日遊的知名必去地時，應至少列入一個。"
          : loc === "TW"
            ? "目的地近郊有可安排一日遊/半日遊的知名必去地時，應至少列入一個。"
            : "目的地近郊有可安排一日游/半日游的知名必去地时，应至少列入一个。"
      : "";
  const seasonRule = seasonBit
    ? loc === "EN"
      ? " Fit the travel month and season; do not list seasonal-only sights that are not typical or not visible then."
      : loc === "HK" || loc === "TW"
        ? "符合出行月份與季節，不要列該季看不到或不宜遊的季節專屬景。"
        : "符合出行月份与季节，不要列该季看不到或不宜游的季节专属景。"
    : "";
  const mix =
    loc === "EN"
      ? " Do not cluster all in one neighborhood or around one landmark."
      : loc === "HK" || loc === "TW"
        ? "不要全集中在同一片區域（如同一湖周邊、同一街區）。"
        : "不要全集中在同一片区域（如同一湖周边、同一街区）。";

  if (loc === "EN") {
    return (
      `Recommend must-see places for this trip. Output a JSON array of short place names only — ` +
      `the same words a map search box can use. No parentheses, no explanations, no preamble or footer. ` +
      `Do not build an itinerary. Do not invent coordinates or place IDs. ` +
      `Use specific venue names (tower, monastery, castle, park gate), not a whole lake, street, or new-town district. No routes, events, or parenthetical bundles.${seasonRule}${nearby}${mix}\n` +
      tripLine
    );
  }
  if (loc === "HK") {
    return (
      `為以下行程推薦必去地。只輸出 JSON 字串陣列，每項是可在地圖搜尋框原樣搜到的短地名` +
      `（不要括號、不要說明、不要開頭結尾散文）。不要安排行程，不要編造座標或商家編號。` +
      `寫寺、塔、橋、園等專名，不要只寫整座湖、整條街、整座新城。不要線路（如電車線路）、活動、打包描述。${seasonRule}${nearby}${mix}\n` +
      tripLine
    );
  }
  if (loc === "TW") {
    return (
      `為以下行程推薦必去地。只輸出 JSON 字串陣列，每項是可在地圖搜尋框原樣搜到的短地名` +
      `（不要括號、不要說明、不要開頭結尾散文）。不要安排行程，不要編造座標或商家編號。` +
      `寫寺、塔、橋、園等專名，不要只寫整座湖、整條街、整座新城。不要線路（如電車線路）、活動、打包描述。${seasonRule}${nearby}${mix}\n` +
      tripLine
    );
  }
  return (
    `为以下行程推荐必去地。只输出 JSON 字符串数组，每项是可在地图搜索框原样搜到的短地名` +
      `（不要括号、不要说明、不要开头结尾散文）。不要安排行程，不要编造坐标或商家编号。` +
      `写寺、塔、桥、园等专名，不要只写整座湖、整条街、整座新城。不要线路（如电车线路）、活动、打包描述。${seasonRule}${nearby}${mix}\n` +
    tripLine
  );
}
