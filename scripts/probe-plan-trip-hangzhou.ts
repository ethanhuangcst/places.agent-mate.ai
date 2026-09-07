/**
 * Hangzhou full 3-day plan_trip probe (AMAP).
 *
 * Flow:
 * 1) Intake-only plan_trip → fetch top-3 must_see chips
 * 2) Full plan_trip with origin 西湖大华饭店, 3 days, couple/relaxed/premium/taxi
 * 3) Write full itinerary + timing to tmp/probe-plan-trip-hangzhou-full.{json,html}
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/probe-plan-trip-hangzhou.ts
 */
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { budgetFetch } from "./probe-budget";

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
  timing?: Record<string, number>;
  itinerary?: {
    skeleton?: {
      days?: Array<{
        day_index: number;
        day_theme?: string;
        stops?: Array<{ name: string; kind: string; meal_slot?: string }>;
      }>;
    };
    filledStops?: Array<{
      day_index: number;
      stop_index: number;
      stop?: { name?: string; kind?: string; card?: { provider?: string; photos?: string[] } | null };
      slot?: { start?: string; end?: string };
      legs?: Array<{ mode?: string; duration_min?: number }>;
    }>;
    artifacts?: {
      tips?: {
        intro?: string;
        iconic_places?: string[];
        transit?: string;
        clothing?: string;
        safety?: string;
      };
      visa?: Record<string, unknown>;
    };
  };
  tool_calls?: string[];
};

type FetchData = {
  trip_id: string;
  revision: number;
  data?: {
    candidates?: {
      places?: Array<{
        name?: string;
        provider?: string;
        must_see?: boolean;
        photos?: string[];
      }>;
    };
    constraints?: {
      originStay?: { name?: string; provider?: string };
      origin?: { name?: string };
    };
    skeleton?: PlanData["itinerary"] extends infer I
      ? I extends { skeleton?: infer S }
        ? S
        : never
      : never;
    artifacts?: PlanData["itinerary"] extends infer I
      ? I extends { artifacts?: infer A }
        ? A
        : never
      : never;
  };
};

const PORT = process.env.PORT ?? "3010";
const BASE = process.env.PLAN_TRIP_BASE ?? `http://localhost:${PORT}`;
const CITY = "杭州";
const ORIGIN = "西湖大华饭店";
const LOCALE = "CN";
const NUM_DAYS = 3;

function issueKey(): string {
  if (process.env.CALLER_KEY?.trim()) return process.env.CALLER_KEY.trim();
  const out = execSync(
    "npx tsx --env-file=.env.local scripts/issue-caller-key.ts plan-trip-hz-full",
    { encoding: "utf8" },
  );
  return (JSON.parse(out) as { secret: string }).secret;
}

