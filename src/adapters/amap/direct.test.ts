import { describe, expect, it } from "vitest";
import { createAmapDirectClient, type FetchFn } from "./direct";
import { type AmapAdapterConfig } from "./config";

const SAMPLE_POI = {
  id: "B00155BBQ",
  name: "大茗烧烤",
  location: "121.3646,31.1728",
  address: "闵行区紫藤路",
  type: "餐饮服务;烧烤",
  business: { rating: "4.6", tel: "021-00000000" },
};

const OK_POIS = { status: "1", infocode: "10000", pois: [SAMPLE_POI] };
const OK_EMPTY = { status: "1", infocode: "10000", pois: [] };
const OK_GEO = {
  status: "1",
  infocode: "10000",
  geocodes: [{ location: "121.364597,31.172796", formatted_address: "上海市闵行区紫藤路" }],
};
const OK_CONVERT = { status: "1", infocode: "10000", locations: "121.370000,31.175000" };
const FAIL_BODY = { status: "0", infocode: "10001", info: "INVALID_USER_KEY" };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function testConfig(overrides: Partial<AmapAdapterConfig> = {}): AmapAdapterConfig {
  return {
    apiKey: "test-amap-key",
    baseUrl: "https://restapi.amap.com",
    requestTimeoutMs: 5000,
    ...overrides,
  };
}

function recordFetch(handler: (url: URL) => unknown): { fetchFn: FetchFn; urls: URL[] } {
  const urls: URL[] = [];
  const fetchFn: FetchFn = async (input) => {
    const href =
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(href);
    urls.push(url);
    return jsonResponse(handler(url));
  };
  return { fetchFn, urls };
}

