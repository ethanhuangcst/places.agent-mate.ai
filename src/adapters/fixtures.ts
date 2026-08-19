import { type PlaceCard, type PlaceLocation } from "../core/types";
import { type SearchInput } from "../core/types";

function mapsUrl(loc: PlaceLocation, name: string): Record<string, string> {
  const q = encodeURIComponent(`${loc.lat},${loc.lng}`);
  const nameQ = encodeURIComponent(name);
  return {
    google_web: `https://www.google.com/maps/search/?api=1&query=${q}`,
    google_app: `https://maps.google.com/?q=${q}`,
    amap_web: `https://uri.amap.com/marker?position=${loc.lng},${loc.lat}&name=${nameQ}`,
  };
}

/** Minhang Aegean Shopping Park — fixture anchor for CN mainland demos. */
export const SHANGHAI_AEGEAN_GCJ: PlaceLocation = {
  lat: 31.1752,
  lng: 121.3748,
  crs: "GCJ-02",
};

export const SHANGHAI_AEGEAN_WGS: PlaceLocation = {
  lat: 31.1738,
  lng: 121.3685,
  crs: "WGS84",
};

export const FIXTURE_RESTAURANTS: PlaceCard[] = [
  {
    provider: "GOOGLE_MAPS",
    name: "Yat Lok Roast Goose",
    address: "34-38 Stanley Street, Central, Hong Kong",
    location: { lat: 22.2826, lng: 114.1553, crs: "WGS84" },
    rating: 4.4,
    category: "restaurant",
    sources: [
      {
        provider: "GOOGLE_MAPS",
        native_id: "fixture_yat_lok",
        deeplinks: mapsUrl({ lat: 22.2826, lng: 114.1553, crs: "WGS84" }, "Yat Lok Roast Goose"),
      },
    ],
  },
  {
    provider: "GOOGLE_MAPS",
    name: "Tim Ho Wan",
    address: "Shop 12A, North Point, Hong Kong",
    location: { lat: 22.291, lng: 114.2, crs: "WGS84" },
    rating: 4.2,
    category: "restaurant",
    sources: [
      {
        provider: "GOOGLE_MAPS",
        native_id: "fixture_tim_ho_wan",
        deeplinks: mapsUrl({ lat: 22.291, lng: 114.2, crs: "WGS84" }, "Tim Ho Wan"),
      },
    ],
  },
  {
    provider: "GOOGLE_MAPS",
    name: "Ichiran Ramen Central",
    address: "11 Stanley Street, Central, Hong Kong",
    location: { lat: 22.2828, lng: 114.1558, crs: "WGS84" },
    rating: 4.2,
    category: "restaurant",
    sources: [
      {
        provider: "GOOGLE_MAPS",
        native_id: "fixture_ichiran_hk",
        deeplinks: mapsUrl(
          { lat: 22.2828, lng: 114.1558, crs: "WGS84" },
          "Ichiran Ramen Central",
        ),
      },
    ],
  },
  {
    provider: "GOOGLE_MAPS",
    name: "Akasaka-tei M9 Wagyu",
    address: "1588 Wuzhong Rd, Aegean Mall, Minhang, Shanghai",
    location: SHANGHAI_AEGEAN_WGS,
    rating: 4.5,
    category: "restaurant",
    sources: [
      {
        provider: "GOOGLE_MAPS",
        native_id: "fixture_google_akasaka_sh",
        deeplinks: mapsUrl(SHANGHAI_AEGEAN_WGS, "Akasaka-tei M9 Wagyu"),
      },
    ],
  },
  {
    provider: "GOOGLE_MAPS",
    name: "Sapporo Ichiban Japanese",
    address: "L5 Aegean Mall, 1588 Wuzhong Rd, Shanghai",
    location: { lat: 31.1741, lng: 121.3692, crs: "WGS84" },
    rating: 4.3,
    category: "restaurant",
    sources: [
      {
        provider: "GOOGLE_MAPS",
        native_id: "fixture_google_sapporo_sh",
        deeplinks: mapsUrl(
          { lat: 31.1741, lng: 121.3692, crs: "WGS84" },
          "Sapporo Ichiban Japanese",
        ),
      },
    ],
  },
];

