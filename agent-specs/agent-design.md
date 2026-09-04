# places-agent — 技术设计

**places-agent** 可部署单元的设计文档：工具核心（HTTP + MCP）与运营者管理后台合为**一个进程**。像素细节：见下文第 §12 节。验收标准：[`agent-stories.md`](./agent-stories.md)。测试方案：[`agent-test-plan.md`](./agent-test-plan.md)。家族技术栈：[`../../workspace-specs/3.tech-specs.md`](../../workspace-specs/3.tech-specs.md)。信任模型：[`../../workspace-specs/2.architecture.md`](../../workspace-specs/2.architecture.md)。

这是一份实现级设计文档。技术栈版本与供应商接口端点见 `3.tech-specs.md`。

**状态：** 草稿 — 每次只实现一个用户故事。

---

## 1. 目标与非目标

| 目标 | 非目标 |
| --- | --- |
| 一个 Node 进程：Next.js 管理后台 + `/v1` 工具接口 + MCP | 第四个 Portainer 栈或 MCP 边车 |
| 调用方看到的 id 为 `places-agent` | 以主机名作为 agent id |
| HTTP 和 MCP 使用相同的工具函数 | 分叉的仅 MCP 业务逻辑；将 Google Worker MCP 作为 `providers[]` id |
| 工具接口使用调用方 API 密钥；管理后台使用会话 Cookie | 以管理员 Cookie 授权地图工具 |
| 简单的 OPENAI_CN 工具循环 | Kubeflow、特征存储、按供应商分立的 LLM 智能体 |
| PostgreSQL 管理用户/密钥（[ADR-025](../../workspace-specs/adr/ADR-025-places-agent-postgres-prisma.md)） | 以 JSON 文件作为数据源；SQLite 卷（ADR-015）；共享 `what2eat` |
| 四种语言目录 | OpenCC；HK↔TW 回退；`next-intl` `[locale]` 路由 |

---

## 2. 运行时形态（单进程）

**入口：** 轻量自定义 Node HTTP 服务器（[ADR-016](../../workspace-specs/adr/ADR-016-custom-http-server.md)）。MCP SDK 原生使用 Node `IncomingMessage`；ChatBox SSE 为长连接。`CMD node server.ts`（Next `output: "standalone"`）。`next start` 不是入口。

```text
node server.ts  (PORT, one process)
  /mcp              → Streamable HTTP MCP (Bearer)
  /sse + /messages  → MCP SSE (ChatBox) (Bearer)
  *                 → Next.js
        / /login /admin/api-keys /admin/users /instructions   operator HTML
        /api/admin/*                           admin BFF (cookie)
        /v1/*  /v1/health                      HTTP tools (Bearer; health is public)
```

| 方案 | 结论 |
| --- | --- |
| 自定义服务器 + Next | **选用** |
| 仅用 Next 路由处理器承载 MCP | 拒绝 — SSE/Web `Request` 与 MCP Node 传输层不兼容 |
| MCP 边车 | 禁止（ADR-012） |

自定义服务器只对 `/mcp`、`/sse`、`/messages` 做特殊处理。`/v1` 保留为 Next 路由处理器，以便 REST、Zod 和 Vitest 继续使用 App Router。

**路径映射**（HTML 对应下文 §12）：

| 路径 | 认证 | 用途 |
| --- | --- | --- |
| `/login` `/login/fresh` `/reset-password` `/set-password` `/accept-invite` `/instructions` | 公开（会话可选） | 运营者 HTML；`/login/fresh` 清除会话后重定向至 `/login` |
| `/admin` `/admin/api-keys` `/admin/api-keys/new` `/admin/api-keys/[id]` `/admin/users` | 管理员会话 | 运营者 HTML；未登录 → `/login`。`/admin` 重定向至密钥页。 |
| `/api/admin/*` | 会话 + CSRF | 同源 BFF |
| `/v1/*` | Bearer 调用方密钥 | HTTP 工具接口 |
| `/v1/health`（以及 `/health` 别名） | 无 | `{ "agent": "places-agent", "ok": true }` |
| `/mcp` | Bearer | Streamable HTTP MCP |
| `/sse` + `/messages` | Bearer | ChatBox 使用的旧版 SSE |

Next 中间件匹配器：仅匹配 `/admin`、`/admin/*`、`/api/admin`、`/set-password`。**绝不**将会话中间件挂载至 `/v1`、`/mcp`、`/sse`、`/messages`。密码为空 → `/set-password`。已登录用户访问 `/login` → `/admin/api-keys`。

工具名称不加前缀。身份标识为 `serverInfo.name` 和 JSON 字段 `agent`。

---

## 3. 模块结构

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

**依赖方向：** `app` / `mcp` / `http` → `core` → `adapters`。**core 不得引入 Next、MCP SDK 或 Prisma。**

Next.js **16.3** App Router，React **19**，TypeScript **7**，Tailwind **4**，React Query，RHF + Zod。锁定 `@modelcontextprotocol/sdk` 和 `openai@6` 版本。实现时以当前 SDK 文档核实 MCP 注册 API。

---

## 4. 拓扑：单一执行核心，双入口路径

只有**一个认知任务**。规划器+工作节点方案以及按供应商分立的 LLM 智能体均无法满足延迟预算。管理后台是 CRUD，不是智能体。

```text
BFF / MCP host
 ├─ Direct tool HTTP/MCP ──┐   ← no LLM (caller already named the tool)
 └─ NL chat → OPENAI_CN loop ─┤
                            ▼
                     Tool core (one)
                            │
         ┌─────────┬────────┼─────────┐
         ▼         ▼        ▼         ▼
       AMAP     Google   Tripadvisor  Open-Meteo
                REST→MCP   enrich      helper
```

**自然语言循环（仅 Feature 10）：**

```
LOOP:
  Model sees: messages + locale + 5 tools (searches, details, navigate, geocode)
  Model decides: tool call or final answer
  If tool: run core, truncate, append, continue
  If answer: Layer A/C catalogs (incl. weather.wmo.*) + Layer L glossary if HK/TW
```

`plan_itinerary` 为 **HTTP/MCP** 接口。如果对话需要生成行程，调用同一函数（第 2 级进度列表）。只有在截断后的行程 JSON 仍然撑爆上下文时才将其隔离为子智能体 — **而非**按供应商拆分。

相信模型会自行排序 geocode → search → details。不要硬编码该顺序。

| 级别 | 用途 |
| --- | --- |
| 1 — 工具 | 自然语言对话默认 |
| 2 — 短进度列表 | 多步行程对话丢失边界/偏好时 |
| 3 — 单一行程子智能体 | 仅在可量化的上下文爆炸时使用 |
| 评估器-优化器 | 推迟到存在 HK/TW 黄金评估集之后 |

**上下文：** 截断供应商 JSON（保留 id、name、location、rating、hours、`sources[]`、跳过原因）。如果某张卡片无法保留 **id + 来源信息**，则以原因 key 标记该结果为失败。仅在 locale 为 `HK`/`TW` 时使用术语表。节奏规则仅在 `plan_itinerary` 轮次中生效。

**上传：** 提取简短结构化提示。不保留字节数据。不将 OCR 结果粘贴到系统提示中。上传失败 → 带 key 的错误；**不得从失败的上传中提取 POI**。图像生成不是 MVP 工具。

**失败处理：** 跳过 + 原因 key，**不允许静默替换**。Google 直连失败 → Worker MCP，来源标注 `GOOGLE_MAPS`。Tripadvisor 失败 → 省略富化数据。天气失败 → 降级行程，不清空行程。搜索为空 → 空列表 + key。OPENAI_CN 失败 → 返回错误，绝不返回空成功响应。幂等工具：**重试一次**后跳过；模型可基于**部分**结果作答。

**人机交互（HITL）：** 搜索/详情/地理编码/导航/对话均无需人工干预。仅在后续出现不可逆副作用时才添加审批节点。

**可观测性（MVP 日志）：** `trace_id`、工具名、`providers[]`、供应商延迟、跳过原因、locale、`prompt_id` / 术语表 id；每个 LLM 轮次：模型名 + token 数。

---

## 5. 工具核心

HTTP `/v1` 和 MCP 调用**相同的函数**。传输层负责认证、解析与封装。

| 函数 | HTTP + MCP 名称 | 自然语言循环 |
| --- | --- | --- |
| `searchRestaurants` | `search_restaurants` | 是 |
| `searchPlaces` | `search_places` | 是 |
| `getPlaceDetails` | `get_place_details` | 是 |
| `navigate` | `navigate` | 是 |
| `geocode` | `geocode` | 是（必须保持公开） |
| `visaRequirement` | `visa_requirement` | 否（结构化；Orizn REST，ADR-044） |
| `planItinerary` | `plan_itinerary` | 仅当对话请求生成行程时 |
| `discoverPlaces` | `discover_places` | 否（结构化拆分） |
| `arrangeDay` | `arrange_day` | 否（结构化拆分） |
| `getWeather` | 非公开 | 行程辅助函数 |

面向调用方的核心公开工具为上表 HTTP+MCP 名称列（双传输契约）。`discover_places` / `arrange_day` 为行程拆分工具（见 §9.2）。单个工具内部并行调用 AMAP+Google 属于**适配器扇出**。Tripadvisor 富化和 Open-Meteo 均在**服务端**处理。定时行程（`detail: "timed"`）在 `plan_itinerary` **内部**编排 geocode / search / weather — 仍然是一个公开 HTTP/MCP 工具。

共享输入：`providers[]`、`locale` 或 `locales[]`、`enrich.tripadvisor?`、`merge?`。核心层根据环境变量与能力矩阵校验 `providers[]`；**绝不**地理强制使用 AMAP（ADR-005）。

### `plan_itinerary` 详情模式

| `detail` | 行为 |
| --- | --- |
| `stops`（默认） | 按天重新分配调用方 `places[]` + 每日天气（MVP-2）。地点为空 → `errors.no_places_to_plan`。 |
| `timed` | 出发地可选。`days[].day_index` **从 1 开始**。`search_anchor` 是**城市**（来自自然语言/已知城市名），而非目的地地标。自动 `search_places` 使用景点允许列表 + 广场/商场/车站/景区拒绝列表（**无**未过滤回退）。当 locale 为 CN/HK/TW 或出发地/目的地/自然语言含有 CJK 字符时，组装的供应商查询使用中文。多天出发地+目的地：在插值走廊定位点处逐天搜索。为每天在范围内的每个时间段排列带时钟的访问 `blocks[]`。午餐取自访问间隙；**晚餐 18:00–20:00**；最后一次访问在 17:00 前结束时可选 `meal: "cafe"`。有营业时间数据时进行过滤。场所身份（`native_id` 或标准化名称）在整个行程中唯一，包括每个餐饮选项；候选不足时额外发起餐厅/咖啡馆查询；仍不足的时段予以省略（不回退到已使用过的场所）。`duration_min > 300` 的餐饮选项将被丢弃。目的地可选地对后续天数 + `legs_to_destination` 施加偏移。CN/HK/TW：若调用方列出了 AMAP，定时搜索**优先 AMAP** 再由 Google 补充（ADR-005：禁止注入 AMAP）。GCJ-02 `near` 坐标不做 GPS 转换。附近搜索半径为城市级别。模块：[`itinerary-timed.ts`](../src/core/itinerary-timed.ts)、[`itinerary-weather.ts`](../src/core/itinerary-weather.ts)、[`place-filters.ts`](../src/core/place-filters.ts)。**路线：** Google 和/或 AMAP `directions()` → `source: "directions"`；失败 → 启发式 + `errors.directions_unavailable` 并标注失败的供应商。AMAP 搜索失败时重试一次。 |

`planning_impact.severity`：根据 WMO 代码 + 高温（`temp_max_c ≥ 32`）得出 `fair` \| `caution` \| `adverse` \| `severe`。标签通过 `itinerary.weather.*` key 提供（ADR-014）。

网关：校验 → 并行扇出 → 标注 `sources[]` → 可选富化 → 可选合并 → 封装响应。

### 5.1 工具能力规格

每个工具返回结构化数据。本节定义每个工具的**完整字段契约** — 调用方可以期望得到什么、哪个供应商提供该字段，以及当供应商无法提供时的回退行为。

#### `search_restaurants` / `search_places`

| 字段 | 类型 | 供应商 | 回退 |
| --- | --- | --- | --- |
| `name` | string | AMAP / Google | 必填 — 缺失则跳过该卡片 |
| `address` | string | AMAP / Google | 必填 |
| `location` | `{ lat, lng, crs }` | AMAP (GCJ-02) / Google (WGS84) | 必填 |
| `rating` | number? | AMAP / Google | 不可用时省略 |
| `hours` | string[]? | AMAP (`opentime_today/week`) / Google (`regularOpeningHours`) | 不可用时省略 |
| `photos` | string[]? | Google (free tier) → Tripadvisor (`/locations/{id}/photos`) → AMAP (`biz_ext.photos`) | 见下方照片回退链。若无供应商返回图片，省略该字段（不返回空数组）。 |
| `types` | string[]? | AMAP / Google | 不可用时省略 |
| `price_level` | string? | Google / AMAP / Tripadvisor (enrich) | 见下方价格归一化。若无供应商返回价格数据，省略该字段。 |
| `price_per_person` | number? | AMAP (`biz_ext.cost`, 元) | 不可用时省略；仅 AMAP 提供数值型人均消费 |
| `provider` | string | System | 必填 — `AMAP` 或 `GOOGLE_MAPS` |
| `sources[]` | array | System | 必填 — 每个参与供应商对应一条记录 |

**供应商组合策略**（MVP-3，取代 ADR-005 的仅调用方路由）：

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

