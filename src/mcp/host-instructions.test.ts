/**
 * TC-M12-52-04 — host_instructions anti-fabrication hard constraint (ADR-045 §7).
 */
import { describe, expect, it } from "vitest";
import {
  MCP_NO_INVENT_RULE,
  buildIntakeHostInstructions,
  evaluateDiscoverIntake,
} from "../core/trip-intake";

describe("TC-M12-52-04 host_instructions anti-fabrication hard constraint", () => {
  it("MCP_NO_INVENT_RULE contains the hard constraint phrases", () => {
    expect(MCP_NO_INVENT_RULE).toMatch(/fabricate/i);
    expect(MCP_NO_INVENT_RULE).toMatch(/travel_tips/);
    expect(MCP_NO_INVENT_RULE).toMatch(/temporarily unavailable/i);
    expect(MCP_NO_INVENT_RULE).toMatch(/must not present fabricated/i);
  });

  it("buildIntakeHostInstructions emits the hard constraint", () => {
    const intake = evaluateDiscoverIntake({});
    if (intake.status !== "need_input") {
      throw new Error(`expected need_input, got ${intake.status}`);
    }
    const out = buildIntakeHostInstructions(intake);
    expect(out).toContain(MCP_NO_INVENT_RULE);
    expect(out).toMatch(/fabricate/i);
    expect(out).toMatch(/travel_tips/);
  });
});
