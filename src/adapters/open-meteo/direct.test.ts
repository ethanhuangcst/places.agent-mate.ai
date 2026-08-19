import { describe, expect, it } from "vitest";
import { createOpenMeteoDirectClient, type FetchFn } from "./direct";
import { type OpenMeteoAdapterConfig } from "./config";

const dailyOk = {
  daily: {
    time: ["2026-08-19", "2026-08-20", "2026-08-21"],
    weather_code: [3, 61, 80],
    temperature_2m_max: [31.2, 29.0, 27.5],
    temperature_2m_min: [26.1, 25.0, 24.8],
  },
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function testConfig(overrides: Partial<OpenMeteoAdapterConfig> = {}): OpenMeteoAdapterConfig {
  return {
    apiKey: undefined,
    baseUrl: "https://api.open-meteo.com/v1",
    requestTimeoutMs: 5000,
    ...overrides,
  };
}

function recordFetch(handler: (url: URL) => Response | unknown): {
  fetchFn: FetchFn;
  urls: URL[];
} {
  const urls: URL[] = [];
  const fetchFn: FetchFn = async (input) => {
    const href =
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(href);
    urls.push(url);
    const result = handler(url);
    return result instanceof Response ? result : jsonResponse(result);
  };
  return { fetchFn, urls };
}

describe("Open-Meteo direct client", () => {
  it("should_call_forecast_with_lat_lon_daily_and_timezone", async () => {
    const { fetchFn, urls } = recordFetch(() => dailyOk);
    const client = createOpenMeteoDirectClient(testConfig(), fetchFn);
    await client.fetchForecast({ lat: 22.2819, lng: 114.158, date: "2026-08-20" });
    expect(urls).toHaveLength(1);
    expect(urls[0]?.pathname.endsWith("/forecast")).toBe(true);
    expect(urls[0]?.searchParams.get("latitude")).toBe("22.2819");
    expect(urls[0]?.searchParams.get("longitude")).toBe("114.158");
    expect(urls[0]?.searchParams.get("daily")).toBe(
      "weather_code,temperature_2m_max,temperature_2m_min",
    );
    expect(urls[0]?.searchParams.get("timezone")).toBe("auto");
  });

  it("should_not_call_amap_weather_or_google_weather", async () => {
    const { fetchFn, urls } = recordFetch(() => dailyOk);
    const client = createOpenMeteoDirectClient(testConfig(), fetchFn);
    await client.fetchForecast({ lat: 22.28, lng: 114.17, date: "2026-08-20" });
    const href = urls[0]?.toString() ?? "";
    expect(href).not.toMatch(/restapi\.amap\.com/);
    expect(href).not.toMatch(/weatherInfo/);
    expect(href).not.toMatch(/weather\.googleapis\.com/);
  });

  it("should_map_daily_row_for_requested_date", async () => {
    const { fetchFn } = recordFetch(() => dailyOk);
    const client = createOpenMeteoDirectClient(testConfig(), fetchFn);
    const forecast = await client.fetchForecast({
      lat: 22.2819,
      lng: 114.158,
      date: "2026-08-20",
    });
    expect(forecast?.weather_code).toBe(61);
    expect(forecast?.temp_max_c).toBe(29);
    expect(forecast?.temp_min_c).toBe(25);
    expect(forecast?.provider).toBe("OPEN_METEO");
  });

  it("should_return_null_when_date_missing_from_daily", async () => {
    const { fetchFn } = recordFetch(() => dailyOk);
    const client = createOpenMeteoDirectClient(testConfig(), fetchFn);
    const forecast = await client.fetchForecast({
      lat: 22.28,
      lng: 114.17,
      date: "2027-01-01",
    });
    expect(forecast).toBeNull();
  });

  it("should_throw_when_open_meteo_http_fails", async () => {
    const { fetchFn } = recordFetch(() => jsonResponse({ error: true }, 500));
    const client = createOpenMeteoDirectClient(testConfig(), fetchFn);
    await expect(
      client.fetchForecast({ lat: 22.28, lng: 114.17, date: "2026-08-20" }),
    ).rejects.toThrow(/open_meteo_/);
  });

  it("should_send_apikey_when_configured", async () => {
    const { fetchFn, urls } = recordFetch(() => dailyOk);
    const client = createOpenMeteoDirectClient(testConfig({ apiKey: "test-om-key" }), fetchFn);
    await client.fetchForecast({ lat: 22.28, lng: 114.17, date: "2026-08-20" });
    expect(urls[0]?.searchParams.get("apikey")).toBe("test-om-key");
  });
});