**实时探测（2026-08-20，`PLACES_VENDOR_MODE=live`）：** Clerkenwell Google **11/20** 张卡片有 `price_level`；上海 AMAP **12/20** 张有 `price_level` + `price_per_person`；香港中环合并结果 **6/21** 张有 `price_level`，**5/21** 张有 `price_per_person`。参见 [`workspace-specs/knowledge/maps/price-level-live.md`](../../workspace-specs/knowledge/maps/price-level-live.md)。

#### `get_place_details`

返回与搜索相同的字段，另加：

| 字段 | 类型 | 供应商 | 回退 |
| --- | --- | --- | --- |
| `reviews` | object[]? | Google / Tripadvisor (enrich) | 不可用时省略 |
| `website` | string? | Google | 不可用时省略 |
| `phone` | string? | AMAP / Google | 不可用时省略 |

#### `plan_itinerary` (detail: "timed")

**语言感知查询生成**（与 §5.2 QLP 对齐）：
- **Agent 自组关键词**的路径（timed 自动搜、`discover_places` / LLM Phase1）按 **provider 联动 QLP** 拼词 — 不是「仅 UI locale → 中/英」
- 关键词来自 [`search-keywords.ts`](../src/i18n/search-keywords.ts)；禁止写死英文 `attractions landmarks…` 之类硬编码句
- 模板：`"{city} {localized_keyword}"`（或 catalog 多词模板）
- 餐饮场景：午餐/晚餐/咖啡馆关键词按 **该次 job 的关键字 locale**（AMAP→CN；Google→EN 或 UI locale）区分

**行程中的场所照片**（MVP-3）：
- `blocks[]` 中每个场所在搜索供应商返回数据时包含 `photos` 字段
- 回退：省略 `photos`，绝不返回空数组

#### `geocode`

| 字段 | 类型 | 供应商 | 回退 |
| --- | --- | --- | --- |
| `location` | `{ lat, lng, crs }` | AMAP / Google | 必填 |
| `formatted_address` | string | AMAP / Google | 必填 |
| `place_id` | string? | Google | AMAP 时省略 |

#### `navigate`

| 字段 | 类型 | 供应商 | 回退 |
| --- | --- | --- | --- |
| `deeplinks` | object | AMAP / Google | 必填 — 不含密钥的 URL |
| `distance_m` | number? | AMAP / Google directions | 路线不可用时省略 |
| `duration_min` | number? | AMAP / Google directions | 路线不可用时省略 |

#### `visa_requirement`（MVP-11，ADR-044）

**HTTP：** `POST /v1/visa_requirement` — JSON 响应（非 NDJSON）。**MCP：** 同名工具。

| 输入 | 类型 | 说明 |
| --- | --- | --- |
| `passport` | string | ISO 3166-1 alpha-3（如 `CHN`） |
| `destination` | string | ISO 3166-1 alpha-3（如 `JPN`） |
| `locale` | `EN`\|`CN`\|`HK`\|`TW`? | 映射 Orizn `lang`（缺省 `EN`） |

| 输出字段 | 类型 | 说明 |
| --- | --- | --- |
| `requirement` | string | `visa_free` \| `visa_required` \| `e_visa` \| … |
| `visa_free_days` | number \| null | 免签天数 |
| `description` | string? | locale 化概述 |
| `documents` | string[]? | 所需材料 |
| `process` | string[]? | 申请/入境流程 |
| `processing_time` / `validity` / `max_stay` | string? | 审理时间 / 有效期 / 停留 |
| `extension` | object? | `{ possible, details? }` |
| `last_verified` | string \| null | 数据核验日期 |
| `source_url` | string \| null | 官方来源 URL |
| `unavailable_fields` | string[]? | 免费档 upgrade 占位字段名 |

错误 key：`errors.visa_invalid_country_code`、`errors.visa_unconfigured`、`errors.visa_quota_exceeded`。

**智能体指令示例（管理端 §12.5）：**

```http
POST /v1/visa_requirement
Authorization: Bearer <caller-key>
Content-Type: application/json

{ "passport": "CHN", "destination": "JPN", "locale": "CN" }
```

MCP：`visa_requirement` 同名；description 须含字面量 `places-agent`。

### 5.2 语言路由与查询组装（MVP-4 + itinerary QLP）

三个协同模块 — **provider 选择**、**语言检测（UI/prompt）**、**query 组装（地图搜词）** — 共同决定「agent 自组关键词」时如何搜。均为规则引擎，不调 LLM。

**与 prompt-assembler 的区别（勿混用）：**

| 模块 | 服务对象 | 输出 |
| --- | --- | --- |
| [`prompt-assembler.ts`](../src/agent/prompt-assembler.ts) | **LLM** system / 场景 prompt | 说明文案 |
| [`query-assembler.ts`](../src/core/query-assembler.ts) | **AMAP / Google** 搜索 API | `{ providers, query }[]` jobs |
| [`language-router.ts`](../src/agent/language-router.ts) | UI / prompt locale 检测 | `LanguageContext`（`searchLocale` / `promptLocale`） |

**QLP 适用范围（锁定）：**

| 路径 | 是否走 QLP |
| --- | --- |
| `discover_places`、LLM Phase1 `searchCandidates`、timed `plan_itinerary` 自动搜景点/餐厅 | **是** — agent 自组关键词 |
| 公开 `search_restaurants` / `search_places`（调用方或 chat 模型自带 `query`） | **否** — 保留调用方原文；仅 `applyProviderStrategy` 选地图 |

```typescript
// src/agent/language-router.ts — UI / prompt（不单独决定地图搜词语言）
interface LanguageContext {
  detectedLanguage: "zh" | "en" | string;
  searchLocale: Locale;   // catalog lookup for UI-facing keyword needs
  promptLocale: Locale;   // system prompt selection
}

// src/adapters/provider-resolver.ts — ADR-026 / ADR-030
interface ProviderStrategy {
  searchProviders: ProviderId[];  // GOOGLE_MAPS, AMAP — order matters
  enrichProviders: ProviderId[];  // TRIPADVISOR
}

// src/core/query-assembler.ts — itinerary-composed search only
type SearchJob = { providers: string[]; query: string };
// assembleAttractionSearchJobs / assembleRestaurantSearchJobs → SearchJob[]
```

#### 5.2.1 语言检测（UI / prompt）

1. 显式 `locale` 参数 → 直接使用  
2. 输入中 CJK 字符占比 >30% → `zh` / `CN`  
3. 回退 → `en` / `EN`  

用于 prompt 与 QLP-G 的「第二趟 UI 语言」；**不能**单独决定 AMAP 搜词（见 QLP-A）。

#### 5.2.2 Provider 策略

按 §5.1 / ADR-030：目的地区域 → `{ searchProviders, enrichProviders }`（大陆 AMAP；港 AMAP+Google；其他 Google）。Caller 显式 `providers[]` **始终覆盖**自动策略。

`search_restaurants` / `search_places` / discover 在省略 `providers[]` 时均经 `applyProviderStrategy` / `resolveProviderStrategy`。

#### 5.2.3 Query Language Policy (QLP)

**按「这次 job 打哪家地图」拼关键字**，不是「界面是 CN 就中文、EN 就英文」。

| 策略 | Query 语言 | 适用条件 |
| --- | --- | --- |
| **QLP-A** (AMAP) | **纯简体 CN**（catalog `CN`） | `providers` 含 `AMAP` 的 job |
| **QLP-G** (Google) | EN；若 UI ≠ EN 再并行一趟 UI locale | `providers` 含 `GOOGLE_MAPS` 的 job |

**细则：**

- **QLP-A：** 无论 UI 是 EN/CN/HK/TW，AMAP job **只用简体**；禁止英文景点句打高德（哈尔滨实测英文 attractions → 0，中文「景点」→ 有结果）。
- **QLP-G：** UI=EN → 仅英文；UI≠EN → EN + UI locale **并行**，合并去重。
- **双 provider**（如 where2play 传 `[AMAP, GOOGLE_MAPS]`）：**拆成多 job**，禁止一个英文 query 同时 fan-out 两家。
- **延迟封顶：** AMAP 景点模板 ≤2；Google 景点 1～2 job；餐厅每 provider 通常 1（+ UI 双语时 +1）。

**where2play 主路径：**

```
POST /v1/discover_places
  { city, bounds, origin?, locale, numDays?, providers? }
  → resolve providers（caller 或 auto）
  → assembleAttractionSearchJobs + assembleRestaurantSearchJobs
  → parallel searchPlaces / searchRestaurants per job
  → merge by name → candidates
POST /v1/arrange_day { candidates, dayIndex, … }
```

BFF 不组地图关键词；关键词政策在 places-agent。

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

表不穷举；未命中保持原语言。景点另有 `viewpoint` / `park` / `historic` 等键（CN「景点」等）。

**实例（itinerary / discover）：**

| 场景 | UI | Providers | 实际搜词 jobs |
| --- | --- | --- | --- |
| 哈尔滨发现 | CN | AMAP+Google（caller） | AMAP: CN 景点模板；Google: EN（+ CN） |
| 哈尔滨发现 | EN | AMAP+Google | AMAP: **仍 CN**；Google: EN only |
| 东京发现 | EN | Google | Google: EN |
| timed 上海 | EN UI + 城市含 CJK | AMAP wave | CN catalog（不得因 UI=EN 用英文 attractions） |

**性能：** 同 provider 多 job / 双语 Google 用 `Promise.all`；合并按 `name`（discover）或 timed 既有 `native_id` / 使用集合。

### 5.3 提示组装

> **实现与契约见 §9.1（MVP-6）。** 本节不再单独维护「MVP-7」草稿。

Chat / tool 的 system prompt 由 [`prompt-assembler.ts`](../src/agent/prompt-assembler.ts) 按 `locale` + `intent` 拼接；**地图搜词**见 §5.2.3 query-assembler，二者分离。

---

## 6. 适配器与地点卡片

| 适配器 | Id | 说明 |
| --- | --- | --- |
| AMAP Web 服务 | `AMAP` | `PLACES_VENDOR_MODE=live` 时使用实时模式：[`config.ts`](../src/adapters/amap/config.ts)、[`direct.ts`](../src/adapters/amap/direct.ts)、[`card-mapper.ts`](../src/adapters/amap/card-mapper.ts)（将 `opentime_today` / `opentime_week` 映射至 `PlaceCard.hours`）、[`keywords.ts`](../src/adapters/amap/keywords.ts)、[`directions.ts`](../src/adapters/amap/directions.ts)（`/v3/direction/walking|driving|transit/integrated`）、[`live.ts`](../src/adapters/amap/live.ts)。`lng,lat`；GCJ-02；通过 `/v3/assistant/coordinate/convert`（`coordsys=gps`）转换 WGS `near` 坐标；餐饮 `types=050000`；有 `address` 无 `near` → 先地理编码再以 `/v5/place/around` 半径 1000 搜索。非实时模式时使用 Fixture：[`fixture.ts`](../src/adapters/amap/fixture.ts)。**无** `weatherInfo`。无 Worker 回退。 |
| Google direct REST | `GOOGLE_MAPS` | Places New / Geocoding / Routes；WGS-84；`languageCode` 来自 locale 映射表。模块：[`src/adapters/google/direct.ts`](../src/adapters/google/direct.ts) |
| Google Worker MCP | 同 `GOOGLE_MAPS` | 直连出站失败后使用。`GMAPS_MCP_*`。首先调用 `tools/list`。模块：[`src/adapters/google/mcp-client.ts`](../src/adapters/google/mcp-client.ts)。组合模块：[`src/adapters/google/live.ts`](../src/adapters/google/live.ts)。**开发测试：** `GOOGLE_DIRECT_FORCE_FAIL=1`（生产环境拒绝使用）。 |
| Tripadvisor Terra | `TRIPADVISOR` | **仅用于富化**（ADR-007，ADR-020）：评分、评论、**照片回退**（MVP-3）。`PLACES_VENDOR_MODE=live` 时使用实时模式：[`config.ts`](../src/adapters/tripadvisor/config.ts)、[`direct.ts`](../src/adapters/tripadvisor/direct.ts)、[`match.ts`](../src/adapters/tripadvisor/match.ts)、[`card-mapper.ts`](../src/adapters/tripadvisor/card-mapper.ts)、[`live.ts`](../src/adapters/tripadvisor/live.ts)。`GET /locations/nearby` 携带 `lat`+`lon`+`radius=1`+`unit=KM`；请求头 `X-API-Key`；附近搜索 URL 中不传 `location_id` 或 Google/AMAP 原生 id。**照片：** `GET /locations/{id}/photos` — 仅在 Google Photos 不可用或需付费时调用；`location_id` 来自附近搜索步骤。非实时模式时使用 Fixture：[`fixture.ts`](../src/adapters/tripadvisor/fixture.ts)。 |
| Open-Meteo | `OPEN_METEO` | **不**出现在 `providers[]` 中。`PLACES_VENDOR_MODE=live` 时使用实时模式：[`config.ts`](../src/adapters/open-meteo/config.ts)、[`direct.ts`](../src/adapters/open-meteo/direct.ts)、[`live.ts`](../src/adapters/open-meteo/live.ts)。`GET /forecast` 携带 `latitude`+`longitude`+`daily=weather_code,temperature_2m_max,temperature_2m_min`+`timezone=auto`；客户主机上可选 `apikey`。非实时模式时使用 Fixture：[`fixture.ts`](../src/adapters/open-meteo/fixture.ts)。保留 `weather_code` + 数值；本地化 `weather.wmo.{code}`。 |
| Orizn Visa | `ORIZN_VISA` | **不**出现在 `providers[]` 中（与 Open-Meteo 同类辅助数据源）。`PLACES_VENDOR_MODE=live` 时 REST 直连 `GET /api/v1/visa`（`x-api-key`）；**不** spawn `orizn-visa-mcp` 子进程（远程 MCP 端点即使带 Key 也仅暴露 `quick_visa_check`，不足材料/流程级答案 — 见 [ADR-044](../../workspace-specs/adr/ADR-044-orizn-visa-rest-adapter.md)）。模块：`src/adapters/orizn/{config,direct,fixture,live}.ts`。进程内 `(passport, destination, lang)` TTL 缓存（默认 24h，`ORIZN_CACHE_TTL_H`）。fixture 样本：CHN→JPN、CHN→SGP 等。 |

