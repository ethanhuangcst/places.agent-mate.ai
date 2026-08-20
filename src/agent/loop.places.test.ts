import { describe, expect, it } from "vitest";
import { collectPlacesFromToolData, dedupePlaces } from "./loop";
import { type PlaceCard } from "../core/types";

const card = (id: string, name: string): PlaceCard => ({
  provider: "AMAP",
  name,
  location: { lat: 31.2, lng: 121.5, crs: "GCJ-02" },
  sources: [{ provider: "AMAP", native_id: id, deeplinks: {} }],
});

describe("collectPlacesFromToolData", () => {
  it("should_collect_and_dedupe_search_cards", () => {
    const into: PlaceCard[] = [];
    collectPlacesFromToolData([card("a", "A"), card("a", "A-dup"), card("b", "B")], into);
    collectPlacesFromToolData(card("b", "B-again"), into);
    expect(dedupePlaces(into).map((c) => c.sources[0]?.native_id)).toEqual(["a", "b"]);
  });
});
