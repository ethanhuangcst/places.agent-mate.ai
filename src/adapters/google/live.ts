import { type PlaceAdapter } from "../types";
import { type PlaceCard, type SearchInput } from "../../core/types";
import {
  assertGoogleProductionSafety,
  hasDirectGoogle,
  hasWorkerMcp,
  loadGoogleAdapterConfig,
  type GoogleAdapterConfig,
} from "./config";
import { createGoogleDirectClient, directDeeplinks, type GoogleDirectClient } from "./direct";
import { fetchGoogleDirectionsEta } from "./directions";
import { createGoogleMcpClient, mcpDeeplinks, resetGoogleMcpToolCache, type GoogleMcpClient } from "./mcp-client";
import { EgressFailureError, isEgressFailure } from "./egress";
import { type TravelMode } from "../../core/itinerary-timed";
import { type PlaceLocation } from "../../core/types";

export type GoogleLiveAdapterDeps = {
  config?: GoogleAdapterConfig;
  direct?: GoogleDirectClient;
  worker?: GoogleMcpClient | null;
};

async function withGoogleTransport<T>(
  config: GoogleAdapterConfig,
  direct: GoogleDirectClient | undefined,
  worker: GoogleMcpClient | null | undefined,
  directFn: (d: GoogleDirectClient) => Promise<T>,
  workerFn: (w: GoogleMcpClient) => Promise<T>,
): Promise<T> {
  if (hasDirectGoogle(config) && direct) {
    try {
      return await directFn(direct);
    } catch (err) {
      if (!isEgressFailure(err)) throw err;
    }
  }

  if (hasWorkerMcp(config) && worker) {
    return workerFn(worker);
  }

  throw new EgressFailureError("google_transport_exhausted");
}

export function createGoogleLiveAdapter(deps: GoogleLiveAdapterDeps = {}): PlaceAdapter {
  assertGoogleProductionSafety();
  const config = deps.config ?? loadGoogleAdapterConfig();
  const direct = deps.direct ?? (hasDirectGoogle(config) ? createGoogleDirectClient(config) : undefined);
  const worker =
    deps.worker !== undefined
      ? deps.worker
      : hasWorkerMcp(config)
        ? createGoogleMcpClient(config)
        : null;

  const adapter: PlaceAdapter = {
    id: "GOOGLE_MAPS",
    searchRestaurants(input: SearchInput) {
      return withGoogleTransport(
        config,
        direct,
        worker,
        (d) => d.searchRestaurants(input),
        (w) => w.searchRestaurants(input),
      );
    },
    searchPlaces(input: SearchInput) {
      return withGoogleTransport(
        config,
        direct,
        worker,
        (d) => d.searchPlaces(input),
        (w) => w.searchPlaces(input),
      );
    },
    getDetails(nativeId: string) {
      return withGoogleTransport(
        config,
        direct,
        worker,
        (d) => d.getDetails(nativeId),
        (w) => w.getDetails(nativeId),
      );
    },
    geocode(query: string) {
      return withGoogleTransport(
        config,
        direct,
        worker,
        (d) => d.geocode(query),
        (w) => w.geocode(query),
      );
    },
    reverseGeocode(lat: number, lng: number) {
      return withGoogleTransport(
        config,
        direct,
        worker,
        (d) => d.reverseGeocode(lat, lng),
        (w) => w.reverseGeocode(lat, lng),
      );
    },
    deeplinks(card: PlaceCard) {
      return directDeeplinks(card);
    },
    async directions(input: {
      from: PlaceLocation;
      to: PlaceLocation;
      mode: TravelMode;
    }) {
      try {
        return await fetchGoogleDirectionsEta(config, input);
      } catch {
        return null;
      }
    },
  };

  return adapter;
}

/** Singleton for runtime; tests inject via createGoogleLiveAdapter. */
let runtimeAdapter: PlaceAdapter | null = null;

export function getGoogleLiveAdapter(): PlaceAdapter {
  if (!runtimeAdapter) {
    runtimeAdapter = createGoogleLiveAdapter();
  }
  return runtimeAdapter;
}

export function resetGoogleLiveAdapterForTests(): void {
  runtimeAdapter = null;
  resetGoogleMcpToolCache();
}

/** Inject a live adapter singleton for HTTP contract tests (TC-H15). */
export function setGoogleLiveAdapterForTests(adapter: PlaceAdapter | null): void {
  runtimeAdapter = adapter;
}

export { mcpDeeplinks };
