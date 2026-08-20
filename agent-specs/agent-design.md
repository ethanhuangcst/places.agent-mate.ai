# places-agent — technical design

Design for the **places-agent** deployable: tool core (HTTP + MCP) and operator admin UI in **one process**. Pixel chrome: §12 below. AC: [`agent-stories.md`](./agent-stories.md). Tests: [`agent-test-plan.md`](./agent-test-plan.md). Family stack: [`../../workspace-specs/3.tech-specs.md`](../../workspace-specs/3.tech-specs.md). Trust: [`../../workspace-specs/2.architecture.md`](../../workspace-specs/2.architecture.md).

This is an implementation design. Stack versions and vendor endpoints stay in `3.tech-specs.md`.

**Status:** draft — implement one user story at a time.

---

## 1. Goals and non-goals

| Goal | Non-goal |
| --- | --- |
| One Node process: Next.js admin + `/v1` tools + MCP | Fourth Portainer stack or MCP sidecar |
| Callers see id `places-agent` | Hostname as the agent id |
| Same tool functions on HTTP and MCP | Forked MCP-only business logic; treating Google Worker MCP as a `providers[]` id |
| Caller API key for tools; session cookie for admin | Admin cookie authorizing map tools |
| Simple Quanzil tool loop | Kubeflow, feature store, per-vendor LLM agents |
| PostgreSQL for admin users/keys ([ADR-025](../../workspace-specs/adr/ADR-025-places-agent-postgres-prisma.md)) | JSON file as source of truth; SQLite volume (ADR-015); sharing `what2eat` |
| Four locale catalogs | OpenCC; HK↔TW fallback; `next-intl` `[locale]` routes |

---

## 2. Runtime shape (one process)

**Entry:** thin custom Node HTTP server ([ADR-016](../../workspace-specs/adr/ADR-016-custom-http-server.md)). MCP SDK is Node `IncomingMessage`-native; ChatBox SSE is long-lived. `CMD node server.ts` (Next `output: "standalone"`). `next start` is not the entry.

```text
node server.ts  (PORT, one process)
  /mcp              → Streamable HTTP MCP (Bearer)
  /sse + /messages  → MCP SSE (ChatBox) (Bearer)
  *                 → Next.js
        / /login /admin/api-keys /admin/users /instructions   operator HTML
        /api/admin/*                           admin BFF (cookie)
        /v1/*  /v1/health                      HTTP tools (Bearer; health is public)
```

| Option | Verdict |
| --- | --- |
| Custom server + Next | **Pick** |
| Next route handlers only for MCP | Reject — SSE/Web `Request` vs MCP Node transports |
| MCP sidecar | Forbidden (ADR-012) |

Custom server special-cases **only** `/mcp`, `/sse`, `/messages`. `/v1` stays Next Route Handlers so REST, Zod, and Vitest stay in the App Router.

**Path map** (HTML matches §12 below):

| Path | Auth | Role |
| --- | --- | --- |
| `/login` `/login/fresh` `/reset-password` `/set-password` `/accept-invite` `/instructions` | Public (session optional) | Operator HTML; `/login/fresh` clears session then redirects to `/login` |
| `/admin` `/admin/api-keys` `/admin/api-keys/new` `/admin/api-keys/[id]` `/admin/users` | Admin session | Operator HTML; unsigned → `/login`. `/admin` redirects to keys. |
| `/api/admin/*` | Session + CSRF | Same-origin BFF |
| `/v1/*` | Bearer caller key | HTTP tools |
| `/v1/health` (and `/health` alias) | None | `{ "agent": "places-agent", "ok": true }` |
| `/mcp` | Bearer | Streamable HTTP MCP |
| `/sse` + `/messages` | Bearer | Legacy SSE for ChatBox |

Next middleware matcher: `/admin`, `/admin/*`, `/api/admin`, `/set-password` only. **Never** attach session middleware to `/v1`, `/mcp`, `/sse`, `/messages`. Empty password → `/set-password`. Signed-in visiting `/login` → `/admin/api-keys`.

Tool names stay unprefixed. Identity is `serverInfo.name` and JSON `agent`.

---

## 3. Module layout

```text
1.places-agent/
  Makefile
  server.ts                      # MCP dispatch + Next
  middleware.ts                  # cookie gate for admin HTML/API only
  prisma/schema.prisma
  prisma/seed.ts
  messages/{EN,CN,HK,TW}.json
  prompts/chat/v1.md
  prompts/glossaries/travel.v1.json
  app/                           # pages + /api/admin + /v1
  src/
    core/                        # tools, gateway, loop, t(), truncate
    adapters/{amap,google,tripadvisor,open-meteo}/
    mcp/                         # McpServer + transports
    http/                        # envelope
    auth/{session,caller,csrf}.ts
    db/                          # Prisma client + seed
```

**Dependency direction:** `app` / `mcp` / `http` → `core` → `adapters`. **Core must not import Next, MCP SDK, or Prisma.**

Next.js **16.3** App Router, React **19**, TypeScript **7**, Tailwind **4**, React Query, RHF + Zod. Pin `@modelcontextprotocol/sdk` and `openai@6`. Confirm MCP register APIs against current SDK docs at implement time.

---

## 4. Topology: one harness, two entry paths

There is **one cognitive job**. Planner+workers and per-vendor LLM agents fail the latency budget. Admin UI is CRUD, not an agent.

```text
BFF / MCP host
 ├─ Direct tool HTTP/MCP ──┐   ← no LLM (caller already named the tool)
 └─ NL chat → Quanzil loop ─┤
                            ▼
                     Tool core (one)
                            │
         ┌─────────┬────────┼─────────┐
         ▼         ▼        ▼         ▼
       AMAP     Google   Tripadvisor  Open-Meteo
                REST→MCP   enrich      helper
```

