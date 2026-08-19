.PHONY: help dev up down status reset-dev test test-e2e test-live test-coverage verify-gmaps-fallback verify-amap-live verify-tripadvisor-live verify-open-meteo-live lint typecheck quality db

.DEFAULT_GOAL := help

help: ## Show available targets
	@grep -E '^[a-zA-Z_-]+:.*?##' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf " %-12s %s\n", $$1, $$2}'

DEV_ADMIN_PASSWORD ?= devpass

db: ## Apply SQLite schema and seed admin
	@mkdir -p .data
	DATABASE_URL="file:../.data/places-agent.db" npx prisma migrate deploy
	DATABASE_URL="file:../.data/places-agent.db" DEV_ADMIN_PASSWORD="$(DEV_ADMIN_PASSWORD)" npx prisma db seed

dev: ## Start places-agent (foreground — keep this terminal open)
	@chmod +x scripts/dev-server.sh
	@./scripts/dev-server.sh

up: ## Start local stack in the background (idempotent; waits for /v1/health)
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

test: ## Unit + contract (fixture vendors)
	npx vitest run

test-e2e: ## Admin Playwright journeys (needs Chromium)
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

test-coverage: ## Vitest with coverage thresholds
	npx vitest run --coverage

quality: ## typecheck + lint + coverage + admin Playwright
	$(MAKE) typecheck
	$(MAKE) lint
	$(MAKE) test-coverage
	$(MAKE) test-e2e
