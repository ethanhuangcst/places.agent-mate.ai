import { describe, expect, it } from "vitest";
import { createTripadvisorDirectClient, type FetchFn } from "./direct";
import { type TripadvisorAdapterConfig } from "./config";
import { type PlaceCard } from "../../core/types";
import { attachTripadvisorEnrichment } from "./fixture";

const yatLok: PlaceCard = {
  provider: "GOOGLE_MAPS",
  name: "Yat Lok Roast Goose",
  location: { lat: 22.2826, lng: 114.1553, crs: "WGS84" },
  category: "restaurant",
  sources: [
    {
      provider: "GOOGLE_MAPS",
      native_id: "ChIJ_test_yat_lok",
      deeplinks: { google_web: "https://maps.google.com" },
    },
  ],
};

const nearbyYatLok = {
  data: [
    {
      distance_kilometers: 0.04,
      location: {
        id: 104001,
        names: [{ language: "en", value: "Yat Lok", primary: true }],
        traveler_ratings: { overall: { rating: 4.3, count: 890 } },
        urls: { tripadvisor: { main: "https://www.tripadvisor.com/Restaurant_Review-yat-lok" } },
      },
    },
    {
      distance_kilometers: 0.2,
      location: {
        id: 809453,
        names: [{ language: "en", value: "L'Atelier de Joël Robuchon", primary: true }],
        traveler_ratings: { overall: { rating: 4.7, count: 1200 } },
        urls: { tripadvisor: { main: "https://www.tripadvisor.com/robuchon" } },
      },
    },
  ],
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function testConfig(overrides: Partial<TripadvisorAdapterConfig> = {}): TripadvisorAdapterConfig {
  return {
    apiKey: "test-terra-key",
    baseUrl: "https://terra.tripadvisor.com/api",
    requestTimeoutMs: 5000,
    ...overrides,
  };
}

function recordFetch(handler: (url: URL) => Response | unknown): {
  fetchFn: FetchFn;
  urls: URL[];
} {
  const urls: URL[] = [];
  const fetchFn: FetchFn = async (input, init) => {
    const href =
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(href);
    urls.push(url);
    expect(init?.headers && "X-API-Key" in (init.headers as Record<string, string>) ||
      new Headers(init?.headers).get("X-API-Key")).toBeTruthy();
    const result = handler(url);
    return result instanceof Response ? result : jsonResponse(result);
  };
  return { fetchFn, urls };
}

describe("Tripadvisor Terra direct client", () => {
  it("should_call_nearby_with_lat_lon_km_and_not_location_id", async () => {
    const { fetchFn, urls } = recordFetch(() => nearbyYatLok);
    const client = createTripadvisorDirectClient(testConfig(), fetchFn);
    await client.enrichCards([yatLok]);
    expect(urls).toHaveLength(1);
    expect(urls[0]?.pathname.endsWith("/locations/nearby")).toBe(true);
    expect(urls[0]?.searchParams.get("lat")).toBe("22.2826");
    expect(urls[0]?.searchParams.get("lon")).toBe("114.1553");
    expect(urls[0]?.searchParams.get("radius")).toBe("1");
    expect(urls[0]?.searchParams.get("unit")).toBe("KM");
    expect(urls[0]?.searchParams.has("location_id")).toBe(false);
  });

  it("should_not_put_google_native_id_on_terra_url", async () => {
    const { fetchFn, urls } = recordFetch(() => nearbyYatLok);
    const client = createTripadvisorDirectClient(testConfig(), fetchFn);
    await client.enrichCards([yatLok]);
    const href = urls[0]?.toString() ?? "";
    expect(href).not.toContain("ChIJ_test_yat_lok");
    expect(href).not.toContain("fixture_");
    expect(href).not.toContain("location_id");
  });

  it("should_attach_rating_when_primary_name_matches", async () => {
    const { fetchFn } = recordFetch(() => nearbyYatLok);
    const client = createTripadvisorDirectClient(testConfig(), fetchFn);
    const { cards } = await client.enrichCards([yatLok]);
    expect(cards[0]?.tripadvisor?.rating).toBe(4.3);
    expect(cards[0]?.tripadvisor?.review_count).toBe(890);
    expect(cards[0]?.tripadvisor?.url).toContain("yat-lok");
    expect(cards[0]?.sources[0]?.native_id).toBe("ChIJ_test_yat_lok");
  });

  it("should_leave_card_unchanged_when_no_name_match", async () => {
    const { fetchFn } = recordFetch(() => nearbyYatLok);
    const unmatched = { ...yatLok, name: "Totally Unknown Noodle Shop" };
    const client = createTripadvisorDirectClient(testConfig(), fetchFn);
    const { cards, skipped } = await client.enrichCards([unmatched]);
    expect(cards[0]?.tripadvisor).toBeUndefined();
    expect(skipped).toEqual([]);
    expect(cards[0]?.name).toBe("Totally Unknown Noodle Shop");
  });

  it("should_keep_cards_and_skip_when_terra_http_fails", async () => {
    const { fetchFn } = recordFetch(() => jsonResponse({ error: "boom" }, 500));
    const client = createTripadvisorDirectClient(testConfig(), fetchFn);
    const { cards, skipped } = await client.enrichCards([yatLok]);
    expect(cards[0]?.name).toBe("Yat Lok Roast Goose");
    expect(cards[0]?.tripadvisor).toBeUndefined();
    expect(skipped).toEqual([{ provider: "TRIPADVISOR", reason_key: "errors.provider_failed" }]);
  });

  it("should_reuse_one_nearby_call_when_cards_share_a_pin", async () => {
    const { fetchFn, urls } = recordFetch(() => nearbyYatLok);
    const other: PlaceCard = {
      ...yatLok,
      name: "Unknown Cafe",
      location: { lat: 22.28261, lng: 114.15529, crs: "WGS84" },
      sources: [{ provider: "GOOGLE_MAPS", native_id: "ChIJ_other", deeplinks: {} }],
    };
    const client = createTripadvisorDirectClient(testConfig(), fetchFn);
    await client.enrichCards([yatLok, other]);
    expect(urls.filter((u) => u.pathname.includes("/nearby"))).toHaveLength(1);
  });

  it("should_fetch_details_when_nearby_has_no_rating", async () => {
    const { fetchFn, urls } = recordFetch((url) => {
      if (url.pathname.includes("/nearby")) {
        return {
          data: [
            {
              distance_kilometers: 0.01,
              location: {
                id: 104001,
                names: [{ language: "en", value: "Yat Lok", primary: true }],
              },
            },
          ],
        };
      }
      if (url.pathname.endsWith("/locations/104001")) {
        return {
          id: 104001,
          names: [{ language: "en", value: "Yat Lok", primary: true }],
          traveler_ratings: { overall: { rating: 4.1, count: 10 } },
          urls: { tripadvisor: { main: "https://www.tripadvisor.com/yat-lok" } },
        };
      }
      throw new Error(url.pathname);
    });
    const client = createTripadvisorDirectClient(testConfig(), fetchFn);
    const { cards } = await client.enrichCards([yatLok]);
    expect(cards[0]?.tripadvisor?.rating).toBe(4.1);
    expect(urls.some((u) => u.pathname.endsWith("/locations/104001"))).toBe(true);
  });
});

describe("attachTripadvisorEnrichment", () => {
  it("should_keep_primary_google_source", () => {
    const card = attachTripadvisorEnrichment(yatLok, {
      rating: 4,
      review_count: 1,
      url: "https://www.tripadvisor.com/x",
    });
    expect(card.sources[0]?.native_id).toBe("ChIJ_test_yat_lok");
  });
});
