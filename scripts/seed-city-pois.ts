/**
 * Seed city AttractionPoi pools to ≥100 eligible cards (ADR-056).
 *
 * Bypasses plan_trip MUST_SEE_LIMIT — upserts the full eligible batch.
 * Queries are destination-agnostic keyword templates (ADR-042), not city encyclopedias.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/seed-city-pois.ts lisbon
 *   npx tsx --env-file=.env.local scripts/seed-city-pois.ts hongkong
 *   npx tsx --env-file=.env.local scripts/seed-city-pois.ts taipei
 *   npx tsx --env-file=.env.local scripts/seed-city-pois.ts hangzhou
 *   npx tsx --env-file=.env.local scripts/seed-city-pois.ts xian
 *   npx tsx --env-file=.env.local scripts/seed-city-pois.ts shanghai
 *   npx tsx --env-file=.env.local scripts/seed-city-pois.ts xiamen
 *
 * Optional:
 *   SEED_TARGET=100
 *   PLACES_PROBE_CACHE_DIR=tmp/.probe-cache
 */
import { prisma } from "../src/db/client";
import { filterEligibleAttractions } from "../src/core/eligible-attraction";
import {
  listPoisForDestination,
  safeUpsertEligiblePois,
  setPoiRegistryStore,
} from "../src/core/destination-poi-registry";
import { createPrismaPoiRegistryStore } from "../src/core/destination-poi-registry-prisma";
import { resolveDisplayPhotosForCards } from "../src/core/resolve-display-photo";
import { geocode, searchPlaces } from "../src/core/tools";
import type { Locale } from "../src/core/locales";
import type { PlaceCard } from "../src/core/types";

type CityKey =
  | "lisbon"
  | "hongkong"
  | "taipei"
  | "hangzhou"
  | "xian"
  | "shanghai"
  | "xiamen";

type CitySpec = {
  city: string;
  locale: Locale;
  /** lookupKey substrings to wipe (old + new spellings / locales). */
  wipeKeys: string[];
  /** Extra locale-specific keyword stems (templates only). */
  extraStems?: string[];
};

const CITIES: Record<CityKey, CitySpec> = {
  lisbon: {
    city: "Lisbon",
    locale: "EN",
    wipeKeys: ["lisbon", "lisboa", "里斯本"],
  },
  hongkong: {
    city: "Hong Kong",
    locale: "HK",
    wipeKeys: ["hongkong", "香港"],
    extraStems: ["博物馆", "景点", "公园", "寺庙", "夜市", "观景台", "历史建筑"],
  },
  taipei: {
    city: "Taipei",
    locale: "EN",
    wipeKeys: ["taipei", "台北", "臺北", "台北市"],
    extraStems: ["博物馆", "景点", "公园", "寺庙", "夜市"],
  },
  hangzhou: {
    city: "杭州",
    locale: "CN",
    wipeKeys: ["hangzhou", "杭州", "杭州市"],
  },
  xian: {
    city: "西安",
    locale: "CN",
    wipeKeys: ["xian", "xi'an", "西安", "西安市"],
  },
  shanghai: {
    city: "上海",
    locale: "CN",
    wipeKeys: ["shanghai", "上海", "上海市"],
  },
  xiamen: {
    city: "厦门",
    locale: "CN",
    wipeKeys: ["xiamen", "厦门", "厦门市"],
  },
};

const EN_STEMS = [
  "museum",
  "landmark",
  "park",
  "temple",
  "market",
  "viewpoint",
  "historic site",
  "art gallery",
  "nature",
  "shopping",
  "architecture",
  "garden",
  "palace",
  "cathedral",
  "castle",
  "monument",
  "bridge",
  "square",
  "neighborhood",
  "attraction",
  "sightseeing",
  "cultural center",
  "zoo",
  "aquarium",
  "observatory",
];

const CN_STEMS = [
  "景点",
  "博物馆",
  "公园",
  "寺庙",
  "古迹",
  "地标",
  "夜市",
  "观景台",
  "历史建筑",
  "园林",
  "广场",
  "纪念碑",
  "文化中心",
  "动物园",
  "水族馆",
  "天文台",
  "遗址",
  "陵园",
  "城墙",
  "古镇",
  "免费景点",
  "夜景",
  "古街",
  "老街",
  "湿地",
  "湖泊",
  "登山",
  "故居",
  "纪念馆",
  "美术馆",
  "图书馆",
  "步行街",
  "古巷",
];

const TARGET = Math.max(1, Number(process.env.SEED_TARGET ?? "100") || 100);

function cardKey(c: PlaceCard): string {
  const native = c.sources?.[0]?.native_id?.trim();
  if (native) return `${c.provider}:${native}`;
  return `${c.provider}:name:${(c.name ?? "").trim().toLowerCase()}`;
}

async function wipeCity(wipeKeys: string[]): Promise<number> {
  const or = wipeKeys.map((k) => ({
    lookupKey: { contains: k, mode: "insensitive" as const },
  }));
  // Cascade deletes AttractionPoi via FK onDelete.
  const result = await prisma.destination.deleteMany({ where: { OR: or } });
  return result.count;
}

function buildQueries(spec: CitySpec): string[] {
  const city = spec.city;
  const base = spec.locale === "CN" || spec.locale === "HK" || spec.locale === "TW"
    ? CN_STEMS
    : EN_STEMS;
  const stems = [...base, ...(spec.extraStems ?? [])];
  const queries = stems.map((s) => `${city} ${s}`);
  return [...new Set(queries)];
}

