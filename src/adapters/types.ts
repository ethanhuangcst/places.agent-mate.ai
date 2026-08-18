import { type PlaceCard, type SearchInput, type PlaceLocation } from "../core/types";
import { type ProviderId } from "../core/providers";

export type PlaceAdapter = {
  id: ProviderId;
  searchRestaurants(input: SearchInput): Promise<PlaceCard[]>;
  getDetails(nativeId: string): Promise<PlaceCard | null>;
  geocode(query: string): Promise<PlaceLocation & { address?: string }>;
  reverseGeocode(lat: number, lng: number): Promise<string>;
  deeplinks(card: PlaceCard): Record<string, string>;
};
