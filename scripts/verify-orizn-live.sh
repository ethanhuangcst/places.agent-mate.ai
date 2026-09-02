#!/usr/bin/env bash
# Opt-in live Orizn visa probes (TC-M11-48-LIVE). Needs ORIZN_API_KEY in .env.local.
# Usage: from 1.places-agent/ — make verify-orizn-live
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -f .env.local ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env.local
  set +a
fi

if [[ -z "${ORIZN_API_KEY:-}" ]]; then
  echo "error: ORIZN_API_KEY not set in .env.local" >&2
  exit 1
fi

export PLACES_VENDOR_MODE=live
export ORIZN_LIVE_TESTS=1

npx vitest run tests/orizn-live.test.ts
echo "verify-orizn-live: PASS"
