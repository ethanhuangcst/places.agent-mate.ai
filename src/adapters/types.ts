import { type PlaceCard, type SearchInput, type PlaceLocation } from "../core/types";
import { type ProviderId } from "../core/providers";
import { type TravelMode } from "../core/itinerary-timed";

export type DirectionsEta = {
  duration_min: number;
  distance_m?: number;
};

export type PlaceAdapter = {
  id: ProviderId;
  searchRestaurants(input: SearchInput): Promise<PlaceCard[]>;
  searchPlaces(input: SearchInput): Promise<PlaceCard[]>;
  getDetails(nativeId: string): Promise<PlaceCard | null>;
  geocode(query: string): Promise<PlaceLocation & { address?: string }>;
  reverseGeocode(lat: number, lng: number): Promise<string>;
  deeplinks(card: PlaceCard): Record<string, string>;
  /** Optional live A→B ETA (Story C). Missing/failure → caller keeps heuristic. */
  directions?(input: {
    from: PlaceLocation;
    to: PlaceLocation;
    mode: TravelMode;
  }): Promise<DirectionsEta | null>;
};
