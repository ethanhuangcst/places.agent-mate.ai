/**
 * ADR-051 — resolve displayable photo URLs before Trip store / UI.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlaceCard } from "./types";
import {
  isDisplayablePhotoUrl,
  resolveDisplayPhoto,
  resolveDisplayPhotosForCards,
} from "./resolve-display-photo";

function googleCard(overrides: Partial<PlaceCard> = {}): PlaceCard {
  return {
    provider: "GOOGLE_MAPS",
    name: "Belém Tower",
    location: { lat: 38.69, lng: -9.21, crs: "WGS84" },
    sources: [{ provider: "GOOGLE_MAPS", native_id: "ChIJtower", deeplinks: {} }],
    ...overrides,
  };
}

afterEach(() => {
  delete process.env.GOOGLE_PHOTOS_ENABLED;
  vi.unstubAllGlobals();
});

describe("isDisplayablePhotoUrl (ADR-051)", () => {
  it("should_accept_https_cdn_and_amap_direct_urls", () => {
    expect(isDisplayablePhotoUrl("https://lh3.googleusercontent.com/p/abc")).toBe(true);
    expect(isDisplayablePhotoUrl("https://store.is.autonavi.com/showpic/x")).toBe(true);
  });

  it("should_reject_google_places_media_urls_even_without_key", () => {
    expect(
      isDisplayablePhotoUrl(
        "https://places.googleapis.com/v1/places/ChIJ/photos/ABC/media?maxWidthPx=400",
      ),
    ).toBe(false);
    expect(
      isDisplayablePhotoUrl(
        "https://places.googleapis.com/v1/places/ChIJ/photos/ABC/media?maxWidthPx=400&key=SECRET",
      ),
    ).toBe(false);
    expect(
      isDisplayablePhotoUrl(
        "https://places.googleapis.com/v1/places/ChIJ/photos/ABC/media?maxWidthPx=400&skipHttpRedirect=true",
      ),
    ).toBe(false);
  });

  it("should_reject_non_https", () => {
    expect(isDisplayablePhotoUrl("http://cdn.example/a.jpg")).toBe(false);
    expect(isDisplayablePhotoUrl("")).toBe(false);
  });
});

describe("resolveDisplayPhoto (ADR-051)", () => {
  it("should_upgrade_amap_http_cdn_to_https", async () => {
    const card = googleCard({
      provider: "AMAP",
      photos: ["http://store.is.autonavi.com/showpic/tower"],
      sources: [{ provider: "AMAP", native_id: "B0", deeplinks: {} }],
    });
    const fetchFn = vi.fn();
    const out = await resolveDisplayPhoto(card, { fetchFn });
    expect(out.photos).toEqual(["https://store.is.autonavi.com/showpic/tower"]);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("should_keep_amap_direct_photo_as_is", async () => {
    const card = googleCard({
      provider: "AMAP",
      photos: ["https://store.is.autonavi.com/showpic/tower"],
      sources: [{ provider: "AMAP", native_id: "B0", deeplinks: {} }],
    });
    const fetchFn = vi.fn();
    const out = await resolveDisplayPhoto(card, { fetchFn });
    expect(out.photos).toEqual(["https://store.is.autonavi.com/showpic/tower"]);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("should_resolve_google_photo_name_to_photoUri_cdn", async () => {
    const card = googleCard({
      google_photo_names: ["places/ChIJtower/photos/AAA"],
      photos: undefined,
    });
    const fetchFn = vi.fn(async () =>
      new Response(JSON.stringify({ photoUri: "https://lh3.googleusercontent.com/p/resolved" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const out = await resolveDisplayPhoto(card, {
      fetchFn,
      googleApiKey: "test-key",
      placesBaseUrl: "https://places.googleapis.com/v1",
    });
    expect(out.photos).toEqual(["https://lh3.googleusercontent.com/p/resolved"]);
    expect(out.google_photo_names).toBeUndefined();
    const firstUrl = String((fetchFn.mock.calls as unknown as Array<[unknown]>)[0]?.[0] ?? "");
    expect(firstUrl).toContain("skipHttpRedirect=true");
    expect(firstUrl).toContain("key=test-key");
    expect(firstUrl).toContain("maxWidthPx=800");
  });

  it("should_not_treat_stripped_media_url_as_displayable", async () => {
    const card = googleCard({
      photos: [
        "https://places.googleapis.com/v1/places/ChIJtower/photos/AAA/media?maxWidthPx=400",
      ],
      google_photo_names: ["places/ChIJtower/photos/AAA"],
    });
    const fetchFn = vi.fn(async () =>
      new Response(JSON.stringify({ photoUri: "https://lh3.googleusercontent.com/p/fixed" }), {
        status: 200,
      }),
    );
    const out = await resolveDisplayPhoto(card, {
      fetchFn,
      googleApiKey: "test-key",
    });
    expect(out.photos).toEqual(["https://lh3.googleusercontent.com/p/fixed"]);
  });

  it("should_skip_google_when_GOOGLE_PHOTOS_ENABLED_false", async () => {
    process.env.GOOGLE_PHOTOS_ENABLED = "false";
    const card = googleCard({
      google_photo_names: ["places/ChIJtower/photos/AAA"],
    });
    const fetchFn = vi.fn();
    const out = await resolveDisplayPhoto(card, {
      fetchFn,
      googleApiKey: "test-key",
    });
    expect(out.photos).toBeUndefined();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("should_not_invent_photo_when_all_sources_fail", async () => {
    const card = googleCard();
    const fetchFn = vi.fn(async () => new Response("{}", { status: 404 }));
    const out = await resolveDisplayPhoto(card, {
      fetchFn,
      googleApiKey: "test-key",
      getDetails: async () => null,
      fetchTripadvisorPhoto: async () => null,
    });
    expect(out.photos).toBeUndefined();
  });

  it("should_fall_back_to_getDetails_photo_when_search_has_no_names", async () => {
    const card = googleCard();
    const out = await resolveDisplayPhoto(card, {
      fetchFn: vi.fn(),
      googleApiKey: "test-key",
      getDetails: async () =>
        googleCard({
          google_photo_names: ["places/ChIJtower/photos/BBB"],
        }),
      resolveGooglePhotoName: async () => "https://lh3.googleusercontent.com/p/from-details",
    });
    expect(out.photos).toEqual(["https://lh3.googleusercontent.com/p/from-details"]);
  });

  it("should_fall_back_to_tripadvisor_when_google_empty", async () => {
    const card = googleCard();
    const out = await resolveDisplayPhoto(card, {
      fetchFn: vi.fn(),
      googleApiKey: undefined,
      getDetails: async () => null,
      fetchTripadvisorPhoto: async () => "https://media-cdn.tripadvisor.com/media/photo.jpg",
    });
    expect(out.photos).toEqual(["https://media-cdn.tripadvisor.com/media/photo.jpg"]);
  });
});

describe("resolveDisplayPhotosForCards concurrency (ADR-051)", () => {
  it("should_cap_concurrency_and_resolve_all_cards", async () => {
    let inflight = 0;
    let maxInflight = 0;
    const cards = Array.from({ length: 6 }, (_, i) =>
      googleCard({
        name: `Place ${i}`,
        google_photo_names: [`places/id${i}/photos/P`],
      }),
    );
    const out = await resolveDisplayPhotosForCards(cards, {
      concurrency: 2,
      googleApiKey: "k",
      resolveGooglePhotoName: async (name) => {
        inflight += 1;
        maxInflight = Math.max(maxInflight, inflight);
        await new Promise((r) => setTimeout(r, 5));
        inflight -= 1;
        return `https://lh3.googleusercontent.com/p/${encodeURIComponent(name)}`;
      },
    });
    expect(out).toHaveLength(6);
    expect(out.every((c) => c.photos?.[0]?.startsWith("https://lh3.googleusercontent.com/"))).toBe(
      true,
    );
    expect(maxInflight).toBeLessThanOrEqual(2);
  });
});
