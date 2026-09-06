import { describe, expect, it } from "vitest";
import { amapPoiToCard } from "./card-mapper";

describe("amapPoiToCard photos", () => {
  it("should_upgrade_http_autonavi_photo_to_https", () => {
    const card = amapPoiToCard({
      id: "B001",
      name: "集贤亭",
      location: "120.148,30.242",
      photos: [{ url: "http://store.is.autonavi.com/showpic/abc" }],
    });
    expect(card?.photos).toEqual(["https://store.is.autonavi.com/showpic/abc"]);
  });
});
