import { describe, expect, it } from "vitest";
import { healthEnvelope } from "./envelope";

describe("healthEnvelope", () => {
  it("should_list_public_tools_including_mvp2", () => {
    const env = healthEnvelope();
    expect(env.ok).toBe(true);
    expect(env.agent).toBe("places-agent");
    expect(env.data?.tools).toEqual([
      "search_restaurants",
      "search_places",
      "plan_itinerary",
      "get_place_details",
      "geocode",
      "navigate",
      "chat",
    ]);
  });
});
