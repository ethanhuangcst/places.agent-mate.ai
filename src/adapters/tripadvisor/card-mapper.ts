import { type TripadvisorEnrichment } from "./fixture";

export type TerraName = {
  language?: string;
  value?: string;
  primary?: boolean;
};

export type TerraLocation = {
  id?: number | string;
  names?: TerraName[];
  traveler_ratings?: {
    overall?: { rating?: number; count?: number };
  };
  urls?: { tripadvisor?: { main?: string } };
};

export type TerraNearbyItem = {
  distance_kilometers?: number;
  location?: TerraLocation;
};

export function flattenTerraNames(names?: TerraName[]): string[] {
  const list = names ?? [];
  const values = [
    ...list.filter((n) => n.primary).map((n) => n.value?.trim() ?? ""),
    ...list.map((n) => n.value?.trim() ?? ""),
  ].filter(Boolean);
  return [...new Set(values)];
}

export function terraLocationToEnrichment(loc: TerraLocation): TripadvisorEnrichment | null {
  const rating = loc.traveler_ratings?.overall?.rating;
  if (rating == null || !Number.isFinite(Number(rating))) return null;
  const count = loc.traveler_ratings?.overall?.count;
  return {
    rating: Number(rating),
    review_count: Number(count) || 0,
    url: loc.urls?.tripadvisor?.main,
  };
}

export function terraLocationId(loc: TerraLocation): string | null {
  if (loc.id == null || loc.id === "") return null;
  return String(loc.id);
}
