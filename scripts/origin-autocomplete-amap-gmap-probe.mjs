/**
 * Live probe: origin = vendor autocomplete, empty → place search.
 * Fixture queries only — not a product catalog (ADR-042).
 */
import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(import.meta.dirname, "../.env.local") });

const AMAP_KEY = process.env.AMAP_API_KEY?.trim();
const AMAP_BASE = (process.env.AMAP_BASE_URL || "https://restapi.amap.com").replace(/\/+$/, "");
const GKEY = process.env.GOOGLE_MAPS_API_KEY?.trim();
const G_PLACES = (process.env.GOOGLE_PLACES_BASE_URL || "https://places.googleapis.com/v1").replace(/\/+$/, "");
const G_MAPS = (process.env.GOOGLE_MAPS_BASE_URL || "https://maps.googleapis.com").replace(/\/+$/, "");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TARGET_SFEEL = /sfeel/i;
const LODGING = /酒店|宾馆|旅馆|民宿|hotel|inn|resort|hyatt|凯悦|hostel|pousada/i;

function hitNames(names, re) {
  return names.filter((n) => re.test(n));
}

async function amapGet(path, params) {
  const url = new URL(`${AMAP_BASE}${path}`);
  url.searchParams.set("key", AMAP_KEY);
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== "") url.searchParams.set(k, String(v));
  }
  const res = await fetch(url);
  return res.json();
}

async function amapGeocode(address) {
  const j = await amapGet("/v3/geocode/geo", { address });
  const first = Array.isArray(j.geocodes) ? j.geocodes[0] : null;
  return { status: j.status, location: first?.location ?? "", formatted: first?.formatted_address };
}

async function amapTips(keywords, city) {
  const j = await amapGet("/v3/assistant/inputtips", {
    keywords,
    city,
    citylimit: "true",
  });
  const tips = Array.isArray(j.tips) ? j.tips : [];
  const names = tips.map((t) => t.name ?? "").filter(Boolean);
  return {
    vendor: "AMAP",
    step: "autocomplete",
    keywords,
    city,
    ok: j.status === "1",
    infocode: j.infocode,
    names: names.slice(0, 8),
    lodging: names.filter((n) => LODGING.test(n)).slice(0, 8),
    sfeel: hitNames(names, TARGET_SFEEL),
    count: names.length,
  };
}

async function amapText(keywords, city) {
  const j = await amapGet("/v5/place/text", {
    keywords,
    city,
    city_limit: "true",
    page_size: "20",
    page_num: "1",
  });
  const pois = Array.isArray(j.pois) ? j.pois : [];
  const names = pois.map((p) => p.name ?? "").filter(Boolean);
  return {
    vendor: "AMAP",
    step: "place_search_fallback",
    keywords,
    city,
    ok: j.status === "1",
    infocode: j.infocode,
    names: names.slice(0, 8),
    lodging: names.filter((n) => LODGING.test(n)).slice(0, 8),
    sfeel: hitNames(names, TARGET_SFEEL),
    count: names.length,
  };
}

async function googleAutocomplete(input, opts) {
  const body = {
    input,
    languageCode: opts.languageCode ?? "zh",
    locationBias: {
      circle: {
        center: { latitude: opts.lat, longitude: opts.lng },
        radius: 50_000,
      },
    },
  };
  if (opts.includedRegionCodes) body.includedRegionCodes = opts.includedRegionCodes;
  if (opts.includedPrimaryTypes) body.includedPrimaryTypes = opts.includedPrimaryTypes;

  const res = await fetch(`${G_PLACES}/places:autocomplete`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": GKEY,
      "X-Goog-FieldMask":
        "suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat,suggestions.queryPrediction.text",
    },
    body: JSON.stringify(body),
  });
  const j = await res.json();
  const suggestions = Array.isArray(j.suggestions) ? j.suggestions : [];
  const names = suggestions
    .map((s) => s.placePrediction?.text?.text || s.queryPrediction?.text?.text || "")
    .filter(Boolean);
  return {
    vendor: "GMAP",
    step: "autocomplete",
    api: "places:autocomplete",
    keywords: input,
    http: res.status,
    error: j.error?.message,
    names: names.slice(0, 8),
    lodging: names.filter((n) => LODGING.test(n)).slice(0, 8),
    sfeel: hitNames(names, TARGET_SFEEL),
    count: names.length,
  };
}