**NL loop (Feature 10 only):**

```
LOOP:
  Model sees: messages + locale + 5 tools (searches, details, navigate, geocode)
  Model decides: tool call or final answer
  If tool: run core, truncate, append, continue
  If answer: Layer A/C catalogs (incl. weather.wmo.*) + Layer L glossary if HK/TW
```

`plan_itinerary` is **HTTP/MCP**. If chat needs a plan, call the same function (Level 2 progress list). Isolate as a subagent only if truncated itinerary JSON still blows the thread — **not** per vendor.

Trust the model to sequence geocode → search → details. Do not hard-code that order.

| Level | Use |
| --- | --- |
| 1 — tools | Default for NL chat |
| 2 — short progress list | If multi-step itinerary chat loses bounds/prefs |
| 3 — one itinerary subagent | Only if measured context blow-up |
| Evaluator-optimizer | Defer until a golden HK/TW eval set exists |

**Context:** truncate vendor JSON (keep id, name, location, rating, hours, `sources[]`, skip reasons). If a card cannot keep **id + provenance**, fail that result with a reason key. Glossary only when locale is `HK`/`TW`. Pacing rules only on `plan_itinerary` turns.

**Uploads:** extract short structured hints. Do not keep bytes. Do not paste OCR into the system prompt. Failed upload → keyed error; **no POI from a failed upload**. Image generation is not an MVP tool.

**Failures:** skip + reason key, **no silent swap**. Google direct down → Worker MCP, provenance `GOOGLE_MAPS`. Tripadvisor fail → omit enrich. Weather fail → degrade plan, do not empty itinerary. Empty search → empty list + key. Quanzil fail → error, never empty success. Idempotent tools: **one** retry then skip; model may answer on **partial** results.

**HITL:** none on search/details/geocode/navigate/chat. Add a gate only for a later irreversible side effect.

**Observability (MVP logs):** `trace_id`, tool, `providers[]`, vendor latency, skip reason, locale, `prompt_id` / glossary id; per LLM turn: model + tokens.

---

## 5. Tool core

HTTP `/v1` and MCP call the **same functions**. Transports authenticate, parse, wrap.

| Function | HTTP + MCP name | NL loop |
| --- | --- | --- |
| `searchRestaurants` | `search_restaurants` | yes |
| `searchPlaces` | `search_places` | yes |
| `getPlaceDetails` | `get_place_details` | yes |
| `navigate` | `navigate` | yes |
| `geocode` | `geocode` | yes (must stay public) |
| `planItinerary` | `plan_itinerary` | only if chat asks for a plan |
| `getWeather` | not public | helper for itinerary |

Six public tools is above the 3–5 chatbot default because this is a **dual-transport contract for three callers**. Do not add more. Parallel AMAP+Google inside one tool is **adapter fan-out**. Tripadvisor enrich and Open-Meteo are **server-side**. Timed itinerary (`detail: "timed"`) orchestrates geocode / search / weather **inside** `plan_itinerary` — still one public tool.

Shared input: `providers[]`, `locale` or `locales[]`, `enrich.tripadvisor?`, `merge?`. Core validates `providers[]` against env + capability matrix; **never** geo-forces AMAP (ADR-005).

### `plan_itinerary` detail modes

| `detail` | Behavior |
| --- | --- |
| `stops` (default) | Day-bucket redistribute of caller `places[]` + daily weather (MVP-2). Empty places → `errors.no_places_to_plan`. |
| `timed` | Origin optional. `days[].day_index` is **1-based**. `search_anchor` is the **city** (from NL / known city names), never the destination landmark alone. Auto `search_places` uses attraction allow + plaza/mall/station/scenic deny (**no** unfiltered fallback). Assembled vendor queries are Chinese when locale is CN/HK/TW or origin/destination/NL has CJK. Multi-day origin+destination: search each day at an interpolated corridor pin. Clock-slotted visit `blocks[]` for every day in bounds. Lunch from visit gaps; **dinner 18:00–20:00**; optional `meal: "cafe"` when last visit ends before 17:00. Hours filter when mapped. Venue identity (`native_id` or normalized name) is unique across the trip for visits and for every meal option; extra restaurant/cafe queries run when unused candidates are short; still-short slots are omitted (no fallback to already-used venues). Meal options with `duration_min > 300` dropped. Optional destination biases later days + `legs_to_destination`. CN/HK/TW: if caller listed AMAP, timed search **AMAP first** then Google fill (ADR-005: never inject AMAP). GCJ-02 `near` is not GPS-converted. Place around radius is city-scale. Modules: [`itinerary-timed.ts`](../src/core/itinerary-timed.ts), [`itinerary-weather.ts`](../src/core/itinerary-weather.ts), [`place-filters.ts`](../src/core/place-filters.ts). **Directions:** Google and/or AMAP `directions()` → `source: "directions"`; fail → heuristic + `errors.directions_unavailable` tagged with the failing provider. AMAP search retries once on `provider_failed`. |

`planning_impact.severity`: `fair` \| `caution` \| `adverse` \| `severe` from WMO code + heat (`temp_max_c ≥ 32`). Labels via `itinerary.weather.*` keys (ADR-014).

Gateway: validate → fan-out in parallel → tag `sources[]` → optional enrich → optional merge → envelope.

### 5.1 Tool capability specifications

Each tool returns structured data. This section defines the **complete field contract** per tool — what callers can expect, which provider supplies each field, and fallback behavior when a provider cannot deliver.

#### `search_restaurants` / `search_places`