async function postJson<T>(path: string, secret: string, body: unknown, timeoutMs = 300_000): Promise<Envelope<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await budgetFetch(`${BASE}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const json = (await res.json()) as Envelope<T>;
    if (!res.ok || !json.ok) {
      throw new Error(`${path} failed ${res.status}: ${JSON.stringify(json).slice(0, 1200)}`);
    }
    return json;
  } finally {
    clearTimeout(timer);
  }
}

function defaultBounds(): { start: string; end: string } {
  const start = new Date();
  start.setUTCDate(start.getUTCDate() + 14);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + (NUM_DAYS - 1));
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { start: fmt(start), end: fmt(end) };
}

function assertAmapOnly(places: Array<{ provider?: string }>, label: string): void {
  if (!places.length) throw new Error(`${label}: no places`);
  const bad = places.filter((p) => p.provider && p.provider !== "AMAP");
  if (bad.length) {
    throw new Error(
      `${label}: expected AMAP-only, got ${[...new Set(bad.map((p) => p.provider))].join(",")}`,
    );
  }
}

function renderHtml(payload: {
  city: string;
  origin: string;
  planned: PlanData;
  chips: Array<{ name?: string; provider?: string; photos?: string[] }>;
}): string {
  const days = payload.planned.itinerary?.skeleton?.days ?? [];
  const filled = payload.planned.itinerary?.filledStops ?? [];
  const tips = payload.planned.itinerary?.artifacts?.tips;
  const timing = payload.planned.timing ?? {};

  const dayHtml = days
    .map((d) => {
      const stops = filled
        .filter((f) => f.day_index === d.day_index)
        .sort((a, b) => a.stop_index - b.stop_index);
      const rows =
        stops.length > 0
          ? stops
              .map((s) => {
                const name =
                  (s.stop as { name?: string } | undefined)?.name ??
                  `stop#${s.stop_index}`;
                const kind = (s.stop as { kind?: string } | undefined)?.kind ?? "";
                const slot = s.slot
                  ? `${(s.slot as { start?: string }).start ?? ""}–${(s.slot as { end?: string }).end ?? ""}`
                  : "";
                const legs = (s.legs ?? [])
                  .map((l) => `${l.mode ?? "?"} ${l.duration_min ?? "?"}min`)
                  .join(", ");
                const photo = (s.stop as { card?: { photos?: string[] } | null } | undefined)
                  ?.card?.photos?.[0];
                const img = photo
                  ? `<img src="${photo}" alt="" width="120" height="90" />`
                  : "";
                return `<li><strong>${name}</strong> <em>${kind}</em> ${slot} ${legs} ${img}</li>`;
              })
              .join("\n")
          : (d.stops ?? [])
              .map((s) => `<li>${s.name} (${s.kind}${s.meal_slot ? "/" + s.meal_slot : ""})</li>`)
              .join("\n");
      return `<section><h2>Day ${d.day_index}${d.day_theme ? " — " + d.day_theme : ""}</h2><ol>${rows}</ol></section>`;
    })
    .join("\n");

  const chips = payload.chips
    .map(
      (c) =>
        `<article><h3>${c.name ?? "?"}</h3><p>${c.provider ?? ""}</p>${
          c.photos?.[0]
            ? `<img src="${c.photos[0]}" alt="" width="140" height="100" />`
            : ""
        }</article>`,
    )
    .join("\n");

  const tipsHtml = tips
    ? `<section><h2>出行贴士</h2>
      <p>${tips.intro ?? ""}</p>
      <p>必去：${(tips.iconic_places ?? []).join("、")}</p>
      <p>交通：${tips.transit ?? ""}</p>
      <p>穿衣：${tips.clothing ?? ""}</p>
      <p>安全：${tips.safety ?? ""}</p>
    </section>`
    : "";

  return `<!doctype html><html><head><meta charset="utf-8"><title>${payload.city} 3-day</title>
<style>
body{font-family:sans-serif;max-width:960px;margin:1rem auto;padding:0 1rem}
.chips{display:flex;gap:1rem;flex-wrap:wrap}
article{width:160px}img{object-fit:cover;background:#eee}
.meta{background:#f6f6f6;padding:.75rem;border-radius:8px}
</style></head><body>
<h1>${payload.city} · ${NUM_DAYS}日 · 起点 ${payload.origin}</h1>
<div class="meta">
  <div>status=${payload.planned.status} trip=${payload.planned.trip_id} rev=${payload.planned.revision}</div>
  <div>timing: ${JSON.stringify(timing)}</div>
</div>
<h2>必去芯片（前三）</h2>
<div class="chips">${chips}</div>
${dayHtml}
${tipsHtml}
</body></html>`;
}

