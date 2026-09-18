/**
 * MVP-T8 TD-8/9: fill completion + hard-gate recheck for plan_trip status.
 */

import {
  mergeSkeletonDeviations,
  validateSkeleton,
  type ItinerarySkeleton,
  type SkeletonDeviation,
} from "./make-itinerary";
import type { PlaceCard } from "./types";
export type FillStopRecord = {
  day_index: number;
  stop_index: number;
  stop: { kind?: string; meal_slot?: string; name?: string };
};

export type FillTripStatusInput = {
  skeleton: ItinerarySkeleton;
  filledStops: FillStopRecord[];
  pool: { places: PlaceCard[]; restaurants: PlaceCard[]; stays: string[] };
  mustInclude: string[];
  numDays?: number;
  pace?: string;
  city?: string;
  /** True when fill loop exited via trip_complete (not MAX_FILL_STEPS). */
  fillReachedTripComplete: boolean;
};

export type FillTripStatusResult = {
  status: "ready" | "failed";
  deviations?: SkeletonDeviation[];
  skeleton: ItinerarySkeleton;
};

/** Count skeleton stops that receive a plan_next_stop write (each cursor position). */
export function countExpectedFillStops(skeleton: ItinerarySkeleton): number {
  return skeleton.days.reduce((sum, d) => sum + d.stops.length, 0);
}

/** Per-day meal coverage from filled stops (TD-8). */
export function filledMealCoverageByDay(
  filledStops: FillStopRecord[],
): Map<number, { lunch: boolean; dinner: boolean }> {
  const byDay = new Map<number, { lunch: boolean; dinner: boolean }>();
  for (const fs of filledStops) {
    const stop = fs.stop;
    if (stop.kind !== "meal") continue;
    const slot = stop.meal_slot ?? stop.name;
    const row = byDay.get(fs.day_index) ?? { lunch: false, dinner: false };
    if (slot === "lunch") row.lunch = true;
    if (slot === "dinner") row.dinner = true;
    byDay.set(fs.day_index, row);
  }
  return byDay;
}

export function mealCoverageDeviations(
  skeleton: ItinerarySkeleton,
  filledStops: FillStopRecord[],
): SkeletonDeviation[] {
  const coverage = filledMealCoverageByDay(filledStops);
  const out: SkeletonDeviation[] = [];
  for (const day of skeleton.days) {
    const row = coverage.get(day.day_index) ?? { lunch: false, dinner: false };
    const skeletonHasLunch = day.stops.some(
      (s) => s.kind === "meal" && (s.meal_slot === "lunch" || s.name === "lunch"),
    );
    const skeletonHasDinner = day.stops.some(
      (s) => s.kind === "meal" && (s.meal_slot === "dinner" || s.name === "dinner"),
    );
    if (skeletonHasLunch && !row.lunch) {
      out.push({
        field: "meal_lunch",
        expected: "resolved lunch venue or empty slot",
        actual: "missing filled lunch",
        reason: `day_${day.day_index}_lunch_unfilled`,
      });
    }
    if (skeletonHasDinner && !row.dinner) {
      out.push({
        field: "meal_dinner",
        expected: "resolved dinner venue or empty slot",
        actual: "missing filled dinner",
        reason: `day_${day.day_index}_dinner_unfilled`,
      });
    }
  }
  return out;
}

export function incompleteFillDeviation(
  expected: number,
  actual: number,
): SkeletonDeviation {
  return {
    field: "fill_completion",
    expected: String(expected),
    actual: String(actual),
    reason: "fill_incomplete",
  };
}

export function hardGateFailureDeviation(message: string): SkeletonDeviation {
  return {
    field: "hard_gate",
    expected: "pass",
    actual: "fail",
    reason: message.slice(0, 200),
  };
}

/**
 * TD-9: ready only when fill complete + hard gates pass; else failed + deviations.
 */
export function resolveFillTripStatus(input: FillTripStatusInput): FillTripStatusResult {
  const expected = countExpectedFillStops(input.skeleton);
  const filledCount = input.filledStops.length;
  const extraDeviations: SkeletonDeviation[] = [];

  if (!input.fillReachedTripComplete || filledCount < expected) {
    extraDeviations.push(incompleteFillDeviation(expected, filledCount));
  }

  extraDeviations.push(
    ...mealCoverageDeviations(input.skeleton, input.filledStops),
  );

  const validation = validateSkeleton(
    input.skeleton,
    input.pool,
    input.mustInclude,
    input.pace,
    input.city,
    input.pool.places.length,
    input.numDays,
    { hardGatesOnly: true },
  );

  if (!validation.ok && validation.error) {
    extraDeviations.push(hardGateFailureDeviation(validation.error));
  }

  const merged = mergeSkeletonDeviations(
    input.skeleton.deviations,
    extraDeviations.length ? extraDeviations : undefined,
  );

  const skeleton: ItinerarySkeleton = {
    ...input.skeleton,
    ...(merged ? { deviations: merged } : {}),
  };

  const fillIncomplete =
    !input.fillReachedTripComplete || filledCount < expected;
  const hasBlocking = fillIncomplete || !validation.ok;

  return {
    status: hasBlocking ? "failed" : "ready",
    deviations: merged,
    skeleton,
  };
}
