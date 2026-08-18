.PHONY: help dev up down test test-e2e lint typecheck db

.DEFAULT_GOAL := help

help: ## Show available targets
	@grep -E '^[a-zA-Z_-]+:.*?##' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf " %-12s %s\n", $$1, $$2}'

DEV_ADMIN_PASSWORD ?= devpass

db: ## Apply SQLite schema and seed admin
	@mkdir -p .data
	DATABASE_URL="file:../.data/places-agent.db" npx prisma migrate deploy
	DATABASE_URL="file:../.data/places-agent.db" DEV_ADMIN_PASSWORD="$(DEV_ADMIN_PASSWORD)" npx prisma db seed

dev: ## Start places-agent (custom server, foreground)
	@mkdir -p .data
	npx tsx watch --env-file=.env.local server.ts

up: ## Start local stack in the background
	@mkdir -p .data
	npx tsx --env-file=.env.local server.ts > .data/server.log 2>&1 & echo $$! > .data/server.pid
	@echo "places-agent up (pid $$(cat .data/server.pid))"

down: ## Stop local stack
	@if [ -f .data/server.pid ]; then kill $$(cat .data/server.pid) 2>/dev/null || true; rm -f .data/server.pid; fi
	-pkill -f "tsx.*server.ts" || true
	@echo "places-agent down"

test: ## Unit + contract (fixture vendors)
	npx vitest run

test-e2e: ## Admin Playwright journeys (needs Chromium)
	python3 e2e/run.py

lint: ## Typecheck (ESLint next config does not support TypeScript 7 yet)
	npx tsc --noEmit

typecheck: ## Typecheck
	npx tsc --noEmit
