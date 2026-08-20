# places-agent — test strategy

Extends the workspace **common-test-strategy** baseline. This file adds domain fixtures, journeys, and stricter gates. It does **not** drop pyramid layers, skip auth tests, or lower the quality checklist.

| Binding | Location |
| --- | --- |
| Baseline | `common-test-strategy` (always-on rule) |
| Stories & acceptance criteria | [`agent-stories.md`](./agent-stories.md) — each Gherkin scenario maps to automated tests |
| **User test cases (HTTP automated; ChatBox paused)** | §13–§18 below — TC-H01–H15 in `tests/http-tc-h.test.ts`; ChatBox manual deferred |
| Architecture / trust | [`../../workspace-specs/2.architecture.md`](../../workspace-specs/2.architecture.md) |
| HK / TW output | [`../../workspace-specs/knowledge/i18n/hk-tw-output.md`](../../workspace-specs/knowledge/i18n/hk-tw-output.md) |
| Admin E2E practice | Python Playwright, real Chromium, `networkidle` (webapp-testing skill) |

**Status:** active — honesty gates in §1, §1.1 (Vendor live DoD), and §5 bind DoD ([ADR-021](../../workspace-specs/adr/ADR-021-live-vendor-no-fixture.md)). AC/story status uses `live-honest` / `fail-closed` / `fixture-only` — never `implemented` as a substitute for those gates.

---

## 1. Stricter deltas vs common-test-strategy

| Delta | Rule |
| --- | --- |
| Dual access channel | Feature 11: same tool meaning on **HTTP and MCP**. Do not test only one channel and claim the feature done. |
| Agent id | Every HTTP tool/health body and MCP `initialize` must assert `agent` / `serverInfo.name` is exactly `places-agent` (not localized). |
| Two auth modes | Caller API key (HTTP/MCP) and admin session (operator UI) are tested **separately**. An admin cookie must not authorize tools; a caller key must not authorize admin pages. |
| Four locales | Admin chrome and agent display strings: catalogs `EN`, `CN`, `HK`, `TW`. HK vs TW wording must differ on pinned glossary keys (e.g. taxi, `weather.wmo.80`). Fallback is locale → `EN` → key, **never** HK↔TW. Weather tests must not accept English Open-Meteo documentation strings as `CN`/`HK`/`TW` copy. |
| No invented places | Search/details/itinerary tests must not pass if the agent fabricates POIs when vendors return empty or fail. |
| Tripadvisor | Contract tests must prove Google `place_id` is **not** sent to Tripadvisor as an id. |
| Secrets | Map-vendor keys, `GMAPS_MCP_BEARER`, Quanzil, Resend, session secret, and caller-key plaintext (except the one-time copy UI) must not appear in browser storage, MCP/HTTP error bodies, or logs. |
| Default CI | Fixture / sandbox vendors only. Live AMAP / Google / Tripadvisor / Quanzil / Resend / Open-Meteo are **opt-in** jobs. |
| Vendor honesty (ADR-021) | `PLACES_VENDOR_MODE=live` must not return fixture cards, Tripadvisor fixture ratings, or Open-Meteo fixture forecasts. Missing live client → skip/omit, never fixture fall-through. A vendor story is not done until injected-fetch tests **and** an opt-in real-key probe (`verify-amap-live`, `test-live`, …) assert no `fixture_` ids. |

The common quality checklist still applies in full. Extra items are in §11.

### 1.1 Vendor live DoD (binding)

Extends `common-test-strategy` and [ADR-021](../../workspace-specs/adr/ADR-021-live-vendor-no-fixture.md). Does **not** drop pyramid layers or the common quality checklist.

A vendor capability is **done** only when **all** of these are true:

1. Live client is selected when `PLACES_VENDOR_MODE=live`.
2. Default CI uses injected `fetchFn` / recorded HTTP — no live keys on every PR.
3. Honesty test: live + missing or failing client → skip/omit, **zero** fixture cards, Tripadvisor fixture ratings, or Open-Meteo fixture triple (`weather_code: 80` with temps 24/18). WMO `80` alone is real rain showers.
4. Opt-in probe (`make verify-*-live` or `make test-live`) hits the real host and fails if `fixture_` appears (or weather is the canned fixture signature).
5. Operator (or script output attached to the story) has seen a **real pin**, not only `make test`.
6. AC/story status is **`live-honest`**, **`fail-closed`**, or **`fixture-only`** — never **`implemented`** as a substitute for (1)–(5).

**Honesty matrix** (update the status column when a probe last passed):

| Vendor | Live client | Honesty test | Opt-in probe | Status | As of |
| --- | --- | --- | --- | --- | --- |
| AMAP search | yes | live no `fixture_` | `make verify-amap-live` | live-honest | 2026-08-19 |
| Google search | yes | Worker/direct tests | `make test-live` / Google pin | live-honest | 2026-08-19 |
| Tripadvisor enrich | yes | live no fixture rating | `make verify-tripadvisor-live` | live-honest | 2026-08-19 |
| Open-Meteo | yes | live throws unconfigured if client null; HTTP fail omits weather | `make verify-open-meteo-live` | live-honest | 2026-08-19 |

---

## 2. Scope

| In | Out |
| --- | --- |
| places-agent **tools** (HTTP + MCP) | what2eat / where2play screens (those apps’ strategies) |
| Operator **admin web** on the same process | Pixel-perfect visual QA unless an AC asks for a screenshot |
| Admin users, caller API keys, instructions, i18n | Deploy / Portainer / Cloudflare |
| Isolated test DB / volume | Production data |

Two surfaces, one process (ADR-012): start **one** places-agent server for contract and E2E.

---

## 3. Pyramid (this product)

Target mix stays ~70 / 20 / 10.

| Layer | What to put here | Typical tools |
| --- | --- | --- |
| Unit / component (~70%) | Vendor-response parsers, merge/cluster, Tripadvisor name+location match, locale map (`HK`→`zh-HK`), catalog lookup, itinerary pacing math, key hashing | Fast tests in the service language |
| Integration / contract (~20%) | HTTP tool routes, MCP initialize + tools, admin session APIs, Resend sandbox, DB for users/keys | Real test DB; fixture map HTTP |
| E2E (~10%) | Few **admin** journeys in a real browser | Python Playwright + Chromium headless |

Do **not** drive search/itinerary solely through the admin UI. Tools are asserted over HTTP/MCP. The browser covers operator UX (Features 14–19).

---

## 4. Mapping AC → tests (TDD)

1. Pick **one** user story (incremental delivery).
2. For each Gherkin scenario in [`agent-stories.md`](./agent-stories.md):
   - **Red** — write the test that states the Then (keys, `agent: "places-agent"`, empty lists, status codes).
   - **Green** — minimal implementation.
   - **Refactor** — stay green.
3. Name tests `should_[expected]_when_[condition]` (or equivalent).
4. One behavior per test; AAA; order-independent.

Category **agent** scenarios → unit + HTTP/MCP contract (both channels where Feature 11 applies).  
Category **app** scenarios → unit/component where there is logic + **Playwright** for the user-visible path.

---

## 5. Unit and component

Cover at least:

- `providers[]` validation (unknown vendor, missing credentials → skip/reason keys, no silent swap).
- Google transport (ADR-017): covered in [`src/adapters/google/live.test.ts`](../src/adapters/google/live.test.ts) — fixture **direct success** (Worker MCP not called); **direct egress fail → Worker MCP success** with provenance still `GOOGLE_MAPS` (never `GMAPS_MCP` in `sources[]`); **direct fail + MCP unconfigured** → skip, no AMAP fill. Default CI uses mocked fetch + recorded MCP JSON-RPC (no live `GMAPS_MCP_BEARER`). **Manual dev (VPN on):** `GOOGLE_DIRECT_FORCE_FAIL=1` or blackhole `GOOGLE_MAPS_BASE_URL` + live `GMAPS_MCP_*`; run **`scripts/verify-gmaps-fallback.sh`** or TC-H15 curl. **Never** set force-fail in production (`NODE_ENV=production` rejects at startup).
- AMAP live Web 服务: covered in [`src/adapters/amap/direct.test.ts`](../src/adapters/amap/direct.test.ts) — injected `fetchFn` (no live `AMAP_API_KEY` in default CI). Assert `lng,lat` around, `types=050000`, cuisine map (`barbecue` → `烧烤`), address → geocode then around, WGS `near` → coordinate convert, `status != 1` throws, empty `pois` → `[]`, cards `crs=GCJ-02` and no `fixture_` ids. HTTP inject in [`tests/http-tc-h.test.ts`](../tests/http-tc-h.test.ts). **Opt-in live key:** `make verify-amap-live` / [`scripts/verify-amap-live.sh`](../scripts/verify-amap-live.sh).
- Place-card `sources[]` / merge / `primary_provider`.
- Navigate: secret-free deeplinks only.
- Geocode input sanitization.
- Locale: `languageCode` map; catalog miss → `EN` → key; HK taxi ≠ TW taxi fixture.
- Itinerary preference ids (tight/medium/relaxed, premium/budget, `transit_preferred`) without calling a live LLM.
- Caller-key hash/verify; regenerate invalidates the previous secret.
- Vendor honesty (ADR-021): [`tests/vendor-honesty.test.ts`](../tests/vendor-honesty.test.ts) — live mode without `TRIPADVISOR_API_KEY` must not attach fixture ratings; live Open-Meteo without a working client must not return fixture `weather_code: 80`.
- Tripadvisor Terra live enrich: covered in [`src/adapters/tripadvisor/direct.test.ts`](../src/adapters/tripadvisor/direct.test.ts) — injected `fetchFn` (no live Terra key in default CI). Assert nearby `lat`/`lon`/`unit=KM`, no `location_id`, no Google/AMAP native ids on the URL, name match attaches rating, no match leaves card, HTTP fail keeps cards + skip, one nearby call per shared pin. HTTP inject in [`tests/http-tc-h.test.ts`](../tests/http-tc-h.test.ts). **Opt-in live key:** `make verify-tripadvisor-live`.
- Open-Meteo live forecast: covered in [`src/adapters/open-meteo/direct.test.ts`](../src/adapters/open-meteo/direct.test.ts) — injected `fetchFn` (no live Open-Meteo call in default CI). Assert `latitude`/`longitude`/`daily`/`timezone=auto`, date row maps to `weather_code` + temps, HTTP fail throws, missing date returns null. **Opt-in:** `make verify-open-meteo-live`.
- Timed itinerary (`detail: "timed"`): [`tests/itinerary-timed.test.ts`](../tests/itinerary-timed.test.ts), [`tests/meal-windows.test.ts`](../tests/meal-windows.test.ts), [`tests/place-filters.test.ts`](../tests/place-filters.test.ts), [`src/core/itinerary-weather.test.ts`](../src/core/itinerary-weather.test.ts) — 1-based `day_index`, city `search_anchor`, plaza/landmark filters, dinner 18:00–20:00 + cafe filler, meal dedupe, AMAP-first on CN, Chinese assembled queries when locale is CN/HK/TW or names have CJK, corridor pins when origin+destination span multiple days, drop legs `> 300` min. Default CI does not call live Google. **Operator UAT:** HTTP pack in §16 (T01–T07, D01/D01a, G01, F02, A01, M03–M05, P01).

**Timed UAT process env:** for live Directions, start the agent with `GOOGLE_DIRECT_FORCE_FAIL=0` **in the process environment** (`make down` then `GOOGLE_DIRECT_FORCE_FAIL=0 make up`). An already-exported `=1` is not overridden by `.env.local`. Do not wrap the full UAT pack in `scripts/with_server.py` — it stops the server on exit.

**Mocks allowed:** clock, randomness, paid/irreversible third parties (Resend, live maps, Quanzil) when no sandbox is configured.  
**Not allowed:** shipping a feature that only works against in-process fake success payloads for search/details. Fixture-passing tests do **not** complete a live vendor (ADR-021).

---

## 6. Integration / contract

### 6.1 HTTP tools

- **TC-H traceability:** one automated test per case in [`tests/http-tc-h.test.ts`](../tests/http-tc-h.test.ts) (calls real `/v1/*` route handlers; fixture mode in default CI).
- Authenticated caller key required (Feature 12). Missing/invalid/revoked → keyed error (`errors.caller_unauthorized`), no tool result.
- JSON `agent` is `places-agent` on health/ready and tool responses.
- Happy path + empty + provider-failed (reason key `errors.provider_failed`).
- Isolated test data; reset between tests.

