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
  /** Daily default start time (HH:MM); ADR-059 / TC-T3-110a-07. */
  start_time?: string;
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
  loc: CatalogLocale | string,
): string {
  const catalogLoc = catalogLocale(loc);
  const season = nominateSeasonFromBounds(bounds);
  const start = isoDate(bounds?.start);
  if (!start || !season) return "";
  const month = Number(start.slice(5, 7));
  const seasonLabel =
    season === "winter"
      ? { EN: "winter", CN: "冬季", HK: "冬季", TW: "冬季" }
      : season === "spring"
        ? { EN: "spring", CN: "春季", HK: "春季", TW: "春季" }
        : season === "summer"
          ? { EN: "summer", CN: "夏季", HK: "夏季", TW: "夏季" }
          : { EN: "autumn", CN: "秋季", HK: "秋季", TW: "秋季" };
  const monthBit =
    catalogLoc === "EN" ? start.slice(0, 7) : `${month}月`;
  return `${monthBit} ${seasonLabel[catalogLoc]}`;
}

export type NominateSeason = "winter" | "spring" | "summer" | "autumn";

/** NH meteorological season from trip start date (ADR-042 — no city tables). */
export function nominateSeasonFromBounds(
  bounds: { start?: string; end?: string } | undefined,
): NominateSeason | null {
  const start = isoDate(bounds?.start);
  if (!start) return null;
  const month = Number(start.slice(5, 7));
  if (!Number.isFinite(month) || month < 1 || month > 12) return null;
  if (month === 12 || month <= 2) return "winter";
  if (month <= 5) return "spring";
  if (month <= 8) return "summer";
  return "autumn";
}

/**
 * Drop season-locked poetic / ice names when travel season does not match.
 * Marker vocabulary only — not a per-city POI list (ADR-042).
 */
export function isSeasonMismatchedNominateName(
  name: string,
  bounds: { start?: string; end?: string } | undefined,
): boolean {
  const season = nominateSeasonFromBounds(bounds);
  if (!season) return false;
  const n = name.trim();
  if (!n) return false;
  if (season !== "winter") {
    if (/残雪|雾凇|冰雕|冰雪|雪乡|滑雪/.test(n)) return true;
    if (/ice\s*sculpture|ski\s*resort|snow\s*festival/i.test(n)) return true;
  }
  if (season !== "spring" && /春晓/.test(n)) return true;
  if (season !== "summer" && /风荷/.test(n)) return true;
  if (season !== "autumn" && /秋月/.test(n)) return true;
  return false;
}

/** Season guidance for nominate prompts. Skeleton (110b / 2a-none) does not inject this. */
export function formatNominateSeasonRule(
  seasonBit: string,
  locale?: string,
): string {
  if (!seasonBit.trim()) return "";
  const loc = catalogLocale(locale);
  if (loc === "EN") {
    return "Fit the travel month and season; prefer year-round experiences and avoid framing seasonal-only sights as must-dos when they are not typical then. Do not drop names that are already in the candidate pool solely for season.";
  }
  if (loc === "HK" || loc === "TW") {
    return "符合出行月份與季節；偏好四季可遊體驗，避免強調該季看不到或不宜遊的季節專屬表述。候選池內已有名稱不要因季節硬刪。";
  }
  return "符合出行月份与季节；偏好四季可游体验，避免强调该季看不到或不宜游的季节专属表述。候选池内已有名称不要因季节硬删。";
}

export type SkeletonTripPrefs = NominateTripPrefs & {
  start_time?: string;
};

/**
 * Structured traveler block for skeleton prompts (agent-itinerary-102 / 110b).
 * Reuses nominate catalog labels + season bit as context only (2a-none: no season rule).
 * `other` uses plain 「其他」/Other label (no preference-only tag).
 * Empty fields omitted. Returns "" when nothing to say.
 */