export const FIXTURE_AMAP_RESTAURANTS: PlaceCard[] = [
  {
    provider: "AMAP",
    name: "赤坂亭·M9和牛烧肉",
    address: "上海市闵行区吴中路1588号爱琴海购物公园",
    location: SHANGHAI_AEGEAN_GCJ,
    rating: 4.5,
    category: "restaurant",
    sources: [
      {
        provider: "AMAP",
        native_id: "fixture_amap_akasaka",
        deeplinks: mapsUrl(SHANGHAI_AEGEAN_GCJ, "赤坂亭·M9和牛烧肉"),
      },
    ],
  },
  {
    provider: "AMAP",
    name: "将太无二·日式料理",
    address: "上海市闵行区吴中路1588号爱琴海购物公园L5",
    location: { lat: 31.1755, lng: 121.3752, crs: "GCJ-02" },
    rating: 4.3,
    category: "restaurant",
    sources: [
      {
        provider: "AMAP",
        native_id: "fixture_amap_sapporo",
        deeplinks: mapsUrl(
          { lat: 31.1755, lng: 121.3752, crs: "GCJ-02" },
          "将太无二·日式料理",
        ),
      },
    ],
  },
  {
    provider: "AMAP",
    name: "江户前寿司",
    address: "上海市闵行区吴中路1590号",
    location: { lat: 31.1746, lng: 121.3739, crs: "GCJ-02" },
    rating: 4.4,
    category: "restaurant",
    sources: [
      {
        provider: "AMAP",
        native_id: "fixture_amap_edo_sushi",
        deeplinks: mapsUrl(
          { lat: 31.1746, lng: 121.3739, crs: "GCJ-02" },
          "江户前寿司",
        ),
      },
    ],
  },
  {
    provider: "AMAP",
    name: "太興燒味",
    address: "中環士丹利街",
    location: { lat: 22.2826, lng: 114.1553, crs: "GCJ-02" },
    rating: 4.1,
    category: "restaurant",
    sources: [
      {
        provider: "AMAP",
        native_id: "fixture_amap_taixing",
        deeplinks: mapsUrl({ lat: 22.2826, lng: 114.1553, crs: "GCJ-02" }, "太興燒味"),
      },
    ],
  },
  {
    provider: "AMAP",
    name: "一蘭拉麵中環",
    address: "中環士丹利街11號, 香港",
    location: { lat: 22.2828, lng: 114.1558, crs: "GCJ-02" },
    rating: 4.2,
    category: "restaurant",
    sources: [
      {
        provider: "AMAP",
        native_id: "fixture_amap_ichiran_hk",
        deeplinks: mapsUrl(
          { lat: 22.2828, lng: 114.1558, crs: "GCJ-02" },
          "一蘭拉麵中環",
        ),
      },
    ],
  },
];

export const FIXTURE_POIS: PlaceCard[] = [
  {
    provider: "GOOGLE_MAPS",
    name: "National Museum of Western Art",
    address: "7-7 Ueno Park, Taito City, Tokyo",
    location: { lat: 35.7153, lng: 139.7758, crs: "WGS84" },
    rating: 4.5,
    category: "museum",
    sources: [
      {
        provider: "GOOGLE_MAPS",
        native_id: "fixture_tokyo_museum",
        deeplinks: mapsUrl(
          { lat: 35.7153, lng: 139.7758, crs: "WGS84" },
          "National Museum of Western Art",
        ),
      },
    ],
  },
  {
    provider: "GOOGLE_MAPS",
    name: "Hong Kong Museum of History",
    address: "100 Chatham Road South, Tsim Sha Tsui",
    location: { lat: 22.3019, lng: 114.1772, crs: "WGS84" },
    rating: 4.3,
    category: "museum",
    sources: [
      {
        provider: "GOOGLE_MAPS",
        native_id: "fixture_hk_museum",
        deeplinks: mapsUrl(
          { lat: 22.3019, lng: 114.1772, crs: "WGS84" },
          "Hong Kong Museum of History",
        ),
      },
    ],
  },
  {
    provider: "GOOGLE_MAPS",
    name: "Victoria Peak Garden",
    address: "Peak Road, The Peak, Hong Kong",
    location: { lat: 22.275, lng: 114.145, crs: "WGS84" },
    rating: 4.6,
    category: "park",
    sources: [
      {
        provider: "GOOGLE_MAPS",
        native_id: "fixture_peak_garden",
        deeplinks: mapsUrl(
          { lat: 22.275, lng: 114.145, crs: "WGS84" },
          "Victoria Peak Garden",
        ),
      },
    ],
  },
];

