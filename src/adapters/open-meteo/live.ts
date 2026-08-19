import { loadOpenMeteoAdapterConfig, type OpenMeteoAdapterConfig } from "./config";
import { createOpenMeteoDirectClient, type FetchFn } from "./direct";
import { type WeatherAdapter } from "./types";

export type OpenMeteoLiveDeps = {
  config?: OpenMeteoAdapterConfig;
  fetchFn?: FetchFn;
  client?: WeatherAdapter;
};

export function createOpenMeteoLiveClient(deps: OpenMeteoLiveDeps = {}): WeatherAdapter {
  if (deps.client) return deps.client;
  const config = deps.config ?? loadOpenMeteoAdapterConfig();
  return createOpenMeteoDirectClient(config, deps.fetchFn);
}

let runtime: WeatherAdapter | null | undefined;

export function getOpenMeteoLiveClient(): WeatherAdapter | null {
  if (runtime !== undefined) return runtime;
  runtime = createOpenMeteoLiveClient();
  return runtime;
}

export function resetOpenMeteoLiveForTests(): void {
  runtime = undefined;
}

export function setOpenMeteoLiveForTests(client: WeatherAdapter | null): void {
  runtime = client;
}
