import { type PlaceCard, type PlaceLocation } from "../../core/types";
import { normalizeAmapCost } from "../../core/price";

export function amapDeeplinks(loc: PlaceLocation, name: string): Record<string, string> {
  const nameQ = encodeURIComponent(name);
  return {
    amap_web: `https://uri.amap.com/marker?position=${loc.lng},${loc.lat}&name=${nameQ}`,
  };
}

export type AmapBusiness = {
  rating?: string;
  tel?: string;
  opentime_today?: string;
  opentime_week?: string;
  cost?: string;
};

export type AmapPoi = {
  id?: string;
  name?: string;
  location?: string;
  address?: string;
  type?: string;
  tel?: string;
  business?: AmapBusiness;
  photos?: Array<{ url?: string }>;
};

/** Prefer today, then week; undefined when AMAP omits both. */
export function formatAmapOpeningHours(
  business?: AmapBusiness | null,
): string | undefined {
  const today = business?.opentime_today?.trim();
  if (today) return today;
  const week = business?.opentime_week?.trim();
  if (week) return week;
  return undefined;
}

export function amapPoiToCard(poi: AmapPoi, category?: string): PlaceCard | null {
  const name = poi.name?.trim();
  const parsed = parseLngLat(poi.location ?? "");
  const nativeId = poi.id?.trim();
  if (!name || !parsed || !nativeId) return null;

  const location: PlaceLocation = { lat: parsed.lat, lng: parsed.lng, crs: "GCJ-02" };
  const ratingRaw = poi.business?.rating;
  const rating = ratingRaw != null && ratingRaw !== "" ? Number(ratingRaw) : undefined;
  const hours = formatAmapOpeningHours(poi.business);

  const costNum = Number(poi.business?.cost);
  const price = normalizeAmapCost(Number.isFinite(costNum) && costNum > 0 ? costNum : undefined);
  const photoUrls = poi.photos
    ?.map((p) => p.url)
    .filter((u): u is string => !!u);

  return {
    provider: "AMAP",
    name,
    address: poi.address,
    location,
    rating: rating != null && Number.isFinite(rating) ? rating : undefined,
    category: category ?? poi.type ?? "place",
    phone: poi.business?.tel ?? poi.tel,
    ...(hours ? { hours } : {}),
    ...(photoUrls?.length ? { photos: photoUrls } : {}),
    ...(price.price_level ? { price_level: price.price_level } : {}),
    ...(price.price_per_person ? { price_per_person: price.price_per_person } : {}),
    sources: [
      {
        provider: "AMAP",
        native_id: nativeId,
        deeplinks: amapDeeplinks(location, name),
      },
    ],
  };
}

export function parseLngLat(location: string): { lng: number; lat: number } | null {
  const [lngS, latS] = location.split(",");
  const lng = Number(lngS);
  const lat = Number(latS);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  return { lng, lat };
}

export function formatLngLat(lng: number, lat: number): string {
  return `${formatCoord(lng)},${formatCoord(lat)}`;
}

function formatCoord(n: number): string {
  return n.toFixed(6);
}
