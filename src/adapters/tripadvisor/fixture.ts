import { type PlaceCard } from "../../core/types";

export type TripadvisorMatchInput = {
  name: string;
  lat: number;
  lng: number;
};

export type TripadvisorEnrichment = {
  rating: number;
  review_count: number;
  url?: string;
};

/** Tracks last query for contract tests — must never be a Google native id. */
let lastQuery: TripadvisorMatchInput | null = null;

export function getLastTripadvisorQuery(): TripadvisorMatchInput | null {
  return lastQuery;
}

const FIXTURE_MATCHES: Record<string, TripadvisorEnrichment> = {
  ichiran: { rating: 4.0, review_count: 1200, url: "https://tripadvisor.com/ichiran" },
  "yat lok": { rating: 4.2, review_count: 890, url: "https://tripadvisor.com/yat-lok" },
  "tim ho wan": { rating: 4.1, review_count: 650 },
};

export async function matchTripadvisorByNameLocation(
  input: TripadvisorMatchInput,
): Promise<TripadvisorEnrichment | null> {
  lastQuery = { name: input.name, lat: input.lat, lng: input.lng };
  if (input.name.includes("__ta_fail__")) {
    throw new Error("tripadvisor_fail");
  }
  const key = input.name.trim().toLowerCase();
  for (const [needle, enrich] of Object.entries(FIXTURE_MATCHES)) {
    if (key.includes(needle)) return enrich;
  }
  return null;
}

export function attachTripadvisorEnrichment(
  card: PlaceCard,
  enrich: TripadvisorEnrichment,
): PlaceCard {
  return {
    ...card,
    tripadvisor: {
      rating: enrich.rating,
      review_count: enrich.review_count,
      url: enrich.url,
    },
  };
}
