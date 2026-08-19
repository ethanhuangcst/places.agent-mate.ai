#!/usr/bin/env bash
# Verify ADR-017 Worker fallback (TC-H15) without toggling VPN.
# Usage: from 1.places-agent/ with GMAPS_MCP_* in .env.local
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PORT="${PORT:-3010}"
BASE="http://localhost:${PORT}"
HEALTH_WAIT_SEC="${HEALTH_WAIT_SEC:-45}"

if [[ -f .env.local ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env.local
  set +a
fi

# Override fixture defaults — this script validates live Worker fallback only
export PLACES_VENDOR_MODE=live
export GOOGLE_DIRECT_FORCE_FAIL=1

if [[ -z "${GMAPS_MCP_URL:-}" || -z "${GMAPS_MCP_BEARER:-}" ]]; then
  echo "error: GMAPS_MCP_URL and GMAPS_MCP_BEARER must be set (e.g. in .env.local)" >&2
  exit 1
fi

CALLER_KEY="${CALLER_KEY:-}"
if [[ -z "$CALLER_KEY" ]]; then
  CALLER_KEY="$(npx tsx --env-file=.env.local scripts/issue-caller-key.ts verify-fallback 2>&1 | python3 -c "import sys,json; print(json.load(sys.stdin)['secret'])")"
fi

echo "Starting dev server with GOOGLE_DIRECT_FORCE_FAIL=$GOOGLE_DIRECT_FORCE_FAIL ..."
npx tsx server.ts &
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

RESP="$(curl -sf -H "Authorization: Bearer $CALLER_KEY" -H "Content-Type: application/json" \
  -d '{"query":"restaurant","near":{"lat":22.2819,"lng":114.158},"providers":["GOOGLE_MAPS"],"locale":"EN"}' \
  "$BASE/v1/search_restaurants")"

python3 - <<'PY' "$RESP"
import json, sys
d = json.loads(sys.argv[1])
assert d.get("agent") == "places-agent", d
assert d.get("ok") is True, d
data = d.get("data") or []
assert len(data) >= 1, d
for card in data:
    assert card.get("provider") == "GOOGLE_MAPS", card
    for s in card.get("sources") or []:
        assert s.get("provider") == "GOOGLE_MAPS", s
        nid = s.get("native_id") or ""
        assert not nid.startswith("fixture_"), s
print(f"PASS: {len(data)} live GOOGLE_MAPS card(s)")
for c in data[:5]:
    print(f"  - {c.get('name')}")
PY

echo "TC-H15 verify-gmaps-fallback: PASS"
