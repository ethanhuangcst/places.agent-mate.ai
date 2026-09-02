import { describe, expect, it } from "vitest";
import { mapOriznVisaPayload } from "../adapters/orizn/mapper";
import { oriznLang, visaRequirement } from "./visa-requirement";
import { setOriznLiveForTests, resetOriznLiveForTests } from "../adapters/orizn/live";
import { OriznQuotaError } from "../adapters/orizn/types";

describe("visaRequirement core", () => {
  it("TC-M11-48-02: should_reject_invalid_alpha3_passport", async () => {
    const result = await visaRequirement({
      passport: "China",
      destination: "JPN",
      locale: "EN",
    });
    expect(result.outcomeKey).toBe("errors.visa_invalid_country_code");
  });

  it("TC-M11-48-02: should_reject_invalid_alpha3_destination", async () => {
    const result = await visaRequirement({
      passport: "CHN",
      destination: "jp",
      locale: "EN",
    });
    expect(result.outcomeKey).toBe("errors.visa_invalid_country_code");
  });

  it("TC-M11-48-03: should_map_en_locale_to_orizn_en", () => {
    expect(oriznLang("EN")).toBe("en");
  });

  it("TC-M11-48-03: should_map_cn_hk_tw_to_orizn_zh", () => {
    expect(oriznLang("CN")).toBe("zh");
    expect(oriznLang("HK")).toBe("zh");
    expect(oriznLang("TW")).toBe("zh");
  });

  it("TC-M11-48-07: should_list_upgrade_placeholder_fields_as_unavailable", () => {
    const mapped = mapOriznVisaPayload("CHN", "JPN", {
      requirement: "visa_required",
      visa_free_days: null,
      embassy: { upgrade: "Embassy info requires Pro plan" },
      transit_visa: { upgrade: "Starter plan" },
    });
    expect(mapped.unavailable_fields).toEqual(
      expect.arrayContaining(["embassy", "transit_visa"]),
    );
  });

  it("should_return_fixture_data_for_chn_jpn", async () => {
    const result = await visaRequirement({
      passport: "CHN",
      destination: "JPN",
      locale: "CN",
    });
    expect(result.outcomeKey).toBeUndefined();
    expect(result.data?.requirement).toBe("visa_required");
  });

  it("should_map_quota_error_to_outcome_key", async () => {
    resetOriznLiveForTests();
    setOriznLiveForTests({
      async fetchRequirement() {
        throw new OriznQuotaError();
      },
    });
    const prev = process.env.PLACES_VENDOR_MODE;
    process.env.PLACES_VENDOR_MODE = "live";
    try {
      const result = await visaRequirement({
        passport: "CHN",
        destination: "JPN",
        locale: "EN",
      });
      expect(result.outcomeKey).toBe("errors.visa_quota_exceeded");
    } finally {
      process.env.PLACES_VENDOR_MODE = prev;
      resetOriznLiveForTests();
    }
  });
});