async function collectEligible(
  city: string,
  locale: Locale,
  queries: string[],
  near: { lat: number; lng: number } | undefined,
): Promise<PlaceCard[]> {
  const byKey = new Map<string, PlaceCard>();
  for (const query of queries) {
    if (byKey.size >= TARGET * 2) break; // gather surplus before photo resolve
    try {
      const pages = near ? [1] : [1, 2, 3, 4, 5];
      for (const page of pages) {
        const result = await searchPlaces({
          query,
          ...(near ? { address: city, near } : { city }),
          locale,
          page,
        });
        const eligible = filterEligibleAttractions(result.data ?? []);
        for (const card of eligible) {
          const k = cardKey(card);
          if (!byKey.has(k)) byKey.set(k, card);
        }
        process.stdout.write(
          `  search "${query}" p${page} → +${eligible.length} eligible (pool=${byKey.size})\n`,
        );
        if (eligible.length === 0) break;
      }
    } catch (err) {
      process.stderr.write(
        `  search failed "${query}": ${err instanceof Error ? err.message : err}\n`,
      );
    }
  }
  return [...byKey.values()];
}

async function seedCity(key: CityKey): Promise<void> {
  if (!process.env.PLACES_PROBE_CACHE_DIR?.trim()) {
    process.env.PLACES_PROBE_CACHE_DIR = "tmp/.probe-cache";
  }
  // Force Prisma registry (not VITEST memory).
  setPoiRegistryStore(createPrismaPoiRegistryStore(prisma));

  const spec = CITIES[key];
  process.stdout.write(`\n=== seed ${key} (${spec.city}) target=${TARGET} ===\n`);

  const wiped = await wipeCity(spec.wipeKeys);
  process.stdout.write(`wiped destinations: ${wiped}\n`);

  const geo = await geocode({ query: spec.city, locale: spec.locale });
  const hit = geo.data;
  if (!hit || !Number.isFinite(hit.lat) || !Number.isFinite(hit.lng)) {
    throw new Error(`geocode failed for ${spec.city}`);
  }
  const near = { lat: hit.lat, lng: hit.lng };
  process.stdout.write(`anchor: ${near.lat}, ${near.lng}\n`);

  const queries = buildQueries(spec);
  // Mainland text search: omit `near` so AMAP uses /v5/place/text, not around+distance
  // (same pin + sortrule=distance collapses every keyword into one city-center set).
  const searchNear =
    spec.locale === "CN" ? undefined : near;
  const collected = await collectEligible(spec.city, spec.locale, queries, searchNear);
  process.stdout.write(`collected unique eligible: ${collected.length}\n`);

  if (collected.length < TARGET) {
    throw new Error(
      `only ${collected.length} eligible cards for ${spec.city}; need ≥ ${TARGET}. ` +
        `Add more keyword stems or re-run after cache warm.`,
    );
  }

  const batchRaw = collected.slice(0, Math.max(TARGET, collected.length));
  process.stdout.write(`resolving photos for ${batchRaw.length} cards…\n`);
  const withPhotos = await resolveDisplayPhotosForCards(batchRaw, { concurrency: 6 });

  // Prefer displayable https photos so pool photo_pct stays high (esp. dual-provider cities).
  const hasHttps = (c: PlaceCard) =>
    Array.isArray(c.photos) && typeof c.photos[0] === "string" && c.photos[0].startsWith("https://");
  const withPhoto = withPhotos.filter(hasHttps);
  const withoutPhoto = withPhotos.filter((c) => !hasHttps(c));
  const preferred =
    withPhoto.length >= TARGET
      ? withPhoto
      : [...withPhoto, ...withoutPhoto].slice(0, TARGET);
  process.stdout.write(
    `photo-bearing=${withPhoto.length}, upserting=${preferred.length} (target=${TARGET})\n`,
  );

  const { destinationId, poiIds } = await safeUpsertEligiblePois(preferred, {
    city: spec.city,
    lat: near.lat,
    lng: near.lng,
  });
  if (!destinationId || !poiIds.length) {
    throw new Error(`upsert returned empty (destinationId=${destinationId}, pois=${poiIds.length})`);
  }

  const listed = await listPoisForDestination({
    city: spec.city,
    lat: near.lat,
    lng: near.lng,
  });
  const listedWithPhoto = listed.filter(
    (c) => Array.isArray(c.photos) && c.photos[0]?.startsWith("https://"),
  );
  const withMustSee = listed.filter((c) => c.must_see === true);

  const summary = {
    ok: listed.length >= TARGET,
    city: spec.city,
    destinationId,
    pois: listed.length,
    with_photos: listedWithPhoto.length,
    with_must_see: withMustSee.length,
    photo_pct: listed.length ? Math.round((listedWithPhoto.length / listed.length) * 100) : 0,
  };
  process.stdout.write(JSON.stringify(summary, null, 2) + "\n");

  if (listed.length < TARGET) {
    throw new Error(`final pool ${listed.length} < target ${TARGET}`);
  }
}

async function main(): Promise<void> {
  const arg = (process.argv[2] ?? "").toLowerCase() as CityKey;
  if (!CITIES[arg]) {
    process.stderr.write(
      `Usage: seed-city-pois.ts <lisbon|hongkong|taipei|hangzhou|xian|shanghai|xiamen>\n`,
    );
    process.exit(2);
  }
  try {
    await seedCity(arg);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
