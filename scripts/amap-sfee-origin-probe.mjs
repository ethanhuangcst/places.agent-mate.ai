/**
 * Live AMAP probe: SFEE vs lodging/city query variants (Hangzhou origin search).
 * Not a product catalog (ADR-042). Do not commit API keys.
 */
import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(import.meta.dirname, "../.env.local") });

const KEY = process.env.AMAP_API_KEY?.trim();
const BASE = (process.env.AMAP_BASE_URL || "https://restapi.amap.com").replace(/\/+$/, "");
if (!KEY) {
  console.error("AMAP_API_KEY missing");
  process.exit(1);
}

const TARGET = /sfeel/i;
const HOTEL = /酒店|宾馆|旅馆|民宿|hotel|inn|resort/i;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function getJson(path, params) {
  const url = new URL(`${BASE}${path}`);
  url.searchParams.set("key", KEY);
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== "") url.searchParams.set(k, String(v));
  }
  const res = await fetch(url);
  const json = await res.json();
  return json;
}

function poiNames(json) {
  const pois = Array.isArray(json.pois) ? json.pois : [];
  return pois.map((p) => ({
    name: p.name ?? "",
    type: p.type ?? "",
    address: p.address ?? "",
    location: p.location ?? "",
  }));
}

function summarize(rows) {
  const hit = rows.filter((r) => TARGET.test(r.name));
  const lodging = rows.filter((r) => HOTEL.test(r.name) || /住宿|宾馆/.test(r.type ?? ""));
  return {
    count: rows.length,
    sfeel: hit.map((r) => r.name),
    first5: rows.slice(0, 5).map((r) => r.name),
    lodgingCount: lodging.length,
  };
}

async function geocode(address) {
  const json = await getJson("/v3/geocode/geo", { address });
  const first = Array.isArray(json.geocodes) ? json.geocodes[0] : null;
  return { status: json.status, infocode: json.infocode, location: first?.location ?? "", formatted: first?.formatted_address };
}

const cases = [
  { id: "product_around_SFEE", kind: "around", keywords: "SFEE", radius: "15000" },
  { id: "A_around_SFEE_酒店", kind: "around", keywords: "SFEE 酒店", radius: "15000" },
  { id: "A_around_SFEE_hotel", kind: "around", keywords: "SFEE hotel", radius: "15000" },
  { id: "A_around_SFEE_杭州", kind: "around", keywords: "SFEE 杭州", radius: "15000" },
  { id: "around_SFEEL", kind: "around", keywords: "SFEEL", radius: "15000" },
  { id: "around_SFEE_50km", kind: "around", keywords: "SFEE", radius: "50000" },
  { id: "text_SFEE_city", kind: "text", keywords: "SFEE", city: "杭州" },
  { id: "A_text_SFEE_酒店_city", kind: "text", keywords: "SFEE 酒店", city: "杭州" },
  { id: "A_text_SFEE_hotel_city", kind: "text", keywords: "SFEE hotel", city: "杭州" },
  { id: "A_text_SFEE_杭州", kind: "text", keywords: "SFEE 杭州", city: "杭州" },
  { id: "A_text_SFEE_酒店_杭州", kind: "text", keywords: "SFEE 酒店 杭州", city: "杭州" },
  { id: "text_SFEEL_city", kind: "text", keywords: "SFEEL", city: "杭州" },
  { id: "text_SFEEL_酒店_city", kind: "text", keywords: "SFEEL 酒店", city: "杭州" },
  { id: "text_full_name", kind: "text", keywords: "SFEEL设计师酒店", city: "杭州" },
];

const geo = await geocode("杭州");
console.log(JSON.stringify({ geocode: geo }, null, 2));
if (!geo.location) {
  console.error("Hangzhou geocode failed");
  process.exit(1);
}

const results = [];
for (const c of cases) {
  await sleep(350);
  let json;
  if (c.kind === "around") {
    json = await getJson("/v5/place/around", {
      location: geo.location,
      keywords: c.keywords,
      radius: c.radius,
      sortrule: "distance",
      page_size: "20",
      page_num: "1",
    });
  } else {
    json = await getJson("/v5/place/text", {
      keywords: c.keywords,
      city: c.city,
      city_limit: "true",
      page_size: "20",
      page_num: "1",
    });
  }
  const rows = poiNames(json);
  const sum = summarize(rows);
  results.push({
    id: c.id,
    kind: c.kind,
    keywords: c.keywords,
    radius: c.radius ?? null,
    city: c.city ?? null,
    status: json.status,
    infocode: json.infocode,
    info: json.info,
    ...sum,
  });
}

const tipCases = [
  { id: "tips_SFEE_city", keywords: "SFEE", city: "杭州", citylimit: "true" },
  { id: "tips_sfee_city", keywords: "sfee", city: "杭州", citylimit: "true" },
  { id: "tips_SFEEL_city", keywords: "SFEEL", city: "杭州", citylimit: "true" },
  { id: "tips_SFEE_pin", keywords: "SFEE", location: geo.location },
];

const tips = [];
for (const c of tipCases) {
  await sleep(350);
  const json = await getJson("/v3/assistant/inputtips", {
    keywords: c.keywords,
    city: c.city,
    citylimit: c.citylimit,
    location: c.location,
  });
  const list = Array.isArray(json.tips) ? json.tips : [];
  tips.push({
    id: c.id,
    keywords: c.keywords,
    status: json.status,
    infocode: json.infocode,
    count: list.length,
    names: list.slice(0, 10).map((t) => t.name),
    sfeel: list.filter((t) => TARGET.test(t.name ?? "")).map((t) => t.name),
  });
}

console.log(JSON.stringify({ as_of: "2026-09-09", pin: geo.location, results, tips }, null, 2));