| Field | Type | Provider | Fallback |
| --- | --- | --- | --- |
| `name` | string | AMAP / Google | Required — skip card if missing |
| `address` | string | AMAP / Google | Required |
| `location` | `{ lat, lng, crs }` | AMAP (GCJ-02) / Google (WGS84) | Required |
| `rating` | number? | AMAP / Google | Omit if unavailable |
| `hours` | string[]? | AMAP (`opentime_today/week`) / Google (`regularOpeningHours`) | Omit if unavailable |
| `photos` | string[]? | Google (free tier) → Tripadvisor (`/locations/{id}/photos`) → AMAP (`biz_ext.photos`) | See photos fallback chain below. Omit field (not empty array) if no provider returns images. |
| `types` | string[]? | AMAP / Google | Omit if unavailable |
| `price_level` | string? | Google / AMAP / Tripadvisor (enrich) | See price normalization below. Omit if no provider returns price data. |
| `price_per_person` | number? | AMAP (`biz_ext.cost`, 元) | Omit if unavailable; only AMAP provides numeric per-person cost |
| `provider` | string | System | Required — `AMAP` or `GOOGLE_MAPS` |
| `sources[]` | array | System | Required — one entry per contributing vendor |

**Provider combination strategy** (MVP-3, supersedes ADR-005 caller-only routing):

智能体根据目的地和界面语言自动选择 provider 组合。Caller 仍可通过显式 `providers[]` 覆盖。

| 策略 | 条件（任一命中） | search providers | enrich |
| --- | --- | --- | --- |
| **策略1** | 目的地在中国大陆之外；或界面语言 EN/TW/HK | `GOOGLE_MAPS` | `TRIPADVISOR` (rating + photos fallback + reviews) |
| **策略2** | 目的地在中国大陆或香港 | `AMAP` | — |

两个策略可同时生效。示例：

| 目的地 | 语言 | 生效策略 | 实际 providers |
| --- | --- | --- | --- |
| 上海 | CN | 策略2 | AMAP |
| 上海 | EN | 策略1 + 策略2 | Google + AMAP + TripAdvisor enrich |
| 昆明 | EN | 策略1 + 策略2 | Google + AMAP + TripAdvisor enrich |
| 香港 | CN | 策略1 + 策略2 | Google + AMAP + TripAdvisor enrich |
| 香港 | HK | 策略1 + 策略2 | Google + AMAP + TripAdvisor enrich |
| 台湾 | CN | 策略1 | Google + TripAdvisor enrich |
| 台湾 | TW | 策略1 | Google + TripAdvisor enrich |
| 东京 | EN | 策略1 | Google + TripAdvisor enrich |
| 里斯本 | EN | 策略1 | Google + TripAdvisor enrich |

实现模块：`src/adapters/provider-resolver.ts` → `resolveProviderStrategy(destination, locale)` → `{ searchProviders[], enrichProviders[] }`。

**Photos 回退链：**

```
1. Google Places Photos (free tier, field mask `places.photos`)
   ↓ 不可用或需付费
2. Tripadvisor Terra `/locations/{id}/photos` (需先 nearby 匹配拿到 location_id)
   ↓ 不可用
3. AMAP `biz_ext.photos`
   ↓ 不可用
4. 省略 photos 字段（不返回空数组）
```

只有当 Google Photos 不可用或需要付费时，才回退到 Tripadvisor photos。AMAP photos 作为最后回退。

**Price 归一化：**

各 provider 返回不同格式的价格数据，统一为 `price_level` 枚举：

| `price_level` 值 | 含义 | Google `priceLevel` | AMAP `biz_ext.cost` (元) | TripAdvisor `price_level` |
| --- | --- | --- | --- | --- |
| `"FREE"` | 免费 | `PRICE_LEVEL_FREE` | — | — |
| `"$"` | 平价 | `PRICE_LEVEL_INEXPENSIVE` | < 50 | `$` |
| `"$$"` | 中等 | `PRICE_LEVEL_MODERATE` | 50–150 | `$$` |
| `"$$$"` | 较贵 | `PRICE_LEVEL_EXPENSIVE` | 150–300 | `$$$` |
| `"$$$$"` | 高档 | `PRICE_LEVEL_VERY_EXPENSIVE` | > 300 | `$$$$` |

- Google field mask 增加 `places.priceLevel`
- AMAP 请求增加 `show_fields=biz_ext` 或 `extensions=all`，解析 `biz_ext.cost`（人均元），按上表转换为 `price_level`；同时将原始数值保留在 `price_per_person` 字段
- Tripadvisor enrich 时如主 provider 无 `price_level`，使用 Terra 返回的 `price_level` 补充
- 多 provider 合并时：主 provider 的 `price_level` 优先；无数据则取 enrich provider 的值

#### `get_place_details`

Returns the same fields as search plus:

| Field | Type | Provider | Fallback |
| --- | --- | --- | --- |
| `reviews` | object[]? | Google / Tripadvisor (enrich) | Omit if unavailable |
| `website` | string? | Google | Omit if unavailable |
| `phone` | string? | AMAP / Google | Omit if unavailable |

#### `plan_itinerary` (detail: "timed")

**Language-aware query generation** (MVP-4):
- Query language determined by `languageContext.searchLanguage` (from language-router module)
- Search keywords loaded from `src/i18n/search-keywords.ts` — no hardcoded Chinese/English in query strings
- City-specific hardcoded queries removed; replaced by generic templates: `"{city} {localized_keyword}"`
- Meal context matching: breakfast → brunch keywords; dinner → fine dining keywords; cafe → tea house keywords — all per locale

**Venue photos in itinerary** (MVP-3):
- Each venue in `blocks[]` includes `photos` field when available from the search provider
- Fallback: omit `photos`, never return empty array

#### `geocode`

| Field | Type | Provider | Fallback |
| --- | --- | --- | --- |
| `location` | `{ lat, lng, crs }` | AMAP / Google | Required |
| `formatted_address` | string | AMAP / Google | Required |
| `place_id` | string? | Google | Omit for AMAP |