| 字段 | 规则 |
| --- | --- |
| `provider` | 主供应商 id |
| `sources[]` | `{ provider, native_id, logo_url?, deeplinks }` — native id 仅属于**该**供应商 |
| `primary_provider` | `merge: true` 时使用 |
| `location` | 每个来源对应 `{ lat, lng, crs: "WGS84" \| "GCJ-02" }`；不得在同一定位点混用坐标系 |
| `name` / `address` | 第 B 层：供应商字符串；不使用术语表替换 |
| Deeplinks | 不含密钥 |
| Photos | URL 中不含密钥；必要时通过 BFF 代理至 `/v1`；绝不使用 `NEXT_PUBLIC_` |

---

## 7. HTTP 响应封装

所有 `/v1` JSON 响应体（含健康检查）：

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

| Key | 典型 HTTP 状态码 |
| --- | --- |
| `errors.caller_unauthorized` | 401 |
| `errors.place_not_found` | 404 |
| `errors.empty_results` | 200 + 空列表 |
| `errors.provider_failed` / `unconfigured` / `capability_unsupported` | 200 + `skipped[]` |
| `errors.upload_unsupported` / `upload_too_large` | 400 |

始终输出 **key**。按请求的 locale 解析目录文本；回退顺序：请求 locale → `EN` → 原始 key。不允许 HK↔TW 互相回退。

---

## 8. MCP

| 项 | 契约 |
| --- | --- |
| 传输 | Streamable HTTP `POST/GET /mcp` |
| ChatBox | 在**同一** `McpServer` 上的 `GET /sse` + `POST /messages` |
| 认证 | initialize **之前**验证调用方 Bearer |
| `serverInfo.name` | `"places-agent"` |
| 工具名称 | 不加前缀 |
| 工具描述 | 必须包含字面量 `places-agent`，以便 ChatBox/Cursor 宿主模型能够优先选用这些工具，而非通用搜索或供应商地图 MCP |
| 模式 | Zod，与 HTTP 共享 |
| 结果 | 与 `/v1` 的 `data` + outcome key 含义相同 |

`registerTools(server)` → 仅使用 `core.*`。

---

## 9. 智能体 LLM（Qwen，ADR-047）

- 使用 `openai` SDK，`baseURL` = `QWEN_BASE_URL`（compatible-mode），而非 `api.openai.com`。
- 模型：`QWEN_CHAT_MODEL`（默认 `qwen-plus`）。`QWEN_API_KEY` 为空时回退 `OPENAI_*`。
- 上限：最大迭代次数 + 出站 HTTP 超时约 25s；界面软提示约 10s（统一延迟契约）。

**版本（git 即注册表）：**

| 制品 | 示例 id | 位置 |
| --- | --- | --- |
| 系统提示 | `chat.v1` | `prompts/chat/v1.md` |
| 旅行术语表 | `travel.v1` | `prompts/glossaries/travel.v1.json` |
| 目录包 | `catalogs.v1` | `messages/*.json` |

环境变量：`PROMPT_ID`、`GLOSSARY_ID`（`EN`/`CN` 时为 null）、`CATALOG_PACK`。回滚 = 锁定 id。发布后不得原地修改 `v1`。

### 9.1 Prompt 组装器 (MVP-6)

**模式：** 基础模板 + 场景片段拼接。按 locale 选 base prompt，按 intent 追加 overlay。

```
prompts/
  base.en.md                    — 角色定义 + 通用规则（英文；由 chat/v1 迁移）
  base.zh.md                    — 角色定义 + 通用规则（中文）
  overlays/
    meal-search.md               — 餐厅搜索场景指引
    place-search.md              — 景点搜索场景指引
    itinerary-planner.md         — 行程规划 prompt（含自查指令 + JSON 期望）
```

**未落地独立文件：** `budget` / `time-of-day` 作为字符串常量**内联**于 [`prompt-assembler.ts`](../src/agent/prompt-assembler.ts)（与 Claude Code Plan 一致）。无 `itinerary-reviewer.md`（单 LLM 自查，无第二 Reviewer 调用）。

```typescript
// src/agent/prompt-assembler.ts
interface PromptContext {
  locale: Locale;
  intent: "meal" | "place" | "itinerary" | "chat";
  budget?: "budget" | "premium";
  timeOfDay?: "morning" | "afternoon" | "evening";
  glossary?: string;
}

function assembleSystemPrompt(ctx: PromptContext): string;
```

拼接顺序：`base.{en|zh}.md` → `overlays/{intent}.md`（chat 可无 overlay）→ 内联 budget 提示（可选）→ 内联 time-of-day 提示（可选）→ glossary（HK/TW 时）。

### 9.2 行程规划：MCP 工具拆分 + Token 优化 (MVP-6)

**性能与 MCP 路由：** 见 [`performance.md`](./performance.md) **v2.4** + [ADR-036](../../workspace-specs/adr/ADR-036-where2play-assistant-quanzil.md) + [ADR-037](../../workspace-specs/adr/ADR-037-where2play-plan-l2-quanzil.md) + [ADR-040](../../workspace-specs/adr/ADR-040-plan-itinerary-align-split-tools.md) — 形成行程 **必须 LLM**；**Mode H**（`execution=host`）已交付（Feature **35**）；**MCP 缺省 `execution=agent`**（ADR-040 D4'：不要求改客户端 system prompt）；**2play 初排 L2 + 助手 = 本应用 OPENAI_CN**（as-built：本地拼 prompt；目标 `plan-11` 拉 host）；禁叠跑。

**MCP 工具拆分：** 将行程规划拆为可逐步返回的工具；`plan_itinerary` 仍为一站式 HTTP/MCP 入口。

| 工具 | 职责 | MCP | HTTP |
|------|------|-----|------|
| `discover_places` | 搜景点+餐厅+天气，返回候选列表（L1，无 LLM） | ✅ | ✅ `/v1/discover_places` |
| `arrange_day` | 从候选中为第 N 天安排路线；`execution=agent`（默认）跑服务端 LLM，或 `execution=host` 仅返回 prompt | ✅ | ✅ `/v1/arrange_day` |
| `plan_itinerary` | 一次返回完整行程（内部可走 LLM 或 legacy） | ✅ | ✅ `/v1/plan_itinerary` |

**Mode H（Feature 35）：** `arrange_day` + `execution: "host"` → `{ execution: "host", system_prompt, user_prompt, output_contract, candidates_slim }`；**本请求不调 OpenAI**；共享 `buildSchedulePrompt`（MCP 与 HTTP）。宿主（ChatBox / Cursor / 2play `plan-11`）用自有模型执行。缺省或 `execution: "agent"` → 服务端 OPENAI_CN 结构化排程（既有行为）。

**对话默认（ADR-043）：**
- `discover_places`（缺字段 → 单条 `intake`）→ `arrange_day`（**强制 agent**）→ 按 `next_action` 先上屏当日 → `presented_previous_day=true` 再下一天  
- **HTTP Mode H：** 仅 2play / 显式 host；MCP 忽略 host  
- **一站式整包：** `plan_itinerary` / `trip_plan` / `trips`  
- **一站式：** `plan_itinerary`（内部搜索 + LLM/legacy）  
- **2play 主路径（ADR-037）：** `discover_places` only；L2 在 BFF OPENAI_CN（不默认 `execution=agent`）

**HTTP progressive（ADR-032 #5，where2play L1）：** 当请求头 `Accept: application/x-ndjson` 时：

| 端点 | 流事件（一行一 JSON） | 结束 |
| --- | --- | --- |
| `POST /v1/discover_places` | `{type:"candidate", kind:"place"\|"restaurant", card}` 每 POI | `{type:"discover_done", counts}`；无 Accept 时仍返回批量 JSON |
| `POST /v1/arrange_day`（`execution=agent`） | Zod OK 后 `{type:"place", dayIndex, block}` 按序每块 | `{type:"day_done"}`；无 Accept 时仍返回批量 JSON |
| `POST /v1/arrange_day`（`execution=host`） | 无 LLM 流；单次 JSON handoff | `{ execution, system_prompt, user_prompt, … }` |

- `discover_places`：`numDays` 传入真实 N（不得硬编码 1）；`city` = 目的地字符串；L1 = 通用热门模板 query + Google **RELEVANCE**（ADR-043；**禁止 POPULARITY**）；**无城市 CATALOG**（ADR-042/D9：源码禁任何城市 POI 知识，CATALOG 已清空）；must-see 由 LLM 从候选池推断（`discover-must-see-llm.ts`）。  
- MCP `arrange_day`：**强制 agent**（忽略 `execution=host`）；返回 `start_time` / `legs_to_here` / `next_action`；软闸 `presented_previous_day`（ADR-043）。  
- HTTP `arrange_day`：仍可 `execution=host`（2play Mode H）。
- `arrange_day`：可选 `exclude_names: string[]`；硬必去 Feature **36**；真交通 enrichment Feature **37**（`legs_to_here`）。
- **MCP 工具保持 request/response**（无 NDJSON）；session 见 Feature **38**。

**Token 优化：**

| 参数 | 旧值 | 新值 | 效果 |
|------|------|------|------|
| 候选数 | 15/type | **8/type** | user message -50% |
| max_completion_tokens | 4096 | **arrange 1280 / multi-day 2048** | 单日更短；多日仍 2048 |
| 候选描述 | name+type+rating+lat/lng+hours+price | **name+type+rating+lat/lng** | -30% |
| LLM 超时 | 无限制 / SDK timeout | **AbortSignal 硬中断 45s**（`LLM_ARRANGE_TIMEOUT_MS` / `LLM_ITINERARY_TIMEOUT_MS`）；校验失败才重试一次；超时不重试 | 避免 OPENAI_CN 挂死；用户单次最多 ~45s |

**行程配图：** Phase 4 格式化时，用 block.name 匹配候选的 `photos` 字段（来自 MVP-3b），挂回每个 block。封面图 = Day 1 第一个 attraction 的第一张 photo。零额外 API 调用。

**架构流程（单 LLM + 自查 + Zod）：**

```
discover_places(city, bounds, locale, providers?):
  providers = caller providers[] OR resolveProviderStrategy(city)   // ADR-030
  // ADR-042/043 D9: no city CATALOG in source. Generic hot templates (e.g. "西安 景点")
  // + Google rankPreference=RELEVANCE (never POPULARITY). Must-see identification
  // comes from LLM inference over the pool (discover-must-see-llm.ts), not a seed encyclopedia.
  jobs = discover query-assembler: generic templates + QLP           // §5.2.3 + ADR-038/042
  parallel searchPlaces / searchRestaurants per job
  merge by name → filterAttractionPlaces / filterDiningPlaces
       → deny fragments (票/直通车/敌楼/「主名-」后缀)
       → dedupeByCluster → ensureMustSeeDiversity
  rank: rating + inferred must-see (LLM) — no per-city hardcoded boost
  → top 8×min(numDays,3) per pool
  → { candidates, weather? }
  // L1: no LLM for candidate search. Pool head must be diverse primaries, not wall-fragment spam.
```

arrange_day(candidates, day_index, origin, destination, pace, budget, locale, execution?):
  if execution == "host":
    return buildSchedulePrompt(...)   // no OpenAI; Feature 35
  // ADR-043 D9: deterministic injection removed. LLM 漏排 must_include focus →
  // 硬失败重试一次（callItineraryLlmWithValidationRetry）；theme 门控 focus：
  // 仅当 day_theme 命中 missing token 才强制 focus，否则 token 留待后续 themed 日（末日门仍保证覆盖）。
  LLM 规划 + 自查（temperature 0.35，max_tokens=1280，AbortSignal 45s）
  Zod 校验 → 失败重试一次 → 超时/网络不重试 → 仍失败 → fallback 旧代码
  enrichArrangeTransit(...)           // Feature 37 legs_to_here（可降级）
  匹配候选 photos → 挂回 blocks
  → { day: { blocks, from_origin?, to_destination? } }

plan_itinerary(input):
  // LLM mode: Phase1 = same discover searchCandidatePools; or legacy timed with QLP-aware queries
  …
