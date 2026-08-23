#!/usr/bin/env python3
"""Detach places-agent for `make up` (ADR-035).

macOS has no `setsid`; bare `nohup &` is reaped by short-lived IDE/agent shells.
Always spawn with ``start_new_session=True``. "Up" means LISTEN(port) + /v1/health.
"""

from __future__ import annotations

import argparse
import json
import os
import signal
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Callable, Optional

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / ".data"
PID_FILE = DATA / "server.pid"
LOG_FILE = DATA / "server.log"
NEXT_LOCK = ROOT / ".next" / "dev" / "lock"
DEFAULT_PORT = 3010
HEALTH_PATH = "/v1/health"

SpawnFn = Callable[..., subprocess.Popen]


def read_port(env_file: Path = ROOT / ".env.local") -> int:
    if env_file.is_file():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            if line.startswith("PORT="):
                raw = line.split("=", 1)[1].strip().strip('"').strip("'")
                if raw.isdigit():
                    return int(raw)
    return int(os.environ.get("PORT", DEFAULT_PORT))


def health_ok(port: int, timeout: float = 2.0) -> bool:
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}{HEALTH_PATH}", timeout=timeout) as res:
            body = json.loads(res.read().decode("utf-8"))
            return body.get("agent") == "places-agent" and body.get("ok") is True
    except (urllib.error.URLError, json.JSONDecodeError, TimeoutError, OSError, ValueError):
        return False


def listener_pids(port: int) -> list[int]:
    try:
        out = subprocess.check_output(
            ["lsof", "-nP", f"-iTCP:{port}", "-sTCP:LISTEN", "-t"],
            stderr=subprocess.DEVNULL,
            text=True,
        )
    except (subprocess.CalledProcessError, FileNotFoundError):
        return []
    pids: list[int] = []
    for line in out.splitlines():
        line = line.strip()
        if line.isdigit():
            pids.append(int(line))
    return pids


def pid_alive(pid: int) -> bool:
    if pid <= 0:
        return False
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


def clear_stale_next_lock(lock_path: Path = NEXT_LOCK) -> bool:
    """Remove Next lock when its recorded pid is dead. Returns True if removed."""
    if not lock_path.is_file():
        return False
    try:
        data = json.loads(lock_path.read_text(encoding="utf-8"))
        lock_pid = int(data.get("pid") or 0)
    except (json.JSONDecodeError, OSError, TypeError, ValueError):
        lock_path.unlink(missing_ok=True)
        return True
    if lock_pid and pid_alive(lock_pid):
        return False
    lock_path.unlink(missing_ok=True)
    return True


def write_pid(pid: int, pid_file: Path = PID_FILE) -> None:
    pid_file.parent.mkdir(parents=True, exist_ok=True)
    pid_file.write_text(f"{pid}\n", encoding="utf-8")


def clear_pid_file(pid_file: Path = PID_FILE) -> None:
    pid_file.unlink(missing_ok=True)


def is_server_up(
    port: int,
    *,
    health_fn: Callable[[int], bool] = health_ok,
    listeners_fn: Callable[[int], list[int]] = listener_pids,
) -> tuple[bool, Optional[int]]:
    """Return (up, listen_pid). Health is required; pid file alone is not enough."""
    pids = listeners_fn(port)
    if not pids:
        return False, None
    if not health_fn(port):
        return False, pids[0]
    return True, pids[0]


def spawn_detached(
    cmd: list[str],
    *,
    cwd: Path,
    log_path: Path,
    env: Optional[dict[str, str]] = None,
    popen: SpawnFn = subprocess.Popen,
) -> subprocess.Popen:
    """Start ``cmd`` in a new session so agent/CI shells cannot SIGHUP it."""
    log_path.parent.mkdir(parents=True, exist_ok=True)
    child_env = os.environ.copy()
    if env:
        child_env.update(env)
    child_env.setdefault("NODE_ENV", "development")
    # Open log, pass as stdout/stderr, then close parent copy after Popen dups the fd.
    log_f = open(log_path, "a", buffering=1)  # noqa: SIM115
    try:
        return popen(
            cmd,
            cwd=str(cwd),
            stdin=subprocess.DEVNULL,
            stdout=log_f,
            stderr=subprocess.STDOUT,
            env=child_env,
            start_new_session=True,
            close_fds=True,
        )
    finally:
        log_f.close()