### 6.2 MCP

- Same tool names, inputs, and outcome keys as HTTP (Feature 11).
- `initialize` → `serverInfo.name === "places-agent"`.
- Caller API key on the MCP transport; reject without it.

### 6.3 Admin APIs (same origin)

- Session cookie required after login; public home and instructions stay reachable without a session.
- Invite / reset go through Resend **sandbox** or captured test transport in default CI.
- Caller-key create/regenerate returns plaintext **once**; subsequent GET must not return it.
- Map-vendor env keys never in admin JSON.

### 6.4 Vendors in default CI

Use recorded or sandbox HTTP for AMAP / Google / Tripadvisor / Open-Meteo (approved fixtures). AMAP, Tripadvisor, and Open-Meteo live unit tests inject `fetchFn`; they must not call `restapi.amap.com`, `terra.tripadvisor.com`, or `api.open-meteo.com` in default CI. Live keys/hosts only in an explicit opt-in job (`make test-live`, `make verify-amap-live`, `make verify-tripadvisor-live`, `make verify-open-meteo-live`), never on every PR.

Google Worker MCP tests use a **fixture MCP** (or recorded Streamable HTTP). Default CI must not require a live `GMAPS_MCP_BEARER`. Do not treat the Worker as a fourth vendor in assertions.

---

## 7. E2E — operator web (Playwright)

Admin UI is a **dynamic** app. Start the real places-agent process, then automate.

**Harness (webapp-testing):**

1. Run `python scripts/with_server.py --help` before inventing a runner.
2. One server: the places-agent process (admin HTML + APIs + HTTP tools).
3. Scripts use `playwright.sync_api`, **Chromium `headless=True`**, then `page.goto` + **`wait_for_load_state("networkidle")`** (or an explicit role/test id) before inspect/assert.
4. No hardcoded sleeps as the primary wait.
5. Close the browser when the script ends.

**Selectors:** `get_by_role`, accessible name, or `data-testid`. Prefer **i18n keys / test ids** over English copy. If asserting visible text, set locale first and use that catalog.

**Critical journeys (minimum):**

| Journey | Covers |
| --- | --- |
| Public home → instructions | Features 14, 18; page states agent id `places-agent` |
| Login default admin → landing (nav + greeting) | Features 15, 16 |
| Failed login / register disabled | Feature 15 failure path; contact-admin WeChat QR on hover |
| Invite accept → sign in → landing | Feature 15 US4 — token → profile form → success → login with new username; **no credentials in URL after submit** |
| Create caller API key, copy secret, then HTTP call with that key | Features 17 + 12 |
| Switch locale `EN` → `HK` (smoke) | Feature 19 |

**Viewports:** desktop and one mobile width for changed admin screens. Keyboard: login and primary actions reachable; Escape closes dialogs if any.

**Reconnaissance:** if selectors are unknown, screenshot + DOM inspect **after** `networkidle`, then lock stable selectors into the test — do not keep layout-brittle CSS.

Consumer place-search is **not** an admin E2E path. **HTTP** user cases are automated in [`tests/http-tc-h.test.ts`](../tests/http-tc-h.test.ts) (`make test`). **ChatBox MCP** manual cases in §15 are **paused/deferred** for release when the HTTP equivalent is green in CI.

### 7.1 E2E — caller simulation (HTTP API)

Beyond admin UI E2E, the agent must be tested from the **caller perspective** — simulating real usage by what2eat, where2play, and chatbox clients.

**Principles:**
- **No fixtures in E2E** — caller simulation tests run against live (or sandbox) vendors, never fixture mode
- **No hardcoded expected results** — validate structure, field presence, and geographic accuracy, not exact venue names
- **Randomized inputs** — use a pool of real-world addresses and queries to avoid overfitting to fixture data

**Harness:**

1. Start places-agent with `PLACES_VENDOR_MODE=live` (or sandbox when available)
2. Create a caller API key via admin API
3. Execute HTTP requests against `/v1/*` endpoints with Bearer auth
4. Validate response structure, geographic accuracy, and field completeness

**Caller profiles:**

| Caller | Endpoint | Typical input | Validation |
| --- | --- | --- | --- |
| what2eat (food) | `POST /v1/search_restaurants` | Chinese address + cuisine + budget | Results within 5km of input location; `photos` present when provider supports; rating is numeric |
| where2play (place) | `POST /v1/search_places` | City + activity type | Results in correct city; `sources[]` non-empty |
| chatbox (NL) | `POST /v1/chat` | Free-text question in CN/EN | Response locale matches request; no fabricated venues |
| any caller | `POST /v1/plan_itinerary` | City + dates + pace | Day count matches date range; meals in correct time slots; no duplicate venues |

**Geographic accuracy gate:**
- Search results for a Chinese address must return venues within China (lat 18–54°N, lng 73–135°E)
- Search results for a non-Chinese address must not return Chinese venues (unless the address is near the border)
- `provider` field must match the actual data source

**Field completeness gate:**
- `name`, `address`, `location`, `provider`, `sources[]` — always present
- `photos` — present when the provider supports it (Google with field mask, AMAP with biz_ext)
- `rating` — present when the provider returns it

**Test cases:** §19 below (TC-E2E-01 through TC-E2E-08).

**CI integration:** opt-in gate `make test-e2e-caller` — requires live vendor keys. Not in default PR CI.

---

## 8. i18n and HK vs TW

- Tests assert **keys** (and interpolated data such as user name), not an English-only contract.
- At least one path resolves catalogs for default `EN`.
- HK vs TW: fixture that pinned travel terms differ; missing HK key does not resolve to TW.
- Protocol ids (`places-agent`, `AMAP`, `GOOGLE_MAPS`, …) stay literal.
- Agent Feature 13: HTTP/MCP tests pass `locale` / bilingual pair; vendor fixtures honor `languageCode` without rewriting official names.

---

## 9. CI and commands

| Gate | When | Contents |
| --- | --- | --- |
| Default PR / push | Always | Unit + contract (fixture vendors) + **TC-H01–H15** in `http-tc-h.test.ts` + admin Playwright critical journeys |
| `make test-live` | Opt-in | `scripts/verify-gmaps-fallback.sh` (TC-H15 live Worker MCP); real map/Quanzil/Resend sandboxes or live keys; non-destructive |
| `make verify-amap-live` | Opt-in | `scripts/verify-amap-live.sh` — live AMAP search (`query=烧烤` + station address); asserts `AMAP` and no `fixture_` ids |
| `make verify-tripadvisor-live` | Opt-in | `scripts/verify-tripadvisor-live.sh` — sidecar with `GOOGLE_DIRECT_FORCE_FAIL=0` (does not reuse a Worker-only daemon); live Terra enrich on HK pin; asserts numeric `tripadvisor.rating` and no fixture Ichiran URL |
| `make verify-open-meteo-live` | Opt-in | `scripts/verify-open-meteo-live.sh` — live forecast on HK pin itinerary; asserts numeric `weather_code` 0–99 and not the fixture signature (80 + 24/18 °C) |
| Operator UAT timed itinerary | Per story A/B/C | HTTP `POST /v1/plan_itinerary` with `detail:"timed"`; operator supplies origin/bounds; agent dumps JSON; operator judges. Story A pack: Hyatt Lisbon, `2026-08-25`→`2026-08-30`, relaxed/premium, `GOOGLE_MAPS` |
| `make test-e2e-caller` | Opt-in | TC-E2E-01~08 in `scripts/test-e2e-caller.sh` — live vendor caller simulation; Chinese restaurant, auto-provider, Tokyo POI, 成都 itinerary, chat, photos, mixed-lang, meal context |
| Coverage | When the stack can measure | Critical path **100%**; overall **≥ 80%** |

### Coverage measurement (Vitest v8)

`make test-coverage` runs `npx vitest run --coverage`. Include is `src/**/*.{ts,tsx}`.

**Overall gate:** statements, lines, functions, and branches **≥ 80%**.

**Exclude from coverage (listed, not silent):**

| Path | Why |
| --- | --- |
| `**/*.test.ts(x)` | Tests |
| `src/adapters/**/fixture.ts`, `src/adapters/fixtures.ts` | Fixture vendors; default CI honesty is tested via live/honesty tests, not fixture-file line coverage |
| `src/ui/**` | Admin UI; critical journeys are Playwright (`make test-e2e`) |
| `app/**` | Not in `include` (lives outside `src/`); same as admin UI |
| `src/adapters/google/mcp-client.ts` | Worker MCP client; default CI uses injected doubles; live probe is `make test-live` |
| `src/adapters/**/config.ts`, `src/adapters/**/live.ts` | Env loaders / adapter wiring |
| `src/auth/admin.ts`, `src/auth/session.ts`, `src/auth/mail.ts` | Next cookies / Resend; covered by admin E2E and auth unit tests on neighboring modules |
| `src/agent/loop.ts` | NL chat loop; HTTP chat contract in Vitest; LLM fixture in default CI |
| `scripts/run-tc-c07.ts`, `scripts/run-tc-c08.ts` | Not in Vitest; ChatBox TC-C deferred |

**Core-file floors** (glob thresholds in `vitest.config.ts`): `place-filters.ts` 100% all metrics; `amap/direct.ts` 100% lines; `itinerary.ts` / `itinerary-timed.ts` / `tools.ts` ≥90% lines (branch floors 75–80% where exhaustive branch 100% is not yet practical).

Agent core is Vitest coverage. Admin UI is Playwright.

### Default quality gate

```
make quality
```

equals `make typecheck && make lint && make test-coverage && make test-e2e`.

| Command | Role |
| --- | --- |
| `make test` | Fast fixture Vitest only (no browser, no coverage) |
| `make lint` | `npx eslint .` (Babel parser + Next core-web-vitals; **not** `tsc`) |
| `make typecheck` | `npx tsc --noEmit` |
| `make test-coverage` | Vitest + thresholds |
| `make test-e2e` | Admin Playwright via `scripts/with_server.py` (independent port; `NEXT_DIST_DIR=.next-e2e` so it does not collide with a running `make up`; `QUANZIL_MODE=fixture` for chat smoke) |

Type-aware `eslint-config-next/typescript` is **not** used: `typescript-eslint` does not support TypeScript 7. Syntax lint uses `@babel/eslint-parser` + `@babel/preset-typescript`. Do not pin TypeScript down to 5.x to make that plugin work ([ADR-024](../../workspace-specs/adr/ADR-024-quality-gates-typescript-7.md)).

Wire `make test` (and `make lint` / typecheck when they exist) to the real commands. Failures block merge. Do not skip tests for tools, auth, or admin mutations.

---

## 10. Feature × layer (where the proof lives)

| # | Code | Unit | HTTP/MCP contract | Admin Playwright |
| --- | --- | --- | --- | --- |
| 1–5 | search / details / navigate / geocode | parsers, empty, fail | both channels | — |
| 6–8 | vendors / sources / Tripadvisor | no silent swap; Google direct→Worker MCP; no `place_id` passthrough | both channels | — |
| 9–10 | itinerary / NL chat | pacing, truncation | HTTP/MCP; LLM fixture in default CI | — |
| 11–13 | dual channel, caller key, locales | locale map | identity `places-agent`; auth; locale | — |
| 14–16 | home, users, landing | — | session APIs; accept-invite POST | required |
| 17 | caller API keys | hash/rotate | admin API + tool call with new key | required (copy once) |
| 18 | instructions | — | — | required (id `places-agent`) |
| 19 | admin i18n | catalog fallback | — | locale switch smoke |

---

## 11. Quality checklist (extras)

Meet **all applicable** common-test-strategy items, plus:

