#!/usr/bin/env python3
"""Unit tests for scripts/daemon_detach.py (ADR-035)."""

from __future__ import annotations

import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

# Allow `python3 -m unittest test_daemon_detach` from scripts/
import daemon_detach as dd  # noqa: E402


class SpawnDetachedTests(unittest.TestCase):
    def test_spawn_detached_passes_start_new_session(self) -> None:
        calls: list[dict] = []

        def fake_popen(*args, **kwargs):
            calls.append(kwargs)
            return MagicMock(pid=4242)

        with tempfile.TemporaryDirectory() as tmp:
            log = Path(tmp) / "server.log"
            dd.spawn_detached(
                ["echo", "hi"],
                cwd=Path(tmp),
                log_path=log,
                env={"NODE_ENV": "development"},
                popen=fake_popen,
            )

        self.assertEqual(len(calls), 1)
        self.assertTrue(calls[0].get("start_new_session"))
        self.assertEqual(calls[0].get("stdin"), subprocess.DEVNULL)
        self.assertEqual(calls[0]["env"].get("NODE_ENV"), "development")

    def test_spawn_detached_defaults_node_env_development(self) -> None:
        captured: dict = {}

        def fake_popen(*args, **kwargs):
            captured.update(kwargs)
            return MagicMock()

        with tempfile.TemporaryDirectory() as tmp:
            dd.spawn_detached(
                ["true"],
                cwd=Path(tmp),
                log_path=Path(tmp) / "a.log",
                popen=fake_popen,
            )
        self.assertEqual(captured["env"].get("NODE_ENV"), "development")


class IsServerUpTests(unittest.TestCase):
    def test_up_requires_listener_and_health(self) -> None:
        up, pid = dd.is_server_up(
            3010,
            health_fn=lambda _p: True,
            listeners_fn=lambda _p: [99],
        )
        self.assertTrue(up)
        self.assertEqual(pid, 99)

    def test_not_up_when_no_listener(self) -> None:
        up, pid = dd.is_server_up(
            3010,
            health_fn=lambda _p: True,
            listeners_fn=lambda _p: [],
        )
        self.assertFalse(up)
        self.assertIsNone(pid)

    def test_not_up_when_listener_but_health_fails(self) -> None:
        up, pid = dd.is_server_up(
            3010,
            health_fn=lambda _p: False,
            listeners_fn=lambda _p: [77],
        )
        self.assertFalse(up)
        self.assertEqual(pid, 77)


class StaleLockTests(unittest.TestCase):
    def test_clear_stale_lock_removes_dead_pid(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            lock = Path(tmp) / "lock"
            lock.write_text(json.dumps({"pid": 1}), encoding="utf-8")
            with patch.object(dd, "pid_alive", return_value=False):
                removed = dd.clear_stale_next_lock(lock)
            self.assertTrue(removed)
            self.assertFalse(lock.exists())

    def test_clear_stale_lock_keeps_live_pid(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            lock = Path(tmp) / "lock"
            lock.write_text(json.dumps({"pid": 12345}), encoding="utf-8")
            with patch.object(dd, "pid_alive", return_value=True):
                removed = dd.clear_stale_next_lock(lock)
            self.assertFalse(removed)
            self.assertTrue(lock.exists())


class RepoPkillPatternsTests(unittest.TestCase):
    def test_patterns_include_repo_root(self) -> None:
        root = Path("/Users/me/code/places-workspace/1.places-agent")
        patterns = dd.repo_pkill_patterns(root)
        self.assertTrue(any("1.places-agent" in p for p in patterns))
        self.assertFalse(any(p == "tsx.*server.ts" for p in patterns))


class ReadPortTests(unittest.TestCase):
    def test_read_port_from_env_file(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            env = Path(tmp) / ".env.local"
            env.write_text("PORT=3099\n", encoding="utf-8")
            self.assertEqual(dd.read_port(env), 3099)

    def test_read_port_default(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            missing = Path(tmp) / "nope.env"
            with patch.dict("os.environ", {}, clear=False):
                # Ensure PORT not forcing value
                env = {k: v for k, v in __import__("os").environ.items() if k != "PORT"}
                with patch.dict("os.environ", env, clear=True):
                    self.assertEqual(dd.read_port(missing), dd.DEFAULT_PORT)


if __name__ == "__main__":
    unittest.main()
