import { describe, it, expect } from "vitest";
import { errorKeyFromBody } from "./admin-api";

describe("errorKeyFromBody", () => {
  it("should_read_error_key_when_admin_envelope_is_present", () => {
    expect(errorKeyFromBody({ error: { key: "errors.login_failed" } })).toBe(
      "errors.login_failed",
    );
  });

  it("should_fall_back_when_body_has_no_key", () => {
    expect(errorKeyFromBody({})).toBe("errors.session_expired");
    expect(errorKeyFromBody(null)).toBe("errors.session_expired");
  });
});
