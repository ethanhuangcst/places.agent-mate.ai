import { afterEach, describe, expect, it } from "vitest";
import { enrichWithTripadvisor } from "../src/core/enrich";
import { getWeatherAdapter } from "../src/adapters/open-meteo/fixture";
import { resetTripadvisorLiveForTests } from "../src/adapters/tripadvisor/live";
import {
  resetOpenMeteoLiveForTests,
  setOpenMeteoLiveForTests,
} from "../src/adapters/open-meteo/live";
import { createOpenMeteoDirectClient } from "../src/adapters/open-meteo/direct";
import { planItinerary } from "../src/core/itinerary";
import { type PlaceCard } from "../src/core/types";
import { FIXTURE_POIS } from "../src/adapters/fixtures";

const yatLok: PlaceCard = {
  provider: "GOOGLE_MAPS",
  name: "Yat Lok Roast Goose",
  location: { lat: 22.2826, lng: 114.1553, crs: "WGS84" },
  category: "restaurant",
  sources: [
    {
      provider: "GOOGLE_MAPS",
      native_id: "fixture_yat_lok",
      deeplinks: {},
    },
  ],
};

describe("ADR-021 live vendor honesty", () => {
  const mode = process.env.PLACES_VENDOR_MODE;
  const taKey = process.env.TRIPADVISOR_API_KEY;

  afterEach(() => {
    process.env.PLACES_VENDOR_MODE = mode;
    if (taKey === undefined) delete process.env.TRIPADVISOR_API_KEY;
    else process.env.TRIPADVISOR_API_KEY = taKey;
    resetTripadvisorLiveForTests();
    resetOpenMeteoLiveForTests();
  });

  it("should_omit_fixture_tripadvisor_ratings_when_live_and_key_missing", async () => {
    process.env.PLACES_VENDOR_MODE = "live";
    delete process.env.TRIPADVISOR_API_KEY;
    resetTripadvisorLiveForTests();
    const result = await enrichWithTripadvisor([yatLok]);
    expect(result.cards[0]?.tripadvisor).toBeUndefined();
    expect(result.skipped).toContainEqual({
      provider: "TRIPADVISOR",
      reason_key: "errors.provider_unconfigured",
    });
  });

  it("should_not_return_fixture_weather_when_live_mode_has_no_live_client", async () => {
    process.env.PLACES_VENDOR_MODE = "live";
    setOpenMeteoLiveForTests(null);
    await expect(
      getWeatherAdapter().fetchForecast({ lat: 22.28, lng: 114.17, date: "2026-08-20" }),
    ).rejects.toThrow(/open_meteo_live_unconfigured/);
  });

  it("should_keep_itinerary_and_omit_fixture_weather_when_live_forecast_fails", async () => {
    process.env.PLACES_VENDOR_MODE = "live";
    setOpenMeteoLiveForTests(
      createOpenMeteoDirectClient(
        {
          apiKey: undefined,
          baseUrl: "https://api.open-meteo.com/v1",
          requestTimeoutMs: 5000,
        },
        async () => new Response("boom", { status: 500 }),
      ),
    );
    const result = await planItinerary({
      bounds: { start: "2026-08-20", end: "2026-08-21" },
      places: FIXTURE_POIS.slice(0, 2) as PlaceCard[],
      locale: "EN",
    });
    expect(result.data?.days.length).toBeGreaterThan(0);
    expect(result.data?.days[0]?.weather).toBeUndefined();
    expect(result.skipped).toContainEqual({
      provider: "OPEN_METEO",
      reason_key: "errors.weather_unavailable",
    });
  });
});
