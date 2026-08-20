import type { ProviderId } from "../core/providers";
import { matchesChinaCity } from "./china-cities";

export interface ProviderStrategy {
  searchProviders: ProviderId[];
  enrichProviders: ProviderId[];
}

export interface ProviderResolverInput {
  location?: string;
  near?: { lat: number; lng: number };
  locale?: string;
}

/** Geocode function signature — injected by caller, returns formatted address + coords. */
export type GeocodeFn = (query: string) => Promise<{
  address?: string;
  lat?: number;
  lng?: number;
} | null>;

type DestinationRegion = "mainland" | "hongkong" | "other";

/**
 * Resolve provider strategy based on destination region.
 *
 * Priority:
 *   1. Coordinates (bounding box — instant, no API call)
 *   2. Google Geocode (formatted_address contains country — most accurate)
 *   3. Marker lists (offline fallback)
 *   4. Default → "other" (Google — safe, it can disambiguate itself)
 *
 * CJK character ratio heuristic is intentionally removed — it caused
 * false positives for HK district names (中環), Japanese (銀座), Korean (明洞).
 */
export async function resolveProviderStrategy(
  input: ProviderResolverInput,
  geocodeFn?: GeocodeFn,
): Promise<ProviderStrategy> {
  const region = await detectRegion(input, geocodeFn);

  switch (region) {
    case "mainland":
      return { searchProviders: ["AMAP"], enrichProviders: [] };
    case "hongkong":
      return {
        searchProviders: ["GOOGLE_MAPS", "AMAP"],
        enrichProviders: ["TRIPADVISOR"],
      };
    case "other":
      return {
        searchProviders: ["GOOGLE_MAPS"],
        enrichProviders: ["TRIPADVISOR"],
      };
  }
}

// --- Marker lists (offline fallback only) ---

const TAIWAN_MARKERS = [
  "台北", "臺北", "台中", "臺中", "台南", "臺南", "高雄", "新北",
  "桃園", "桃园", "新竹", "基隆", "嘉義", "嘉义", "屏東", "屏东",
  "台灣", "臺灣", "台湾", "Taiwan", "Taipei", "Kaohsiung", "Taichung", "Tainan",
  "花蓮", "花莲", "宜蘭", "宜兰", "苗栗", "彰化", "雲林", "云林",
  "南投", "澎湖", "金門", "金门", "馬祖", "马祖",
];

const HK_MARKERS = [
  "香港", "Hong Kong", "Hongkong",
  "中環", "中环", "Central", "上環", "上环", "灣仔", "湾仔", "Wan Chai",
  "銅鑼灣", "铜锣湾", "Causeway Bay", "北角", "太古",
  "尖沙咀", "Tsim Sha Tsui", "旺角", "Mong Kok", "深水埗",
  "油麻地", "九龍", "九龙", "Kowloon",
  "沙田", "大埔", "荃灣", "荃湾", "屯門", "屯门", "元朗",
  "東涌", "东涌", "Lantau",
];

// --- Detection logic ---

async function detectRegion(
  input: ProviderResolverInput,
  geocodeFn?: GeocodeFn,
): Promise<DestinationRegion> {
  // 1. Coordinates — instant, most reliable when available
  if (input.near) {
    const region = regionFromCoords(input.near.lat, input.near.lng);
    if (region) return region;
  }

  // 2. Google Geocode — most accurate for text addresses
  if (input.location && geocodeFn) {
    try {
      const geo = await geocodeFn(input.location);
      if (geo) {
        if (geo.address) {
          const fromAddr = regionFromAddress(geo.address);
          if (fromAddr) return fromAddr;
          // Formatted Latin address without our country markers (e.g. Seoul, Tokyo)
          // must not fall through to China's oversized bbox.
          if (isLatinFormattedAddress(geo.address)) return "other";
        }
        // Short street labels (e.g. "吴中路") — use coords when present.
        if (geo.lat != null && geo.lng != null) {
          const region = regionFromCoords(geo.lat, geo.lng);
          if (region) return region;
        }
      }
    } catch {
      // Geocode failed (network, timeout) — fall through to markers
    }
  }

  // 3. Marker lists — offline fallback
  if (input.location) {
    const region = regionFromMarkers(input.location);
    if (region) return region;
  }

  // 4. Default — Google (safe, it disambiguates itself)
  return "other";
}

function regionFromCoords(lat: number, lng: number): DestinationRegion | null {
  // Taiwan bounding box (check first — overlaps with China lon range)
  if (lat >= 21.9 && lat <= 25.3 && lng >= 120 && lng <= 122) return "other";
  // Hong Kong bounding box
  if (lat >= 22.15 && lat <= 22.56 && lng >= 113.83 && lng <= 114.43) return "hongkong";
  // Mainland China
  if (lat >= 18 && lat <= 54 && lng >= 73 && lng <= 135) return "mainland";
  return null;
}

function regionFromAddress(address: string): DestinationRegion | null {
  const lower = address.toLowerCase();
  if (lower.includes("hong kong") || address.includes("香港")) return "hongkong";
  if (lower.includes("taiwan") || address.includes("台灣") || address.includes("臺灣")) return "other";
  if (lower.includes("china") || address.includes("中国") || address.includes("中國")) return "mainland";
  return null;
}

/** Western-style geocode strings (comma + Latin) that are not HK/TW/CN. */
function isLatinFormattedAddress(address: string): boolean {
  return /[,]/.test(address) && /[A-Za-z]{3,}/.test(address);
}

function regionFromMarkers(location: string): DestinationRegion | null {
  const lower = location.toLowerCase();
  const includes = (marker: string) =>
    location.includes(marker) || lower.includes(marker.toLowerCase());

  for (const m of TAIWAN_MARKERS) if (includes(m)) return "other";
  for (const m of HK_MARKERS) if (includes(m)) return "hongkong";
  if (matchesChinaCity(location)) return "mainland";

  return null; // unknown — let caller use default
}
