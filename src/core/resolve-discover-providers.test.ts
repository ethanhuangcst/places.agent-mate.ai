import { describe, expect, it } from "vitest";
import { resolveDiscoverProviders } from "./itinerary-planner";
import { assembleDiscoverAttractionJobs } from "./query-assembler";

describe("resolveDiscoverProviders (ADR-052 / Feature 89)", () => {
  it("should_return_amap_only_when_mainland_city_and_providers_omitted", async () => {
    const providers = await resolveDiscoverProviders({
      city: "杭州",
      locale: "CN",
    });
    expect(providers).toEqual(["AMAP"]);
  });

  it("should_not_include_google_in_discover_jobs_for_xian_when_omitted", async () => {
    const providers = await resolveDiscoverProviders({
      city: "西安",
      locale: "CN",
    });
    const jobs = assembleDiscoverAttractionJobs({
      city: "西安",
      providers,
      uiLocale: "CN",
    });
    expect(jobs.length).toBeGreaterThan(0);
    expect(jobs.every((j) => !j.providers.includes("GOOGLE_MAPS"))).toBe(true);
    expect(jobs.every((j) => j.providers.includes("AMAP"))).toBe(true);
  });

  it("should_respect_explicit_caller_providers", async () => {
    const providers = await resolveDiscoverProviders({
      city: "杭州",
      locale: "CN",
      providers: ["GOOGLE_MAPS"],
    });
    expect(providers).toEqual(["GOOGLE_MAPS"]);
  });
});
