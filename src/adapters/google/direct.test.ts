import { describe, expect, it } from "vitest";
import { createGoogleDirectClient, directDeeplinks, type FetchFn } from "./direct";
import { type GoogleAdapterConfig } from "./config";
import { type PlaceCard } from "../../core/types";

const PLACE = {
  id: "ChIJ_test",
  displayName: { text: "Yat Lok" },
  formattedAddress: "Central",
  location: { latitude: 22.28, longitude: 114.16 },
  rating: 4.4,
  primaryType: "restaurant",
  types: ["restaurant"],
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function testConfig(overrides: Partial<GoogleAdapterConfig> = {}): GoogleAdapterConfig {
  return {
    apiKey: "test-google-key",
    placesBaseUrl: "https://places.googleapis.com/v1",
    geocodeBaseUrl: "https://maps.googleapis.com",
    mcpUrl: undefined,
    mcpBearer: undefined,
    directForceFail: false,
    requestTimeoutMs: 5000,
    ...overrides,
  };
}

function recordFetch(handler: (url: URL, init?: RequestInit) => Response): {
  fetchFn: FetchFn;
  urls: URL[];
} {
  const urls: URL[] = [];
  const fetchFn: FetchFn = async (input, init) => {
    const href =
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(href);
    urls.push(url);
    return handler(url, init);
  };
  return { fetchFn, urls };
}

describe("Google live direct client", () => {
  it("should_search_text_with_query_and_near_bias", async () => {
    const { fetchFn, urls } = recordFetch((url) => {
      if (url.pathname.endsWith("/places:searchText")) {
        return jsonResponse({ places: [PLACE] });
      }
      throw new Error(`unexpected ${url.pathname}`);
    });
    const client = createGoogleDirectClient(testConfig(), fetchFn);
    const cards = await client.searchRestaurants({
      query: "roast goose",
      near: { lat: 22.28, lng: 114.16 },
      locale: "EN",
    });
    expect(cards).toHaveLength(1);
    expect(cards[0]?.name).toBe("Yat Lok");
    expect(urls[0]?.pathname).toContain("/places:searchText");
  });

  it("should_default_restaurant_query_when_empty", async () => {
    let body = "";
    const { fetchFn } = recordFetch((url, init) => {
      body = typeof init?.body === "string" ? init.body : "";
      return jsonResponse({ places: [] });
    });
    const client = createGoogleDirectClient(testConfig(), fetchFn);
    await client.searchRestaurants({ address: "Central" });
    expect(body).toContain("restaurant");
    expect(body).toContain("Central");
  });

  it("should_search_places_without_restaurant_default", async () => {
    const { fetchFn } = recordFetch(() => jsonResponse({ places: [PLACE] }));
    const client = createGoogleDirectClient(testConfig(), fetchFn);
    await client.searchPlaces({ query: "museum" });
  });

  it("should_throw_egress_when_api_key_missing", async () => {
    const client = createGoogleDirectClient(testConfig({ apiKey: undefined }), async () => {
      throw new Error("should not fetch");
    });
    await expect(client.searchPlaces({ query: "x" })).rejects.toThrow(/no_api_key|egress/i);
  });

  it("should_throw_when_direct_force_fail", async () => {
    const client = createGoogleDirectClient(testConfig({ directForceFail: true }), async () => {
      throw new Error("should not fetch");
    });
    await expect(client.searchRestaurants({ query: "x" })).rejects.toThrow(/force_fail|egress/i);
  });

  it("should_throw_egress_on_http_403", async () => {
    const { fetchFn } = recordFetch(() => jsonResponse({}, 403));
    const client = createGoogleDirectClient(testConfig(), fetchFn);
    await expect(client.searchPlaces({ query: "x" })).rejects.toThrow(/http_403|egress/i);
  });

  it("should_throw_on_other_http_error", async () => {
    const { fetchFn } = recordFetch(() => jsonResponse({}, 400));
    const client = createGoogleDirectClient(testConfig(), fetchFn);
    await expect(client.searchPlaces({ query: "x" })).rejects.toThrow(/google_places_400/);
  });

  it("should_get_details_and_prefix_places_id", async () => {
    const { fetchFn, urls } = recordFetch((url) => {
      if (url.pathname.includes("/places/ChIJ_test")) {
        return jsonResponse(PLACE);
      }
      throw new Error(`unexpected ${url.pathname}`);
    });
    const client = createGoogleDirectClient(testConfig(), fetchFn);
    const card = await client.getDetails("ChIJ_test");
    expect(card?.name).toBe("Yat Lok");
    expect(urls[0]?.pathname).toContain("/places/ChIJ_test");
  });

  it("should_return_null_on_details_404", async () => {
    const { fetchFn } = recordFetch(() => jsonResponse({}, 404));
    const client = createGoogleDirectClient(testConfig(), fetchFn);
    await expect(client.getDetails("places/missing")).resolves.toBeNull();
  });

  it("should_throw_on_details_http_error", async () => {
    const { fetchFn } = recordFetch(() => jsonResponse({}, 500));
    const client = createGoogleDirectClient(testConfig(), fetchFn);
    await expect(client.getDetails("x")).rejects.toThrow(/google_details_500/);
  });

  it("should_geocode_address_and_language", async () => {
    const { fetchFn, urls } = recordFetch(() =>
      jsonResponse({
        results: [
          {
            formatted_address: "Lisbon",
            geometry: { location: { lat: 38.7, lng: -9.1 } },
          },
        ],
      }),
    );
    const client = createGoogleDirectClient(testConfig(), fetchFn);
    const pin = await client.geocode("Lisbon", "EN");
    expect(pin.lat).toBe(38.7);
    expect(pin.lng).toBe(-9.1);
    expect(pin.crs).toBe("WGS84");
    expect(urls[0]?.searchParams.get("language")).toBe("en");
  });

  it("should_throw_when_geocode_empty", async () => {
    const { fetchFn } = recordFetch(() => jsonResponse({ results: [] }));
    const client = createGoogleDirectClient(testConfig(), fetchFn);
    await expect(client.geocode("nowhere")).rejects.toThrow(/google_geocode_empty/);
  });

  it("should_throw_on_geocode_http_error", async () => {
    const { fetchFn } = recordFetch(() => jsonResponse({}, 502));
    const client = createGoogleDirectClient(testConfig(), fetchFn);
    await expect(client.geocode("x")).rejects.toThrow(/http_502|egress/i);
  });

  it("should_reverse_geocode_or_fallback_coords", async () => {
    const { fetchFn } = recordFetch(() => jsonResponse({ results: [] }));
    const client = createGoogleDirectClient(testConfig(), fetchFn);
    const addr = await client.reverseGeocode(22.2819, 114.158);
    expect(addr).toMatch(/22\.2819|114\.1580/);
  });

  it("should_return_formatted_reverse_geocode", async () => {
    const { fetchFn } = recordFetch(() =>
      jsonResponse({ results: [{ formatted_address: "Central, Hong Kong" }] }),
    );
    const client = createGoogleDirectClient(testConfig(), fetchFn);
    await expect(client.reverseGeocode(22.28, 114.16)).resolves.toBe("Central, Hong Kong");
  });

  it("should_throw_on_reverse_http_error", async () => {
    const { fetchFn } = recordFetch(() => jsonResponse({}, 400));
    const client = createGoogleDirectClient(testConfig(), fetchFn);
    await expect(client.reverseGeocode(1, 2)).rejects.toThrow(/google_reverse_400/);
  });

  it("should_map_deeplinks_without_api_key", () => {
    const card: PlaceCard = {
      provider: "GOOGLE_MAPS",
      name: "Yat Lok",
      location: { lat: 22.28, lng: 114.16, crs: "WGS84" },
      sources: [],
    };
    const links = directDeeplinks(card);
    expect(JSON.stringify(links)).not.toMatch(/test-google-key/);
    expect(links.google_web).toContain("google.com/maps");
  });

  it("should_wrap_network_egress_failures", async () => {
    const err = Object.assign(new Error("fetch failed"), { code: "ENOTFOUND" });
    const fetchFn: FetchFn = async () => {
      throw err;
    };
    const client = createGoogleDirectClient(testConfig(), fetchFn);
    await expect(client.searchPlaces({ query: "x" })).rejects.toThrow();
  });

  it("should_rethrow_non_egress_fetch_errors", async () => {
    const fetchFn: FetchFn = async () => {
      throw new Error("boom-parse");
    };
    const client = createGoogleDirectClient(testConfig(), fetchFn);
    await expect(client.searchPlaces({ query: "x" })).rejects.toThrow(/boom-parse/);
  });

  it("should_throw_when_geocode_result_lacks_coords", async () => {
    const { fetchFn } = recordFetch(() =>
      jsonResponse({ results: [{ formatted_address: "x", geometry: { location: {} } }] }),
    );
    const client = createGoogleDirectClient(testConfig(), fetchFn);
    await expect(client.geocode("x")).rejects.toThrow(/google_geocode_empty/);
  });
});
