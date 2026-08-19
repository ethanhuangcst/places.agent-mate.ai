#!/usr/bin/env bash
# Stop places-agent and clear stale Next dev lock.
set -euo pipefail
cd "$(dirname "$0")/.."

PORT="$(grep -E '^PORT=' .env.local 2>/dev/null | cut -d= -f2 | tr -d ' ' || true)"
PORT="${PORT:-3010}"

if [[ -f .data/server.pid ]]; then
  kill "$(cat .data/server.pid)" 2>/dev/null || true
  rm -f .data/server.pid
fi

# Kill anything still listening on PORT (covers orphaned node after npx wrapper exits).
if PIDS="$(lsof -ti "tcp:${PORT}" -sTCP:LISTEN 2>/dev/null || true)"; then
  if [[ -n "${PIDS}" ]]; then
    kill ${PIDS} 2>/dev/null || true
  fi
fi

pkill -f "tsx.*server.ts" 2>/dev/null || true
rm -f .next/dev/lock
echo "places-agent down"
