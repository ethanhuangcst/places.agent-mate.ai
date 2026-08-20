import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SessionManager } from "./session-manager";

function mockTransport(id = "mock") {
  return { sessionId: id } as any;
}

describe("SessionManager", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should add, get, and delete sessions", () => {
    const mgr = new SessionManager(60_000, 0);
    const t = mockTransport("s1");
    mgr.add("s1", t);

    expect(mgr.get("s1")).toBe(t);
    expect(mgr.get("nonexistent")).toBeUndefined();

    mgr.delete("s1");
    expect(mgr.size).toBe(0);
    mgr.close();
  });

  // TC-M3a-S02
  it("should remove sessions older than TTL on cleanup", () => {
    const mgr = new SessionManager(1000, 0);
    mgr.add("s1", mockTransport("s1"));
    expect(mgr.size).toBe(1);

    vi.advanceTimersByTime(1001);
    const cleaned = mgr.cleanup();

    expect(cleaned).toBe(1);
    expect(mgr.size).toBe(0);
    expect(mgr.get("s1")).toBeUndefined();
    mgr.close();
  });

  // TC-M3a-S04
  it("should preserve sessions within TTL", () => {
    const mgr = new SessionManager(5000, 0);
    mgr.add("s1", mockTransport("s1"));

    vi.advanceTimersByTime(3000);
    mgr.cleanup();

    expect(mgr.size).toBe(1);
    expect(mgr.get("s1")).toBeDefined();
    mgr.close();
  });

  // TC-M3a-S03
  it("should clear all sessions on close", () => {
    const mgr = new SessionManager(60_000, 0);
    mgr.add("s1", mockTransport("s1"));
    mgr.add("s2", mockTransport("s2"));
    expect(mgr.size).toBe(2);

    mgr.close();

    expect(mgr.size).toBe(0);
    expect(mgr.get("s1")).toBeUndefined();
  });
});