- [ ] Invite accept journey covered by Playwright (Feature 15 US4); URL must not contain password fields after submit
- [ ] HTTP and MCP both covered for any new tool behavior (or an explicit AC that the story is HTTP-only — none today)
- [ ] `places-agent` asserted on MCP initialize and HTTP `agent`
- [ ] Admin session cannot call map tools; caller key cannot open admin landing
- [ ] HK and TW catalogs are not the same file; no OpenCC in tests as a substitute
- [ ] No map-vendor key in Playwright traces, screenshots of admin, or HAR
- [ ] Default CI did not require live vendor keys
- [ ] Live mode + injected or real client: `sources[].native_id` does not start with `fixture_`
- [ ] Live mode + missing live client: skip/omit, **zero** fixture payloads (cards, Tripadvisor ratings, `weather_code: 80`)
- [ ] Opt-in `make verify-*-live` / `make test-live` hits the real host and fails if `fixture_` appears
- [ ] AC status is `live-honest` / `fail-closed` / `fixture-only` — not `implemented` in place of the honesty matrix
- [ ] No hardcoded fixture data in E2E tests — validate structure and geography, not exact venue names
- [ ] Caller simulation covers all three caller profiles (food, place, chatbox) with randomized inputs
- [ ] Search results for Chinese addresses return venues within China coordinates (lat 18–54°N, lng 73–135°E)
- [ ] `photos` field populated when provider supports it; omitted (not empty array) otherwise
- [ ] No hardcoded Chinese keywords in English-locale query strings
- [ ] No mixed-language search queries (e.g., `"cafe tea house"` + `"咖啡馆"` in one query)
- [ ] `make test-e2e-caller` passes with live keys before release (opt-in, not in default CI)

---

## 12. Failure handling

Fix production code or a wrong test. Do not delete or skip a failing AC test to go green. Do not lower coverage or drop Playwright journeys to pass CI.

---

## 13. Test setup (manual QA and HTTP)

Cases marked **★** in the title are required before a release sign-off. All other cases are recommended.

**ChatBox manual QA is paused** for release sign-off when an HTTP equivalent exists. Run **`make test`** for automated **TC-H01–H15** coverage via [`tests/http-tc-h.test.ts`](../tests/http-tc-h.test.ts). Opt-in live Worker fallback: **`make test-live`** (TC-H15 against real `GMAPS_MCP_*`).

### 13.1 Caller key

Admin → Keys → issue key → copy `pa_…` once.

### 13.2 ChatBox

| Field | Value |
| --- | --- |
| Type | Remote (HTTP/SSE) |
| URL (prod) | `https://places.agent-mate.ai/sse` |
| URL (local) | `http://localhost:3010/sse` (or your `PORT` from `.env.local`) |
| Header | `Authorization=Bearer <caller_api_key>` |

Use **`/sse`**, not `/mcp`. Turn on **MCP tools** for the chat. The chat model is ChatBox's (Qwen, GPT, etc.), not places-agent's.

Name the ChatBox MCP connection **`places-agent`**. Do **not** also connect the Google Maps Worker (`GMAPS_MCP_*` / `maps-mcp.*`) or another generic search MCP in the same chat — the host model will pick those instead of `search_restaurants`. For a restaurant ask, prompt with the tool name, e.g. `用 places-agent search_restaurants 找上海紫藤路烧烤`.

After changing server code locally, restart the dev server and reconnect ChatBox so tool schemas refresh.

### 13.3 HTTP (curl / BFF / Postman)

```bash
export CALLER_KEY='pa_…'
curl -s -H "Authorization: Bearer $CALLER_KEY" \
  -H "Content-Type: application/json" \
  -d '<json body>' \
  http://localhost:3010/v1/<endpoint>
```

Prod: `https://places.agent-mate.ai/v1/<endpoint>`

Issue a dev key (optional):

```bash
npx tsx --env-file=.env.local scripts/issue-caller-key.ts my-label
# → JSON with "secret": "pa_…" — use that value as CALLER_KEY
export CALLER_KEY='pa_…'
```

Keep the server running: `make dev` (foreground) or `make up` + `make status`. After lock/ENOENT errors: `make reset-dev` then `make dev`.

### 13.4 Vendor mode

| Mode | When |
| --- | --- |
| **fixture** | Local dev (`PLACES_VENDOR_MODE=fixture`) — sample HK + Shanghai data, no live vendor keys |
| **live** | Staging / prod — real AMAP / Google / Tripadvisor |

**Timed Directions (operator UAT):** `make down`, then `GOOGLE_DIRECT_FORCE_FAIL=0 make up` (or `make dev`) so Google Directions is not forced off. A shell that already exported `GOOGLE_DIRECT_FORCE_FAIL=1` wins over `.env.local`. Do **not** wrap the full timed UAT pack in `scripts/with_server.py` — that helper stops the server when the wrapped command exits.

### 13.5 How to inspect MCP tools in ChatBox

After the model replies, the assistant message includes **tool call blocks** (e.g. `mcp__geocode`, `mcp__search_restaurants` with a green checkmark when done). Use those to verify pass criteria — not the summary text alone.

**Steps**

1. Send your test prompt and wait until the reply finishes (tool blocks show completed / checkmark).
2. In the assistant turn, find a tool line such as `mcp__search_restaurants` (with checkmark).
3. **Click that line** to expand the tool panel.
4. ChatBox shows two tabs/sections (labels may vary slightly by version):

| ChatBox label | What it is | What to check |
| --- | --- | --- |
| **Arguments** | JSON the model sent to the tool | e.g. `"providers": ["GOOGLE_MAPS","AMAP"]`, `"merge": true`, `"near": { "lat": …, "lng": … }` |
| **Result** | JSON returned by places-agent | `"isError": false`; inside `content[0].text` parse the envelope: `agent`, `ok`, `data`, `skipped` |

5. For multi-step flows (geocode → search), expand **each** tool block in order.

**If you do not see tool blocks**

- Confirm **MCP tools** are enabled for this chat.
- Confirm the MCP server connected (Settings → MCP → Test).
- Start a **new chat** after reconnecting MCP.

**Output envelope fields** (inside **Result** → `content[0].text`, often a JSON string)

| Field | Meaning |
| --- | --- |
| `agent` | Must be `"places-agent"` |
| `ok` | `true` when the tool succeeded |
| `data` | Place cards, geocode result, itinerary, etc. |
| `skipped[]` | Vendor skipped with `provider` + `reason_key` |
| `outcomeKey` / top-level error | e.g. `errors.empty_results`, `errors.caller_unauthorized` |

**Example (TC-C05 pass):** expand `mcp__search_restaurants` → **Arguments** shows `"providers":["GOOGLE_MAPS","AMAP"]` and `"merge":true` → **Result** shows `"isError": false` and **`data` count 3** in fixture (Yat Lok, Tim Ho Wan, 太興燒味). No `errors.capability_unsupported` for Google/AMAP in `skipped`.

**How to get the full Result text (when the box is truncated)**

The **Result** panel often shows only the start of a long JSON string (`"data":[{…` cut off). Use one of these:

1. **Scroll inside Result** — click inside the Result code box, then scroll down (trackpad / mouse wheel). The full JSON is usually there; the panel just has a fixed height.
2. **Select all and copy** — click inside the Result box → `Cmd+A` (Mac) or `Ctrl+A` (Windows) → `Cmd+C` / `Ctrl+C` → paste into VS Code or a text editor. Search for `"provider"` or `"name"` to count cards.
3. **Copy icon** — if ChatBox shows a copy button on the tool panel header or beside Result, use it, then paste elsewhere.
4. **Parse the inner envelope** — Result shape is:
   ```json
   { "isError": false, "content": [ { "type": "text", "text": "{ \"agent\": \"places-agent\", \"ok\": true, \"data\": [ … ] }" } ] }
   ```
   The places-agent payload is the **string** in `content[0].text`. After copy, find `"text":` and parse that inner JSON (or search within it for `"Yat Lok"` / `"Tim Ho Wan"` / `太興燒味`).

**Alternative without ChatBox UI:** run the same body via HTTP (TC-H04) in Terminal — full JSON prints to stdout:

```bash
curl -s -H "Authorization: Bearer $CALLER_KEY" -H "Content-Type: application/json" \
  -d '{"query":"restaurant","near":{"lat":22.2819,"lng":114.158},"providers":["GOOGLE_MAPS","AMAP"],"merge":true,"locale":"EN"}' \
  http://localhost:3010/v1/search_restaurants | python3 -m json.tool
```

---

## 14. Map vendors (`providers[]` and enrich)

places-agent talks to **map vendors** on the server. Callers choose vendors per request.

| Vendor id (exact) | Display name | Search / geocode / details / navigate? | How to request |
| --- | --- | --- | --- |
| **`GOOGLE_MAPS`** | Google Maps | Yes | `"providers": ["GOOGLE_MAPS"]` |
| **`AMAP`** | Gaode / 高德 | Yes (GCJ-02 in mainland) | `"providers": ["AMAP"]` |
| **`TRIPADVISOR`** | Tripadvisor | **No** — enrich only | `"enrich": { "tripadvisor": true }` on **HTTP search only** |

**If you omit `providers`**, the server defaults to **`GOOGLE_MAPS` only**.

### 14.1 ChatBox: use exact ids in prompts

ChatBox models often write **`Google Maps`** in tool args. The server expects **`GOOGLE_MAPS`**. When a case needs a specific vendor, **spell the id in your prompt**:

| Good (id in prompt) | Risky (display name only) |
| --- | --- |
| `providers GOOGLE_MAPS and AMAP` | `using Google Maps and AMAP` |
| `Use AMAP only` | `Use Gaode only` (may work if server normalizes) |
| `provider GOOGLE_MAPS` | `Google Maps only` |

If `skipped[]` shows `errors.capability_unsupported` for Google or AMAP, open tool JSON and check whether `providers` used display names. Retry with ids from the table above.

### 14.2 How to set vendors by channel

| Channel | How |
| --- | --- |
| **ChatBox** | Put vendor **ids** in the prompt (§14.1). Model passes them in tool args. |
| **HTTP** | `"providers": ["GOOGLE_MAPS"]` or `["AMAP"]` in the POST body |
| **Tripadvisor ratings** | HTTP only: `"enrich": { "tripadvisor": true }` — not in ChatBox MCP today |

**Google Maps Cloudflare Worker MCP** (ADR-017): **internal transport** inside places-agent — **not** a second ChatBox MCP and **not** a `providers[]` id. When the caller requests `GOOGLE_MAPS`, the server tries direct `maps.googleapis.com` first; on **egress failure only**, it calls the Cloudflare Worker (`GMAPS_MCP_URL` + `GMAPS_MCP_BEARER` on the **server**). Callers still use places-agent `/sse` or HTTP only; provenance stays `GOOGLE_MAPS`. Manual fallback check: **TC-C07** (MCP) / **TC-H15** (HTTP). Automated coverage: §5.

### 14.3 HTTP-only surfaces

| Endpoint | Purpose |
| --- | --- |
| `GET /v1/health` | Liveness + tool list |
| `POST /v1/chat` | Server-side NL loop (Quanzil) — not the same as ChatBox + MCP |
| `enrich.tripadvisor` on search | Tripadvisor ratings on cards |

### 14.4 Common outcomes (troubleshooting)

| Symptom | Likely cause | What to do |
| --- | --- | --- |
| `errors.capability_unsupported` for `Google Maps` | Display name in `providers[]`, not `GOOGLE_MAPS` | Retry with id in prompt (§14.1) |
| `errors.capability_unsupported` for `TRIPADVISOR` on search | Tripadvisor is enrich-only | Expected for TC-C10; use TC-H05 for ratings |
| `errors.provider_unconfigured` | Live mode, vendor key missing on server | Configure key or use fixture mode locally |
| `errors.empty_results` after geocode | Query too specific for fixture data, or no `near` coords | Use TC-C03-style query (`ramen`, `goose`) or ensure search includes `near` from geocode |
| Geocode works, search always empty | Wrong server URL, stale MCP connection, or prod not deployed | Confirm `/v1/health`, restart local server, reconnect ChatBox |

### 14.5 Global pass criteria

- Tool / HTTP JSON includes `"agent": "places-agent"`.
- Answers grounded in tool data — **no invented places** when empty or failed.
- Failures use outcome **keys** (`errors.*`), not stack traces.
- No map-vendor keys, caller `pa_` secret, or `key=` in deeplinks.

---

## 15. ChatBox test cases

**Pre-condition (all §15 cases):** ChatBox MCP configured per §13.2, MCP tools enabled, valid caller key.

---

### TC-C01 — Connect & tool catalog ★

