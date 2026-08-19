import { describe, expect, it } from "vitest";
import { directPlaceToCard, formatGoogleOpeningHours, workerPlaceToCard } from "./card-mapper";

describe("directPlaceToCard hours", () => {
  it("should_map_regularOpeningHours_when_vendor_provides_weekdayDescriptions", () => {
    const card = directPlaceToCard({
      id: "places/ChIJtest",
      displayName: { text: "Museum A" },
      formattedAddress: "Lisbon",
      location: { latitude: 38.72, longitude: -9.14 },
      rating: 4.5,
      regularOpeningHours: {
        weekdayDescriptions: ["Monday: 10:00 AM – 6:00 PM", "Tuesday: 10:00 AM – 6:00 PM"],
      },
    });
    expect(card?.hours).toBe("Monday: 10:00 AM – 6:00 PM; Tuesday: 10:00 AM – 6:00 PM");
  });

  it("should_leave_hours_unset_when_vendor_omits_opening_data", () => {
    const card = directPlaceToCard({
      id: "places/ChIJtest2",
      displayName: { text: "Park B" },
      location: { latitude: 38.73, longitude: -9.15 },
    });
    expect(card?.hours).toBeUndefined();
  });

  it("should_not_invent_hours_from_empty_weekdayDescriptions", () => {
    expect(formatGoogleOpeningHours({ weekdayDescriptions: [] })).toBeUndefined();
    expect(formatGoogleOpeningHours({})).toBeUndefined();
  });

  it("should_map_worker_place_and_strip_maps_suffix", () => {
    const card = workerPlaceToCard({
      id: "places/ChIJworker",
      location: { latitude: 22.28, longitude: 114.16 },
      attribution: { title: "Yat Lok - Google Maps" },
    });
    expect(card?.name).toBe("Yat Lok");
    expect(card?.sources[0]?.native_id).toBe("places/ChIJworker");
    expect(workerPlaceToCard({ location: { latitude: 1, longitude: 2 } })).toBeNull();
    expect(
      workerPlaceToCard({
        id: "abc",
        location: { latitude: 1, longitude: 2 },
        attribution: { title: "" },
      })?.name,
    ).toBe("Unknown place");
    expect(
      workerPlaceToCard({
        place: "places/from-place",
        location: { latitude: 1, longitude: 2 },
      })?.sources[0]?.native_id,
    ).toBe("from-place");
  });

  it("should_return_null_when_direct_place_incomplete", () => {
    expect(directPlaceToCard({ displayName: { text: "X" } })).toBeNull();
    expect(
      directPlaceToCard({
        displayName: { text: "X" },
        location: { latitude: 1, longitude: 2 },
      }),
    ).toBeNull();
  });
});
