import { describe, expect, it } from "vitest";
import { omitChatToolProviders } from "./loop";

describe("omitChatToolProviders", () => {
  it("should_strip_providers_from_search_and_geocode_so_agent_auto_selects", () => {
    expect(
      omitChatToolProviders("search_restaurants", {
        query: "吴中路吴记鲜",
        providers: ["GOOGLE_MAPS"],
        locale: "HK",
      }),
    ).toEqual({ query: "吴中路吴记鲜", locale: "HK" });

    expect(
      omitChatToolProviders("geocode", {
        query: "吴中路",
        providers: ["GOOGLE_MAPS"],
      }),
    ).toEqual({ query: "吴中路" });
  });

  it("should_keep_provider_on_get_place_details", () => {
    expect(
      omitChatToolProviders("get_place_details", {
        provider: "GOOGLE_MAPS",
        native_id: "ChIJ",
      }),
    ).toEqual({ provider: "GOOGLE_MAPS", native_id: "ChIJ" });
  });
});