#### `navigate`

| Field | Type | Provider | Fallback |
| --- | --- | --- | --- |
| `deeplinks` | object | AMAP / Google | Required — secret-free URLs |
| `distance_m` | number? | AMAP / Google directions | Omit if directions unavailable |
| `duration_min` | number? | AMAP / Google directions | Omit if directions unavailable |

### 5.2 Language routing and query assembly (MVP-4)

Three cooperating modules — provider 选择、语言检测、query 组装 — 共同决定每次搜索如何执行。均为规则引擎，不调 LLM。

```typescript
// src/agent/language-router.ts
interface LanguageContext {
  detectedLanguage: 'zh' | 'en' | 'ja' | string;
  promptLocale: string;             // for system prompt selection
}

// src/adapters/provider-resolver.ts
interface ProviderStrategy {
  searchProviders: ProviderId[];    // GOOGLE_MAPS, AMAP — order matters
  enrichProviders: ProviderId[];    // TRIPADVISOR
}

// src/core/query-assembler.ts
interface AssembledQueries {
  google?: string[];                // 1-2 queries (bilingual when locale ≠ EN)
  amap?: string[];                  // always pure CN
}
```

#### 5.2.1 语言检测

1. Explicit `locale` parameter → use directly
2. Input contains >30% CJK characters → `zh`
3. Fallback → `en`

#### 5.2.2 Provider 策略

按 §5.1 策略矩阵，根据目的地 + 界面语言输出 `{ searchProviders, enrichProviders }`。Caller 显式 `providers[]` 始终覆盖自动策略。

#### 5.2.3 Query Language Policy (QLP)

搜索关键词的语言组装策略，与 provider 策略联动。

| 策略 | Query 语言 | 适用条件 | 实现 |
| --- | --- | --- | --- |
| **QLP-G** (Google) | EN + 界面语言（两次搜索并行，结果合并去重） | §5.1 策略1 (Google) 生效时 | 双语搜索提升覆盖率 |
| **QLP-A** (AMAP) | **纯 CN**（非中文输入自动翻译为简体中文） | §5.1 策略2 (AMAP) 生效时 | AMAP 搜索引擎只懂中文 |

**QLP-G 细则：**
- 界面语言 = EN 时：单次 EN 搜索即可，不做双语
- 界面语言 ≠ EN 时：两次搜索**并行** (`Promise.all`)，结果按 `native_id` 或坐标近似（<50m）去重合并
- 搜索①：EN 关键词 + EN 地名（`"Japanese restaurant near Tokyo"`）
- 搜索②：界面语言关键词 + 界面语言地名（`"日本料理 東京"`）

**QLP-A 细则：**
- **始终**使用简体中文 query，无论界面语言
- 非中文输入通过关键词映射表翻译（见下方）
- 不拼双语 — AMAP 对英文关键词几乎无效

**关键词映射表** (`src/i18n/search-keywords.ts`)：

| EN | CN | HK | TW |
| --- | --- | --- | --- |
| Japanese restaurant | 日料 | 日本料理 | 日本料理 |
| hotpot | 火锅 | 火鍋 | 火鍋 |
| barbecue / BBQ | 烧烤 | 燒烤 | 燒烤 |
| brunch | 早午餐 | 早午餐 | 早午餐 |
| fine dining | 精致餐厅 | 高級餐廳 | 精緻餐廳 |
| cafe / tea house | 咖啡馆 / 茶馆 | 咖啡店 / 茶館 | 咖啡廳 / 茶館 |
| museum | 博物馆 | 博物館 | 博物館 |
| night market | 夜市 | 夜市 | 夜市 |
| budget | 平价 | 平價 | 平價 |
| premium | 高档 | 高檔 | 高檔 |

表不穷举所有词汇；未命中的关键词保持原语言传入 provider。

**实例：**

| 场景 | 界面语言 | Provider 策略 | QLP | 实际搜索 |
| --- | --- | --- | --- | --- |
| 搜东京日料 | EN | Google+TA | QLP-G: 单次 EN | Google: `"Japanese restaurant near Tokyo"` |
| 搜东京日料 | CN | Google+TA | QLP-G: EN+CN | Google①: `"Japanese restaurant Tokyo"` + ②: `"日料 东京"` → 合并 |
| 搜东京日料 | HK | Google+TA | QLP-G: EN+HK | Google①: `"Japanese restaurant Tokyo"` + ②: `"日本料理 東京"` → 合并 |
| 搜上海火锅 | CN | AMAP | QLP-A: 纯 CN | AMAP: `"火锅"` near 上海坐标 |
| 搜上海火锅 | EN | Google+AMAP+TA | QLP-G + QLP-A | Google①: `"hotpot Shanghai"` + ②: `"火锅 上海"` → 合并；AMAP: `"火锅"` |
| 搜昆明咖啡 | HK | Google+AMAP+TA | QLP-G + QLP-A | Google①: `"cafe Kunming"` + ②: `"咖啡店 昆明"` → 合并；AMAP: `"咖啡馆"` |
| 搜台北夜市 | TW | Google+TA | QLP-G: EN+TW | Google①: `"night market Taipei"` + ②: `"夜市 台北"` → 合并 |

**性能约束：**
- Google 双语搜索的两次调用必须**并行**（`Promise.all`），不增加端到端延迟
- 去重按 `native_id`（同 provider）或坐标 haversine < 50m + 名称相似度 > 0.7（跨 provider 合并）
- 只在界面语言 ≠ EN 时才做双语搜索；EN 场景单次 Google 调用即可

### 5.3 Prompt assembly (MVP-7)

A deterministic prompt assembler — upgradeable to optional LLM sub-agent. Uses `LanguageContext` from §5.2.1 and keyword mappings from §5.2.3.

