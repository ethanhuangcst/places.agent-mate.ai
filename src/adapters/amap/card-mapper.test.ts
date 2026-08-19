import { describe, expect, it } from "vitest";
import { amapPoiToCard, formatAmapOpeningHours } from "./card-mapper";

describe("amapPoiToCard hours", () => {
  it("should_map_opentime_today_when_present", () => {
    const card = amapPoiToCard({
      id: "B000A8URXB",
      name: "外滩",
      location: "121.490317,31.245105",
      type: "风景名胜",
      business: { opentime_today: "08:00-22:00" },
    });
    expect(card?.hours).toBe("08:00-22:00");
  });

  it("should_prefer_opentime_week_when_today_absent", () => {
    const card = amapPoiToCard({
      id: "B000A8URXC",
      name: "豫园",
      location: "121.492,31.227",
      business: { opentime_week: "周一至周日 09:00-17:00" },
    });
    expect(card?.hours).toBe("周一至周日 09:00-17:00");
  });

  it("should_leave_hours_unset_when_business_times_absent", () => {
    const card = amapPoiToCard({
      id: "B000A8URXD",
      name: "某点",
      location: "121.4,31.2",
      business: { rating: "4.5" },
    });
    expect(card?.hours).toBeUndefined();
    expect(formatAmapOpeningHours(undefined)).toBeUndefined();
  });
});
