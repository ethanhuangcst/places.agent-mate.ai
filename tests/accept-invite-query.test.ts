import { describe, expect, it } from "vitest";
import {
  acceptInviteQueryHasLeakedFields,
  acceptInviteRedirectAfterLeak,
} from "../src/auth/accept-invite-query";

describe("acceptInviteQueryHasLeakedFields", () => {
  it("should_detect_password_in_query", () => {
    expect(
      acceptInviteQueryHasLeakedFields({ token: "abc", password: "secret" }),
    ).toBe(true);
  });

  it("should_ignore_token_only_query", () => {
    expect(acceptInviteQueryHasLeakedFields({ token: "abc" })).toBe(false);
  });
});

describe("acceptInviteRedirectAfterLeak", () => {
  it("should_preserve_token_when_present", () => {
    expect(acceptInviteRedirectAfterLeak("tok")).toBe("/accept-invite?token=tok");
  });

  it("should_redirect_expired_when_token_missing", () => {
    expect(acceptInviteRedirectAfterLeak("")).toBe("/accept-invite?expired=1");
  });
});
