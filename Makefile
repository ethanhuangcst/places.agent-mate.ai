.PHONY: help dev up down status reset-dev test test-e2e test-live test-coverage verify-gmaps-fallback verify-amap-live verify-tripadvisor-live verify-open-meteo-live lint typecheck quality db db-up db-down db-migrate-test

.DEFAULT_GOAL := help

help: ## Show available targets
	@grep -E '^[a-zA-Z_-]+:.*?##' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf " %-12s %s\n", $$1, $$2}'

DEV_ADMIN_PASSWORD ?= devpass

COMPOSE_DEV := docker compose -f docker-compose.dev.yml
PG_PORT ?= $(shell pg_isready -h localhost -p 5436 >/dev/null 2>&1 && echo 5436 || echo 5435)
DATABASE_URL ?= postgresql://places_agent:places_agent@localhost:$(PG_PORT)/places_agent
TEST_DATABASE_URL ?= postgresql://places_agent:places_agent@localhost:$(PG_PORT)/places_agent_test

db-up: ## Start local Postgres on :5436
	@chmod +x scripts/pg-up.sh
	@./scripts/pg-up.sh

db-down: ## Stop local Postgres
	$(COMPOSE_DEV) down

db: db-up ## Apply Postgres schema and seed admin
	DATABASE_URL="$(DATABASE_URL)" npx prisma migrate deploy
	DATABASE_URL="$(DATABASE_URL)" DEV_ADMIN_PASSWORD="$(DEV_ADMIN_PASSWORD)" npx prisma db seed

db-migrate-test: db-up ## Apply schema to places_agent_test
	DATABASE_URL="$(TEST_DATABASE_URL)" npx prisma migrate deploy

dev: db ## Start places-agent (foreground — keep this terminal open)
	@chmod +x scripts/dev-server.sh
	@./scripts/dev-server.sh

up: db ## Start local stack in the background (idempotent; waits for /v1/health)
	@chmod +x scripts/dev-up.sh
	@./scripts/dev-up.sh

down: ## Stop local stack and clear stale Next dev lock
	@chmod +x scripts/dev-down.sh
	@./scripts/dev-down.sh

status: ## Check whether places-agent is running
	@PORT=$$(grep -E '^PORT=' .env.local 2>/dev/null | cut -d= -f2 | tr -d ' '); \
	PORT=$${PORT:-3010}; \
	if [ -f .data/server.pid ] && kill -0 $$(cat .data/server.pid) 2>/dev/null; then \
		echo "process: up (pid $$(cat .data/server.pid))"; \
	else \
		echo "process: down (stale .data/server.pid — run make down)"; \
	fi; \
	curl -sf "http://localhost:$$PORT/v1/health" && echo "health: OK" || echo "health: FAIL (http://localhost:$$PORT)"

reset-dev: ## Nuclear: stop server, delete .next cache, start fresh (fixes ENOENT / lock issues)
	@$(MAKE) down
	rm -rf .next
	@echo "removed .next — run 'make dev' in a dedicated terminal"

test: db-migrate-test ## Unit + contract (fixture vendors)
	TEST_DATABASE_URL="$(TEST_DATABASE_URL)" npx vitest run

test-e2e: db ## Admin Playwright journeys (needs Chromium)
	python3 e2e/run.py

test-live: ## Opt-in live vendor checks (TC-H15 Worker fallback; needs GMAPS_MCP_* in .env.local)
	@bash ./scripts/verify-gmaps-fallback.sh

verify-gmaps-fallback: ## TC-H15: Worker fallback with GOOGLE_DIRECT_FORCE_FAIL=1 (needs GMAPS_MCP_* in .env.local)
	@bash ./scripts/verify-gmaps-fallback.sh

verify-amap-live: ## Opt-in live AMAP Web 服务 search (needs AMAP_API_KEY in .env.local)
	@bash ./scripts/verify-amap-live.sh

verify-tripadvisor-live: ## Opt-in live Tripadvisor Terra enrich (needs TRIPADVISOR_API_KEY in .env.local)
	@bash ./scripts/verify-tripadvisor-live.sh

verify-open-meteo-live: ## Opt-in live Open-Meteo forecast on plan_itinerary (free host needs no key)
	@bash ./scripts/verify-open-meteo-live.sh

lint: ## ESLint (syntax + Next core-web-vitals; TypeScript 7 uses Babel parser)
	npx eslint .

typecheck: ## Typecheck
	npx tsc --noEmit

test-coverage: db-migrate-test ## Vitest with coverage thresholds
	TEST_DATABASE_URL="$(TEST_DATABASE_URL)" npx vitest run --coverage

quality: ## typecheck + lint + coverage + admin Playwright
	$(MAKE) typecheck
	$(MAKE) lint
	$(MAKE) test-coverage
	$(MAKE) test-e2e