export function formatTripPrefsForPrompt(prefs?: SkeletonTripPrefs): string {
  if (!prefs) return "";
  const loc = catalogLocale(prefs.locale);
  const lines: string[] = [];
  const seasonBit = formatNominateSeasonBit(prefs.bounds, loc);
  if (seasonBit) {
    lines.push(seasonBit);
  }
  const dateBit = formatNominateDateBit(prefs.bounds, loc);
  if (dateBit) {
    lines.push(loc === "EN" ? `Dates: ${dateBit}` : `日期：${dateBit}`);
  }
  const type = resolveCatalog(TRIP_TYPE, prefs.trip_type, loc);
  if (type) {
    lines.push(
      loc === "EN" ? `Trip type: ${type}` : `行程类型：${type}`,
    );
  }
  const kidsBlob = `${prefs.trip_type ?? ""} ${prefs.other ?? ""}`;
  const wantsKidsRank =
    /family_kids|亲子|兒童|儿童|歲|岁|kids|children/i.test(kidsBlob);
  if (wantsKidsRank) {
    lines.push(
      loc === "EN"
        ? "Among candidate-pool cards, prefer names suggesting parks, aquariums, zoos, or amusement — do not invent off-pool names."
        : "在候选池卡片中，优先名称像公园/乐园/水族馆/动物园/游乐场的景点——不要发明池外地名。",
    );
  }
  if (prefs.party_size && prefs.party_size > 0) {
    const n = Math.round(prefs.party_size);
    lines.push(loc === "EN" ? `Party size: ${n}` : `人数：${n}人`);
  }
  const budget = resolveCatalog(BUDGET, prefs.budget, loc);
  if (budget) {
    lines.push(loc === "EN" ? `Budget: ${budget}` : `预算：${budget}`);
  }
  const transit = resolveCatalog(TRANSIT, prefs.transit_preference, loc);
  if (transit) {
    lines.push(
      loc === "EN"
        ? `Transit: ${transit} — preference for later fill; do not add transit fields to the skeleton.`
        : `交通：${transit} — 后续填细节时的偏好；不要在骨架 JSON 里加交通字段。`,
    );
  }
  const pace = resolveCatalog(PACE, prefs.pace, loc);
  if (pace) {
    lines.push(loc === "EN" ? `Pace: ${pace}` : `节奏：${pace}`);
  }
  if (prefs.origin_name?.trim()) {
    lines.push(
      loc === "EN"
        ? `Origin: ${prefs.origin_name.trim()}`
        : `起点：${prefs.origin_name.trim()}`,
    );
  }
  if (prefs.start_time?.trim()) {
    lines.push(
      loc === "EN"
        ? `Start time: ${prefs.start_time.trim()} — daily preference for later fill; do not emit start_time in the skeleton JSON.`
        : `出发时间：${prefs.start_time.trim()} — 后续填细节时的每日出发偏好；不要在骨架 JSON 里写 start_time。`,
    );
  }
  const other = (prefs.other ?? "").trim();
  if (other) {
    lines.push(
      loc === "EN"
        ? `Other: ${other} — prefer matching cards from the candidate pool; do not invent place names.`
        : `其他：${other} — 优先匹配候选池中的景点卡，不要发明地名。`,
    );
  }
  if (!lines.length) return "";
  const header =
    loc === "EN" ? "Traveler preferences:" : "旅人偏好：";
  return `${header}\n${lines.join("\n")}`;
}

/**
 * 110e — 11-field constraint glossary for the skeleton prompt.
 * Explains each present takeoff condition's effect on itinerary boundaries so
 * the LLM can reason about density (esp. pace as rhythm, not a hard number).
 * i18n (CN/HK/TW/EN), key-based, destination-agnostic (ADR-042/066).
 * Returns "" when no conditions are present.
 */