```typescript
// src/agent/prompt-assembler.ts
interface PromptContext {
  languageContext: LanguageContext;
  toolName: string;
  userIntent: 'meal' | 'attraction' | 'itinerary' | 'general';
  timeOfDay?: string;
  previousResults?: NormalizedPlace[];
}

function assembleToolPrompt(ctx: PromptContext): string;
```

System prompts are locale-specific: `prompts/chat/v1.en.md`, `prompts/chat/v1.zh.md`. Selected by `languageContext.promptLocale`.

---

## 6. Adapters and place card

| Adapter | Id | Notes |
| --- | --- | --- |
| AMAP Web 服务 | `AMAP` | Live when `PLACES_VENDOR_MODE=live`: [`config.ts`](../src/adapters/amap/config.ts), [`direct.ts`](../src/adapters/amap/direct.ts), [`card-mapper.ts`](../src/adapters/amap/card-mapper.ts) (maps `opentime_today` / `opentime_week` → `PlaceCard.hours`), [`keywords.ts`](../src/adapters/amap/keywords.ts), [`directions.ts`](../src/adapters/amap/directions.ts) (`/v3/direction/walking|driving|transit/integrated`), [`live.ts`](../src/adapters/amap/live.ts). `lng,lat`; GCJ-02; convert WGS `near` via `/v3/assistant/coordinate/convert` (`coordsys=gps`); dining `types=050000`; `address` without `near` → geocode then `/v5/place/around` radius 1000. Fixture: [`fixture.ts`](../src/adapters/amap/fixture.ts) when mode is not live. **no** `weatherInfo`. No Worker fallback. |
| Google direct REST | `GOOGLE_MAPS` | Places New / Geocoding / Routes; WGS-84; `languageCode` from locale map. Module: [`src/adapters/google/direct.ts`](../src/adapters/google/direct.ts) |
| Google Worker MCP | same `GOOGLE_MAPS` | After direct egress failure. `GMAPS_MCP_*`. `tools/list` first. Module: [`src/adapters/google/mcp-client.ts`](../src/adapters/google/mcp-client.ts). Composite: [`src/adapters/google/live.ts`](../src/adapters/google/live.ts). **Dev test:** `GOOGLE_DIRECT_FORCE_FAIL=1` (rejected in production). |
| Tripadvisor Terra | `TRIPADVISOR` | **Enrich-only** (ADR-007, ADR-020): rating, reviews, **photos fallback** (MVP-3). Live when `PLACES_VENDOR_MODE=live`: [`config.ts`](../src/adapters/tripadvisor/config.ts), [`direct.ts`](../src/adapters/tripadvisor/direct.ts), [`match.ts`](../src/adapters/tripadvisor/match.ts), [`card-mapper.ts`](../src/adapters/tripadvisor/card-mapper.ts), [`live.ts`](../src/adapters/tripadvisor/live.ts). `GET /locations/nearby` with `lat`+`lon`+`radius=1`+`unit=KM`; header `X-API-Key`; never `location_id` or Google/AMAP native ids on the nearby URL. **Photos:** `GET /locations/{id}/photos` — called only when Google Photos is unavailable or paid; matched `location_id` from nearby step. Fixture: [`fixture.ts`](../src/adapters/tripadvisor/fixture.ts) when mode is not live. |
| Open-Meteo | `OPEN_METEO` | **Not** in `providers[]`. Live when `PLACES_VENDOR_MODE=live`: [`config.ts`](../src/adapters/open-meteo/config.ts), [`direct.ts`](../src/adapters/open-meteo/direct.ts), [`live.ts`](../src/adapters/open-meteo/live.ts). `GET /forecast` with `latitude`+`longitude`+`daily=weather_code,temperature_2m_max,temperature_2m_min`+`timezone=auto`; optional `apikey` on the customer host. Fixture: [`fixture.ts`](../src/adapters/open-meteo/fixture.ts) when mode is not live. Keep `weather_code` + numbers; localize `weather.wmo.{code}`. |

| Field | Rule |
| --- | --- |
| `provider` | Primary vendor id |
| `sources[]` | `{ provider, native_id, logo_url?, deeplinks }` — native id is **that** vendor’s only |
| `primary_provider` | When `merge: true` |
| `location` | `{ lat, lng, crs: "WGS84" \| "GCJ-02" }` per source; do not mix CRS in one pin |
| `name` / `address` | Layer B: vendor string; do not glossary-patch |
| Deeplinks | Secret-free |
| Photos | No key in URL; BFF-proxied `/v1` if needed; never `NEXT_PUBLIC_` |

---

## 7. HTTP envelope

Every `/v1` JSON body (including health):

```ts
{
  agent: "places-agent", // literal, never localized
  ok: boolean,
  data?: unknown,
  outcome?: { key: string; locales?: Partial<Record<Locale, string>> },
  skipped?: { provider: string; reason_key: string }[],
  locale?: Locale,
  locales?: Locale[]
}
```

| Key | Typical HTTP |
| --- | --- |
| `errors.caller_unauthorized` | 401 |
| `errors.place_not_found` | 404 |
| `errors.empty_results` | 200 + empty list |
| `errors.provider_failed` / `unconfigured` / `capability_unsupported` | 200 + `skipped[]` |
| `errors.upload_unsupported` / `upload_too_large` | 400 |

Always emit the **key**. Resolve catalog text for requested locale(s); fallback locale → `EN` → raw key. Never HK↔TW.

---

## 8. MCP

| Item | Contract |
| --- | --- |
| Transport | Streamable HTTP `POST/GET /mcp` |
| ChatBox | `GET /sse` + `POST /messages` on the **same** `McpServer` |
| Auth | Caller Bearer **before** initialize |
| `serverInfo.name` | `"places-agent"` |
| Tool names | Unprefixed |
| Tool descriptions | Must include the literal `places-agent` so ChatBox/Cursor host models can prefer these tools over a generic search or vendor Maps MCP |
| Schemas | Zod, shared with HTTP |
| Results | Same meaning as `/v1` `data` + outcome keys |

