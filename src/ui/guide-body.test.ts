import { describe, it, expect } from "vitest";
import { AGENT_ID, HOSTNAME } from "../core/locales";
import { t } from "../core/i18n";
import {
  GUIDE_BASE_URL,
  GUIDE_BEARER_LINE,
  GUIDE_CAPABILITIES,
  GUIDE_CHATBOX_HEADER,
  GUIDE_HEALTH_URL,
  GUIDE_MCP_URL,
  GUIDE_SSE_URL,
  httpEndpointsBlock,
  httpSearchCurlExample,
  mcpSnippet,
} from "./guide-literals";

describe("guide literals", () => {
  it("should_keep_agent_id_and_bearer_header_as_literals", () => {
    expect(AGENT_ID).toBe("places-agent");
    expect(GUIDE_BEARER_LINE).toBe("Authorization: Bearer <caller_api_key>");
    expect(mcpSnippet()).toContain(`"${AGENT_ID}"`);
    expect(mcpSnippet()).toContain("${env:PLACES_AGENT_CALLER_KEY}");
    expect(mcpSnippet()).toContain(GUIDE_MCP_URL);
  });

  it("should_expose_copyable_http_and_mcp_urls", () => {
    expect(GUIDE_BASE_URL).toBe(`https://${HOSTNAME}`);
    expect(GUIDE_HEALTH_URL).toBe(`${GUIDE_BASE_URL}/v1/health`);
    expect(GUIDE_MCP_URL).toBe(`${GUIDE_BASE_URL}/mcp`);
    expect(GUIDE_SSE_URL).toBe(`${GUIDE_BASE_URL}/sse`);
    expect(GUIDE_CHATBOX_HEADER).toContain("Bearer");
    expect(httpSearchCurlExample()).toContain(GUIDE_BASE_URL);
    expect(httpEndpointsBlock()).toContain("GET  /v1/health");
    expect(httpEndpointsBlock()).toContain("POST /v1/chat");
  });

  it("should_list_shared_tools_and_http_only_capabilities", () => {
    expect(GUIDE_CAPABILITIES.filter((cap) => cap.labelLiteral).map((cap) => cap.label)).toEqual([
      "search_restaurants",
      "search_places",
      "get_place_details",
      "geocode",
      "navigate",
      "plan_itinerary",
      "Tripadvisor.enrich",
    ]);
    const httpOnly = GUIDE_CAPABILITIES.filter((cap) => cap.channel === "http");
    expect(httpOnly.map((cap) => cap.id)).toEqual(["chat", "tripadvisor"]);
    expect(httpOnly[0]?.channelRoute).toBe("POST /v1/chat");
    expect(httpOnly[0]?.labelLiteral).toBe(false);
  });
});

describe("guide capability copy", () => {
  it("should_keep_capability_headings_and_hk_tw_bodies_distinct", () => {
    expect(t("EN", "admin.guide.h_capabilities")).toBe("1. Agent capabilities");
    expect(t("EN", "admin.guide.h_architecture")).toBe("2. Architecture");
    expect(t("EN", "admin.guide.toc_key")).toBe("3. Get a key");
    expect(t("EN", "admin.guide.cap_col_capability")).toBe("Capabilities");
    expect(t("HK", "admin.guide.cap_col_capability")).not.toBe(
      t("TW", "admin.guide.cap_col_capability"),
    );
    expect(t("EN", "admin.guide.cap_channel_http")).toBe("HTTP only");
    expect(t("HK", "admin.guide.cap_intro")).not.toBe(t("TW", "admin.guide.cap_intro"));
    expect(t("HK", "admin.guide.cap_search_restaurants")).not.toBe(
      t("TW", "admin.guide.cap_search_restaurants"),
    );
  });
});
