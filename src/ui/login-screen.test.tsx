/** @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { LocaleProvider } from "./locale";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: ReactNode;
  } & Record<string, unknown>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import { LoginScreen } from "./login-screen";

function renderLogin() {
  return render(
    <LocaleProvider locale="EN">
      <LoginScreen />
    </LocaleProvider>,
  );
}

afterEach(() => {
  cleanup();
});

describe("LoginScreen closed-register notice", () => {
  it("should_show_contact_admin_trigger_inside_register_disabled_notice", () => {
    renderLogin();
    const notice = screen.getByTestId("register-disabled");
    const trigger = screen.getByTestId("contact-admin");
    expect(notice.contains(trigger)).toBe(true);
    expect(trigger.getAttribute("data-i18n")).toBe("admin.register.contact_admin");
    expect(trigger.getAttribute("aria-describedby")).toBe("login-wechat-qr");
    expect(notice.textContent).toContain("Open registration is closed.");
    expect(notice.textContent).toContain("Contact an admin");
    expect(notice.textContent).toContain("for an");
    expect(notice.querySelector("code.auth-status-key")?.textContent).toBe("api-key");
  });

  it("should_point_wechat_qr_at_ethan_wechat_png", () => {
    renderLogin();
    const qr = screen.getByTestId("contact-admin-qr");
    const img = qr.querySelector("img");
    expect(qr.getAttribute("role")).toBe("tooltip");
    expect(img?.getAttribute("src")).toBe("/EthanWeChat.png");
    expect(qr.querySelector(".contact-admin-caption")?.getAttribute("data-i18n")).toBe(
      "admin.register.wechat_qr_caption",
    );
  });
});
