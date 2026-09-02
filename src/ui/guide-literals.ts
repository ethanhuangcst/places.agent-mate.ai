import { AGENT_ID, HOSTNAME } from "../core/locales";

export const GUIDE_BEARER_LINE = "Authorization: Bearer <caller_api_key>";

export const GUIDE_BASE_URL = `https://${HOSTNAME}`;

export const GUIDE_HEALTH_URL = `${GUIDE_BASE_URL}/v1/health`;

export const GUIDE_MCP_URL = `${GUIDE_BASE_URL}/mcp`;

export const GUIDE_SSE_URL = `${GUIDE_BASE_URL}/sse`;

export const GUIDE_CHATBOX_HEADER = "Authorization=Bearer <caller_api_key>";

export const GUIDE_HTTP_ENDPOINTS = [
  "GET  /v1/health",
  "POST /v1/search_restaurants",
  "POST /v1/search_places",
  "POST /v1/plan_itinerary",
  "POST /v1/discover_places",
  "POST /v1/arrange_day",
  "POST /v1/get_place_details",
  "POST /v1/geocode",
  "POST /v1/make_itinerary",
  "POST /v1/plan_next_stop",
  "POST /v1/display_current_stop",
  "POST /v1/chat",
] as const;

export const GUIDE_MCP_TOOLS = [
  "search_restaurants",
  "search_places",
  "plan_itinerary",
  "discover_places",
  "arrange_day",
  "get_place_details",
  "geocode",
  "make_itinerary",
  "plan_next_stop",
  "display_current_stop",
] as const;

export type GuideCapabilityChannel = "both" | "http";

export type GuideCapability = {
  id: string;
  label: string;
  labelLiteral: boolean;
  titleKey?: string;
  bodyKey: string;
  channel: GuideCapabilityChannel;
  channelRoute?: string;
};

export const GUIDE_CAPABILITIES: readonly GuideCapability[] = [
  {
    id: "search_restaurants",
    label: "search_restaurants",
    labelLiteral: true,
    bodyKey: "admin.guide.cap_search_restaurants_body",
    channel: "both",
  },
  {
    id: "search_places",
    label: "search_places",
    labelLiteral: true,
    bodyKey: "admin.guide.cap_search_places_body",
    channel: "both",
  },
  {
    id: "details",
    label: "get_place_details",
    labelLiteral: true,
    bodyKey: "admin.guide.cap_details_body",
    channel: "both",
  },
  {
    id: "geocode",
    label: "geocode",
    labelLiteral: true,
    bodyKey: "admin.guide.cap_geocode_body",
    channel: "both",
  },
  {
    id: "itinerary",
    label: "plan_itinerary",
    labelLiteral: true,
    bodyKey: "admin.guide.cap_itinerary_body",
    channel: "both",
  },
  {
    id: "discover_places",
    label: "discover_places",
    labelLiteral: true,
    bodyKey: "admin.guide.cap_discover_places_body",
    channel: "both",
  },
  {
    id: "arrange_day",
    label: "arrange_day",
    labelLiteral: true,
    bodyKey: "admin.guide.cap_arrange_day_body",
    channel: "both",
  },
  {
    id: "make_itinerary",
    label: "make_itinerary",
    labelLiteral: true,
    bodyKey: "admin.guide.cap_make_itinerary_body",
    channel: "both",
  },
  {
    id: "plan_next_stop",
    label: "plan_next_stop",
    labelLiteral: true,
    bodyKey: "admin.guide.cap_plan_next_stop_body",
    channel: "both",
  },
  {
    id: "display_current_stop",
    label: "display_current_stop",
    labelLiteral: true,
    bodyKey: "admin.guide.cap_display_current_stop_body",
    channel: "both",
  },
  {
    id: "chat",
    label: "Place chat",
    labelLiteral: false,
    titleKey: "admin.guide.cap_chat",
    bodyKey: "admin.guide.cap_chat_body",
    channel: "http",
    channelRoute: "POST /v1/chat",
  },
  {
    id: "tripadvisor",
    label: "Tripadvisor.enrich",
    labelLiteral: true,
    bodyKey: "admin.guide.cap_tripadvisor_body",
    channel: "http",
  },
];

export const GUIDE_CURSOR_MCP_PATH = ".cursor/mcp.json";

export function cursorMcpJsonSnippet(): string {
  return [
    "{",
    '  "mcpServers": {',
    `    "${AGENT_ID}": {`,
    `      "url": "${GUIDE_MCP_URL}",`,
    '      "headers": {',
    '        "Authorization": "Bearer ${env:PLACES_AGENT_CALLER_KEY}"',
    "      }",
    "    }",
    "  }",
    "}",
  ].join("\n");
}

/** @deprecated use cursorMcpJsonSnippet — kept for tests expecting mcpSnippet name */
export function mcpSnippet(): string {
  return cursorMcpJsonSnippet();
}

export function httpSearchCurlExample(): string {
  return `curl -s -H "Authorization: Bearer <caller_api_key>" \\
  -H "Content-Type: application/json" \\
  -d '{"query":"restaurant","providers":["GOOGLE_MAPS"],"locale":"EN"}' \\
  ${GUIDE_BASE_URL}/v1/search_restaurants`;
}

export function httpEndpointsBlock(): string {
  return GUIDE_HTTP_ENDPOINTS.join("\n");
}
