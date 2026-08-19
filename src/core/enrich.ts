import {
  attachTripadvisorEnrichment,
  matchTripadvisorByNameLocation,
} from "../adapters/tripadvisor/fixture";
import { getTripadvisorLiveClient } from "../adapters/tripadvisor/live";
import { type PlaceCard } from "./types";
import { isLiveVendorMode } from "./vendor-mode";

export async function enrichWithTripadvisor(
  cards: PlaceCard[],
): Promise<{
  cards: PlaceCard[];
  skipped: { provider: string; reason_key: string }[];
}> {
  if (isLiveVendorMode()) {
    const live = getTripadvisorLiveClient();
    if (!live) {
      return {
        cards,
        skipped: [{ provider: "TRIPADVISOR", reason_key: "errors.provider_unconfigured" }],
      };
    }
    try {
      return await live.enrichCards(cards);
    } catch {
      return {
        cards,
        skipped: [{ provider: "TRIPADVISOR", reason_key: "errors.provider_failed" }],
      };
    }
  }

  const skipped: { provider: string; reason_key: string }[] = [];
  const enriched: PlaceCard[] = [];

  for (const card of cards) {
    try {
      const match = await matchTripadvisorByNameLocation({
        name: card.name,
        lat: card.location.lat,
        lng: card.location.lng,
      });
      enriched.push(match ? attachTripadvisorEnrichment(card, match) : card);
    } catch {
      skipped.push({ provider: "TRIPADVISOR", reason_key: "errors.provider_failed" });
      enriched.push(card);
    }
  }

  return { cards: enriched, skipped };
}