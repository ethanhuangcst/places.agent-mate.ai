import { loadTripadvisorAdapterConfig, type TripadvisorAdapterConfig } from "./config";
import { createTripadvisorDirectClient, type FetchFn, type TripadvisorLiveClient } from "./direct";

export type TripadvisorLiveDeps = {
  config?: TripadvisorAdapterConfig;
  fetchFn?: FetchFn;
  client?: TripadvisorLiveClient;
};

export function createTripadvisorLiveClient(deps: TripadvisorLiveDeps = {}): TripadvisorLiveClient | null {
  if (deps.client) return deps.client;
  const config = deps.config ?? loadTripadvisorAdapterConfig();
  if (!config.apiKey) return null;
  return createTripadvisorDirectClient(config, deps.fetchFn);
}

let runtime: TripadvisorLiveClient | null | undefined;

export function getTripadvisorLiveClient(): TripadvisorLiveClient | null {
  if (runtime !== undefined) return runtime;
  runtime = createTripadvisorLiveClient();
  return runtime;
}

export function resetTripadvisorLiveForTests(): void {
  runtime = undefined;
}

export function setTripadvisorLiveForTests(client: TripadvisorLiveClient | null): void {
  runtime = client;
}
