#!/usr/bin/env bash
# Ensure local Postgres for places-agent (ADR-025).
# Prefer dedicated compose :5436. Else reuse what2eat :5435 with dedicated DBs.
set -euo pipefail
cd "$(dirname "$0")/.."

COMPOSE=(docker compose -f docker-compose.dev.yml)
ROLE=places_agent
PASS=places_agent
MAIN_DB=places_agent
TEST_DB=places_agent_test

psql_admin() {
  local url="$1"
  shift
  psql "${url}" -v ON_ERROR_STOP=1 "$@"
}

ensure_via_psql() {
  local port="$1"
  local admin_url="$2"
  psql_admin "${admin_url}" -c "DO \$\$ BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${ROLE}') THEN
      CREATE ROLE ${ROLE} LOGIN PASSWORD '${PASS}';
    END IF;
  END \$\$;"
  for db in "${MAIN_DB}" "${TEST_DB}"; do
    if ! psql_admin "${admin_url}" -tAc "SELECT 1 FROM pg_database WHERE datname = '${db}'" | grep -q 1; then
      psql_admin "${admin_url}" -c "CREATE DATABASE ${db} OWNER ${ROLE};"
    fi
  done
  echo "Postgres ready on :${port} (dbs ${MAIN_DB}, ${TEST_DB})"
}

if command -v docker >/dev/null 2>&1; then
  if ! pg_isready -h localhost -p 5436 >/dev/null 2>&1; then
    "${COMPOSE[@]}" up -d postgres
    for _ in $(seq 1 30); do
      if docker exec places-agent-postgres pg_isready -U places_agent -d places_agent >/dev/null 2>&1; then
        break
      fi
      sleep 1
    done
  fi
  if pg_isready -h localhost -p 5436 >/dev/null 2>&1; then
    ensure_via_psql 5436 "postgresql://${ROLE}:${PASS}@localhost:5436/postgres"
    exit 0
  fi
  if docker exec places-agent-postgres pg_isready -U places_agent -d places_agent >/dev/null 2>&1; then
    docker exec places-agent-postgres psql -U places_agent -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '${TEST_DB}'" | grep -q 1 || \
      docker exec places-agent-postgres psql -U places_agent -d postgres -c "CREATE DATABASE ${TEST_DB};"
    echo "Postgres ready on :5436 (dbs ${MAIN_DB}, ${TEST_DB})"
    exit 0
  fi
fi

if pg_isready -h localhost -p 5435 >/dev/null 2>&1 && command -v psql >/dev/null 2>&1; then
  ensure_via_psql 5435 "postgresql://what2eat:what2eat@localhost:5435/postgres"
  echo "Using shared local instance :5435 — DATABASE_URL port must be 5435."
  exit 0
fi

echo "Need Docker (compose :5436) or a reachable Postgres on :5435 (what2eat)." >&2
exit 1
