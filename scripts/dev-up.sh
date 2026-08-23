#!/usr/bin/env bash
# Start places-agent in the background (ADR-035: start_new_session via Python).
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p .data
exec python3 scripts/daemon_detach.py start "$@"