```

**行程优化模块（MVP-8 / ADR-040/043 D9）：**

| 模块 | 职责 |
| --- | --- |
| [`trip-intake.ts`](../src/core/trip-intake.ts) | MCP/HTTP arrange 边界收集 + intake 门（need_input）+ host_instructions RULE |
| [`must-include-coverage.ts`](../src/core/must-include-coverage.ts) | `must_include` 覆盖追踪、sticky covered、theme 门控 focus token 选择 |
| [`discover-must-see-llm.ts`](../src/core/discover-must-see-llm.ts) | LLM 从候选池推断公认 must-see（prompt 无城市名，替代硬编码 CATALOG） |
| [`discover-dedupe.ts`](../src/core/discover-dedupe.ts) | 地标 cluster 去重 + 池头多样性（无城市专属正则） |
| [`query-assembler.ts`](../src/core/query-assembler.ts) | discover/LLM Phase1/timed 的地图搜词 jobs（通用模板，无城市种子） |
| [`enrich-arrange-transit.ts`](../src/core/enrich-arrange-transit.ts) | Feature 37：arrange blocks 挂 `legs_to_here`/`from_origin`/`to_destination`，失败降级 heuristic + `transit_outcome` |
| [`arrange-present-gate.ts`](../src/mcp/arrange-present-gate.ts) | MCP 顺序展示软闸（`presented_previous_day`/`ack_day_index`）+ 续排 host_instructions |
| [`http-transport.ts`](../src/mcp/http-transport.ts) | Feature 38：SSE/Streamable 路由 + session 生命周期（缺/过期可恢复） |
| [`tests/no-city-hardcode-guard.test.ts`](../tests/no-city-hardcode-guard.test.ts) | 守卫：源码禁任何城市 POI 知识（ADR-042 原则钉成 CI 闸） |

**新旧切换：**

| | 设计意图 | **当前实现**（`src/core/itinerary.ts`） |
|--|----------|----------------------------------------|
| 环境变量 | `ITINERARY_MODE=llm` \| `legacy` | 同名 |
| 默认值 | **`llm`** | **`llm`**（`process.env.ITINERARY_MODE ?? "llm"`） |
| 生产启用 LLM | 默认即 LLM | 旧路径测试须显式 `ITINERARY_MODE=legacy` |

旧代码路径保留不删。

**搜索范围：** 有城市名 → 5km 半径；无城市名 → `errors.location_too_broad`。

**出发地/返回地交通（每日酒店可选）：**  
- 聊天应**询问**每日酒店/地标起点，但**非硬门禁**（用户可不提供）。  
- **有** origin（名称或坐标）→ 含 `from_origin`（酒店→首站）与 `to_destination`（末站→回程）；站间必须有 `legs_to_here`。  
- **无** origin → **省略** `from_origin` / `to_destination`；行程自第一个 block 起、至最后一个 block 止；**站间仍须** `legs_to_here`（游中交通时间）。首 block `start_time` ≥ 10:00。  

**MCP 固定行程表（8 行，每次相同）：** 城市、开始日、天数、可选酒店、节奏（轻松/适中/紧凑，默认适中）、消费 `spend_level` 1 节约 / 2 适中 / 3 宽松（默认 2）、兴趣（可选）、必去/一日游地名。禁止随机少问。  

**必去覆盖闸（ADR-043 D7 + D9 精简；HTTP = MCP）：**  
- `preferences.must_include` 每次带回。  
- 共用 `arrangeDay`：对仍 missing 的 token **一次自动补搜一个**（theme 对齐优先，否则名单顺序）→ geocode 锚点 → search 合并进候选 → prompt HARD MUST SCHEDULE（可与城内点混排）。  
- **D9 精简（删确定性注入）：** LLM 漏排 focus token → **硬失败重试一次**（不再服务端造低质块注入）。  
- **theme 门控 focus：** 仅当本日 `day_theme` 命中某 missing token 才对该 token 强制 focus；无 theme 或 theme 不匹配 → 不强制 focus，token 留待后续 themed 日（末日门仍保证覆盖）。避免 day-trip 小镇被无 theme 的早期日抢排成半天。  
- 响应字段 `must_include_coverage: { must_include, covered, missing }`（HTTP envelope 与 MCP 同结构）。  
- 末日若仍有 missing → MCP `next_action: present_day_then_cover_must_include`，禁止总览。  

**空候选自动 discover（ADR-043 D8；HTTP = MCP）：**  
- 硬必填仅 city + 开始日 + 天数；调用方候选池可选。  
- `exclude_names` 后若 **`places` 为空**且 `city` 已给 → `arrangeDay` 内调 `discoverPlaces` 填景点（餐厅侧若亦空则一并填），再进 D7 / LLM。仅餐厅空、景点已有时不 live discover。  
- 无 city 且池空 → 清晰失败；失败文案禁止诱导宿主 invent POI。  
- 末日 host_instructions：Day 卡与总览各写一次后 STOP；日卡仅列工具返回的 `blocks[]`。  

**日卡版式：** 多行块（`### HH:MM–HH:MM｜店名` + 说明 + 前往 + 路线/地点链接）；禁止单行 `|` 压缩。  

**节奏与「排满」收工（默认 `medium`）：**  
| pace | 上限 blocks/日 | 收工期望 | 不满（须重试/补排） |
| --- | --- | --- | --- |
| `relaxed` | ≤4 | 末块结束 ≥ **17:00** | 末块结束早于 **16:00** |
| `medium`（默认） | ≤5 | 须含 **dinner**；末块结束约在晚餐结束（目标 **~20:00**，窗 18:00–20:30） | 无晚餐，或末块结束早于 **16:00**，或适中日在 **19:00** 前收工且无晚餐 |
| `tight` | ≤6 | 须含 **dinner**；末块结束 ≥ **19:30** | 同 medium 的不满底线，且过稀 |

**LLM 输出 schema（per day，Zod 校验）：**

```json
{
  "day_index": 1, "date": "2026-08-25",
  "from_origin": { "transport": "metro", "duration_min": 25, "depart_time": "09:30" },
  "blocks": [{
    "name": "精确匹配候选 name",
    "type": "attraction | lunch | dinner | cafe",
    "start_time": "10:00",
    "duration_min": 90,
    "reason": "推荐理由",
    "alternatives": [{ "name": "...", "reason": "..." }]
  }],
  "to_destination": { "transport": "taxi", "duration_min": 40, "arrive_time": "18:30" }
}
```

**边界条件：** origin ≠ destination → 搜索锚点逐天偏移；候选不足 → prompt 说明；Zod 2 次失败 → fallback + `outcomeKey`。

---

## 10. 数据（[ADR-025](../../workspace-specs/adr/ADR-025-places-agent-postgres-prisma.md)）

PostgreSQL + Prisma。本地 `DATABASE_URL=postgresql://places_agent:places_agent@localhost:5435/places_agent`（或 `:5436`）。生产环境使用阿里云专用数据库 `places_agent`，地址 `101.132.156.250:5432`。不使用挂载卷上的 SQLite（ADR-015 已废止）。不共享 `what2eat` 数据库。

| 实体 | 字段 |
| --- | --- |
| `AdminUser` | `id`、`username` 唯一、`email` 唯一、`passwordHash`（设置前为空）、邀请/重置 token **哈希值** + 过期时间 |
| `CallerApiKey` | `id`、`name`、`description`、`keyHash` 唯一、`prefix`、可选 `secret`（明文，供管理后台列表 Copy；迁移前行为 `null`）、`status` `ACTIVE`\|`REVOKED`、`lastUsedAt` |
| `Trip`（MVP-16 / ADR-046） | `id`、`revision`、`status`、`callerKey`、`locale`、`expiresAt`、分区 JSON（constraints / candidates / skeleton / cursor / filled / artifacts）；进程内内存热副本，见 §21 |
| Session | **封装 Cookie**，非数据表。后续可选：用户上的 `sessionVersion` 字段用于全部吊销 |

种子数据：用户名 `admin`，邮箱 `me@ethanhuang.com`。**不**将密码内置到镜像中。空哈希 → `/set-password` 或 Resend 重置。

密码：使用 `node:crypto` scrypt 算法。调用方密钥：`pa_` + 32 字节随机数；存储 SHA-256 `keyHash` 用于 Bearer 鉴权，并持久化明文 `secret` 供管理后台列表 Copy（[ADR-034](../../workspace-specs/adr/ADR-034-caller-api-key-secret-at-rest.md)）。创建/重新生成响应仍返回 `secret`；`GET /api/admin/api-keys`（仅会话）亦返回 `secret`（旧行可为 `null`）。

---

## 11. 认证

| 渠道 | 凭证 | 无效场景 |
| --- | --- | --- |
| 运营者后台 + `/api/admin` | 会话 Cookie | `/v1`、`/mcp`、`/sse` |
| HTTP 工具接口 + MCP | `Authorization: Bearer` | 管理页面 / `/api/admin` |

Cookie：`HttpOnly`、`Secure`（生产环境）、`SameSite=Lax`、`Path=/`。HTTPS 有保证时优先使用 `__Host-places_agent_session`。载荷 `{ userId, username }` 以 `SESSION_SECRET` 封装。

CSRF（仅 Cookie 写操作）：`SameSite=Lax` **加上** `Origin` / `Referer` 必须匹配本主机。Bearer 接入面没有 CSRF Cookie 攻击风险；不要从运营者浏览器发送调用方密钥。

调用方密钥：对 Bearer 取哈希，查询 `ACTIVE` 状态。缺失/未知/已吊销/地图供应商密钥作为 Bearer → `errors.caller_unauthorized`。使用时序安全比较。

---

## 12. 管理后台

部署在 **`places.agent-mate.ai`** 的运营者管理网页。功能 14–19 的像素与交互契约。可点击原型：[`ui-mockup/`](./ui-mockup/)。locale Cookie 为 `places_locale` — **不使用** `[locale]` 路径段。

| URL | 功能编号 | 原型文件 | 认证 |
| --- | --- | --- | --- |
| `/` | 14 | `01-home.html` | 公开 |
| `/login` | 15 | `02-login.html` | 公开；已登录 → `/admin/api-keys` |
| `/reset-password` | 15 US3 | `03-reset.html` | 公开 |
| `/set-password` | 15 US5 | `04-set-password.html` | 仅限重置 token 或空密码会话 |
| `/accept-invite` | 15 US4 | （已实现；原型待定） | 邀请 token；用户资料与密码引导 |
| `/instructions` | 18 | `05` / `11` | 公开或会话；内容相同；字面量 `places-agent` |
| `/admin` | 16 | — | 会话；**重定向** → `/admin/api-keys` |
| `/admin/api-keys` | 16 + 17 (US5 bulk delete) | `06-keys.html` | 会话；**登录后落地页** |
| `/admin/api-keys/new` | 17 US1 | `07-key-new.html` | 会话 |
| `/admin/api-keys/[id]` | 17 US2–4 | `09-key-edit.html` | 会话 |
| `/admin/users` | 15 US4 | `10-admins.html` | 会话 |

**密钥展示与复制：** 非 URL。`POST` 创建/重新生成在变更载荷中返回 `secret` → `SecretOncePanel`。列表 `GET /api/admin/api-keys` 返回 `secret`（或 `null`）供行内 **Copy**（`admin.keys.copy_list`）；表格单元格不展开完整明文。`secret == null` 时 Copy 禁用。不使用 `localStorage`。

**国际化：** 自定义目录 `messages/{EN,CN,HK,TW}.json` + `t(locale, key, vars)`。**不添加 `next-intl`。** 缺失 key → `EN` → 原始 key。从 `ui-mockup/assets/i18n.js` 初始化（去掉画廊 key）。HK 与 TW 必须有所区别。邮件复用相同文件（`admin.reset.mail_body`、`admin.users.invite_mail_body`，含 `{url}`）。邀请/重置 `{url}` 为绝对路径：依次使用 `PUBLIC_BASE_URL`、`APP_URL`，本地回退 `http://localhost:${PORT}`，生产环境为 `https://places.agent-mate.ai`。`POST /api/admin/locale` 后调用 `router.refresh()`。`html lang`：`en` / `zh-CN` / `zh-HK` / `zh-TW`。

**数据：** React Query → 同源 `/api/admin/*`，携带 `credentials: "include"`。不需要 Zustand。表单使用 RHF + Zod（包括 `/accept-invite` 向 `/api/admin/accept-invite` 的 POST）。

| 界面操作 | 接口 |
| --- | --- |
| 页头问候语 | `GET /api/admin/session` → `{ name, email, mustSetPassword }` |
| 密钥列表 | `GET /api/admin/api-keys`（含 `prefix` + 可选 `secret`） |
| 签发/重新生成 | `POST` / `POST …/regenerate` 返回 `secret` 并写入库 |
| 编辑 | 仅 `PATCH` name/description |
| 删除单个 | `DELETE /api/admin/api-keys/[id]` |
| 批量删除 | `DELETE /api/admin/api-keys`，请求体 `{ ids }`（最多 100 个） |
| 用户/邀请 | `GET /api/admin/users`、`POST /api/admin/users/invite` |
| 登录/登出/语言/密码 | 对应 `POST` 接口 |

错误格式：`{ error: { key } }`。在全部四种语言目录中新增以下 key：`admin.common.loading`、`admin.common.retry`、`admin.keys.loading`、`admin.keys.error`、`admin.users.loading`、`admin.users.error`、`admin.users.invite_sent`、`errors.session_expired`、`errors.invite_failed`、`errors.csrf`。保留原型 key（`admin.keys.empty`、`errors.login_failed`、`errors.password_required`、`admin.reset.sent`、`admin.register.disabled_prefix`、`admin.register.contact_admin`、`admin.register.disabled_suffix`、`admin.register.wechat_qr_alt`、`admin.register.wechat_qr_caption`……）。加载时不得清空页面框架。登录注册关闭提示板使用上述 key，协议为 `api-key`；资源文件 `public/EthanWeChat.png`（与 kb.agent-mate.ai 使用同一文件）。

**选择器（`data-testid`）：** `admin-home-instructions`、`admin-login`、`register-disabled`、`contact-admin`、`contact-admin-qr`、`login-submit`、`login-error`、`accept-invite-submit`、`accept-invite-done`、`accept-invite-sign-in`、`accept-invite-error`、`landing-instructions`、`admin-hello`、`nav-keys`、`nav-users`、`nav-sign-out`、`issue-key`、`keys-table`、`keys-empty`、`keys-copy-{name}`、`copy-secret`、`users-table`、`delete-admin-confirm`、`locale-EN` … `locale-TW`、`guide-capabilities`、`guide-toc-capabilities`、`guide-capabilities-table`。按行删除：`delete-admin-{id}`。

