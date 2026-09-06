/**
 * Live probe: 20 mainland cities — as-built around+distance vs proposed
 * text(region, types=110000) and around+weight. Proposed L0 (no bare 景区 deny).
 * Probe city list is not a product catalog (ADR-042).
 */
import { config } from "dotenv";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

config({ path: resolve(import.meta.dirname, "../.env.local") });

const KEY = process.env.AMAP_API_KEY?.trim();
const BASE = (process.env.AMAP_BASE_URL || "https://restapi.amap.com").replace(/\/+$/, "");
if (!KEY) {
  console.error("AMAP_API_KEY missing");
  process.exit(1);
}

const CITIES = [
  "北京",
  "上海",
  "杭州",
  "西安",
  "成都",
  "重庆",
  "南京",
  "苏州",
  "广州",
  "深圳",
  "武汉",
  "长沙",
  "厦门",
  "青岛",
  "昆明",
  "桂林",
  "哈尔滨",
  "天津",
  "郑州",
  "沈阳",
];

const COLLECTION_NAME =
  /十景|八景|二十四景|名胜区|名勝區|风景名胜区|風景名勝區|风景区|風景區|旅游区|旅遊區|游览区|遊覽區/u;
const SCENIC_CHILD =
  /^(.+?)(?:风景名胜区|風景名勝區|风景区|風景區|名胜区|名勝區)\s*[-–—／/]\s*(.+)$/u;
const LODGING =
  /公寓|宾馆|酒店|旅馆|旅舍|民宿|客栈|贵宾楼|怡宾楼|迎宾楼|希尔顿|凯悦|hotel|hostel|lodging|motel|resort|guesthouse|hilton|hyatt/i;
const BUSINESS = /公司企业|农林牧渔|停车场|停車|公交站|巴士站|parking|bus.?stop|transit_station/i;
const FRAGMENT =
  /售票处|售票處|直通车|直通車|乘车点|乘車點|发车点|發車點|游客中心|内部停车场/i;
const VISIT_CUR =
  /shopping_mall|\bmall\b|美食街|residential|transit_station|地铁站|\bstation\b|码头|景区|商城|购物中心|步行街|tourist_information|visitor.?center|不对外开放/i;
const VISIT_PROP =
  /shopping_mall|\bmall\b|美食街|residential|transit_station|地铁站|\bstation\b|码头|商城|购物中心|步行街|tourist_information|visitor.?center|不对外开放/i;
const ALLOW =
  /museum|park|landmark|tourist_attraction|monument|gallery|temple|palace|bridge|memorial|scenic|景点|博物馆|公園|公园|风景|名胜|古迹|寺庙|园林|展览|美术馆|科教文化|风景名胜|文物古迹|纪念馆|观光|人文景观|教堂|街区|14\d{4}/i;
const ICONIC = /塔|寺|堤|桥|橋|祠|宫|宮|苑|陵|窟|墙|牆|故宫|故宮|长城|長城/;
const MUSEUM = /博物馆|博物院|展览馆|美术馆/;
const MALL_DINING = /购物|来福士|万达|银泰|天虹|大悦城|万象|印象城|奥特莱斯|商场|广场店|购物中心|高德置地/;
const SCENIC_SUFFIX = /^(.*?)(?:景区|景區)$/u;
const CHAIN_DINING = /肯德基|麦当劳|必胜客|星巴克|KFC|McDonald|Pizza Hut|Starbucks/;

function unwrapChild(name) {
  const m = name.trim().match(SCENIC_CHILD);
  const child = m?.[2]?.trim();
  if (!child || COLLECTION_NAME.test(child)) return null;
  return child;
}

function stripScenicSuffix(name) {
  const m = name.trim().match(SCENIC_SUFFIX);
  const core = m?.[1]?.trim();
  if (!core || COLLECTION_NAME.test(core) || core.length < 2) return null;
  return core;
}

function isCollection(name) {
  return !name.trim() || COLLECTION_NAME.test(name.trim());
}

function currentL0(name, type) {
  const blob = `${name} ${type || ""}`;
  if (LODGING.test(blob) || VISIT_CUR.test(blob) || BUSINESS.test(blob) || FRAGMENT.test(blob))
    return null;
  if (!ALLOW.test(blob)) return null;
  const child = unwrapChild(name);
  const eff = child ?? name;
  if (isCollection(eff)) return null;
  return child ?? name;
}

function proposedL0(name, type) {
  const blob = `${name} ${type || ""}`;
  if (LODGING.test(blob) || VISIT_PROP.test(blob) || BUSINESS.test(blob) || FRAGMENT.test(blob))
    return null;
  if (!ALLOW.test(blob)) return null;
  const child = unwrapChild(name);
  const stripped = stripScenicSuffix(name);
  const eff = child ?? stripped ?? name;
  if (isCollection(eff)) return null;
  return child ?? stripped ?? name;
}

function parseLngLat(location) {
  const [lngS, latS] = String(location || "").split(",");
  const lng = Number(lngS);
  const lat = Number(latS);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  return { lng, lat };
}

