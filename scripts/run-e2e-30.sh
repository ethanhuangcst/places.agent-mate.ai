#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export DATABASE_URL="${DATABASE_URL:-postgresql://places_agent:places_agent@localhost:5435/places_agent}"
if [[ -f .env.local ]]; then set -a; source .env.local; set +a; fi
if [[ -z "${PLACES_AGENT_CALLER_KEY:-}" ]]; then
  export PLACES_AGENT_CALLER_KEY="$(npx tsx --env-file=.env.local scripts/issue-caller-key.ts e2e-30-cities-batch | python3 -c "import sys,json; print(json.load(sys.stdin)['secret'])")"
fi
exec python3 scripts/e2e-places-agent.py "$@"
