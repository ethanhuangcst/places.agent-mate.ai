/** @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { LocaleProvider } from "./locale";
import { GUIDE_CAPABILITIES } from "./guide-literals";
import { GuideBody } from "./guide-body";

describe("GuideBody capabilities", () => {
  it("should_render_agent_capabilities_section_with_literal_tools", () => {
    render(
      <LocaleProvider locale="EN">
        <GuideBody />
      </LocaleProvider>,
    );

    const toc = screen.getByTestId("guide-toc-capabilities");
    expect(toc.getAttribute("href")).toBe("#capabilities");
    expect(toc.textContent).toBe("1. Agent capabilities");

    const table = screen.getByTestId("guide-capabilities-table");
    expect(table.tagName).toBe("TABLE");
    expect(table.querySelectorAll("thead th")).toHaveLength(3);
    expect(table.querySelector("thead")?.textContent).toContain("Capabilities");
    expect(table.querySelectorAll("tbody tr")).toHaveLength(GUIDE_CAPABILITIES.length);

    const section = screen.getByTestId("guide-capabilities");
    for (const cap of GUIDE_CAPABILITIES) {
      expect(section.textContent).toContain(cap.label);
    }
    expect(section.textContent).toContain("POST /v1/chat");
    expect(section.textContent).toContain("HTTP only");
  });
});
