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
| 简单的 Quanzil 工具循环 | Kubeflow、特征存储、按供应商分立的 LLM 智能体 |
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
 └─ NL chat → Quanzil loop ─┤
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

**失败处理：** 跳过 + 原因 key，**不允许静默替换**。Google 直连失败 → Worker MCP，来源标注 `GOOGLE_MAPS`。Tripadvisor 失败 → 省略富化数据。天气失败 → 降级行程，不清空行程。搜索为空 → 空列表 + key。Quanzil 失败 → 返回错误，绝不返回空成功响应。幂等工具：**重试一次**后跳过；模型可基于**部分**结果作答。

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

**语言感知查询生成**（MVP-4）：
- 查询语言由 `languageContext.searchLanguage`（来自 language-router 模块）决定
- 搜索关键词从 `src/i18n/search-keywords.ts` 加载 — 查询字符串中无硬编码的中文/英文
- 移除按城市硬编码的查询；替换为通用模板：`"{city} {localized_keyword}"`
- 餐饮场景匹配：早餐 → 早午餐关键词；晚餐 → 精致餐厅关键词；咖啡馆 → 茶馆关键词 — 均按 locale 区分

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

### 5.2 语言路由与查询组装（MVP-4）

三个协同模块 — provider 选择、语言检测、query 组装 — 共同决定每次搜索如何执行。均为规则引擎，不调 LLM。

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

1. 显式 `locale` 参数 → 直接使用
2. 输入中 CJK 字符占比 >30% → `zh`
3. 回退 → `en`

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

### 5.3 提示组装

> **实现与契约见 §9.1（MVP-6）。** 本节不再单独维护「MVP-7」草稿。

Chat / tool 的 system prompt 由 [`prompt-assembler.ts`](../src/agent/prompt-assembler.ts) 按 `locale` + `intent` 拼接；语言上下文仍来自 §5.2.1，关键词映射见 §5.2.3。

---

## 6. 适配器与地点卡片

| 适配器 | Id | 说明 |
| --- | --- | --- |
| AMAP Web 服务 | `AMAP` | `PLACES_VENDOR_MODE=live` 时使用实时模式：[`config.ts`](../src/adapters/amap/config.ts)、[`direct.ts`](../src/adapters/amap/direct.ts)、[`card-mapper.ts`](../src/adapters/amap/card-mapper.ts)（将 `opentime_today` / `opentime_week` 映射至 `PlaceCard.hours`）、[`keywords.ts`](../src/adapters/amap/keywords.ts)、[`directions.ts`](../src/adapters/amap/directions.ts)（`/v3/direction/walking|driving|transit/integrated`）、[`live.ts`](../src/adapters/amap/live.ts)。`lng,lat`；GCJ-02；通过 `/v3/assistant/coordinate/convert`（`coordsys=gps`）转换 WGS `near` 坐标；餐饮 `types=050000`；有 `address` 无 `near` → 先地理编码再以 `/v5/place/around` 半径 1000 搜索。非实时模式时使用 Fixture：[`fixture.ts`](../src/adapters/amap/fixture.ts)。**无** `weatherInfo`。无 Worker 回退。 |
| Google direct REST | `GOOGLE_MAPS` | Places New / Geocoding / Routes；WGS-84；`languageCode` 来自 locale 映射表。模块：[`src/adapters/google/direct.ts`](../src/adapters/google/direct.ts) |
| Google Worker MCP | 同 `GOOGLE_MAPS` | 直连出站失败后使用。`GMAPS_MCP_*`。首先调用 `tools/list`。模块：[`src/adapters/google/mcp-client.ts`](../src/adapters/google/mcp-client.ts)。组合模块：[`src/adapters/google/live.ts`](../src/adapters/google/live.ts)。**开发测试：** `GOOGLE_DIRECT_FORCE_FAIL=1`（生产环境拒绝使用）。 |
| Tripadvisor Terra | `TRIPADVISOR` | **仅用于富化**（ADR-007，ADR-020）：评分、评论、**照片回退**（MVP-3）。`PLACES_VENDOR_MODE=live` 时使用实时模式：[`config.ts`](../src/adapters/tripadvisor/config.ts)、[`direct.ts`](../src/adapters/tripadvisor/direct.ts)、[`match.ts`](../src/adapters/tripadvisor/match.ts)、[`card-mapper.ts`](../src/adapters/tripadvisor/card-mapper.ts)、[`live.ts`](../src/adapters/tripadvisor/live.ts)。`GET /locations/nearby` 携带 `lat`+`lon`+`radius=1`+`unit=KM`；请求头 `X-API-Key`；附近搜索 URL 中不传 `location_id` 或 Google/AMAP 原生 id。**照片：** `GET /locations/{id}/photos` — 仅在 Google Photos 不可用或需付费时调用；`location_id` 来自附近搜索步骤。非实时模式时使用 Fixture：[`fixture.ts`](../src/adapters/tripadvisor/fixture.ts)。 |
| Open-Meteo | `OPEN_METEO` | **不**出现在 `providers[]` 中。`PLACES_VENDOR_MODE=live` 时使用实时模式：[`config.ts`](../src/adapters/open-meteo/config.ts)、[`direct.ts`](../src/adapters/open-meteo/direct.ts)、[`live.ts`](../src/adapters/open-meteo/live.ts)。`GET /forecast` 携带 `latitude`+`longitude`+`daily=weather_code,temperature_2m_max,temperature_2m_min`+`timezone=auto`；客户主机上可选 `apikey`。非实时模式时使用 Fixture：[`fixture.ts`](../src/adapters/open-meteo/fixture.ts)。保留 `weather_code` + 数值；本地化 `weather.wmo.{code}`。 |

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

