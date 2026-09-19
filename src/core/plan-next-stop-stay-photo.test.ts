/**
 * ADR-051 D1.3 — stay / origin photos resolved in plan_next_stop fill.
 */
import { describe, expect, it, vi } from "vitest";
import { pickLodgingStayCard, planNextStopFill } from "./plan-next-stop";
import { type PlaceCard } from "./types";
import { isDisplayablePhotoUrl } from "./resolve-display-photo";

function hotelCard(overrides?: Partial<PlaceCard>): PlaceCard {
  return {
    provider: "GOOGLE_MAPS",
    name: "Hills Hotel Lisboa",
    location: { lat: 38.72, lng: -9.14, crs: "WGS84" },
    sources: [
      {
        provider: "GOOGLE_MAPS",
        native_id: "places/hotel1",
        deeplinks: { google_web: "https://maps.google.com/?q=hotel" },
      },
    ],
    ...overrides,
  };
}

describe("planNextStopFill stay photo (ADR-051 D1.3)", () => {
  it("should_attach_displayable_photo_when_origin_stay_has_no_card", async () => {
    const search = vi.fn(async () => [
      hotelCard({ photos: ["https://lh3.googleusercontent.com/stay-photo"] }),
    ]);

    const result = await planNextStopFill({
      origin_mode: true,
      next_stop: { name: "Hills Hotel Lisboa", kind: "stay", lat: 38.72, lng: -9.14 },
      candidates: { places: [], restaurants: [] },
      city: "Lisbon",
      time_from: "09:00",
      stay_role: "day_origin",
      locale: "EN",
      _testSearchPlaces: search,
    });

    expect(search).toHaveBeenCalled();
    const card = result.stop_display?.stop.card;
    expect(card?.name).toBe("Hills Hotel Lisboa");
    expect(card?.photos?.[0]).toBeTruthy();
    expect(isDisplayablePhotoUrl(card?.photos?.[0])).toBe(true);
  });

  it("should_reuse_pool_lodging_without_photos_and_skip_search", async () => {
    const search = vi.fn(async () => {
      throw new Error("search must not run when pool has lodging match");
    });
    const existing = hotelCard({ photos: undefined });

    const result = await planNextStopFill({
      origin_mode: true,
      next_stop: { name: "Hills Hotel Lisboa", kind: "stay", lat: 38.72, lng: -9.14 },
      candidates: { places: [existing], restaurants: [] },
      city: "Lisbon",
      time_from: "09:00",
      stay_role: "day_origin",
      locale: "EN",
      _testSearchPlaces: search,
    });

    expect(search).not.toHaveBeenCalled();
    expect(result.stop_display?.stop.card?.name).toBe("Hills Hotel Lisboa");
  });

  it("should_reuse_resolved_stay_card_when_photos0_already_displayable", async () => {
    const search = vi.fn(async () => {
      throw new Error("search must not run when card already has displayable photo");
    });
    const existing = hotelCard({
      photos: ["https://lh3.googleusercontent.com/already-resolved"],
    });

    const result = await planNextStopFill({
      origin_mode: true,
      next_stop: { name: "Hills Hotel Lisboa", kind: "stay", lat: 38.72, lng: -9.14 },
      candidates: { places: [existing], restaurants: [] },
      city: "Lisbon",
      time_from: "09:00",
      stay_role: "day_origin",
      locale: "EN",
      _testSearchPlaces: search,
    });

    expect(search).not.toHaveBeenCalled();
    expect(result.stop_display?.stop.card?.photos?.[0]).toBe(
      "https://lh3.googleusercontent.com/already-resolved",
    );
  });

  it("should_omit_photos_when_search_and_resolve_fail", async () => {
    const search = vi.fn(async () => [] as PlaceCard[]);

    const result = await planNextStopFill({
      origin_mode: true,
      next_stop: { name: "Hills Hotel Lisboa", kind: "stay" },
      candidates: { places: [], restaurants: [] },
      city: "Lisbon",
      time_from: "09:00",
      stay_role: "day_origin",
      locale: "EN",
      _testSearchPlaces: search,
    });

    expect(search).toHaveBeenCalled();
    const photos = result.stop_display?.stop.card?.photos;
    expect(photos == null || photos.length === 0).toBe(true);
  });

  it("should_not_search_when_stop_has_native_id_pointer (ADR-053)", async () => {
    const search = vi.fn(async () => {
      throw new Error("must not re-search when native_id is present");
    });
    const result = await planNextStopFill({
      origin_mode: true,
      next_stop: {
        name: "凯悦逸扉酒店(西安钟楼回民街店)",
        kind: "stay",
        lat: 34.26,
        lng: 108.94,
        provider: "AMAP",
        native_id: "B000A87B",
      },
      candidates: { places: [], restaurants: [] },
      city: "西安",
      time_from: "09:00",
      stay_role: "day_origin",
      locale: "CN",
      _testSearchPlaces: search,
    });
    expect(search).not.toHaveBeenCalled();
    expect(result.stop_display?.stop.card?.sources?.[0]?.native_id).toBe("B000A87B");
  });

  it("should_reject_landmark_cards0_when_researching_stay (ADR-053)", async () => {
    const search = vi.fn(async () => [
      {
        provider: "GOOGLE_MAPS",
        name: "Bell Tower of Xi'an",
        category: "tourist_attraction",
        location: { lat: 34.26, lng: 108.94, crs: "WGS84" as const },
        sources: [
          {
            provider: "GOOGLE_MAPS",
            native_id: "places/bell",
            deeplinks: {},
          },
        ],
        photos: ["https://lh3.googleusercontent.com/bell-tower"],
      } satisfies PlaceCard,
    ]);

    const result = await planNextStopFill({
      origin_mode: true,
      next_stop: { name: "凯悦逸扉酒店(西安钟楼回民街店)", kind: "stay" },
      candidates: { places: [], restaurants: [] },
      city: "西安",
      time_from: "09:00",
      stay_role: "day_origin",
      locale: "CN",
      _testSearchPlaces: search,
    });

    expect(search).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.not.stringContaining("钟楼"),
      }),
    );
    const card = result.stop_display?.stop.card;
    expect(card?.name === "Bell Tower of Xi'an").toBe(false);
    expect(card?.photos?.[0] === "https://lh3.googleusercontent.com/bell-tower").toBe(false);
  });

  it("should_reuse_resolved_card_on_return_stay_without_research", async () => {
    const search = vi.fn(async () => {
      throw new Error("return stay must reuse pool card");
    });
    const existing = hotelCard({
      photos: ["https://lh3.googleusercontent.com/day-origin-photo"],
    });

    const result = await planNextStopFill({
      next_stop: { name: "Hills Hotel Lisboa", kind: "stay", lat: 38.72, lng: -9.14 },
      current_stop: {
        name: "Torre de Belém",
        kind: "attraction",
        lat: 38.6916,
        lng: -9.216,
        end_time: "17:00",
      },
      candidates: { places: [existing], restaurants: [] },
      stay_role: "return",
      locale: "EN",
      _testResolveDuration: async () => ({ duration_min: 20 }),
      _testSearchPlaces: search,
    });

    expect(search).not.toHaveBeenCalled();
    expect(result.stop_display?.stop.card?.photos?.[0]).toBe(
      "https://lh3.googleusercontent.com/day-origin-photo",
    );
  });
});

