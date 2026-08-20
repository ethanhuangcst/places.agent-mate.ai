#!/usr/bin/env bash
# Start places-agent (foreground). Cleans stale Next dev lock when the old PID is dead.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p .data

PORT="$(grep -E '^PORT=' .env.local 2>/dev/null | cut -d= -f2 | tr -d ' ' || true)"
PORT="${PORT:-3010}"

if [[ -f .next/dev/lock ]]; then
  LOCK_PID="$(python3 -c "import json; print(json.load(open('.next/dev/lock'))['pid'])" 2>/dev/null || true)"
  if [[ -n "${LOCK_PID}" ]] && ! kill -0 "${LOCK_PID}" 2>/dev/null; then
    rm -f .next/dev/lock
    echo "removed stale .next/dev/lock (pid ${LOCK_PID} was dead)"
  fi
fi

# Ensure dev mode so cookies are not marked Secure (breaks Safari on http://localhost).
export NODE_ENV=development
exec npx tsx --env-file=.env.local server.ts
