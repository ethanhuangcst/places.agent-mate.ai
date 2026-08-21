#!/usr/bin/env python3
"""Start places-agent and run operator E2E journeys."""

from __future__ import annotations

import os
import socket
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_PORT = int(os.environ.get("PORT", "3000"))


def pick_port(preferred: int) -> int:
    """Use preferred port when free; otherwise bind an ephemeral port."""
    if not is_port_open(preferred):
        return preferred
    with socket.socket() as sock:
        sock.bind(("", 0))
        return sock.getsockname()[1]


def is_port_open(port: int) -> bool:
    try:
        with socket.create_connection(("localhost", port), timeout=0.3):
            return True
    except OSError:
        return False


def ensure_admin_seeded() -> None:
    """Apply migrations and seed admin so DEV_ADMIN_PASSWORD matches the test."""
    env = os.environ.copy()
    env.setdefault("DEV_ADMIN_PASSWORD", "devpass")
    subprocess.run(["make", "db"], cwd=ROOT, env=env, check=True)


def main() -> int:
    ensure_admin_seeded()
    port = pick_port(DEFAULT_PORT)
    env = os.environ.copy()
    env["PORT"] = str(port)
    env["NEXT_DIST_DIR"] = ".next-e2e"
    env["QUANZIL_MODE"] = "fixture"
    env["PLACES_VENDOR_MODE"] = "fixture"
    env["NODE_ENV"] = "development"
    server = (
        f"PORT={port} NEXT_DIST_DIR=.next-e2e QUANZIL_MODE=fixture "
        f"PLACES_VENDOR_MODE=fixture npx tsx server.ts"
    )
    cmd = [
        sys.executable,
        str(ROOT / "scripts" / "with_server.py"),
        "--server",
        server,
        "--port",
        str(port),
        "--timeout",
        "120",
        "--",
        sys.executable,
        str(ROOT / "e2e" / "test_admin.py"),
    ]
    return subprocess.call(cmd, cwd=ROOT, env=env)


if __name__ == "__main__":
    raise SystemExit(main())
