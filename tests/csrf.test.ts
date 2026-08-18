import { describe, expect, it } from "vitest";
import { csrfOk } from "../src/auth/csrf";

describe("csrfOk", () => {
  it("should_accept_matching_origin", () => {
    const request = new Request("http://localhost:3000/api/admin/login", {
      method: "POST",
      headers: { origin: "http://localhost:3000", host: "localhost:3000" },
    });
    expect(csrfOk(request)).toBe(true);
  });

  it("should_reject_cross_origin", () => {
    const request = new Request("http://localhost:3000/api/admin/login", {
      method: "POST",
      headers: { origin: "http://evil.example", host: "localhost:3000" },
    });
    expect(csrfOk(request)).toBe(false);
  });

  it("should_accept_lan_dev_origin_when_host_matches", () => {
    const request = new Request("http://10.0.0.142:3010/api/admin/accept-invite", {
      method: "POST",
      headers: { origin: "http://10.0.0.142:3010", host: "10.0.0.142:3010" },
    });
    expect(csrfOk(request)).toBe(true);
  });
});