export function isDiningCategory(category?: string): boolean {
  if (!category) return false;
  const c = category.toLowerCase();
  return c === "restaurant" || c.includes("dining") || c.includes("food");
}

function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

const GENERIC_DINING_QUERY =
  /^(restaurants?|food|dining|places?\s+to\s+eat|吃饭|餐厅|餐廳|餐馆|餐館)$/i;
const JAPANESE_HINT =
  /日料|日本料理|japanese|烧肉|燒肉|寿司|壽司|ramen|sushi|和牛|日式|将太|赤坂|akasaka|江户|江戶|wagyu|sapporo|拉麵|拉面|一蘭|ichiran/i;
const SHANGHAI_HINT = /上海|shanghai|爱琴海|愛琴海|aegean|闵行|閔行|吴中路|吳中路|1588/i;
const HK_HINT = /香港|hong kong|hk|尖沙咀|中環|中环|central|tsim sha tsui/i;

export function resolveFixtureGeocode(
  query: string,
  crs: "WGS84" | "GCJ-02",
): { lat: number; lng: number; crs: "WGS84" | "GCJ-02"; address: string } {
  const q = query.trim();
  if (SHANGHAI_HINT.test(q)) {
    const loc = crs === "GCJ-02" ? SHANGHAI_AEGEAN_GCJ : SHANGHAI_AEGEAN_WGS;
    return { ...loc, address: q };
  }
  if (/东京|東京|tokyo|ueno|上野/i.test(q)) {
    return { lat: 35.7153, lng: 139.7758, crs: "WGS84", address: q };
  }
  const hkDefault =
    crs === "GCJ-02"
      ? { lat: 22.28, lng: 114.16, crs: "GCJ-02" as const }
      : { lat: 22.2819, lng: 114.158, crs: "WGS84" as const };
  return { ...hkDefault, address: q };
}

export function filterFixtureRestaurants(
  cards: PlaceCard[],
  input: SearchInput,
): PlaceCard[] {
  const rawQ = (input.query ?? "").toLowerCase();
  if (rawQ.includes("__empty__")) return [];
  const cleanQ = rawQ.replace("__ta_fail__", "").replace("__fail__", "").trim();

  let filtered = [...cards];

  if (JAPANESE_HINT.test(cleanQ)) {
    filtered = filtered.filter((r) =>
      JAPANESE_HINT.test(`${r.name} ${r.address ?? ""}`),
    );
  } else if (cleanQ && !GENERIC_DINING_QUERY.test(cleanQ)) {
    filtered = filtered.filter(
      (r) =>
        r.name.toLowerCase().includes(cleanQ) ||
        r.address?.toLowerCase().includes(cleanQ),
    );
  } else if (GENERIC_DINING_QUERY.test(cleanQ)) {
    // Generic "restaurant" queries omit specialty Japanese venues (TC-H14 baseline).
    filtered = filtered.filter(
      (r) => !JAPANESE_HINT.test(`${r.name} ${r.address ?? ""}`),
    );
  }

  if (SHANGHAI_HINT.test(cleanQ)) {
    filtered = filtered.filter((r) => SHANGHAI_HINT.test(r.address ?? ""));
  } else if (HK_HINT.test(cleanQ)) {
    filtered = filtered.filter((r) => HK_HINT.test(r.address ?? "") || !SHANGHAI_HINT.test(r.address ?? ""));
  }

  if (input.near) {
    filtered = filtered.filter(
      (r) => haversineKm(input.near!, r.location) <= 15,
    );
  }

  return filtered;
}

export function fixtureById(id: string): PlaceCard | undefined {
  const all = [...FIXTURE_RESTAURANTS, ...FIXTURE_AMAP_RESTAURANTS, ...FIXTURE_POIS];
  return all.find((r) => r.sources.some((s) => s.native_id === id));
}

export { mapsUrl };
