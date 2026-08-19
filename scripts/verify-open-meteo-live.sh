#!/usr/bin/env bash
# Opt-in live Open-Meteo forecast on plan_itinerary. Free host needs no key.
# Usage: from 1.places-agent/ — make verify-open-meteo-live
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
  CALLER_KEY="$(npx tsx --env-file=.env.local scripts/issue-caller-key.ts verify-open-meteo-live 2>&1 | python3 -c "import sys,json; print(json.load(sys.stdin)['secret'])")"
fi

START="$(python3 - <<'PY'
from datetime import date
print(date.today().isoformat())
PY
)"
END="$(python3 - <<'PY'
from datetime import date, timedelta
print((date.today() + timedelta(days=1)).isoformat())
PY
)"

BODY="$(python3 - <<PY
import json
print(json.dumps({
  "bounds": {"start": "$START", "end": "$END"},
  "places": [{
    "provider": "GOOGLE_MAPS",
    "name": "Central",
    "location": {"lat": 22.2819, "lng": 114.158, "crs": "WGS84"},
    "category": "place",
    "sources": [{"provider": "GOOGLE_MAPS", "native_id": "live_om_pin", "deeplinks": {}}]
  }],
  "locale": "EN"
}))
PY
)"

RESP="$(curl -sf --max-time 60 -H "Authorization: Bearer $CALLER_KEY" -H "Content-Type: application/json" \
  -d "$BODY" \
  "$BASE/v1/plan_itinerary")"

python3 - <<'PY' "$RESP"
import json, sys
d = json.loads(sys.argv[1])
assert d.get("agent") == "places-agent", d
assert d.get("ok") is True, d
days = (d.get("data") or {}).get("days") or []
assert len(days) >= 1, d
weathered = 0
for day in days:
    w = day.get("weather") or {}
    if not w:
        continue
    code = w.get("weather_code")
    assert isinstance(code, int) and 0 <= code <= 99, day
    assert w.get("provider") == "OPEN_METEO", day
    fixture = code == 80 and w.get("temp_max_c") == 24 and w.get("temp_min_c") == 18
    assert not fixture, day
    weathered += 1
assert weathered >= 1, d
print(f"PASS: {len(days)} day(s), {weathered} with live Open-Meteo weather")
for day in days:
    w = day.get("weather") or {}
    print(f"  - {day.get('date')} code={w.get('weather_code')} max={w.get('temp_max_c')} min={w.get('temp_min_c')}")
PY

echo "verify-open-meteo-live: PASS"
