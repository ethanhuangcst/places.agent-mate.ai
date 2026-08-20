# places-agent — user stories

High-level product backlog for **places-agent** (`places.agent-mate.ai`).

Callers identify this service as the machine id **`places-agent`** (MCP `serverInfo.name`, HTTP JSON `agent`). That string is not localized. The hostname is `places.agent-mate.ai`.

- **agent** — place gateway and tools (HTTP + MCP). Does **not** own consumer web UX (what2eat / where2play screens stay in those apps).
- **app** — operator management web-app on the same host: public home, login, post-login landing (left nav + header), admins, caller API keys, agent instructions, i18n.

| Related | Location |
| --- | --- |
| Family purpose (short) | [`../../workspace-specs/1.req-specs.md`](../../workspace-specs/1.req-specs.md) |
| Architecture & trust | [`../../workspace-specs/2.architecture.md`](../../workspace-specs/2.architecture.md) |
| Provider capability matrix | [`../../workspace-specs/knowledge/maps/places-capabilities.md`](../../workspace-specs/knowledge/maps/places-capabilities.md) |
| Admin UI | [`agent-design.md`](./agent-design.md) §12 |
| Admin UI mock-ups | [`ui-mockup/`](./ui-mockup/) |
| Test strategy | [`agent-test-plan.md`](./agent-test-plan.md) |
| User test cases (ChatBox MCP) | [`agent-test-plan.md`](./agent-test-plan.md) §13–§19 |
| Technical design | [`agent-design.md`](./agent-design.md) |

**Status:** MVP-1 and **MVP-2 accepted** 2026-08-19 (operator confirmed usable). User stories and Given-When-Then acceptance criteria in this file.

### Given-When-Then conventions

One behavior per scenario. Each feature is tagged **agent** (gateway/tools) or **app** (management web-app). User-visible copy is **i18n keys** (`EN` default; `CN`, `HK`, `TW`). Tests assert keys (and interpolated data), not a single language's sentence. Protocol ids are not localized.

How we automate these scenarios: [`agent-test-plan.md`](./agent-test-plan.md).

**AC Status:** MVP-2 **accepted** 2026-08-19 (operator confirmed usable). Vendor honesty ([ADR-021](../../workspace-specs/adr/ADR-021-live-vendor-no-fixture.md), [`agent-test-plan.md`](./agent-test-plan.md) §1.1): AMAP search **live-honest**; Google search **live-honest**; Feature 8 Tripadvisor enrich **live-honest**; Feature 9 itinerary weather **live-honest**. Feature 9 **timed**: Chinese assembled queries (US11 AC7); corridor pin search (US11 AC2) — live T05 G01 day3 nearer dest than day1; AMAP-only D01 returned visits with `source: directions`. Features 2 and 10: HTTP + fixture CI; chat HTTP-only ([ADR-020](../../workspace-specs/adr/ADR-020-http-only-chat-and-enrich.md)). ChatBox TC-C deferred ([ADR-019](../../workspace-specs/adr/ADR-019-http-first-user-test-automation.md)). Quality gates: [ADR-024](../../workspace-specs/adr/ADR-024-quality-gates-typescript-7.md). Do not write AC status **implemented** in place of `live-honest` / `fail-closed` / `fixture-only`.

**Default preconditions:** Unless a scenario says otherwise: the caller presents a valid caller API key; requested map vendors are configured.

## Personas

| Persona | Who | Value |
| --- | --- | --- |
| Restaurant app caller | what2eat BFF | Restaurant search and details without owning map vendors |
| Trip app caller | where2play BFF | Place search, details, navigation, itinerary engine |
| Agent host | MCP host (e.g. chatboxai.app) | Same tools via MCP; natural-language place chat |
| Traveler | End user of those callers | Find places, open maps, follow a trip plan |
| Operator | Person who deploys places-agent | Credentials, map-vendor availability, no destination-forced vendor choice |
| Admin | Operator of the places.agent-mate.ai management app | Sign in, invite admins, issue and revoke caller API keys |

## Terms (avoid mixing these)

| Term | Means | Not this |
| --- | --- | --- |
| **Map vendor** | AMAP, Google Maps, Tripadvisor — who the agent queries. Request field stays `providers[]`. | HTTP vs MCP; driving/transit directions |
| **Place-card sources** | `sources[]` on a result: which vendor(s) the card came from, logos, deep links; optional merge of duplicates | Which vendors to call (that is map-vendor selection) |
| **Access channel** | How a caller reaches the agent: HTTP API or MCP | Getting a traveler to a place |
| **Directions** | Route, ETA, or a map-app deep link to a place (Feature 4) | HTTP vs MCP |
| **Caller API key** | Secret issued in the management app; callers send it to use HTTP/MCP tools | Map-vendor keys (AMAP / Google / Tripadvisor), which never appear in this UI |
| **Agent id** | Machine id **`places-agent`**. Callers see it on MCP `serverInfo.name` and HTTP field `agent`. | Hostname `places.agent-mate.ai`; ChatBox display title; tool name prefixes |
| **Category `agent`** | Gateway / tool-core stories | Management web-app |
| **Category `app`** | Management web-app on places.agent-mate.ai | what2eat / where2play product screens |
| **Output locale** | Product ids `CN`, `HK`, `TW`, `EN` (see i18n table). Caller or admin selects these. | Map-vendor selection; search destination |

## i18n (product-wide)

All **caller-visible** and **admin-app** strings (labels, buttons, empty states, errors, emails, notifications, chat replies, itinerary copy meant for display) are **i18n keys**, not a single language's copy.

Supported output locales (four, not two):

| Product id | BCP 47 | Language |
| --- | --- | --- |
| `EN` | `en` | English (default) |
| `CN` | `zh-CN` | Simplified Chinese (mainland phrasing) |
| `HK` | `zh-HK` | Traditional Chinese, Hong Kong dialect |
| `TW` | `zh-TW` | Traditional Chinese, Taiwan dialect |

`HK` and `TW` both use Traditional characters but **different wording**. Do not treat them as a 繁簡 conversion of `CN`.

- Default locale: `EN`
- Locale-sensitive values (dates, times, numbers, distance, currency/price signals) use locale-aware formatting for the requested locale(s)
- Missing translation → fall back to `EN`, then to the key; never fail the request solely because a catalog entry is missing
- Protocol ids (`places-agent`, `AMAP`, `GOOGLE_MAPS`, `TRIPADVISOR`, `OPEN_METEO`, `CN` / `HK` / `TW` / `EN`, preference ids), default admin username `admin`, default admin email `me@ethanhuang.com`, and operator logs are not localized
- Open-Meteo weather **labels** are localized: `weather_code` → key `weather.wmo.{code}` in the requested locale(s). Do not show English Open-Meteo documentation strings in `CN` / `HK` / `TW` (ADR-014)
- Management-app catalogs: Feature 19. Agent tool/chat/itinerary output: Feature 13.

## Non-goals (this backlog)

- what2eat / where2play screens, branding, or product Quanzil
- Hard rule "search destination in mainland China ⇒ AMAP only"
- LLM switched by search destination
- Deploy topology, Portainer stacks, umbrella git layout
- Public self-registration of admin users (register is disabled; invite-only)
- Editing or displaying map-vendor keys (AMAP / Google / Tripadvisor) in the management app

---

## MVP plan (two slices, by agent capability)

Slices follow **what the agent can do**, not "admin vs gateway vs intelligence." Every **app** feature (14–19) is **MVP-1**. Do not start MVP-2 while any of 14–19 is unfinished.

**Capabilities** (tools + the chat loop). Shared plumbing is listed with the first capability that needs it.

| Capability | What callers get | Features | Slice |
| --- | --- | --- | --- |
| **Operate** | Sign in, invite, issue keys, locale chrome, instruction page | **14, 15, 16, 17, 18, 19** (all admin UI) | **MVP-1** |
| **Call** | HTTP + MCP as `places-agent`; caller-key auth | **11, 12** | **MVP-1** |
| **Search restaurants** | Restaurant discovery with cards, provenance, geocode, deep links, locales | **1, 3, 4, 5, 6, 7, 13** | **MVP-1** |
| **Search places** | Non-restaurant POI discovery (same card/vendor contract) | **2** | **MVP-2** |
| **Plan itinerary** | Multi-stop plan + Open-Meteo weather labels | **9** | **MVP-2** |
| **Enrich Tripadvisor** | Optional ratings/content by name + location | **8** | **MVP-2** |
| **Place chat** | NL tool loop on Quanzil over the tools already shipped | **10** | **MVP-2** |

| Slice | Outcome | Features |
| --- | --- | --- |
| **MVP-1 — Operate, call, search restaurants** | Admin UI complete. Keys work on HTTP and MCP. what2eat can search restaurants, open details, and get map links. No Quanzil loop. | **14–19** · **11, 12** · **1, 3, 4, 5, 6, 7, 13** |
| **MVP-2 — Places, itinerary, enrich, chat** | where2play can search POIs and request a structured itinerary (weather keys in Feature 13). Tripadvisor match on cards. ChatBox NL chat reuses the tool core. | **2, 9, 8, 10** |

**MVP-1 notes**

- All management screens land here: home, login/users, landing, caller keys, instructions, admin i18n.
- Health `/v1/health` (and alias) is part of Feature 11. Feature 11 in this slice means both transports, initialize/identity, keyed auth errors, **and** HTTP/MCP parity for `search_restaurants` (and the supporting tools in this slice). Do not claim Feature 11 done if `/mcp` is missing.
- Feature 13 in this slice is restaurant/card/tool errors and locale output. `weather.wmo.*` waits for Feature 9 (MVP-2).
- One adapter path is enough to start (e.g. `GOOGLE_MAPS`); Feature 6 still requires `providers[]` validation and no silent vendor swap.
- NL chat must not be used as the only way to search.