| | |
| --- | --- |
| **Pre-condition** | Valid caller key. MCP server not connected, or re-testing after config change. |
| **Test steps** | 1. ChatBox → Settings → MCP → add server (URL `/sse`, Bearer header). 2. Save and connect / Test. 3. Open the tool list for `places-agent`. |
| **Expected result** | Connection succeeds. Exactly six tools: `search_restaurants`, `search_places`, `get_place_details`, `geocode`, `navigate`, `plan_itinerary`. |

---

### TC-C02 — Invalid caller key ★

| | |
| --- | --- |
| **Pre-condition** | None. |
| **Test steps** | 1. Set MCP header to `Authorization=Bearer pa_invalid`. 2. Connect or send: `Find ramen near Tsim Sha Tsui` |
| **Expected result** | `errors.caller_unauthorized`. No place results. |

---

### TC-C03 — Restaurant search (default Google) ★

| | |
| --- | --- |
| **Pre-condition** | MCP connected. Do **not** name a vendor (defaults to `GOOGLE_MAPS`). |
| **Test steps** | 1. New chat, MCP tools on. 2. Send exactly: `Find ramen near Tsim Sha Tsui` |
| **Expected result** | `search_restaurants` (optional `geocode` first OK). ≥1 restaurant with name + coordinates. Assistant names match tool `data`. |

---

### TC-C04 — Restaurant search (AMAP only) ★

| | |
| --- | --- |
| **Pre-condition** | MCP connected. AMAP available (always in fixture mode). |
| **Test steps** | 1. New chat, MCP tools on. 2. Send exactly: `Use provider AMAP only. Find 烧味 near Central Hong Kong.` |
| **Expected result** | `search_restaurants` with `providers: ["AMAP"]`. Cards have `sources[].provider` = `AMAP`. Coordinates CRS `GCJ-02`. |

---

### TC-C05 — Restaurant search (Google + AMAP, merge)

| | |
| --- | --- |
| **Pre-condition** | MCP connected. Fixture mode (local) or live with both vendors configured. |
| **Test steps** | 1. New chat, MCP tools on. 2. Send: `Find restaurants near Central Hong Kong. Geocode first, then search with providers GOOGLE_MAPS and AMAP, merge true, query restaurant.` 3. Per §13.5, expand `mcp__search_restaurants` → **Arguments** / **Result**. |
| **Expected result** | Geocode ~22.28°N, ~114.16°E. Search with `merge: true`. **3 cards** in fixture mode: Yat Lok Roast Goose, Tim Ho Wan (GOOGLE_MAPS), 太興燒味 (AMAP). No `errors.capability_unsupported` for Google/AMAP. HTTP equivalent: **TC-H04**. |

---

### TC-C06 — Step 2A: Restaurant search (GOOGLE_MAPS only, MCP) ★

| | |
| --- | --- |
| **Pre-condition** | MCP connected (places-agent `/sse`). Same server/mode as **TC-C05**. |
| **Test steps** | 1. New chat, MCP tools on. 2. Send: `Find restaurants near Central Hong Kong. Geocode first, then search with provider GOOGLE_MAPS only, query restaurant.` 3. Per §13.5, expand `mcp__search_restaurants` → **Arguments** / **Result**. |
| **Expected result** | Geocode ~22.28°N, ~114.16°E. **Arguments** `providers: ["GOOGLE_MAPS"]` only (no AMAP). **2 cards** in fixture (Yat Lok Roast Goose, Tim Ho Wan). HTTP equivalent: **TC-H14**. |

---

### TC-C07 — Step 2B: GOOGLE_MAPS via Worker MCP fallback (ADR-017) ★

| | |
| --- | --- |
| **Pre-condition** | **Live** mode (`PLACES_VENDOR_MODE=live`); server env has `GMAPS_MCP_URL` + `GMAPS_MCP_BEARER`. Same ChatBox MCP as §13.2 (`/sse` + caller key). **Not** local fixture. **Do not** add the Worker as a separate ChatBox MCP server. **Network (pick one):** (A) **China mainland** — `maps.googleapis.com` unreachable from places-agent; or (B) **Dev-equivalent (VPN on)** — `GOOGLE_DIRECT_FORCE_FAIL=1` or `GOOGLE_MAPS_BASE_URL=http://127.0.0.1:9` in `.env.local` to simulate egress failure while Worker MCP stays reachable. |
| **Test steps** | 1. MCP connected to places-agent. 2. Send same as **TC-C06**: `Find restaurants near Central Hong Kong. Geocode first, then search with provider GOOGLE_MAPS only, query restaurant.` 3. Per §13.5, expand `mcp__search_restaurants` → **Arguments** / **Result**. 4. Compare to **TC-C06** (fixture/direct path) and **TC-H15** (HTTP same scenario). |
| **Expected result** | Still **`mcp__search_restaurants`** and `"agent":"places-agent"`. **Arguments** `providers: ["GOOGLE_MAPS"]` only. **`sources[].provider`** = `GOOGLE_MAPS` only — never `GMAPS_MCP`, never silent AMAP. **Live** Google cards (no `native_id` prefix `fixture_`). ≥1 restaurant near Central. If both direct and Worker fail → `skipped[]` with reason key; no invented places. **Local fixture sign-off:** TC-C07 is **N/A**; use automated tests (§5) or **`scripts/verify-gmaps-fallback.sh`** with `GOOGLE_DIRECT_FORCE_FAIL=1` (VPN on). |

**TC-C06 vs TC-C07**

| | TC-C06 (Step 2A) | TC-C07 (Step 2B) |
| --- | --- | --- |
| Mode | Fixture or live (direct Google OK) | **Live** + direct Google **fails** (mainland or dev force-fail) |
| Network | VPN or HK/overseas egress OK | Mainland block **or** `GOOGLE_DIRECT_FORCE_FAIL=1` (VPN on) |
| Transport | Direct REST or fixture | Worker MCP fallback (server-internal) |
| ChatBox MCP | places-agent `/sse` | Same places-agent `/sse` |
| Tool | `search_restaurants` | Same `search_restaurants` |
| `native_id` | `fixture_*` in fixture mode | Live Google ids |

---

### TC-C08 — Restaurant search (Shanghai 日料) ★

| | |
| --- | --- |
| **Pre-condition** | MCP connected. Fixture or live with mainland coverage. |
| **Test steps** | 1. New chat, MCP tools on. 2. Send exactly: `找上海爱琴海附近的日料店` |
| **Expected result** | `geocode` then `search_restaurants` with `near`. Latitude ~31°N, longitude ~121°E (Shanghai, **not** Hong Kong). ≥1 Japanese restaurant; addresses mention 上海 / 爱琴海 / Minhang. |

---

### TC-C09 — Restaurant search (empty results)

| | |
| --- | --- |
| **Pre-condition** | MCP connected. |
| **Test steps** | 1. New chat, MCP tools on. 2. Send exactly: `Restaurants named xyznonexistent999 near Central Hong Kong` |
| **Expected result** | Empty `data`; `errors.empty_results`. Assistant does **not** invent venues. |

---

### TC-C10 — Tripadvisor as search provider (unsupported)

| | |
| --- | --- |
| **Pre-condition** | MCP connected. |
| **Test steps** | 1. New chat, MCP tools on. 2. Send exactly: `Search restaurants with providers ["TRIPADVISOR"] only` |
| **Expected result** | `skipped[]` includes TRIPADVISOR + `errors.capability_unsupported`. For Tripadvisor **ratings**, use **TC-H05** (`enrich.tripadvisor`). |

---

### TC-C11 — Place search (POI)

| | |
| --- | --- |
| **Pre-condition** | MCP connected. |
| **Test steps** | 1. New chat, MCP tools on. 2. Send exactly: `Museums near Tsim Sha Tsui` |
| **Expected result** | `search_places`. ≥1 museum/POI; not dining-dominated. Name + coordinates on each card. |

---

### TC-C12 — Geocode (Shanghai and Hong Kong)

| | |
| --- | --- |
| **Pre-condition** | MCP connected. |
| **Test steps** | 1. Send exactly: `What are the coordinates of 上海爱琴海购物公园?` 2. Send exactly: `What are the coordinates of Tsim Sha Tsui Star Ferry Pier?` |
| **Expected result** | Each triggers `geocode`. Shanghai ~31°N, ~121°E. Hong Kong ~22.3°N, ~114.17°E. |

---

### TC-C13 — Place details (after search)

| | |
| --- | --- |
| **Pre-condition** | MCP connected. Same chat thread. |
| **Test steps** | 1. Send exactly: `Find ramen in Central Hong Kong` 2. Send exactly: `Tell me more about the first restaurant — rating and details` |
| **Expected result** | `search_restaurants` then `get_place_details` with `provider` + `native_id` from first card. Details match searched place; `sources[]` present. |

---

### TC-C14 — Navigate (map links)

| | |
| --- | --- |
| **Pre-condition** | MCP connected. |
| **Test steps** | 1. Send exactly: `Find a roast goose restaurant in Central Hong Kong, then give me map deeplinks to open it in GOOGLE_MAPS and AMAP` |
| **Expected result** | `search_restaurants` then `navigate`. Deeplinks such as `google_web`, `google_app`, and/or `amap_web`. No `key=` or API secrets in URLs. |

---

### TC-C15 — Itinerary (happy path) ★

| | |
| --- | --- |
| **Pre-condition** | MCP connected. |
| **Test steps** | 1. Send exactly: `Plan a 2-day Tokyo trip from March 10 to March 12, 2026. Include Ueno museum and nearby attractions. Medium pace.` |
| **Expected result** | `search_places` then `plan_itinerary`. `days[]` with stops from search. Weather as localized `weather.wmo.*` labels. No claim that the trip was saved in where2play. |

---

### TC-C16 — Itinerary (invalid dates)

| | |
| --- | --- |
| **Pre-condition** | MCP connected. |
| **Test steps** | 1. Send exactly: `Plan a trip from March 10, 2026 to March 5, 2026 visiting Tokyo museums` |
| **Expected result** | `errors.bounds_invalid`. No fake successful itinerary. |

---

### TC-C17 — Multi-turn search → details → navigate ★

| | |
| --- | --- |
| **Pre-condition** | MCP connected. Same chat thread. |
| **Test steps** | 1. Send exactly: `Ramen near TST` 2. Send exactly: `Tell me more about the first one` 3. Send exactly: `Open it in Google Maps` |
| **Expected result** | `search_restaurants` → `get_place_details` → `navigate`. Same restaurant name throughout. |

---

### TC-C18 — Locale (Chinese empty message)

| | |
| --- | --- |
| **Pre-condition** | MCP connected. ChatBox UI language **CN** (简体中文). |
| **Test steps** | 1. Send exactly: `Restaurants named xyznonexistent999 near Central Hong Kong` |
| **Expected result** | Same as TC-C09 (`errors.empty_results`). User-visible text in Chinese from message catalog. |

---

### TC-C19 — No secrets in chat ★

| | |
| --- | --- |
| **Pre-condition** | TC-C17 completed in same session. |
| **Test steps** | 1. Expand tool blocks per §13.5 and read the assistant reply for the TC-C17 thread. |
| **Expected result** | No `pa_…` key, no vendor API keys, no stack traces in user-visible text. |

---

## 16. HTTP API test cases

**Pre-condition (all §16 except TC-H01):** Valid caller key in `Authorization: Bearer` header.

### 16.0 Comparison runs — Central HK `restaurant` search

Use the same coordinates as Step 1 (`22.2819`, `114.158` after geocode). Compare **Result / response `data` count** — not assistant prose alone.

| Step | Channel | Case | `providers` | `merge` | Fixture `data` count |
| --- | --- | --- | --- | --- | --- |
| **1** | ChatBox MCP | TC-C05 | `GOOGLE_MAPS`, `AMAP` | `true` | **3** |
| **1** | HTTP | TC-H04 | `GOOGLE_MAPS`, `AMAP` | `true` | **3** |
| **2A** | ChatBox MCP | TC-C06 | `GOOGLE_MAPS` only | — | **2** (fixture) |
| **2A** | HTTP | TC-H14 | `GOOGLE_MAPS` only | — | **2** (fixture) |
| **2B** | ChatBox MCP | TC-C07 | `GOOGLE_MAPS` only | — | **live** (mainland; Worker fallback) |
| **2B** | HTTP | TC-H15 | `GOOGLE_MAPS` only | — | **live** (mainland; Worker fallback) |