`registerTools(server)` → `core.*` only.

---

## 9. Agent LLM (Quanzil)

- `openai` SDK, `baseURL` = `OPENAI_BASE_URL`, not `api.openai.com`.
- `max_completion_tokens`. Model: `OPENAI_CHAT_MODEL`.
- Cap: max iterations + outbound HTTP timeout ~25s; UI soft tip ~10s (one latency contract).

**Version (git is the registry):**

| Artifact | Example id | Where |
| --- | --- | --- |
| System prompt | `chat.v1` | `prompts/chat/v1.md` |
| Travel glossary | `travel.v1` | `prompts/glossaries/travel.v1.json` |
| Catalog pack | `catalogs.v1` | `messages/*.json` |

Env: `PROMPT_ID`, `GLOSSARY_ID` (null for `EN`/`CN`), `CATALOG_PACK`. Rollback = pin ids. Do not edit `v1` in place after ship.

---

## 10. Data ([ADR-025](../../workspace-specs/adr/ADR-025-places-agent-postgres-prisma.md))

PostgreSQL + Prisma. Local `DATABASE_URL=postgresql://places_agent:places_agent@localhost:5435/places_agent` (or `:5436`). Production dedicated Aliyun database `places_agent` on `101.132.156.250:5432`. Do not use SQLite on a volume (ADR-015 superseded). Do not share the `what2eat` database.

| Entity | Fields |
| --- | --- |
| `AdminUser` | `id`, `username` unique, `email` unique, `passwordHash` (empty until set), invite/reset token **hashes** + expiry |
| `CallerApiKey` | `id`, `name`, `description`, `keyHash` unique, `prefix`, `status` `ACTIVE`\|`REVOKED`, `lastUsedAt` |
| Session | **Sealed cookie**, not a table. Optional later: `sessionVersion` on user for revoke-all |

Seed: username `admin`, email `me@ethanhuang.com`. Do **not** bake a password into the image. Empty hash → `/set-password` or Resend reset.

Passwords: `node:crypto` scrypt. Caller secrets: `pa_` + 32 random bytes; store SHA-256; plaintext **once** at create/regenerate.

---

## 11. Auth

| Channel | Credential | Not valid for |
| --- | --- | --- |
| Operator UI + `/api/admin` | Session cookie | `/v1`, `/mcp`, `/sse` |
| HTTP tools + MCP | `Authorization: Bearer` | Admin pages / `/api/admin` |

Cookie: `HttpOnly`, `Secure` (prod), `SameSite=Lax`, `Path=/`. Prefer `__Host-places_agent_session` when HTTPS is guaranteed. Payload `{ userId, username }` sealed with `SESSION_SECRET`.

CSRF (cookie mutations only): `SameSite=Lax` **plus** `Origin` / `Referer` must match this host. Bearer surfaces have no CSRF cookie attack; do not send caller keys from the operator browser.

Caller key: hash Bearer, lookup `ACTIVE`. Missing/unknown/revoked/map-vendor key as Bearer → `errors.caller_unauthorized`. Timing-safe compare.

---

## 12. Admin UI

Operator management web on **`places.agent-mate.ai`**. Pixel and interaction contract for Features 14–19. Clickable mock-ups: [`ui-mockup/`](./ui-mockup/). Locale cookie `places_locale` — **no** `[locale]` segment.

| URL | Feature | Mock-up | Auth |
| --- | --- | --- | --- |
| `/` | 14 | `01-home.html` | Public |
| `/login` | 15 | `02-login.html` | Public; signed-in → `/admin/api-keys` |
| `/reset-password` | 15 US3 | `03-reset.html` | Public |
| `/set-password` | 15 US5 | `04-set-password.html` | Reset token or empty-password session only |
| `/accept-invite` | 15 US4 | (implemented; mock-up TBD) | Invite token; profile + password onboarding |
| `/instructions` | 18 | `05` / `11` | Public or session; same body; literal `places-agent` |
| `/admin` | 16 | — | Session; **redirect** → `/admin/api-keys` |
| `/admin/api-keys` | 16 + 17 (US5 bulk delete) | `06-keys.html` | Session; **landing after login** |
| `/admin/api-keys/new` | 17 US1 | `07-key-new.html` | Session |
| `/admin/api-keys/[id]` | 17 US2–4 | `09-key-edit.html` | Session |
| `/admin/users` | 15 US4 | `10-admins.html` | Session |

**One-time secret:** not a URL. `POST` create/regenerate returns `secret` in the mutation payload → `SecretOncePanel`. Unmount clears. No `GET` returns plaintext. No `localStorage`.

**i18n:** custom catalogs `messages/{EN,CN,HK,TW}.json` + `t(locale, key, vars)`. **Do not add `next-intl`.** Missing key → `EN` → key. Seed from `ui-mockup/assets/i18n.js` (drop gallery keys). HK and TW must differ. Emails reuse the same files (`admin.reset.mail_body`, `admin.users.invite_mail_body` with `{url}`). Invite/reset `{url}` is absolute: `PUBLIC_BASE_URL` then `APP_URL`, else `http://localhost:${PORT}` locally or `https://places.agent-mate.ai` in production. `POST /api/admin/locale` then `router.refresh()`. `html lang`: `en` / `zh-CN` / `zh-HK` / `zh-TW`.

**Data:** React Query → same-origin `/api/admin/*` with `credentials: "include"`. Zustand not required. RHF + Zod on forms (including `/accept-invite` POST to `/api/admin/accept-invite`).

