import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FIXTURE_POIS } from "../src/adapters/fixtures";
import { getLastTripadvisorQuery } from "../src/adapters/tripadvisor/fixture";
import {
  createGoogleLiveAdapter,
  resetGoogleLiveAdapterForTests,
  setGoogleLiveAdapterForTests,
} from "../src/adapters/google/live";
import {
  createAmapLiveAdapter,
  resetAmapLiveAdapterForTests,
  setAmapLiveAdapterForTests,
} from "../src/adapters/amap/live";
import { createTripadvisorDirectClient } from "../src/adapters/tripadvisor/direct";
import {
  resetTripadvisorLiveForTests,
  setTripadvisorLiveForTests,
} from "../src/adapters/tripadvisor/live";
import { createOpenMeteoDirectClient } from "../src/adapters/open-meteo/direct";
import {
  resetOpenMeteoLiveForTests,
  setOpenMeteoLiveForTests,
} from "../src/adapters/open-meteo/live";
import { EgressFailureError } from "../src/adapters/google/egress";
import { type PlaceCard } from "../src/core/types";
import {
  assertEnvelopeParity,
  callMcpTool,
  getV1Health,
  issueTestCallerKey,
  parseEnvelope,
  postV1,
  postV1Chat,
  resetCallerDb,
} from "./helpers/http-v1";

const H02_BODY = {
  query: "ramen",
  near: { lat: 22.28, lng: 114.17 },
  providers: ["GOOGLE_MAPS"],
  locale: "EN",
} as const;

const H04_BODY = {
  query: "restaurant",
  near: { lat: 22.2819, lng: 114.158 },
  providers: ["GOOGLE_MAPS", "AMAP"],
  merge: true,
  locale: "EN",
} as const;

const H14_BODY = {
  query: "restaurant",
  near: { lat: 22.2819, lng: 114.158 },
  providers: ["GOOGLE_MAPS"],
  locale: "EN",
} as const;

type PlaceCardPayload = {
  name: string;
  provider?: string;
  category?: string;
  location: { lat: number; lng: number; crs: string };
  sources: { provider: string; native_id: string }[];
  tripadvisor?: { rating?: number };
};

