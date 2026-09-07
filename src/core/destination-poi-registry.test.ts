import { afterEach, describe, expect, it } from "vitest";
import {
  canRegisterAttraction,
  cardSlimFromPlace,
  createMemoryPoiRegistryStore,
  destinationLookupKey,
  listPoisForDestination,
  mergeRegistryPlaces,
  resetPoiRegistryStoreForTests,
  upsertEligiblePois,
} from "./destination-poi-registry";
import { type PlaceCard } from "./types";

function card(
  name: string,
  opts?: {
    nativeId?: string | null;
    collection?: boolean;
    photos?: string[];
    must_see?: boolean;
    rating?: number;
    lat?: number;
    lng?: number;
  },
): PlaceCard {
  const n = opts?.collection ? `${name}名胜区` : name;
  const sources =
    opts?.nativeId === null
      ? []
      : [
          {
            provider: "GOOGLE_MAPS" as const,
            native_id: opts?.nativeId ?? "g1",
            deeplinks: { google_web: "https://maps.google.com/?q=1" },
          },
        ];
  return {
    provider: "GOOGLE_MAPS",
    name: n,
    location: { lat: opts?.lat ?? 38.7, lng: opts?.lng ?? -9.1, crs: "WGS84" },
    sources,
    ...(opts?.photos ? { photos: opts.photos } : {}),
    ...(opts?.must_see != null ? { must_see: opts.must_see } : {}),
    ...(opts?.rating != null ? { rating: opts.rating } : {}),
  };
}