def server_command() -> list[str]:
    return ["npx", "tsx", "--env-file=.env.local", "server.ts"]


def repo_pkill_patterns(root: Path = ROOT) -> list[str]:
    """Patterns scoped to this checkout (ADR-035: do not kill other projects)."""
    root_s = str(root)
    return [
        f"{root_s}.*server\\.ts",
        f"tsx.*{root_s}.*server\\.ts",
    ]


def cmd_start(port: Optional[int] = None, wait_s: int = 45) -> int:
    port = port or read_port()
    DATA.mkdir(parents=True, exist_ok=True)

    up, listen_pid = is_server_up(port)
    if up and listen_pid is not None:
        write_pid(listen_pid)
        print(f"places-agent already up (pid {listen_pid}) — http://127.0.0.1:{port}")
        return 0

    clear_pid_file()
    if clear_stale_next_lock():
        print("removed stale .next/dev/lock")

    if listener_pids(port) and not health_ok(port):
        print(
            f"port {port} is in use but /v1/health failed — run `make down` then `make up`",
            file=sys.stderr,
        )
        return 1

    spawn_detached(
        server_command(),
        cwd=ROOT,
        log_path=LOG_FILE,
        env={"NODE_ENV": "development"},
    )

    print("places-agent starting", end="", flush=True)
    deadline = time.time() + wait_s
    while time.time() < deadline:
        up, listen_pid = is_server_up(port)
        if up and listen_pid is not None:
            write_pid(listen_pid)
            print()
            print(f"places-agent up (pid {listen_pid}) — http://127.0.0.1:{port} (health OK)")
            return 0
        print(".", end="", flush=True)
        time.sleep(1)

    print()
    print("places-agent failed health check — tail .data/server.log:", file=sys.stderr)
    if LOG_FILE.is_file():
        lines = LOG_FILE.read_text(encoding="utf-8", errors="replace").splitlines()
        print("\n".join(lines[-30:]), file=sys.stderr)
    return 1


def cmd_status(port: Optional[int] = None) -> int:
    port = port or read_port()
    up, listen_pid = is_server_up(port)
    if up and listen_pid is not None:
        write_pid(listen_pid)
        print(f"process: up (pid {listen_pid})")
        print("health: OK")
        return 0

    if PID_FILE.is_file():
        try:
            recorded = int(PID_FILE.read_text(encoding="utf-8").strip() or "0")
        except ValueError:
            recorded = 0
        if recorded and not pid_alive(recorded):
            clear_pid_file()
            print("process: down (cleared stale .data/server.pid)")
        else:
            print("process: down")
    else:
        print("process: down")

    print(f"health: FAIL (http://127.0.0.1:{port})")
    return 1


def cmd_down(port: Optional[int] = None) -> int:
    port = port or read_port()
    if PID_FILE.is_file():
        try:
            pid = int(PID_FILE.read_text(encoding="utf-8").strip() or "0")
        except ValueError:
            pid = 0
        if pid and pid_alive(pid):
            try:
                os.kill(pid, signal.SIGTERM)
            except OSError:
                pass
        clear_pid_file()

    for pid in listener_pids(port):
        try:
            os.kill(pid, signal.SIGTERM)
        except OSError:
            pass

    for pattern in repo_pkill_patterns():
        subprocess.run(
            ["pkill", "-f", pattern],
            check=False,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )

    NEXT_LOCK.unlink(missing_ok=True)
    for _ in range(20):
        if not listener_pids(port):
            break
        time.sleep(0.25)
    print("places-agent down")
    return 0


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="places-agent detached lifecycle (ADR-035)")
    parser.add_argument("action", choices=("start", "status", "down"))
    parser.add_argument("--port", type=int, default=None)
    parser.add_argument("--wait", type=int, default=45, help="seconds to wait for health on start")
    args = parser.parse_args(argv)

    if args.action == "start":
        return cmd_start(port=args.port, wait_s=args.wait)
    if args.action == "status":
        return cmd_status(port=args.port)
    return cmd_down(port=args.port)


if __name__ == "__main__":
    raise SystemExit(main())
