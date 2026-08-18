import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { absoluteAppUrl } from "../src/auth/public-url";

const KEYS = ["PUBLIC_BASE_URL", "APP_URL", "PORT"] as const;
const saved: Partial<Record<(typeof KEYS)[number], string | undefined>> = {};

describe("absoluteAppUrl", () => {
  beforeEach(() => {
    for (const key of KEYS) saved[key] = process.env[key];
  });

  afterEach(() => {
    for (const key of KEYS) {
      const value = saved[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("should_build_absolute_set_password_url_when_public_base_url_is_set", () => {
    process.env.PUBLIC_BASE_URL = "https://places.agent-mate.ai";
    expect(absoluteAppUrl("/set-password?token=abc")).toBe(
      "https://places.agent-mate.ai/set-password?token=abc",
    );
  });

  it("should_strip_trailing_slash_from_public_base_url", () => {
    process.env.PUBLIC_BASE_URL = "https://places.agent-mate.ai/";
    expect(absoluteAppUrl("/set-password?token=abc")).toBe(
      "https://places.agent-mate.ai/set-password?token=abc",
    );
  });

  it("should_use_app_url_when_public_base_url_is_unset", () => {
    delete process.env.PUBLIC_BASE_URL;
    process.env.APP_URL = "https://places.agent-mate.ai";
    expect(absoluteAppUrl("/set-password?token=tok")).toBe(
      "https://places.agent-mate.ai/set-password?token=tok",
    );
  });

  it("should_use_localhost_and_port_when_base_url_is_unset", () => {
    delete process.env.PUBLIC_BASE_URL;
    delete process.env.APP_URL;
    process.env.PORT = "3010";
    expect(absoluteAppUrl("/set-password?token=abc")).toBe(
      "http://localhost:3010/set-password?token=abc",
    );
  });
});
