import { describe, expect, it } from "vitest";
import { normalizeAdminEmail } from "../src/auth/admin-email";

describe("normalizeAdminEmail", () => {
  it("should_lowercase_and_trim_email", () => {
    expect(normalizeAdminEmail("  Me@EthanHuang.com  ")).toBe("me@ethanhuang.com");
  });
});