describe("pickLodgingStayCard", () => {
  it("should_match_amap_core_name_when_query_has_district_prefix", () => {
    const cards: PlaceCard[] = [
      {
        provider: "AMAP",
        name: "大华饭店",
        location: { lat: 30.25, lng: 120.15, crs: "WGS84" },
        sources: [{ provider: "AMAP", native_id: "hz-dahua", deeplinks: {} }],
      },
      {
        provider: "AMAP",
        name: "大华饭店地面停车场",
        location: { lat: 30.25, lng: 120.15, crs: "WGS84" },
        sources: [{ provider: "AMAP", native_id: "hz-park", deeplinks: {} }],
      },
      {
        provider: "AMAP",
        name: "杭州大华饭店北楼",
        location: { lat: 30.25, lng: 120.15, crs: "WGS84" },
        sources: [{ provider: "AMAP", native_id: "hz-north", deeplinks: {} }],
      },
    ];
    const picked = pickLodgingStayCard("西湖大华饭店", cards);
    expect(picked?.name).toBe("大华饭店");
  });

  it("should_accept_sole_lodging_hit_when_en_query_vs_cn_google_title (TD-5)", () => {
    const cards: PlaceCard[] = [
      {
        provider: "GOOGLE_MAPS",
        name: "银座蒙特利拉苏瑞酒店",
        category: "hotel",
        location: { lat: 35.671, lng: 139.765, crs: "WGS84" },
        sources: [
          {
            provider: "GOOGLE_MAPS",
            native_id: "places/monterey-ginza",
            deeplinks: {},
          },
        ],
      },
    ];
    const picked = pickLodgingStayCard("Hotel Monterey Lasoeur Ginza", cards);
    expect(picked?.name).toBe("银座蒙特利拉苏瑞酒店");
    expect(picked?.sources?.[0]?.native_id).toBe("places/monterey-ginza");
  });
});

