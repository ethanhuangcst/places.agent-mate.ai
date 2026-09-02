export type OriznVisaRaw = Record<string, unknown>;

export type VisaRequirementData = {
  passport: string;
  destination: string;
  requirement: string;
  visa_free_days: number | null;
  description?: string;
  documents?: string[];
  process?: string[];
  processing_time?: string;
  validity?: string;
  max_stay?: string;
  extension?: { possible: boolean; details?: string };
  last_verified?: string | null;
  source_url?: string | null;
  unavailable_fields?: string[];
};

export type VisaAdapterInput = {
  passport: string;
  destination: string;
  lang: string;
};

export interface VisaAdapter {
  fetchRequirement(input: VisaAdapterInput): Promise<VisaRequirementData>;
}

export class OriznQuotaError extends Error {
  constructor(message = "orizn_quota_exceeded") {
    super(message);
    this.name = "OriznQuotaError";
  }
}