export function buildConstraintGlossary(
  prefs: NominateTripPrefs,
  locale: string,
  numDays?: number,
): string {
  const loc = catalogLocale(locale);
  const lines: string[] = [];
  const header =
    loc === "EN"
      ? "How each trip condition shapes the itinerary:"
      : loc === "HK" || loc === "TW"
        ? "各行程條件對行程邊界的影響："
        : "各行程条件对行程边界的影响：";

  const add = (cond: boolean, text: string) => {
    if (cond) lines.push(text);
  };

  // 1. destination — always present (city is the search anchor).
  add(true, destGlossaryLine(loc));

  // 2. tripType → venue category priority (ADR-066 venue-type, not city POI).
  const type = resolveCatalog(TRIP_TYPE, prefs.trip_type, loc);
  add(Boolean(type), tripTypeGlossaryLine(type, loc));

  // 3. budget — affects restaurant tier in fill, not skeleton density.
  const budget = resolveCatalog(BUDGET, prefs.budget, loc);
  add(Boolean(budget), budgetGlossaryLine(budget, loc));

  // 4. startDate → season.
  const seasonBit = formatNominateSeasonBit(prefs.bounds, loc);
  add(Boolean(seasonBit), seasonGlossaryLine(seasonBit, loc));

  // 5. days → near day-trip when >= 3; no cross-day reuse.
  const days =
    Number.isFinite(numDays) && (numDays ?? 0) > 0 ? Math.round(numDays!) : undefined;
  add(days != null, daysGlossaryLine(days!, loc));

  // 6. partySize.
  const party =
    prefs.party_size && prefs.party_size > 0 ? Math.round(prefs.party_size) : undefined;
  add(party != null, partyGlossaryLine(party!, loc));

  // 7. pace — rhythm semantics, not a hard quota (the key 110e change).
  const pace = resolveCatalog(PACE, prefs.pace, loc);
  add(Boolean(pace), paceGlossaryLine(pace, loc));

  // 8. transit — affects leg feasibility in fill, not skeleton order.
  const transit = resolveCatalog(TRANSIT, prefs.transit_preference, loc);
  add(Boolean(transit), transitGlossaryLine(transit, loc));

  // 9. startTime — daily default; affects how many stops fit.
  add(Boolean(prefs.start_time?.trim()), startTimeGlossaryLine(prefs.start_time!, loc));

  // 10. origin — daily starting point; first stop clusters near it.
  add(Boolean(prefs.origin_name?.trim()), originGlossaryLine(prefs.origin_name!, loc));

  // 11. other — free constraints; prefer pool matches, do not invent names.
  add(Boolean(prefs.other?.trim()), otherGlossaryLine(prefs.other!, loc));

  if (!lines.length) return "";
  return `${header}\n${lines.join("\n")}`;
}

function destGlossaryLine(loc: CatalogLocale): string {
  if (loc === "EN")
    return "- Destination: the search anchor and geo radius (<=80km); overseas cities use local-language or English searchable names.";
  if (loc === "HK" || loc === "TW")
    return "- 目的地：搜尋錨點與地理半徑（≤80km）；海外城市用當地語言或英文可搜專名。";
  return "- 目的地：搜索锚点与地理半径（≤80km）；海外城市用当地语言或英文可搜专名。";
}

function tripTypeGlossaryLine(type: string, loc: CatalogLocale): string {
  if (loc === "EN")
    return `- Trip type (${type}): prefer matching venue categories — kids→theme parks/zoo/aquarium/museum; couple→viewpoints/gardens/palaces; food→markets/famous restaurants; history→museums/ruins; anime→themed districts. Do not invent a per-city POI list.`;
  if (loc === "HK" || loc === "TW")
    return `- 行程類型（${type}）：優先匹配場館類別——親子→樂園/動物園/水族館/博物館；情侶→觀景台/花園/宮殿；美食→市場/老字號；歷史→博物館/遺址；動漫→主題街區。不要發明城市 POI 名錄。`;
  return `- 行程类型（${type}）：优先匹配场馆类别——亲子→乐园/动物园/水族馆/博物馆；情侣→观景台/花园/宫殿；美食→市场/老字号；历史→博物馆/遗址；动漫→主题街区。不要发明城市 POI 名录。`;
}

function budgetGlossaryLine(budget: string, loc: CatalogLocale): string {
  if (loc === "EN")
    return `- Budget (${budget}): affects restaurant and experience tier during fill; does not set attraction stop count.`;
  if (loc === "HK" || loc === "TW")
    return `- 預算（${budget}）：影響填細節時的餐廳與體驗檔次；不決定景點數。`;
  return `- 预算（${budget}）：影响填细节时的餐厅与体验档次；不决定景点数。`;
}