async function main(): Promise<void> {
  const secret = issueKey();
  const bounds = defaultBounds();

  // Step 1: intake chips
  const tIntake = Date.now();
  const intake = await postJson<PlanData>("/v1/plan_trip", secret, {
    city: CITY,
    locale: LOCALE,
  });
  const intakeData = intake.data;
  if (!intakeData?.trip_id || intakeData.status !== "needs_input") {
    throw new Error(`intake unexpected: ${JSON.stringify(intake).slice(0, 800)}`);
  }
  const fetchedChips = await postJson<FetchData>("/v1/fetch_trip_details", secret, {
    trip_id: intakeData.trip_id,
    fields: ["candidates"],
  });
  const chipPlaces = fetchedChips.data?.data?.candidates?.places ?? [];
  assertAmapOnly(chipPlaces, "intake chips");
  const mustInclude = chipPlaces
    .filter((p) => p.must_see)
    .slice(0, 3)
    .map((p) => p.name!)
    .filter(Boolean);
  if (mustInclude.length < 1) {
    throw new Error(`no must_see chips: ${JSON.stringify(chipPlaces).slice(0, 500)}`);
  }
  const intake_s = Math.round(((Date.now() - tIntake) / 1000) * 100) / 100;

  // Step 2: full loop
  const tFull = Date.now();
  const full = await postJson<PlanData>(
    "/v1/plan_trip",
    secret,
    {
      city: CITY,
      locale: LOCALE,
      numDays: NUM_DAYS,
      origin: { name: ORIGIN },
      pace: "relaxed",
      budget: "premium",
      transit_preference: "打车",
      trip_type: "情侣",
      bounds,
      must_include: mustInclude,
    },
    600_000,
  );
  const fullData = full.data;
  if (!fullData?.trip_id || fullData.status !== "ready") {
    throw new Error(`full unexpected: ${JSON.stringify(full).slice(0, 1500)}`);
  }
  if (!fullData.itinerary?.skeleton?.days || fullData.itinerary.skeleton.days.length !== 3) {
    throw new Error(`expected 3-day skeleton, got ${JSON.stringify(fullData.itinerary?.skeleton)}`);
  }
  if (!fullData.itinerary.filledStops?.length) {
    throw new Error("no filledStops in response");
  }
  if (!fullData.itinerary.artifacts?.tips) {
    throw new Error("missing artifacts.tips");
  }

  const fetched = await postJson<FetchData>("/v1/fetch_trip_details", secret, {
    trip_id: fullData.trip_id,
    fields: ["constraints", "skeleton", "artifacts", "candidates"],
  });
  const constraints = fetched.data?.data?.constraints;
  const originName = constraints?.originStay?.name ?? constraints?.origin?.name;
  if (!originName || !originName.includes("大华")) {
    throw new Error(`origin stay missing/wrong: ${JSON.stringify(constraints)}`);
  }

  const providers = new Set(
    (fetched.data?.data?.candidates?.places ?? [])
      .map((p) => p.provider)
      .filter(Boolean),
  );
  if (providers.size && [...providers].some((p) => p !== "AMAP")) {
    throw new Error(`candidates not AMAP-only: ${[...providers]}`);
  }

  const wall_full_s = Math.round(((Date.now() - tFull) / 1000) * 100) / 100;
  const timing = {
    probe_intake_s: intake_s,
    probe_full_wall_s: wall_full_s,
    ...(fullData.timing ?? {}),
  };

  const outDir = join(process.cwd(), "tmp");
  mkdirSync(outDir, { recursive: true });
  const payload = {
    city: CITY,
    origin: ORIGIN,
    bounds,
    must_include: mustInclude,
    intake: {
      trip_id: intakeData.trip_id,
      chips: chipPlaces.slice(0, 5),
    },
    planned: fullData,
    fetched: fetched.data,
    timing,
  };
  writeFileSync(
    join(outDir, "probe-plan-trip-hangzhou-full.json"),
    JSON.stringify(payload, null, 2),
  );
  writeFileSync(
    join(outDir, "probe-plan-trip-hangzhou-full.html"),
    renderHtml({
      city: CITY,
      origin: ORIGIN,
      planned: fullData,
      chips: chipPlaces.filter((p) => mustInclude.includes(p.name ?? "")),
    }),
  );

  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        city: CITY,
        trip_id: fullData.trip_id,
        revision: fullData.revision,
        status: fullData.status,
        must_include: mustInclude,
        days: fullData.itinerary.skeleton.days.length,
        filledStops: fullData.itinerary.filledStops.length,
        providers: [...providers],
        timing,
        out: ["tmp/probe-plan-trip-hangzhou-full.json", "tmp/probe-plan-trip-hangzhou-full.html"],
      },
      null,
      2,
    ) + "\n",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
