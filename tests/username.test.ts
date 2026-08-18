import { describe, expect, it } from "vitest";
import {
  adminDisplayName,
  isValidUsername,
  normalizeUsername,
  pendingUsername,
} from "../src/auth/username";

describe("admin username helpers", () => {
  it("should_create_unique_pending_username", () => {
    const a = pendingUsername();
    const b = pendingUsername();
    expect(a).toMatch(/^pending-/);
    expect(a).not.toBe(b);
  });

  it("should_validate_usernames", () => {
    expect(isValidUsername("ethan")).toBe(true);
    expect(isValidUsername("Ethan_Huang")).toBe(true);
    expect(isValidUsername("ab")).toBe(false);
    expect(isValidUsername("pending-abc")).toBe(false);
    expect(normalizeUsername("Ethan_Huang")).toBe("ethan_huang");
  });

  it("should_build_display_name_from_profile", () => {
    expect(
      adminDisplayName({
        firstName: "Ethan",
        lastName: "Huang",
        username: "ethan",
        passwordHash: "hash",
      }),
    ).toBe("Ethan Huang");
    expect(
      adminDisplayName({
        username: "pending-123",
        passwordHash: "",
      }),
    ).toBeNull();
  });
});