## 9. 智能体 LLM（Quanzil）

- 使用 `openai` SDK，`baseURL` = `OPENAI_BASE_URL`，而非 `api.openai.com`。
- `max_completion_tokens`。模型：`OPENAI_CHAT_MODEL`。
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

**MCP 工具拆分：** 将行程规划拆为可逐步返回的工具；`plan_itinerary` 仍为一站式 HTTP/MCP 入口。

| 工具 | 职责 | MCP | HTTP |
|------|------|-----|------|
| `discover_places` | 搜景点+餐厅+天气，返回候选列表 | ✅ | ✅ `/v1/discover_places` |
| `arrange_day` | 从候选中为第 N 天安排路线 | ✅ | ✅ `/v1/arrange_day` |
| `plan_itinerary` | 一次返回完整行程（内部可走 LLM 或 legacy） | ✅ | ✅ `/v1/plan_itinerary` |

**MCP / HTTP 分步流程：** `discover_places` → `arrange_day(day=1)` → `arrange_day(day=2)` → …  
**一站式：** `plan_itinerary`（内部搜索 + LLM/legacy）

**Token 优化：**

| 参数 | 旧值 | 新值 | 效果 |
|------|------|------|------|
| 候选数 | 15/type | **8/type** | user message -50% |
| max_completion_tokens | 4096 | **2048** | 输出生成 -50% |
| 候选描述 | name+type+rating+lat/lng+hours+price | **name+type+rating+lat/lng** | -30% |
| LLM 超时 | 无限制 | **45s** + fallback | 用户最多等 ~50s |

**行程配图：** Phase 4 格式化时，用 block.name 匹配候选的 `photos` 字段（来自 MVP-3b），挂回每个 block。封面图 = Day 1 第一个 attraction 的第一张 photo。零额外 API 调用。

**架构流程（单 LLM + 自查 + Zod）：**

```
discover_places(city, bounds):
  searchPlaces(city) → top 8 候选景点
  searchRestaurants(city) → top 8 候选餐厅
  getWeather(dates) → 天气
  → { candidates, weather }

arrange_day(candidates, day_index, origin, destination, pace, budget, locale):
  LLM 规划 + 自查（一次调用，max_tokens=2048）
  Zod 校验 → 失败重试一次 → 仍失败 → fallback 旧代码
  匹配候选 photos → 挂回 blocks
  → { day: { blocks, from_origin?, to_destination? } }

plan_itinerary(input):
  discover = await discover_places(...)
  days = []
  for each day:
    day = await arrange_day(discover.candidates, day_index, ...)
    days.push(day)
  → { days }
```

**新旧切换：**

| | 设计意图 | **当前实现**（`src/core/itinerary.ts`） |
|--|----------|----------------------------------------|
| 环境变量 | `ITINERARY_MODE=llm` \| `legacy` | 同名 |
| 默认值 | **`llm`** | **`llm`**（`process.env.ITINERARY_MODE ?? "llm"`） |
| 生产启用 LLM | 默认即 LLM | 旧路径测试须显式 `ITINERARY_MODE=legacy` |

旧代码路径保留不删。

**搜索范围：** 有城市名 → 5km 半径；无城市名 → `errors.location_too_broad`。

**出发地/返回地交通：** 有 origin → 含 `from_origin` / `to_destination`；无 → 不含，第一个 block start_time ≥ 10:00。

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
| `CallerApiKey` | `id`、`name`、`description`、`keyHash` 唯一、`prefix`、`status` `ACTIVE`\|`REVOKED`、`lastUsedAt` |
| Session | **封装 Cookie**，非数据表。后续可选：用户上的 `sessionVersion` 字段用于全部吊销 |