describe("AMAP live direct client", () => {
  it("should_call_around_with_lng_lat_and_dining_type_when_near_present", async () => {
    const { fetchFn, urls } = recordFetch((url) => {
      if (url.pathname.includes("/coordinate/convert")) return OK_CONVERT;
      if (url.pathname.includes("/place/around")) return OK_POIS;
      throw new Error(`unexpected ${url.pathname}`);
    });
    const client = createAmapDirectClient(testConfig(), fetchFn);

    await client.searchRestaurants({
      near: { lat: 31.172796, lng: 121.364597 },
      query: "烧烤",
    });

    const around = urls.find((u) => u.pathname.includes("/place/around"));
    expect(around).toBeDefined();
    expect(around?.searchParams.get("location")).toBe("121.370000,31.175000");
    expect(around?.searchParams.get("types")).toBe("050000");
    expect(around?.searchParams.get("radius")).toBe("1000");
    expect(around?.searchParams.get("sortrule")).toBe("distance");
    expect(around?.searchParams.get("keywords")).toBe("烧烤");
    const loc = around?.searchParams.get("location") ?? "";
    const [lng, lat] = loc.split(",").map(Number);
    expect(lng).toBeGreaterThan(lat);
  });

  it("should_geocode_address_then_around_when_address_without_near", async () => {
    const { fetchFn, urls } = recordFetch((url) => {
      if (url.pathname.includes("/geocode/geo")) return OK_GEO;
      if (url.pathname.includes("/place/around")) return OK_POIS;
      throw new Error(`unexpected ${url.pathname}`);
    });
    const client = createAmapDirectClient(testConfig(), fetchFn);

    await client.searchRestaurants({
      address: "上海地铁十号线紫藤路站",
      cuisine: "barbecue",
    });

    expect(urls.some((u) => u.pathname.includes("/geocode/geo"))).toBe(true);
    expect(urls.some((u) => u.pathname.includes("/coordinate/convert"))).toBe(false);
    const geo = urls.find((u) => u.pathname.includes("/geocode/geo"));
    expect(geo?.searchParams.get("address")).toBe("上海地铁十号线紫藤路站");
    const around = urls.find((u) => u.pathname.includes("/place/around"));
    expect(around?.searchParams.get("location")).toBe("121.364597,31.172796");
    expect(around?.searchParams.get("types")).toBe("050000");
    expect(around?.searchParams.get("keywords")).toContain("烧烤");
  });

  it("should_put_mapped_cuisine_in_keywords_when_query_missing", async () => {
    const { fetchFn, urls } = recordFetch((url) => {
      if (url.pathname.includes("/place/text")) return OK_POIS;
      throw new Error(`unexpected ${url.pathname}`);
    });
    const client = createAmapDirectClient(testConfig(), fetchFn);

    await client.searchRestaurants({ cuisine: "barbecue" });

    const text = urls.find((u) => u.pathname.includes("/place/text"));
    expect(text).toBeDefined();
    expect(text?.searchParams.get("keywords")).toBe("烧烤");
    expect(text?.searchParams.get("types")).toBe("050000");
  });

  it("should_call_text_search_when_no_pin", async () => {
    const { fetchFn, urls } = recordFetch((url) => {
      if (url.pathname.includes("/place/text")) return OK_POIS;
      throw new Error(`unexpected ${url.pathname}`);
    });
    const client = createAmapDirectClient(testConfig(), fetchFn);

    await client.searchRestaurants({ query: "烧烤" });

    expect(urls).toHaveLength(1);
    expect(urls[0]?.pathname).toContain("/v5/place/text");
    expect(urls[0]?.searchParams.get("keywords")).toBe("烧烤");
    expect(urls[0]?.searchParams.get("types")).toBe("050000");
  });

  it("should_skip_amap_gps_convert_when_near_is_gcj02", async () => {
    const { fetchFn, urls } = recordFetch((url) => {
      if (url.pathname.includes("/place/around")) return OK_POIS;
      throw new Error(`unexpected ${url.pathname}`);
    });
    const client = createAmapDirectClient(testConfig(), fetchFn);

    await client.searchPlaces({
      query: "博物馆",
      near: { lat: 31.23, lng: 121.47, crs: "GCJ-02" },
    });

    expect(urls.some((u) => u.pathname.includes("/coordinate/convert"))).toBe(false);
    const around = urls.find((u) => u.pathname.includes("/place/around"));
    expect(around?.searchParams.get("location")).toBe("121.470000,31.230000");
    expect(Number(around?.searchParams.get("radius"))).toBeGreaterThanOrEqual(10000);
    expect(around?.searchParams.get("types")).toBeNull();
  });

  it("should_convert_wgs_near_before_around", async () => {
    const { fetchFn, urls } = recordFetch((url) => {
      if (url.pathname.includes("/coordinate/convert")) return OK_CONVERT;
      if (url.pathname.includes("/place/around")) return OK_POIS;
      throw new Error(`unexpected ${url.pathname}`);
    });
    const client = createAmapDirectClient(testConfig(), fetchFn);

    await client.searchRestaurants({
      near: { lat: 31.172796, lng: 121.364597 },
    });

    const convert = urls.find((u) => u.pathname.includes("/coordinate/convert"));
    expect(convert?.searchParams.get("coordsys")).toBe("gps");
    expect(convert?.searchParams.get("locations")).toBe("121.364597,31.172796");
    expect(urls[0]?.pathname).toContain("/coordinate/convert");
    expect(urls[1]?.pathname).toContain("/place/around");
  });

  it("should_emit_gcj02_cards_without_fixture_native_ids", async () => {
    const { fetchFn } = recordFetch((url) => {
      if (url.pathname.includes("/place/text")) return OK_POIS;
      throw new Error(`unexpected ${url.pathname}`);
    });
    const client = createAmapDirectClient(testConfig(), fetchFn);

    const cards = await client.searchRestaurants({ query: "烧烤" });
    expect(cards).toHaveLength(1);
    const card = cards[0]!;
    expect(card.provider).toBe("AMAP");
    expect(card.location.crs).toBe("GCJ-02");
    expect(card.location.lng).toBe(121.3646);
    expect(card.location.lat).toBe(31.1728);
    expect(card.name).toBe("大茗烧烤");
    expect(card.sources[0]?.native_id).toBe("B00155BBQ");
    expect(card.sources[0]?.native_id.startsWith("fixture_")).toBe(false);
    expect(card.sources[0]?.deeplinks.amap_web).toContain("position=121.3646,31.1728");
    expect(card.sources[0]?.deeplinks.amap_web).not.toContain("test-amap-key");
  });

  it("should_throw_when_amap_status_is_not_ok", async () => {
    const { fetchFn } = recordFetch(() => FAIL_BODY);
    const client = createAmapDirectClient(testConfig(), fetchFn);

    await expect(client.searchRestaurants({ query: "烧烤" })).rejects.toThrow(/amap_/);
  });

  it("should_return_empty_list_when_pois_empty", async () => {
    const { fetchFn } = recordFetch(() => OK_EMPTY);
    const client = createAmapDirectClient(testConfig(), fetchFn);

    await expect(client.searchRestaurants({ query: "xyznonexistentplace" })).resolves.toEqual([]);
  });

  it("should_omit_dining_type_when_searching_places", async () => {
    const { fetchFn, urls } = recordFetch((url) => {
      if (url.pathname.includes("/place/text")) return OK_POIS;
      throw new Error(`unexpected ${url.pathname}`);
    });
    const client = createAmapDirectClient(testConfig(), fetchFn);

    await client.searchPlaces({ query: "博物馆" });
    expect(urls[0]?.pathname).toContain("/v5/place/text");
    expect(urls[0]?.searchParams.get("types")).toBeNull();
    expect(urls[0]?.searchParams.get("keywords")).toBe("博物馆");
  });

  it("should_get_details_geocode_and_reverse", async () => {
    const { fetchFn, urls } = recordFetch((url) => {
      if (url.pathname.includes("/place/detail")) return OK_POIS;
      if (url.pathname.includes("/geocode/geo")) return OK_GEO;
      if (url.pathname.includes("/geocode/regeo")) {
        return { status: "1", infocode: "10000", regeocode: { formatted_address: "闵行区紫藤路" } };
      }
      throw new Error(`unexpected ${url.pathname}`);
    });
    const client = createAmapDirectClient(testConfig(), fetchFn);
    const detail = await client.getDetails("B00155BBQ");
    expect(detail?.name).toBe("大茗烧烤");
    const pin = await client.geocode("上海地铁十号线紫藤路站");
    expect(pin.crs).toBe("GCJ-02");
    expect(pin.lat).toBeCloseTo(31.172796);
    const addr = await client.reverseGeocode(31.17, 121.36);
    expect(addr).toContain("紫藤路");
    expect(urls.some((u) => u.pathname.includes("/place/detail"))).toBe(true);
  });

  it("should_return_null_when_detail_id_blank_or_empty_pois", async () => {
    const { fetchFn } = recordFetch(() => OK_EMPTY);
    const client = createAmapDirectClient(testConfig(), fetchFn);
    await expect(client.getDetails("  ")).resolves.toBeNull();
    await expect(client.getDetails("B0")).resolves.toBeNull();
  });

  it("should_throw_when_http_not_ok_or_key_missing", async () => {
    const fetchFn: FetchFn = async () => new Response("nope", { status: 500 });
    const client = createAmapDirectClient(testConfig(), fetchFn);
    await expect(client.searchPlaces({ query: "x" })).rejects.toThrow(/amap_http_500/);
    const noKey = createAmapDirectClient(testConfig({ apiKey: "" }), fetchFn);
    await expect(noKey.searchPlaces({ query: "x" })).rejects.toThrow(/amap_no_api_key/);
  });

  it("should_throw_when_gps_convert_empty", async () => {
    const { fetchFn } = recordFetch((url) => {
      if (url.pathname.includes("/coordinate/convert")) {
        return { status: "1", infocode: "10000", locations: "" };
      }
      throw new Error(`unexpected ${url.pathname}`);
    });
    const client = createAmapDirectClient(testConfig(), fetchFn);
    await expect(
      client.searchPlaces({ query: "x", near: { lat: 31.17, lng: 121.36 } }),
    ).rejects.toThrow(/amap_convert_empty/);
  });

  it("should_wrap_egress_on_fetch_failure", async () => {
    const err = Object.assign(new Error("fetch failed"), { code: "ENOTFOUND" });
    const fetchFn: FetchFn = async () => {
      throw err;
    };
    const client = createAmapDirectClient(testConfig(), fetchFn);
    await expect(client.searchPlaces({ query: "x" })).rejects.toThrow(/amap_egress_failure/);
  });

  it("should_rethrow_non_egress_fetch_errors", async () => {
    const fetchFn: FetchFn = async () => {
      throw new Error("boom-parse");
    };
    const client = createAmapDirectClient(testConfig(), fetchFn);
    await expect(client.searchPlaces({ query: "x" })).rejects.toThrow(/boom-parse/);
  });
});
