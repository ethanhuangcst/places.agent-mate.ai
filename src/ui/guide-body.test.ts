import { describe, it, expect } from "vitest";
import { AGENT_ID, HOSTNAME } from "../core/locales";
import { GUIDE_BEARER_LINE, mcpSnippet } from "./guide-literals";

describe("guide literals", () => {
  it("should_keep_agent_id_and_bearer_header_as_literals", () => {
    expect(AGENT_ID).toBe("places-agent");
    expect(GUIDE_BEARER_LINE).toBe("Authorization: Bearer <caller_api_key>");
    expect(mcpSnippet()).toContain(`"${AGENT_ID}"`);
    expect(mcpSnippet()).toContain("Authorization");
    expect(mcpSnippet()).toContain(HOSTNAME);
  });
});
