/**
 * F84 / ADR-049 — destination-agnostic eligible attraction predicate.
 * Shared by discover ingest, iconic heat, make pool, and trip candidate replace.
 */

import { filterDiningPlaces, isAttractionServiceFragment, isLodgingPlace } from "./place-filters";
import { type PlaceCard } from "./types";

/** Collection / scenic-area labels — templates only, not per-city POI lists (ADR-042). */
const COLLECTION_NAME =
  /十景|八景|二十四景|名胜区|名勝區|风景名胜区|風景名勝區|风景区|風景區|旅游区|旅遊區|游览区|遊覽區/u;

/** AMAP often names child POIs as `{area}风景名胜区-{child}` — keep the child. */
const SCENIC_CHILD =
  /^(.+?)(?:风景名胜区|風景名勝區|风景区|風景區|名胜区|名勝區)\s*[-–—／/]\s*(.+)$/u;

export function isCollectionPlaceName(name: string): boolean {
  const t = name.trim();
  if (!t) return true;
  return COLLECTION_NAME.test(t);
}

/**
 * If name is a scenic-area parent + child (AMAP style), return the child label.
 * Parent-only names return null (still ineligible collections).
 */
export function unwrapScenicChildName(name: string): string | null {
  const m = name.trim().match(SCENIC_CHILD);
  const child = m?.[2]?.trim();
  if (!child) return null;
  if (isCollectionPlaceName(child)) return null;
  return child;
}

export function isIneligibleMustIncludeToken(token: string): boolean {
  return isCollectionPlaceName(token) && !unwrapScenicChildName(token);
}

/**
 * Lodging / shopping / dining / entertainment / transit / dealership noise.
 * Destination-agnostic — checks category and name blob (ADR-042).
 */
export function isNoiseCategory(category?: string, name?: string): boolean {
  const blob = `${category ?? ""} ${name ?? ""}`;
  return /住宿服务|宾馆酒店|购物服务|生活服务|公司企业|商务住宅|餐饮服务|住宿服务相关|娱乐场所|\bKTV\b|汽车销售|汽车服务|交通设施|地铁站|公交站|巴士站|旗舰|4S店|经销商|美宿|别墅|度假/i.test(
    blob,
  );
}

/**
 * Whole-area labels that do not pin to one visit stop (any length / locale).
 * Scenic suffixes (景区/公园/…) are not vague — they can be visit stops.
 */
export function isVagueAreaName(name: string): boolean {
  const t = name.trim();
  if (!t) return true;
  if (/(?:风景名胜区|風景名勝區|风景区|風景區|名胜区|名勝區|景区|公園|公园|广场|廣場)$/u.test(t)) {
    return false;
  }
  return /(?:District|Area|Quarter|Neighborhood|街区|新城|[湖街城区])$/iu.test(t);
}

/** Generic venue-type / structural words — not proper nouns. Destination-agnostic
 * (fixed type vocabulary, not city POI lists — ADR-042). Used to avoid false
 * token matches between unrelated same-type places (e.g. two "National Palace"). */
const VENUE_TYPE_WORDS = new Set([
  // EN
  "palace", "tower", "museum", "national", "castle", "monastery", "temple",
  "park", "square", "fortress", "cathedral", "church", "garden", "bridge",
  "memorial", "monument", "statue", "viewpoint", "lookout", "promenade",
  "avenue", "street", "road", "abbey", "basilica", "gallery", "university",
  // PT
  "castelo", "torre", "mosteiro", "palacio", "palácio", "museu", "museu",
  "praca", "praça", "parque", "igreja", "jardim", "ponte", "miradouro",
  "nacional", "estatua", "estátua", "memorial", "avenida",
  // CN (kept for symmetry; CJK substring usually already covers these)
  "广场", "博物馆", "教堂", "公园", "遗址", "纪念", "纪念馆", "博物院",
]);

/** Tokenize a name into proper-noun tokens: lowercase, split on
 * whitespace/punctuation, drop tokens <4 chars and generic venue-type words.
 * Returns the set of significant tokens (destination-agnostic). */
export function properNameTokens(name: string): Set<string> {
  const tokens = new Set<string>();
  for (const raw of name.toLowerCase().split(/[\s\p{P}\p{S}]+/u)) {
    const t = raw.trim();
    if (t.length < 4) continue;
    if (VENUE_TYPE_WORDS.has(t)) continue;
    tokens.add(t);
  }
  return tokens;
}

