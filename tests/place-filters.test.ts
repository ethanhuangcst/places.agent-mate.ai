import { describe, expect, it } from "vitest";
import {
  filterAttractionPlaces,
  filterCafePlaces,
  filterDiningPlaces,
  isLodgingPlace,
  placeIdentity,
  uniquePlaces,
} from "../src/core/place-filters";
import { type PlaceCard } from "../src/core/types";

function card(name: string, category?: string): PlaceCard {
  return {
    provider: "GOOGLE_MAPS",
    name,
    category,
    location: { lat: 1, lng: 1, crs: "WGS84" },
    sources: [{ provider: "GOOGLE_MAPS", native_id: name, deeplinks: {} }],
  };
}

describe("place filters", () => {
  it("should_exclude_lodging_and_not_fallback_to_unfiltered", () => {
    const mixed = [
      card("Boavista 83 Hostel", "lodging"),
      card("Home - Lisbon Hostel", "hostel"),
      card("Carmo Archaeological Museum", "museum"),
    ];
    const out = filterAttractionPlaces(mixed);
    expect(out.map((p) => p.name)).toEqual(["Carmo Archaeological Museum"]);
    expect(filterAttractionPlaces([card("Yes! Lisbon Hostel")])).toEqual([]);
  });

  it("should_exclude_non_dining_landmarks_from_meals", () => {
    const mixed = [
      card("广州塔", "风景名胜"),
      card("琶醍", "scenic"),
      card("北京路步行街综合管理办公室", "office"),
      card("陶陶居", "restaurant"),
    ];
    const out = filterDiningPlaces(mixed);
    expect(out.map((p) => p.name)).toEqual(["陶陶居"]);
  });

  it("should_allow_amap_scenic_and_culture_types_as_visits", () => {
    expect(
      filterAttractionPlaces([
        card("上海博物馆", "科教文化服务;博物馆"),
        card("豫园", "风景名胜;文物古迹"),
        card("上海自然博物馆", "141200"),
      ]).map((p) => p.name),
    ).toEqual(["上海博物馆", "豫园", "上海自然博物馆"]);
  });

  it("should_deny_plazas_malls_and_stations_as_visits", () => {
    const mixed = [
      card("Garden Plaza", "plaza"),
      card("当代商城", "shopping_mall"),
      card("琶醍码头", "dock"),
      card("广州塔景区", "attraction"),
      card("故宫博物院", "museum"),
    ];
    expect(filterAttractionPlaces(mixed).map((p) => p.name)).toEqual(["故宫博物院"]);
  });

  it("should_exclude_ticket_offices_and_closed_venues", () => {
    expect(
      filterAttractionPlaces([
        card("VisitLisboa", "tourist_information_center"),
        card("Lisboa Card", "tourist_attraction"),
        card("茅台博物馆(不对外开放)", "museum"),
        card("Castelo de São Jorge", "castle"),
      ]).map((p) => p.name),
    ).toEqual(["Castelo de São Jorge"]);
  });

  it("should_deny_restaurant_category_when_name_is_landmark", () => {
    expect(
      filterDiningPlaces([
        card("广州塔", "restaurant"),
        card("广州大厦希尔顿启缤精选", "restaurant"),
        card("陶陶居酒家", "restaurant"),
      ]).map((p) => p.name),
    ).toEqual(["陶陶居酒家"]);
    expect(filterDiningPlaces([card("Other Dinner", "restaurant")]).map((p) => p.name)).toEqual([
      "Other Dinner",
    ]);
  });

  it("should_unique_places_by_name_or_native_id", () => {
    const a = card("Carmo", "museum");
    a.sources = [{ provider: "GOOGLE_MAPS", native_id: "id-a", deeplinks: {} }];
    const b = card("Carmo!", "museum");
    b.sources = [{ provider: "GOOGLE_MAPS", native_id: "id-b", deeplinks: {} }];
    const c = card("Castelo", "castle");
    c.sources = [{ provider: "GOOGLE_MAPS", native_id: "id-a", deeplinks: {} }];
    expect(uniquePlaces([a, b, c]).map((p) => p.name)).toEqual(["Carmo"]);
  });

  it("should_flag_lodging_and_export_identity_helpers", () => {
    expect(isLodgingPlace(card("Boavista 83 Hostel", "lodging"))).toBe(true);
    expect(isLodgingPlace(card("Carmo Archaeological Museum", "museum"))).toBe(false);
    const cafe = card("The Coffee", "cafe");
    expect(filterCafePlaces([cafe, card("Grill House", "restaurant")]).map((p) => p.name)).toEqual([
      "The Coffee",
    ]);
    expect(placeIdentity(cafe)).toBe("id:the coffee");
    const nameless: PlaceCard = {
      ...cafe,
      sources: [],
    };
    expect(placeIdentity(nameless)).toBe("name:thecoffee");
  });
});
