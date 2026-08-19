import { describe, expect, it } from "vitest";
import { getLastTripadvisorQuery } from "../src/adapters/tripadvisor/fixture";
import { searchRestaurants } from "../src/core/tools";

describe("Tripadvisor enrich", () => {
  it("should_attach_tripadvisor_rating_when_enrich_enabled", async () => {
    const result = await searchRestaurants({
      query: "Yat",
      providers: ["GOOGLE_MAPS"],
      enrich: { tripadvisor: true },
    });
    expect(result.data.length).toBeGreaterThan(0);
    expect(result.data[0]?.tripadvisor?.rating).toBeTypeOf("number");
    const query = getLastTripadvisorQuery();
    expect(query?.name).toContain("Yat Lok");
    expect(query?.lat).toBeTypeOf("number");
  });

  it("should_not_pass_google_native_id_to_tripadvisor", async () => {
    await searchRestaurants({
      query: "Yat",
      providers: ["GOOGLE_MAPS"],
      enrich: { tripadvisor: true },
    });
    const query = getLastTripadvisorQuery();
    expect(query?.name).toBeTruthy();
    expect(query?.name).not.toMatch(/fixture_yat_lok/);
    expect(String(query?.lat)).not.toMatch(/fixture/);
  });

  it("should_keep_google_cards_when_tripadvisor_fails", async () => {
    const result = await searchRestaurants({
      query: "__ta_fail__ Yat",
      providers: ["GOOGLE_MAPS"],
      enrich: { tripadvisor: true },
    });
    expect(result.data.length).toBeGreaterThan(0);
    expect(result.skipped.some((s) => s.provider === "TRIPADVISOR")).toBe(true);
  });

  it("should_keep_card_when_no_tripadvisor_match", async () => {
    const result = await searchRestaurants({
      query: "Tim",
      providers: ["GOOGLE_MAPS"],
      enrich: { tripadvisor: true },
    });
    expect(result.data.some((c) => c.name.includes("Tim Ho Wan"))).toBe(true);
  });
});
