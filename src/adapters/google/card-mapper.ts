import { type PlaceCard, type PlaceLocation } from "../../core/types";
import { googleDeeplinks } from "./deeplinks";

type GoogleOpeningHours = {
  weekdayDescriptions?: string[];
};

type DirectPlace = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  rating?: number;
  primaryType?: string;
  types?: string[];
  regularOpeningHours?: GoogleOpeningHours;
};

/** Honest summary from Google Places; undefined when vendor omits data. */
export function formatGoogleOpeningHours(
  hours?: GoogleOpeningHours | null,
): string | undefined {
  const lines = (hours?.weekdayDescriptions ?? [])
    .map((s) => s.trim())
    .filter(Boolean);
  if (!lines.length) return undefined;
  return lines.join("; ");
}

export function directPlaceToCard(place: DirectPlace, category?: string): PlaceCard | null {
  const name = place.displayName?.text?.trim();
  const lat = place.location?.latitude;
  const lng = place.location?.longitude;
  if (!name || lat == null || lng == null) return null;

  const nativeId = (place.id ?? "").replace(/^places\//, "");
  if (!nativeId) return null;

  const location: PlaceLocation = { lat, lng, crs: "WGS84" };
  const hours = formatGoogleOpeningHours(place.regularOpeningHours);
  return {
    provider: "GOOGLE_MAPS",
    name,
    address: place.formattedAddress,
    location,
    rating: place.rating,
    category: category ?? place.primaryType ?? "place",
    ...(hours ? { hours } : {}),
    sources: [
      {
        provider: "GOOGLE_MAPS",
        native_id: nativeId,
        deeplinks: googleDeeplinks(location, name),
      },
    ],
  };
}

type WorkerPlace = {
  id?: string;
  place?: string;
  location?: { latitude?: number; longitude?: number };
  attribution?: { title?: string };
};

export function workerPlaceToCard(place: WorkerPlace, category?: string): PlaceCard | null {
  const title = place.attribution?.title ?? "";
  const name = title.replace(/ - Google Maps$/i, "").trim() || "Unknown place";
  const lat = place.location?.latitude;
  const lng = place.location?.longitude;
  if (lat == null || lng == null) return null;

  const rawId = place.id ?? place.place?.replace(/^places\//, "") ?? "";
  if (!rawId) return null;

  const location: PlaceLocation = { lat, lng, crs: "WGS84" };
  return {
    provider: "GOOGLE_MAPS",
    name,
    location,
    category: category ?? "restaurant",
    sources: [
      {
        provider: "GOOGLE_MAPS",
        native_id: rawId,
        deeplinks: googleDeeplinks(location, name),
      },
    ],
  };
}