**不得**出现在客户端静态包 / `NEXT_PUBLIC_*` 中：地图密钥、`QWEN_*`、`OPENAI_*`、`GMAPS_MCP_*`、`RESEND_*`、`SESSION_SECRET`、`OPEN_METEO_API_KEY`。调用方 `secret` 仅经管理会话 API 下发至运营者后台，不写入公开 `/v1` 响应。路由处理器：`import "server-only"`。

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

左侧导航：`admin.nav.keys` → `/admin/api-keys`；`admin.nav.admins` → `/admin/users`；退出登录 `POST /api/admin/logout`。

### 12.1 视觉风格

**性冷淡**风格，与 kb.agent-mate.ai 同属一个家族：米白背景、黑色文字、细线分隔、零圆角、留白充裕。个性体现在**唯一**一处：`agent-logo.png`。

| 做 | 不做 |
| --- | --- |
| 细线分隔、等宽大写标签、黑色矩形按钮 | 阴影、渐变、圆角、彩色状态标签 |
| 用字重和下划线表示状态（激活导航、激活语言） | 左侧导航中使用图标 |
| 仅在创建/重新生成时显示一次调用方密钥 | 从列表中"再次查看密钥" |
| 四个语言代码 `EN CN HK TW` | 中文/EN 双向切换器 |

动效：公开页/认证页首次渲染时一次短暂上升（`12px`，`700ms`）。遵守 `prefers-reduced-motion`。

### 12.2 设计令牌

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

**字号规格：** 字标 Outfit 1.35/1.2rem w500；页面标题 Outfit 1.5–1.85rem w600；正文 Noto SC/TC 1.05rem；眉毛/标签 JetBrains Mono 0.75rem 大写；按钮 Outfit 0.8125rem w500；密钥/代码 JetBrains Mono 0.9–0.95rem。

**Logo：** 首页/认证页 `56×56`；页头 `36×36`；favicon `32×32` PNG + `180×180` apple-touch（透明背景）。

### 12.3 页面框架

```text
公开主页                              AUTH（登录 / 重置 / 设置密码）
┌─────────────────────────────┐     ┌─────────────────────────────┐
│                    EN CN HK TW│     │  [logo] places.agent-mate.ai │
│  [logo] places.agent-mate.ai  │     │  提示（注册已关闭）           │
│  标语 · 使用说明 · 登录        │     │  标题 · 字段 · 提交           │
│                    版权信息   │     │                    版权信息   │
└─────────────────────────────┘     └─────────────────────────────┘

指南（公开）                          APP（已登录）
┌─────────────────────────────┐     ┌─────────────────────────────┐
│ [logo] host   返回  EN CN…  │     │ [logo] host  你好，{name}    │
│ 智能体说明                   │     │ 使用说明   EN CN HK TW       │
│ 目录 · 正文 · 示意图          │     ├────────┬────────────────────┤
│                    版权信息  │     │ 密钥   │ 列表 / 表单         │
└─────────────────────────────┘     │ 管理员 │                    │
                                    │ 退出登录│                    │
                                    └────────┴────────────────────┘
```

### 12.4 组件规格

| 组件 | 规格 |
| --- | --- |
| 主按钮 | 黑色填充，白色文字，1.5px 墨色边框，圆角 0。标签为动词。 |
| 文字链接 | 墨色，1px `line-strong` 下划线；悬停 → 墨色下划线。 |
| 危险静默按钮 | 哑色文字，无填充。悬停 → 墨色。用于删除/吊销/重新生成。 |
| 输入字段 | 等宽大写标签在上；底边框输入框。填充色为 `--bg`。聚焦：2px 墨色轮廓。 |
| 通知 | `fill` 背景，1px `line` 边框。错误：`danger` 颜色文字。 |
| 表格 | 无垂直分隔线。等宽大写表头。首列为复选框列。行操作：文字链接。 |
| 密钥面板 | 等宽密钥，复制控件，一次性警告。 |
| 对话框 | 直角矩形，1px 线条，28% 墨色遮罩。Escape 关闭。 |

键盘操作：可见的 `2px` 墨色焦点环。主要操作无需鼠标即可触达。

### 12.5 页面索引

原型文件：[`ui-mockup/`](./ui-mockup/)。

| 文件 | 页面 |
| --- | --- |
| `01-home.html` | 公开主页 |
| `02-login.html` | 登录；`?error=1` 失败 |
| `03-reset.html` | 重置申请；`?sent=1` |
| `04-set-password.html` | 重置 / 空密码设置；`?done=1` |
| `14-accept-invite.html` | 接受邀请引导；`?done=1` |
| `05-instructions.html` / `11-instructions-app.html` | 指南（公开 / 已登录） |
| `06-keys.html` | 密钥列表；`?empty=1` |
| `07-key-new.html` / `08-key-created.html` | 创建密钥 / 一次性密钥 |
| `09-key-edit.html` | 编辑 / 确认重新生成或删除 |
| `10-admins.html` | 管理员 + 邀请 |
| `12-email-reset.html` / `13-email-invite.html` | Resend 邮件模板 |

### 12.6 文案规范与质量标准

- 按运营者的操作命名控件（签发、复制、重新生成、删除、邀请）。
- 错误信息指明失败原因和下一步操作。不做无意义的道歉。
- 界面中不提及地图供应商密钥、Portainer 或 OPENAI_CN。
- 桌面端（约 1280px）和移动端（约 390px）：公开页/认证页列可读；应用导航 → 文字菜单。
- 焦点顺序：跳过链接 → 语言选择 → 主要区域 → 主操作。
- 生产环境中密钥绝不写入 `localStorage`。

---

## 13. 本地化流水线（工具 + 界面）

| 层 | 机制 |
| --- | --- |
| A 文案 | 目录 `EN` `CN` `HK` `TW` |
| B 地点名称 | 供应商 `languageCode`；不用术语表重写 |
| C 数字 | `Intl`；货币来自地点所在国家 |
| 天气 | `weather_code` → `weather.wmo.{code}` — **非** B 层 |
| L LLM 文本 | locale 指令 + 术语表（`HK`/`TW` 时） |

不得通过 `t()` 处理的内容：`places-agent`、locale id、供应商 id、主机名、`admin` / `me@ethanhuang.com`、工具名称、`Authorization: Bearer`。

---

## 14. 环境变量

`3.tech-specs.md` 中列出的变量均需配置。本进程还额外需要：

```env
DATABASE_URL=postgresql://…@101.132.156.250:5432/places_agent
PORT=3000
PROMPT_ID=chat.v1
GLOSSARY_ID=
CATALOG_PACK=catalogs.v1
# MVP-11 — Orizn Visa（operator-owned；见 ADR-044）
ORIZN_API_KEY=orizn_visa_…
ORIZN_VISA_BASE_URL=https://visa.orizn.app/api/v1
ORIZN_CACHE_TTL_H=24
```

**MVP 不使用：** `OPENAI_IMAGE_MODEL` 作为图像生成工具。对话仍可接受图像**输入**。**绝不：** `NEXT_PUBLIC_*` 暴露密钥。

---

## 15. 测试与 Makefile

遵循 [`agent-test-plan.md`](./agent-test-plan.md) 及通用测试策略。仓库内：Vitest + RTL + Playwright（`3.tech-specs.md`）。工具双渠道契约测试；管理后台 E2E 测试覆盖功能 14–19。CI 默认仅使用 Fixture。

脚手架：根目录 `Makefile`，包含 `dev` / `up` / `down` / `test` 目标。`dev` 运行 `server.ts`。

---

## 16. 渐进构建顺序

按**智能体能力**划分为两个产品切片 — 见 [`agent-stories.md`](./agent-stories.md) MVP 计划。在 MVP-2 之前完成 **MVP-1**（包括**全部管理后台 UI 14–19**）。

**MVP-1 — 运营、调用、搜索餐厅**（每次一个用户故事）：14 主页 → 15 登录/用户 → 16 落地页 → 19 国际化 → 18 使用说明 → 17 调用方密钥 → 12 调用方密钥认证 → 11 HTTP+MCP（`server.ts`、`/v1/health`、`/mcp`）→ 6 `providers[]` → 5 地理编码 → 1 `search_restaurants`（先 HTTP 后 MCP）→ 3 详情 → 7 `sources[]` → 4 导航 → 13 工具语言（天气 key 等待功能 9）。

**MVP-2 — 地点、行程、富化、对话：** 2 `search_places` → 9 `plan_itinerary` + Open-Meteo（`weather.wmo.*`）→ 8 Tripadvisor 富化 → 10 自然语言对话循环（复用工具核心）。

---

## 17. 反模式

- 重新创建 `agent-config/geo-capability-route.json`
- 使用 `NEXT_PUBLIC_` 暴露地图密钥
- 以管理员会话作为工具凭证
- 在 `CN`/`HK`/`TW` 中使用英文 Open-Meteo 短语
- 仅 Mock 的地图适配器标记为已完成
- 将 AMAP-agent / Google-agent / weather-agent 用作 LLM 智能体
- MCP 边车
- 在英文 locale 查询字符串中硬编码中文关键词
- 使用硬编码的城市景点列表而非通用模板
- 返回空的 `photos: []` 而非省略该字段
- 混合语言的搜索查询（例如在一个查询中同时使用 `"cafe tea house"` 和 `"咖啡馆"`）
- CJK 启发式误判海外中文城市名（新加坡、大阪、曼谷）为大陆 — 应使用排除列表
- Fixture 地理编码将所有未知城市解析为香港默认值 — 应扩大覆盖范围

---

## 18. §12 轻骨架 + 增量无 LLM 填充工具族（MVP-10，agent 侧已实现 2026-09-01）

**真源：** `[performance.md](./performance.md)` §12（估算、探针实测 §12.9、确认决策 §12.5/12.5.1/12.11）；`[0.refactor-plan.md](./0.refactor-plan.md)` 批次 11（Feature 43–47 分期）。

### 18.1 术语规约

| 术语 | 定义 |
| --- | --- |
| itinerary | 行程骨架：每天 day_theme + stop 名称顺序 + 餐位 slot 位置；**无时间、无交通、无富信息** |
| stop | itinerary 中一个具体地点：名称 + POI + 位置（坐标） |
| transit | 两 stop 间交通建议：mode（公交/步行/打车）+ 预估时间/费用/路线描述；高低搭配 = 2 mode |

### 18.2 工具族

| 工具 | 职责 | LLM | 输出 |
| --- | --- | --- | --- |
| `discover_places`（保留） | 候选池（景点+餐厅）+ LLM 推断 must-see | L1 否；must-see 推断 1 次 | `{ candidates, inferred_must_see }` |
| `make_itinerary`（新） | 生成骨架：顺序 + 餐位 slot，无时间 | 是，1 次，流式 | `ItinerarySkeleton` |
| `plan_next_stop`（新） | 按骨架顺序算 current→next transit（串行）+ 取富信息 | 否 | `PlanNextStopOutput` |
| `display_current_stop`（as-built） | 渲染 transit（高低搭配）+ 富信息（POI/评价/图片/deeplink） | 否 | `DisplayCurrentStopOutput` |

**目标态（ADR-046 / MVP-16）：** 新增 `fetch_trip_details`；**删除** `display_current_stop`（写并入 `plan_next_stop`）；填充主路径改 `trip_id`+cursor。详见 §21。

### 18.3 调用流程

```text
discover_places → make_itinerary（流式骨架先吐顺序）
  → display_current_stop(起点) 计入 itinerary
  → 循环: plan_next_stop(current) → display_current_stop(next) → 计入 itinerary
  → 一天结束 → 下一天（骨架已定顺序，继续填充）
  → 全程结束
```

### 18.4 make_itinerary 流式事件契约（§12.5.1 已确认）

```text
skeleton_start
  → skeleton_day { day_index, day_theme, stops: [{ name, kind, meal_slot? }] }  × N 天
  → skeleton_done
```

### 18.5 数据结构（草案）

```typescript
type ItinerarySkeleton = {
  days: Array<{
    day_index: number;
    date?: string;
    day_theme: string;            // "Belém 经典" / "Sintra 一日游"
    stops: Array<{
      name: string;               // 必须在候选池内
      kind: "attraction" | "meal";
      meal_slot?: "lunch" | "afternoon_tea" | "dinner";
      must_include?: boolean;
    }>;
  }>;
};

type PlanNextStopInput = {
  skeleton: ItinerarySkeleton;
  current_stop: { name: string; location?: { lat: number; lng: number } };
  next_stop: { name: string; kind: string; meal_slot?: string };
  origin?: { name?: string; lat?: number; lng?: number };
  /** 自然语言交通偏好，原样拼入 prompt；有偏好→单 mode，无→高低搭配 */
  transit_preference?: string;
  candidates: { places: PlaceCard[]; restaurants: PlaceCard[] };
};

type PlanNextStopOutput = {
  next_stop: { name: string; location: { lat: number; lng: number } };
  legs: ItineraryLeg[];
  transit_outcome: "directions" | "heuristic" | "partial";
};

type DisplayCurrentStopOutput = {
  stop: { name: string; card: PlaceCard; deeplinks: Record<string, string> };
  legs_to_here: ItineraryLeg[];
  from_origin?: { transport: string; duration_min: number };
};
```

### 18.6 行程规则（make_itinerary prompt 内）

- 有每日起点/终点 → 当天首/末 stop 即起终点；无 → 选经典知名且交通方便的景点作起点
- stop 顺序顺路（A-B-C 同方向），按节奏和交通偏好预估 transit 预留（骨架不含时间，仅顺序优化）
- 安排午餐、晚餐；根据末 stop 到晚餐间隔可选下午茶/咖啡（骨架标 meal_slot 位置）
- must_include 硬排：必去点必须出现在某天 stops 内，漏排硬失败重试一次
- day-trip 分配：day_theme 标注一日游区域，当天 stops 都在该区域

