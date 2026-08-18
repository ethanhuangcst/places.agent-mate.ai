import { AGENT_ID, HOSTNAME } from "../core/locales";

export const GUIDE_BEARER_LINE = "Authorization: Bearer <caller_api_key>";

export function mcpSnippet(): string {
  return `{
  "mcpServers": {
    "${AGENT_ID}": {
      "url": "https://${HOSTNAME}/mcp",
      "headers": {
        "Authorization": "Bearer <caller_api_key>"
      }
    }
  }
}`;
}