describe("planNextStopFill attraction fill-by-id (ADR-072 / agent-fill-113)", () => {
  const enPool: PlaceCard = {
    provider: "GOOGLE_MAPS",
    name: "Belém Tower",
    location: { lat: 38.6916, lng: -9.216, crs: "WGS84" },
    photos: ["https://lh3.googleusercontent.com/belem-pool-photo"],
    sources: [
      {
        provider: "GOOGLE_MAPS",
        native_id: "ChIJS5zCw0LLHg0RP1FSz63cAjA",
        deeplinks: {},
      },
    ],
  };
  const pasteis: PlaceCard = {
    provider: "GOOGLE_MAPS",
    name: "Pastéis de Belém",
    location: { lat: 38.697, lng: -9.203, crs: "WGS84" },
    sources: [{ provider: "GOOGLE_MAPS", native_id: "ChIJ-pasteis", deeplinks: {} }],
  };

  it("TC-F113-03: copies pool photo by native_id without search (CN locale, PT stop name)", async () => {
    const search = vi.fn(async () => {
      throw new Error("search must not run when pointer matches pool card");
    });

    const result = await planNextStopFill({
      current_stop: {
        name: "Hills Hotel Lisboa",
        kind: "stay",
        lat: 38.73,
        lng: -9.14,
        end_time: "09:00",
      },
      next_stop: {
        name: "Torre de Belém",
        kind: "attraction",
        provider: "GOOGLE_MAPS",
        native_id: "ChIJS5zCw0LLHg0RP1FSz63cAjA",
      },
      candidates: { places: [enPool, pasteis], restaurants: [] },
      city: "Lisbon",
      locale: "CN",
      day_stops: [
        { name: "Hills Hotel Lisboa", kind: "stay" },
        { name: "Torre de Belém", kind: "attraction" },
      ],
      _testSearchPlaces: search,
      _testGeocode: async () => ({ lat: 38.6916, lng: -9.216 }),
    });

    expect(search).not.toHaveBeenCalled();
    expect(result.stop_display?.stop.card?.photos?.[0]).toBe(
      "https://lh3.googleusercontent.com/belem-pool-photo",
    );
  });

  it("TC-F113-04: id-intersect binds one pool hit; ignores searched[0] when not in pool", async () => {
    const searchMany = vi.fn(async () => [
      {
        provider: "GOOGLE_MAPS",
        name: "Wrong POI",
        location: { lat: 38.7, lng: -9.2, crs: "WGS84" as const },
        photos: ["https://lh3.googleusercontent.com/wrong"],
        sources: [{ provider: "GOOGLE_MAPS", native_id: "ChIJ-not-in-pool", deeplinks: {} }],
      },
      {
        ...enPool,
        photos: ["https://lh3.googleusercontent.com/belem-from-search"],
      },
      {
        ...pasteis,
        photos: ["https://lh3.googleusercontent.com/pasteis"],
      },
    ]);

    const manyResult = await planNextStopFill({
      current_stop: {
        name: "Hills Hotel Lisboa",
        kind: "stay",
        lat: 38.73,
        lng: -9.14,
        end_time: "09:00",
      },
      next_stop: { name: "Torre de Belém", kind: "attraction" },
      candidates: { places: [enPool, pasteis], restaurants: [] },
      city: "Lisbon",
      locale: "EN",
      _testSearchPlaces: searchMany,
      _testGeocode: async () => ({ lat: 38.6916, lng: -9.216 }),
    });
    expect(searchMany).toHaveBeenCalled();
    expect(manyResult.stop_display?.stop.card?.photos?.[0]).not.toBe(
      "https://lh3.googleusercontent.com/wrong",
    );
    expect(manyResult.stop_display?.stop.card?.photos?.[0]).toBeUndefined();

    const searchOne = vi.fn(async () => [
      {
        provider: "GOOGLE_MAPS",
        name: "Unrelated first hit",
        location: { lat: 38.7, lng: -9.2, crs: "WGS84" as const },
        photos: ["https://lh3.googleusercontent.com/wrong"],
        sources: [{ provider: "GOOGLE_MAPS", native_id: "ChIJ-not-in-pool", deeplinks: {} }],
      },
      {
        ...enPool,
        photos: ["https://lh3.googleusercontent.com/belem-intersect"],
      },
    ]);

    const oneResult = await planNextStopFill({
      current_stop: {
        name: "Hills Hotel Lisboa",
        kind: "stay",
        lat: 38.73,
        lng: -9.14,
        end_time: "09:00",
      },
      next_stop: { name: "Torre de Belém", kind: "attraction" },
      candidates: { places: [enPool, pasteis], restaurants: [] },
      city: "Lisbon",
      locale: "EN",
      _testSearchPlaces: searchOne,
      _testGeocode: async () => ({ lat: 38.6916, lng: -9.216 }),
    });
    expect(oneResult.stop_display?.stop.card?.photos?.[0]).toBe(
      "https://lh3.googleusercontent.com/belem-intersect",
    );
  });

  it("TC-F113-05: Google Details writes zh display name once; AMAP name unchanged", async () => {
    const details = vi.fn(async () => ({
      provider: "GOOGLE_MAPS" as const,
      name: "贝伦塔",
      location: { lat: 38.6916, lng: -9.216, crs: "WGS84" as const },
      photos: ["https://lh3.googleusercontent.com/belem-pool-photo"],
      sources: [
        {
          provider: "GOOGLE_MAPS" as const,
          native_id: "ChIJS5zCw0LLHg0RP1FSz63cAjA",
          deeplinks: {},
        },
      ],
    }));

    const googleResult = await planNextStopFill({
      current_stop: {
        name: "Hills Hotel Lisboa",
        kind: "stay",
        lat: 38.73,
        lng: -9.14,
        end_time: "09:00",
      },
      next_stop: {
        name: "Torre de Belém",
        kind: "attraction",
        provider: "GOOGLE_MAPS",
        native_id: "ChIJS5zCw0LLHg0RP1FSz63cAjA",
      },
      candidates: { places: [enPool], restaurants: [] },
      city: "Lisbon",
      locale: "CN",
      _testGetPlaceDetails: details,
      _testGeocode: async () => ({ lat: 38.6916, lng: -9.216 }),
    });
    expect(details).toHaveBeenCalled();
    expect(googleResult.stop_display?.stop.name).toBe("贝伦塔");

    const amapCard: PlaceCard = {
      provider: "AMAP",
      name: "西安钟楼",
      location: { lat: 34.26, lng: 108.94, crs: "WGS84" },
      photos: ["https://store.is.autonavi.com/clock-tower.jpg"],
      sources: [{ provider: "AMAP", native_id: "B000A87B", deeplinks: {} }],
    };
    const amapDetails = vi.fn(async () => {
      throw new Error("AMAP must not fetch Google-style display rename");
    });

    const amapResult = await planNextStopFill({
      current_stop: {
        name: "酒店",
        kind: "stay",
        lat: 34.26,
        lng: 108.94,
        end_time: "09:00",
      },
      next_stop: {
        name: "西安钟楼",
        kind: "attraction",
        provider: "AMAP",
        native_id: "B000A87B",
      },
      candidates: { places: [amapCard], restaurants: [] },
      city: "西安",
      locale: "CN",
      _testGetPlaceDetails: amapDetails,
      _testGeocode: async () => ({ lat: 34.26, lng: 108.94 }),
    });
    expect(amapDetails).not.toHaveBeenCalled();
    expect(amapResult.stop_display?.stop.name).toBe("西安钟楼");
  });

  it("should_bind_castelo_via_id_intersect_when_name_differs_from_pool", async () => {
    const withPhotos: PlaceCard = {
      provider: "GOOGLE_MAPS",
      name: "Castelo de São Jorge",
      location: { lat: 38.7139, lng: -9.1335, crs: "WGS84" },
      photos: ["https://lh3.googleusercontent.com/castelo"],
      sources: [
        {
          provider: "GOOGLE_MAPS",
          native_id: "ChIJm8MOtHc0GQ0R1zPkmUFwwLQ",
          deeplinks: {},
        },
      ],
    };
    const search = vi.fn(async () => [withPhotos]);
    const result = await planNextStopFill({
      current_stop: {
        name: "Hills Hotel Lisboa",
        kind: "stay",
        lat: 38.73,
        lng: -9.14,
        end_time: "09:00",
      },
      next_stop: { name: "Saint George Castle", kind: "attraction" },
      candidates: { places: [withPhotos], restaurants: [] },
      city: "Lisbon",
      locale: "EN",
      _testSearchPlaces: search,
      _testGeocode: async () => ({ lat: 38.7139, lng: -9.1335 }),
    });
    expect(search).toHaveBeenCalled();
    expect(result.stop_display?.stop.card?.photos?.[0]).toBe(
      "https://lh3.googleusercontent.com/castelo",
    );
  });

  it("should_not_bind_search_hit_when_id_not_in_pool", async () => {
    const garden: PlaceCard = {
      provider: "GOOGLE_MAPS",
      name: "Garden of the Castle of São Jorge",
      location: { lat: 38.7135, lng: -9.133, crs: "WGS84" },
      sources: [{ provider: "GOOGLE_MAPS", native_id: "ChIJ-garden", deeplinks: {} }],
    };
    const casteloHit: PlaceCard = {
      provider: "GOOGLE_MAPS",
      name: "Castelo de São Jorge",
      location: { lat: 38.7139, lng: -9.1335, crs: "WGS84" },
      photos: ["https://lh3.googleusercontent.com/castelo"],
      sources: [
        {
          provider: "GOOGLE_MAPS",
          native_id: "ChIJm8MOtHc0GQ0R1zPkmUFwwLQ",
          deeplinks: {},
        },
      ],
    };
    const search = vi.fn(async () => [casteloHit]);
    const result = await planNextStopFill({
      current_stop: {
        name: "Hills Hotel Lisboa",
        kind: "stay",
        lat: 38.73,
        lng: -9.14,
        end_time: "09:00",
      },
      next_stop: { name: "Castelo de São Jorge", kind: "attraction" },
      candidates: { places: [garden], restaurants: [] },
      city: "Lisbon",
      locale: "EN",
      _testSearchPlaces: search,
      _testGeocode: async () => ({ lat: 38.7139, lng: -9.1335 }),
    });
    expect(search).toHaveBeenCalled();
    expect(result.stop_display?.stop.card?.photos?.[0]).toBeUndefined();
  });
});
