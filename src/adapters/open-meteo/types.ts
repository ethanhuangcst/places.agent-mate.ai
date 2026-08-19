export type WeatherForecast = {
  weather_code: number;
  temp_max_c?: number;
  temp_min_c?: number;
  provider: "OPEN_METEO";
};

export type WeatherAdapter = {
  fetchForecast(input: {
    lat: number;
    lng: number;
    date: string;
  }): Promise<WeatherForecast | null>;
};
