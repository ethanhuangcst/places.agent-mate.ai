/**
 * Feature 37 — attach real (or heuristic) transit legs to arrange_day timeline.
 * Reuses timed-itinerary buildLegs; never puts API keys in deeplinks.
 */

import { type PlaceCard, type PlaceLocation } from "./types";
import {
  buildHeuristicLegs,
  buildLegs,
  type ItineraryLeg,
  type TravelMode,
} from "./itinerary-timed";
import { type LlmItineraryOutput } from "./itinerary-planner";

export type TransitOutcome = "directions" | "heuristic" | "partial";

export type ArrangeBlockWithTransit = LlmItineraryOutput["days"][number]["blocks"][number] & {
  legs_to_here?: ItineraryLeg[];
};

export type ArrangeDayWithTransit = Omit<LlmItineraryOutput["days"][number], "blocks"> & {
  blocks: ArrangeBlockWithTransit[];
  photos_cover?: string;
  /** Observability for callers / 2play plan-13 */
  transit_outcome?: TransitOutcome;
};

function locOf(card: PlaceCard | undefined): PlaceLocation | null {
  if (!card?.location) return null;
  const { lat, lng } = card.location;
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  return {
    lat,
    lng,
    crs: card.location.crs ?? "WGS84",
  };
}

function recommendedTransport(legs: ItineraryLeg[]): {
  transport: string;
  duration_min: number;
} | undefined {
  const leg = legs.find((l) => l.recommended) ?? legs[0];
  if (!leg) return undefined;
  return { transport: leg.mode, duration_min: leg.duration_min };
}

/**
 * Normalize a venue name for fuzzy matching: NFKC, lowercase, strip whitespace
 * and branch parentheses (e.g. "杭州酒家(延安路店)" → "杭州酒家").
 */
function normalizeVenueNameForLookup(name: string): string {
  return name
    .normalize("NFKC")
    .replace(/[（(][^）)]*[）)]/g, "")
    .replace(/[\s\-·・。、]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Find a candidate by normalized name when exact match fails.
 * True-agent principle: use ledger coordinates, not re-geocoded names.
 */
function findByNormalizedName(
  name: string,
  candidates: PlaceCard[],
): PlaceCard | undefined {
  const target = normalizeVenueNameForLookup(name);
  if (!target) return undefined;
  return candidates.find((c) => normalizeVenueNameForLookup(c.name ?? "") === target);
}

/**
 * Enrich arrange_day blocks with legs_to_here between consecutive places
 * (and optional origin/destination). Degrades to heuristic when directions fail.
 */
export async function enrichArrangeDayWithTransit(input: {
  day: LlmItineraryOutput["days"][number] & { photos_cover?: string };
  candidates: PlaceCard[];
  origin?: { name?: string; lat?: number; lng?: number };
  destination?: { name?: string; lat?: number; lng?: number };
  transit_preferred?: boolean;
  drive_preferred?: boolean;
  resolveDuration?: (
    mode: TravelMode,
    from: PlaceLocation,
    to: PlaceLocation,
  ) => Promise<{ duration_min: number; distance_m?: number } | null>;
}): Promise<ArrangeDayWithTransit> {
  const byName = new Map(input.candidates.map((c) => [c.name, c]));
  const byNativeId = new Map(
    input.candidates
      .filter((c) => c.sources?.some((s) => s.native_id?.trim()))
      .map((c) => [c.sources!.find((s) => s.native_id?.trim())!.native_id!.trim(), c]),
  );
  const prefs = {
    transit_preferred: input.transit_preferred ?? false,
    drive_preferred: input.drive_preferred ?? false,
  };
  let anyDirections = false;
  let anyHeuristic = false;
  let directionsFailed = false;

  const originLoc: PlaceLocation | null =
    input.origin?.lat != null && input.origin?.lng != null
      ? { lat: input.origin.lat, lng: input.origin.lng, crs: "WGS84" }
      : null;

  const destLoc: PlaceLocation | null =
    input.destination?.lat != null && input.destination?.lng != null
      ? { lat: input.destination.lat, lng: input.destination.lng, crs: "WGS84" }
      : null;

  let prev = originLoc;
  let from_origin = input.day.from_origin;
  const blocks: ArrangeBlockWithTransit[] = [];
  let coordLookupFailed = false;

  for (let i = 0; i < input.day.blocks.length; i++) {
    const block = input.day.blocks[i]!;
    // True-agent principle: use ledger coordinates, not re-geocoded names.
    // 1. Try native_id (if LLM provides it in future)
    // 2. Try exact name match
    // 3. Try normalized name match (strip branch parens, NFKC, lowercase)
    // 4. If no match → mark degraded, do NOT estimate with 0km
    const card =
      byNativeId.get((block as { native_id?: string }).native_id ?? "") ??
      byName.get(block.name) ??
      findByNormalizedName(block.name, input.candidates);
    const to = locOf(card);

    if (!card || !to) {
      coordLookupFailed = true;
    }

    let legs_to_here: ItineraryLeg[] | undefined;

    if (prev && to) {
      if (input.resolveDuration) {
        const built = await buildLegs(prev, to, undefined, prefs, (mode) =>
          input.resolveDuration!(mode, prev!, to),
        );
        legs_to_here = built.legs;
        if (built.directionsFailed) directionsFailed = true;
        if (built.legs.some((l) => l.source === "directions")) anyDirections = true;
        if (built.legs.some((l) => l.source === "heuristic")) anyHeuristic = true;
      } else {
        legs_to_here = buildHeuristicLegs(prev, to, undefined, prefs);
        anyHeuristic = true;
      }

      if (i === 0 && originLoc) {
        from_origin = recommendedTransport(legs_to_here);
      }
    }

    blocks.push({ ...block, legs_to_here });
    if (to) prev = to;
  }

  let to_destination = input.day.to_destination;
  if (prev && destLoc) {
    let legs: ItineraryLeg[];
    if (input.resolveDuration) {
      const built = await buildLegs(prev, destLoc, undefined, prefs, (mode) =>
        input.resolveDuration!(mode, prev!, destLoc),
      );
      legs = built.legs;
      if (built.directionsFailed) directionsFailed = true;
      if (built.legs.some((l) => l.source === "directions")) anyDirections = true;
      if (built.legs.some((l) => l.source === "heuristic")) anyHeuristic = true;
    } else {
      legs = buildHeuristicLegs(prev, destLoc, undefined, prefs);
      anyHeuristic = true;
    }
    to_destination = recommendedTransport(legs);
  }

  let transit_outcome: TransitOutcome = "heuristic";
  if (coordLookupFailed) transit_outcome = "partial";
  else if (anyDirections && (anyHeuristic || directionsFailed)) transit_outcome = "partial";
  else if (anyDirections) transit_outcome = "directions";

  // Ensure deeplinks never leak secrets
  for (const b of blocks) {
    for (const leg of b.legs_to_here ?? []) {
      for (const [k, v] of Object.entries(leg.deeplinks)) {
        if (/key=|Bearer|sk-/i.test(v)) {
          delete leg.deeplinks[k];
        }
      }
    }
  }

  return {
    ...input.day,
    from_origin,
    to_destination,
    blocks,
    transit_outcome,
  };
}
