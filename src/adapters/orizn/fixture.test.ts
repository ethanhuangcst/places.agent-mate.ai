import { describe, expect, it } from "vitest";
import { getVisaAdapter } from "./fixture";

describe("Orizn fixture adapter", () => {
  it("TC-M11-48-04: should_return_visa_required_for_chn_to_jpn", async () => {
    const adapter = getVisaAdapter();
    const result = await adapter.fetchRequirement({
      passport: "CHN",
      destination: "JPN",
      lang: "zh",
    });
    expect(result.requirement).toBe("visa_required");
    expect(result.documents?.length).toBeGreaterThan(0);
    expect(result.process?.length).toBeGreaterThan(0);
  });

  it("TC-M11-48-04: should_return_visa_free_30_days_for_chn_to_sgp", async () => {
    const adapter = getVisaAdapter();
    const result = await adapter.fetchRequirement({
      passport: "CHN",
      destination: "SGP",
      lang: "zh",
    });
    expect(result.requirement).toBe("visa_free");
    expect(result.visa_free_days).toBe(30);
  });
});
