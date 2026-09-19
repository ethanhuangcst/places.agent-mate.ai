/**
 * Delete AttractionPoi rows whose nativeId fails isResolvablePlaceNativeId.
 * Destination-agnostic (verify_*, fixture_*, invalid Google shape, etc.).
 *
 * Usage:
 *   DATABASE_URL='postgresql://places_agent:…/places_agent' npx tsx --env-file=.env.local scripts/purge-unverifiable-pois.ts
 * (Agent Trip/POI DB — not where2play.)
 */
import { prisma } from "../src/db/client";
import { isResolvablePlaceNativeId } from "../src/core/place-native-id";

async function main(): Promise<void> {
  const rows = await prisma.attractionPoi.findMany({
    select: { id: true, provider: true, nativeId: true, name: true },
  });
  const toDelete = rows.filter(
    (r) => !isResolvablePlaceNativeId(r.provider, r.nativeId),
  );
  if (!toDelete.length) {
    console.info("purge-unverifiable-pois: nothing to delete");
    return;
  }
  console.info(
    `purge-unverifiable-pois: deleting ${toDelete.length} row(s)`,
    toDelete.map((r) => ({ nativeId: r.nativeId, name: r.name })),
  );
  await prisma.attractionPoi.deleteMany({
    where: { id: { in: toDelete.map((r) => r.id) } },
  });
  console.info("purge-unverifiable-pois: done");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