describe("HTTP user test cases (TC-H01–H15)", () => {
  let auth: string;
  const envSnapshot = { ...process.env };

  beforeEach(async () => {
    process.env = { ...envSnapshot, PLACES_VENDOR_MODE: "fixture" };
    await resetCallerDb();
    auth = await issueTestCallerKey();
  });

  afterEach(async () => {
    process.env = { ...envSnapshot };
    resetGoogleLiveAdapterForTests();
    resetAmapLiveAdapterForTests();
    resetTripadvisorLiveForTests();
    resetOpenMeteoLiveForTests();
    vi.restoreAllMocks();
  });

  it("TC-H01: should_return_health_with_tools_list", async () => {
    const { status, body } = await getV1Health();
    expect(status).toBe(200);
    const env = parseEnvelope(body);
    expect(env.ok).toBe(true);
    expect(env.data?.tools).toEqual([
      "search_restaurants",
      "search_places",
      "plan_itinerary",
      "get_place_details",
      "geocode",
      "navigate",
      "chat",
    ]);
  });

  it("TC-H02: should_search_ramen_via_google_maps_near_hk", async () => {
    const { status, body } = await postV1<PlaceCardPayload[]>("search_restaurants", H02_BODY, auth);
    expect(status).toBe(200);
    const env = parseEnvelope(body);
    expect(env.ok).toBe(true);
    const cards = env.data ?? [];
    expect(cards.length).toBeGreaterThanOrEqual(1);
    expect(cards.some((c) => c.sources.some((s) => s.provider === "GOOGLE_MAPS"))).toBe(true);
  });

  it("TC-H03: should_search_amap_only_with_gcj02_coordinates", async () => {
    const { status, body } = await postV1<PlaceCardPayload[]>(
      "search_restaurants",
      { ...H02_BODY, providers: ["AMAP"] },
      auth,
    );
    expect(status).toBe(200);
    const env = parseEnvelope(body);
    expect(env.ok).toBe(true);
    const cards = env.data ?? [];
    expect(cards.length).toBeGreaterThanOrEqual(1);
    expect(cards.every((c) => c.location.crs === "GCJ-02")).toBe(true);
    expect(cards.every((c) => c.sources.some((s) => s.provider === "AMAP"))).toBe(true);
  });

  it("TC-H04: should_return_three_merged_cards_when_google_and_amap_merge", async () => {
    const { status, body } = await postV1<PlaceCardPayload[]>("search_restaurants", H04_BODY, auth);
    expect(status).toBe(200);
    const env = parseEnvelope(body);
    expect(env.ok).toBe(true);
    const cards = env.data ?? [];
    expect(cards).toHaveLength(3);
    const names = cards.map((c) => c.name);
    expect(names.some((n) => n.includes("Yat Lok"))).toBe(true);
    expect(names.some((n) => n.includes("Tim Ho Wan"))).toBe(true);
    expect(names.some((n) => n.includes("太興燒味"))).toBe(true);
    expect(env.skipped ?? []).toEqual([]);
  });

  it("TC-H05: should_attach_tripadvisor_enrich_on_google_search", async () => {
    const { status, body } = await postV1<PlaceCardPayload[]>(
      "search_restaurants",
      {
        query: "ramen",
        near: { lat: 22.28, lng: 114.17 },
        providers: ["GOOGLE_MAPS"],
        enrich: { tripadvisor: true },
        locale: "EN",
      },
      auth,
    );
    expect(status).toBe(200);
    const env = parseEnvelope(body);
    expect(env.ok).toBe(true);
    const cards = env.data ?? [];
    expect(cards.length).toBeGreaterThan(0);
    expect(cards[0]?.tripadvisor?.rating).toBeTypeOf("number");
    const query = getLastTripadvisorQuery();
    expect(query?.name).toBeTruthy();
    expect(query?.lat).toBeTypeOf("number");
    expect(String(query?.name)).not.toMatch(/fixture_/);
  });

  it("TC-H06: should_keep_google_cards_when_tripadvisor_enrich_fails", async () => {
    const { status, body } = await postV1<PlaceCardPayload[]>(
      "search_restaurants",
      {
        query: "__ta_fail__ ramen",
        near: { lat: 22.28, lng: 114.17 },
        providers: ["GOOGLE_MAPS"],
        enrich: { tripadvisor: true },
        locale: "EN",
      },
      auth,
    );
    expect(status).toBe(200);
    const env = parseEnvelope(body);
    expect(env.ok).toBe(true);
    expect((env.data ?? []).length).toBeGreaterThan(0);
    expect(env.skipped?.some((s) => s.provider === "TRIPADVISOR")).toBe(true);
  });

  it("TC-H07: should_search_non_dining_pois", async () => {
    const { status, body } = await postV1<PlaceCardPayload[]>(
      "search_places",
      {
        query: "museum",
        near: { lat: 22.3, lng: 114.18 },
        providers: ["GOOGLE_MAPS"],
        locale: "EN",
      },
      auth,
    );
    expect(status).toBe(200);
    const env = parseEnvelope(body);
    expect(env.ok).toBe(true);
    const cards = env.data ?? [];
    expect(cards.length).toBeGreaterThan(0);
    expect(cards.every((c) => c.category !== "restaurant")).toBe(true);
  });

  it("TC-H08: should_geocode_shanghai_and_navigate_without_secrets", async () => {
    const geo = await postV1<{ lat: number; lng: number; crs: string; address?: string }>(
      "geocode",
      { query: "上海爱琴海购物公园", providers: ["AMAP"], locale: "CN" },
      auth,
    );
    expect(geo.status).toBe(200);
    const geoEnv = parseEnvelope(geo.body);
    expect(geoEnv.ok).toBe(true);
    expect(geoEnv.data?.lat).toBeGreaterThan(30);
    expect(geoEnv.data?.lng).toBeGreaterThan(121);

    const nav = await postV1<Record<string, string>>(
      "navigate",
      {
        lat: geoEnv.data!.lat,
        lng: geoEnv.data!.lng,
        provider: "AMAP",
        locale: "CN",
      },
      auth,
    );
    expect(nav.status).toBe(200);
    const navEnv = parseEnvelope(nav.body);
    expect(navEnv.ok).toBe(true);
    const blob = JSON.stringify(navEnv.data);
    expect(blob).not.toMatch(/AIza|amap.*key|api_key=/i);
  });

  it("TC-H09: should_plan_itinerary_and_reject_reversed_bounds", async () => {
    const placesRes = await postV1<PlaceCardPayload[]>(
      "search_places",
      {
        query: "museum",
        near: { lat: 22.3, lng: 114.18 },
        providers: ["GOOGLE_MAPS"],
        locale: "EN",
      },
      auth,
    );
    const places = placesRes.body.data ?? [];

    const valid = await postV1<{ days: { weather?: { label_key: string } }[] }>(
      "plan_itinerary",
      {
        bounds: { start: "2026-09-01", end: "2026-09-03" },
        places,
        preferences: { pace: "relaxed" },
        locale: "HK",
      },
      auth,
    );
    expect(valid.status).toBe(200);
    const validEnv = parseEnvelope(valid.body);
    expect(validEnv.ok).toBe(true);
    expect((validEnv.data?.days ?? []).length).toBeGreaterThan(0);
    expect(validEnv.data?.days[0]?.weather?.label_key).toMatch(/^weather\.wmo\./);

    const invalid = await postV1(
      "plan_itinerary",
      {
        bounds: { start: "2026-09-05", end: "2026-09-01" },
        places: FIXTURE_POIS.slice(0, 2),
        locale: "HK",
      },
      auth,
    );
    expect(invalid.status).toBe(400);
    const invalidEnv = parseEnvelope(invalid.body);
    expect(invalidEnv.ok).toBe(false);
    expect(invalidEnv.outcome?.key).toBe("errors.bounds_invalid");
  });

  it("TC-H10: should_run_nl_chat_and_invoke_search_restaurants", async () => {
    const { status, body } = await postV1Chat<{
      message: { content: string };
      tool_calls: string[];
    }>(
      {
        messages: [{ role: "user", content: "ramen near Tsim Sha Tsui" }],
        locale: "EN",
      },
      auth,
    );
    expect(status).toBe(200);
    const env = parseEnvelope(body);
    expect(env.ok).toBe(true);
    expect(env.data?.message.content.length).toBeGreaterThan(0);
    expect(env.data?.tool_calls).toContain("search_restaurants");
  });

  it("TC-H11: should_reject_unsupported_upload_mime", async () => {
    const badMime = await postV1Chat(
      {
        messages: [{ role: "user", content: "what is this place" }],
        attachments: [
          {
            filename: "x.exe",
            mime_type: "application/x-msdownload",
            content_base64: Buffer.from("test").toString("base64"),
          },
        ],
        locale: "CN",
      },
      auth,
    );
    expect(badMime.status).toBe(400);
    const badEnv = parseEnvelope(badMime.body);
    expect(badEnv.ok).toBe(false);
    expect(badEnv.outcome?.key).toBe("errors.upload_unsupported");

    const big = Buffer.alloc(6 * 1024 * 1024, 1);
    const oversize = await postV1Chat(
      {
        messages: [{ role: "user", content: "photo place" }],
        attachments: [
          {
            filename: "big.jpg",
            mime_type: "image/jpeg",
            content_base64: big.toString("base64"),
          },
        ],
        locale: "EN",
      },
      auth,
    );
    expect(oversize.status).toBe(400);
    const overEnv = parseEnvelope(oversize.body);
    expect(overEnv.ok).toBe(false);
    expect(overEnv.outcome?.key).toBe("errors.upload_too_large");
  });

  it("TC-H12: should_match_mcp_envelope_for_same_search_body_as_http", async () => {
    const http = await postV1<PlaceCardPayload[]>("search_restaurants", H02_BODY, auth);
    expect(http.status).toBe(200);
    const httpEnv = parseEnvelope(http.body);

    const mcpEnv = await callMcpTool("search_restaurants", { ...H02_BODY });
    assertEnvelopeParity(httpEnv, mcpEnv);
  });

  it("TC-H13: should_skip_unconfigured_amap_in_live_mode", async () => {
    process.env.PLACES_VENDOR_MODE = "live";
    delete process.env.AMAP_API_KEY;
    process.env.GOOGLE_MAPS_API_KEY = "test-google-key";

    const { status, body } = await postV1<PlaceCardPayload[]>(
      "search_restaurants",
      { query: "restaurant", providers: ["AMAP"], locale: "EN" },
      auth,
    );
    expect(status).toBe(200);
    const env = parseEnvelope(body);
    expect(env.skipped?.some((s) => s.provider === "AMAP" && s.reason_key === "errors.provider_unconfigured")).toBe(
      true,
    );
    expect(env.data ?? []).toEqual([]);
  });

  it("TC-H14: should_return_two_google_cards_when_google_maps_only", async () => {
    const { status, body } = await postV1<PlaceCardPayload[]>("search_restaurants", H14_BODY, auth);
    expect(status).toBe(200);
    const env = parseEnvelope(body);
    expect(env.ok).toBe(true);
    const cards = env.data ?? [];
    expect(cards).toHaveLength(2);
    const names = cards.map((c) => c.name);
    expect(names.some((n) => n.includes("Yat Lok"))).toBe(true);
    expect(names.some((n) => n.includes("Tim Ho Wan"))).toBe(true);
    expect(cards.every((c) => c.sources.every((s) => s.provider === "GOOGLE_MAPS"))).toBe(true);
    expect(env.skipped ?? []).toEqual([]);
  });

  it("TC-H15: should_return_live_google_cards_via_worker_fallback_on_http", async () => {
    resetGoogleLiveAdapterForTests();
    process.env.PLACES_VENDOR_MODE = "live";
    process.env.GOOGLE_DIRECT_FORCE_FAIL = "1";
    process.env.GOOGLE_MAPS_API_KEY = "test-google-key";
    process.env.GMAPS_MCP_URL = "https://maps-mcp.example/mcp";
    process.env.GMAPS_MCP_BEARER = "test-mcp-bearer";

    const liveCard: PlaceCard = {
      provider: "GOOGLE_MAPS",
      name: "Bistronomique",
      location: { lat: 22.2819, lng: 114.158, crs: "WGS84" },
      category: "restaurant",
      sources: [
        {
          provider: "GOOGLE_MAPS",
          native_id: "ChIJ_tc_h15_live",
          deeplinks: { google_web: "https://maps.google.com" },
        },
      ],
    };

    const worker = {
      callCount: () => 1,
      searchRestaurants: vi.fn(async () => [liveCard]),
      searchPlaces: vi.fn(async () => [liveCard]),
      getDetails: vi.fn(async () => liveCard),
      geocode: vi.fn(async () => ({ lat: 22.28, lng: 114.16, crs: "WGS84" as const, address: "Central" })),
      reverseGeocode: vi.fn(async () => "Central"),
    };

    const direct = {
      searchRestaurants: vi.fn(async () => {
        throw new EgressFailureError();
      }),
      searchPlaces: vi.fn(async () => {
        throw new EgressFailureError();
      }),
      getDetails: vi.fn(async () => null),
      geocode: vi.fn(async () => {
        throw new EgressFailureError();
      }),
      reverseGeocode: vi.fn(async () => "Central"),
    };

    const adapter = createGoogleLiveAdapter({
      config: {
        apiKey: "test-google-key",
        placesBaseUrl: "https://places.googleapis.com/v1",
        geocodeBaseUrl: "https://maps.googleapis.com",
        mcpUrl: "https://maps-mcp.example/mcp",
        mcpBearer: "test-mcp-bearer",
        directForceFail: true,
        requestTimeoutMs: 5000,
      },
      direct,
      worker,
    });
    setGoogleLiveAdapterForTests(adapter);

    const { status, body } = await postV1<PlaceCardPayload[]>("search_restaurants", H14_BODY, auth);
    expect(status).toBe(200);
    const env = parseEnvelope(body);
    expect(env.ok).toBe(true);
    const cards = env.data ?? [];
    expect(cards.length).toBeGreaterThanOrEqual(1);
    expect(cards.every((c) => c.sources.every((s) => s.provider === "GOOGLE_MAPS"))).toBe(true);
    expect(cards.every((c) => c.sources.every((s) => !s.native_id.startsWith("fixture_")))).toBe(true);
  });

  it("should_return_live_amap_cards_without_fixture_ids_on_http", async () => {
    resetAmapLiveAdapterForTests();
    process.env.PLACES_VENDOR_MODE = "live";
    process.env.AMAP_API_KEY = "test-amap-key";

    const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
      const href =
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const url = new URL(href);
      if (url.pathname.includes("/geocode/geo")) {
        return new Response(
          JSON.stringify({
            status: "1",
            infocode: "10000",
            geocodes: [{ location: "121.364597,31.172796", formatted_address: "紫藤路站" }],
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.pathname.includes("/place/around")) {
        return new Response(
          JSON.stringify({
            status: "1",
            infocode: "10000",
            pois: [
              {
                id: "B00155BBQ",
                name: "大茗烧烤",
                location: "121.3646,31.1728",
                address: "闵行区紫藤路",
              },
            ],
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      }
      throw new Error(`unexpected ${url.pathname}`);
    });

    setAmapLiveAdapterForTests(
      createAmapLiveAdapter({
        config: {
          apiKey: "test-amap-key",
          baseUrl: "https://restapi.amap.com",
          requestTimeoutMs: 5000,
        },
        fetchFn,
      }),
    );

    const { status, body } = await postV1<PlaceCardPayload[]>(
      "search_restaurants",
      {
        cuisine: "barbecue",
        address: "上海地铁十号线紫藤路站",
        providers: ["AMAP"],
        locale: "CN",
      },
      auth,
    );
    expect(status).toBe(200);
    const env = parseEnvelope(body);
    expect(env.ok).toBe(true);
    const cards = env.data ?? [];
    expect(cards.length).toBeGreaterThanOrEqual(1);
    expect(cards.every((c) => c.provider === "AMAP")).toBe(true);
    expect(cards.every((c) => c.location.crs === "GCJ-02")).toBe(true);
    expect(cards.every((c) => c.sources.every((s) => s.provider === "AMAP"))).toBe(true);
    expect(cards.every((c) => c.sources.every((s) => !s.native_id.startsWith("fixture_")))).toBe(true);
    expect(fetchFn).toHaveBeenCalled();
  });

  it("should_attach_live_terra_rating_without_using_google_native_id", async () => {
    resetGoogleLiveAdapterForTests();
    resetTripadvisorLiveForTests();
    process.env.PLACES_VENDOR_MODE = "live";
    process.env.GOOGLE_MAPS_API_KEY = "test-google-key";
    process.env.TRIPADVISOR_API_KEY = "test-terra-key";
    delete process.env.GOOGLE_DIRECT_FORCE_FAIL;

    const liveCard: PlaceCard = {
      provider: "GOOGLE_MAPS",
      name: "Yat Lok Roast Goose",
      location: { lat: 22.2826, lng: 114.1553, crs: "WGS84" },
      category: "restaurant",
      sources: [
        {
          provider: "GOOGLE_MAPS",
          native_id: "ChIJ_live_yat_lok",
          deeplinks: { google_web: "https://maps.google.com" },
        },
      ],
    };

    const googleDirect = {
      searchRestaurants: vi.fn(async () => [liveCard]),
      searchPlaces: vi.fn(async () => [liveCard]),
      getDetails: vi.fn(async () => liveCard),
      geocode: vi.fn(async () => ({ lat: 22.28, lng: 114.16, crs: "WGS84" as const })),
      reverseGeocode: vi.fn(async () => "Central"),
    };
    setGoogleLiveAdapterForTests(
      createGoogleLiveAdapter({
        config: {
          apiKey: "test-google-key",
          placesBaseUrl: "https://places.googleapis.com/v1",
          geocodeBaseUrl: "https://maps.googleapis.com",
          mcpUrl: undefined,
          mcpBearer: undefined,
          directForceFail: false,
          requestTimeoutMs: 5000,
        },
        direct: googleDirect,
        worker: null,
      }),
    );

    const terraFetch = vi.fn(async (input: RequestInfo | URL) => {
      const href =
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      expect(href).not.toContain("ChIJ_live_yat_lok");
      expect(href).not.toContain("location_id=");
      return new Response(
        JSON.stringify({
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
          ],
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    });
    setTripadvisorLiveForTests(
      createTripadvisorDirectClient(
        {
          apiKey: "test-terra-key",
          baseUrl: "https://terra.tripadvisor.com/api",
          requestTimeoutMs: 5000,
        },
        terraFetch,
      ),
    );

    const { status, body } = await postV1<PlaceCardPayload[]>(
      "search_restaurants",
      {
        query: "Yat",
        near: { lat: 22.2826, lng: 114.1553 },
        providers: ["GOOGLE_MAPS"],
        enrich: { tripadvisor: true },
        locale: "EN",
      },
      auth,
    );
    expect(status).toBe(200);
    const env = parseEnvelope(body);
    expect(env.ok).toBe(true);
    const cards = env.data ?? [];
    expect(cards.length).toBeGreaterThanOrEqual(1);
    expect(cards[0]?.tripadvisor?.rating).toBe(4.3);
    expect(cards[0]?.sources.every((s) => s.native_id === "ChIJ_live_yat_lok")).toBe(true);
    expect(terraFetch).toHaveBeenCalled();
  });

  it("should_attach_live_open_meteo_weather_on_itinerary", async () => {
    resetOpenMeteoLiveForTests();
    process.env.PLACES_VENDOR_MODE = "live";
    const omFetch = vi.fn(async (input: RequestInfo | URL) => {
      const href =
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      expect(href).toContain("/forecast");
      expect(href).not.toContain("weatherInfo");
      expect(href).not.toContain("weather.googleapis.com");
      return new Response(
        JSON.stringify({
          daily: {
            time: ["2026-08-20", "2026-08-21"],
            weather_code: [61, 3],
            temperature_2m_max: [30, 29],
            temperature_2m_min: [25, 24],
          },
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    });
    setOpenMeteoLiveForTests(
      createOpenMeteoDirectClient(
        {
          apiKey: undefined,
          baseUrl: "https://api.open-meteo.com/v1",
          requestTimeoutMs: 5000,
        },
        omFetch,
      ),
    );

    const { status, body } = await postV1<{
      days: { weather?: { weather_code?: number; label_key?: string } }[];
    }>(
      "plan_itinerary",
      {
        bounds: { start: "2026-08-20", end: "2026-08-21" },
        places: FIXTURE_POIS.slice(0, 2),
        locale: "EN",
      },
      auth,
    );
    expect(status).toBe(200);
    const env = parseEnvelope(body);
    expect(env.ok).toBe(true);
    expect(env.data?.days[0]?.weather?.weather_code).toBe(61);
    expect(env.data?.days[0]?.weather?.label_key).toBe("weather.wmo.61");
    expect(omFetch).toHaveBeenCalled();
  });
});
