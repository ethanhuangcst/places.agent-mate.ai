/** @vitest-environment jsdom */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import type { ApiKeyRow } from "./admin-api";
import { LocaleProvider } from "./locale";

const keys: ApiKeyRow[] = [
  {
    id: "id-a",
    name: "alpha",
    description: "",
    prefix: "pa_aaaa",
    status: "ACTIVE",
    issued: "2026-08-18",
  },
  {
    id: "id-b",
    name: "beta",
    description: "",
    prefix: "pa_bbbb",
    status: "ACTIVE",
    issued: "2026-08-18",
  },
];

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

vi.mock("./admin-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./admin-api")>();
  return {
    ...actual,
    adminJson: vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url) === "/api/admin/api-keys" && init?.method === "DELETE") {
        return { ok: true, deleted: 2 };
      }
      if (String(url) === "/api/admin/api-keys") {
        return { keys };
      }
      return {};
    }),
  };
});

import { KeysScreen } from "./keys-screen";

function renderKeys() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <LocaleProvider locale="EN">
        <KeysScreen />
      </LocaleProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
});

describe("KeysScreen bulk select", () => {
  it("should_place_issue_key_immediately_left_of_bulk_delete", async () => {
    renderKeys();
    const issue = await screen.findByTestId("issue-key");
    const bulk = screen.getByTestId("keys-delete-selected");
    expect(issue.parentElement).toBe(bulk.parentElement);
    expect(issue.parentElement?.classList.contains("page-head-actions")).toBe(true);
    expect(issue.nextElementSibling).toBe(bulk);
  });

  it("should_disable_bulk_delete_when_no_row_is_checked", async () => {
    renderKeys();
    await screen.findByTestId("keys-select-alpha");
    expect((screen.getByTestId("keys-delete-selected") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByTestId("keys-delete-selected"));
    expect(document.querySelector(".dialog-backdrop.is-open")).toBeFalsy();
  });

  it("should_enable_bulk_delete_when_a_row_is_checked", async () => {
    renderKeys();
    await screen.findByTestId("keys-select-alpha");
    fireEvent.click(screen.getByTestId("keys-select-alpha"));
    expect((screen.getByTestId("keys-delete-selected") as HTMLButtonElement).disabled).toBe(false);
  });

  it("should_check_every_row_when_select_all_is_checked", async () => {
    renderKeys();
    await screen.findByTestId("keys-select-alpha");
    fireEvent.click(screen.getByTestId("keys-select-all"));
    expect((screen.getByTestId("keys-select-alpha") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByTestId("keys-select-beta") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByTestId("keys-delete-selected") as HTMLButtonElement).disabled).toBe(false);
  });

  it("should_open_confirm_dialog_with_count_key_when_delete_selected", async () => {
    renderKeys();
    await screen.findByTestId("keys-select-alpha");
    fireEvent.click(screen.getByTestId("keys-select-alpha"));
    fireEvent.click(screen.getByTestId("keys-delete-selected"));
    const confirm = screen.getByTestId("keys-delete-selected-confirm");
    expect(confirm.getAttribute("data-i18n")).toBe("admin.keys.delete_selected_submit");
    expect(document.querySelector(".dialog-backdrop.is-open")).toBeTruthy();
  });
});