describe("destination-poi-registry (TC-M22-87)", () => {
  afterEach(() => {
    resetPoiRegistryStoreForTests();
  });

  it("TC-M22-87-01 should_skip_upsert_when_card_ineligible_or_missing_native_id", async () => {
    const store = createMemoryPoiRegistryStore();
    const { poiIds } = await upsertEligiblePois(
      [card("西湖十景", { collection: true }), card("无名", { nativeId: null })],
      { city: "杭州" },
      store,
    );
    expect(poiIds).toEqual([]);
    expect(canRegisterAttraction(card("西湖十景", { collection: true }))).toBe(false);
    expect(canRegisterAttraction(card("无名", { nativeId: null }))).toBe(false);
  });

  it("TC-M22-87-02 should_upsert_eligible_and_list_by_destination", async () => {
    const store = createMemoryPoiRegistryStore();
    const torre = card("Torre de Belém", { nativeId: "ChIJlisbon" });
    await upsertEligiblePois([torre], { city: "Lisbon", lat: 38.722, lng: -9.139 }, store);
    const listed = await listPoisForDestination({ city: "Lisbon", lat: 38.722, lng: -9.139 }, store);
    expect(listed.map((p) => p.name)).toContain("Torre de Belém");
    expect(listed[0]?.sources[0]?.native_id).toBe("ChIJlisbon");
  });

  it("should_use_same_lookup_shape_for_hangzhou_and_lisbon", () => {
    const hz = destinationLookupKey({ city: "杭州", lat: 30.25, lng: 120.16 });
    const lx = destinationLookupKey({ city: "Lisbon", lat: 38.722, lng: -9.139 });
    expect(hz.startsWith("GEO:q:")).toBe(true);
    expect(lx.startsWith("GEO:q:")).toBe(true);
    expect(hz).not.toBe(lx);
    expect(destinationLookupKey({ city: "Lisbon", placeId: "ChIJ", provider: "GOOGLE_MAPS" })).toBe(
      "GOOGLE_MAPS:id:ChIJ",
    );
  });

  it("TC-M22-87-04 should_not_throw_when_registry_store_fails", async () => {
    const { safeUpsertEligiblePois } = await import("./destination-poi-registry");
    const boom: import("./destination-poi-registry").PoiRegistryStore = {
      getOrCreateDestination: async () => {
        throw new Error("pg down");
      },
      upsertPoi: async () => ({ id: "x" }),
      listPois: async () => [],
    };
    await expect(safeUpsertEligiblePois([card("Torre")], { city: "Lisbon" }, boom)).resolves.toEqual({
      destinationId: "",
      poiIds: [],
    });
  });

  it("TC-M22-87-05 should_return_before_details_land", async () => {
    const store = createMemoryPoiRegistryStore();
    const { poiIds } = await upsertEligiblePois(
      [card("Torre de Belém")],
      { city: "Lisbon", lat: 38.722, lng: -9.139 },
      store,
    );
    let work: (() => Promise<void>) | undefined;
    const { schedulePoiDetailsRefresh } = await import("./destination-poi-registry");
    const { scheduled } = await schedulePoiDetailsRefresh(poiIds, {
      store,
      enqueue: (fn) => {
        work = fn;
      },
      getDetails: async () => ({ phone: "+351" }),
    });
    expect(scheduled).toBe(1);
    const before = store.getPoi ? await store.getPoi(poiIds[0]!) : null;
    expect(before?.details).toBeNull();
    await work?.();
    const after = store.getPoi ? await store.getPoi(poiIds[0]!) : null;
    expect(after?.details).toEqual({ phone: "+351" });
  });

  it("TC-M22-87-06 should_persist_details_without_trip_patch", async () => {
    const store = createMemoryPoiRegistryStore();
    const { poiIds } = await upsertEligiblePois([card("Torre de Belém")], { city: "Lisbon" }, store);
    let work: (() => Promise<void>) | undefined;
    const { schedulePoiDetailsRefresh } = await import("./destination-poi-registry");
    await schedulePoiDetailsRefresh(poiIds, {
      store,
      enqueue: (fn) => {
        work = fn;
      },
      getDetails: async () => ({ hours: "09:00-18:00" }),
    });
    await work?.();
    const row = store.getPoi ? await store.getPoi(poiIds[0]!) : null;
    expect(row?.details).toEqual({ hours: "09:00-18:00" });
    expect(row?.cardSlim.name).toBe("Torre de Belém");
  });

  it("TC-M22-87-07 should_skip_refresh_when_details_fresh", async () => {
    const store = createMemoryPoiRegistryStore();
    const { poiIds } = await upsertEligiblePois([card("Torre de Belém")], { city: "Lisbon" }, store);
    const now = new Date();
    await store.updatePoiDetails?.(poiIds[0]!, { phone: "1" }, now);
    const { schedulePoiDetailsRefresh } = await import("./destination-poi-registry");
    let ran = 0;
    const { scheduled } = await schedulePoiDetailsRefresh(poiIds, {
      store,
      now,
      getDetails: async () => {
        ran += 1;
        return { phone: "2" };
      },
    });
    expect(scheduled).toBe(0);
    expect(ran).toBe(0);
  });

  it("should_merge_registry_places_without_duplicate_names", () => {
    const a = card("贝伦塔", { nativeId: "a" });
    const b = card("城堡", { nativeId: "b" });
    const merged = mergeRegistryPlaces([a], [a, b]);
    expect(merged.map((p) => p.name)).toEqual(["贝伦塔", "城堡"]);
  });

  it("should_skip_upsert_when_cardSlim_unchanged", async () => {
    const store = createMemoryPoiRegistryStore();
    const anchor = { city: "Lisbon", lat: 38.722, lng: -9.139 };
    const torre = card("Torre de Belém", {
      nativeId: "ChIJlisbon",
      photos: ["https://cdn.example.com/belem.jpg"],
      rating: 4.7,
    });
    const { destinationId, poiIds } = await upsertEligiblePois([torre], anchor, store);
    expect(poiIds).toHaveLength(1);
    const before = (await store.listPois(destinationId))[0]!;
    const { poiIds: again } = await upsertEligiblePois([torre], anchor, store);
    expect(again).toEqual(poiIds);
    const after = (await store.listPois(destinationId))[0]!;
    // Same object → no bag.set rewrite (diff-skip).
    expect(after).toBe(before);
    expect(after.aliases).toEqual([]);
  });

  it("should_update_when_name_changed_and_keep_old_name_as_alias", async () => {
    const store = createMemoryPoiRegistryStore();
    const anchor = { city: "Lisbon", lat: 38.722, lng: -9.139 };
    await upsertEligiblePois(
      [card("Belém Tower", { nativeId: "ChIJlisbon", photos: ["https://cdn.example.com/a.jpg"] })],
      anchor,
      store,
    );
    const { destinationId, poiIds } = await upsertEligiblePois(
      [
        card("Torre de Belém", {
          nativeId: "ChIJlisbon",
          photos: ["https://cdn.example.com/a.jpg"],
        }),
      ],
      anchor,
      store,
    );
    const row = (await store.listPois(destinationId))[0]!;
    expect(row.id).toBe(poiIds[0]);
    expect(row.name).toBe("Torre de Belém");
    expect(row.aliases).toContain("Belém Tower");
  });

  it("should_store_photos_first_displayable_in_cardSlim", () => {
    const slim = cardSlimFromPlace(
      card("Torre de Belém", {
        nativeId: "ChIJlisbon",
        photos: [
          "http://insecure.example.com/x.jpg",
          "https://places.googleapis.com/v1/places/x/media?maxWidthPx=400",
          "https://cdn.example.com/belem.jpg",
        ],
      }),
    );
    expect(slim.photos).toEqual(["https://cdn.example.com/belem.jpg"]);
  });

  it("should_not_store_must_see_in_cardSlim", () => {
    const slim = cardSlimFromPlace(
      card("Torre de Belém", {
        nativeId: "ChIJlisbon",
        must_see: true,
        photos: ["https://cdn.example.com/belem.jpg"],
      }),
    );
    expect(slim.must_see).toBeUndefined();
    expect(slim.photos?.[0]).toBe("https://cdn.example.com/belem.jpg");
  });
});