**MVP-2 notes**

- Slice **accepted** 2026-08-19 (operator confirmed usable). Quality: [ADR-024](../../workspace-specs/adr/ADR-024-quality-gates-typescript-7.md). ChatBox TC-C remains deferred ([ADR-019](../../workspace-specs/adr/ADR-019-http-first-user-test-automation.md)).

- `search_places` reuses MVP-1 vendors, sources, details, geocode, navigate, and locale catalogs. Do not invent a second card shape.
- `plan_itinerary` calls the same tool core. Open-Meteo is a helper inside itinerary, not a `providers[]` vendor.
- Tripadvisor enrich is optional on search/details; never pass Google `place_id` as a Tripadvisor id.
- NL chat is a Quanzil loop over tools from MVP-1 and this slice. Do not invent a second tool core.

**Build order inside a slice:** one user story to DoD at a time ([`agent-design.md`](./agent-design.md) §16). Suggested MVP-1 order: **14 → 15 → 16 → 19 → 18 → 17 → 12 → 11 → 6 → 5 → 1 → 3 → 7 → 4 → 13**. Suggested MVP-2 order: **2 → 9 → 8 → 10**. **MVP-3a:** 20 → 21.

---

# Part 1 — Product backlog

| # | Category | Feature Name | Feature Code | Description | Acceptance Criteria | MVP |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | agent | Restaurant search | `places-agent-search-restaurants` | Search restaurants by location and criteria via the caller's requested providers | below | **1** |
| 2 | agent | Place search | `places-agent-search-places` | Search non-restaurant places (attractions, POIs) the same way | below | **2** |
| 3 | agent | Place details | `places-agent-place-details` | Fetch details for a known place using a provider-native id | below | **1** |
| 4 | agent | Navigation helpers | `places-agent-navigate` | Return secret-free navigation deep links and URLs for a place | below | **1** |
| 5 | agent | Geocoding | `places-agent-geocode` | Geocode and reverse-geocode as needed so search can run from an address or a pin | below | **1** |
| 6 | agent | Map vendor selection | `places-agent-map-vendors` | Callers pass which **map vendors** to query (`providers[]`); agent validates credentials and capabilities; no silent vendor swap. `GOOGLE_MAPS` uses direct REST then Cloudflare Worker MCP (ADR-017) | below | **1** |
| 7 | agent | Place-card sources | `places-agent-card-sources` | Every place card lists `sources[]`; optional merge of duplicates; the **app** chooses which map deep link to open | below | **1** |
| 8 | agent | Tripadvisor enrichment | `places-agent-tripadvisor-enrich` | Optional Tripadvisor ratings/content by name + location match; never pass Google `place_id` as an id | below | **2** |
| 9 | agent | Itinerary planning | `places-agent-plan-itinerary` | Structured itinerary suggestions from trip bounds, place results, and traveler preferences (including natural-language); trip UX stays on the caller | below | **2** |
| 10 | agent | Natural-language place chat | `places-agent-nl-chat` | Traveler asks in natural language (optional file/image upload); agent runs a tool loop on server Quanzil | below | **2** |
| 11 | agent | HTTP API and MCP | `places-agent-http-mcp` | Same tools over the HTTP API (app BFFs) and MCP (agent hosts); both identify the service as `places-agent` | below | **1** |
| 12 | agent | Caller API key auth | `places-agent-caller-trust` | Serve HTTP/MCP only to callers authenticated with a **caller API key**; map-vendor keys stay on the agent; user-visible errors as i18n keys | below | **1** |
| 13 | agent | Bilingual output | `places-agent-bilingual-output` | Agent user-visible output in `EN` / `CN` / `HK` / `TW`; one locale or a bilingual pair. Open-Meteo `weather.wmo.*` keys land with Feature 9 | below | **1** |
| 14 | app | Admin home | `places-agent-admin-home` | Public home: link to agent instructions (Feature 18) and an admin login control | below | **1** |
| 15 | app | Admin login and users | `places-agent-admin-users` | Admin sign-in, default admin, password reset and invites via Resend; public register disabled | below | **1** |
| 16 | app | Admin landing | `places-agent-admin-landing` | After login: left navigator; header with agent instruction link and greeting with the signed-in user name | below | **1** |
| 17 | app | Caller API keys | `places-agent-admin-api-keys` | Create, edit, regenerate, delete caller API keys; copy secret | below | **1** |
| 18 | app | Agent instruction | `places-agent-admin-instructions` | How to call places.agent-mate.ai; two entries — public home link and post-login header link | below | **1** |
| 19 | app | Admin app i18n | `places-agent-admin-i18n` | Management UI and emails in `EN` / `CN` / `HK` / `TW`; locale switch; missing-key fallback | below | **1** |
| 20 | agent | Provider auto-selection | `places-agent-provider-auto` | 智能体根据目的地+语言自动选择 provider 组合（策略1 Google+TA / 策略2 AMAP），caller 可覆盖 | below | **3a** |
| 21 | infra | Server stability | `places-agent-server-stability` | JSON 解析安全、graceful shutdown、session TTL 清理 | below | **3a** |

---

# Part 2 — User stories

## `places-agent-search-restaurants` — Restaurant search

Search restaurants by location and criteria via one or more requested place providers.

### User Story 1 — Search restaurants near a location

**As a** restaurant app caller
**I want to** search restaurants near coordinates or a named area, with optional criteria (cuisine, keyword, open now)
**So that** I can recommend dining options without owning map-vendor adapters

#### AC1

```gherkin
Scenario: Search restaurants near coordinates with a keyword
  Given the caller requests map vendor GOOGLE_MAPS
  And restaurants matching "ramen" exist near lat 22.28 lng 114.17
  When the caller searches restaurants with keyword "ramen" near that pin
  Then the caller receives one or more restaurant cards
  And each card is a dining place
  And each card includes name and coordinates
```

#### AC2

```gherkin
Scenario: Search restaurants by named area and cuisine
  Given the caller requests map vendor AMAP
  And hotpot restaurants exist in Shanghai
  When the caller searches restaurants with cuisine "hotpot" near named area "Shanghai"
  Then the caller receives restaurant cards for that area
  And each card source provider is AMAP
```

#### AC3

```gherkin
Scenario: Live AMAP geocodes an address then searches nearby by cuisine
  Given the caller requests map vendor AMAP
  And PLACES_VENDOR_MODE is live
  And AMAP Web 服务 is configured
  When the caller searches restaurants with cuisine "barbecue" and address "上海地铁十号线紫藤路站" and no near pin
  Then the agent geocodes the address
  And the agent searches around that pin with dining type 050000
  And the search keywords include 烧烤
  And returned cards have provider AMAP and crs GCJ-02
  And no native_id starts with fixture_
```

### User Story 2 — Empty restaurant search

**As a** restaurant app caller
**I want to** receive a distinct empty outcome when no restaurants match
**So that** my product can show an empty state instead of a blank or invented list

#### AC1

```gherkin
Scenario: No restaurants match
  Given the caller requests a configured map vendor
  And no restaurants match keyword "xyznonexistentplace"
  When the caller searches restaurants with that keyword near a valid pin
  Then the result list is empty
  And the outcome key is errors.empty_results
  And the agent does not invent restaurant cards
```

### User Story 3 — Restaurant search when a provider fails

