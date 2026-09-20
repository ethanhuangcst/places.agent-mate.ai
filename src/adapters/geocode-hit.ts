import { type PlaceLocation } from "../core/types";

/** Forward-geocode hit with optional structured admin labels (MVP-T2 / agent-geocode-100). */
export type GeocodeHit = PlaceLocation & {
  address?: string;
  country?: string;
  city?: string;
  city_en?: string;
};

type AddressComponent = {
  long_name?: string;
  short_name?: string;
  types?: string[];
};

function componentName(
  components: AddressComponent[],
  type: string,
): string | undefined {
  const hit = components.find((c) => c.types?.includes(type));
  const name = hit?.long_name?.trim() || hit?.short_name?.trim();
  return name || undefined;
}

/** Parse Google Geocoding `address_components` into country / city. */
export function parseGoogleAddressComponents(
  components: AddressComponent[] | undefined,
): { country?: string; city?: string } {
  if (!components?.length) return {};
  const country = componentName(components, "country");
  let city =
    componentName(components, "locality") ||
    componentName(components, "postal_town") ||
    componentName(components, "administrative_area_level_2") ||
    componentName(components, "administrative_area_level_1");
  // City-states (HK / MO / SG / …): Google often returns only `country`.
  if (country && !city) city = country;
  return { country, city };
}

/**
 * AMAP often returns `city: []` (empty array) for empty admin fields.
 * Treat non-strings / blank as missing.
 */
export function amapAdminString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const t = value.trim();
  return t || undefined;
}

/** Dest-eligible AMAP `/v3/geocode/geo` levels (city or scenic). */
const DEST_GEO_ACCEPT_LEVELS = new Set(["市", "区县", "省", "兴趣点"]);

/** Levels that must never be takeoff / discover anchors (同名住宅区 etc.). */
const DEST_GEO_REJECT_LEVELS = new Set([
  "住宅区",
  "门牌号",
  "单元号",
  "楼层",
  "房间",
  "小巷",
  "道路",
  "道路交叉路口",
  "村庄",
  "未知",
  "门址",
]);

/**
 * Whether an AMAP geocode row may be used as a destination pin.
 * Missing level is allowed (legacy / city hits often omit it).
 * Explicit reject levels (住宅区…) are never accepted.
 */
export function isAmapDestEligibleGeoLevel(level: unknown): boolean {
  const l = amapAdminString(level);
  if (!l) return true;
  if (DEST_GEO_REJECT_LEVELS.has(l)) return false;
  return DEST_GEO_ACCEPT_LEVELS.has(l);
}

/**
 * place/text POI type string → destination-eligible scenic or admin place.
 * Rejects housing / hotel / dining / shopping.
 */
export function isAmapDestEligiblePoiType(type: unknown): boolean {
  const t = typeof type === "string" ? type : "";
  if (!t.trim()) return false;
  if (/住宅|酒店|宾馆|旅馆|餐饮|美食|购物|商场|公司企业|商务住宅|楼宇/.test(t)) {
    return false;
  }
  return /风景名胜|岛屿|自然地名|行政区划|城市|乡镇|区县/.test(t);
}

/** AMAP geocode row → country / city (no city_en). */
export function parseAmapGeocodeAdmin(row: {
  country?: unknown;
  province?: unknown;
  city?: unknown;
  district?: unknown;
}): { country?: string; city?: string } {
  let country = amapAdminString(row.country);
  let city =
    amapAdminString(row.city) ||
    amapAdminString(row.district) ||
    amapAdminString(row.province) ||
    undefined;
  // agent-geocode-100 AC4: mainland hits often omit country.
  if (!country && (city || amapAdminString(row.province))) {
    country = "中国";
  }
  if (country && !city) city = country;
  return { country, city };
}
