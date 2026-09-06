/**
 * ADR-051 D1.3 — stay / origin photos resolved in plan_next_stop fill.
 */
import { describe, expect, it, vi } from "vitest";
import { planNextStopFill } from "./plan-next-stop";
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