| UI | Endpoint |
| --- | --- |
| Header greeting | `GET /api/admin/session` → `{ name, email, mustSetPassword }` |
| Keys table | `GET /api/admin/api-keys` (prefix, never secret) |
| Issue / regenerate | `POST` / `POST …/regenerate` returns `secret` **once** |
| Edit | `PATCH` name/description only |
| Delete one | `DELETE /api/admin/api-keys/[id]` |
| Bulk delete | `DELETE /api/admin/api-keys` body `{ ids }` (max 100) |
| Users / invite | `GET /api/admin/users`, `POST /api/admin/users/invite` |
| Login / logout / locale / passwords | corresponding `POST`s |

Errors: `{ error: { key } }`. Add catalog keys (all four locales): `admin.common.loading`, `admin.common.retry`, `admin.keys.loading`, `admin.keys.error`, `admin.users.loading`, `admin.users.error`, `admin.users.invite_sent`, `errors.session_expired`, `errors.invite_failed`, `errors.csrf`. Keep mock-up keys (`admin.keys.empty`, `errors.login_failed`, `errors.password_required`, `admin.reset.sent`, `admin.register.disabled_prefix`, `admin.register.contact_admin`, `admin.register.disabled_suffix`, `admin.register.wechat_qr_alt`, `admin.register.wechat_qr_caption`, …). Loading must not blank the shell. Login closed-register plate uses those keys plus protocol `api-key`; asset `public/EthanWeChat.png` (same file as kb.agent-mate.ai).

**Selectors (`data-testid`):** `admin-home-instructions`, `admin-login`, `register-disabled`, `contact-admin`, `contact-admin-qr`, `login-submit`, `login-error`, `accept-invite-submit`, `accept-invite-done`, `accept-invite-sign-in`, `accept-invite-error`, `landing-instructions`, `admin-hello`, `nav-keys`, `nav-users`, `nav-sign-out`, `issue-key`, `keys-table`, `keys-empty`, `copy-secret`, `users-table`, `delete-admin-confirm`, `locale-EN` … `locale-TW`, `guide-capabilities`, `guide-toc-capabilities`, `guide-capabilities-table`. Per-row delete: `delete-admin-{id}`.

**Must not** appear in client bundles: map keys, `OPENAI_*`, `GMAPS_MCP_*`, `RESEND_*`, `SESSION_SECRET`, `OPEN_METEO_API_KEY`, caller-key plaintext after the mutation. Route handlers: `import "server-only"`. No `NEXT_PUBLIC_` secrets.

```text
app/
  layout.tsx
  (public)/page.tsx                 # /
  (auth)/login/ reset-password/ set-password/ accept-invite/
  instructions/
  admin/layout.tsx                  # AppHeader + AppNav
  admin/page.tsx                    # redirect → /admin/api-keys
  admin/api-keys/page.tsx
  admin/api-keys/new/page.tsx
  admin/api-keys/[id]/page.tsx
  admin/users/page.tsx
  api/admin/{login,logout,session,locale,
    password/reset,password/set,
    users,users/invite,
    api-keys,api-keys/[id],
    api-keys/[id]/regenerate}/route.ts
  api/v1/...
```

Left nav: `admin.nav.keys` → `/admin/api-keys`; `admin.nav.admins` → `/admin/users`; sign out `POST /api/admin/logout`.

### 12.1 Visual direction

**性冷淡**, same family as kb.agent-mate.ai: off-white field, black ink, hairline rules, zero radius, leftover space. Personality sits in **one** place: `agent-logo.png`.

| Do | Do not |
| --- | --- |
| Hairline dividers, uppercase mono labels, black rectangle buttons | Shadows, gradients, border-radius, color status pills |
| Weight and underline for state (active nav, active locale) | Icons in the left nav |
| Show a caller secret once (create / regenerate) | "View secret again" from the list |
| Four locale codes `EN CN HK TW` | A two-way 中文 / EN switcher |

Motion: one short rise on public/auth first paint (`12px`, `700ms`). Respect `prefers-reduced-motion`.

### 12.2 Tokens

```css
--bg: #fafafa;  --bg-elevated: #ffffff;
--ink: #0a0a0a;  --ink-2: #1f1f1f;
--mute: #525252;  --mute-soft: #6b6b6b;
--line: #e0e0e0;  --line-strong: #bdbdbd;
--fill: #f0f0f0;  --danger: #8b1a1a;
--radius: 0;  --control-h: 2.75rem;
--font-ui: "Outfit", "Noto Sans SC", "Noto Sans TC", system-ui, sans-serif;
--font-cn: "Noto Sans SC", "Noto Sans TC", "Outfit", system-ui, sans-serif;
--font-mono: "JetBrains Mono", ui-monospace, monospace;
--max: 760px;
```

**Type scale:** Wordmark Outfit 1.35/1.2rem w500; Page title Outfit 1.5–1.85rem w600; Body Noto SC/TC 1.05rem; Eyebrow/label JetBrains Mono 0.75rem uppercase; Button Outfit 0.8125rem w500; Secret/code JetBrains Mono 0.9–0.95rem.

**Logo:** home/auth `56×56`; header `36×36`; favicon `32×32` PNG + `180×180` apple-touch (transparent background).

### 12.3 Shells

```text
PUBLIC HOME                         AUTH (login / reset / set password)
┌─────────────────────────────┐     ┌─────────────────────────────┐
│                    EN CN HK TW│     │  [logo] places.agent-mate.ai │
│  [logo] places.agent-mate.ai  │     │  notice (register closed)    │
│  tagline · instructions · login│     │  title · fields · submit     │
│                    copyright  │     │                    copyright  │
└─────────────────────────────┘     └─────────────────────────────┘

GUIDE (public)                      APP (signed-in)
┌─────────────────────────────┐     ┌─────────────────────────────┐
│ [logo] host   Back  EN CN…  │     │ [logo] host  Hello, {name}   │
│ Agent instructions          │     │ instructions   EN CN HK TW   │
│ toc · body · diagrams       │     ├────────┬────────────────────┤
│                    copyright│     │ Keys   │ table / form       │
└─────────────────────────────┘     │ Admins │                    │
                                    │ Sign out│                    │
                                    └────────┴────────────────────┘
```

