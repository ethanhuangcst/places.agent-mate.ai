import { describe, expect, it } from "vitest";
import { resolvedDirectionProviders } from "./direction-providers";

describe("resolvedDirectionProviders (ADR-052 D7 / Feature 89)", () => {
  it("should_use_amap_only_when_mainland_and_providers_omitted", async () => {
    const providers = await resolvedDirectionProviders({
      location: "杭州",
      locale: "CN",
    });
    expect(providers).toEqual(["AMAP"]);
    expect(providers).not.toEqual(["GOOGLE_MAPS", "AMAP"]);
  });

  it("should_put_amap_first_when_list_has_amap_and_mainland_location", async () => {
    const providers = await resolvedDirectionProviders({
      providers: ["GOOGLE_MAPS", "AMAP"],
      locale: "CN",
      location: "杭州",
    });
    expect(providers[0]).toBe("AMAP");
    expect(providers).toContain("GOOGLE_MAPS");
  });

  it("should_not_inject_amap_into_google_only_explicit_list", async () => {
    const providers = await resolvedDirectionProviders({
      providers: ["GOOGLE_MAPS"],
      locale: "CN",
      location: "杭州",
    });
    expect(providers).toEqual(["GOOGLE_MAPS"]);
  });

  it("should_put_google_first_for_taipei_even_when_locale_cn", async () => {
    const providers = await resolvedDirectionProviders({
      providers: ["GOOGLE_MAPS", "AMAP"],
      locale: "CN",
      location: "台北",
    });
    expect(providers[0]).toBe("GOOGLE_MAPS");
    expect(providers).toEqual(["GOOGLE_MAPS", "AMAP"]);
  });

  it("should_put_google_first_for_taiwan_coords_even_when_locale_cn", async () => {
    const providers = await resolvedDirectionProviders({
      providers: ["GOOGLE_MAPS", "AMAP"],
      locale: "CN",
      near: { lat: 25.033, lng: 121.565 },
    });
    expect(providers[0]).toBe("GOOGLE_MAPS");
  });

  it("should_put_amap_first_for_mainland_when_both_in_explicit_list", async () => {
    const providers = await resolvedDirectionProviders({
      providers: ["GOOGLE_MAPS", "AMAP"],
      locale: "EN",
      location: "杭州",
    });
    expect(providers[0]).toBe("AMAP");
    expect(providers).toEqual(["AMAP", "GOOGLE_MAPS"]);
  });
});
