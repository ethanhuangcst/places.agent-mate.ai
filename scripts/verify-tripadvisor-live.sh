#!/usr/bin/env bash
# Opt-in live Tripadvisor Terra enrich. Needs TRIPADVISOR_API_KEY (e.g. in .env.local).
# Starts a sidecar on VERIFY_TRIPADVISOR_PORT so the operator daemon (often
# GOOGLE_DIRECT_FORCE_FAIL=1) is not reused. Does not edit env files.
# Usage: from 1.places-agent/ — make verify-tripadvisor-live
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -f .env.local ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env.local
  set +a
fi

export PLACES_VENDOR_MODE=live
# Must be 0 (not unset): `npx --env-file=.env.local` would otherwise reload FORCE_FAIL=1.
export GOOGLE_DIRECT_FORCE_FAIL=0
PORT="${VERIFY_TRIPADVISOR_PORT:-3012}"
export PORT
BASE="http://127.0.0.1:${PORT}"
HEALTH_WAIT_SEC="${HEALTH_WAIT_SEC:-45}"

if [[ -z "${TRIPADVISOR_API_KEY:-}" ]]; then
  echo "error: TRIPADVISOR_API_KEY must be set (e.g. in .env.local)" >&2
  exit 1
fi

LISTEN_PID="$(lsof -ti "tcp:${PORT}" -sTCP:LISTEN 2>/dev/null | head -1 || true)"
if [[ -n "${LISTEN_PID}" ]]; then
  echo "error: port ${PORT} is in use (pid ${LISTEN_PID}) — set VERIFY_TRIPADVISOR_PORT" >&2
  exit 1
fi

echo "Starting sidecar on ${BASE} with PLACES_VENDOR_MODE=live GOOGLE_DIRECT_FORCE_FAIL=0 ..."
npx tsx --env-file=.env.local server.ts &
SERVER_PID=$!
cleanup() { kill "$SERVER_PID" 2>/dev/null || true; }
trap cleanup EXIT
for ((i=0; i<HEALTH_WAIT_SEC; i++)); do
  if curl -sf "$BASE/v1/health" >/dev/null 2>&1; then
    echo "health OK"
    break
  fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "error: server exited before health check" >&2
    exit 1
  fi
  sleep 1
done
if ! curl -sf "$BASE/v1/health" >/dev/null 2>&1; then
  echo "error: server did not become healthy within ${HEALTH_WAIT_SEC}s" >&2
  exit 1
fi

CALLER_KEY="${CALLER_KEY:-}"
if [[ -z "$CALLER_KEY" ]]; then
  CALLER_KEY="$(npx tsx --env-file=.env.local scripts/issue-caller-key.ts verify-tripadvisor-live 2>&1 | python3 -c "import sys,json; print(json.load(sys.stdin)['secret'])")"
fi

# Google textQuery "restaurant" + this pin returns unrelated US POIs; name the area.
RESP="$(curl -sf --max-time 90 -H "Authorization: Bearer $CALLER_KEY" -H "Content-Type: application/json" \
  -d '{"query":"restaurants in Central Hong Kong","near":{"lat":22.2819,"lng":114.158},"providers":["GOOGLE_MAPS"],"enrich":{"tripadvisor":true},"locale":"EN"}' \
  "$BASE/v1/search_restaurants")"

python3 - <<'PY' "$RESP"
import json, sys
d = json.loads(sys.argv[1])
assert d.get("agent") == "places-agent", d
assert d.get("ok") is True, d
data = d.get("data") or []
assert len(data) >= 1, d
rated = 0
for card in data:
    for s in card.get("sources") or []:
        nid = s.get("native_id") or ""
        assert not nid.startswith("fixture_"), s
    ta = card.get("tripadvisor") or {}
    url = (ta.get("url") or "")
    assert "tripadvisor.com/ichiran" not in url, card
    if isinstance(ta.get("rating"), (int, float)):
        rated += 1
assert rated >= 1, d
print(f"PASS: {len(data)} card(s), {rated} with Tripadvisor rating")
for c in data[:8]:
    ta = c.get("tripadvisor") or {}
    print(f"  - {c.get('name')} rating={ta.get('rating')}")
PY

echo "verify-tripadvisor-live: PASS"