function seasonGlossaryLine(seasonBit: string, loc: CatalogLocale): string {
  if (loc === "EN")
    return `- Season (${seasonBit}): avoid seasonal-only sights not visible/typical then (e.g. residual-snow or lotus names off-season).`;
  if (loc === "HK" || loc === "TW")
    return `- 季節（${seasonBit}）：避免該季看不到或不宜遊的季節專屬景（如非冬季的殘雪、非夏季的荷景）。`;
  return `- 季节（${seasonBit}）：避免该季看不到或不宜游的季节专属景（如非冬季的残雪、非夏季的荷景）。`;
}

function daysGlossaryLine(days: number, loc: CatalogLocale): string {
  if (loc === "EN")
    return `- Days (${days}): when >= 3, include at least one reachable near day-trip; do not reuse the same attraction across days.`;
  if (loc === "HK" || loc === "TW")
    return `- 天數（${days}天）：≥3 天應含至少一個可達近郊一日遊；同一景點跨日不重複使用。`;
  return `- 天数（${days}天）：≥3 天应含至少一个可达近郊一日游；同一景点跨日不重复使用。`;
}

function partyGlossaryLine(party: number, loc: CatalogLocale): string {
  if (loc === "EN")
    return `- Party size (${party}): group composition affects venue suitability (young kids / seniors / large groups may avoid high-intensity climbs).`;
  if (loc === "HK" || loc === "TW")
    return `- 人數（${party}人）：團體規模影響場地適合度（幼兒/長者/大團避開高強度爬升）。`;
  return `- 人数（${party}人）：团体规模影响场地适合度（幼儿/长者/大团避开高强度爬升）。`;
}

function paceGlossaryLine(pace: string, loc: CatalogLocale): string {
  if (loc === "EN")
    return `- Pace (${pace}): a rhythm guide, not a hard quota — tight ~5–6 stops/day, medium ~3–5, relaxed ~2–3. A theme park / resort / far day-trip may occupy a whole day with a single stop; do not pad it with unrelated city POIs.`;
  if (loc === "HK" || loc === "TW")
    return `- 節奏（${pace}）：動線節奏指引，非硬性配額——緊湊約5–6站/天、適中約3–5、輕鬆約2–3。主題樂園/度假區/遠郊一日遊可獨占一天只排一站，不要塞無關城市景點湊數。`;
  return `- 节奏（${pace}）：动线节奏指引，非硬性配额——紧凑约5–6站/天、适中约3–5、轻松约2–3。主题乐园/度假区/远郊一日游可独占一天只排一站，不要塞无关城市景点凑数。`;
}

function transitGlossaryLine(transit: string, loc: CatalogLocale): string {
  if (loc === "EN")
    return `- Transit (${transit}): affects leg feasibility between stops during fill; does not decide skeleton order.`;
  if (loc === "HK" || loc === "TW")
    return `- 交通（${transit}）：影響填細節時站間腿段可行性；不決定骨架順序。`;
  return `- 交通（${transit}）：影响填细节时站间腿段可行性；不决定骨架顺序。`;
}

function startTimeGlossaryLine(start: string, loc: CatalogLocale): string {
  if (loc === "EN")
    return `- Start time (${start}): daily default departure; a later start means fewer stops fit that day.`;
  if (loc === "HK" || loc === "TW")
    return `- 出發時間（${start}）：每日默認出發；晚出發則當天能容納的景點更少。`;
  return `- 出发时间（${start}）：每日默认出发；晚出发则当天能容纳的景点更少。`;
}

function originGlossaryLine(origin: string, loc: CatalogLocale): string {
  if (loc === "EN")
    return `- Origin (${origin}): daily starting point; the first stop clusters near it.`;
  if (loc === "HK" || loc === "TW")
    return `- 起點（${origin}）：每日起點；首站聚在起點附近。`;
  return `- 起点（${origin}）：每日起点；首站聚在起点附近。`;
}

