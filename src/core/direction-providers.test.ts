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

  it("should_put_amap_first_when_list_has_amap_and_locale_cn", async () => {
    const providers = await resolvedDirectionProviders({
      providers: ["GOOGLE_MAPS", "AMAP"],
      locale: "CN",
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
});
