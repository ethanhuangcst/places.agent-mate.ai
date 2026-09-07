/**
 * Live plan_trip intake probe (ADR-054).
 * Usage:
 *   npx tsx --env-file=.env.local scripts/probe-plan-trip.ts lisbon
 *   npx tsx --env-file=.env.local scripts/probe-plan-trip.ts hangzhou
 *   npx tsx --env-file=.env.local scripts/probe-plan-trip.ts hongkong
 *   npx tsx --env-file=.env.local scripts/probe-plan-trip.ts taipei
 */
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { budgetFetch } from "./probe-budget";

type CityKey = "lisbon" | "hangzhou" | "hongkong" | "taipei";

const CITIES: Record<
  CityKey,
  {
    city: string;
    locale: string;
    expected: "GOOGLE_ONLY" | "AMAP_ONLY" | "DUAL";
    slug: string;
  }
> = {
  lisbon: { city: "Lisbon", locale: "EN", expected: "GOOGLE_ONLY", slug: "lisbon" },
  hangzhou: { city: "杭州", locale: "CN", expected: "AMAP_ONLY", slug: "hangzhou" },
  hongkong: { city: "Hong Kong", locale: "HK", expected: "DUAL", slug: "hongkong" },
  taipei: { city: "Taipei", locale: "EN", expected: "GOOGLE_ONLY", slug: "taipei" },
};

type Envelope<T> = {
  agent?: string;
  ok?: boolean;
  data?: T;
  outcome?: { key?: string };
};

type PlanData = {
  trip_id: string;
  revision: number;
  status: string;
  need_input?: { questions?: Array<{ id: string; prompt: string }> };
};

type FetchData = {
  trip_id: string;
  revision: number;
  data?: {
    candidates?: {
      places?: Array<{
        name?: string;
        provider?: string;
        photos?: string[];
        must_see?: boolean;
        sources?: Array<{ native_id?: string }>;
      }>;
    };
  };
};

const PORT = process.env.PORT ?? "3010";
const BASE = process.env.PLAN_TRIP_BASE ?? `http://localhost:${PORT}`;

function issueKey(): string {
  if (process.env.CALLER_KEY?.trim()) return process.env.CALLER_KEY.trim();
  const out = execSync(
    "npx tsx --env-file=.env.local scripts/issue-caller-key.ts plan-trip-poc",
    { encoding: "utf8" },
  );
  return (JSON.parse(out) as { secret: string }).secret;
}

async function postJson<T>(path: string, secret: string, body: unknown): Promise<Envelope<T>> {
  const res = await budgetFetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as Envelope<T>;
  if (!res.ok || !json.ok) {
    throw new Error(`${path} failed ${res.status}: ${JSON.stringify(json)}`);
  }
  return json;
}

function assertProviders(
  places: Array<{ provider?: string }>,
  expected: (typeof CITIES)[CityKey]["expected"],
): void {
  if (!places.length) throw new Error("no candidate places");
  const providers = new Set(places.map((p) => p.provider));
  if (expected === "GOOGLE_ONLY") {
    if ([...providers].some((p) => p !== "GOOGLE_MAPS")) {
      throw new Error(`Lisbon expected GOOGLE_MAPS-only, got ${[...providers]}`);
    }
  }
  if (expected === "AMAP_ONLY") {
    const hasGoogle = places.some((p) => p.provider === "GOOGLE_MAPS");
    const allAmap = places.every((p) => p.provider === "AMAP");
    if (hasGoogle && !allAmap) {
      throw new Error(`Hangzhou expected AMAP-only (D4 only if empty), got ${[...providers]}`);
    }
    if (!allAmap && !hasGoogle) {
      throw new Error(`Hangzhou expected AMAP cards, got ${[...providers]}`);
    }
    if (!allAmap) {
      throw new Error(`Hangzhou expected AMAP-only, got ${[...providers]}`);
    }
  }
  if (expected === "DUAL") {
    if (!providers.has("GOOGLE_MAPS") && !providers.has("AMAP")) {
      throw new Error(`Hong Kong expected Google and/or AMAP, got ${[...providers]}`);
    }
  }
}

function chipsHtml(
  city: string,
  places: Array<{ name?: string; provider?: string; photos?: string[] }>,
): string {
  const cards = places
    .map((p) => {
      const img = p.photos?.[0]
        ? `<img src="${p.photos[0]}" alt="" width="160" height="120" />`
        : "<div class='ph'>no photo</div>";
      return `<article><h3>${p.name ?? "?"}</h3><p>${p.provider ?? ""}</p>${img}</article>`;
    })
    .join("\n");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${city} chips</title>
<style>body{font-family:sans-serif;display:flex;gap:1rem;flex-wrap:wrap}article{width:180px}img,.ph{width:160px;height:120px;object-fit:cover;background:#eee}</style>
</head><body><h1>${city}</h1>${cards}</body></html>`;
}

export async function runProbe(cityKey: CityKey): Promise<void> {
  const spec = CITIES[cityKey];
  const secret = issueKey();
  const planned = await postJson<PlanData>("/v1/plan_trip", secret, {
    city: spec.city,
    locale: spec.locale,
  });
  const data = planned.data;
  if (!data?.trip_id || data.status !== "needs_input") {
    throw new Error(`unexpected plan_trip: ${JSON.stringify(planned)}`);
  }
  const fetched = await postJson<FetchData>("/v1/fetch_trip_details", secret, {
    trip_id: data.trip_id,
    fields: ["candidates"],
  });
  const places = fetched.data?.data?.candidates?.places ?? [];
  for (const card of places) {
    if (!card.must_see) throw new Error(`chip missing must_see: ${JSON.stringify(card)}`);
    const photo = card.photos?.[0];
    if (photo && !photo.startsWith("https://")) {
      throw new Error(`photo not https: ${photo}`);
    }
    if (photo && /[?&](?:api_)?key=/i.test(photo)) {
      throw new Error(`photo has key: ${photo}`);
    }
  }
  assertProviders(places, spec.expected);

  const outDir = join(process.cwd(), "tmp");
  mkdirSync(outDir, { recursive: true });
  const payload = { city: spec.city, planned: data, fetched: fetched.data, places };
  writeFileSync(join(outDir, `probe-plan-trip-${spec.slug}.json`), JSON.stringify(payload, null, 2));
  writeFileSync(join(outDir, `probe-plan-trip-${spec.slug}.html`), chipsHtml(spec.city, places));
  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        city: spec.city,
        trip_id: data.trip_id,
        revision: data.revision,
        chips: places.length,
        providers: [...new Set(places.map((p) => p.provider))],
      },
      null,
      2,
    ) + "\n",
  );
}

const arg = (process.argv[2] ?? "").toLowerCase() as CityKey;
if (arg && CITIES[arg]) {
  runProbe(arg).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
