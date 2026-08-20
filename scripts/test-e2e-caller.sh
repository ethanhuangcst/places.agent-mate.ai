#!/usr/bin/env bash
# TC-E2E-01~08: Caller simulation E2E tests.
# Opt-in — requires live vendor keys (AMAP_API_KEY, GOOGLE_MAPS_API_KEY or GMAPS_MCP_*).
# Usage: from 1.places-agent/ — make test-e2e-caller
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

# Require at least one live vendor key
if [[ -z "${AMAP_API_KEY:-}" ]] && [[ -z "${GOOGLE_MAPS_API_KEY:-}" ]]; then
  echo "error: at least one of AMAP_API_KEY or GOOGLE_MAPS_API_KEY must be set (e.g. in .env.local)" >&2
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
  CALLER_KEY="$(npx tsx --env-file=.env.local scripts/issue-caller-key.ts test-e2e-caller 2>&1 | python3 -c "import sys,json; print(json.load(sys.stdin)['secret'])")"
fi

PASS_COUNT=0
FAIL_COUNT=0

run_tc() {
  local tc_id="$1"
  local endpoint="$2"
  local body="$3"
  local assert_script="$4"

  RESP="$(curl -sf -H "Authorization: Bearer $CALLER_KEY" -H "Content-Type: application/json" \
    -d "$body" "$BASE/v1/$endpoint" 2>&1)" || {
    echo "FAIL $tc_id: curl failed"
    FAIL_COUNT=$((FAIL_COUNT + 1))
    return 0
  }

  if python3 - <<PY "$RESP" "$tc_id"; then
import json, sys
d = json.loads(sys.argv[1])
tc = sys.argv[2]
assert d.get("agent") == "places-agent", f"{tc}: missing agent field"
$assert_script
print(f"PASS {tc}")
PY
    PASS_COUNT=$((PASS_COUNT + 1))
  else
    echo "FAIL $tc_id"
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi
}

# ── TC-E2E-01: what2eat — Chinese restaurant search ──────────────────────
run_tc "TC-E2E-01" "search_restaurants" \
  '{"query":"日料","near":{"lat":31.23,"lng":121.47},"providers":["AMAP","GOOGLE_MAPS"],"locale":"CN"}' \
  '
assert d.get("ok") is True, f"{tc}: ok not true"
data = d.get("data") or []
assert len(data) >= 1, f"{tc}: no results"
for c in data:
    loc = c.get("location") or {}
    assert 30 <= loc.get("lat", 0) <= 32, f"{tc}: lat out of Shanghai range: {loc}"
    assert 120 <= loc.get("lng", 0) <= 122, f"{tc}: lng out of Shanghai range: {loc}"
    assert c.get("provider") in ("AMAP", "GOOGLE_MAPS"), f"{tc}: unexpected provider"
    assert len(c.get("sources") or []) >= 1, f"{tc}: empty sources"
'

# ── TC-E2E-02: what2eat — provider auto-selection for Chinese address ────
run_tc "TC-E2E-02" "search_restaurants" \
  '{"query":"火锅","near":{"lat":39.93,"lng":116.45},"locale":"CN"}' \
  '
assert d.get("ok") is True, f"{tc}: ok not true"
data = d.get("data") or []
providers = set(c.get("provider") for c in data)
# Auto-selection for Beijing should include AMAP
assert "AMAP" in providers, f"{tc}: expected AMAP in auto-selection, got {providers}"
for c in data:
    loc = c.get("location") or {}
    assert 18 <= loc.get("lat", 0) <= 54, f"{tc}: lat outside China"
    assert 73 <= loc.get("lng", 0) <= 135, f"{tc}: lng outside China"
'

# ── TC-E2E-03: where2play — English place search ─────────────────────────
run_tc "TC-E2E-03" "search_places" \
  '{"query":"museums near Tokyo Tower","near":{"lat":35.66,"lng":139.75},"providers":["GOOGLE_MAPS"],"locale":"EN"}' \
  '
assert d.get("ok") is True, f"{tc}: ok not true"
data = d.get("data") or []
assert len(data) >= 1, f"{tc}: no results"
for c in data:
    loc = c.get("location") or {}
    assert 35 <= loc.get("lat", 0) <= 36, f"{tc}: lat out of Tokyo range: {loc}"
    assert 139 <= loc.get("lng", 0) <= 140, f"{tc}: lng out of Tokyo range: {loc}"
    assert c.get("provider") == "GOOGLE_MAPS", f"{tc}: expected GOOGLE_MAPS"
'

