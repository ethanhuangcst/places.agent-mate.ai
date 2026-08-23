import { type PlaceCard } from "./types";

const LODGING_DENY =
  /hostel|hotel|\binn\b|lodging|motel|resort|guesthouse|hilton|hyatt|公寓|宾馆|酒店|旅馆|旅舍|民宿|客栈|贵宾楼|怡宾楼|迎宾楼|希尔顿|凯悦/i;

/** Business / transit noise — used by discover + timed (ADR-038). */
const BUSINESS_TRANSIT_DENY =
  /公司企业|农林牧渔|停车场|停車|公交站|巴士站|parking|bus.?stop|transit_station/i;

/** POI fragments that inflate discover pools (ADR-038 P0). */
const ATTRACTION_FRAGMENT_DENY =
  /售票处|售票處|直通车|直通車|乘车点|乘車點|发车点|發車點|敌台|敵台|敌楼|敵樓|瓮城|甕城|箭楼|箭樓/i;

const VISIT_DENY =
  /shopping_mall|fashion plaza|garden plaza|\bplaza\b|\bmall\b|美食街|residential|transit_station|地铁站|\bstation\b|码头|景区|商城|购物中心|步行街|tourist_information|information_center|visitor.?center|visitlisboa|lisboa card|\bturismo\b|不对外开放/i;

const ATTRACTION_ALLOW =
  /museum|park|landmark|tourist_attraction|monument|gallery|temple|church|castle|viewpoint|miradouro|zoo|aquarium|palace|bridge|memorial|scenic|place_of_worship|monastery|abbey|景点|博物馆|博物館|公园|公園|风景|風景|名胜|名勝|古迹|古跡|寺庙|寺廟|园林|園林|展览|展覽|美术馆|美術館|history_museum|botanical|archaeolog|cathedral|科教文化|风景名胜|風景名勝|文物古迹|文物古蹟|纪念馆|紀念館|展览馆|展覽館|观光|觀光|人文景观|人文景觀|修道院|教堂|14\d{4}/i;

const DINING_ALLOW =
  /restaurant|cafe|café|coffee|tea house|teahouse|dining|food|餐|饭店|料理|烧烤|火锅|茶馆|咖啡馆|酒楼|菜馆|050000/i;

/**
 * Generic landmark-as-meal noise (ADR-042 Update: city-specific landmark names
 * removed — no city POI knowledge in source).
 */
const LANDMARK_AS_MEAL_DENY =
  /管理办|码头广场|贵宾楼|怡宾楼|迎宾楼|步行街综合|^宾馆|酒店楼/i;

function blobOf(place: PlaceCard): string {
  return `${place.name} ${place.category ?? ""}`;
}

/** Timed / discover visits: attractions only — never lodging, malls, business POIs, stations, fragments. */
export function filterAttractionPlaces(places: PlaceCard[]): PlaceCard[] {
  return places.filter((p) => {
    const blob = blobOf(p);
    if (LODGING_DENY.test(blob) || VISIT_DENY.test(blob) || BUSINESS_TRANSIT_DENY.test(blob)) {
      return false;
    }
    if (ATTRACTION_FRAGMENT_DENY.test(blob)) return false;
    return ATTRACTION_ALLOW.test(blob);
  });
}

/**
 * Meal candidates: require a dining signal and reject landmarks/hotel wings
 * even when Google labels them restaurant.
 */
export function filterDiningPlaces(places: PlaceCard[]): PlaceCard[] {
  return places.filter((p) => {
    const blob = blobOf(p);
    if (LANDMARK_AS_MEAL_DENY.test(blob) || LODGING_DENY.test(blob)) return false;
    return DINING_ALLOW.test(blob);
  });
}

export function filterCafePlaces(places: PlaceCard[]): PlaceCard[] {
  return filterDiningPlaces(places).filter((p) =>
    /cafe|café|coffee|tea|茶|咖啡/i.test(blobOf(p)),
  );
}

export function isLodgingPlace(place: PlaceCard): boolean {
  return LODGING_DENY.test(blobOf(place));
}

export function normalizeVenueName(name: string): string {
  return name.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

/** native_id and normalized name — same venue if either key matches. */
export function placeIdentityKeys(place: PlaceCard): string[] {
  const keys = [`name:${normalizeVenueName(place.name)}`];
  const id = place.sources[0]?.native_id?.trim();
  if (id) keys.unshift(`id:${id.toLowerCase()}`);
  return keys;
}

export function placeIdentity(place: PlaceCard): string {
  return placeIdentityKeys(place)[0]!;
}

export function isUsedPlace(place: PlaceCard, used: Set<string>): boolean {
  return placeIdentityKeys(place).some((k) => used.has(k));
}

export function markPlaceUsed(place: PlaceCard, used: Set<string>): void {
  for (const k of placeIdentityKeys(place)) used.add(k);
}

export function uniquePlaces(places: PlaceCard[]): PlaceCard[] {
  const seen = new Set<string>();
  const out: PlaceCard[] = [];
  for (const place of places) {
    if (isUsedPlace(place, seen)) continue;
    markPlaceUsed(place, seen);
    out.push(place);
  }
  return out;
}