/** True if query and card name share at least one significant proper-noun token.
 * Fallback for cross-language aliases where substring overlap fails
 * (e.g. "Mosteiro dos Jerónimos" ↔ "Jerónimos Monastery" share "jerónimos"). */
export function sharedProperToken(query: string, cardName: string): boolean {
  const qTokens = properNameTokens(query);
  if (qTokens.size === 0) return false;
  const cTokens = properNameTokens(cardName);
  for (const t of qTokens) {
    if (cTokens.has(t)) return true;
  }
  return false;
}

function hasPlottableLocation(card: PlaceCard): boolean {
  const lat = card.location?.lat;
  const lng = card.location?.lng;
  return Number.isFinite(lat) && Number.isFinite(lng);
}

function hasNativeIdIfSourced(card: PlaceCard): boolean {
  const sources = card.sources ?? [];
  if (sources.length === 0) return true;
  return sources.some((s) => typeof s.native_id === "string" && s.native_id.trim().length > 0);
}

function effectiveName(card: PlaceCard): string {
  const raw = card.name?.trim() ?? "";
  return unwrapScenicChildName(raw) ?? raw;
}

export function isEligibleAttraction(card: PlaceCard): boolean {
  const name = effectiveName(card);
  if (!name) return false;
  if (isCollectionPlaceName(name)) return false;
  if (isAttractionServiceFragment(name)) return false;
  if (isAttractionServiceFragment(card.name?.trim() ?? "")) return false;
  if (!hasPlottableLocation(card)) return false;
  if (!hasNativeIdIfSourced(card)) return false;
  if (filterDiningPlaces([{ ...card, name }]).length > 0) return false;
  return true;
}

/**
 * Ground an LLM/user name: do not require discover ATTRACTION_ALLOW
 * (`景区` in AMAP titles would drop 雷峰塔景区). Skip lodging/service; prefer name overlap.
 */
export function pickNominatedGroundCard(
  query: string,
  cards: PlaceCard[],
  opts?: { requireDistanceKmFrom?: { lat: number; lng: number; minKm: number } },
): PlaceCard | undefined {
  const q = query.trim();
  if (!q || !cards.length) return undefined;
  if (isVagueAreaName(q)) return undefined;
  const scored: Array<{ card: PlaceCard; score: number }> = [];
  for (const raw of cards) {
    const child = unwrapScenicChildName(raw.name ?? "");
    const card = child ? { ...raw, name: child } : raw;
    if (isLodgingPlace(card) || isLodgingPlace(raw)) continue;
    if (
      isNoiseCategory(card.category, card.name) ||
      isNoiseCategory(raw.category, raw.name)
    ) {
      continue;
    }
    if (isAttractionServiceFragment(card.name ?? "") || isAttractionServiceFragment(raw.name ?? "")) {
      continue;
    }
    if (!hasPlottableLocation(card)) continue;
    const n = (card.name ?? "").trim();
    if (isVagueAreaName(n)) continue;
    const overlaps = n.includes(q) || q.includes(n) || sharedProperToken(q, n);
    if (!overlaps) continue;
    if (isCollectionPlaceName(card.name ?? "") && !child && !n.startsWith(q) && n !== q) {
      continue;
    }
    if (filterDiningPlaces([card]).length > 0) continue;
    if (opts?.requireDistanceKmFrom) {
      const { lat, lng, minKm } = opts.requireDistanceKmFrom;
      const d = haversineKm(
        { lat, lng },
        { lat: card.location.lat, lng: card.location.lng },
      );
      if (!(d > minKm)) continue;
    }
    let score = 3;
    if (n === q) score = 5;
    else if (n.startsWith(q) || q.startsWith(n)) score = 4;
    scored.push({ card, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.card;
}

function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function filterEligibleAttractions(places: PlaceCard[]): PlaceCard[] {
  const out: PlaceCard[] = [];
  for (const card of places) {
    if (!isEligibleAttraction(card)) continue;
    const child = unwrapScenicChildName(card.name ?? "");
    out.push(child ? { ...card, name: child } : card);
  }
  return out;
}

export function degradeMustInclude(
  tokens: string[] | undefined,
  eligiblePlaces: PlaceCard[],
  covers: (token: string, haystacks: string[]) => boolean,
): string[] {
  const names = eligiblePlaces.map((p) => p.name);
  return (tokens ?? []).filter((raw) => {
    const t = raw.trim();
    if (!t) return false;
    if (isIneligibleMustIncludeToken(t)) return false;
    return covers(t, names);
  });
}
