import type { TravelTipsResult } from "./travel-tips";
import type { VisaRequirementData } from "../adapters/orizn/types";

export function artifactsTipsPatch(result: TravelTipsResult) {
  return {
    tips: {
      iconic_places: result.iconic_places,
      iconic_grounded: result.iconic_grounded,
      intro: result.intro,
      transit: result.transit,
      clothing: result.clothing,
      safety: result.safety,
      weather: result.weather,
    },
  };
}

export function artifactsVisaPatch(
  data: VisaRequirementData | null,
  outcomeKey?: string,
) {
  return {
    visa: {
      ...(data ?? {}),
      ...(outcomeKey ? { outcome: outcomeKey } : {}),
      unavailable: data == null,
    },
  };
}
