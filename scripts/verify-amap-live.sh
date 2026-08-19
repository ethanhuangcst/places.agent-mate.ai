#!/usr/bin/env bash
# Opt-in live AMAP Web 服务 search. Needs AMAP_API_KEY (e.g. in .env.local).
# Usage: from 1.places-agent/ — make verify-amap-live
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

if [[ ! "${PORT:-}" =~ ^[0-9]+$ ]]; then
  PORT=3010
fi
BASE="http://127.0.0.1:${PORT}"
HEALTH_WAIT_SEC="${HEALTH_WAIT_SEC:-45}"

if [[ -z "${AMAP_API_KEY:-}" ]]; then
  echo "error: AMAP_API_KEY must be set (e.g. in .env.local)" >&2
  exit 1
fi

LISTEN_PID="$(lsof -ti "tcp:${PORT}" -sTCP:LISTEN 2>/dev/null | head -1 || true)"
if curl -sf "$BASE/v1/health" >/dev/null 2>&1; then
  echo "using existing server on $BASE"
elif [[ -n "${LISTEN_PID}" ]]; then
  echo "error: port ${PORT} is in use but /v1/health failed — not starting a second server" >&2
  exit 1
else
  echo "Starting dev server with PLACES_VENDOR_MODE=live ..."
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
fi

CALLER_KEY="${CALLER_KEY:-}"
if [[ -z "$CALLER_KEY" ]]; then
  CALLER_KEY="$(npx tsx --env-file=.env.local scripts/issue-caller-key.ts verify-amap-live 2>&1 | python3 -c "import sys,json; print(json.load(sys.stdin)['secret'])")"
fi

RESP="$(curl -sf -H "Authorization: Bearer $CALLER_KEY" -H "Content-Type: application/json" \
  -d '{"query":"烧烤","address":"上海地铁十号线紫藤路站","providers":["AMAP"],"locale":"CN"}' \
  "$BASE/v1/search_restaurants")"

python3 - <<'PY' "$RESP"
import json, sys
d = json.loads(sys.argv[1])
assert d.get("agent") == "places-agent", d
assert d.get("ok") is True, d
data = d.get("data") or []
assert len(data) >= 1, d
for card in data:
    assert card.get("provider") == "AMAP", card
    assert (card.get("location") or {}).get("crs") == "GCJ-02", card
    for s in card.get("sources") or []:
        assert s.get("provider") == "AMAP", s
        nid = s.get("native_id") or ""
        assert not nid.startswith("fixture_"), s
print(f"PASS: {len(data)} live AMAP card(s)")
for c in data[:8]:
    print(f"  - {c.get('name')}")
PY

echo "verify-amap-live: PASS"
