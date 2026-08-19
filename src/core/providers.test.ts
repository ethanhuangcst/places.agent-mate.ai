import { describe, it, expect } from "vitest";
import { validateProviders } from "./providers";

describe("validateProviders", () => {
  it("should_normalize_google_maps_label_from_chatbox", () => {
    process.env.PLACES_VENDOR_MODE = "fixture";
    const result = validateProviders(["Google Maps", "AMAP"], "search");
    expect(result.providers).toEqual(["GOOGLE_MAPS", "AMAP"]);
    expect(result.skipped).toEqual([]);
  });

  it("should_skip_unknown_vendor_without_silent_swap", () => {
    const result = validateProviders(["NOT_A_VENDOR", "GOOGLE_MAPS"], "search");
    expect(result.providers).toEqual(["GOOGLE_MAPS"]);
    expect(result.skipped).toContainEqual({
      provider: "NOT_A_VENDOR",
      reason_key: "errors.capability_unsupported",
    });
  });

  it("should_skip_tripadvisor_for_geocode", () => {
    process.env.PLACES_VENDOR_MODE = "fixture";
    const result = validateProviders(["TRIPADVISOR"], "geocode");
    expect(result.providers).toEqual([]);
    expect(result.skipped[0]?.reason_key).toBe("errors.capability_unsupported");
  });

  it("should_not_force_amap_from_destination", () => {
    const tokyo = validateProviders(["GOOGLE_MAPS"], "search");
    const shanghai = validateProviders(["GOOGLE_MAPS"], "search");
    expect(tokyo.providers).toEqual(["GOOGLE_MAPS"]);
    expect(shanghai.providers).toEqual(["GOOGLE_MAPS"]);
  });
});
