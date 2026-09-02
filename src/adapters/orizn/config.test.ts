import { describe, expect, it } from "vitest";
import { loadOriznAdapterConfig } from "./config";

describe("Orizn adapter config", () => {
  it("TC-M11-48-01: should_return_undefined_api_key_in_live_mode_when_missing", () => {
    const cfg = loadOriznAdapterConfig({
      NODE_ENV: "test",
      PLACES_VENDOR_MODE: "live",
      ORIZN_VISA_BASE_URL: "https://visa.orizn.app/api/v1",
      ORIZN_CACHE_TTL_H: "12",
    });
    expect(cfg.apiKey).toBeUndefined();
    expect(cfg.baseUrl).toBe("https://visa.orizn.app/api/v1");
    expect(cfg.cacheTtlHours).toBe(12);
  });

  it("TC-M11-48-01: should_not_require_api_key_in_fixture_mode", () => {
    const cfg = loadOriznAdapterConfig({
      NODE_ENV: "test",
      PLACES_VENDOR_MODE: "fixture",
    });
    expect(cfg.apiKey).toBeUndefined();
    expect(cfg.cacheTtlHours).toBe(24);
  });

  it("should_pass_through_api_key_when_set", () => {
    const cfg = loadOriznAdapterConfig({
      NODE_ENV: "test",
      PLACES_VENDOR_MODE: "live",
      ORIZN_API_KEY: "orizn-test-key",
    });
    expect(cfg.apiKey).toBe("orizn-test-key");
  });
});
