# places-agent

HTTP + MCP **places agent** for the agent-mate family (`places.agent-mate.ai`).

Callers (what2eat / where2play / MCP hosts) use machine id **`places-agent`**. The same process serves:

- **HTTP tools** under `/v1/*` (Bearer caller API key; `/v1/health` is public)
- **MCP** tools (same core functions)
- **Admin app** for operators (login, API keys, invites, i18n)

Specs live in [`agent-specs/`](./agent-specs/). Product refactor progress: [`agent-specs/0.refactor-plan.md`](./agent-specs/0.refactor-plan.md). MVP-6 design source: Claude Code Plan `~/.claude/plans/flickering-humming-gizmo.md`.

---

## Quick start

```bash
cp .env.example .env.local   # fill secrets locally — do not commit
make up                      # Postgres + app (background); waits for /v1/health
make status
make down
```

Foreground dev:

```bash
make dev
```

Quality gate:

```bash
make quality   # typecheck + lint + coverage + admin e2e
```

Useful targets: `make help`, `make test`, `make test-e2e`, `make test-e2e-caller` (opt-in live keys).

Default local port: **3010** (override with `PORT` in `.env.local`).

---

## Architecture (short)

```
Caller (HTTP Bearer / MCP)
        │
        ▼
  Next.js + server.ts
        │
  ┌─────┴──────┐
  │ tool core  │  search / details / geocode / navigate / plan_itinerary
  │            │  + MCP discover_places / arrange_day
  └─────┬──────┘
        │
  adapters: AMAP · Google (direct + Worker MCP) · Tripadvisor · Open-Meteo
        │
  Postgres (Prisma) — admin users, caller keys
```

Itinerary modes (`ITINERARY_MODE`):

| Value | Behavior |
|-------|----------|
| `llm` | **Code default** if unset (`?? "llm"`). Single LLM + Zod + fallback. |
| `legacy` | Heuristic planner. Tests that need this path set `ITINERARY_MODE=legacy`. |

---

## Tools

### HTTP (`/v1`)

| Route | Notes |
|-------|--------|
| `GET /v1/health` | Public |
| `POST /v1/search_restaurants` | Bearer |
| `POST /v1/search_places` | Bearer |
| `POST /v1/get_place_details` | Bearer |
| `POST /v1/geocode` | Bearer |
| `POST /v1/navigate` | Bearer |
| `POST /v1/plan_itinerary` | Bearer |
| `POST /v1/discover_places` | Bearer |
| `POST /v1/arrange_day` | Bearer (`execution=host` → prompt handoff; default `agent` → LLM) |
| `POST /v1/enrich_arrange_transit` | Bearer (attach `legs_to_here` / `from_origin` / `to_destination`) |
| `POST /v1/chat` | Bearer (NL loop) |

### MCP (selected)

| Tool | Notes |
|------|--------|
| `search_restaurants` / `search_places` / … | Same core as HTTP |
| `plan_itinerary` | Full itinerary |
| `discover_places` | Candidates + weather (≤8 per type); no city catalog (ADR-042/D9) |
| `arrange_day` | One day from candidates; MCP forces `execution=agent`; `host` returns prompt only (Mode H, Feature 35) |

---

## Environment (names only)

Copy from `.env.example`. Do **not** put real secrets in git.

| Area | Keys (examples) |
|------|-----------------|
| App | `PORT`, `SESSION_SECRET`, `DATABASE_URL`, `PUBLIC_BASE_URL` |
| Vendors | `AMAP_API_KEY`, `GOOGLE_MAPS_API_KEY`, `GMAPS_MCP_*`, `TRIPADVISOR_API_KEY`, `OPEN_METEO_*` |
| LLM | `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_CHAT_MODEL` |
| Mode | `PLACES_VENDOR_MODE`, **`ITINERARY_MODE`** (`llm` \| `legacy`) |
| Mail | `RESEND_*` |

---

## Deploy

Production release steps (Portainer / GHCR / NPM / smoke):  
[`../0.2.release-bot/svr_hk_vps_3/places.family/places-agent-instruction.md`](../0.2.release-bot/svr_hk_vps_3/places.family/places-agent-instruction.md)

Compose env includes `ITINERARY_MODE` (default `llm`). After deploy, smoke **H3c** for `POST /v1/discover_places` and `POST /v1/arrange_day`.

---

## Docs map

| Doc | Purpose |
|-----|---------|
| [`agent-specs/agent-stories.md`](./agent-specs/agent-stories.md) | User stories / AC (incl. F24–31) |
| [`agent-specs/agent-design.md`](./agent-specs/agent-design.md) | Design (§9 prompt + itinerary) |
| [`agent-specs/agent-test-plan.md`](./agent-specs/agent-test-plan.md) | Test matrices (TC-M5, TC-M6…) |
| [`agent-specs/0.refactor-plan.md`](./agent-specs/0.refactor-plan.md) | Batch status (MVP-1…MVP-7 ✅; MVP-8 F34–38 ✅ ADR-040/043 D9) |
| [places-agent-instruction.md](../0.2.release-bot/svr_hk_vps_3/places.family/places-agent-instruction.md) | Production deploy checklist |
