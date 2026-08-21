#!/usr/bin/env python3
"""Operator admin critical journeys (Playwright, Chromium headless)."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
PORT = os.environ.get("PORT", "3000")
BASE = os.environ.get("E2E_BASE_URL", f"http://localhost:{PORT}")
PASSWORD = os.environ.get("DEV_ADMIN_PASSWORD", "devpass")


def post_json(path: str, body: dict, token: str | None = None) -> tuple[int, dict]:
    data = json.dumps(body).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(f"{BASE}{path}", data=data, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=20) as res:
            return res.status, json.loads(res.read().decode("utf-8"))
    except urllib.error.HTTPError as err:
        payload = json.loads(err.read().decode("utf-8"))
        return err.code, payload


def delete_json(path: str, body: dict) -> tuple[int, dict]:
    from urllib.parse import urlparse

    data = json.dumps(body).encode("utf-8")
    parsed = urlparse(BASE)
    origin = f"{parsed.scheme}://{parsed.netloc}"
    headers = {"Content-Type": "application/json", "Origin": origin}
    req = urllib.request.Request(f"{BASE}{path}", data=data, headers=headers, method="DELETE")
    try:
        with urllib.request.urlopen(req, timeout=20) as res:
            return res.status, json.loads(res.read().decode("utf-8"))
    except urllib.error.HTTPError as err:
        payload = json.loads(err.read().decode("utf-8"))
        return err.code, payload


def seed_invite() -> dict[str, str]:
    env_file = ROOT / ".env.local"
    cmd = ["npx", "tsx", "--env-file=.env.local", "scripts/seed-e2e-invite.ts"]
    if not env_file.exists():
        cmd = ["npx", "tsx", "scripts/seed-e2e-invite.ts"]
    result = subprocess.run(
        cmd,
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=True,
    )
    return json.loads(result.stdout.strip())


def run_invite_accept_journey(page) -> None:
    invite = seed_invite()
    token = invite["token"]
    username = invite["username"]
    password = invite["password"]

    page.goto(f"{BASE}/accept-invite?token={token}", wait_until="networkidle")
    page.get_by_test_id("accept-invite-submit").wait_for()
    page.locator('input[name="firstName"]').fill("E2E")
    page.locator('input[name="lastName"]').fill("Invite")
    page.locator('input[name="username"]').fill(username)
    page.locator("#invite-password").fill(password)
    page.locator('input[name="confirm"]').fill(password)
    page.get_by_test_id("accept-invite-submit").click()
    page.wait_for_url("**/accept-invite?done=1", timeout=30000)
    assert "password=" not in page.url
    page.get_by_test_id("accept-invite-done").wait_for()
    page.goto(f"{BASE}/login/fresh", wait_until="networkidle")
    page.get_by_test_id("login-submit").wait_for()
    page.locator('input[name="identity"]').fill(username)
    page.locator('input[autocomplete="current-password"]').fill(password)
    page.get_by_test_id("login-submit").click()
    page.wait_for_url("**/admin/api-keys", timeout=30000)
    page.get_by_test_id("nav-keys").wait_for()


def seed_reset() -> dict[str, str]:
    env_file = ROOT / ".env.local"
    cmd = ["npx", "tsx", "--env-file=.env.local", "scripts/seed-e2e-reset.ts"]
    if not env_file.exists():
        cmd = ["npx", "tsx", "scripts/seed-e2e-reset.ts"]
    result = subprocess.run(
        cmd,
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=True,
    )
    return json.loads(result.stdout.strip())


def run_password_reset_journey(page) -> None:
    page.goto(f"{BASE}/login/fresh", wait_until="networkidle")
    page.get_by_test_id("login-reset-link").wait_for()
    page.get_by_test_id("login-reset-link").click()
    page.get_by_test_id("reset-submit").wait_for()
    seeded = seed_reset()
    page.locator('input[type="email"]').fill(seeded["email"])
    page.get_by_test_id("reset-submit").click()
    page.get_by_test_id("reset-sent").wait_for()
    seeded = seed_reset()
    page.goto(f"{BASE}/set-password?token={seeded['token']}", wait_until="networkidle")
    page.get_by_test_id("set-password-submit").wait_for()
    page.locator("#new-password").fill(seeded["password"])
    page.locator('input[name="confirm"]').fill(seeded["password"])
    page.get_by_test_id("set-password-submit").click()
    page.get_by_test_id("set-password-done").wait_for()
    page.goto(f"{BASE}/login/fresh", wait_until="networkidle")
    page.get_by_test_id("login-submit").wait_for()
    page.locator('input[name="identity"]').fill(seeded["username"])
    page.locator('input[autocomplete="current-password"]').fill(seeded["password"])
    page.get_by_test_id("login-submit").click()
    page.wait_for_url("**/admin/api-keys", timeout=30000)
    page.get_by_test_id("nav-keys").wait_for()
    page.get_by_test_id("nav-sign-out").click()
    page.get_by_test_id("admin-login").wait_for()


def main() -> None:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1280, "height": 800})

        page.set_default_timeout(60_000)
        run_invite_accept_journey(page)
        run_password_reset_journey(page)

        page.goto(f"{BASE}/", wait_until="domcontentloaded")
        page.get_by_test_id("admin-home-instructions").wait_for()
        assert page.get_by_test_id("admin-login").is_visible()

        with page.expect_popup() as popup_info:
            page.get_by_test_id("admin-home-instructions").click()
        instructions = popup_info.value
        instructions.wait_for_load_state("networkidle")
        instructions.get_by_role("heading").first.wait_for()
        assert "places-agent" in instructions.content()
        assert "Authorization: Bearer" in instructions.content()
        assert instructions.get_by_test_id("guide-capabilities").is_visible()
        assert "search_restaurants" in instructions.content()
        assert "discover_places" in instructions.content()
        assert "arrange_day" in instructions.content()
        assert "POST /v1/discover_places" in instructions.content()
        assert "POST /v1/arrange_day" in instructions.content()
        assert "POST /v1/chat" in instructions.content()
        assert "Tripadvisor.enrich" in instructions.content()
        instructions.close()

        page.goto(f"{BASE}/login/fresh", wait_until="networkidle")
        page.get_by_test_id("register-disabled").wait_for()
        assert page.get_by_test_id("register-disabled").is_visible()
        qr = page.get_by_test_id("contact-admin-qr")
        assert qr.is_hidden()
        page.get_by_test_id("contact-admin").hover()
        qr.wait_for(state="visible")
        assert "/EthanWeChat.png" in (qr.locator("img").get_attribute("src") or "")
        page.locator('input[name="identity"]').fill("admin")
        page.locator('input[autocomplete="current-password"]').fill("wrong-password")
        page.get_by_test_id("login-submit").click()
        page.get_by_test_id("login-error").wait_for()

        page.locator('input[name="identity"]').fill("admin")
        page.locator('input[autocomplete="current-password"]').fill(PASSWORD)
        page.get_by_test_id("login-submit").click()
        page.wait_for_url("**/admin/api-keys", timeout=30000)
        page.get_by_test_id("nav-keys").wait_for()
        assert page.get_by_test_id("nav-keys").is_visible()
        assert page.get_by_test_id("admin-hello").is_visible()
        assert page.get_by_test_id("landing-instructions").is_visible()

        page.get_by_test_id("locale-HK").click()
        page.wait_for_function("() => document.documentElement.lang === 'zh-HK'")

        page.get_by_test_id("issue-key").click()
        page.locator('input[name="name"]').wait_for()
        page.locator('input[name="name"], input#name').first.fill("e2e-caller")
        page.locator("form").locator("button[type=submit]").click()
        page.wait_for_selector("[data-testid=copy-secret]", timeout=10000)
        secret = page.locator(".secret-panel code, .code-block code").first.inner_text().strip()
        assert secret.startswith("pa_")

        status, body = post_json(
            "/v1/search_restaurants",
            {"query": "Yat", "providers": ["GOOGLE_MAPS"], "locale": "EN"},
            token=secret,
        )
        assert status == 200
        assert body.get("agent") == "places-agent"
        assert body.get("ok") is True
        assert body.get("data")

        places_status, places_body = post_json(
            "/v1/search_places",
            {"query": "museum", "providers": ["GOOGLE_MAPS"], "locale": "EN"},
            token=secret,
        )
        assert places_status == 200
        assert places_body.get("ok") is True
        places_data = places_body.get("data")
        assert isinstance(places_data, list) and len(places_data) > 0, places_body

        unsigned_status, unsigned_body = delete_json("/api/admin/api-keys", {"ids": ["not-a-key"]})
        assert unsigned_status == 401
        assert unsigned_body.get("error", {}).get("key") == "errors.session_expired"

        page.goto(f"{BASE}/admin/api-keys", wait_until="networkidle")
        page.get_by_test_id("issue-key").wait_for()

        def issue_named_key(name: str) -> None:
            page.get_by_test_id("issue-key").click()
            page.locator('input[name="name"]').wait_for()
            page.locator('input[name="name"]').fill(name)
            page.locator("form").locator("button[type=submit]").click()
            page.wait_for_selector("[data-testid=copy-secret]", timeout=10000)
            page.locator("button[data-i18n='admin.common.done']").click()
            page.wait_for_url("**/admin/api-keys", timeout=30000)
            page.get_by_test_id("keys-table").wait_for()

        issue_named_key("bulk-a")
        issue_named_key("bulk-b")
        assert page.get_by_test_id("keys-delete-selected").is_disabled()
        page.get_by_test_id("keys-select-all").check()
        assert page.get_by_test_id("keys-select-bulk-a").is_checked()
        assert page.get_by_test_id("keys-select-bulk-b").is_checked()
        assert page.get_by_test_id("keys-delete-selected").is_enabled()
        page.get_by_test_id("keys-select-all").uncheck()
        assert page.get_by_test_id("keys-delete-selected").is_disabled()
        page.get_by_test_id("keys-select-bulk-a").check()
        page.get_by_test_id("keys-select-bulk-b").check()
        assert page.get_by_test_id("keys-delete-selected").is_enabled()
        page.get_by_test_id("keys-delete-selected").click()
        page.get_by_test_id("keys-delete-selected-confirm").click()
        page.wait_for_selector("[data-testid=keys-select-bulk-a]", state="detached", timeout=15000)
        page.wait_for_selector("[data-testid=keys-select-bulk-b]", state="detached", timeout=15000)

        chat_status, chat_body = post_json(
            "/v1/chat",
            {"messages": [{"role": "user", "content": "ramen near Tsim Sha Tsui"}], "locale": "EN"},
            token=secret,
        )
        assert chat_status == 200
        assert chat_body.get("ok") is True
        assert chat_body.get("data", {}).get("message", {}).get("content")

        unauthorized, unauth_body = post_json("/v1/search_restaurants", {"query": "Yat"})
        assert unauthorized == 401
        assert unauth_body.get("outcome", {}).get("key") == "errors.caller_unauthorized"

        page.set_viewport_size({"width": 390, "height": 844})
        page.goto(f"{BASE}/admin/api-keys", wait_until="domcontentloaded")
        page.get_by_test_id("issue-key").wait_for()
        assert page.get_by_test_id("nav-keys").is_visible() or page.get_by_test_id("issue-key").is_visible()

        browser.close()


if __name__ == "__main__":
    main()
