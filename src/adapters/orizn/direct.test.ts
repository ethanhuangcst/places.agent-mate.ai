import { describe, expect, it, beforeEach } from "vitest";
import {
  createOriznDirectClient,
  resetOriznDirectCacheForTests,
  type FetchFn,
} from "./direct";
import { type OriznAdapterConfig } from "./config";
import { OriznQuotaError } from "./types";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function testConfig(overrides: Partial<OriznAdapterConfig> = {}): OriznAdapterConfig {
  return {
    apiKey: "test-key",
    baseUrl: "https://visa.orizn.app/api/v1",
    cacheTtlHours: 24,
    requestTimeoutMs: 5000,
    ...overrides,
  };
}

function recordFetch(handler: (url: URL) => Response): { fetchFn: FetchFn; count: () => number } {
  let calls = 0;
  const fetchFn: FetchFn = async (input) => {
    calls += 1;
    const href =
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    return handler(new URL(href));
  };
  return { fetchFn, count: () => calls };
}

const samplePayload = {
  data: {
    passport: "CHN",
    destination: "JPN",
    requirement: "visa_required",
    visa_free_days: null,
    documents_required: ["Passport"],
    process: ["Apply"],
    processing_time: "5-7 days",
  },
};

describe("Orizn direct client", () => {
  beforeEach(() => {
    resetOriznDirectCacheForTests();
  });

  it("TC-M11-48-05: should_cache_same_pair_without_second_fetch", async () => {
    const { fetchFn, count } = recordFetch(() => jsonResponse(samplePayload));
    const client = createOriznDirectClient(testConfig(), fetchFn);
    const input = { passport: "CHN", destination: "JPN", lang: "zh" };
    await client.fetchRequirement(input);
    await client.fetchRequirement(input);
    expect(count()).toBe(1);
  });

  it("TC-M11-48-06: should_throw_quota_error_on_429_without_fabricated_requirement", async () => {
    const { fetchFn } = recordFetch(() => jsonResponse({ error: "quota" }, 429));
    const client = createOriznDirectClient(testConfig(), fetchFn);
    await expect(
      client.fetchRequirement({ passport: "CHN", destination: "JPN", lang: "zh" }),
    ).rejects.toBeInstanceOf(OriznQuotaError);
  });

  it("should_send_x_api_key_header", async () => {
    let header = "";
    const fetchFn: FetchFn = async (input, init) => {
      header = String((init?.headers as Record<string, string>)?.["x-api-key"] ?? "");
      return jsonResponse(samplePayload);
    };
    const client = createOriznDirectClient(testConfig({ apiKey: "secret-key" }), fetchFn);
    await client.fetchRequirement({ passport: "CHN", destination: "JPN", lang: "en" });
    expect(header).toBe("secret-key");
  });
});
