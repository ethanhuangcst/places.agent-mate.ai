#!/usr/bin/env bash
# Stop places-agent; pkill scoped to this repo (ADR-035).
set -euo pipefail
cd "$(dirname "$0")/.."
exec python3 scripts/daemon_detach.py down "$@"
