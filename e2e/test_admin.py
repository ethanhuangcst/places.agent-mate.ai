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


def main() -> None:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1280, "height": 800})

        page.set_default_timeout(60_000)
        run_invite_accept_journey(page)

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
        instructions.close()

        page.goto(f"{BASE}/login/fresh", wait_until="networkidle")
        page.get_by_test_id("register-disabled").wait_for()
        assert page.get_by_test_id("register-disabled").is_visible()
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