function otherGlossaryLine(other: string, loc: CatalogLocale): string {
  if (loc === "EN")
    return `- Other (${other}): free constraints; prefer matching candidate-pool cards, do not invent place names.`;
  if (loc === "HK" || loc === "TW")
    return `- 其他（${other}）：自由約束；優先匹配候選池景點卡，不要發明地名。`;
  return `- 其他（${other}）：自由约束；优先匹配候选池景点卡，不要发明地名。`;
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

/** True when city name contains CJK — used for destination-language nominate hints. */
export function cityNameHasCjk(city: string): boolean {
  return /[\u3040-\u30ff\u3400-\u9fff]/.test(city.trim());
}

/**
 * Overseas destinations (incl. Chinese transliterations) need map-searchable local/English names.
 * Frozen destination-language routing list — not a city→POI encyclopedia (ADR-042).
 */
const OVERSEAS_CJK_CITY =
  /里斯本|东京|東京|大阪|京都|巴黎|伦敦|倫敦|纽约|紐約|罗马|羅馬|威尼斯|佛罗伦萨|佛羅倫斯|巴塞罗那|马德里|馬德里|柏林|慕尼黑|维也纳|維也納|布拉格|阿姆斯特丹|曼谷|新加坡|吉隆坡|悉尼|墨尔本|墨爾本|首尔|首爾|釜山|迪拜|开罗|開羅|伊斯坦布尔|伊斯坦堡|莫斯科|温哥华|溫哥華|多伦多|多倫多|洛杉矶|洛杉磯|旧金山|舊金山|西雅图|西雅圖|芝加哥|波士顿|波士頓|迈阿密|邁阿密|金边|金邊|河内|河內|胡志明|马尼拉|馬尼拉|雅加达|雅加達|巴厘|峇里|普吉|清迈|清邁|暹粒/u;

export function needsDestLanguageHint(city: string): boolean {
  const c = city.trim();
  if (!c) return false;
  if (!cityNameHasCjk(c)) return true;
  return OVERSEAS_CJK_CITY.test(c);
}

/**
 * Non-domestic destinations need map-searchable local/English names even when UI locale is CN.
 */
export function destLanguageHint(city: string, loc: CatalogLocale | string): string {
  if (!needsDestLanguageHint(city)) return "";
  const catalogLoc = catalogLocale(loc);
  if (catalogLoc === "EN") {
    return " Use place names searchable in the destination's local language or English — not translated Chinese names that maps cannot find.";
  }
  if (catalogLoc === "HK" || catalogLoc === "TW") {
    return "海外目的地請用當地語言或英文可搜專名，不要用地圖搜不到的中文譯名。";
  }
  return "海外目的地请用当地语言或英文可搜专名，不要用地图搜不到的中文译名。";
}

/**
 * Dynamic theme hint from trip_type + other (venue categories only — ADR-042/066).
 */
export function buildThemeHint(
  tripType: string | undefined,
  other: string | undefined,
  loc: CatalogLocale | string,
): string {
  const catalogLoc = catalogLocale(loc);
  const typeKey = (tripType ?? "").trim().toLowerCase().replace(/\s+/g, "_");
  const blob = `${tripType ?? ""} ${other ?? ""}`;
  const wantsKids =
    typeKey === "family_kids" ||
    /亲子|兒童|儿童|歲|岁|kids|children|family_kids/i.test(blob);
  const wantsCouple =
    typeKey === "couple_romance" ||
    typeKey === "couple" ||
    /情侣|情侶|浪漫|couple|romance/i.test(blob);
  const wantsFood =
    typeKey === "food_checkin" ||
    typeKey === "food" ||
    /吃喝|美食|food_checkin|food\s*check/i.test(blob);
  const wantsHistory = /历史|歷史|historic|heritage|古迹/i.test(blob);
  const wantsAnime = /动漫|動漫|anime|otaku|手办|吉卜力|宝可梦/i.test(blob);

  if (catalogLoc === "EN") {
    if (wantsKids) {
      return " Prefer places that match a kids trip first: theme parks, zoos, aquariums, museums; then add classic city sights. Do not invent a per-city list.";
    }
    if (wantsCouple) {
      return " Prefer places that match a couple / romance trip first: viewpoints, palaces, gardens, romantic landmarks; then add classic city sights. Do not invent a per-city list.";
    }
    if (wantsFood) {
      return " Prefer places that match a food trip first: markets, food streets, famous restaurants; then add classic city sights. Do not invent a per-city list.";
    }
    if (wantsHistory) {
      return " Prefer places that match a history-focused trip first: museums, ruins, historic walls, monuments; then add classic city sights. Do not invent a per-city list.";
    }
    if (wantsAnime) {
      return " Prefer places that match an anime / otaku trip first: anime districts, character museums, merchandise streets, themed attractions; then add classic city sights. Do not invent a per-city list.";
    }
    return " Prefer places that match the trip type and stated preferences first, then add classic city sights. Do not invent a per-city list.";
  }
  if (catalogLoc === "HK" || catalogLoc === "TW") {
    if (wantsKids) {
      return "優先提名親子行程地點（樂園/動物園/水族館/博物館），再補該城市通用經典景點。不要按城市背名錄。";
    }
    if (wantsCouple) {
      return "優先提名情侶浪漫行程地點（觀景台/宮殿/花園/浪漫地標），再補該城市通用經典景點。不要按城市背名錄。";
    }
    if (wantsFood) {
      return "優先提名吃喝打卡地點（市場/美食街/老字號餐廳），再補該城市通用經典景點。不要按城市背名錄。";
    }
    if (wantsHistory) {
      return "優先提名歷史探訪地點（博物館/遺址/古迹/城牆），再補該城市通用經典景點。不要按城市背名錄。";
    }
    if (wantsAnime) {
      return "優先提名動漫主題地點（動漫街區/角色博物館/手辦街/主題場館），再補該城市通用經典景點。不要按城市背名錄。";
    }
    return "優先提名符合行程類型和偏好的地點，再補該城市通用經典景點。不要按城市背名錄。";
  }
  if (wantsKids) {
    return "优先提名亲子行程地点（乐园/动物园/水族馆/博物馆），再补该城市通用经典景点。不要按城市背名录。";
  }
  if (wantsCouple) {
    return "优先提名情侣浪漫行程地点（观景台/宫殿/花园/浪漫地标），再补该城市通用经典景点。不要按城市背名录。";
  }
  if (wantsFood) {
    return "优先提名吃喝打卡地点（市场/美食街/老字号餐厅），再补该城市通用经典景点。不要按城市背名录。";
  }
  if (wantsHistory) {
    return "优先提名历史探访地点（博物馆/遗址/古迹/城墙），再补该城市通用经典景点。不要按城市背名录。";
  }
  if (wantsAnime) {
    return "优先提名动漫主题地点（动漫街区/角色博物馆/手办街/主题场馆），再补该城市通用经典景点。不要按城市背名录。";
  }
  return "优先提名符合行程类型和偏好的地点，再补该城市通用经典景点。不要按城市背名录。";
}

function formatOtherBit(other: string | undefined, loc: CatalogLocale): string {
  const v = (other ?? "").trim();
  if (!v) return "";
  if (loc === "EN") return `Other: ${v}`;
  if (loc === "HK" || loc === "TW") return `其他：${v}`;
  return `其他：${v}`;
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
  const otherBit = formatOtherBit(prefs?.other, loc);
  const startTimeBit = formatPrefixedBit(
    prefs?.start_time,
    loc,
    { EN: "start", CN: "出发", HK: "出發", TW: "出發" },
  );
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
    startTimeBit,
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
      ? " Fit the travel month and season; do not list seasonal-only sights that are not typical or not visible then. Outside winter, do not list names that embed residual snow, rime ice, ice sculpture, or ski-only winter scenery. Do not list classic seasonal scenic couplets that do not match the travel season."
      : loc === "HK" || loc === "TW"
        ? "符合出行月份與季節，不要列該季看不到或不宜遊的季節專屬景；非冬季不要列名稱含殘雪/霧凇/冰雕/冰雪/滑雪的景點；不要列與出行季節不符的十景/八景式季節專屬名。"
        : "符合出行月份与季节，不要列该季看不到或不宜游的季节专属景；非冬季不要列名称含残雪/雾凇/冰雕/冰雪/滑雪的景点；不要列与出行季节不符的十景/八景式季节专属名。"
    : "";
  const mix =
    loc === "EN"
      ? " Do not cluster all in one neighborhood or around one landmark."
      : loc === "HK" || loc === "TW"
        ? "不要全集中在同一片區域（如同一湖周邊、同一街區）。"
        : "不要全集中在同一片区域（如同一湖周边、同一街区）。";
  const themeLine = buildThemeHint(prefs?.trip_type, prefs?.other, loc);
  const destLang = destLanguageHint(city, loc);
  const antiVague =
    loc === "EN"
      ? " Do not list vague historic districts, neighborhoods, shopping areas, or whole old towns — only specific searchable place names (venue / landmark / museum / park gate)."
      : loc === "HK" || loc === "TW"
        ? "不要歷史文化街區、區域、商圈、古鎮名，只寫具體可搜索的場館或景點專名。"
        : "不要历史文化街区、区域、商圈、古镇名，只写具体可搜索的场馆或景点专名。";
  const countLine =
    loc === "EN"
      ? " Recommend about 20 to 30 places."
      : loc === "HK" || loc === "TW"
        ? "推薦約 20 至 30 個地點。"
        : "推荐约 20 至 30 个地点。";
  const pinableLine =
    loc === "EN"
      ? " Use specific searchable venue names (landmark, museum, park gate, theme-park resort), not a whole lake, street, or new-town district. No routes, events, or parenthetical bundles."
      : loc === "HK" || loc === "TW"
        ? "寫可搜索的場館/景點/樂園等專名，不要只寫整座湖、整條街、整座新城。不要線路（如電車線路）、活動、打包描述。"
        : "写可搜索的场馆/景点/乐园等专名，不要只写整座湖、整条街、整座新城。不要线路（如电车线路）、活动、打包描述。";

  if (loc === "EN") {
    return (
      `Recommend must-see places for this trip.${countLine} Output a JSON array of short place names only — ` +
      `the same words a map search box can use. No parentheses, no explanations, no preamble or footer. ` +
      `Do not build an itinerary. Do not invent coordinates or place IDs.` +
      `${pinableLine}${themeLine}${antiVague}${seasonRule}${destLang}${nearby}${mix}\n` +
      tripLine
    );
  }
  if (loc === "HK") {
    return (
      `為以下行程推薦必去地。${countLine}只輸出 JSON 字串陣列，每項是可在地圖搜尋框原樣搜到的短地名` +
      `（不要括號、不要說明、不要開頭結尾散文）。不要安排行程，不要編造座標或商家編號。` +
      `${pinableLine}${themeLine}${antiVague}${seasonRule}${destLang}${nearby}${mix}\n` +
      tripLine
    );
  }
  if (loc === "TW") {
    return (
      `為以下行程推薦必去地。${countLine}只輸出 JSON 字串陣列，每項是可在地圖搜尋框原樣搜到的短地名` +
      `（不要括號、不要說明、不要開頭結尾散文）。不要安排行程，不要編造座標或商家編號。` +
      `${pinableLine}${themeLine}${antiVague}${seasonRule}${destLang}${nearby}${mix}\n` +
      tripLine
    );
  }
  return (
    `为以下行程推荐必去地。${countLine}只输出 JSON 字符串数组，每项是可在地图搜索框原样搜到的短地名` +
      `（不要括号、不要说明、不要开头结尾散文）。不要安排行程，不要编造坐标或商家编号。` +
      `${pinableLine}${themeLine}${antiVague}${seasonRule}${destLang}${nearby}${mix}\n` +
    tripLine
  );
}
