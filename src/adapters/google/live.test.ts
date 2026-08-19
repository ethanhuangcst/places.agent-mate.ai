import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { type PlaceCard, type SearchInput } from "../../core/types";
import {
  createGoogleLiveAdapter,
  resetGoogleLiveAdapterForTests,
} from "./live";
import { type GoogleAdapterConfig, assertGoogleProductionSafety } from "./config";
import { EgressFailureError } from "./egress";
import { type GoogleDirectClient } from "./direct";
import { type GoogleMcpClient } from "./mcp-client";
import { resetGoogleMcpToolCache } from "./mcp-client";

const sampleCard: PlaceCard = {
  provider: "GOOGLE_MAPS",
  name: "Ho Lee Fook",
  location: { lat: 22.283, lng: 114.152, crs: "WGS84" },
  category: "restaurant",
  sources: [
    {
      provider: "GOOGLE_MAPS",
      native_id: "ChIJ_test_ho_lee",
      deeplinks: { google_web: "https://example.com" },
    },
  ],
};

function baseConfig(overrides: Partial<GoogleAdapterConfig> = {}): GoogleAdapterConfig {
  return {
    apiKey: "test-google-key",
    placesBaseUrl: "https://places.googleapis.com/v1",
    geocodeBaseUrl: "https://maps.googleapis.com",
    mcpUrl: "https://maps-mcp.example/mcp",
    mcpBearer: "test-mcp-bearer",
    directForceFail: false,
    requestTimeoutMs: 5000,
    ...overrides,
  };
}

function mockDirect(cards: PlaceCard[] = [sampleCard]): GoogleDirectClient {
  return {
    searchRestaurants: vi.fn(async () => cards),
    searchPlaces: vi.fn(async () => cards),
    getDetails: vi.fn(async () => cards[0] ?? null),
    geocode: vi.fn(async () => ({ lat: 22.28, lng: 114.16, crs: "WGS84" as const })),
    reverseGeocode: vi.fn(async () => "Central, Hong Kong"),
  };
}

function mockWorker(cards: PlaceCard[] = [sampleCard]): GoogleMcpClient {
  return {
    callCount: () => 1,
    searchRestaurants: vi.fn(async () => cards),
    searchPlaces: vi.fn(async () => cards),
    getDetails: vi.fn(async () => cards[0] ?? null),
    geocode: vi.fn(async () => ({ lat: 22.28, lng: 114.16, crs: "WGS84" as const, address: "Central" })),
    reverseGeocode: vi.fn(async () => "Central, Hong Kong"),
  };
}

describe("google live adapter (ADR-017)", () => {
  beforeEach(() => {
    resetGoogleMcpToolCache();
    resetGoogleLiveAdapterForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should_use_direct_and_not_call_worker_when_direct_succeeds", async () => {
    const direct = mockDirect();
    const worker = mockWorker();
    const adapter = createGoogleLiveAdapter({
      config: baseConfig(),
      direct,
      worker,
    });

    const input: SearchInput = {
      query: "restaurant",
      near: { lat: 22.2819, lng: 114.158 },
      locale: "EN",
    };
    const cards = await adapter.searchRestaurants(input);

    expect(direct.searchRestaurants).toHaveBeenCalledOnce();
    expect(worker.searchRestaurants).not.toHaveBeenCalled();
    expect(cards).toHaveLength(1);
    expect(cards[0]?.sources[0]?.provider).toBe("GOOGLE_MAPS");
    expect(cards[0]?.sources[0]?.provider).not.toBe("GMAPS_MCP");
  });

  it("should_fallback_to_worker_when_direct_egress_fails", async () => {
    const direct = mockDirect();
    direct.searchRestaurants = vi.fn(async () => {
      throw new EgressFailureError();
    });
    const worker = mockWorker([
      {
        ...sampleCard,
        name: "SOMM",
        sources: [{ provider: "GOOGLE_MAPS", native_id: "ChIJ_somm", deeplinks: {} }],
      },
    ]);

    const adapter = createGoogleLiveAdapter({
      config: baseConfig(),
      direct,
      worker,
    });

    const cards = await adapter.searchRestaurants({
      query: "restaurant",
      near: { lat: 22.2819, lng: 114.158 },
    });

    expect(worker.searchRestaurants).toHaveBeenCalledOnce();
    expect(cards[0]?.name).toBe("SOMM");
    expect(cards.every((c) => c.sources.every((s) => s.provider === "GOOGLE_MAPS"))).toBe(true);
  });

  it("should_throw_when_direct_fails_and_worker_unconfigured", async () => {
    const direct = mockDirect();
    direct.searchRestaurants = vi.fn(async () => {
      throw new EgressFailureError();
    });

    const adapter = createGoogleLiveAdapter({
      config: baseConfig({ mcpUrl: undefined, mcpBearer: undefined }),
      direct,
      worker: null,
    });

    await expect(
      adapter.searchRestaurants({ query: "restaurant", near: { lat: 22.28, lng: 114.16 } }),
    ).rejects.toThrow();
  });

  it("should_use_worker_when_force_fail_skips_direct", async () => {
    const direct = mockDirect();
    const worker = mockWorker();
    const adapter = createGoogleLiveAdapter({
      config: baseConfig({ directForceFail: true }),
      direct: undefined,
      worker,
    });

    await adapter.searchRestaurants({ query: "restaurant", near: { lat: 22.28, lng: 114.16 } });
    expect(worker.searchRestaurants).toHaveBeenCalledOnce();
  });
});

describe("assertGoogleProductionSafety", () => {
  it("should_reject_force_fail_in_production", () => {
    const env = {
      ...process.env,
      NODE_ENV: "production",
      GOOGLE_DIRECT_FORCE_FAIL: "1",
    } as NodeJS.ProcessEnv;
    expect(() => assertGoogleProductionSafety(env)).toThrow(/GOOGLE_DIRECT_FORCE_FAIL/);
  });
});
