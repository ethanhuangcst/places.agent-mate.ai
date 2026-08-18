#!/usr/bin/env python3
"""Start places-agent and run operator E2E journeys."""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PORT = os.environ.get("PORT", "3000")


def ensure_admin_seeded() -> None:
    """Apply migrations and seed admin so DEV_ADMIN_PASSWORD matches the test."""
    env = os.environ.copy()
    env.setdefault("DEV_ADMIN_PASSWORD", "devpass")
    subprocess.run(["make", "db"], cwd=ROOT, env=env, check=True)


def main() -> int:
    ensure_admin_seeded()
    env_file = ROOT / ".env.local"
    server = f"npx tsx --env-file={env_file} server.ts" if env_file.exists() else "npx tsx server.ts"
    cmd = [
        sys.executable,
        str(ROOT / "scripts" / "with_server.py"),
        "--server",
        server,
        "--port",
        PORT,
        "--timeout",
        "120",
        "--",
        sys.executable,
        str(ROOT / "e2e" / "test_admin.py"),
    ]
    return subprocess.call(cmd, cwd=ROOT)


if __name__ == "__main__":
    raise SystemExit(main())
