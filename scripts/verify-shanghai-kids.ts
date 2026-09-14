/**
 * Verification spike: Shanghai 亲子玩乐 + 7岁儿童 skeleton.
 * Replicates plan-trip's expandPlacesForSkeleton (106 queries) + makeItinerary
 * with a real LLM, then logs pool + skeleton so we can see whether park-shaped
 * cards reach the pool AND get scheduled.
 *
 * Run: npx tsx scripts/verify-shanghai-kids.ts
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());
import {
  skeletonPoolQueries,
} from "../src/core/plan-trip";
import {
  filterEligibleAttractions,
} from "../src/core/eligible-attraction";
import {
  isLodgingPlace,
  filterDiningPlaces,
} from "../src/core/place-filters";
import {
  geocode,
  searchPlaces,
} from "../src/core/tools";
import {
  makeItinerary,
  buildSkeletonUserMessage,
  createSkeletonChatCreate,
  enrichMakeItineraryInput,
  type MakeItineraryInput,
} from "../src/core/make-itinerary";
import { type PlaceCard } from "../src/core/types";
import { type Locale } from "../src/core/locales";

const CITY = "上海";
const LOCALE: Locale = "CN";

function hasMapPin(c: PlaceCard): boolean {
  return Number.isFinite(c.location?.lat) && Number.isFinite(c.location?.lng);
}

function withinCityRadius(
  c: PlaceCard,
  anchor: { lat: number; lng: number } | null,
): boolean {
  if (!anchor) return true;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(c.location.lat - anchor.lat);
  const dLng = toRad(c.location.lng - anchor.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(anchor.lat)) * Math.cos(toRad(c.location.lat)) * Math.sin(dLng / 2) ** 2;
  const km = 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
  return km <= 80;
}

// Replicate plan-trip intakeEligible (not exported)
function intakeEligible(
  cards: PlaceCard[],
  anchor: { lat: number; lng: number } | null,
): PlaceCard[] {
  return filterEligibleAttractions(cards)
    .filter((c) => hasMapPin(c))
    .filter((c) => !isLodgingPlace(c))
    .filter((c) => filterDiningPlaces([c]).length === 0)
    .filter((c) => withinCityRadius(c, anchor));
}

function isParkShaped(c: PlaceCard): boolean {
  const blob = `${c.name} ${c.category ?? ""}`;
  return /乐园|游乐园|主题公园|主題公園|theme.?park|amusement|water.?park|欢乐谷|歡樂谷|动物园|動物園|aquarium|水族馆|水族館|海洋公园|海洋公園/i.test(
    blob,
  );
}

async function main() {
  console.log("=== Shanghai kids skeleton verification ===\n");

  // 1. Geocode
  const geo = await geocode({ query: CITY, locale: LOCALE });
  const anchor =
    geo.data?.lat != null && geo.data?.lng != null
      ? { lat: geo.data.lat, lng: geo.data.lng }
      : null;
  console.log(`Geocode ${CITY}:`, anchor ?? "(failed)");

  // 2. Skeleton pool queries (106)
  const queries = skeletonPoolQueries(CITY, LOCALE, {
    trip_type: "family_kids",
    other: "7岁儿童",
  });
  console.log("\n--- Skeleton pool queries (106) ---");
  queries.forEach((q, i) => console.log(`  ${i + 1}. ${q}`));

  // 3. Search + build pool (replicate expandPlacesForSkeleton)
  const byKey = new Map<string, PlaceCard>();
  const keyOf = (c: PlaceCard) =>
    c.sources?.[0]?.native_id?.trim() || `${c.provider}:${c.name.trim().toLowerCase()}`;

  for (const query of queries) {
    try {
      const result = await searchPlaces({
        query,
        address: CITY,
        locale: LOCALE,
        near: anchor ?? undefined,
      });
      const before = (result.data ?? []).length;
      const eligible = intakeEligible(result.data ?? [], anchor);
      for (const c of eligible) {
        const k = keyOf(c);
        if (!byKey.has(k)) byKey.set(k, c);
      }
      console.log(
        `  query "${query}": ${before} raw → ${eligible.length} eligible → ${byKey.size} pool total`,
      );
    } catch (e) {
      console.log(`  query "${query}": ERROR ${e instanceof Error ? e.message : e}`);
    }
  }

  const pool = [...byKey.values()];
  console.log(`\n--- Pool after 106 queries + eligibility: ${pool.length} cards ---`);
  pool.forEach((c, i) => {
    const park = isParkShaped(c) ? " ★PARK" : "";
    console.log(
      `  ${i + 1}. ${c.name} | cat=${c.category ?? "(none)"} | rating=${c.rating ?? "-"}${park}`,
    );
  });

  const parkCards = pool.filter(isParkShaped);
  console.log(`\nPark-shaped cards in pool: ${parkCards.length}`);
  parkCards.forEach((c) =>
    console.log(`  - ${c.name} (cat=${c.category ?? "none"})`),
  );

  if (pool.length === 0) {
    console.log("\nNo pool cards — vendor search returned nothing. Aborting LLM call.");
    return;
  }

  // 4. Build makeItinerary input
  const input: MakeItineraryInput = {
    city: CITY,
    numDays: 3,
    candidates: { places: pool, restaurants: [] },
    origin: { name: "上海人民广场" },
    pace: "medium",
    budget: "comfort",
    trip_type: "family_kids",
    party_size: 2,
    other: "7岁儿童",
    bounds: { start: "2026-09-10", end: "2026-09-13" },
    start_time: "09:30",
    locale: LOCALE,
  };

  // 5. Enrich (registry merge + geo filter)
  console.log("\n--- Enriching pool (registry + 80km filter) ---");
  const enriched = await enrichMakeItineraryInput(input);
  console.log(
    `Places before geo filter: ${enriched.placesBeforeGeoFilter}, after: ${enriched.candidates.places.length}`,
  );
  console.log(`\n--- Enriched pool (${enriched.candidates.places.length} cards) ---`);
  enriched.candidates.places.forEach((c, i) => {
    const park = isParkShaped(c) ? " ★PARK" : "";
    console.log(
      `  ${i + 1}. ${c.name} | cat=${c.category ?? "(none)"} | rating=${c.rating ?? "-"}${park}`,
    );
  });

  // 6. Show the user message the LLM sees
  const userMsg = buildSkeletonUserMessage({ ...enriched, locale: LOCALE });
  console.log("\n--- Skeleton user message (truncated to 2000 chars) ---");
  console.log(userMsg.slice(0, 2000));
  if (userMsg.length > 2000) console.log(`\n... (${userMsg.length} total chars)`);

  // 7. Run real LLM skeleton
  const create = createSkeletonChatCreate();
  if (!create) {
    console.log(
      "\nNo LLM key configured (createSkeletonChatCreate returned null). Aborting.",
    );
    return;
  }

  console.log("\n--- Calling real LLM for skeleton ---");
  try {
    const result = await makeItinerary(enriched, { create });
    console.log("\n=== SKELETON OUTPUT ===");
    for (const day of result.skeleton.days) {
      console.log(`\nDay ${day.day_index} — ${day.day_theme}`);
      for (const stop of day.stops) {
        const name = stop.name ?? "(meal)";
        const extra = stop.meal_slot ? ` [${stop.meal_slot}]` : "";
        const part = stop.visit_part ? ` (${stop.visit_part})` : "";
        const park = pool.find((p) => p.name === stop.name && isParkShaped(p))
          ? " ★PARK"
          : "";
        console.log(`  - ${stop.kind}: ${name}${extra}${part}${park}`);
      }
    }

    // 8. Verdict
    const scheduledParkNames = result.skeleton.days
      .flatMap((d) => d.stops)
      .filter((s) => s.kind === "attraction" && s.name)
      .map((s) => s.name!)
      .filter((n) => pool.find((p) => p.name === n && isParkShaped(p)));

    console.log("\n=== VERDICT ===");
    console.log(`Park-shaped cards in enriched pool: ${parkCards.length}`);
    console.log(`Park-shaped cards scheduled: ${scheduledParkNames.length}`);
    if (scheduledParkNames.length > 0) {
      console.log(`  Scheduled: ${scheduledParkNames.join(", ")}`);
      console.log("✓ 105/106/107 working — park card reached pool AND got scheduled.");
    } else if (parkCards.length > 0) {
      console.log(
        `  Pool had parks (${parkCards.map((p) => p.name).join(", ")}) but NONE scheduled.`,
      );
      console.log("  → Gap is ranking, not eligibility. P1′ (venue-type tag) may help.");
    } else {
      console.log("  No park-shaped cards in pool — vendor search did not return any.");
      console.log("  → Gap is search/eligibility, not prompt. Re-check 105/106.");
    }
  } catch (e) {
    console.log("\nLLM call failed:", e instanceof Error ? e.message : e);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