async function getJson(path, params) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const u = new URL(BASE + path);
    u.searchParams.set("key", KEY);
    for (const [k, v] of Object.entries(params)) {
      if (v != null && v !== "") u.searchParams.set(k, String(v));
    }
    const json = await (await fetch(u)).json();
    if (String(json.infocode) === "10021") {
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
      continue;
    }
    if (json.status !== "1" || String(json.infocode) !== "10000") {
      return { ok: false, info: String(json.info || json.infocode), pois: [] };
    }
    return { ok: true, pois: Array.isArray(json.pois) ? json.pois : [] };
  }
  return { ok: false, info: "qps", pois: [] };
}

async function geocode(city) {
  const u = new URL(BASE + "/v3/geocode/geo");
  u.searchParams.set("key", KEY);
  u.searchParams.set("address", city);
  for (let i = 0; i < 4; i++) {
    const json = await (await fetch(u)).json();
    if (String(json.infocode) === "10021") {
      await new Promise((r) => setTimeout(r, 700 * (i + 1)));
      continue;
    }
    const first = Array.isArray(json.geocodes) ? json.geocodes[0] : null;
    return parseLngLat(first?.location);
  }
  return null;
}

function summarizeAttr(pois, l0) {
  const kept = [];
  for (const p of pois) {
    const n = l0(p.name || "", p.type || "");
    if (n) kept.push(n);
  }
  const uniq = [...new Set(kept)];
  return {
    raw: pois.length,
    kept: uniq.length,
    iconic: uniq.filter((n) => ICONIC.test(n)).length,
    museum: uniq.filter((n) => MUSEUM.test(n)).length,
    names: uniq.slice(0, 8),
    iconicNames: uniq.filter((n) => ICONIC.test(n)).slice(0, 6),
  };
}

function summarizeDining(pois) {
  const names = pois.map((p) => p.name || "").filter(Boolean);
  const mall = names.filter((n) => MALL_DINING.test(n)).length;
  const chain = names.filter((n) => CHAIN_DINING.test(n)).length;
  return {
    raw: names.length,
    mall,
    chain,
    mallShare: names.length ? +(mall / names.length).toFixed(2) : 0,
    names: names.slice(0, 6),
  };
}

const rows = [];
for (const city of CITIES) {
  const pin = await geocode(city);
  if (!pin) {
    rows.push({ city, error: "geocode_fail" });
    continue;
  }
  const loc = `${pin.lng.toFixed(6)},${pin.lat.toFixed(6)}`;
  const aroundDist = await getJson("/v5/place/around", {
    location: loc,
    keywords: "景点",
    radius: "15000",
    sortrule: "distance",
    page_size: "20",
  });
  const aroundWeight = await getJson("/v5/place/around", {
    location: loc,
    keywords: "景点",
    radius: "15000",
    sortrule: "weight",
    page_size: "20",
  });
  const textTyped = await getJson("/v5/place/text", {
    keywords: "景点",
    types: "110000",
    region: city,
    city_limit: "true",
    page_size: "20",
  });
  const dineAround = await getJson("/v5/place/around", {
    location: loc,
    keywords: "餐厅",
    types: "050000",
    radius: "1000",
    sortrule: "distance",
    page_size: "20",
  });
  const dineText = await getJson("/v5/place/text", {
    keywords: "餐厅",
    types: "050000",
    region: city,
    city_limit: "true",
    page_size: "20",
  });

  rows.push({
    city,
    pin: `${pin.lng.toFixed(3)},${pin.lat.toFixed(3)}`,
    attr_around_dist_curL0: summarizeAttr(aroundDist.pois, currentL0),
    attr_around_weight_propL0: summarizeAttr(aroundWeight.pois, proposedL0),
    attr_text_110000_propL0: summarizeAttr(textTyped.pois, proposedL0),
    dine_around_1km: summarizeDining(dineAround.pois),
    dine_text_050000: summarizeDining(dineText.pois),
    api_ok: {
      aroundDist: aroundDist.ok,
      aroundWeight: aroundWeight.ok,
      text: textTyped.ok,
      dineAround: dineAround.ok,
      dineText: dineText.ok,
    },
  });
  process.stderr.write(`ok ${city}\n`);
}

const score = (r) => r.attr_text_110000_propL0?.iconic ?? 0;
const out = {
  as_of: "2026-09-06",
  n: rows.length,
  cities_text_iconic_ge3: rows.filter((r) => score(r) >= 3).length,
  cities_text_iconic_ge5: rows.filter((r) => score(r) >= 5).length,
  cities_weight_iconic_ge3: rows.filter((r) => (r.attr_around_weight_propL0?.iconic ?? 0) >= 3)
    .length,
  cities_baseline_iconic_ge3: rows.filter((r) => (r.attr_around_dist_curL0?.iconic ?? 0) >= 3)
    .length,
  hangzhou: rows.find((r) => r.city === "杭州"),
  rows,
};

const dest = resolve(import.meta.dirname, "../../workspace-specs/knowledge/maps/amap-cn20-probe.json");
writeFileSync(dest, JSON.stringify(out, null, 2));
console.log(JSON.stringify({ ...out, rows: undefined, hangzhou: out.hangzhou }, null, 2));
console.log("wrote", dest);
