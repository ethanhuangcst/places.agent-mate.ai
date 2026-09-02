/**
 * Dump Trip Store: PG row + in-memory TripDocument after hydrate.
 * Usage:
 *   npx tsx --env-file=.env.local scripts/dump-trip-sample.ts <trip_id> [callerKeyId]
 */
import { prisma } from "../src/db/client";
import { clearTripMemoryForTests, getTripOrThrow } from "../src/core/trip-store";

const tripId = process.argv[2];
const callerKey = process.argv[3];

async function main() {
  if (!tripId) {
    console.error("usage: dump-trip-sample.ts <trip_id> [callerKeyId]");
    process.exit(2);
  }

  const row = await prisma.trip.findUnique({ where: { id: tripId } });
  if (!row) {
    console.error(`trip not found in PG: ${tripId}`);
    process.exit(1);
  }

  const key = callerKey ?? row.callerKey;
  clearTripMemoryForTests();
  const memoryDoc = await getTripOrThrow(key, tripId);

  const serialize = (doc: typeof memoryDoc) => ({
    id: doc.id,
    revision: doc.revision,
    status: doc.status,
    callerKey: doc.callerKey,
    locale: doc.locale,
    expiresAt: doc.expiresAt.toISOString(),
    constraints: doc.constraints,
    candidates: doc.candidates,
    skeleton: doc.skeleton,
    cursor: doc.cursor,
    filled: doc.filled,
    artifacts: doc.artifacts,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  });

  console.log(
    JSON.stringify(
      {
        pg_row: {
          id: row.id,
          revision: row.revision,
          status: row.status,
          callerKey: row.callerKey,
          locale: row.locale,
          expiresAt: row.expiresAt.toISOString(),
          constraints: row.constraints,
          candidates: row.candidates,
          skeleton: row.skeleton,
          cursor: row.cursor,
          filled: row.filled,
          artifacts: row.artifacts,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        },
        memory_after_hydrate: serialize(memoryDoc),
      },
      null,
      2,
    ),
  );

  await prisma.$disconnect();
}

void main();
