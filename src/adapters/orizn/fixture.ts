import { isLiveVendorMode } from "../../core/vendor-mode";
import { getOriznLiveClient } from "./live";
import { type VisaAdapter, type VisaAdapterInput, type VisaRequirementData } from "./types";

const FIXTURE: Record<string, VisaRequirementData> = {
  "CHN:JPN": {
    passport: "CHN",
    destination: "JPN",
    requirement: "visa_required",
    visa_free_days: null,
    description: "Chinese passport holders need a visa before travel to Japan.",
    documents: ["Valid passport", "Visa application form", "Photo"],
    process: ["Prepare documents", "Submit at embassy", "Wait for processing"],
    processing_time: "5-7 business days",
    last_verified: "2026-01-01",
    source_url: null,
  },
  "CHN:SGP": {
    passport: "CHN",
    destination: "SGP",
    requirement: "visa_free",
    visa_free_days: 30,
    description: "Chinese passport holders may enter Singapore visa-free for up to 30 days.",
    last_verified: "2026-01-01",
    source_url: "https://www.ica.gov.sg/",
  },
};

function fixtureKey(input: VisaAdapterInput): string {
  return `${input.passport}:${input.destination}`;
}

export function getVisaAdapter(): VisaAdapter {
  if (isLiveVendorMode()) {
    const live = getOriznLiveClient();
    if (!live) {
      return {
        async fetchRequirement() {
          throw new Error("orizn_unconfigured");
        },
      };
    }
    return live;
  }

  return {
    async fetchRequirement(input: VisaAdapterInput): Promise<VisaRequirementData> {
      const hit = FIXTURE[fixtureKey(input)];
      if (!hit) {
        return {
          passport: input.passport,
          destination: input.destination,
          requirement: "unknown",
          visa_free_days: null,
          description: "No fixture data for this pair.",
        };
      }
      return { ...hit };
    },
  };
}
