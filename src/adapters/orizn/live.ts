import { loadOriznAdapterConfig, type OriznAdapterConfig } from "./config";
import { createOriznDirectClient, type FetchFn } from "./direct";
import { type VisaAdapter } from "./types";

export type OriznLiveDeps = {
  config?: OriznAdapterConfig;
  fetchFn?: FetchFn;
  client?: VisaAdapter;
};

export function createOriznLiveClient(deps: OriznLiveDeps = {}): VisaAdapter | null {
  if (deps.client) return deps.client;
  const config = deps.config ?? loadOriznAdapterConfig();
  if (!config.apiKey) return null;
  return createOriznDirectClient(config, deps.fetchFn);
}

let runtime: VisaAdapter | null | undefined;

export function getOriznLiveClient(): VisaAdapter | null {
  if (runtime !== undefined) return runtime;
  runtime = createOriznLiveClient();
  return runtime;
}

export function resetOriznLiveForTests(): void {
  runtime = undefined;
}

export function setOriznLiveForTests(client: VisaAdapter | null): void {
  runtime = client;
}