### 18.7 工具删除/别名（已确认策略 2 硬删除）

| 动作 | 工具 | 依赖迁移 |
| --- | --- | --- |
| 删除 | `arrange_day` | where2play `plan-arrange-llm.ts` / `plan-day-by-day.ts` → 新工具族（Feature **37** plan-46） |
| 吸收 | `enrich_arrange_transit` → `plan_next_stop` | where2play `plan-enrich-transit.ts` → plan_next_stop（Feature **37** plan-46） |
| 删除 | `navigate` | 无调用方（what2eat client 死代码），安全删 |
| 别名 | `plan_itinerary`/`trip_plan`/`trips` → `make_itinerary` | 向后兼容，无实际调用方 |

### 18.8 性能基线（探针实测 §12.9，Lisbon 4D）

| 指标 | 当前架构 | 新架构（估算） |
| --- | --- | --- |
| 总墙钟 | ~1.8 min | **~0.5–0.7 min** |
| 首 stop 可见 | 23.4s+（首日整日 LLM） | **~15–28s**（骨架流式首顺序） |
| LLM 次数 | 4（每天 1 次） | **1**（骨架） |

### 18.9 F42 校验迁移

站间时序校验、同日餐厅去重迁入 `plan_next_stop`/`display_current_stop` 填充层（Feature 44）；day-trip 补搜词扩展迁入骨架层（Feature 43）。

### 18.10 填充时钟与餐位窗口（MVP-13 F53/F54）

骨架 echo **不含**时间。MCP 填充链必须把上一站 `slot.end` 作为 `current_stop.end_time` → `previous_stop.end_time` 前传。`displayCurrentStop` 用 `earliestFeasibleStart(prevEnd, recommendedLeg, fallback)`。跨日 stay 重置 `time_from=09:00`。

HTTP `/v1` 无 `next_tool_call`：2play 自管循环时必须同样传 `previous_stop.end_time`。

`meal_slot`：lunch 窗口起点 11:30、afternoon_tea 15:00、dinner 18:00；start = max(earliestFeasible, 窗口起点)。

### 18.11 骨架确定性回退（MVP-13 F55/F56/F58）

LLM 重试仍失败时：超节奏日从尾部裁 attraction；站名精确失败后 NFKC/去空白/大小写匹配当次候选并改写为规范名。最终失败时 envelope `data.detail` 带校验原文。

### 18.12 区域 must_include 展开（MVP-13 F57，ADR-042）

无法精确命中候选的 must_include token：geocode 后 nearby/`search_places` 并入候选。禁止源码城市 POI 表。

### 18.13 Stay 角色（MVP-14 F59）

- **day_origin_stay**：当日 `stops[0]` 且名称与 trip `origin.name` 相同 → 09:00 开钟、`origin_stop`、无 inbound legs。
- **return_stay / midday_stay**：同日非首 stay → 正常 `legs_to_here` + 时钟累加；note 为 `return_stay` 或 `midday_stay`，非 `origin_stop`。
- **跨日**：仅下一日 index 0 的 origin stay 重置 `time_from=09:00`（`nextFillStep` 不变）。
- **骨架**：每 day 至多一个 `kind=stay` 且须为 `stops[0]`；与 origin 同名但 index>0 的 stay 校验失败。

### 18.14 Leg 地理/时长闸（MVP-14 F60）

- `resolvePoint` geocode：`${stop.name}, ${city}`（fill 链透传 `city`）。
- 解析点距 anchor（origin 或上一站）> `DISCOVER_GEO_MAX_KM`（80km）→ 丢弃坐标，legs 空或 heuristic，`transit_outcome: partial`。
- `duration_min` 硬顶：同城 ≤180min，超则不进入 `earliestFeasibleStart`。
- **骨架**：拒绝与区域 token / 城市名等价的单字 attraction（如裸 `Belem`）。

### 18.15 迟到午餐（MVP-14 F61）

- `meal_slot=lunch` 且 feasible > 14:30 → 按 dinner 窗口（≥18:00）落位，note=`meal_promoted_to_dinner`。
- 骨架 prompt + 校验：lunch 不得排在当日最后一个 attraction 之后；可确定性前移到 midday。

### 18.16 骨架确定性回退扩展（MVP-15 F62）

对齐 §18.11：在 `validateSkeleton` **之前**对 LLM JSON 做确定性修复，减少强制第二次 LLM。管线顺序：

1. `remapStopNamesToPool`
2. `trimAreaAliasStops`
3. `reseatLateLunchStops`
4. **`reseatStayToDayOrigin`（新）** — 每 day 仅保留一个 `kind=stay` 并挪到 `stops[0]`；多余 stay 删除
5. **`dropCityNameStops`（新）** — 名称归一化等于 destination `city` 且非 stay 池的站删除
6. `trimPaceOverages`
7. **`reseatLateLunchStops` 再跑一次** — trim/drop 可能再次把 lunch 留在末 attraction 后
8. `validateSkeleton`

**Schema：** `day.date` 接受 `null`/空串并视为省略（LLM 常发 `"date": null`，否则 Zod 整单失败触发无意义重试）。

**超时可读：** `withAbortTimeout` 触发 `isLlmAbortError` 时，若循环内已有 `lastError`（attempt≥1 校验失败后的重试超时），抛错消息须含 prior validation 摘要（例：`LLM timed out after 90000ms (after attempt 1 validation: …)`）。不默认提高 `LLM_SKELETON_TIMEOUT_MS`。

不改变 F59–F61 填充层语义；不放宽 `validateSkeleton` 产品规则（stay/lunch/area 仍硬校验，靠修复而非放宽）。

---

## 19. Orizn 签证 adapter + `visa_requirement` 工具（MVP-11，2026-09-01 已实现）

真源：[ADR-044](../../workspace-specs/adr/ADR-044-orizn-visa-rest-adapter.md) · Feature **48** · where2play Feature **38–39**。

### 19.1 架构定位

- **辅助数据源**（与 Open-Meteo 同类）：不进 `providers[]`、不参与 ADR-026 区域路由。
- **传输：** REST 直连 Orizn `GET /api/v1/visa`；密钥 `ORIZN_API_KEY` 仅存在于 places-agent 进程。
- **不采用：** stdio 子进程 `npx orizn-visa-mcp`；远程 `https://visa.orizn.app/mcp`（实测仅 `quick_visa_check`，无完整材料/流程）。

### 19.2 模块布局（目标）

```text
src/adapters/orizn/
  config.ts      # ORIZN_API_KEY, ORIZN_VISA_BASE_URL, ORIZN_CACHE_TTL_H
  direct.ts      # fetch GET /visa?passport=&destination=&lang=; injectable FetchFn
  fixture.ts     # CHN→JPN, CHN→SGP 等固定样本
  live.ts        # PLACES_VENDOR_MODE=live 组装
src/core/visa-requirement.ts   # visaRequirement(input) → VisaRequirementResult
```

HTTP：`POST /v1/visa_requirement`（[`dispatch.ts`](../src/http/dispatch.ts) + [`schemas.ts`](../src/http/schemas.ts)）。  
MCP：[`create-server.ts`](../src/mcp/create-server.ts) 注册 `visa_requirement`（Zod inputSchema，与 HTTP 共享 core）。

### 19.3 输入 / 输出契约

**输入：**

```ts
{
  passport: string,       // ISO 3166-1 alpha-3，如 CHN
  destination: string,    // ISO 3166-1 alpha-3，如 JPN
  locale?: "EN"|"CN"|"HK"|"TW"  // 缺省 EN
}
```

**Orizn lang 映射：** EN→`en`；CN/HK/TW→`zh`（Orizn 无 zh-HK/zh-TW 变体）。

**输出 `data`（节选）：**

```ts
{
  passport, destination,
  requirement: "visa_free"|"visa_required"|"e_visa"|"visa_on_arrival"|"eta"|"no_admission"|...,
  visa_free_days: number | null,
  description?: string,
  documents?: string[],
  process?: string[],
  processing_time?: string,
  validity?: string,
  max_stay?: string,
  extension?: { possible: boolean; details?: string },
  last_verified?: string | null,
  source_url?: string | null,
  unavailable_fields?: string[]   // 免费档 upgrade 占位字段名
}
```

### 19.4 错误与配额

| 条件 | 行为 |
| --- | --- |
| 非法 alpha-3 | `errors.visa_invalid_country_code` |
| 缺 `ORIZN_API_KEY`（live） | `errors.visa_unconfigured` |
| Orizn 403/429 | `errors.visa_quota_exceeded`；不编造签证事实 |
| 缓存命中 | 同 `(passport, destination, lang)` TTL 内不重复请求 |

### 19.5 where2play 消费（后续切片）

- **本 MVP-11 agent 切片：** 仅交付工具；where2play **不**在本切片开发查询 UI。
- **where2play MVP-11（spec）：** 注册/资料页增加 `nationality`（ISO alpha-3，选填）；Prisma `User.nationality String?`。
- **出行建议页 / Plan 贴士签证卡（规划中）：** BFF 读 `User.nationality` + 目的地 → `POST /v1/visa_requirement` **写入** `artifacts.visa`；**UI 经 `fetch_trip_details` `artifacts` 展示**。禁止把 visa HTTP 响应当 2play 渲染源（Feature **39** 占位，实现待后续立项）。

---

## 20. 必去地统一获取（双模）+ travel_tips + 工具清理 + MCP 无会话化（MVP-12，ADR-045 Accepted 2026-09-01）

真源：[ADR-045](../../workspace-specs/adr/ADR-045-iconic-places-unified-acquisition.md) · Feature **49 / 50 / 51 / 52** · `[agent-stories.md](./agent-stories.md)` Feature 49–52。

### 20.1 架构定位

必去地获取从 `discover_places` 内联提升为独立 core 方法 `findIconicPlaces`，双模：

- **grounded**（pool 非空）：LLM 从池挑，池校验，可排程。
- **ungrounded**（pool 空）：LLM 按目的地参数化生成，仅展示。