种子数据：用户名 `admin`，邮箱 `me@ethanhuang.com`。**不**将密码内置到镜像中。空哈希 → `/set-password` 或 Resend 重置。

密码：使用 `node:crypto` scrypt 算法。调用方密钥：`pa_` + 32 字节随机数；存储 SHA-256 哈希；明文仅在创建/重新生成时返回**一次**。

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

**一次性密钥：** 非 URL。`POST` 创建/重新生成在变更载荷中返回 `secret` → `SecretOncePanel`。卸载时清除。`GET` 不返回明文。不使用 `localStorage`。

**国际化：** 自定义目录 `messages/{EN,CN,HK,TW}.json` + `t(locale, key, vars)`。**不添加 `next-intl`。** 缺失 key → `EN` → 原始 key。从 `ui-mockup/assets/i18n.js` 初始化（去掉画廊 key）。HK 与 TW 必须有所区别。邮件复用相同文件（`admin.reset.mail_body`、`admin.users.invite_mail_body`，含 `{url}`）。邀请/重置 `{url}` 为绝对路径：依次使用 `PUBLIC_BASE_URL`、`APP_URL`，本地回退 `http://localhost:${PORT}`，生产环境为 `https://places.agent-mate.ai`。`POST /api/admin/locale` 后调用 `router.refresh()`。`html lang`：`en` / `zh-CN` / `zh-HK` / `zh-TW`。

**数据：** React Query → 同源 `/api/admin/*`，携带 `credentials: "include"`。不需要 Zustand。表单使用 RHF + Zod（包括 `/accept-invite` 向 `/api/admin/accept-invite` 的 POST）。

| 界面操作 | 接口 |
| --- | --- |
| 页头问候语 | `GET /api/admin/session` → `{ name, email, mustSetPassword }` |
| 密钥列表 | `GET /api/admin/api-keys`（前缀，不含密钥） |
| 签发/重新生成 | `POST` / `POST …/regenerate` **一次性**返回 `secret` |
| 编辑 | 仅 `PATCH` name/description |
| 删除单个 | `DELETE /api/admin/api-keys/[id]` |
| 批量删除 | `DELETE /api/admin/api-keys`，请求体 `{ ids }`（最多 100 个） |
| 用户/邀请 | `GET /api/admin/users`、`POST /api/admin/users/invite` |
| 登录/登出/语言/密码 | 对应 `POST` 接口 |

错误格式：`{ error: { key } }`。在全部四种语言目录中新增以下 key：`admin.common.loading`、`admin.common.retry`、`admin.keys.loading`、`admin.keys.error`、`admin.users.loading`、`admin.users.error`、`admin.users.invite_sent`、`errors.session_expired`、`errors.invite_failed`、`errors.csrf`。保留原型 key（`admin.keys.empty`、`errors.login_failed`、`errors.password_required`、`admin.reset.sent`、`admin.register.disabled_prefix`、`admin.register.contact_admin`、`admin.register.disabled_suffix`、`admin.register.wechat_qr_alt`、`admin.register.wechat_qr_caption`……）。加载时不得清空页面框架。登录注册关闭提示板使用上述 key，协议为 `api-key`；资源文件 `public/EthanWeChat.png`（与 kb.agent-mate.ai 使用同一文件）。

**选择器（`data-testid`）：** `admin-home-instructions`、`admin-login`、`register-disabled`、`contact-admin`、`contact-admin-qr`、`login-submit`、`login-error`、`accept-invite-submit`、`accept-invite-done`、`accept-invite-sign-in`、`accept-invite-error`、`landing-instructions`、`admin-hello`、`nav-keys`、`nav-users`、`nav-sign-out`、`issue-key`、`keys-table`、`keys-empty`、`copy-secret`、`users-table`、`delete-admin-confirm`、`locale-EN` … `locale-TW`、`guide-capabilities`、`guide-toc-capabilities`、`guide-capabilities-table`。按行删除：`delete-admin-{id}`。

**不得**出现在客户端包中：地图密钥、`OPENAI_*`、`GMAPS_MCP_*`、`RESEND_*`、`SESSION_SECRET`、`OPEN_METEO_API_KEY`、变更后的调用方密钥明文。路由处理器：`import "server-only"`。不使用 `NEXT_PUBLIC_` 暴露密钥。

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
- 界面中不提及地图供应商密钥、Portainer 或 Quanzil。
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