**Step 1 HTTP (both vendors):**

```bash
curl -s -H "Authorization: Bearer $CALLER_KEY" -H "Content-Type: application/json" \
  -d '{"query":"restaurant","near":{"lat":22.2819,"lng":114.158},"providers":["GOOGLE_MAPS","AMAP"],"merge":true,"locale":"EN"}' \
  http://localhost:3010/v1/search_restaurants
```

**Step 2A HTTP (Google only):**

```bash
curl -s -H "Authorization: Bearer $CALLER_KEY" -H "Content-Type: application/json" \
  -d '{"query":"restaurant","near":{"lat":22.2819,"lng":114.158},"providers":["GOOGLE_MAPS"],"locale":"EN"}' \
  http://localhost:3010/v1/search_restaurants
```

**Step 2B (Worker fallback):** same body as Step 2A on **live** mode from a **China mainland network** where Google Maps is unavailable. Caller JSON unchanged; fallback is server-internal (ADR-017). See **TC-C07** / **TC-H15**.

---

### TC-H01 — Health ★

| | |
| --- | --- |
| **Pre-condition** | Server running. No auth. |
| **Test steps** | 1. `GET /v1/health` |
| **Expected result** | `{ "agent": "places-agent", "ok": true, "data": { "tools": [ … ] } }`. Homepage `200` alone is insufficient. |

---

### TC-H02 — Search restaurants (Google Maps)

| | |
| --- | --- |
| **Pre-condition** | Caller key set. `GOOGLE_MAPS` available. |
| **Test steps** | 1. `POST /v1/search_restaurants` — body: `{"query":"ramen","near":{"lat":22.28,"lng":114.17},"providers":["GOOGLE_MAPS"],"locale":"EN"}` |
| **Expected result** | `"ok": true`, `"agent": "places-agent"`, ≥1 card, `sources[].provider` includes `GOOGLE_MAPS`. |

---

### TC-H03 — Search restaurants (AMAP only)

| | |
| --- | --- |
| **Pre-condition** | Caller key set. `AMAP` available. |
| **Test steps** | 1. Same as TC-H02 with `"providers":["AMAP"]`. |
| **Expected result** | AMAP cards; location CRS `GCJ-02`. |

---

### TC-H04 — Search with merge (Google + AMAP)

| | |
| --- | --- |
| **Pre-condition** | Caller key set. Both vendors available. |
| **Test steps** | 1. `POST /v1/search_restaurants` — body: `{"query":"restaurant","near":{"lat":22.2819,"lng":114.158},"providers":["GOOGLE_MAPS","AMAP"],"merge":true,"locale":"EN"}` |
| **Expected result** | `"ok": true`, `"agent": "places-agent"`, ≥1 card. Merge reduces count vs sum of single-provider results. Both `GOOGLE_MAPS` and `AMAP` appear in `sources[]`. Every card has name, location, and sources. `skipped` empty. |

---

### TC-H05 — Tripadvisor enrich on search ★

| | |
| --- | --- |
| **Pre-condition** | Caller key set. Tripadvisor enrich available. |
| **Test steps** | 1. `POST /v1/search_restaurants` — body: `{"query":"ramen","near":{"lat":22.28,"lng":114.17},"providers":["GOOGLE_MAPS"],"enrich":{"tripadvisor":true},"locale":"EN"}` |
| **Expected result** | Google cards returned. Matches include `tripadvisor` fields. Enrich uses name + location, not Google `native_id` as Tripadvisor id. |

---

### TC-H06 — Tripadvisor enrich failure tolerant

| | |
| --- | --- |
| **Pre-condition** | Caller key set. Fixture fail token or live outage path available. |
| **Test steps** | 1. Same as TC-H05 with query/path that triggers enrich failure (e.g. fixture `__ta_fail__`). |
| **Expected result** | Primary Google cards still returned. Enrich failure in `skipped[]`. List not wiped. |

---

### TC-H07 — Search places (POI)

| | |
| --- | --- |
| **Pre-condition** | Caller key set. |
| **Test steps** | 1. `POST /v1/search_places` — body: `{"query":"museum","near":{"lat":22.30,"lng":114.18},"providers":["GOOGLE_MAPS"],"locale":"EN"}` |
| **Expected result** | Non-dining POIs; same envelope as restaurant search. |

---

### TC-H08 — Geocode and navigate

| | |
| --- | --- |
| **Pre-condition** | Caller key set. |
| **Test steps** | 1. `POST /v1/geocode` — body: `{"query":"上海爱琴海购物公园","providers":["AMAP"],"locale":"CN"}` 2. `POST /v1/navigate` with lat/lng from step 1. |
| **Expected result** | Shanghai-area coordinates. Deeplinks without secrets. |

---

### TC-H09 — Plan itinerary

| | |
| --- | --- |
| **Pre-condition** | Caller key set. Place card(s) from TC-H07 or equivalent. |
| **Test steps** | 1. `POST /v1/plan_itinerary` with valid `bounds`, `places[]`, `"preferences":{"pace":"relaxed"}`, `"locale":"HK"`. 2. Repeat with end date before start. |
| **Expected result** | Valid: `days[]`, HK weather labels. Invalid bounds: `errors.bounds_invalid`. |

---

### TC-H10 — NL chat over HTTP ★

| | |
| --- | --- |
| **Pre-condition** | Caller key set. Fixture mode OK without live Quanzil key. |
| **Test steps** | 1. `POST /v1/chat` — body: `{"messages":[{"role":"user","content":"ramen near Tsim Sha Tsui"}],"locale":"EN"}` |
| **Expected result** | `"ok": true`. Assistant message present. Server invoked `search_restaurants`. |

---

### TC-H11 — Chat upload rejected

| | |
| --- | --- |
| **Pre-condition** | Caller key set. |
| **Test steps** | 1. `POST /v1/chat` with unsupported attachment MIME or oversize file. |
| **Expected result** | `errors.upload_unsupported` or `errors.upload_too_large`. No invented POI. |

---

### TC-H12 — Same request on HTTP and MCP ★

| | |
| --- | --- |
| **Pre-condition** | Caller key set. ChatBox MCP connected. |
| **Test steps** | 1. Run TC-H02 via curl. 2. In ChatBox, send exactly: `Search for ramen near latitude 22.28 longitude 114.17. Use provider GOOGLE_MAPS only.` 3. Compare tool JSON to HTTP response. |
| **Expected result** | Same card count; same envelope fields (`agent`, `ok`, `data`, `skipped`). |

---

### TC-H13 — Unconfigured vendor (live only)

| | |
| --- | --- |
| **Pre-condition** | **Live** mode; one vendor key unset (e.g. no `AMAP_API_KEY`). |
| **Test steps** | 1. `POST /v1/search_restaurants` with `"providers":["AMAP"]` only. |
| **Expected result** | `skipped[]` + `errors.provider_unconfigured` for AMAP. No silent fallback to Google unless Google is also in `providers[]`. |

---

### TC-H14 — Step 2A: Search restaurants (GOOGLE_MAPS only) ★

| | |
| --- | --- |
| **Pre-condition** | Caller key set. Same server/mode as Step 1 (TC-H04 / TC-C05). |
| **Test steps** | 1. Optional: `POST /v1/geocode` — `{"query":"Central Hong Kong","locale":"EN"}`. 2. `POST /v1/search_restaurants` — body: `{"query":"restaurant","near":{"lat":22.2819,"lng":114.158},"providers":["GOOGLE_MAPS"],"locale":"EN"}` |
| **Expected result** | `"ok": true`, `"agent": "places-agent"`. ≥1 card. All cards `provider` / `sources[].provider` = `GOOGLE_MAPS`. No AMAP cards. `skipped` empty. |

**Dev baseline (2026-08-18, fixture, HTTP):** 2 Google cards; subtract from Step 1's 3 cards = the 1 AMAP card (太興燒味).

---

### TC-H15 — Step 2B: GOOGLE_MAPS via Worker MCP fallback (HTTP, live) ★

| | |
| --- | --- |
| **Pre-condition** | Same as **TC-C07**: live mode + `GMAPS_MCP_*`; mainland block **or** `GOOGLE_DIRECT_FORCE_FAIL=1` / blackhole `GOOGLE_MAPS_BASE_URL`. Caller key set. |
| **Test steps** | 1. `POST /v1/search_restaurants` — same body as **TC-H14**: `{"query":"restaurant","near":{"lat":22.2819,"lng":114.158},"providers":["GOOGLE_MAPS"],"locale":"EN"}` |
| **Expected result** | `"ok": true`, `"agent": "places-agent"`. ≥1 live Google card; all `sources[].provider` = `GOOGLE_MAPS`. No `fixture_*` ids. No silent AMAP. Matches **TC-C07** MCP outcome for the same request. |

---

### Timed itinerary UAT (`detail: "timed"`) — operator HTTP

Operator supplies / confirms the **Input** column. Agent (or operator) calls `POST /v1/plan_itinerary`. Operator judges **Expected result**. Live mode; no `fixture_*` `native_id`. Bounds use half-open day math: `end` is exclusive of the last calendar night (2 days → `end = start + 2d`; 3 days → `start + 3d`).

`origin` = start point. `destination` = end point (same shape as `origin`). When **start** is omitted: plan using **city** from `natural_language` / destination name as `search_anchor` (not the tower pin); **omit** `legs_to_here` on each day's first visit. When **end** is omitted: **omit** `legs_to_destination` on the last visit. When both omitted: require a city hint in NL (or provided `places[]`); do **not** return `errors.origin_invalid`.

**Quality gates:** `days[0].day_index === 1`. Visits are attractions (not lodging, plaza, mall, station, dock, `景区`). Meals are restaurants/cafes (not 广州塔 / 管理办 / 贵宾楼). Dinner `slot.start` is not before 18:00 when visits end earlier; cafe may fill the afternoon. Same-day lunch option names are disjoint from cafe/dinner. Cross-day visit identities and meal-option identities have empty intersection (TC-UAT-M05). Insufficient unique venues → omit the meal, never reuse. Legs with `duration_min > 300` are omitted. CN + AMAP in `providers[]`: AMAP cards preferred when AMAP returns data. `PlaceCard.hours` only from vendor. AMAP in `providers[]` may yield `source: "directions"`.

---

### TC-UAT-T01 — Lisboa · 2 days · start = end · Boavista 83 Hostel

| | |
| --- | --- |
| **Locale / language** | EN |
| **City** | Lisboa (Lisbon) |
| **Days** | 2 |
| **Start point** | Boavista 83 Hostel Lisbon |
| **End point** | Boavista 83 Hostel Lisbon (same as start) |
| **Pre-condition** | Caller key; `PLACES_VENDOR_MODE=live`; Google Directions usable (`GOOGLE_DIRECT_FORCE_FAIL` unset/0). |
| **Input** | `POST /v1/plan_itinerary` body: `{"detail":"timed","origin":{"name":"Boavista 83 Hostel Lisbon"},"destination":{"name":"Boavista 83 Hostel Lisbon"},"timezone":"Europe/Lisbon","bounds":{"start":"2026-08-25","end":"2026-08-27"},"preferences":{"pace":"relaxed","spend":"premium","natural_language":"2-day Lisboa trip, start and end at Boavista 83 Hostel"},"providers":["GOOGLE_MAPS"],"locale":"EN"}` |
| **Expected result** | `"ok": true`, `data.detail` = `timed`. `days[0].day_index` = **1**. `data.origin.name` resolves near Boavista 83. `data.days.length` = **2**. Each day: `weather` + `planning_impact`; visit `blocks` with `slot`; legs with deeplinks. **Visit names must not match Hostel/Hotel/lodging.** Meals present when restaurant search returns cards; dinner not before 18:00; same-day lunch options disjoint from dinner/cafe; visit/meal identities disjoint across days (M05). No `fixture_*`. Last-day plan returns toward the hostel when `destination` is honored. |

---

### TC-UAT-T02 — 上海 · 3 天 · 起点 = 终点 · 上海国际饭店