`travel_tips` 复用 `findIconicPlaces`。工具本身仍可在无池时独立调用（MCP / 仅贴士场景）。**2play Plan 主路径不在助手问答期调用 `travel_tips`**；贴士四卡在骨架写入之后，见 [§23](#23-宿主生成行程的调用契约2026-09-02)。

### 20.2 模块布局（目标）

```text
src/core/find-iconic-places.ts   # findIconicPlaces 双模；grounded 分支复用 inferMustSeeFromPool 逻辑
src/core/must-include-merge.ts   # dedupeMustInclude 下沉（user ∪ iconic，归一化去重，limit 截断）
src/core/travel-tips.ts          # travelTips：findIconicPlaces + open-meteo + tips-prose LLM
src/core/discover-places.ts      # discoverPlaces 改造：并行 + 补搜 + must_see 标志
```

`discover-must-see-llm.ts` 的 `inferMustSeeFromPool` 被 `find-iconic-places.ts` 取代（grounded 分支复用其逻辑）。

HTTP：`POST /v1/travel_tips`（`dispatch.ts` + `schemas.ts`）。
MCP：`create-server.ts` 注册 `travel_tips`。`findIconicPlaces` 为 core 内部方法，不单独注册。

### 20.3 findIconicPlaces 契约

```ts
export type FindIconicPlacesInput = {
  destination: string;
  city?: string;                 // as-built 入参名；与 destination 同义
  pool?: PlaceCard[];
  limit: number;
  locale?: Locale;
  numDays?: number;              // MVP-17：≥3 时 ungrounded 须含附近一日游地区名
  _testChatCreate?: ItineraryChatCreate;
};
export type FindIconicPlacesResult = { names: string[]; grounded: boolean };
```

- grounded：prompt 不含目的地名（沿用 ADR-042 现有约定），LLM 从池挑，`normalizeMustIncludeToken` 校验。
- ungrounded：prompt 含目的地名（不排程，无对账问题），LLM 参数化生成。**`numDays >= 3`：** 须同时列出附近一日游**地区名**与城内地标（知识在 LLM 权重，禁止源码城市表）。
- 失败返回 `[]`，不阻塞调用方。
- **展示名单真源（MVP-17 过渡）：** `travel_tips` 响应 `iconic_places`。**MVP-18：** 真源为 Trip `artifacts.tips.iconic_places`，宿主 `fetch_trip_details`。
- discover 并行调用本方法仅用于补搜/`must_see` 打标，**不得**用 `inferred_must_see` 替换展示名单。
- **排序质量（Feature 74，MVP-18 P1）：** 见 §20.11。禁止城市 POI 表。

### 20.4 discover_places 改造流程

```
Phase A: searchCandidatePools（类目供应商搜；0 LLM）
Phase B: 2play init（F41 S2）— 内部 `findIconicPlaces({ pool, limit: max_number 默认 5 })` **只对 Phase A 已建池**按热度打 `must_see`（`user_ratings_total`，缺则 `rating`）。**不再**调供应商搜附近热点、**不再** LLM 从池外提名。不升 HTTP。
Phase C: 用户 must_include（若本次请求带了）只补搜进池 + 可选 user_requested；不得关掉已有 must_see
Phase D: 双写 candidates（保留评分字段）；inferred_must_see 仅信封、等于 must_see 名列表
```

**MVP-20 F41 S2：** 2play 起飞 discover **不带** `must_include`。打标 = 池内热度（默认 5）。`travel_tips` **无池**路径仍可 ungrounded LLM。禁止 HTTP `find_iconic_places`。禁止为打标再搜 POI。

禁止：用用户 3 处覆盖池上 8 处 `must_see`。正交规则见 §20.12 / §24。

### 20.11 findIconicPlaces 知名度与近郊日游（MVP-18 Feature 74）

**问题：** 多天行程 ungrounded 名单可能挤满城内地标，近郊日游目的地（供应商池里已有、游客常去）排不进展示列表。补搜（§20.4 C）只保证「被点名的名字能进池」，**不保证**「该被点名」。

**机制（目的地无关，ADR-042）：**

1. **Ungrounded（已有）：** `numDays >= 3` 的 prompt 要求附近一日游**地区名** + 城内地标；limit 随 `iconicLimitForTripDays`。
2. **入池后再选（本 Feature）：** Phase A 类目搜索结束后，对 **attraction 池** 再跑一次 **grounded** `findIconicPlaces`（或同等排序）：LLM 只从池内挑；并列时用卡片上已有供应商信号（如 `user_ratings_total` / rating，有则用、无则跳过），**不**在源码写城市→POI。
3. **合并展示名单：** 写入 `artifacts` 的有序列表 = ungrounded 日游名 ∪ grounded 池内热门，去重截断；discover 补搜仍按 unmatched 名执行。
4. **验收：** 非目录城市与热门城市同一套代码路径。Lisbon live **允许**出现卡斯凯什/辛特拉类地区名；测试 **禁止** assert 源码 CATALOG 或硬编码城市表。

**不在本 Feature：** 注册 HTTP `find_iconic_places`；热度包/外部 publishable pack（仍属 ADR-042 允许的远期替代）。

### 20.5 PlaceCard.must_see 字段

```ts
// core/types.ts
must_see?: boolean;        // 热门 / iconic（discover 热度打标）。用户名单不得将其改回 false
user_requested?: boolean;  // 可选：此卡也是 constraints.must_include 命中（只加不减 must_see）
```

用户指定名单的权威存放：`Trip.constraints.must_include: string[]`（原始说法）。不新建 POI 表。

非破坏性，只在 discover 流程内赋值。`make_itinerary` / `arrange_day` 直接读，无需独立 `must_include` 对账。展示层可渲染"必去"徽章。

### 20.6 travel_tips 契约

**输入：**

```ts
{
  destination: string;
  bounds?: { start: string; end: string };   // 有则真实天气，无则气候平均
  trip_type?: string;                          // 出行类型
  pace?: string;                               // 出行节奏
  skeleton?: ItinerarySkeleton;                // 有则提取 stops 名作 pool（grounded，方案 A）
  constraints?: Record<string, unknown>;       // where2play 行程规划输入的其他限制
  locale?: Locale;
  providers?: string[];
  pool?: PlaceCard[];                           // 显式池；与 skeleton 二选一
}
```

**skeleton 消费（方案 A）：** 传 `skeleton` 时内部提取 `skeleton.stops[].name`（attraction 类）组装 pool 传 findIconicPlaces（grounded）。提取为纯数据转换，无 LLM。where2play 只传 skeleton，不碰 LLM。`skeleton` 与 `pool` 二选一，都传时 skeleton 优先。

**输出：**

```ts
{
  intro: string;                  // ≤80 字
  iconic_places: string[];         // findIconicPlaces 返回；2play 贴士 01 与助手 g **同一有序数组**；limit 随 numDays 缩放，不再写死 3
  transit: string;
  weather: WeatherSummary;         // open-meteo 聚合；失败降级
  clothing: string;
  safety: string;
}
```

**天气聚合（多日）：** severity 取全段最差值（fair < caution < adverse < severe）；drivers 全段并集去重；temperature 为 `[min(逐日最低), max(逐日最高)]` 区间。单日直接用当日预报。

**20s 超时与并行降级（MVP-12 as-built）：** geocode+weather 与 findIconicPlaces 并行；tips-prose 若仍在写路径执行，则在两者完成后。外层 `AbortSignal.timeout(20_000)`；分步超时：geocode 3s、weather 3s、findIconicPlaces 12s、tips-prose 10s。weather/findIconicPlaces 超时降级。

**MVP-18 F76 覆盖：** tips-prose 超时或失败 → **HTTP 200**（只要 iconic 分支有 names）；`dualWriteTrip` 仍写入 `artifacts.tips.iconic_places`；intro/transit/clothing/safety 可空。仅 iconic 与工具整体都失败时 502。**2play 不得用本工具响应体渲染贴士**（§22.3）。

**LLM 参数：** findIconicPlaces `max_tokens 300, temperature 0.3`；tips-prose `max_tokens 900, temperature 0.4, stream:false`。均 `AbortSignal` 硬中断。

**缓存：** geocode 复用 `cachedGeocode`；weather 按 `{lat,lng,date}` 缓存 30 分钟；findIconicPlaces 按 `{destination, pool-hash, limit}` 缓存 1 小时。

**不做二次验证：** findIconicPlaces 返回结果直接信任，不调供应商验证；ungrounded 返回 `grounded:false` 供展示层标注。

LLM 调用 ≤ 2 次（findIconicPlaces + tips-prose）。所有用户可见文案为 i18n 键。墙钟关键路径 ≈ 16s，留 4s 余量。

### 20.7 别名重指向与删除 gate

- `plan_itinerary` / `trip_plan` / `trips` 别名 handler 重指向 `makeItinerary`。
- `arrange_day` / `enrich_arrange_transit` / 旧 `planItinerary` 删除 **gate 于 where2play plan-46**（BFF `plan-day-by-day.ts` 切新管线后）。
- agent 侧改造（findIconicPlaces、travel_tips、discover 改造、must_see、别名重指向）不依赖 plan-46，可先行。

### 20.8 反模式（沿用）

- 不得把"城市 → POI 列表"写进源码（ADR-042）。ungrounded 模式知识在 LLM 权重。
- 不得用 iconic 名搜索替换类目搜索（会丢多样化候选池）。
- travel_tips 不嵌入 make_itinerary 自动管线。

### 20.9 MCP `/mcp` 无会话化（stateless）

`handleMcp`（`src/mcp/http-transport.ts`）改为单例 stateless transport：

```typescript
let shared: { transport: StreamableHTTPServerTransport; server: McpServer } | null = null;
function getSharedStateless() {
  if (!shared) {
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    const server = createPlacesMcpServer();
    void server.connect(transport);
    shared = { transport, server };
  }
  return shared;
}

export async function handleMcp(req, res, body) {
  if (req.method === "GET") return res.writeHead(405).end();
  if (req.method === "DELETE") return res.writeHead(405).end();
  const { transport } = getSharedStateless();
  await transport.handleRequest(req, res, body);
}
```

- 响应无 `mcp-session-id` 头；不做会话校验；`mcp_session_invalid` 分支移除。
- `mcpSessions` / `SessionManager` 在 `/mcp` 路径不再引用；`/sse` legacy 路径保持现状。
- 安全性：MCP 端点鉴权由部署层承担，与会话无关；工具无鉴权差异。

### 20.10 host_instructions 防编造兜底

F47 `host_instructions` 追加硬约束：工具失败时禁止用参数知识编造行程/地点/交通；告知用户服务暂不可用并请重试；可降级调 `travel_tips` 给通用信息，但不得伪造具体行程。stateless 治本（消除会话失败），指令治标（其它失败防最差行为）。

---

## 21. Trip Store（PG 权威 + 内存热副本）+ 按需读取（MVP-16，ADR-046 Accepted 2026-09-02）

**真源：** [ADR-046](../../workspace-specs/adr/ADR-046-trip-store-pg-memory-fetch.md) · `[0.refactor-plan.md](./0.refactor-plan.md)` 批次 16（Feature **63–66**）。

### 21.1 目标与非目标

| 目标 | 说明 |
| --- | --- |
| G1 | 多工具改**同一份**行程（换餐、调序、受控改骨架，不必整次重跑 `make_itinerary`） |
| G2 | 宿主（尤其 where2play）更好使用行程数据与上下文 |
| 附带 | 减 MCP 大包 JSON；**非**为再抠 LLM 秒数 |

**非目标：** 宿主直连 DB；新增 `start_trip`；对外暴露 `patch_skeleton`；默认按日并发 LLM 骨架；恢复 MCP transport session 当业务状态。

### 21.2 存储与同步

- **权威：** PostgreSQL（§10 / ADR-025），薄表 + JSONB 分区字段可接受；忌长期上帝单列无版本。
- **热副本：** 进程内内存实体；**非**双主。
- **写：** 改内存 → 落 PG → 返回新 `revision`（可带 patch）。
- **读：** 内存命中；未命中或 revision 落后 → PG → 内存。
- **冲突：** 乐观锁 `revision`。
- **隔离：** `caller_key` + `expires_at`（TTL）；`trip_not_found` 时禁止宿主编造。

### 21.3 逻辑模型

```text
Trip
  id, revision, status, caller_key, locale, created_at, expires_at
  constraints   # city, bounds, pace, budget, origin, must_include
  candidates    # places[], restaurants[]（可 slim）
  skeleton      # days[] stop-order
  cursor        # day_index, stop_index
  filled[]      # per-stop slot, legs, notes, card refs
  artifacts[]   # kind=visa|weather|tips|… payload
```

### 21.4 `trip_id` 生命周期

- **懒创建：** 任一需账本的业务工具在**无** `trip_id` 时创建（PG + 内存），响应返回 `trip_id`；宿主后续必须带上。
- **不**新增 `start_trip` / `create_trip`。
- 调用顺序可变（discover / visa / tips / make 谁先谁建）。

### 21.5 工具面（目标态）

| 工具 | 角色 |
| --- | --- |
| `discover_places` / `make_itinerary` / `visa_requirement` / `travel_tips` 等 | 可懒创建；写各自字段；返回 `trip_id` + `revision` + patch/最小块 |
| `plan_next_stop` | **保留**写侧；吸收原 `display_current_stop` 的写/slot 职责（F65） |
| `fetch_trip_details` | **新增**只读：`trip_id` + `fields[]` |
| `display_current_stop` | **删除**（F65）；读改 fetch |
| `patchSkeleton` | **仅** `src/core` 内部；由 fill 等路径调用；不注册 MCP/HTTP |

写响应形状（目标）：`{ trip_id, revision, patch?, next_tool_call?, …最小展示块 }`。  
读：`fetch_trip_details` 按 fields 切片（constraints / skeleton / day_n / filled / artifacts / …）。

### 21.6 宿主镜像

| 宿主 | 策略 |
| --- | --- |
| **任何 HTTP 客户端** | **硬性：** 写后读行程必须 `POST /v1/fetch_trip_details`（`trip_id` + `fields[]`，可选 `day_index`）。写信封不得当骨架/池/约束/filled/artifacts 真源。不设 `info_id`。 |
| where2play | **MVP-18：** 每步写工具返回后 `fetch_trip_details`；本地 hydrate 以 fetch 切片为准。写响应里的 patch 可作乐观更新，冲突以 fetch 为准。 |
| Cursor / ChatBox | 弱镜像（`trip_id` + 摘要）；细节 fetch。MCP 可看写信封，**不**豁免 HTTP。 |

### 21.7 与 §18 as-built 的关系

§18 描述 **MVP-10～15 现行链**（仍含 `display_current_stop` + 宿主回传 skeleton）。MVP-16 落地后：

1. 填充主路径改为 `trip_id` + cursor（candidates 不再每步回传）。
2. 链：`… → plan_next_stop → …`；展示用 `fetch_trip_details`。
3. §18.2 / §18.3 在 F65 Done 后修订为无 display；此前双写兼容旧 JSON 链（P0）。

### 21.8 分期

见 refactor-plan MVP-16：P0 = F63+F64+F66 评估；P1 = F65+精简落地；P2 = 内部 patch + artifacts；P3 = 清理/观测。

### 21.9 反模式

- 下发 `DATABASE_URL` 给 MCP 宿主
- 仅内存权威、无 PG
- 真双主无 revision
- 对外 `patch_skeleton` / 新增 `start_trip`
- 默认按日并发骨架冒充加速
- HTTP 客户端用写工具信封渲染行程事实（须 `fetch_trip_details`）

---

## 22. MVP-18 规划主干读模型 + artifacts（Feature 75–77）

**真源：** `[0.refactor-plan.md](./0.refactor-plan.md)` 批次 18。

### 22.1 写 / 读分工

| 步骤 | 写工具 | 写入字段 | 随后 fetch `fields` |
| --- | --- | --- | --- |
| 池 + 热门打标 | `discover_places`（MVP-19：池后热度；内部 iconic 不用于 2play 芯片） | `candidates`（`must_see` + 评分）、`constraints` 片段 | `candidates`（芯片 = `must_see`） |
| 骨架 | `make_itinerary` | `skeleton` | `skeleton` |
| 贴士四卡 | `travel_tips`（**make 之后**；优先传 `skeleton`） | `artifacts.tips` | `artifacts` |
| 填站 | `plan_next_stop` | `filled`, `cursor`；内部可 `patchSkeleton` | `filled`, `cursor` |
| 签证 | `visa_requirement` | `artifacts.visa` | `artifacts` |

懒创建：无 `trip_id` 的第一次写创建账本。2play 必须保存并回传 `trip_id` + `revision`。

### 22.2 时刻容错（Feature 77，ABC）

| 层 | 位置 | 行为 |
| --- | --- | --- |
| A | 2play intake 步骤 c | 解析 `7:00 am`、`7am`、`早上七点`、`七点半` 等 → `HH:MM`；失败 → `09:00` 并可用 i18n 提示已按默认理解 |
| B | BFF `normalizeAgentTime` | 与 A 同一套函数；发出 `time_from` / `end_time` 前必须已是 `HH:MM` |
| C | agent `planNextStopBody` preprocess | `9:00` → `09:00`；能解析的口语同样收；不能解析才 `invalid_input` |

### 22.3 artifacts：tips / visa（Feature 76）

**`travel_tips` dispatch：** `dualWriteTrip` patch `artifacts` 合并（不抹掉已有 visa）。写路径可调用 `findIconicPlaces`、open-meteo；tips-prose 若运行，其输出**只入库**，不是 2play 的读 API。载荷建议：

```ts
artifacts.tips = {
  iconic_places: string[];
  iconic_grounded?: boolean;
  intro?: string;
  transit?: string;
  clothing?: string;
  safety?: string;
  weather?: unknown;
}
```

散文 LLM 超时或失败：仍 **HTTP 200**，`iconic_places` 以 iconic 分支结果写入；intro 等可空。仅当 iconic 与工具整体都失败时 502。

**`visa_requirement` dispatch：** Orizn adapter 结构化结果写入 `artifacts.visa`（label/detail/outcome）。无国籍则降级写入「不可用」类结构化字段，不编造。不经 LLM 拼签证散文。

**HTTP 第三方（强制，含 2play）：** 贴士四卡、签证卡、骨架卡、芯片、约束条 **只读** `fetch_trip_details` 对应 `fields`。步骤 g 芯片 **只读** fetch 的 `candidates` 上 `must_see`。禁止：用写工具 HTTP 体填行程 UI；用 BFF OPENAI_CN 再写介绍/着装/安全。MCP 宿主可检查写信封，HTTP 调用方不可。

完整宿主顺序见 [§23](#23-宿主生成行程的调用契约2026-09-02)。

### 22.4 反模式

- 2play 用 `travel_tips` / `visa_requirement` / 本地 LLM 散文当行程 UI 真源（须 fetch）
- 2play 在助手步骤 g 用 ungrounded `travel_tips` 当必去芯片（须等 `discover_places` 打标后的池）
- 2play 用 `travel_tips` 响应体贴士散文且不写库
- 为通过质量关卡在 AC/测试中点名真实城镇（与 CATALOG 同类欺诈）
- `plan_next_day` 新工具；对外暴露 `patch_skeleton`

---

## 23. 宿主生成行程的调用契约（2026-09-02）

本节规定 **places-agent 工具怎么串**，以及 **可控宿主（2play）应怎样编排**。工具语义仍以 §18–§22、[ADR-045](../../workspace-specs/adr/ADR-045-iconic-places-unified-acquisition.md)、[ADR-046](../../workspace-specs/adr/ADR-046-trip-store-pg-memory-fetch.md) 为准。`findIconicPlaces` **不是** HTTP/MCP 工具。`patch_skeleton` **不是**对外工具。

### 23.1 对产品命题的评估

| 命题 | 结论 |
| --- | --- |
| 起飞栏填完点「规划行程」就应开始 `discover_places`，出 stops 池，并在内部找到必去地 | **采纳（2play）**。**MVP-19：** 先类目池再热度打 `must_see`（F79）；酒店未答则无 `origin`。用户 `must_include` 进 `constraints`，不覆盖热门标（F82）。 |
| 贴士四卡应在 `make_itinerary` 出骨架之后再写、再展示 | **采纳（2play UI）**。贴士需要骨架站名才能 grounded；与「步骤 g 芯片」拆开。ADR-045 仍允许无行程时单独调 `travel_tips`（MCP / 仅贴士），**不是** 2play Plan 主路径。 |
| intake 与 `discover_places` 并行；步骤 g 等 discover（含内部 iconic）完成后再展示芯片 | **采纳**。芯片 = 已打标、已补搜进池的 grounded 名。墙钟上 discover ≈ 12s，用户走完 b–f 通常已够；走得快则步骤 g 显示加载，**禁止**用无池 LLM 名单先填芯片。 |
| `make_itinerary` 必须带池、带必去标志 | **强制**。空 `candidates` 不得覆盖 Trip 已有池（见 dispatch）；宿主更不得在空池上调用 make。 |
| 循环 `plan_next_stop`（内部可 `patchSkeleton`）+ 每站 `fetch_trip_details` | **采纳读模型**。宿主 **不**调用 `patch_skeleton`。内部 patch 仅限餐时段/微调顺序（ADR-046 D9）；大改仍重跑 `make_itinerary`。 |

### 23.2 工具职责（所有宿主共用）

| 工具 | 宿主何时调 | 内部要点 | 写 Trip | 2play 随后 fetch |
| --- | --- | --- | --- | --- |
| `geocode` | 有酒店/区域名时（2play：助手 b 之后、make 之前） | 0 LLM | 否 | — |
| `discover_places` | 2play：点「规划行程」即发（与问答并行）。MCP：无 UI 则在 make 前必调 | 内部 `findIconicPlaces` + 类目池 + 补搜 + `must_see` | `candidates`、constraints 片段 | `candidates` |
| `make_itinerary` | 约束收齐且池非空 | LLM 骨架；读卡片 `must_see` | `skeleton`；**非空**才 patch `candidates` | `skeleton` |
| `travel_tips` | **2play：make + fetch 骨架之后**。MCP：可随时，与 fill 无关 | 有 skeleton → grounded iconic；tips-prose 只入库 | `artifacts.tips` | `artifacts` |
| `visa_requirement` | 有护照国籍 + 目的地国时，可与贴士同窗 | Orizn，无 LLM | `artifacts.visa` | `artifacts` |
| `plan_next_stop` | 沿骨架逐站直至 `trip_complete` | 无 LLM 填时刻与交通；写侧含 display | `filled`、`cursor` | `filled`、`cursor` |
| `fetch_trip_details` | 每次写后按需 | 只读 | — | 即本次读 |

`trip_id` 懒创建：第一次需要账本的写（通常是 `discover_places`）返回 `trip_id` + `revision`；后续一律带上。

### 23.3 推荐顺序（逻辑）

```text
[城市级] discover_places（池后热度 must_see）──┐
                                    ├── 步骤 g：fetch candidates（芯片=must_see；用户 3 处→must_include）
[可选] geocode(酒店)               ──┘
         ↓
make_itinerary(candidates 精简 + must_include + origin?)
         ↓
fetch skeleton → 主区/助手骨架预览
         ↓
travel_tips(skeleton 或 trip 上骨架) + 可选 visa → fetch artifacts → 贴士四卡
         ↓
loop: plan_next_stop → fetch filled/cursor → 上屏
         ↓
trip_complete
```

MCP / e2e 脚本无助手 UI：`geocode?` → `discover_places` → `make_itinerary` → `plan_next_stop`*；`travel_tips` 可选、不挡 fill。见 [`e2e-test.md`](./e2e-test.md)。

### 23.4 例子：where2play Plan

实现细节与图：[2play-design.md §4.10](../../3.where2play/2play-specs/2play-design.md)。要点：

1. 用户提交起飞栏（目的地、日期、天数、人数、预算）→ 打开助手（b–h）。
2. **同一时刻** BFF `POST /v1/discover_places`（`city`、`numDays`、`bounds`、`providers`、`locale`；尚无酒店则无 `origin`）。保存 `trip_id`/`revision`。
3. 问答 b–f 与 discover **并行**。助手 b 非空酒店：BFF **`search_places`（address=目的地）** 确认起点，禁止无城市酒店 `geocode`（ADR-048）。**不重跑** discover。
4. 步骤 g：若 discover/fetch 未完成 → 加载文案、无芯片。完成后芯片 = fetch `candidates.places` 中 `must_see===true` 的 `name`（去重、上限与 `iconicLimitForTripDays` 一致）。用户多选或默认「使用推荐必去点」。
5. 步骤 h 结束 → `make_itinerary`：HTTP body 带 **discover 的精简池**（含 `must_see`、坐标、热度字段），`must_include` = 用户所选（空则用 grounded 推断列表）。禁止空池。
6. `fetch_trip_details` `skeleton`：助手预览 + 主列表；**仅当 store 站数 ≥ 写包络站数** 才用 store 覆盖。
7. `travel_tips`（传 skeleton 或等价池）→ fetch `artifacts` → **此时**才展示贴士板块。
8. `plan_next_stop` 循环；每站 fetch `filled`/`cursor` 再画 slot。

### 23.5 宿主反模式

- 空 `candidates` 调用 `make_itinerary`（会得到仅住宿骨架，并曾把 Trip 池写成空）。
- 用 fetch 的贫骨架覆盖更完整的 make 包络。
- 把 `findIconicPlaces` 当成可调工具；把 `patch_skeleton` 当成 HTTP/MCP。
- 步骤 g 用无池 `travel_tips` 芯片；贴士四卡在骨架之前展示成「已规划」。
- 用 `discover.inferred_must_see` 或 `make_itinerary` **HTTP 包络直接渲染**且不 fetch（任何 HTTP 客户端）；MCP 可读包络。
- 用用户 `must_include` 重写池上 `must_see`（把 8 处热门收成 3 处）。
- make 502 后不 `fetch(skeleton)` 就当「无骨架」；旁路写成功却指望 agent 推送给已断流的 UI。

---

## 24. MVP-19 — 超时可恢复、热度打标正交、骨架硬闸（ToDo）

**真源：** `[0.refactor-plan.md](./0.refactor-plan.md)` 批次 19 · [`e2e-test-results/reproduce.md`](./e2e-test-results/reproduce.md) · Feature **78–82**。2play 编排与助手文案：[2play-design.md §4.10–§4.11](../../3.where2play/2play-specs/2play-design.md)。

### 24.1 复现结论（合同）

- 池不空（例：40/37）。第一次 make ~160s **502**；第二次 ~13s **3 日多站**。
- 「每天只有酒店」主因是 **make 超时断流** + 行程板只画已 fill 的 stay，不是空池。
- Agent **无 Trip watch**。当次调用方有信封；已断的 `/api/plan` 不会被通知。

### 24.2 Feature 78 — make 墙钟

- LLM / 工具超时 **必须短于** 反向代理与 2play `maxDuration`。
- 失败不得写入「成功且仅 stay」的骨架。
- 宿主：make 非 200 时对同一 `trip_id` **fetch skeleton**；有合法多站骨架则续 fill，否则错误态。

### 24.3 Feature 79 — 池后热度打标

见 §20.4 新顺序。slim **必须**保留 `user_ratings_total` / `rating`。芯片 = fetch `must_see` 按热度序。无城市表。

### 24.4 Feature 80 — 骨架校验

- `must_include` 只对 **stop.name**（可 `stripAreaSuffix`），**不含** `day_theme`。
- 池 attraction 数 ≥ `min(3, places.length)` 时：每天至少 1 个 `kind !== stay`。
- 骨架站名用池内官方名；中文必去用 coverage 对齐。

### 24.5 Feature 81 — 观察者只有 fetch

**不新增** SSE、Redis pub/sub、Trip watch 或任何服务端推送。写工具只回当次调用方；断流后宿主须 **主动** `fetch_trip_details` 续读账本。

合同：同一编排流内写 → fetch → 下一步。2play `PlanSessionCache` 必须持久化 `trip_id` + `revision`（`criteriaJson.tripId` / `criteriaJson.revision`）；`GET /api/plan/current` 在有 `trip_id` 时再 fetch skeleton/filled 恢复 UI。

### 24.6 Feature 82 — iconic ≠ 用户必去

| 存放 | 字段 | 谁写 | 谁读 |
| --- | --- | --- | --- |
| 池 | `candidates.places[].must_see` | 仅 discover 热度 | 步骤 g 芯片、贴士可对齐 |
| 意图 | `constraints.must_include` | make / intake 后 patch | make 硬约束、约束条 |
| 池（可选） | `user_requested` | 补搜/对齐用户名 | 排程提示 |

**禁止**将 8 处 `must_see` 改写成用户 3 处。不新建 POI 实体。

### 24.7 与 2play 同流（摘要）

```text
CTA → discover（热度 must_see）∥ intake
  → g：等 fetch candidates（芯片=must_see；用户 3 处另存 mustInclude）
  → 助手：「现在我了解您的要求了…」→ make → fetch skeleton
  → 助手用 fetch 骨架打文字（每日多站可见）
  → 「大致行程已经安排完毕…」
  → loop plan_next_stop → fetch → 助手一行（含 transit）+ 主区 slot
  → 「[目的地][天数][人数][类型]行程已规划完毕…」
```

`filled` 仍为当前一站覆盖。主区累加 NDJSON/`itinerary`；fetch 用于 revision 与诚实读。

### 24.8 Feature 84 — eligible attraction + 内部 `patchTrip`

**谓词** `isEligibleAttraction`（`src/core/eligible-attraction.ts`）：有限 lat/lng；名称非合称模板（十景/名胜区/风景区/旅游区等，**非**城表）；非餐馆信号；若 `sources.length>0` 则至少一个 `native_id`。Slim 入库卡无 sources 时不因缺 id 淘汰。discover / iconic / make 入模共用。零 `get_place_details`。

**Discover：** `filterAttractionPlaces` 之后再 `filterEligibleAttractions`。Phase C / F57 对合称 token **跳过**。

**Make：** `enrichMakeItineraryInput` 滤池；`degradeMustInclude` 后校验。餐站不要求店名在餐厅池。`dropUnknownAttractionStops` 丢掉 LLM 发明的池外景点（如「白堤」），不整单 502。写 Trip 候选用 `commitPatch(..., candidatesWrite: "replace")`，避免 merge 把脏卡合回来。

**内部 `patchTrip`：** `commitPatch` 别名；默认可 merge（F82 保热度）；`replace` 整表替换 `places`/`restaurants`。HTTP `patch_trip` **保持只改 constraints**（既有 2play），不升为修池 API。

