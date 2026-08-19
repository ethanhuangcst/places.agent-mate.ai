import { type PlaceAdapter } from "../types";
import { type PlaceCard, type SearchInput } from "../../core/types";
import { loadAmapAdapterConfig, type AmapAdapterConfig } from "./config";
import { createAmapDirectClient, amapDeeplinks, type AmapDirectClient, type FetchFn } from "./direct";
import { fetchAmapDirectionsEta } from "./directions";
import { type TravelMode } from "../../core/itinerary-timed";

export type AmapLiveAdapterDeps = {
  config?: AmapAdapterConfig;
  fetchFn?: FetchFn;
  client?: AmapDirectClient;
};

export function createAmapLiveAdapter(deps: AmapLiveAdapterDeps = {}): PlaceAdapter {
  const config = deps.config ?? loadAmapAdapterConfig();
  const client = deps.client ?? createAmapDirectClient(config, deps.fetchFn);
  const fetchFn = deps.fetchFn ?? fetch;

  const adapter: PlaceAdapter = {
    id: "AMAP",
    searchRestaurants(input: SearchInput) {
      return client.searchRestaurants(input);
    },
    searchPlaces(input: SearchInput) {
      return client.searchPlaces(input);
    },
    getDetails(nativeId: string) {
      return client.getDetails(nativeId);
    },
    geocode(query: string) {
      return client.geocode(query);
    },
    reverseGeocode(lat: number, lng: number) {
      return client.reverseGeocode(lat, lng);
    },
    deeplinks(card: PlaceCard) {
      return amapDeeplinks(card.location, card.name);
    },
    async directions(input: {
      from: PlaceCard["location"];
      to: PlaceCard["location"];
      mode: TravelMode;
    }) {
      try {
        return await fetchAmapDirectionsEta(config, input, fetchFn);
      } catch {
        return null;
      }
    },
  };

  return adapter;
}

let runtimeAdapter: PlaceAdapter | null = null;

export function getAmapLiveAdapter(): PlaceAdapter {
  if (!runtimeAdapter) {
    runtimeAdapter = createAmapLiveAdapter();
  }
  return runtimeAdapter;
}

export function resetAmapLiveAdapterForTests(): void {
  runtimeAdapter = null;
}

export function setAmapLiveAdapterForTests(adapter: PlaceAdapter | null): void {
  runtimeAdapter = adapter;
}