| | |
| --- | --- |
| **Locale / language** | CN |
| **City** | 上海 |
| **Days** | 3 |
| **Start point** | 上海国际饭店 |
| **End point** | 上海国际饭店（与起点相同） |
| **Pre-condition** | Caller key; live; AMAP configured (preferred for CN pin). |
| **Input** | `POST /v1/plan_itinerary` body: `{"detail":"timed","origin":{"name":"上海国际饭店"},"destination":{"name":"上海国际饭店"},"timezone":"Asia/Shanghai","bounds":{"start":"2026-08-25","end":"2026-08-28"},"preferences":{"pace":"relaxed","spend":"premium","natural_language":"上海三日游，起点终点均为上海国际饭店"},"providers":["AMAP","GOOGLE_MAPS"],"locale":"CN"}` |
| **Expected result** | `"ok": true`, `detail` = `timed`. `days[0].day_index` = **1**. 起点解析在上海国际饭店附近。`days.length` = **3**。每日有 `planning_impact`；`weather.label` / `summary` 为中文目录文案。景点非旅馆/商场；餐饮非景点噪声。晚餐不早于 18:00。AMAP 有结果时 visit/meal `provider` 以 AMAP 为主。至少一个 visit/meal leg 在 Directions 成功时为 `source: "directions"`。无 `fixture_*`。CRS 对 AMAP 卡片合理（GCJ-02）。 |

---

### TC-UAT-T03 — Lisboa · 2 days · start and end not specified

| | |
| --- | --- |
| **Locale / language** | EN |
| **City** | Lisboa |
| **Days** | 2 |
| **Start point** | *(not specified)* |
| **End point** | *(not specified)* |
| **Pre-condition** | Caller key; live. |
| **Input** | `POST /v1/plan_itinerary` body: `{"detail":"timed","bounds":{"start":"2026-08-25","end":"2026-08-27"},"preferences":{"pace":"relaxed","natural_language":"2 days in Lisboa"},"providers":["GOOGLE_MAPS"],"locale":"EN"}` — **omit** `origin` and `destination`. |
| **Expected result** | `"ok": true`, `detail` = `timed`. `days[0].day_index` = **1**. **No** `data.origin`. `search_anchor` near Lisboa. `days.length` = **2**. Each day's **first** visit has `legs_to_here: []` (no start inbound). Later visits still have inter-stop legs. No `legs_to_destination`. Visits are attractions (not hostels). Dinner not before 18:00. No `fixture_*`. |

---

### TC-UAT-T04 — 北京 · 2 天 · 起点指定 · 终点未指定

| | |
| --- | --- |
| **Locale / language** | CN |
| **City** | 北京 |
| **Days** | 2 |
| **Start point** | 北京友谊宾馆迎宾楼 |
| **End point** | *(未指定)* |
| **Pre-condition** | Caller key; live; AMAP and/or Google. |
| **Input** | `POST /v1/plan_itinerary` body: `{"detail":"timed","origin":{"name":"北京友谊宾馆迎宾楼"},"timezone":"Asia/Shanghai","bounds":{"start":"2026-08-25","end":"2026-08-27"},"preferences":{"pace":"medium","spend":"budget","natural_language":"北京两日游，从友谊宾馆迎宾楼出发"},"providers":["AMAP","GOOGLE_MAPS"],"locale":"CN"}` — **omit** `destination`. |
| **Expected result** | `"ok": true` 或诚实的 `errors.timed_no_places`。`days[0].day_index` = **1**。Visit 为城市景点（非当代商城/宾馆）；meal 不得含贵宾楼/怡宾楼/迎宾楼。两日均有 visit 或诚实空日。无强制回到某一终点。无 `fixture_*`。 |

---

### TC-UAT-T05 — Shanghai · 3 days · Hyatt Place Tianshan → MixC Minhang

| | |
| --- | --- |
| **Locale / language** | EN |
| **City** | Shanghai |
| **Days** | 3 |
| **Start point** | Hyatt Place Shanghai Tianshan Plaza |
| **End point** | Shanghai MixC in Minhang District |
| **Pre-condition** | Caller key; live; AMAP preferred for CN; Google OK as secondary. |
| **Input** | `POST /v1/plan_itinerary` body: `{"detail":"timed","origin":{"name":"Hyatt Place Shanghai Tianshan Plaza"},"destination":{"name":"Shanghai MixC Minhang"},"timezone":"Asia/Shanghai","bounds":{"start":"2026-08-25","end":"2026-08-28"},"preferences":{"pace":"relaxed","spend":"premium","natural_language":"3 days Shanghai, start Hyatt Place Tianshan Plaza, end Shanghai MixC Minhang"},"providers":["AMAP","GOOGLE_MAPS"],"locale":"EN"}` |
| **Expected result** | `"ok": true`, `days.length` = **3**, `days[0].day_index` = **1**. Origin near Tianshan / Changning Hyatt Place. Visits are not residential/food-street plazas (Garden Plaza / Jiadun Plaza excluded). **Day-3 visit centroid nearer MixC Minhang than Day-1**. Last visit may include `legs_to_destination`. No meal option with `duration_min > 300`. No `fixture_*`. |

---

### TC-UAT-T06 — 广州 · 2 天 · 起点未指定 · 终点指定 · 广州塔

| | |
| --- | --- |
| **Locale / language** | CN |
| **City** | 广州 |
| **Days** | 2 |
| **Start point** | *(未指定)* |
| **End point** | 广州塔 |
| **Pre-condition** | Caller key; live. |
| **Input** | `POST /v1/plan_itinerary` body: `{"detail":"timed","destination":{"name":"广州塔"},"timezone":"Asia/Shanghai","bounds":{"start":"2026-08-25","end":"2026-08-27"},"preferences":{"pace":"relaxed","natural_language":"广州两日游，终点广州塔"},"providers":["AMAP","GOOGLE_MAPS"],"locale":"CN"}` — **omit** `origin`. |
| **Expected result** | `"ok": true`, `detail` = `timed`. `days[0].day_index` = **1**. **No** `data.origin`. `search_anchor` is **广州** (city), not 广州塔. `destination` still 广州塔. `days.length` = **2**. 每日首个 visit 的 `legs_to_here` 为空；末日最后一个 visit 有 `legs_to_destination` 指向广州塔。Visit 不以塔站/码头/景区为主。Meal options **不是**广州塔/琶醍码头广场/管理办。无 `fixture_*`。 |

---

### TC-UAT-T07 — Lisboa · 5 days · start = end · Boavista 83 Hostel

| | |
| --- | --- |
| **Locale / language** | EN |
| **City** | Lisboa |
| **Days** | 5 |
| **Start point** | Boavista 83 Hostel Lisbon |
| **End point** | Boavista 83 Hostel Lisbon (same as start) |
| **Pre-condition** | Caller key; live; Google Directions usable. |
| **Input** | `POST /v1/plan_itinerary` body: `{"detail":"timed","origin":{"name":"Boavista 83 Hostel Lisbon"},"destination":{"name":"Boavista 83 Hostel Lisbon"},"timezone":"Europe/Lisbon","bounds":{"start":"2026-08-25","end":"2026-08-30"},"preferences":{"pace":"relaxed","spend":"premium","natural_language":"5-day Lisboa trip, start and end at Boavista 83 Hostel"},"providers":["GOOGLE_MAPS"],"locale":"EN"}` |
| **Expected result** | `"ok": true`, `days.length` = **5**, all days have visits. No lodging visits. Cross-day visit and meal-option identities disjoint (M05). No restaurant/cafe repeated every day. No `fixture_*`. |

---

### Timed itinerary UAT — tight pace (`preferences.pace: "tight"`)

Tight schedules use **4 visits/day** with slots **09:00–10:15**, **10:30–11:45**, **13:30–14:45**, **15:00–16:15** (weather may shorten outdoor ends). Lunch uses the largest visit gap (typically **11:45–13:30**). Last visit ends **16:15** (before 17:00) so cafe may fill until 18:00. Dinner remains **18:00–20:00**. Unique-venue rules (M05) still apply. Search must supply enough attractions (`searchNeed` = 4 × days) or later days may have fewer visits.

---

### TC-UAT-K01 — Lisboa · 2 days · tight · start = end · Boavista 83 Hostel

| | |
| --- | --- |
| **Locale / language** | EN |
| **City** | Lisboa |
| **Days** | 2 |
| **Pace** | tight |
| **Start point** | Boavista 83 Hostel Lisbon |
| **End point** | Boavista 83 Hostel Lisbon (same as start) |
| **Pre-condition** | Caller key; live; Google Directions usable. |
| **Input** | `POST /v1/plan_itinerary` body: `{"detail":"timed","origin":{"name":"Boavista 83 Hostel Lisbon"},"destination":{"name":"Boavista 83 Hostel Lisbon"},"timezone":"Europe/Lisbon","bounds":{"start":"2026-08-25","end":"2026-08-27"},"preferences":{"pace":"tight","spend":"premium","natural_language":"tight 2-day Lisboa itinerary, start and end at Boavista 83 Hostel"},"providers":["GOOGLE_MAPS"],"locale":"EN"}` |
| **Expected result** | `"ok": true`, `preferences_applied.pace` = `tight`, `days.length` = **2**. Days with a full attraction pool have **4** visit blocks. First visit `slot.start` = **09:00**; last visit `slot.end` is **16:15** (unless weather-shortened). Lunch `slot` is the midday gap (not 12:00–13:30 only). Dinner not before 18:00. No lodging visits. M05 unique visit/meal identities. Last day may have `legs_to_destination`. No `fixture_*`. |

---

### TC-UAT-K02 — 上海 · 3 天 · tight · 起点 = 终点 · 上海国际饭店

| | |
| --- | --- |
| **Locale / language** | CN |
| **City** | 上海 |
| **Days** | 3 |
| **Pace** | tight |
| **Start point** | 上海国际饭店 |
| **End point** | 上海国际饭店（与起点相同） |
| **Pre-condition** | Caller key; live; AMAP + Google. |
| **Input** | `POST /v1/plan_itinerary` body: `{"detail":"timed","origin":{"name":"上海国际饭店"},"destination":{"name":"上海国际饭店"},"timezone":"Asia/Shanghai","bounds":{"start":"2026-08-25","end":"2026-08-28"},"preferences":{"pace":"tight","spend":"budget","natural_language":"上海紧凑三日游，起点终点均为上海国际饭店"},"providers":["AMAP","GOOGLE_MAPS"],"locale":"CN"}` |
| **Expected result** | `"ok": true`，`pace` = `tight`，`days.length` = **3**。满员日 **4** 个 visit。首个 visit 09:00；末日可有 `legs_to_destination`。餐饮非景点噪声。晚餐不早于 18:00。M05 去重。无 `fixture_*`。 |

---

### TC-UAT-K03 — Lisboa · 2 days · tight · start and end not specified

| | |
| --- | --- |
| **Locale / language** | EN |
| **City** | Lisboa |
| **Days** | 2 |
| **Pace** | tight |
| **Start point** | *(not specified)* |
| **End point** | *(not specified)* |
| **Pre-condition** | Caller key; live. |
| **Input** | `POST /v1/plan_itinerary` body: `{"detail":"timed","bounds":{"start":"2026-08-25","end":"2026-08-27"},"preferences":{"pace":"tight","natural_language":"packed 2 days in Lisboa"},"providers":["GOOGLE_MAPS"],"locale":"EN"}` — **omit** `origin` and `destination`. |
| **Expected result** | `"ok": true`. **No** `data.origin`. `search_anchor` near Lisboa. Each day's **first** visit has `legs_to_here: []`. Four visit slots when search fills. No `legs_to_destination`. Dinner not before 18:00. M05. No `fixture_*`. |

---

### TC-UAT-K04 — 北京 · 2 天 · tight · 起点指定 · 终点未指定

| | |
| --- | --- |
| **Locale / language** | CN |
| **City** | 北京 |
| **Days** | 2 |
| **Pace** | tight |
| **Start point** | 北京友谊宾馆迎宾楼 |
| **End point** | *(未指定)* |
| **Pre-condition** | Caller key; live. |
| **Input** | `POST /v1/plan_itinerary` body: `{"detail":"timed","origin":{"name":"北京友谊宾馆迎宾楼"},"timezone":"Asia/Shanghai","bounds":{"start":"2026-08-25","end":"2026-08-27"},"preferences":{"pace":"tight","spend":"budget","natural_language":"北京紧凑两日游，从友谊宾馆迎宾楼出发"},"providers":["AMAP","GOOGLE_MAPS"],"locale":"CN"}` — **omit** `destination`. |
| **Expected result** | `"ok": true` 或诚实 `errors.timed_no_places`。满员日 **4** 个 visit（比 T04 的 medium/3 更密）。Visit 非宾馆/商场；meal 不含贵宾楼/迎宾楼。无 `legs_to_destination`。M05。无 `fixture_*`。 |