async function googleLegacyAutocomplete(input, opts) {
  const url = new URL(`${G_MAPS}/maps/api/place/autocomplete/json`);
  url.searchParams.set("input", input);
  url.searchParams.set("key", GKEY);
  url.searchParams.set("language", opts.language ?? "zh-CN");
  url.searchParams.set("location", `${opts.lat},${opts.lng}`);
  url.searchParams.set("radius", "50000");
  if (opts.types) url.searchParams.set("types", opts.types);
  const res = await fetch(url);
  const j = await res.json();
  const preds = Array.isArray(j.predictions) ? j.predictions : [];
  const names = preds.map((p) => p.description ?? "").filter(Boolean);
  return {
    vendor: "GMAP",
    step: "autocomplete",
    api: "legacy_autocomplete",
    keywords: input,
    status: j.status,
    error: j.error_message,
    names: names.slice(0, 8),
    lodging: names.filter((n) => LODGING.test(n)).slice(0, 8),
    sfeel: hitNames(names, TARGET_SFEEL),
    count: names.length,
  };
}

async function googleSearchText(textQuery, opts) {
  const res = await fetch(`${G_PLACES}/places:searchText`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": GKEY,
      "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.types",
    },
    body: JSON.stringify({
      textQuery,
      languageCode: opts.languageCode ?? "zh",
      locationBias: {
        circle: {
          center: { latitude: opts.lat, longitude: opts.lng },
          radius: 50_000,
        },
      },
    }),
  });
  const j = await res.json();
  const places = Array.isArray(j.places) ? j.places : [];
  const names = places.map((p) => p.displayName?.text ?? "").filter(Boolean);
  return {
    vendor: "GMAP",
    step: "place_search_fallback",
    api: "places:searchText",
    keywords: textQuery,
    http: res.status,
    error: j.error?.message,
    names: names.slice(0, 8),
    lodging: names.filter((n) => LODGING.test(n)).slice(0, 8),
    sfeel: hitNames(names, TARGET_SFEEL),
    count: names.length,
  };
}

function schemeOutcome(tips, fallback) {
  const used = tips.count > 0 ? "autocomplete" : fallback.count > 0 ? "place_search_fallback" : "empty";
  const names = tips.count > 0 ? tips.names : fallback.names;
  return {
    used,
    sfeel: (tips.sfeel?.length ? tips.sfeel : fallback.sfeel) ?? [],
    lodgingCount: (tips.count > 0 ? tips.lodging : fallback.lodging)?.length ?? 0,
    sample: names.slice(0, 5),
  };
}

if (!AMAP_KEY) {
  console.error("AMAP_API_KEY missing");
  process.exit(1);
}
if (!GKEY) {
  console.error("GOOGLE_MAPS_API_KEY missing");
  process.exit(1);
}

const hzAmap = await amapGeocode("杭州");
const hz = { city: "杭州", lat: 30.246566, lng: 120.209903 };
const lisbon = { city: "Lisbon", lat: 38.7223, lng: -9.1393 };

const amapQueries = ["SFEE", "SFEEL", "凯悦", "西湖国宾馆"];
const amapRows = [];
for (const q of amapQueries) {
  await sleep(300);
  const tips = await amapTips(q, hz.city);
  await sleep(300);
  const fallback = await amapText(q, hz.city);
  amapRows.push({ query: q, dest: hz.city, tips, fallback, scheme: schemeOutcome(tips, fallback) });
}

const gCases = [
  { q: "SFEE", dest: "Hangzhou", ...hz, languageCode: "zh", language: "zh-CN", region: ["cn"] },
  { q: "SFEEL", dest: "Hangzhou", ...hz, languageCode: "zh", language: "zh-CN", region: ["cn"] },
  { q: "Hyatt", dest: "Hangzhou", ...hz, languageCode: "en", language: "en", region: ["cn"] },
  { q: "Memmo", dest: "Lisbon", ...lisbon, languageCode: "en", language: "en", region: ["pt"] },
  { q: "Four Seasons", dest: "Lisbon", ...lisbon, languageCode: "en", language: "en", region: ["pt"] },
];

const gRows = [];
for (const c of gCases) {
  await sleep(300);
  let tips = await googleAutocomplete(c.q, {
    lat: c.lat,
    lng: c.lng,
    languageCode: c.languageCode,
    includedRegionCodes: c.region,
  });
  if (tips.http !== 200 || tips.error) {
    await sleep(300);
    const legacy = await googleLegacyAutocomplete(c.q, {
      lat: c.lat,
      lng: c.lng,
      language: c.language,
    });
    tips = { ...legacy, newApiError: tips.error, newHttp: tips.http };
  }
  await sleep(300);
  const fallback = await googleSearchText(`${c.q} ${c.dest}`, {
    lat: c.lat,
    lng: c.lng,
    languageCode: c.languageCode,
  });
  gRows.push({ query: c.q, dest: c.dest, tips, fallback, scheme: schemeOutcome(tips, fallback) });
}

console.log(
  JSON.stringify(
    {
      as_of: "2026-09-09",
      scheme: "autocomplete_then_place_search_if_empty",
      amap_geocode: hzAmap,
      amap: amapRows,
      gmap: gRows,
    },
    null,
    2,
  ),
);
