import { describe, expect, it } from "vitest";
import { decodeSession, encodeSession } from "../src/auth/session-token";

describe("session token", () => {
  it("should_round_trip_payload", () => {
    const token = encodeSession({ userId: "u1", username: "admin" });
    expect(decodeSession(token)).toEqual({ userId: "u1", username: "admin" });
  });

  it("should_reject_tampered_token", () => {
    const token = encodeSession({ userId: "u1", username: "admin" });
    expect(decodeSession(`${token}x`)).toBeNull();
  });
});
