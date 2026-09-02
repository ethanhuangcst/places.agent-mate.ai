import { describe, expect, it, beforeEach } from "vitest";
import { visaRequirement } from "../src/core/visa-requirement";
import { resetOriznLiveForTests } from "../src/adapters/orizn/live";

const liveKey = process.env.ORIZN_API_KEY?.trim();
const runLive = process.env.ORIZN_LIVE_TESTS === "1" && Boolean(liveKey);

describe.runIf(runLive)("Orizn live visa probes", () => {
  beforeEach(() => {
    resetOriznLiveForTests();
    process.env.PLACES_VENDOR_MODE = "live";
  });
  it("TC-M11-48-LIVE-01: CHN to JPN visa_required with documents", async () => {
    process.env.PLACES_VENDOR_MODE = "live";
    const result = await visaRequirement({
      passport: "CHN",
      destination: "JPN",
      locale: "CN",
    });
    expect(result.outcomeKey).toBeUndefined();
    const data = result.data;
    if (!data) throw new Error("expected data");
    expect(data.requirement).toBe("visa_required");
    expect(data.documents?.length).toBeGreaterThan(0);
  });

  it("TC-M11-48-LIVE-02: CHN to SGP visa_free 30 days with source_url", async () => {
    process.env.PLACES_VENDOR_MODE = "live";
    const result = await visaRequirement({
      passport: "CHN",
      destination: "SGP",
      locale: "CN",
    });
    const data = result.data;
    if (!data) throw new Error("expected data");
    expect(data.requirement).toBe("visa_free");
    expect(data.visa_free_days).toBe(30);
    expect(data.source_url).toMatch(/^https?:\/\//);
  });

  it("TC-M11-48-LIVE-03: CHN to KOR visa_required at country level", async () => {
    process.env.PLACES_VENDOR_MODE = "live";
    const result = await visaRequirement({
      passport: "CHN",
      destination: "KOR",
      locale: "CN",
    });
    const data = result.data;
    if (!data) throw new Error("expected data");
    expect(data.requirement).toBe("visa_required");
  });
});