---

### TC-UAT-K05 — Tokyo · 2 days · tight · start = end · Park Hyatt Tokyo

| | |
| --- | --- |
| **Locale / language** | EN |
| **City** | Tokyo |
| **Days** | 2 |
| **Pace** | tight |
| **Start point** | Park Hyatt Tokyo |
| **End point** | Park Hyatt Tokyo (same as start) |
| **Pre-condition** | Caller key; live; Google Directions usable. |
| **Input** | `POST /v1/plan_itinerary` body: `{"detail":"timed","origin":{"name":"Park Hyatt Tokyo"},"destination":{"name":"Park Hyatt Tokyo"},"timezone":"Asia/Tokyo","bounds":{"start":"2026-08-25","end":"2026-08-27"},"preferences":{"pace":"tight","spend":"premium","natural_language":"tight 2-day Tokyo itinerary, start and end at Park Hyatt Tokyo"},"providers":["GOOGLE_MAPS"],"locale":"EN"}` |
| **Expected result** | `"ok": true`, `days.length` = **2**, `pace` = `tight`. Visits are attractions (not the Hyatt). First visit 09:00. Dinner 18:00–20:00. M05. Last day may close toward the hotel. No `fixture_*`. |

---

### TC-UAT-K06 — 香港 · 3 天 · tight · 起点未指定 · 终点指定 · 天星码头

| | |
| --- | --- |
| **Locale / language** | HK |
| **City** | 香港 |
| **Days** | 3 |
| **Pace** | tight |
| **Start point** | *(未指定)* |
| **End point** | 天星码头 Star Ferry Pier Tsim Sha Tsui |
| **Pre-condition** | Caller key; live. |
| **Input** | `POST /v1/plan_itinerary` body: `{"detail":"timed","destination":{"name":"Star Ferry Pier Tsim Sha Tsui"},"timezone":"Asia/Hong_Kong","bounds":{"start":"2026-08-25","end":"2026-08-28"},"preferences":{"pace":"tight","spend":"budget","natural_language":"香港三日緊湊行程，終點尖沙咀天星碼頭"},"providers":["GOOGLE_MAPS","AMAP"],"locale":"HK"}` — **omit** `origin`. |
| **Expected result** | `"ok": true`. **No** `data.origin`. `search_anchor` is **香港** (city), not the pier alone. First visit each day has empty `legs_to_here`. Last visit of last day may have `legs_to_destination`. Full days have **4** visits. Dinner not before 18:00. M05. No lodging visits. No `fixture_*`. |

---

### TC-UAT-H01 — Opening hours mapped when vendor provides them

| | |
| --- | --- |
| **Pre-condition** | Live; Google and/or AMAP configured. |
| **Test steps** | `POST /v1/search_places` or `get_place_details` for a well-known attraction (e.g. Lisboa museum or 外滩). |
| **Expected result** | At least one card has non-empty `hours` **or** `hours` is unset (never empty string fiction). No invented hours. |

---

### TC-UAT-F01 — No lodging fallback for timed auto-search

| | |
| --- | --- |
| **Pre-condition** | Live; same as T01 body or fixture search that returns only hostels. |
| **Test steps** | Timed plan with empty `places` near a hostel-dense pin; or unit/HTTP path covering filter. |
| **Expected result** | Visits exclude Hostel/Hotel/宾馆/酒店; if nothing left → `errors.timed_no_places` (not unfiltered hostel list). |

---

### TC-UAT-M01 — Meal windows derived from visit gaps

| | |
| --- | --- |
| **Pre-condition** | Fixture or timed plan with relaxed two visits (10:00–12:00, 14:00–16:00). |
| **Test steps** | Inspect first day meal blocks after `plan_itinerary` timed. |
| **Expected result** | `lunch.slot.start` equals first visit `end`; `lunch.slot.end` equals second visit `start`. Dinner `slot` is **18:00–20:00**. Cafe may fill 16:00–18:00. Not dinner 16:00–18:00. |

---

### TC-UAT-D01a — AMAP-only timed search (empty places)

| | |
| --- | --- |
| **Pre-condition** | Live; `AMAP_API_KEY` set. Locale CN. Shanghai origin. `places` empty. `"providers":["AMAP"]`. |
| **Test steps** | Timed `plan_itinerary`; inspect days and skipped. |
| **Expected result** | At least one visit on day 1. Outcome is not `errors.timed_no_places`. Assembled queries are Chinese. |

### TC-UAT-D01 — AMAP-only Directions

| | |
| --- | --- |
| **Pre-condition** | Live; `AMAP_API_KEY` set. |
| **Test steps** | Timed plan Shanghai with `"providers":["AMAP"]` and origin+**places spanning two pins**. |
| **Expected result** | At least one visit `legs_to_here[].source === "directions"` when AMAP route succeeds; on failure → heuristic + skipped may cite `AMAP` or `errors.directions_unavailable`. Not `errors.timed_no_places`. |

---

### TC-UAT-M02 — Meal legs via Directions

| | |
| --- | --- |
| **Pre-condition** | Live Directions usable (Google and/or AMAP). |
| **Test steps** | T01 or T02 response; inspect meal `options[].leg_from_previous`. |
| **Expected result** | When Directions succeeds, `source` may be `directions` (not only exaggerated heuristic). |

---

### TC-UAT-G01 — Destination geo bias

| | |
| --- | --- |
| **Pre-condition** | Same as T05. |
| **Test steps** | Compare Day-1 vs Day-3 visit coordinates to MixC Minhang. |
| **Expected result** | Day-3 visits nearer destination than Day-1 centroid (progress along the trip). |

---

### TC-UAT-F02 — Strict visit/dining deny list

| | |
| --- | --- |
| **Pre-condition** | Unit or live timed plan containing plaza/mall/tower/office names. |
| **Test steps** | Inspect visit and meal names against deny examples (Garden Plaza, 当代商城, 广州塔, 管理办, 贵宾楼). |
| **Expected result** | Those names are absent from visits/meals. True restaurants remain. Covered by `place-filters.test.ts`. |

---

### TC-UAT-A01 — Destination tower is not search_anchor

| | |
| --- | --- |
| **Pre-condition** | Same as T06. |
| **Test steps** | Inspect `data.search_anchor`. |
| **Expected result** | Anchor name/location is the city (广州), not 广州塔. Destination field still names 广州塔. |

---

### TC-UAT-M03 — Dinner 18:00–20:00 and cafe filler

| | |
| --- | --- |
| **Pre-condition** | Relaxed two visits 10:00–12:00 and 14:00–16:00 (unit or live). |
| **Test steps** | Inspect meal blocks. |
| **Expected result** | `dinner.slot` is 18:00–20:00. Cafe block 16:00–18:00 when cafe search returns cards; omitted when cafe search is empty. Covered by `meal-windows.test.ts`. |

---

### TC-UAT-M04 — Distinct lunch and dinner

| | |
| --- | --- |
| **Pre-condition** | Timed day with at least two dining candidates. |
| **Test steps** | Compare lunch and dinner primary `native_id` / name. |
| **Expected result** | Lunch option identities disjoint from dinner/cafe. If only one unused dining identity remains for dinner, omit dinner instead of repeating lunch. |

---

### TC-UAT-M05 — Cross-day unique visits, restaurants, and tea/cafe

| | |
| --- | --- |
| **Pre-condition** | Multi-day timed plan (T07 volume: Lisboa 5 days, or T01/T02). Live restaurant/cafe search. |
| **Test steps** | Collect every visit identity (`native_id` or normalized name) and every meal option identity across all days. |
| **Expected result** | Visit identity sets per day are pairwise disjoint. Meal option identity sets per day are pairwise disjoint. No POI is both a visit and a meal. Fifty Seconds / Marlene / Feng Shui (or any one restaurant/cafe) must not appear on every day. Covered by `itinerary-timed.test.ts` + operator HTTP. |

---

### TC-UAT-P01 — CN timed searches AMAP first

| | |
| --- | --- |
| **Pre-condition** | `locale: CN`, `providers: ["GOOGLE_MAPS","AMAP"]`. |
| **Test steps** | Unit mock of `searchPlacesFn` (preferred) or live T02 cards. |
| **Expected result** | First search wave is AMAP-only. Google fill only if AMAP yields no usable attractions. AMAP not injected when omitted from `providers`. Covered by `itinerary-timed.test.ts`. |

---

## 17. Run log

| Date | Tester | Server URL | Mode | ★ pass? | Notes |
| --- | --- | --- | --- | --- | --- |
| 2026-08-19 | agent + operator | `http://127.0.0.1:3010` | live (`GOOGLE_DIRECT_FORCE_FAIL=0`) | UAT-T01–T06 structural PASS | Timed UAT: T01/T02/T04/T05 ok+timed days/meals; T03/T06 `errors.origin_invalid`. `destination` accepted in request body but not echoed/enforced yet. T01/T04 visit mix can skew toward lodging near origin — operator visual check recommended. |
| 2026-08-19 | agent | `http://127.0.0.1:3010` | live | T01/T03/T04/T06/T07/H01 PASS. T07 Lisboa **5 days all have visits**. T02 3 days filled (museums) but cards were Google after AMAP empty. T05 G01 dest bias still weak. D01 AMAP-only still `provider_failed`. | Extra city queries + deny ticket offices (VisitLisboa / Lisboa Card). |

**★ Release checklist:** C01, C02, C03, C04, C05, C06, C08, C15, C17, C19, H01, H04, H05, H10, H12, H14. (**TC-C07 / TC-H15:** live mode on **mainland network** with Google blocked; N/A on local fixture or VPN/overseas egress.)

ChatBox ★ items (C01–C08, C15, C17, C19) may be **deferred** when the matching HTTP ★ case is green in CI (`make test`). TC-C07 remains manual/live-only until `make test-live` passes.

---

## 18. Test case index

