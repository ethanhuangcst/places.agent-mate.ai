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

type DestinationRegion = "mainland" | "hongkong" | "other";

/**
 * Resolve provider strategy based on destination region only (locale-independent).
 *
 * - 大陆 → 策略2 only (AMAP)
 * - 香港 → 策略1 + 策略2 (Google + TripAdvisor + AMAP)
 * - 其他 → 策略1 only (Google + TripAdvisor)
 *
 * Only called when caller does NOT provide explicit `providers[]`.
 */
export function resolveProviderStrategy(input: ProviderResolverInput): ProviderStrategy {
  const region = detectRegion(input);

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

const TAIWAN_MARKERS = [
  "台北", "台中", "台南", "高雄", "新北", "桃園", "新竹", "基隆",
  "嘉義", "屏東", "台灣", "Taiwan", "Taipei", "Kaohsiung", "Taichung", "Tainan",
];

const HK_MARKERS = ["香港", "Hong Kong", "Hongkong"];

function detectRegion(input: ProviderResolverInput): DestinationRegion {
  // --- Text-based detection ---
  if (input.location) {
    const lower = input.location.toLowerCase();

    // Taiwan → other (AMAP has poor coverage)
    for (const marker of TAIWAN_MARKERS) {
      if (input.location.includes(marker) || lower.includes(marker.toLowerCase())) return "other";
    }

    // Hong Kong
    for (const marker of HK_MARKERS) {
      if (input.location.includes(marker) || lower.includes(marker.toLowerCase())) return "hongkong";
    }

    // Mainland China city names
    if (matchesChinaCity(input.location)) return "mainland";

    // CJK > 30% suggests mainland Chinese address
    const cjkCount = (input.location.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length;
    if (input.location.length > 0 && cjkCount / input.location.length > 0.3) return "mainland";
  }

  // --- Coordinate-based detection ---
  if (input.near) {
    const { lat, lng } = input.near;
    // Taiwan bounding box
    if (lat >= 21.9 && lat <= 25.3 && lng >= 120 && lng <= 122) return "other";
    // Hong Kong bounding box
    if (lat >= 22.15 && lat <= 22.56 && lng >= 113.83 && lng <= 114.43) return "hongkong";
    // Mainland China (remaining area within China bounds)
    if (lat >= 18 && lat <= 54 && lng >= 73 && lng <= 135) return "mainland";
  }

  return "other";
}
