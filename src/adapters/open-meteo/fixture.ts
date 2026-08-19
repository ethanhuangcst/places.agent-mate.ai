import { isLiveVendorMode } from "../../core/vendor-mode";
import { getOpenMeteoLiveClient } from "./live";
import { type WeatherAdapter, type WeatherForecast } from "./types";

export type { WeatherAdapter, WeatherForecast };

export function getWeatherAdapter(): WeatherAdapter {
  if (isLiveVendorMode()) {
    const live = getOpenMeteoLiveClient();
    if (!live) {
      return {
        async fetchForecast() {
          throw new Error("open_meteo_live_unconfigured");
        },
      };
    }
    return live;
  }
  return {
    async fetchForecast(input) {
      if (input.lat === 0 && input.lng === 0) return null;
      if (input.date.includes("__weather_fail__")) {
        throw new Error("weather_fail");
      }
      return {
        weather_code: 80,
        temp_max_c: 24,
        temp_min_c: 18,
        provider: "OPEN_METEO",
      };
    },
  };
}