### 12.4 Components

| Component | Spec |
| --- | --- |
| Primary button | Black fill, white type, 1.5px ink border, radius 0. Label is a verb. |
| Text link | Ink, 1px `line-strong` underline; hover → ink underline. |
| Danger-quiet button | Mute type, no fill. Hover → ink. For Delete / Revoke / Regenerate. |
| Field | Mono uppercase label above; bottom-border input. Fill is `--bg`. Focus: 2px ink outline. |
| Notice | `fill` background, 1px `line` border. Errors: `danger` type. |
| Table | No vertical rules. Mono uppercase header. Leading checkbox column. Row actions: text links. |
| Secret panel | Mono secret, copy control, one-time warning. |
| Dialog | Sharp rectangle, 1px line, 28% ink scrim. Escape closes. |

Keyboard: visible `2px` ink focus rings. Primary actions reachable without pointer.

### 12.5 Screen index

Mock-up files: [`ui-mockup/`](./ui-mockup/).

| File | Screen |
| --- | --- |
| `01-home.html` | Public home |
| `02-login.html` | Login; `?error=1` failed |
| `03-reset.html` | Reset request; `?sent=1` |
| `04-set-password.html` | Reset / empty-password set; `?done=1` |
| `14-accept-invite.html` | Accept invite onboarding; `?done=1` |
| `05-instructions.html` / `11-instructions-app.html` | Guide (public / signed-in) |
| `06-keys.html` | Key list; `?empty=1` |
| `07-key-new.html` / `08-key-created.html` | Create key / one-time secret |
| `09-key-edit.html` | Edit / confirm regenerate or delete |
| `10-admins.html` | Admins + invite |
| `12-email-reset.html` / `13-email-invite.html` | Resend email templates |

### 12.6 Copy rules and quality bar

- Name controls by what the operator does (Issue, Copy, Regenerate, Delete, Invite).
- Errors name the failure and the next step. No apology theater.
- Do not mention map-vendor keys, Portainer, or Quanzil in this UI.
- Desktop (~1280) and mobile (~390): public/auth column readable; app nav → text menu.
- Focus order: skip → locale → main landmarks → primary action.
- Secrets never go to `localStorage` in production.

---

## 13. Localization pipeline (tools + UI)

| Layer | Mechanism |
| --- | --- |
| A Copy | Catalogs `EN` `CN` `HK` `TW` |
| B Place names | Vendor `languageCode`; do not glossary-rewrite |
| C Numbers | `Intl`; currency from place country |
| Weather | `weather_code` → `weather.wmo.{code}` — **not** Layer B |
| L LLM prose | Locale instruction + glossary when `HK`/`TW` |

Never pass through `t()`: `places-agent`, locale ids, vendor ids, hostname, `admin` / `me@ethanhuang.com`, tool names, `Authorization: Bearer`.

---

## 14. Environment

Codes in `3.tech-specs.md`. This process needs those plus:

```env
DATABASE_URL=postgresql://…@101.132.156.250:5432/places_agent
PORT=3000
PROMPT_ID=chat.v1
GLOSSARY_ID=
CATALOG_PACK=catalogs.v1
```

**Not used (MVP):** `OPENAI_IMAGE_MODEL` as an image-generation tool. Chat may still accept image **inputs**. **Never:** `NEXT_PUBLIC_*` secrets.

---

## 15. Tests and Makefile

Follow [`agent-test-plan.md`](./agent-test-plan.md) and common-test-strategy. In-repo: Vitest + RTL + Playwright (`3.tech-specs.md`). Dual-channel contract for tools; admin E2E for Features 14–19. Default CI fixture-only.

Scaffold: root `Makefile` with `dev` / `up` / `down` / `test`. `dev` runs `server.ts`.

---

## 16. Incremental build order

Two product slices **by agent capability** — see [`agent-stories.md`](./agent-stories.md) MVP plan. Finish **MVP-1** (including **all admin UI 14–19**) before MVP-2.

**MVP-1 — Operate, call, search restaurants** (one story at a time): 14 home → 15 login/users → 16 landing → 19 i18n → 18 instructions → 17 caller keys → 12 caller-key auth → 11 HTTP+MCP (`server.ts`, `/v1/health`, `/mcp`) → 6 `providers[]` → 5 geocode → 1 `search_restaurants` (HTTP then MCP) → 3 details → 7 `sources[]` → 4 navigate → 13 tool locales (weather keys wait for Feature 9).

**MVP-2 — Places, itinerary, enrich, chat:** 2 `search_places` → 9 `plan_itinerary` + Open-Meteo (`weather.wmo.*`) → 8 Tripadvisor enrich → 10 NL chat loop (reuses the tool core).  

---

## 17. Anti-patterns

- Recreating `agent-config/geo-capability-route.json`
- `NEXT_PUBLIC_` map keys
- Admin session used as a tool credential
- English Open-Meteo phrases in `CN`/`HK`/`TW`
- Mock-only map adapters marked done
- AMAP-agent / Google-agent / weather-agent as LLM agents
- MCP sidecar
- Hardcoded Chinese keywords in English-locale query strings
- Hardcoded city-specific attraction lists instead of generic templates
- Returning empty `photos: []` instead of omitting the field
- Mixed-language search queries (e.g., `"cafe tea house" + "咖啡馆"` in one query)
