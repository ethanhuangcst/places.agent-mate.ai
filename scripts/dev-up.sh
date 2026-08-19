#!/usr/bin/env bash
# Start places-agent in background; record the PID that owns PORT (not the npx wrapper).
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p .data

PORT="$(grep -E '^PORT=' .env.local 2>/dev/null | cut -d= -f2 | tr -d ' ' || true)"
PORT="${PORT:-3010}"

if [[ -f .data/server.pid ]] && kill -0 "$(cat .data/server.pid)" 2>/dev/null; then
  echo "places-agent already up (pid $(cat .data/server.pid)) — http://localhost:${PORT}"
  exit 0
fi

# Stale lock from a crashed Next dev session blocks app.prepare().
if [[ -f .next/dev/lock ]]; then
  LOCK_PID="$(python3 -c "import json; print(json.load(open('.next/dev/lock'))['pid'])" 2>/dev/null || true)"
  if [[ -z "${LOCK_PID}" ]] || ! kill -0 "${LOCK_PID}" 2>/dev/null; then
    rm -f .next/dev/lock
    echo "removed stale .next/dev/lock"
  fi
fi

rm -f .data/server.pid

# Fully detach from the launching shell (agent/CI shells may SIGHUP nohup children).
if command -v setsid >/dev/null 2>&1; then
  setsid bash -c 'exec npx tsx --env-file=.env.local server.ts >> .data/server.log 2>&1' </dev/null &
else
  nohup bash -c 'exec npx tsx --env-file=.env.local server.ts >> .data/server.log 2>&1' </dev/null >/dev/null 2>&1 &
fi

echo -n "places-agent starting"
for _ in $(seq 1 45); do
  LISTEN_PID="$(lsof -ti "tcp:${PORT}" -sTCP:LISTEN 2>/dev/null | head -1 || true)"
  if [[ -n "${LISTEN_PID}" ]] && curl -sf "http://localhost:${PORT}/v1/health" >/dev/null 2>&1; then
    echo "${LISTEN_PID}" > .data/server.pid
    echo ""
    echo "places-agent up (pid ${LISTEN_PID}) — http://localhost:${PORT} (health OK)"
    exit 0
  fi
  echo -n "."
  sleep 1
done

echo ""
echo "places-agent failed health check — tail .data/server.log:"
tail -30 .data/server.log
exit 1
