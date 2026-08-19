import { describe, expect, it, vi } from "vitest";
import { fetchGoogleDirectionsEta } from "./directions";
import { type GoogleAdapterConfig } from "./config";

const config: GoogleAdapterConfig = {
  apiKey: "test-key",
  placesBaseUrl: "https://places.googleapis.com/v1",
  geocodeBaseUrl: "https://maps.googleapis.com",
  mcpUrl: undefined,
  mcpBearer: undefined,
  directForceFail: false,
  requestTimeoutMs: 5000,
};

describe("fetchGoogleDirectionsEta", () => {
  it("should_map_duration_seconds_to_minutes", async () => {
    const fetchFn = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
      async () =>
        Response.json({
          status: "OK",
          routes: [{ legs: [{ duration: { value: 900 }, distance: { value: 1200 } }] }],
        }),
    );
    const eta = await fetchGoogleDirectionsEta(
      config,
      {
        from: { lat: 38.7, lng: -9.1, crs: "WGS84" },
        to: { lat: 38.71, lng: -9.12, crs: "WGS84" },
        mode: "walk",
      },
      fetchFn as unknown as typeof fetch,
    );
    expect(eta?.duration_min).toBe(15);
    expect(eta?.distance_m).toBe(1200);
    const url = String(fetchFn.mock.calls[0]?.[0]);
    expect(url).toContain("mode=walking");
    expect(url).toContain("key=test-key");
  });

  it("should_return_null_when_direct_force_fail", async () => {
    const eta = await fetchGoogleDirectionsEta(
      { ...config, directForceFail: true },
      {
        from: { lat: 1, lng: 2, crs: "WGS84" },
        to: { lat: 3, lng: 4, crs: "WGS84" },
        mode: "drive",
      },
    );
    expect(eta).toBeNull();
  });
});