**As a** restaurant app caller
**I want to** learn that a requested provider failed or was skipped, with a reason key
**So that** I can degrade (other providers' results, or a visible error) instead of failing silently

#### AC1

```gherkin
Scenario: One requested vendor fails and another returns restaurants
  Given the caller requests AMAP and GOOGLE_MAPS
  And AMAP cannot complete this search
  And GOOGLE_MAPS returns at least one restaurant
  When the caller searches restaurants near a valid pin
  Then the caller receives the GOOGLE_MAPS restaurant cards
  And skipped vendors include AMAP with reason key errors.provider_failed
```

#### AC2

```gherkin
Scenario: All requested vendors fail
  Given the caller requests GOOGLE_MAPS
  And GOOGLE_MAPS cannot complete this search (direct REST and Cloudflare Worker MCP both fail or the Worker is unconfigured after a direct failure)
  When the caller searches restaurants near a valid pin
  Then the result list is empty
  And skipped vendors include GOOGLE_MAPS with reason key errors.provider_failed
  And the agent does not invent restaurant cards
  And the agent does not fill the list from AMAP
```

---

## `places-agent-search-places` — Place search

Search non-restaurant places (attractions, parks, museums, and other POIs) the same way as restaurant search.

### User Story 1 — Search attractions and POIs

**As a** trip app caller
**I want to** search non-restaurant places near a destination with optional criteria
**So that** I can populate trip ideas without owning map-vendor adapters

#### AC1

```gherkin
Scenario: Search attractions near a destination
  Given the caller requests map vendor GOOGLE_MAPS
  And museums exist near lat 35.68 lng 139.76
  When the caller searches places with keyword "museum" near that pin
  Then the caller receives one or more place cards
  And each card includes name and coordinates
```

### User Story 2 — Place search stays non-dining

**As a** trip app caller
**I want to** receive attractions and other POIs, not a dining-dominated list
**So that** play/trip results stay relevant to sightseeing and activities

#### AC1

```gherkin
Scenario: Place search does not return a dining-dominated list
  Given the caller requests a configured map vendor
  And both restaurants and museums exist near the pin
  When the caller searches places with keyword "museum" near that pin
  Then returned cards are attractions or other non-restaurant POIs
  And dining venues are not the bulk of the list
```

### User Story 3 — Empty or failed place search

**As a** trip app caller
**I want to** receive a distinct empty outcome or a skip/error reason key when search yields nothing or a provider cannot run
**So that** my product can show an honest empty or error state

#### AC1

```gherkin
Scenario: No places match
  Given the caller requests a configured map vendor
  And no places match the keyword
  When the caller searches places with that keyword near a valid pin
  Then the result list is empty
  And the outcome key is errors.empty_results
```

#### AC2

```gherkin
Scenario: Requested vendor cannot run place search
  Given the caller requests a map vendor that cannot complete place search
  When the caller searches places near a valid pin
  Then the result list is empty
  And skipped vendors include that vendor with a reason key
```

---

## `places-agent-place-details` — Place details

Fetch details for a place the caller already identified, using that provider's native place id.

### User Story 1 — Fetch details for a known place

**As a** caller
**I want to** load details (name, address, coordinates, hours, rating, contact, photos, category) for a known place
**So that** I can show a place card without a second full search

#### AC1

```gherkin
Scenario: Load details for a known place id
  Given a place exists on GOOGLE_MAPS with a native place id
  And the caller requests map vendor GOOGLE_MAPS
  When the caller asks for details of that place id
  Then the caller receives one place card
  And the card includes name, address, and coordinates
  And hours, rating, contact, photos, and category are included when the vendor provides them
```

### User Story 2 — Unknown or unresolvable place

**As a** caller
**I want to** receive a clear not-found / unresolvable outcome when the id is unknown or the provider cannot resolve it
**So that** I do not display a fabricated place

#### AC1

```gherkin
Scenario: Unknown place id
  Given the caller requests a configured map vendor
  And no place exists for id "not-a-real-place-id"
  When the caller asks for details of that id
  Then the outcome key is errors.place_not_found
  And the agent does not return a fabricated place card
```

---

## `places-agent-navigate` — Navigation helpers

Return navigation deep links and URLs for a place. Links must not contain secrets.

### User Story 1 — Navigation links for a place

**As a** caller
**I want to** receive navigation deep links and web URLs for a place
**So that** the traveler can open directions in a map app from my product

#### AC1

```gherkin
Scenario: Receive navigation links for a known place
  Given a place card has coordinates and at least one map vendor source
  When the caller asks for navigation for that place
  Then the caller receives at least one web URL or app deep link
  And a traveler can open directions from that link
```

### User Story 2 — Links contain no secrets

**As a** traveler
**I want to** open those links on my device without exposing vendor API keys
**So that** map credentials stay on the agent, not in the browser or chat client

#### AC1

```gherkin
Scenario: Navigation links omit vendor keys
  Given a place has AMAP or GOOGLE_MAPS navigation links
  When the caller asks for navigation for that place
  Then no returned URL contains an AMAP, Google, or Tripadvisor API key
```

### User Story 3 — All available links, no forced map app

**As a** caller
**I want to** receive every available secret-free link (AMAP, Google Maps, and others when present)
**So that** my UI can choose which map to open from the **client environment**, not from search destination inside the agent

#### AC1

```gherkin
Scenario: Agent returns every available link
  Given a place has both an AMAP link and a Google Maps link
  When the caller asks for navigation for that place
  Then both the AMAP link and the Google Maps link are present
  And the agent does not drop a link because the search destination is in mainland China
```

---

## `places-agent-geocode` — Geocoding

Turn addresses into coordinates and coordinates into addresses so search can run when the traveler typed a place name or dropped a pin. May be internal at first, or exposed as tools later.

### User Story 1 — Address to coordinates

**As a** caller
**I want to** turn a city or address into coordinates
**So that** restaurant/place search can run when the traveler typed a location instead of dropping a pin

#### AC1

```gherkin
Scenario: Geocode a named city
  Given the caller requests map vendor AMAP
  And AMAP can geocode
  When the caller geocodes address "People's Square, Shanghai"
  Then the caller receives latitude and longitude
```

### User Story 2 — Coordinates to address

**As a** caller
**I want to** turn coordinates into a human-readable address
**So that** I can label a map pin in the traveler's locale

#### AC1

```gherkin
Scenario: Reverse geocode a pin
  Given the caller requests map vendor GOOGLE_MAPS
  And GOOGLE_MAPS can reverse-geocode
  And output locale is EN
  When the caller reverse-geocodes lat 22.28 lng 114.17
  Then the caller receives a human-readable address for locale EN
```

### User Story 3 — Geocode unsupported by requested provider

**As a** caller
**I want to** receive a skip or error reason key when a requested provider cannot geocode (for example Tripadvisor)
**So that** I am not given a silent wrong vendor or a fake coordinate

#### AC1

```gherkin
Scenario: Tripadvisor cannot geocode
  Given the caller requests only TRIPADVISOR
  When the caller geocodes address "Tokyo"
  Then no coordinates are invented
  And skipped vendors include TRIPADVISOR with reason key errors.provider_capability_unsupported
```

---

## `places-agent-map-vendors` — Map vendor selection

Callers pass which **map vendors** to query (`providers[]`: `AMAP`, `GOOGLE_MAPS`, `TRIPADVISOR`). The agent validates credentials and the capability matrix. It does **not** force mainland destinations to AMAP. This is not HTTP vs MCP (Feature 11), and not driving/transit directions.

**`GOOGLE_MAPS` transport (ADR-017):** direct Google Maps Platform REST first; on egress failure only, Cloudflare Worker MCP (`GMAPS_MCP_*`). Cards stay tagged `GOOGLE_MAPS`. The Worker is not a `providers[]` id. Do not fall back to AMAP unless the caller asked for `AMAP`. If the Worker is unconfigured after a direct failure, skip Google with a reason key.

### User Story 1 — Caller chooses map vendors per request

**As a** caller
**I want to** pass which map vendors to query for this request (for example `AMAP`, `GOOGLE_MAPS`, `TRIPADVISOR`)
**So that** my product policy stays in my app, not hard-coded in the agent

#### AC1

```gherkin
Scenario: Only requested vendors are queried
  Given AMAP and GOOGLE_MAPS are both configured
  When the caller searches restaurants with providers AMAP only
  Then returned cards are sourced from AMAP
  And GOOGLE_MAPS is not queried for this request
```

### User Story 2 — Unsupported or unconfigured map vendor is explicit

**As a** caller
**I want to** receive a clear skip or error with a reason key when a requested map vendor is unsupported, unconfigured, or lacks credentials
**So that** I never silently receive a different vendor

#### AC1

```gherkin
Scenario: Unconfigured vendor is skipped with a reason key
  Given AMAP has no credentials
  When the caller searches restaurants with providers AMAP
  Then the result list is not silently filled from another vendor
  And skipped vendors include AMAP with reason key errors.provider_unconfigured
```

#### AC2

```gherkin
Scenario: Unknown vendor id is explicit
  Given the caller requests providers "NOT_A_VENDOR"
  When the caller searches restaurants near a valid pin
  Then skipped vendors include NOT_A_VENDOR with a reason key
  And the agent does not map that id to AMAP or GOOGLE_MAPS
```

### User Story 3 — Search destination does not pick the vendor

**As a** caller
**I want** search destination (for example Shanghai vs Tokyo) **not** to override my `providers[]`
**So that** mainland vs overseas map-vendor policy remains my decision

#### AC1

```gherkin
Scenario: Shanghai destination does not force AMAP
  Given GOOGLE_MAPS is configured
  And the search pin is in Shanghai
  When the caller searches restaurants with providers GOOGLE_MAPS
  Then the agent queries GOOGLE_MAPS
  And the agent does not replace GOOGLE_MAPS with AMAP because the destination is in mainland China
```

### User Story 4 — Google Maps uses Cloudflare Worker MCP as transport fallback

**As a** caller who requested `GOOGLE_MAPS`
**I want** the agent to use the configured Cloudflare Worker MCP when it cannot reach `maps.googleapis.com`
**So that** I still get Google place cards tagged `GOOGLE_MAPS`, not AMAP and not a fourth vendor id

#### AC1

```gherkin
Scenario: Direct Google REST fails then Worker MCP succeeds
  Given the caller requests providers GOOGLE_MAPS
  And GMAPS_MCP_URL and GMAPS_MCP_BEARER are configured
  And direct maps.googleapis.com fails with an egress error
  And the Cloudflare Worker MCP returns at least one restaurant
  When the caller searches restaurants near a valid pin
  Then the caller receives restaurant cards tagged GOOGLE_MAPS
  And sources do not include a provider id GMAPS_MCP
  And AMAP is not queried
```

#### AC2

```gherkin
Scenario: Direct Google succeeds so Worker MCP is not used
  Given the caller requests providers GOOGLE_MAPS
  And direct maps.googleapis.com returns restaurants
  When the caller searches restaurants near a valid pin
  Then the caller receives restaurant cards tagged GOOGLE_MAPS
  And the Cloudflare Worker MCP is not called
```

#### AC3

```gherkin
Scenario: Direct Google fails and Worker MCP is unconfigured
  Given the caller requests providers GOOGLE_MAPS
  And direct maps.googleapis.com fails with an egress error
  And GMAPS_MCP_URL or GMAPS_MCP_BEARER is missing
  When the caller searches restaurants near a valid pin
  Then skipped vendors include GOOGLE_MAPS with a reason key
  And the result list is not silently filled from AMAP
```

---

## `places-agent-card-sources` — Place-card sources

Every place card lists which **map vendors** it came from (`sources[]`). Optional merge clusters the same venue from more than one vendor into one card. The **app** chooses which map-app deep link to open. This is not "which vendors to call" (Feature 6) and not HTTP vs MCP (Feature 11).

### User Story 1 — Every card lists its sources

**As a** caller
**I want to** receive `provider` and/or `sources[]` on every place card (vendor id, optional logo URL, deep links)
**So that** I can show source logos and offer map links without guessing the vendor

#### AC1

```gherkin
Scenario: Each restaurant card carries source metadata
  Given the caller searches restaurants with providers GOOGLE_MAPS
  And at least one restaurant is returned
  When the caller receives the result list
  Then each card has provider or sources
  And each source includes a vendor id
  And logo URL and deep links are present when the vendor provides them
```

### User Story 2 — Optional merge of the same place

**As a** caller
**I want to** optionally merge the same venue from multiple map vendors into one card with multiple `sources[]` and a `primary_provider`
**So that** the traveler sees one place, not duplicate cards

#### AC1

```gherkin
Scenario: Merge on clusters the same venue
  Given GOOGLE_MAPS and TRIPADVISOR both return the same venue near the pin
  When the caller searches with merge enabled
  Then that venue appears as one card
  And the card's sources include GOOGLE_MAPS and TRIPADVISOR
  And the card has a primary_provider
```

#### AC2

```gherkin
Scenario: Merge off keeps separate cards
  Given GOOGLE_MAPS and TRIPADVISOR both return the same venue
  When the caller searches with merge disabled
  Then the caller may receive more than one card for that venue
```

### User Story 3 — App chooses which map to open

**As a** traveler
**I want** my app to pick which map deep link to open from my client environment (for example prefer AMAP on a mainland device when that link is present)
**So that** the agent stays a data gateway and does not rewrite navigation from destination alone

#### AC1

```gherkin
Scenario: Agent does not pick the map app from destination
  Given a merged card has both an AMAP deep link and a Google Maps deep link
  When the caller receives the card
  Then both deep links remain on the card
  And the agent does not mark a single link as the only one to open based on search destination
```

---

## `places-agent-tripadvisor-enrich` — Tripadvisor enrichment

Optional, best-effort enrichment of primary results with Tripadvisor ratings/content. Match by name and location only.

### User Story 1 — Enrich primary results by name and location

**As a** caller
**I want to** optionally attach Tripadvisor ratings and content to primary results by matching name and location
**So that** travelers can see review signal without a second search

#### AC1

```gherkin
Scenario: Enrich Google results by name and location
  Given the caller searches with providers GOOGLE_MAPS and Tripadvisor enrich enabled
  And a Google restaurant named "Ichiran" near the pin matches a Tripadvisor place by name and location
  When the caller receives results
  Then the primary Google card includes Tripadvisor rating or content
  And the match used name and location, not a Google place id
```

### User Story 2 — Enrichment failure leaves primary results

**As a** caller
**I want** primary search results to remain when Tripadvisor enrichment fails or finds no match
**So that** a Tripadvisor outage does not wipe the list

#### AC1

```gherkin
Scenario: Tripadvisor outage does not wipe search
  Given GOOGLE_MAPS returns restaurants
  And Tripadvisor enrich is enabled
  And Tripadvisor cannot complete enrichment
  When the caller searches restaurants
  Then the Google restaurant cards remain
  And enrichment failure is reported with a reason key
```

#### AC2

```gherkin
Scenario: No Tripadvisor match leaves primary card
  Given GOOGLE_MAPS returns a restaurant with no Tripadvisor name-and-location match
  And Tripadvisor enrich is enabled
  When the caller searches restaurants
  Then that restaurant card remains
  And missing enrich does not remove the card
```

### User Story 3 — No Google id passed to Tripadvisor

**As a** caller
**I want** the agent never to send a Google `place_id` (or other Google-native id) to Tripadvisor as a place identifier
**So that** enrichment does not misuse vendor ids or leak them across providers

#### AC1

```gherkin
Scenario: Enrichment does not use Google place id as a Tripadvisor id
  Given Tripadvisor enrich is enabled for a Google search
  When the agent enriches a Google restaurant
  Then Tripadvisor is queried with name and location
  And a Google place id is not sent to Tripadvisor as a place identifier
```

#### AC2

```gherkin
Scenario: Live Terra nearby uses lat and lon only
  Given PLACES_VENDOR_MODE is live
  And TRIPADVISOR_API_KEY is configured
  And Tripadvisor enrich is enabled
  When the agent enriches a Google restaurant
  Then the agent calls Terra GET /locations/nearby with lat, lon, radius, and unit=KM
  And the request does not include location_id
  And the request URL does not contain a Google or AMAP native_id
  And a matched card tripadvisor url does not start with a fixture path
```

---

## `places-agent-plan-itinerary` — Itinerary planning

Build structured itinerary suggestions from trip bounds, place results, and traveler preferences. The planning engine lives here; trip screens, editing, save, and share stay on where2play. Preference **ids** (`tight`, `medium`, `relaxed`, `premium`, `budget`, `transit_preferred`, and similar) are protocol, not localized. Display labels in caller UIs and any NL replies use i18n keys.

### User Story 1 — Plan from trip bounds and places

**As a** trip app caller
**I want to** receive a structured itinerary suggestion from trip time/place bounds and place results
**So that** I can present a plan without owning planning logic

#### AC1

```gherkin
Scenario: Plan from time bounds and place results
  Given the caller has two days in Tokyo
  And place results include at least three attractions
  When the caller asks for an itinerary from those bounds and places
  Then the caller receives a structured itinerary with days or time blocks
  And planned stops come from the provided places
```

### User Story 2 — Plan is data the caller can present

**As a** trip app caller
**I want** the itinerary as structured data I can show, edit, save, and share in my own UX
**So that** where2play stays the trip product and the agent stays the engine

#### AC1

```gherkin
Scenario: Itinerary is structured data, not a finished trip product
  Given a valid itinerary can be produced
  When the caller asks for an itinerary
  Then the response is structured data the caller can show, edit, save, or share
  And the agent does not claim to have saved a trip in where2play
```

### User Story 3 — Unusable bounds or no places

**As a** trip app caller
**I want to** receive a clear outcome when bounds are missing/invalid or there are no places to plan with
**So that** I can show an error or empty state instead of an invented itinerary

#### AC1

```gherkin
Scenario: Missing bounds
  Given the caller has place results
  And trip time bounds are missing
  When the caller asks for an itinerary
  Then the outcome key is errors.bounds_invalid
  And the agent does not invent an itinerary
```

#### AC2

```gherkin
Scenario: No places to plan with
  Given valid trip time bounds
  And the place list is empty
  When the caller asks for an itinerary
  Then the outcome key is errors.no_places_to_plan
  And the agent does not invent stops
```

### User Story 4 — Plan per preference (including natural language)

**As a** trip app caller
**I want to** pass traveler preferences when asking for a plan — pace (`tight`, `medium`, `relaxed`), spend (`premium`, `budget`), transport (`transit_preferred` / transportation-services preferred), and similar — either as structured ids or as natural-language text in a supported locale (`EN`, `CN`, `HK`, `TW`)
**So that** the itinerary matches how the traveler wants to move, spend, and fill the day, without the caller owning planning logic

When the plan includes weather from Open-Meteo, condition text follows Feature 13 / ADR-014 (catalog keys, not English Open-Meteo phrases).

#### AC1

```gherkin
Scenario: Structured pace and spend preferences
  Given valid bounds and place results
  When the caller asks for an itinerary with pace tight and spend budget
  Then the plan reflects a tighter schedule and lower-spend stops than a relaxed premium request on the same places
```

#### AC2

```gherkin
Scenario: Transit preference
  Given valid bounds and place results
  And public-transport options exist among the places
  When the caller asks for an itinerary with transit_preferred
  Then the plan prefers public transportation or transportation services over a default that ignores that preference
```

#### AC3

```gherkin
Scenario: Natural-language preferences in a supported locale
  Given valid bounds and place results
  And output locale is EN
  When the caller asks for an itinerary with natural-language preference "relaxed weekend, budget, prefer metro"
  Then the plan is produced using equivalent preference ids
  And the caller is not required to send only structured ids
```

### User Story 5 — Live Open-Meteo forecast on itinerary days

**As a** trip app caller
**I want** the itinerary to use a live Open-Meteo forecast for each day's weather
**So that** weather data comes from the real forecast API and not a fixture, and the plan degrades gracefully when Open-Meteo is unavailable

#### AC1

```gherkin
Scenario: Live forecast uses lat and lon only
  Given PLACES_VENDOR_MODE is live
  And Open-Meteo forecast is reachable
  When the caller asks for an itinerary with places that have coordinates
  Then the agent calls GET /forecast with latitude, longitude, daily weather_code and temperatures, and timezone=auto
  And the request does not use AMAP weatherInfo or Google Weather
  And day weather_code is a number from the forecast, not the fixture signature 80 with temps 24/18
```

#### AC2

```gherkin
Scenario: Open-Meteo failure keeps the itinerary
  Given PLACES_VENDOR_MODE is live
  And Open-Meteo HTTP or network fails
  When the caller asks for an itinerary
  Then the itinerary days and stops remain
  And weather is omitted or skipped with errors.weather_unavailable
```

### User Story 6 — Timed day plan with origin (detail timed)

**As a** trip app caller
**I want to** request `detail: "timed"` with an **origin** (e.g. hotel name or pin), trip bounds, and preferences
**So that** I receive clock-slotted visit blocks for **every** day in bounds, deeplink travel options with weather buffers, and explicit weather planning impact — without owning the day engine

When `places` is empty, timed auto-search uses **city** query text, not the hotel or destination-tower as the keyword. Locale CN/HK/TW **or** CJK in origin/destination/NL → assembled `search_places` / `search_restaurants` queries are Chinese (CN simplified, HK/TW traditional); caller `query` is never rewritten. With origin **and** destination across multiple days, each day searches near an interpolated pin along that corridor. `search_anchor` is the city when origin is omitted. `days[].day_index` starts at **1**.

#### AC1

```gherkin
Scenario: Timed plan fills all days with clock slots from origin
  Given detail is timed
  And origin is a hotel name or lat/lng
  And bounds span five calendar days
  And places is empty or provided
  When the caller asks for plan_itinerary
  Then the response includes origin and timezone
  And data.days length equals the calendar day count
  And each day with visits has blocks kind visit with slot start and end
  And legs_to_here include deeplink options with duration_min and weather_buffer_min
  And no native_id starts with fixture_ when PLACES_VENDOR_MODE is live
```

#### AC2

```gherkin
Scenario: Timed plan auto-searches when places empty
  Given detail is timed
  And origin and bounds are valid
  And places is empty
  When the caller asks for plan_itinerary
  Then the agent searches places near the origin
  And visit places come from search results, not invented names
```

#### AC3

```gherkin
Scenario: Stops mode unchanged when detail omitted or stops
  Given detail is stops or omitted
  And places is empty
  When the caller asks for plan_itinerary
  Then the outcome key is errors.no_places_to_plan
```

### User Story 7 — Weather shapes the timed plan

**As a** trip app caller
**I want** Open-Meteo daily weather to change leg buffers / mode ranking hints and to appear as `planning_impact` on each day
**So that** bad weather is visible in the result and not only as a WMO label

#### AC1

```gherkin
Scenario: Adverse weather adds walk buffer and labels impact
  Given detail is timed
  And Open-Meteo returns a rain weather_code for a day
  When the caller asks for plan_itinerary
  Then that day has planning_impact.severity adverse or severe
  And walk legs on that day have weather_buffer_min greater than 0
  And planning_impact.summary_key is a catalog key, not English Open-Meteo prose
```

#### AC2

```gherkin
Scenario: Fair weather has zero walk weather buffer
  Given detail is timed
  And Open-Meteo returns a clear or mainly clear code and mild temperatures
  When the caller asks for plan_itinerary
  Then planning_impact.severity is fair
  And walk weather_buffer_min is 0
```

### User Story 8 — Meals in the timed plan (Story B)

**As a** trip app caller
**I want** lunch, optional afternoon cafe/tea, and dinner option blocks on timed days (live restaurant search, ranked by spend; every meal option unique for the trip; visits unique for the trip)
**So that** the day plan is a one-stop visit + eat schedule without a separate meal search

Dinner is scheduled **18:00–20:00**. If the last visit ends before 17:00, a `meal: "cafe"` block can fill until dinner. CN/HK/TW timed search prefers AMAP **when the caller already listed AMAP** (does not inject AMAP). Venue identity is `native_id` (lowercase) or a normalized name. Same-day lunch options must not appear in cafe or dinner. Visit and meal POIs are mutually exclusive. If extra search still cannot fill a slot, **omit** that meal or visit — never reuse a venue already on the trip.

#### AC1

```gherkin
Scenario: Timed day includes lunch and dinner options with visit-derived slots
  Given detail is timed
  And bounds are valid and visits are scheduled
  And restaurant search returns at least two dining places near a visit
  When the caller asks for plan_itinerary
  Then days with visits include blocks kind meal for lunch and dinner when options remain
  And lunch.slot equals the gap between the morning and afternoon visit (not a fixed 12:00–13:30)
  And dinner.slot is 18:00–20:00 when the last visit ends at or before 18:00
  And if the last visit ends before 17:00 a cafe meal block may fill until 18:00
  And every lunch option identity is disjoint from that day's cafe and dinner options
  And each meal has up to two options with place cards and leg_from_previous
  And meal options with duration_min over 300 are dropped
  And no restaurant native_id starts with fixture_ when live
```

#### AC2

```gherkin
Scenario: Meal search failure or closed hours keeps visits
  Given detail is timed
  And restaurant search fails or returns empty for a meal slot
  Or all candidates are closed for the derived meal window
  When the caller asks for plan_itinerary
  Then visit blocks remain
  And that meal block is omitted or has fewer options
  And skipped may include errors.provider_failed or empty meal note
  And hours are never invented when the vendor omits them
```

#### AC3

```gherkin
Scenario: Meal legs use Directions when available
  Given detail is timed
  And Directions succeeds for a meal option
  When meal blocks are built
  Then leg_from_previous.source may be directions
  And at most two options are requested per meal
```

#### AC4

```gherkin
Scenario: Same-day meal options do not overlap
  Given detail is timed
  And lunch has two dining options
  When cafe and dinner are filled
  Then no lunch option identity appears in cafe or dinner
```

#### AC5

```gherkin
Scenario: Cross-day visits and meals are unique
  Given detail is timed and bounds span multiple days
  When the plan is built
  Then visit identities across all days are pairwise disjoint
  And meal option identities across all days are pairwise disjoint
  And a POI used as a visit is not also a meal option
```

#### AC6

```gherkin
Scenario: Insufficient unique venues omit the meal instead of repeating
  Given detail is timed
  And after extra restaurant search only one unused dining identity remains for dinner
  When meal blocks are built
  Then dinner is omitted
  And lunch native_id is not reused on dinner
```

### User Story 9 — Live direction legs (Story C)

**As a** trip app caller
**I want** travel legs to use vendor Directions ETAs when available (with weather buffers on top)
**So that** hour-by-hour travel times are not only haversine guesses

#### AC1

```gherkin
Scenario: Legs use vendor duration when Directions succeeds
  Given detail is timed
  And Google or AMAP Directions returns a duration for walk or transit or drive
  When the caller asks for plan_itinerary
  Then legs_to_here entries with a vendor ETA have source directions
  And duration_min equals base_duration_min plus weather_buffer_min
```

#### AC2

```gherkin
Scenario: Directions failure keeps deeplink heuristic legs
  Given detail is timed
  And Directions HTTP fails for a mode
  When the caller asks for plan_itinerary
  Then that mode keeps source heuristic or is omitted without inventing ETA
  And skipped may include errors.directions_unavailable for the failing provider id
  And visit blocks remain
```

#### AC3

```gherkin
Scenario: AMAP-only providers use AMAP Directions
  Given providers is AMAP only
  And AMAP Directions succeeds
  When the caller asks for plan_itinerary
  Then visit legs may have source directions without requiring Google
```

### User Story 10 — Opening hours mapping

**As a** caller
**I want** vendor opening hours to be mapped onto place cards
**So that** hours data reflects the vendor's actual field values and is absent rather than invented when the vendor omits it

#### AC1

```gherkin
Scenario: Vendor opening hours map to PlaceCard.hours
  Given Google regularOpeningHours or AMAP opentime fields are present
  When search or details returns a card
  Then PlaceCard.hours is a non-empty vendor-derived summary
  And hours is unset when the vendor omits opening data
```

### User Story 11 — Timed search allow/deny and destination bias

**As a** trip app caller
**I want** timed auto-search to exclude lodging, transit hubs, plazas, and landmark-restaurants, bias later days toward the destination, and number days from 1
**So that** visit pools contain real attractions and the day-by-day geography flows correctly

#### AC1

```gherkin
Scenario: Lodging is not used as timed visits
  Given detail is timed and places is empty
  And nearby search returns hostels mixed with attractions
  When the agent builds visits
  Then lodging name/category matches are excluded
  And the agent does not fall back to the unfiltered list
```

#### AC2

```gherkin
Scenario: Destination biases later days
  Given origin and destination are far apart
  And detail timed spans multiple days
  When places are distributed
  Then later-day visits are nearer the destination than earlier-day visits
```

#### AC3

```gherkin
Scenario: Plazas malls stations and landmark-as-restaurant are rejected
  Given timed auto-search returns plazas malls stations docks or scenic areas
  When attraction filter runs
  Then those cards are excluded from visit pools
  And dining filter excludes 广州塔 管理办 贵宾楼 even when category is restaurant
```

#### AC4

```gherkin
Scenario: Timed days are numbered from 1
  Given detail is timed or stops with a multi-day bounds
  When plan_itinerary succeeds
  Then days[0].day_index equals 1
```

#### AC5

```gherkin
Scenario: City search anchor not destination tower
  Given origin is omitted and destination is 广州塔 and NL mentions 广州
  When timed plan builds
  Then search_anchor is the city not the tower
```

#### AC6

```gherkin
Scenario: CN locale prefers AMAP when already listed
  Given locale is CN and providers include AMAP
  When timed auto-search runs
  Then AMAP is queried first
  And Google fills only if AMAP returns no usable attractions
  And AMAP is not injected when the caller omitted it
```

#### AC7

```gherkin
Scenario: Assembled search queries follow Chinese when locale or CJK names
  Given detail is timed and places is empty
  And locale is CN or HK or TW, or origin or destination or natural language contains CJK
  When the agent auto-searches places and restaurants
  Then assembled query strings use Chinese (simplified for CN, traditional for HK/TW)
  And they do not mix English museum/restaurant templates into that wave
  And a caller-supplied search query is forwarded unchanged
```

---

## `places-agent-nl-chat` — Natural-language place chat

Travelers ask for places in natural language, optionally with file uploads (including images). The agent runs a tool loop on **its** server Quanzil. LLM is not switched by search destination. Upload errors use i18n keys.

### User Story 1 — Ask for places in natural language

**As a** traveler (via an agent host)
**I want to** ask for restaurants or places in natural language and receive tool-backed answers
**So that** chat products can use places-agent without a custom tool loop

#### AC1

```gherkin
Scenario: Natural-language restaurant question uses tools
  Given the traveler is connected through an agent host with a valid caller API key
  When the traveler asks "ramen near Tsim Sha Tsui"
  Then the reply is based on restaurant or place tool results
  And the reply is not an invented venue list with no tool use
```

### User Story 2 — Chat copy is keyed, not one language

**As a** traveler
**I want** chat replies and user-visible errors resolved from i18n keys in my requested locale (`EN`, `CN`, `HK`, or `TW`; see Feature 13)
**So that** copy is not locked to one language, and a missing translation falls back instead of breaking the turn

#### AC1

```gherkin
Scenario: Chat errors use locale keys
  Given the traveler requested locale CN
  When a user-visible chat error occurs
  Then the error is identified by a message key
  And the displayed text is the CN catalog entry for that key, or EN then the key if missing
```

### User Story 3 — LLM is not destination-routed

**As an** operator
**I want** the agent's model to come from this deployable's server Quanzil config
**So that** search destination does not switch LLM vendor or model

#### AC1

```gherkin
Scenario: Shanghai question does not switch the agent model
  Given the agent deployable is configured with one server Quanzil model
  When the traveler asks about restaurants in Shanghai
  Then the agent uses that configured model
  And the model is not switched because the destination is in mainland China
```

### User Story 4 — File upload, including images

**As a** traveler (via an agent host)
**I want to** attach files to a place-chat turn, including images (for example a photo of a venue, a menu, or a screenshot)
**So that** the agent can use that content with my natural-language question when searching or recommending places
**And** if a file is missing, unsupported, or too large, I receive a keyed error and the turn does not invent a place from a failed upload

#### AC1

```gherkin
Scenario: Image attachment is used with the question
  Given the traveler attaches a photo of a restaurant storefront
  And the traveler asks "what is this place and nearby similar spots"
  When the traveler sends the turn
  Then the agent uses the image with the question
  And the reply is tool-backed when a place can be identified or searched
```

#### AC2

```gherkin
Scenario: Unsupported or oversized file
  Given the traveler attaches a file that is unsupported or larger than the allowed size
  When the traveler sends the turn
  Then the outcome key is errors.upload_unsupported or errors.upload_too_large
  And the agent does not invent a place from the failed upload
```

---

## `places-agent-http-mcp` — HTTP API and MCP

Expose the same place tools over two **access channels**: HTTP API for first-party app BFFs, and MCP for agent hosts (`/mcp`, `/sse`). One tool core; no forked behavior. This is not driving/transit directions. Both channels identify the service as **`places-agent`**.

This MCP is **places-agent's** tool surface. It is **not** the Google Maps Cloudflare Worker MCP (`GMAPS_MCP_*`), which is an internal **transport fallback** for the `GOOGLE_MAPS` adapter (Feature 6 / ADR-017).

### User Story 1 — HTTP tools for app BFFs

**As a** first-party app BFF
**I want to** call the place tools over the HTTP API with an authenticated caller key
**So that** what2eat and where2play can use the agent from the server, not the browser

#### AC1

```gherkin
Scenario: App BFF calls search over HTTP with a caller API key
  Given what2eat's server holds a valid caller API key
  When that BFF searches restaurants over the HTTP access channel
  Then the BFF receives restaurant cards
  And the traveler's browser did not send the caller API key to map vendors
```

### User Story 2 — MCP tools for agent hosts

**As an** agent host
**I want to** call the same tools over MCP with the same meaning as the HTTP API
**So that** hosts such as chatboxai can use places-agent without a second contract

#### AC1

```gherkin
Scenario: Agent host calls the same search over MCP
  Given an MCP host holds a valid caller API key
  When the host searches restaurants over MCP
  Then the host receives restaurant cards with the same meaning as HTTP search
```

### User Story 3 — Same outcome on HTTP and MCP

**As a** caller
**I want** the same tool name, inputs, and result/error meaning on the HTTP API and on MCP
**So that** I do not maintain two behaviors for one capability

#### AC1

```gherkin
Scenario: Same tool name and empty outcome on both channels
  Given no restaurants match keyword "xyznonexistentplace"
  When the caller searches restaurants over HTTP
  And a second caller searches restaurants with the same inputs over MCP
  Then both receive an empty list
  And both use outcome key errors.empty_results
```

### User Story 4 — Callers see agent id `places-agent`

**As a** caller (app BFF or MCP host)
**I want** HTTP responses and MCP initialize to identify the service as `places-agent`
**So that** I can tell this agent from what2eat, where2play, or a ChatBox display title

#### AC1

```gherkin
Scenario: HTTP tool response identifies the agent
  Given a caller holds a valid caller API key
  When the caller searches restaurants over HTTP
  Then the JSON body field agent is "places-agent"
```

#### AC2

```gherkin
Scenario: MCP initialize identifies the agent
  Given an MCP host holds a valid caller API key
  When the host completes MCP initialize
  Then serverInfo.name is "places-agent"
```

#### AC3

```gherkin
Scenario: Health document identifies the agent
  When a caller reads the HTTP health or ready document
  Then the JSON body field agent is "places-agent"
```

---

## `places-agent-caller-trust` — Caller API key auth

The agent **provides** HTTP and MCP tools only to callers that present a valid **caller API key** (issued in Feature 17). Missing, invalid, or revoked keys are rejected. Map and Tripadvisor keys live only on places-agent and are never the caller credential. User-visible errors are message keys.

### User Story 1 — Authenticate callers with a caller API key

**As a** caller (app BFF or MCP host)
**I want to** send a caller API key when I use the agent
**So that** I receive place tools and chat only when the key is valid
**And** a missing, unknown, or revoked key is rejected with a keyed error (`errors.caller_unauthorized`) and no tool result

#### AC1

```gherkin
Scenario: Valid caller API key receives service
  Given a caller API key exists and is not revoked
  When the caller searches restaurants with that key
  Then the caller receives a search outcome (results or empty)
```

#### AC2

```gherkin
Scenario: Missing key is rejected
  Given the caller sends no caller API key
  When the caller searches restaurants
  Then the outcome key is errors.caller_unauthorized
  And no restaurant cards are returned
```

#### AC3

```gherkin
Scenario: Unknown or revoked key is rejected
  Given the caller sends a key that is unknown or revoked
  When the caller searches restaurants
  Then the outcome key is errors.caller_unauthorized
  And no restaurant cards are returned
```

### User Story 2 — Map-vendor keys are not caller credentials

**As a** product owner
**I want** AMAP / Google / Tripadvisor keys to live only on places-agent, never in the browser, navigation links, or caller-auth headers
**So that** vendor credentials are not leaked and cannot be used as a substitute for a caller API key

#### AC1

```gherkin
Scenario: Map-vendor key does not authenticate a caller
  Given the caller sends an AMAP or Google key instead of a caller API key
  When the caller searches restaurants
  Then the outcome key is errors.caller_unauthorized
```

#### AC2

```gherkin
Scenario: Navigation links still omit map-vendor keys
  Given a valid caller API key
  When the caller asks for navigation links
  Then returned URLs contain no AMAP, Google, or Tripadvisor API key
```

### User Story 3 — Errors are i18n keys

**As a** caller
**I want** user-visible failures as message keys (plus optional default-locale reference copy), not a single hard-coded language body
**So that** my app can localize errors, and a missing translation falls back to `EN` then the key

#### AC1

```gherkin
Scenario: Unauthorized error is a key, not one language body
  Given the caller sends no caller API key
  And the requested locale is HK
  When the caller searches restaurants
  Then the outcome key is errors.caller_unauthorized
  And displayed copy is the HK catalog entry, or EN then the key if missing
```

---

## `places-agent-admin-home` — Admin home

Category: **app**. Public landing page of the management web-app on `places.agent-mate.ai`. All labels and controls use i18n keys (Feature 19: `EN`, `CN`, `HK`, `TW`).

### User Story 1 — Home shows setup instructions and admin login

**As a** visitor
**I want to** see a home page with a link to agent instructions (Feature 18) and an admin login control
**So that** I can either learn how to call places.agent-mate.ai or sign in to manage it

#### AC1

```gherkin
Scenario: Visitor sees instruction link and login
  Given the visitor is not signed in
  When the visitor opens the management home
  Then a control with key admin.home.instructions_link is available
  And that control leads to agent instructions
  And a control with key admin.home.login is available
```

---

## `places-agent-admin-users` — Admin login and users

Category: **app**. Invite-only admins. Emails (reset, invite) go through **Resend**. Copy in the UI and in email bodies is i18n keys. Default admin identifiers are not localized: username `admin`, email `me@ethanhuang.com`.

### User Story 1 — Admin login

**As an** admin
**I want to** sign in with my username or email and password
**So that** I can reach the post-login landing (Feature 16)

#### AC1

```gherkin
Scenario: Sign in with username and password
  Given an admin exists with username "admin" and a non-empty password
  When the admin signs in with username "admin" and the correct password
  Then the admin reaches the post-login landing
```

#### AC2

```gherkin
Scenario: Sign in with email
  Given an admin exists with email "me@ethanhuang.com" and a non-empty password
  When the admin signs in with that email and the correct password
  Then the admin reaches the post-login landing
```

#### AC3

```gherkin
Scenario: Wrong password
  Given an admin exists with username "admin"
  When the admin signs in with username "admin" and an incorrect password
  Then the outcome key is errors.login_failed
  And the admin does not reach the landing
  And no session is established
```

### User Story 2 — Default admin user

**As an** operator
**I want** a default admin with username `admin` and email `me@ethanhuang.com`
**So that** I can sign in after first deploy without public registration

#### AC1

```gherkin
Scenario: Default admin exists after first deploy
  Given a fresh deploy with no extra admins invited
  When an operator signs in as username "admin" with email "me@ethanhuang.com"
  Then that account is accepted as an admin
  And public registration was not required to create it
```

### User Story 3 — Reset password by email (Resend)

**As an** admin
**I want to** request a password reset and receive the reset mail through Resend
**So that** I can regain access without another person setting my password

#### AC1

```gherkin
Scenario: Password reset mail is sent
  Given an admin exists with email "me@ethanhuang.com"
  And Resend is configured
  When the admin requests a password reset for that email
  Then a reset mail is sent through Resend
  And mail body copy uses i18n keys
  And the mail contains an absolute set-password URL (`PUBLIC_BASE_URL` or `APP_URL`)
```

#### AC2

```gherkin
Scenario: Resend unavailable
  Given Resend cannot send mail
  When the admin requests a password reset
  Then a keyed error is shown
  And the password is not changed
```

### User Story 4 — Invite a new admin by email

**As an** admin
**I want to** invite another admin by email (Resend)
**So that** they can join without public registration
**And** they complete profile setup (first name, last name, username) and set a password on `/accept-invite` before signing in

#### AC1

```gherkin
Scenario: Invite mail links to accept-invite onboarding
  Given a signed-in admin
  And Resend is configured
  When the admin invites "new.admin@example.com"
  Then an invite mail is sent through Resend
  And the invite mail contains an absolute accept-invite URL with a token query parameter
  And the URL path is /accept-invite not /set-password
  And the invited person cannot use the app until they complete onboarding
```

#### AC2

```gherkin
Scenario: Invited admin sets profile and password on accept-invite
  Given a valid invite token for "new.admin@example.com"
  When the invited person opens the accept-invite link
  Then they see first name, last name, username, password, and confirm password fields
  And the form shows the invited email as context
  When they submit matching passwords and a valid unique username
  Then the account is activated
  And they see a success state with a sign-in action
  And the invite token cannot be reused
  And credentials do not appear in the browser URL after submit
```

#### AC3

```gherkin
Scenario: Expired or reused invite token
  Given an invite token that is expired or already consumed
  When the invited person opens the accept-invite link
  Then a keyed expired-invite callout is shown
  And the profile form is not submittable with that token
```

### User Story 5 — Password reset required when password is empty

**As an** admin whose password is empty (including first-time invited admins)
**I want to** be required to set a password before using the app
**So that** no one uses the management app with an empty password

#### AC1

```gherkin
Scenario: Empty password blocks landing
  Given an admin account exists with an empty password
  When that admin tries to use the management app
  Then the admin must set a password before the landing is usable
  And the outcome key is errors.password_required until a password is set
```

### User Story 6 — Public register is disabled

**As a** visitor
**I want** a clear notice that open registration is closed, with a way to contact an admin for an api-key
**So that** I do not expect to create an account myself (admins are invite-only)

#### AC1

```gherkin
Scenario: Visitor cannot self-register
  Given the visitor is on the management app
  When the visitor looks for new-user registration
  Then registration is not available
  And the login notice register-disabled is shown
  And the notice is composed from admin.register.disabled_prefix, admin.register.contact_admin, and admin.register.disabled_suffix
  And api-key is shown as a protocol id in mono
```

#### AC2

```gherkin
Scenario: Contact admin reveals WeChat QR
  Given the visitor is on the login screen
  And the contact-admin control is visible
  When the visitor hovers or focuses contact-admin
  Then tooltip contact-admin-qr is visible
  And the tooltip image source is EthanWeChat.png
  And the caption uses admin.register.wechat_qr_caption
  And the QR is not visible before hover or focus
```

### User Story 7 — Delete an admin

#### AC1

```gherkin
Scenario: Signed-in admin removes another admin after confirmation
  Given a signed-in admin
  And at least one other admin or pending invite exists in the list
  When the signed-in admin chooses Delete on another row
  And confirms the removal
  Then that account is removed from the admin list
  And a notification email is sent to the removed address
  And mail copy uses i18n keys
```

#### AC2

```gherkin
Scenario: Admin cannot delete their own account
  Given a signed-in admin viewing the admin list
  When the signed-in admin looks for Delete on their own row
  Then Delete is not offered for their own row
  And an API attempt to delete their own id returns errors.cannot_delete_self
```

#### AC3

```gherkin
Scenario: Last admin cannot be removed
  Given only one admin account exists in the system
  When an operator attempts to remove an admin
  Then no removal occurs that would leave zero admins
  And errors.cannot_delete_last_admin applies when that guard is triggered
```

#### AC4

```gherkin
Scenario: Delete notification mail failure
  Given Resend cannot send mail
  When a signed-in admin confirms removal of another admin
  Then errors.delete_admin_failed is returned
  And the target account is not removed
```

---

## `places-agent-admin-api-keys` — Caller API keys

Category: **app**. Issues the **caller API keys** that Feature 12 checks. Does not show map-vendor keys. The plaintext secret is shown only at create and regenerate; copy uses a control with an i18n label. All other UI copy is i18n keys.

### User Story 1 — Create a caller API key

**As an** admin
**I want to** create a key with a name and description, generate the secret, and copy it to the clipboard
**So that** I can give a caller (what2eat, where2play, ChatBox) a working key without typing it by hand

#### AC1

```gherkin
Scenario: Create key with name, description, generate, and copy
  Given a signed-in admin
  When the admin creates a caller API key named "what2eat-prod" with a description
  Then a new secret is generated
  And the admin can copy the secret to the clipboard via key admin.keys.copy
  And the plaintext secret is shown at create time
```

#### AC2

```gherkin
Scenario: Created key can call the agent
  Given the admin created a caller API key
  When a caller uses that secret to search restaurants
  Then the caller is authenticated
```

### User Story 2 — Edit a caller API key

**As an** admin
**I want to** edit a key's name and description
**So that** I can keep the list understandable without rotating the secret

#### AC1

```gherkin
Scenario: Edit name and description without rotating the secret
  Given a caller API key exists with name "old-name"
  When the admin changes the name to "new-name" and updates the description
  Then the stored name and description match the new values
  And the secret still authenticates the same caller
```

### User Story 3 — Regenerate a caller API key

**As an** admin
**I want a** regenerate control on the edit screen that issues a new secret
**So that** I can rotate a leaked or expired key; the previous secret stops working

#### AC1

```gherkin
Scenario: Regenerate invalidates the previous secret
  Given a caller API key secret "old-secret" exists
  When the admin regenerates the key on the edit screen
  Then a new secret is shown
  And "old-secret" is rejected with errors.caller_unauthorized
  And the new secret authenticates the caller
```

### User Story 4 — Delete a caller API key

**As an** admin
**I want to** delete a key
**So that** a retired caller can no longer call the agent

#### AC1

```gherkin
Scenario: Deleted key cannot call the agent
  Given a caller API key secret exists
  When the admin deletes that key
  Then the key no longer appears in the list
  And that secret is rejected with errors.caller_unauthorized
```

### User Story 5 — Bulk select and delete caller API keys

**As an** admin
**I want to** select one or more keys on the list (including select all) and delete them after confirm
**So that** I can retire several callers without opening each key

#### AC1

```gherkin
Scenario: Select all checks every key on the list
  Given a signed-in admin viewing two caller API keys
  When the admin checks select all
  Then both row checkboxes are checked
  And Bulk Delete is enabled
```

#### AC2

```gherkin
Scenario: Confirmed bulk delete removes keys and rejects secrets
  Given two caller API key secrets exist
  And a signed-in admin has selected both keys
  When the admin confirms Bulk Delete
  Then those keys no longer appear in the list
  And both secrets are rejected with errors.caller_unauthorized
```

#### AC3

```gherkin
Scenario: Empty selection does not delete
  Given a signed-in admin viewing caller API keys
  And no row is checked
  Then Bulk Delete is disabled
  And a bulk delete with an empty ids list is rejected with errors.invalid_input
```

#### AC4

```gherkin
Scenario: Unsigned bulk delete is rejected
  Given the visitor is not signed in
  When the visitor sends DELETE /api/admin/api-keys with key ids
  Then the keys are not deleted
  And the response is errors.session_expired
```

---

## `places-agent-admin-landing` — Admin landing

Category: **app**. First screen after a successful login. Shell: left navigator plus a header. All chrome copy is i18n keys. The signed-in **user name** is interpolated data, not hard-coded copy.

### User Story 1 — Left navigator after login

**As an** admin
**I want** a landing page with a left navigator to signed-in sections (API keys, users, and other admin areas)
**So that** I can move around the management app after login

#### AC1

```gherkin
Scenario: Landing shows left navigator
  Given the admin has signed in
  When the admin reaches the landing
  Then a left navigator is shown
  And it includes signed-in destinations for API keys and users
  And navigator labels use i18n keys
```

#### AC2

```gherkin
Scenario: Unsigned visitor does not get the landing shell
  Given the visitor is not signed in
  When the visitor tries to open the landing
  Then the landing with left navigator is not shown
  And the visitor is directed to sign in
```

### User Story 2 — Header greeting and instruction link

**As an** admin
**I want** the landing header to show an agent-instruction link (Feature 18) and a greeting that includes my user name
**So that** I know who is signed in and can open setup help without leaving the shell

#### AC1

```gherkin
Scenario: Header greets the signed-in name and links to instructions
  Given the signed-in user name is "admin"
  When the admin is on the landing
  Then the header shows key admin.landing.hello with user name "admin"
  And the header shows key admin.landing.instructions_link
  And that link opens agent instructions
```

---

## `places-agent-admin-instructions` — Agent instruction

Category: **app**. Instructions for calling **places.agent-mate.ai** (HTTP API, MCP, caller API key, agent id `places-agent`). Two entries only: public home, and the post-login landing header. Page copy is i18n keys (`EN`, `CN`, `HK`, `TW`). The machine id `places-agent` is not translated.

### User Story 1 — Instruction page content

**As a** visitor or admin
**I want** an instruction page that explains how to call places.agent-mate.ai (HTTP and MCP, how to send a caller API key, and that the agent id is `places-agent`)
**So that** I can connect a caller without guessing URLs, headers, or the MCP server name

#### AC1

```gherkin
Scenario: Instructions cover HTTP, MCP, and caller API key
  When a visitor opens the agent instruction page
  Then the page explains how to call places.agent-mate.ai over HTTP
  And the page explains how to call it over MCP
  And the page explains how to send a caller API key
  And the page states the agent id is places-agent
  And page copy uses i18n keys
  And the string places-agent is not replaced by a translated catalog value
```

### User Story 2 — Entry from the public home

**As a** visitor
**I want** the public home (Feature 14) to link to this instruction page
**So that** I can read setup help before I sign in

#### AC1

```gherkin
Scenario: Home links to instructions
  Given the visitor is on the public home
  When the visitor follows admin.home.instructions_link
  Then the agent instruction page is shown
```

### User Story 3 — Entry from the landing header

**As an** admin
**I want** the post-login landing header (Feature 16) to link to this instruction page
**So that** I can open the same help after I sign in

#### AC1

```gherkin
Scenario: Landing header links to the same instructions
  Given the admin is on the post-login landing
  When the admin follows admin.landing.instructions_link
  Then the same agent instruction page is shown as from the public home
```

### User Story 4 — Agent capabilities

**As a** visitor or admin
**I want** the instruction page to list agent capabilities (tools, HTTP-only chat, Tripadvisor enrich)
**So that** I know what places-agent can do before I wire HTTP or MCP

#### AC1

```gherkin
Scenario: Instructions list agent capabilities
  When a visitor opens the agent instruction page
  Then the Agent capabilities section is first in the table of contents
  And the capabilities are shown in a table
  And the section lists search_restaurants, search_places, get_place_details, geocode, navigate, and plan_itinerary as literals
  And the section lists Place chat and Tripadvisor.enrich
  And Place chat channel is HTTP only with POST /v1/chat
  And Tripadvisor.enrich channel is HTTP only
  And capability bodies use i18n keys
```

---

## `places-agent-admin-i18n` — Admin app i18n

Category: **app**. Management web-app catalogs and emails for the four product locales. Does not replace Feature 13 (agent output to callers).

### User Story 1 — Four locale catalogs

**As an** admin
**I want** every management-app label, button, empty state, error, notification, and email to resolve from i18n keys in `EN`, `CN`, `HK`, and `TW`
**So that** the operator UI is not locked to one language, and `HK` vs `TW` wording stays distinct

#### AC1

```gherkin
Scenario Outline: Management chrome resolves in each locale
  Given the management app locale is <locale>
  When the visitor opens the public home
  Then controls resolve from keys such as admin.home.login
  And displayed wording is the <locale> catalog, with HK and TW not treated as the same

  Examples:
    | locale |
    | EN     |
    | CN     |
    | HK     |
    | TW     |
```

#### AC2

```gherkin
Scenario: Invite and reset mails use keys
  Given the admin locale is CN
  When a password-reset mail is sent
  Then the mail body is built from i18n keys in CN (or EN then the key)
  And the reset link is an absolute set-password URL
  When an invite mail is sent
  Then the invite link is an absolute accept-invite URL
```

### User Story 2 — Switch locale

**As an** admin
**I want to** switch the management app among `EN`, `CN`, `HK`, and `TW`
**So that** I can work in the variant I read

#### AC1

```gherkin
Scenario: Admin switches from EN to HK
  Given the management app is showing EN
  When the admin switches locale to HK
  Then subsequent screens use the HK catalog
```

### User Story 3 — Missing translation fallback

**As an** admin
**I want** a missing catalog entry to fall back to `EN`, then to the key, without crashing the page
**So that** a partial translation does not block login or key management

#### AC1

```gherkin
Scenario: Missing CN entry falls back without crashing
  Given locale CN is selected
  And a management-app key has no CN entry
  When that screen is shown
  Then EN copy is used if present
  And the key is shown if EN is also missing
  And the page remains usable
```

---

## `places-agent-bilingual-output` — Bilingual output

Category: **agent**. User-visible agent output (chat, errors, place-card text meant for display, itinerary copy) in the four product locales. Callers pass locale id(s). This is not map-vendor selection and not HTTP vs MCP.

### User Story 1 — Output in one of four locales

**As a** caller
**I want to** request agent output in `EN`, `CN` (Simplified Chinese), `HK` (Traditional Chinese, Hong Kong dialect), or `TW` (Traditional Chinese, Taiwan dialect)
**So that** travelers see copy in the variant they read, not a 繁簡 conversion of another region

#### AC1

```gherkin
Scenario Outline: User-visible agent copy in one locale
  Given the caller requests output locale <locale>
  When a user-visible empty-search outcome occurs
  Then the outcome key is errors.empty_results
  And displayed copy is the <locale> catalog for that key, not a 繁簡 conversion of another region

  Examples:
    | locale |
    | EN     |
    | CN     |
    | HK     |
    | TW     |
```

#### AC2

```gherkin
Scenario: HK and TW catalogs differ in wording
  Given catalogs for errors.empty_results exist in HK and TW
  When the caller requests HK then TW for the same empty search
  Then both use key errors.empty_results
  And the HK wording is not required to equal the TW wording
```

### User Story 2 — Bilingual pair

**As a** caller
**I want to** request a **bilingual** pair from those four locales (for example `CN`+`EN` or `HK`+`EN`)
**So that** the same reply can show two variants when the product needs both

#### AC1

```gherkin
Scenario: CN and EN pair on the same reply
  Given the caller requests bilingual output CN and EN
  When a user-visible empty-search outcome occurs
  Then the outcome includes key errors.empty_results
  And CN copy and EN copy for that key are both present
```

### User Story 3 — Unsupported or missing locale

**As a** caller
**I want** an unknown locale id, or a missing translation, to fall back to `EN` then to the key, with a skip/reason key if useful
**So that** a bad locale does not fail the whole search or chat turn

#### AC1

```gherkin
Scenario: Unknown locale falls back
  Given the caller requests output locale "XX"
  When the caller searches restaurants
  Then the search still completes
  And user-visible copy falls back to EN then the key
```

#### AC2

```gherkin
Scenario: Missing catalog entry falls back without failing the turn
  Given locale CN is requested
  And a message key has no CN entry
  When that message is shown
  Then EN copy is used if present
  And the key itself is used if EN is also missing
  And the search or chat turn is not failed solely for the missing translation
```

### User Story 4 — Open-Meteo weather copy is translated

**As a** caller
**I want** weather conditions from Open-Meteo shown in my requested locale (`EN`, `CN`, `HK`, or `TW`)
**So that** travelers do not see English Open-Meteo labels (for example "Slight rain showers") when they asked for Chinese output

#### AC1

```gherkin
Scenario Outline: Weather condition uses catalog, not Open-Meteo English
  Given Open-Meteo returned weather_code 80
  And the caller requests output locale <locale>
  When user-visible weather text is produced
  Then the condition key is weather.wmo.80
  And displayed copy is the <locale> catalog for that key
  And the English Open-Meteo phrase "Slight rain showers" is not shown unless <locale> is EN

  Examples:
    | locale |
    | EN     |
    | CN     |
    | HK     |
    | TW     |
```

#### AC2

```gherkin
Scenario: HK and TW weather wording may differ
  Given weather.wmo.80 exists in HK and TW catalogs
  When the caller requests HK then TW for the same weather_code 80
  Then both use key weather.wmo.80
  And the HK wording is not required to equal the TW wording
```

#### AC3

```gherkin
Scenario: Itinerary narrative does not paste English weather into CN
  Given Open-Meteo returned weather_code 80
  And the caller requests output locale CN
  When the agent writes itinerary or chat narrative that mentions weather
  Then the weather wording matches the CN catalog for weather.wmo.80
  And the narrative does not contain the English Open-Meteo documentation phrase for that code
```

---

# Provider auto-selection — `places-agent-provider-auto`

**Category:** agent

As a **caller**, when I search without specifying `providers[]`, places-agent automatically selects the best providers based on my destination and locale:

- **策略1** (Google + TripAdvisor enrich): destination outside mainland China, or locale is EN/TW/HK
- **策略2** (AMAP): destination in mainland China or Hong Kong

Both strategies may apply simultaneously (e.g., Shanghai + EN locale → Google + AMAP + TripAdvisor).

### US1 — Chinese address auto-selects AMAP

**AC1**

Given caller 未传 providers[]
And location 为 "上海市南京西路"
When search_restaurants
Then 结果中 provider 包含 AMAP
And 所有结果 location.lat 在 30–32 范围, location.lng 在 120–122 范围

### US2 — Non-Chinese address auto-selects Google

**AC2**

Given caller 未传 providers[]
And location 为 "Tokyo Tower"
When search_places
Then 结果中 provider 为 GOOGLE_MAPS
And enrichProviders 包含 TRIPADVISOR

### US3 — Chinese address + EN locale uses both

**AC3**

Given caller 未传 providers[]
And location 为 "上海市南京西路", locale 为 "EN"
When search_restaurants
Then 同时使用 GOOGLE_MAPS 和 AMAP

### US4 — Explicit providers override auto-selection

**AC4**

Given caller 传 providers: ["AMAP"]
And location 为 "Tokyo Tower"
When search_restaurants
Then 仅使用 AMAP（自动选择不触发）

### US5 — Hong Kong uses both

**AC5**

Given location 坐标在香港范围 (lat ~22.28, lng ~114.17)
When search_restaurants
Then searchProviders 包含 GOOGLE_MAPS 和 AMAP

### US6 — Taiwan uses Google only

**AC6**

Given location 为 "台北市信義區"
When search_places
Then searchProviders 仅包含 GOOGLE_MAPS（不注入 AMAP）

---

# Server stability — `places-agent-server-stability`

**Category:** infra

### US1 — Safe JSON parsing

**AC1**

Given 客户端发送 "not json" body 到 POST /mcp
When server 解析请求体
Then 返回 HTTP 400
And 服务进程不崩溃

### US2 — Graceful shutdown

**AC2**

Given server 正在监听端口
When SIGTERM 信号发送
Then server 停止接受新连接
And 10 秒内退出进程
And 日志包含 "SIGTERM received, shutting down"

### US3 — Session TTL cleanup

**AC3**

Given SSE session 创建于 31 分钟前
And TTL 为 30 分钟
When 清理定时器触发
Then 该 session 从 SessionManager 中移除
And SessionManager.size 减少 1
