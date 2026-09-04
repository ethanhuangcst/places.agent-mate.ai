import { describe, expect, it } from "vitest";
import { planNextStopBody } from "../src/http/schemas";

describe("planNextStopBody end_time (F67/F77)", () => {
  it("TC-M18-77-02 should_accept_end_time_9_00_as_09_00", () => {
    const parsed = planNextStopBody.safeParse({
      current_stop: { name: "Hotel", kind: "stay", end_time: "9:00" },
      next_stop: { name: "Tower", kind: "attraction" },
      locale: "EN",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.current_stop?.end_time).toBe("09:00");
    }
  });

  it("should_accept_end_time_when_hhmm", () => {
    const parsed = planNextStopBody.safeParse({
      current_stop: { name: "Hotel", kind: "stay", end_time: "09:00" },
      next_stop: { name: "Tower", kind: "attraction" },
      locale: "EN",
    });
    expect(parsed.success).toBe(true);
  });

  it("should_coerce_7am_time_from", () => {
    const parsed = planNextStopBody.safeParse({
      origin_mode: true,
      next_stop: { name: "Hotel", kind: "stay" },
      time_from: "7:00 am",
      locale: "EN",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.time_from).toBe("07:00");
  });
});