| ID | ★ | Section | Topic | Automation | MVP |
| --- | --- | --- | --- | --- | --- |
| TC-C01 | ✓ | ChatBox | Connect, six tools | paused — manual | |
| TC-C02 | ✓ | ChatBox | Auth | paused — use H01 + dispatch auth | |
| TC-C03–C05 | partial | ChatBox | Restaurant search + merge | paused — H02–H04 | |
| TC-C06–C07 | ✓ | ChatBox | Step 2 — Google only; Worker fallback (C07 live only) | paused — H14; C07/H15 live | |
| TC-C08–C10 | partial | ChatBox | Shanghai, empty, Tripadvisor unsupported | paused — H03/H06 | |
| TC-C11 | | ChatBox | POI search | paused — H07 | |
| TC-C12–C14 | | ChatBox | Geocode, details, navigate | paused — H08 | |
| TC-C15–C16 | ✓ | ChatBox | Itinerary | paused — H09 | |
| TC-C17–C19 | ✓ | ChatBox | Multi-turn, locale, secrets | paused — H10/H11 | |
| TC-H01 | ✓ | HTTP | Health | `tests/http-tc-h.test.ts` | |
| TC-H02 | | HTTP | Google search (ramen) | `tests/http-tc-h.test.ts` | |
| TC-H03 | | HTTP | AMAP only + GCJ-02 | `tests/http-tc-h.test.ts` | |
| TC-H04 | ✓ | HTTP | Merge (Step 1 HTTP) | `tests/http-tc-h.test.ts` | |
| TC-H05 | ✓ | HTTP | Tripadvisor enrich | `tests/http-tc-h.test.ts` | |
| TC-H06 | ✓ | HTTP | Tripadvisor failure tolerant | `tests/http-tc-h.test.ts` | |
| TC-H07 | | HTTP | POI search | `tests/http-tc-h.test.ts` | |
| TC-H08 | | HTTP | Geocode + navigate | `tests/http-tc-h.test.ts` | |
| TC-H09 | | HTTP | Plan itinerary | `tests/http-tc-h.test.ts` | |
| TC-H10 | ✓ | HTTP | NL chat | `tests/http-tc-h.test.ts` | |
| TC-H11 | ✓ | HTTP | Chat upload rejected | `tests/http-tc-h.test.ts` | |
| TC-H12 | ✓ | HTTP | HTTP ↔ MCP parity | `tests/http-tc-h.test.ts` (in-memory MCP; no ChatBox) | |
| TC-H13 | ✓ | HTTP | Unconfigured vendor (live) | `tests/http-tc-h.test.ts` | |
| TC-H14 | ✓ | HTTP | Step 2A — GOOGLE_MAPS only | `tests/http-tc-h.test.ts` | |
| TC-H15 | ✓ | HTTP | Step 2B — Worker fallback | `tests/http-tc-h.test.ts` (mocked); `make test-live` + `verify-gmaps-fallback.sh` (live) | |
| TC-UAT-T01 | | HTTP UAT | Timed · Lisboa · start=end Boavista 83 | operator HTTP (`detail:timed`) — no lodging visits | |
| TC-UAT-T02 | | HTTP UAT | Timed · 上海 · 起点=终点 上海国际饭店 | operator HTTP — AMAP directions preferred | |
| TC-UAT-T03 | | HTTP UAT | Timed · Lisboa · no start/end | operator HTTP — ok, omit first inbound | |
| TC-UAT-T04 | | HTTP UAT | Timed · 北京 · 起点友谊宾馆迎宾楼 · 无终点 | operator HTTP — no lodging meals | |
| TC-UAT-T05 | | HTTP UAT | Timed · Shanghai · Hyatt Tianshan → MixC Minhang | operator HTTP — destination geo bias | |
| TC-UAT-T06 | | HTTP UAT | Timed · 广州 · 无起点 · 终点广州塔 | operator HTTP — dining deny noise | |
| TC-UAT-T07 | | HTTP UAT | Timed · Lisboa · 5 days Boavista 83 | operator HTTP — extra city queries + M05 | |
| TC-UAT-K01 | | HTTP UAT | Timed tight · Lisboa · 2d Boavista 83 | 4 visits/day · 09:00 start | |
| TC-UAT-K02 | | HTTP UAT | Timed tight · 上海 · 3d 上海国际饭店 | 4 visits/day · budget | |
| TC-UAT-K03 | | HTTP UAT | Timed tight · Lisboa · no start/end | omit first inbound | |
| TC-UAT-K04 | | HTTP UAT | Timed tight · 北京 · 友谊宾馆 · 无终点 | denser than T04 medium | |
| TC-UAT-K05 | | HTTP UAT | Timed tight · Tokyo · Park Hyatt | 2d premium | |
| TC-UAT-K06 | | HTTP UAT | Timed tight · 香港 · 无起点 · 终点天星码头 | city search_anchor | |
| TC-UAT-H01 | | HTTP UAT | Hours mapping | operator HTTP / details | |
| TC-UAT-F01 | | HTTP UAT | No lodging fallback | operator + `place-filters.test.ts` | |
| TC-UAT-M01 | | HTTP UAT | Meal windows from visits | `meal-windows.test.ts` + operator | |
| TC-UAT-D01a | | HTTP UAT | AMAP-only timed search (empty places) | `amap/direct.test.ts` + operator | |
| TC-UAT-D01 | | HTTP UAT | AMAP-only Directions | operator + `itinerary-timed.test.ts` AMAP legs | |
| TC-UAT-M02 | | HTTP UAT | Meal legs Directions | operator HTTP | |
| TC-UAT-G01 | | HTTP UAT | Destination geo bias | corridor pin search + `itinerary-timed.test.ts` | |
| TC-UAT-F02 | | HTTP UAT | Strict visit/dining deny | `place-filters.test.ts` + T04/T06 | |
| TC-UAT-A01 | | HTTP UAT | City search_anchor | `itinerary-timed.test.ts` + T06 | |
| TC-UAT-M03 | | HTTP UAT | Dinner 18:00 + cafe | `meal-windows.test.ts` | |
| TC-UAT-M04 | | HTTP UAT | Distinct lunch/dinner | `itinerary-timed.test.ts` | |
| TC-UAT-M05 | | HTTP UAT | Cross-day unique visit/meal venues | `itinerary-timed.test.ts` + T07 | |
| TC-UAT-P01 | | HTTP UAT | CN AMAP-first timed search | `itinerary-timed.test.ts` | |
| TC-E2E-01 | | Caller E2E | what2eat — Chinese restaurant search | `make test-e2e-caller` (opt-in live) | |
| TC-E2E-02 | | Caller E2E | what2eat — provider auto-selection | `make test-e2e-caller` | |
| TC-E2E-03 | | Caller E2E | where2play — English place search | `make test-e2e-caller` | |
| TC-E2E-04 | | Caller E2E | itinerary — timed non-hardcoded city | `make test-e2e-caller` | |
| TC-E2E-05 | | Caller E2E | chatbox — Chinese NL query | `make test-e2e-caller` | |
| TC-E2E-06 | | Caller E2E | photo field validation | `make test-e2e-caller` | |
| TC-E2E-07 | | Caller E2E | mixed-language input resilience | `make test-e2e-caller` | |
| TC-E2E-08 | | Caller E2E | itinerary meal-context matching | `make test-e2e-caller` | |
| TC-M3a-S01 | ✓ | Unit | readJsonBody malformed → {ok:false} | `server.test.ts` | 3a |
| TC-M3a-S02 | ✓ | Unit | SessionManager TTL 清理 | `src/mcp/session-manager.test.ts` | 3a |
| TC-M3a-S03 | | Unit | SessionManager close() 清空 | `src/mcp/session-manager.test.ts` | 3a |
| TC-M3a-S04 | | Unit | SessionManager 未过期保留 | `src/mcp/session-manager.test.ts` | 3a |
| TC-M3a-PS01 | ✓ | Unit | 上海 + CN → AMAP only | `src/adapters/provider-resolver.test.ts` | 3a |
| TC-M3a-PS02 | ✓ | Unit | 上海 + EN → Google + AMAP | `src/adapters/provider-resolver.test.ts` | 3a |
| TC-M3a-PS03 | ✓ | Unit | 香港坐标 + HK → Google + AMAP | `src/adapters/provider-resolver.test.ts` | 3a |
| TC-M3a-PS04 | ✓ | Unit | 台湾 + TW → Google only | `src/adapters/provider-resolver.test.ts` | 3a |
| TC-M3a-PS05 | ✓ | Unit | 东京 + EN → Google only | `src/adapters/provider-resolver.test.ts` | 3a |
| TC-M3a-PS06 | ✓ | Unit | 显式 providers 覆盖 | `src/adapters/provider-resolver.test.ts` | 3a |
| TC-M3a-PS07 | | Unit | 中国城市列表文本匹配 | `src/adapters/provider-resolver.test.ts` | 3a |
| TC-M3a-PS08 | | Unit | 坐标范围判断 | `src/adapters/provider-resolver.test.ts` | 3a |
| TC-M3a-PS09 | | Unit | enrichProviders 含 TRIPADVISOR | `src/adapters/provider-resolver.test.ts` | 3a |
| TC-M3a-H01 | ✓ | HTTP | 中国地址无 providers → 中国结果 | `tests/http-tc-h.test.ts` | 3a |
| TC-M3a-H02 | ✓ | HTTP | 东京无 providers → 日本结果 | `tests/http-tc-h.test.ts` | 3a |
| TC-M3a-H03 | ✓ | HTTP | 发送非 JSON → 400 | `tests/http-tc-h.test.ts` | 3a |
| TC-M3a-H04 | | HTTP | 显式 providers 覆盖 | `tests/http-tc-h.test.ts` | 3a |

Supporting tests (not 1:1 TC-H ids): `tools.test.ts`, `mcp.test.ts`, `itinerary.test.ts`, `itinerary-timed.test.ts`, `meal-windows.test.ts`, `place-filters.test.ts`, `tripadvisor-enrich.test.ts`, `chat.test.ts`, `dispatch.test.ts`, `src/adapters/google/live.test.ts`, `src/adapters/google/directions.test.ts`, `src/adapters/google/card-mapper.test.ts`, `src/adapters/amap/directions.test.ts`, `src/adapters/amap/card-mapper.test.ts`.

---

## 19. Caller simulation E2E test cases

These tests validate places-agent from the perspective of real callers. Run with `make test-e2e-caller` (opt-in, requires live vendor keys). See §7.1 for harness and principles.

### TC-E2E-01: what2eat — Chinese restaurant search

**Given** a valid caller key and `PLACES_VENDOR_MODE=live`
**When** POST `/v1/search_restaurants` with:
```json
{
  "location": "上海市静安区南京西路1515号",
  "occasion": "下班小酌",
  "cuisine": "日料",
  "locale": "CN",
  "providers": ["AMAP", "GOOGLE_MAPS"]
}
```
**Then**:
- Response `ok: true`
- All results have `location.lat` between 30–32°N and `location.lng` between 120–122°E (Shanghai area)
- At least one result has `photos` non-empty (when provider supports it)
- All results have `provider` ∈ `["AMAP", "GOOGLE_MAPS"]`
- `sources[]` non-empty on each result

### TC-E2E-02: what2eat — provider auto-selection for Chinese address

**Given** a valid caller key
**When** POST `/v1/search_restaurants` with:
```json
{
  "location": "北京市朝阳区三里屯",
  "occasion": "朋友聚餐",
  "locale": "CN"
}
```
(no explicit `providers`)
**Then**:
- Results include venues from AMAP (auto-injected for Chinese address)
- No results from outside China

### TC-E2E-03: where2play — English place search

**Given** a valid caller key
**When** POST `/v1/search_places` with:
```json
{
  "location": "Tokyo Tower, Japan",
  "query": "museums near Tokyo Tower",
  "locale": "EN"
}
```
**Then**:
- Results have `location.lat` between 35–36°N and `location.lng` between 139–140°E (Tokyo area)
- `provider` is `GOOGLE_MAPS` (not AMAP for Japanese address)
- Response text/names are in English or Japanese (not Chinese)

### TC-E2E-04: itinerary — timed plan for non-hardcoded city

**Given** a valid caller key
**When** POST `/v1/plan_itinerary` with:
```json
{
  "detail": "timed",
  "origin": "成都市锦江区春熙路",
  "start_date": "2026-09-01",
  "end_date": "2026-09-03",
  "pace": "relaxed",
  "locale": "CN"
}
```
**Then**:
- `days` array has 3 entries (Sep 1, 2, 3)
- `days[0].day_index === 1` (1-based)
- Each day has at least one visit block
- Dinner blocks have `start_time` between "17:30" and "20:00"
- No duplicate venue `native_id` across days
- Venue coordinates within Chengdu area (lat 30–31°N, lng 103–105°E)

### TC-E2E-05: chatbox — Chinese NL query

**Given** a valid caller key
**When** POST `/v1/chat` with:
```json
{
  "messages": [{"role": "user", "content": "帮我找上海外滩附近的西餐厅，要有露台"}],
  "locale": "CN"
}
```
**Then**:
- Response contains tool call results (not fabricated venues)
- If venues returned, coordinates are in Shanghai area
- Response text is in Chinese

### TC-E2E-06: photo field validation

**Given** a valid caller key
**When** POST `/v1/search_restaurants` with Google Maps provider for a well-known restaurant area
**Then**:
- Results with photos have `photos` as string[] with valid URLs (not empty array)
- Results without photos omit the `photos` field entirely (not `photos: []`)

### TC-E2E-07: mixed-language input resilience

**Given** a valid caller key
**When** POST `/v1/search_restaurants` with:
```json
{
  "location": "Shanghai Jing'an Temple",
  "cuisine": "火锅",
  "locale": "CN"
}
```
**Then**:
- Results are in Shanghai (not random global results)
- Provider correctly handles mixed English location + Chinese cuisine

### TC-E2E-08: itinerary meal-context matching

**Given** a valid caller key
**When** POST `/v1/plan_itinerary` with timed detail for any 2-day trip
**Then**:
- Breakfast blocks (if present) are before 10:00
- Lunch blocks are between 11:00–14:00
- Dinner blocks are between 17:30–20:00
- Cafe blocks (if present) are between 14:00–18:00
- No meal venue appears twice across the entire trip
