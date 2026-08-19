import { describe, expect, it, vi } from "vitest";
import { fetchAmapDirectionsEta } from "./directions";
import { type AmapAdapterConfig } from "./config";

const config: AmapAdapterConfig = {
  apiKey: "test-key",
  baseUrl: "https://restapi.amap.com",
  requestTimeoutMs: 5000,
};

describe("fetchAmapDirectionsEta", () => {
  it("should_map_walking_duration_seconds_to_minutes", async () => {
    const fetchFn = vi.fn(async (url: string) => {
      if (String(url).includes("coordinate/convert")) {
        return Response.json({ status: "1", infocode: "10000", locations: "121.4,31.2" });
      }
      return Response.json({
        status: "1",
        infocode: "10000",
        route: { paths: [{ duration: "900", distance: "1200" }] },
      });
    });
    const eta = await fetchAmapDirectionsEta(
      config,
      {
        from: { lat: 31.2, lng: 121.4, crs: "WGS84" },
        to: { lat: 31.21, lng: 121.41, crs: "WGS84" },
        mode: "walk",
      },
      fetchFn as unknown as typeof fetch,
    );
    expect(eta?.duration_min).toBe(15);
    expect(eta?.distance_m).toBe(1200);
  });

  it("should_return_null_when_no_api_key", async () => {
    const eta = await fetchAmapDirectionsEta(
      { ...config, apiKey: undefined },
      {
        from: { lat: 1, lng: 2, crs: "GCJ-02" },
        to: { lat: 3, lng: 4, crs: "GCJ-02" },
        mode: "drive",
      },
    );
    expect(eta).toBeNull();
  });
});
