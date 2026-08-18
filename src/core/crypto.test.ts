import { describe, it, expect } from "vitest";
import {
  hashPassword,
  verifyPassword,
  generateCallerSecret,
  hashCallerSecret,
} from "./crypto";

describe("crypto", () => {
  it("should_verify_password_when_hash_matches", async () => {
    const hash = await hashPassword("secret-pass");
    expect(await verifyPassword("secret-pass", hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });

  it("should_reject_empty_stored_password", async () => {
    expect(await verifyPassword("anything", "")).toBe(false);
  });

  it("should_generate_pa_prefix_secret_and_hash", () => {
    const { secret, prefix, keyHash } = generateCallerSecret();
    expect(secret.startsWith("pa_")).toBe(true);
    expect(prefix).toBe(secret.slice(0, 15));
    expect(keyHash).toBe(hashCallerSecret(secret));
    expect(hashCallerSecret("other")).not.toBe(keyHash);
  });
});
