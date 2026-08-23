import { describe, expect, it } from "vitest";
import { dispatchTool } from "../src/http/dispatch";
import { generateCallerSecret } from "../src/core/crypto";
import { prisma } from "../src/db/client";
import type { PlaceCard } from "../src/core/types";

function place(name: string): PlaceCard {
  return {
    provider: "GOOGLE_MAPS",
    name,
    category: "museum",
    rating: 4.5,
    location: { lat: 51.5, lng: -0.12, crs: "WGS84" },
    sources: [{ provider: "GOOGLE_MAPS", native_id: name, deeplinks: {} }],
  };
}

describe("enrich_arrange_transit HTTP", () => {
  it("should_enrich_day_blocks_over_http", async () => {
    const generated = generateCallerSecret();
    await prisma.callerApiKey.create({
      data: {
        name: "enrich-test",
        keyHash: generated.keyHash,
        prefix: generated.prefix,
        status: "ACTIVE",
      },
    });

    const result = await dispatchTool("enrich_arrange_transit", `Bearer ${generated.secret}`, {
      day: {
        day_index: 1,
        blocks: [
          {
            name: "British Museum",
            type: "attraction",
            start_time: "10:00",
            duration_min: 90,
            reason: "iconic",
          },
          {
            name: "Covent Garden",
            type: "attraction",
            start_time: "12:30",
            duration_min: 60,
            reason: "walkable",
          },
        ],
      },
      candidates: {
        places: [place("British Museum"), place("Covent Garden")],
        restaurants: [],
      },
      locale: "EN",
      providers: ["GOOGLE_MAPS"],
    });

    expect(result.status).toBe(200);
    expect(result.envelope.ok).toBe(true);
    const data = result.envelope.data as {
      blocks?: Array<{ legs_to_here?: unknown[] }>;
      transit_outcome?: string;
    };
    expect(data.blocks?.length).toBe(2);
    expect(data.transit_outcome).toBeDefined();
  });
});