# ── TC-E2E-04: itinerary — timed plan for non-hardcoded city (成都) ──────
run_tc "TC-E2E-04" "plan_itinerary" \
  '{"detail":"timed","origin":{"name":"成都市锦江区春熙路"},"timezone":"Asia/Shanghai","bounds":{"start":"2026-09-01","end":"2026-09-04"},"preferences":{"pace":"relaxed","natural_language":"成都三日游"},"providers":["AMAP","GOOGLE_MAPS"],"locale":"CN"}' \
  '
assert d.get("ok") is True, f"{tc}: ok not true"
data = d.get("data") or {}
days = data.get("days") or []
assert len(days) == 3, f"{tc}: expected 3 days, got {len(days)}"
assert days[0].get("day_index") == 1, f"{tc}: day_index not 1-based"
# Check no duplicate native_ids across days
all_ids = []
for day in days:
    for block in day.get("blocks") or []:
        if block.get("kind") == "visit":
            place = block.get("place") or {}
            for s in place.get("sources") or []:
                nid = s.get("native_id") or ""
                assert nid not in all_ids, f"{tc}: duplicate native_id {nid}"
                all_ids.append(nid)
'

# ── TC-E2E-05: chatbox — Chinese NL query ────────────────────────────────
run_tc "TC-E2E-05" "chat" \
  '{"messages":[{"role":"user","content":"帮我找上海外滩附近的西餐厅"}],"locale":"CN"}' \
  '
assert d.get("ok") is True, f"{tc}: ok not true"
# Chat must produce a response (assistant message or tool results)
'

# ── TC-E2E-06: photo field validation ────────────────────────────────────
run_tc "TC-E2E-06" "search_restaurants" \
  '{"query":"restaurant","near":{"lat":22.28,"lng":114.17},"providers":["GOOGLE_MAPS"],"locale":"EN"}' \
  '
assert d.get("ok") is True, f"{tc}: ok not true"
data = d.get("data") or []
for c in data:
    photos = c.get("photos")
    if photos is not None:
        assert isinstance(photos, list), f"{tc}: photos not a list"
        assert len(photos) > 0, f"{tc}: photos is empty array (should be omitted)"
        for p in photos:
            assert isinstance(p, str), f"{tc}: photo entry not a string"
'

# ── TC-E2E-07: mixed-language input resilience ───────────────────────────
run_tc "TC-E2E-07" "search_restaurants" \
  '{"query":"火锅","near":{"lat":31.23,"lng":121.47},"locale":"CN"}' \
  '
assert d.get("ok") is True, f"{tc}: ok not true"
data = d.get("data") or []
for c in data:
    loc = c.get("location") or {}
    assert 30 <= loc.get("lat", 0) <= 32, f"{tc}: result not in Shanghai: {loc}"
    assert 120 <= loc.get("lng", 0) <= 122, f"{tc}: result not in Shanghai: {loc}"
'

# ── TC-E2E-08: itinerary meal-context matching ───────────────────────────
run_tc "TC-E2E-08" "plan_itinerary" \
  '{"detail":"timed","origin":{"name":"Boavista 83 Hostel Lisbon"},"destination":{"name":"Boavista 83 Hostel Lisbon"},"timezone":"Europe/Lisbon","bounds":{"start":"2026-09-01","end":"2026-09-03"},"preferences":{"pace":"relaxed","natural_language":"2-day Lisbon trip"},"providers":["GOOGLE_MAPS"],"locale":"EN"}' \
  '
assert d.get("ok") is True, f"{tc}: ok not true"
data = d.get("data") or {}
days = data.get("days") or []
meal_ids = set()
for day in days:
    for block in day.get("blocks") or []:
        if block.get("kind") != "meal":
            continue
        slot = block.get("slot") or {}
        meal_type = block.get("meal") or ""
        start_h = int((slot.get("start") or "00:00").split(":")[0])
        if meal_type == "dinner":
            assert start_h >= 17, f"{tc}: dinner before 17:00: {slot}"
            assert start_h <= 20, f"{tc}: dinner after 20:00: {slot}"
        for opt in block.get("options") or []:
            place = opt.get("place") or {}
            for s in place.get("sources") or []:
                nid = s.get("native_id") or ""
                if nid:
                    assert nid not in meal_ids, f"{tc}: duplicate meal venue {nid}"
                    meal_ids.add(nid)
'

echo ""
echo "═══════════════════════════════════════════"
echo " test-e2e-caller: ${PASS_COUNT} passed, ${FAIL_COUNT} failed"
echo "═══════════════════════════════════════════"

if [[ "$FAIL_COUNT" -gt 0 ]]; then
  exit 1
fi
