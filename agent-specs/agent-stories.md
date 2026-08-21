# places-agent — 用户故事

**places-agent** (`places.agent-mate.ai`) 的高层级产品待办列表。

调用方通过机器 id **`places-agent`**（MCP `serverInfo.name`，HTTP JSON `agent`）来标识此服务。该字符串不进行本地化。主机名为 `places.agent-mate.ai`。

- **agent** — 地点网关和工具（HTTP + MCP）。**不**拥有面向消费者的 Web UX（what2eat / where2play 屏幕保留在各自应用中）。
- **app** — 同一主机上的运营管理 Web 应用：公开首页、登录、登录后落地页（左侧导航 + 头部）、管理员、调用方 API 密钥、智能体指令、i18n。

| 相关文档 | 位置 |
| --- | --- |
| 家族目标（简述） | [`../../workspace-specs/1.req-specs.md`](../../workspace-specs/1.req-specs.md) |
| 架构与信任 | [`../../workspace-specs/2.architecture.md`](../../workspace-specs/2.architecture.md) |
| 供应商能力矩阵 | [`../../workspace-specs/knowledge/maps/places-capabilities.md`](../../workspace-specs/knowledge/maps/places-capabilities.md) |
| 管理 UI | [`agent-design.md`](./agent-design.md) §12 |
| 管理 UI 原型 | [`ui-mockup/`](./ui-mockup/) |
| 测试策略 | [`agent-test-plan.md`](./agent-test-plan.md) |
| 用户测试用例（ChatBox MCP） | [`agent-test-plan.md`](./agent-test-plan.md) §13–§19 |
| 技术设计 | [`agent-design.md`](./agent-design.md) |

**状态：** MVP-1 / **MVP-2** 已验收（2026-08-19）。**MVP-3a～MVP-7** 代码与收尾已落地（见 [`0.refactor-plan.md`](./0.refactor-plan.md)）；本文件 Feature **24–31** 对应 AC。

### Given-When-Then 约定

每个场景描述一种行为。每个功能标记为 **agent**（网关/工具）或 **app**（管理 Web 应用）。用户可见文案使用 **i18n 键**（`EN` 默认；`CN`、`HK`、`TW`）。测试断言键（及插值数据），而非单一语言的句子。协议 id 不进行本地化。

如何自动化这些场景：[`agent-test-plan.md`](./agent-test-plan.md)。

**AC 状态：** MVP-2 **已验收** 2026-08-19（运营商确认可用）。供应商诚实性（[ADR-021](../../workspace-specs/adr/ADR-021-live-vendor-no-fixture.md)，[`agent-test-plan.md`](./agent-test-plan.md) §1.1）：AMAP 搜索 **live-honest**；Google 搜索 **live-honest**；功能 8 Tripadvisor 丰富化 **live-honest**；功能 9 行程天气 **live-honest**。功能 9 **已计时**：中文组合查询（US11 AC7）；走廊图钉搜索（US11 AC2）——live T05 G01 第 3 天比第 1 天更靠近目的地；仅 AMAP 的 D01 返回了带有 `source: directions` 的访问记录。功能 2 和 10：HTTP + fixture CI；聊天仅 HTTP（[ADR-020](../../workspace-specs/adr/ADR-020-http-only-chat-and-enrich.md)）。ChatBox TC-C 已推迟（[ADR-019](../../workspace-specs/adr/ADR-019-http-first-user-test-automation.md)）。质量门控：[ADR-024](../../workspace-specs/adr/ADR-024-quality-gates-typescript-7.md)。不得将 AC 状态写为 **implemented** 来替代 `live-honest` / `fail-closed` / `fixture-only`。

**默认前提条件：** 除非场景另有说明：调用方提供有效的调用方 API 密钥；请求的地图供应商已配置。

## 角色

| 角色 | 身份 | 价值 |
| --- | --- | --- |
| 餐厅应用调用方 | what2eat BFF | 无需自行维护地图供应商即可搜索餐厅和详情 |
| 行程应用调用方 | where2play BFF | 地点搜索、详情、导航、行程引擎 |
| 智能体主机 | MCP 主机（如 chatboxai.app） | 通过 MCP 使用相同工具；自然语言地点聊天 |
| 旅行者 | 上述调用方的终端用户 | 查找地点、打开地图、跟随行程计划 |
| 运营商 | 部署 places-agent 的人 | 凭据、地图供应商可用性、无目的地强制供应商选择 |
| 管理员 | places.agent-mate.ai 管理应用的运营商 | 登录、邀请管理员、签发和撤销调用方 API 密钥 |

## 术语（避免混用）

| 术语 | 含义 | 不是这个 |
| --- | --- | --- |
| **地图供应商** | AMAP、Google Maps、Tripadvisor——智能体所查询的对象。请求字段保持 `providers[]`。 | HTTP vs MCP；驾车/公交路线 |
| **地点卡来源** | 结果上的 `sources[]`：卡片来自哪个供应商，包含 logo、深度链接；可选合并重复项 | 要调用哪些供应商（即地图供应商选择） |
| **访问渠道** | 调用方访问智能体的方式：HTTP API 或 MCP | 将旅行者带到某个地点 |
| **路线导航** | 路线、预计到达时间或前往某地点的地图应用深度链接（功能 4） | HTTP vs MCP |
| **调用方 API 密钥** | 在管理应用中签发的密钥；调用方发送此密钥以使用 HTTP/MCP 工具 | 地图供应商密钥（AMAP / Google / Tripadvisor），此类密钥不会出现在本 UI 中 |
| **智能体 id** | 机器 id **`places-agent`**。调用方在 MCP `serverInfo.name` 和 HTTP 字段 `agent` 中可见。 | 主机名 `places.agent-mate.ai`；ChatBox 显示标题；工具名称前缀 |
| **类别 `agent`** | 网关 / 工具核心故事 | 管理 Web 应用 |
| **类别 `app`** | places.agent-mate.ai 上的管理 Web 应用 | what2eat / where2play 产品屏幕 |
| **输出语言环境** | 产品 id `CN`、`HK`、`TW`、`EN`（参见 i18n 表）。由调用方或管理员选择。 | 地图供应商选择；搜索目的地 |

## i18n（全产品）

所有**调用方可见**和**管理应用**字符串（标签、按钮、空状态、错误、邮件、通知、聊天回复、供展示的行程文案）均为 **i18n 键**，而非某一语言的文案。

支持的输出语言环境（四种，非两种）：

| 产品 id | BCP 47 | 语言 |
| --- | --- | --- |
| `EN` | `en` | 英语（默认） |
| `CN` | `zh-CN` | 简体中文（大陆用语） |
| `HK` | `zh-HK` | 繁体中文，香港方言 |
| `TW` | `zh-TW` | 繁体中文，台湾方言 |

`HK` 和 `TW` 均使用繁体字，但**用语不同**。不得将它们视为 `CN` 的繁简转换。

- 默认语言环境：`EN`
- 对语言环境敏感的值（日期、时间、数字、距离、货币/价格信号）使用所请求语言环境的本地化格式
- 缺少翻译 → 回退到 `EN`，再回退到键本身；绝不因目录条目缺失而使请求失败
- 协议 id（`places-agent`、`AMAP`、`GOOGLE_MAPS`、`TRIPADVISOR`、`OPEN_METEO`、`CN` / `HK` / `TW` / `EN`、偏好 id）、默认管理员用户名 `admin`、默认管理员邮箱 `me@ethanhuang.com` 以及运营商日志不进行本地化
- Open-Meteo 天气**标签**进行本地化：`weather_code` → 所请求语言环境中的键 `weather.wmo.{code}`。不得在 `CN` / `HK` / `TW` 中显示英语 Open-Meteo 文档字符串（ADR-014）
- 管理应用目录：功能 19。智能体工具/聊天/行程输出：功能 13。

## 非目标（本待办列表）

- what2eat / where2play 屏幕、品牌，或产品 Quanzil
- 硬规则"搜索目的地在中国大陆 ⇒ 仅 AMAP"
- 按搜索目的地切换 LLM
- 部署拓扑、Portainer stacks、umbrella git 布局
- 管理用户的公开自注册（注册已禁用；仅限邀请）
- 在管理应用中编辑或展示地图供应商密钥（AMAP / Google / Tripadvisor）

---

## MVP 计划（两个切片，按智能体能力划分）

切片遵循**智能体能力**，而非"管理 vs 网关 vs 智能"。每个 **app** 功能（14–19）均属于 **MVP-1**。14–19 中任何一项未完成，不得启动 MVP-2。

**能力**（工具 + 聊天循环）。共用基础设施列在首个需要它的能力下。

| 能力 | 调用方获得的内容 | 功能 | 切片 |
| --- | --- | --- | --- |
| **运营** | 登录、邀请、签发密钥、语言环境配置、指令页面 | **14, 15, 16, 17, 18, 19**（所有管理 UI） | **MVP-1** |
| **调用** | HTTP + MCP 作为 `places-agent`；调用方密钥认证 | **11, 12** | **MVP-1** |
| **搜索餐厅** | 带卡片、来源、地理编码、深度链接、语言环境的餐厅发现 | **1, 3, 4, 5, 6, 7, 13** | **MVP-1** |
| **搜索地点** | 非餐厅 POI 发现（相同卡片/供应商合约） | **2** | **MVP-2** |
| **规划行程** | 多站点计划 + Open-Meteo 天气标签 | **9** | **MVP-2** |
| **Tripadvisor 丰富化** | 按名称+位置可选评分/内容 | **8** | **MVP-2** |
| **地点聊天** | 在已发布工具上通过 Quanzil 进行自然语言工具循环 | **10** | **MVP-2** |

| 切片 | 结果 | 功能 |
| --- | --- | --- |
| **MVP-1 — 运营、调用、搜索餐厅** | 管理 UI 完整。密钥在 HTTP 和 MCP 上均可用。what2eat 可以搜索餐厅、打开详情并获取地图链接。无 Quanzil 循环。 | **14–19** · **11, 12** · **1, 3, 4, 5, 6, 7, 13** |
| **MVP-2 — 地点、行程、丰富化、聊天** | where2play 可搜索 POI 并请求结构化行程（功能 13 中的天气键）。卡片上的 Tripadvisor 匹配。ChatBox 自然语言聊天复用工具核心。 | **2, 9, 8, 10** |
| **MVP-3a — 稳定与自动供应商** | 服务器稳定 + 目的地/语言驱动的 provider 自动选择 | **20, 21** |
| **MVP-3b — 卡片富化** | 搜索结果 Photos + Price Level | **24** |
| **MVP-3c — Resolver / Directions** | Geocode-first provider + Directions Worker fallback | **25** |
| **MVP-4a — 语言与关键词** | Language router + 多语言搜索关键词 | **26** |
| **MVP-4b — 性能** | Geocode/search 缓存 + itinerary 并行（目标 <15s） | **27** |
| **MVP-5 — Admin 加固** | API 错误映射、Error Boundary、reset 4h、session iat；邀请 E2E 已有，密码重置 E2E 待补 | **28** |
| **MVP-6 — Prompt + LLM 行程** | Prompt assembler、LLM itinerary+Zod、MCP `discover_places`/`arrange_day` | **29, 30, 31** |
| **MVP-7 — 收尾** | HTTP discover/arrange、password-reset E2E、`make quality`（Branches≥80%）、Guide + release-bot 部署清单 | — |

**MVP-1 说明**

- 所有管理屏幕均在此处落地：首页、登录/用户、落地页、调用方密钥、指令、管理员 i18n。
- 健康检查 `/v1/health`（及别名）是功能 11 的一部分。此切片中的功能 11 意味着两种传输方式、initialize/identity、密钥认证错误，**以及** `search_restaurants` 的 HTTP/MCP 对等性（以及此切片中的支持工具）。如果 `/mcp` 缺失，则不得声明功能 11 已完成。
- 此切片中的功能 13 包括餐厅/卡片/工具错误和语言环境输出。`weather.wmo.*` 等待功能 9（MVP-2）。
- 一个适配器路径即可开始（如 `GOOGLE_MAPS`）；功能 6 仍需要 `providers[]` 验证和不静默换供应商。
- 自然语言聊天不得作为搜索的唯一方式。

**MVP-2 说明**

- 切片**已验收** 2026-08-19（运营商确认可用）。质量：[ADR-024](../../workspace-specs/adr/ADR-024-quality-gates-typescript-7.md)。ChatBox TC-C 仍推迟（[ADR-019](../../workspace-specs/adr/ADR-019-http-first-user-test-automation.md)）。

- `search_places` 复用 MVP-1 供应商、来源、详情、地理编码、导航和语言环境目录。不得发明第二种卡片形状。
- `plan_itinerary` 调用相同的工具核心。Open-Meteo 是行程内部的帮助器，而非 `providers[]` 供应商。
- Tripadvisor 丰富化在搜索/详情上可选；切勿将 Google `place_id` 作为 Tripadvisor id 传递。
- 自然语言聊天是在 MVP-1 和本切片工具上的 Quanzil 循环。不得发明第二个工具核心。

**切片内构建顺序：** 每次将一个用户故事推至 DoD（[`agent-design.md`](./agent-design.md) §16）。建议 MVP-1：**14 → 15 → 16 → 19 → 18 → 17 → 12 → 11 → 6 → 5 → 1 → 3 → 7 → 4 → 13**。MVP-2：**2 → 9 → 8 → 10**。MVP-3a：**20 → 21**。MVP-3b→6：**24 → 25 → 26 → 27 → 28 → 29 → 30 → 31**。

---

# 第一部分 — 产品待办列表

| # | 类别 | 功能名称 | 功能代码 | 描述 | 验收标准 | MVP |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | agent | 餐厅搜索 | `places-agent-search-restaurants` | 通过调用方请求的供应商按位置和条件搜索餐厅 | 见下文 | **1** |
| 2 | agent | 地点搜索 | `places-agent-search-places` | 以相同方式搜索非餐厅地点（景点、POI） | 见下文 | **2** |
| 3 | agent | 地点详情 | `places-agent-place-details` | 使用供应商原生地点 id 获取已知地点的详情 | 见下文 | **1** |
| 4 | agent | 导航助手 | `places-agent-navigate` | 为地点返回不含密钥的导航深度链接和 URL | 见下文 | **1** |
| 5 | agent | 地理编码 | `places-agent-geocode` | 按需对地址进行地理编码和反向地理编码，使搜索可从地址或图钉运行 | 见下文 | **1** |
| 6 | agent | 地图供应商选择 | `places-agent-map-vendors` | 调用方传递要查询的**地图供应商**（`providers[]`）；智能体验证凭据和能力；不静默换供应商。`GOOGLE_MAPS` 先使用直连 REST，再使用 Cloudflare Worker MCP（ADR-017） | 见下文 | **1** |
| 7 | agent | 地点卡来源 | `places-agent-card-sources` | 每张地点卡列出 `sources[]`；可选合并重复项；**应用**选择打开哪个地图深度链接 | 见下文 | **1** |
| 8 | agent | Tripadvisor 丰富化 | `places-agent-tripadvisor-enrich` | 按名称+位置匹配可选的 Tripadvisor 评分/内容；切勿将 Google `place_id` 作为 id 传递 | 见下文 | **2** |
| 9 | agent | 行程规划 | `places-agent-plan-itinerary` | 根据行程边界、地点结果和旅行者偏好（包括自然语言）生成结构化行程建议；行程 UX 保留在调用方 | 见下文 | **2** |
| 10 | agent | 自然语言地点聊天 | `places-agent-nl-chat` | 旅行者以自然语言提问（可选文件/图片上传）；智能体在服务器 Quanzil 上运行工具循环 | 见下文 | **2** |
| 11 | agent | HTTP API 和 MCP | `places-agent-http-mcp` | 通过 HTTP API（应用 BFF）和 MCP（智能体主机）提供相同工具；两种渠道均将服务标识为 `places-agent` | 见下文 | **1** |
| 12 | agent | 调用方 API 密钥认证 | `places-agent-caller-trust` | 仅向通过**调用方 API 密钥**认证的调用方提供 HTTP/MCP 服务；地图供应商密钥保留在智能体上；用户可见错误使用 i18n 键 | 见下文 | **1** |
| 13 | agent | 双语输出 | `places-agent-bilingual-output` | 智能体用户可见输出支持 `EN` / `CN` / `HK` / `TW`；单语言环境或双语对。Open-Meteo `weather.wmo.*` 键随功能 9 一起提供 | 见下文 | **1** |
| 14 | app | 管理员首页 | `places-agent-admin-home` | 公开首页：指向智能体指令（功能 18）的链接和管理员登录控件 | 见下文 | **1** |
| 15 | app | 管理员登录和用户 | `places-agent-admin-users` | 管理员登录、默认管理员、通过 Resend 重置密码和邀请；公开注册已禁用 | 见下文 | **1** |
| 16 | app | 管理员落地页 | `places-agent-admin-landing` | 登录后：左侧导航；头部含智能体指令链接和已登录用户名问候语 | 见下文 | **1** |
| 17 | app | 调用方 API 密钥 | `places-agent-admin-api-keys` | 创建、编辑、重新生成、删除调用方 API 密钥；复制密钥 | 见下文 | **1** |
| 18 | app | 智能体指令 | `places-agent-admin-instructions` | 调用 places.agent-mate.ai 的方法；两个入口——公开首页链接和登录后头部链接 | 见下文 | **1** |
| 19 | app | 管理应用 i18n | `places-agent-admin-i18n` | 管理 UI 和邮件支持 `EN` / `CN` / `HK` / `TW`；语言环境切换；缺失键回退 | 见下文 | **1** |
| 20 | agent | 供应商自动选择 | `places-agent-provider-auto` | 智能体根据目的地+语言自动选择 provider 组合（策略1 Google+TA / 策略2 AMAP），caller 可覆盖 | 见下文 | **3a** |
| 21 | infra | 服务器稳定性 | `places-agent-server-stability` | JSON 解析安全、graceful shutdown、session TTL 清理 | 见下文 | **3a** |
| 24 | agent | 照片与价格档 | `places-agent-photos-price` | 搜索卡片返回 photos 与归一化 price_level（$/$$/$$$）；无图时省略字段 | 见下文 | **3b** |
| 25 | agent | Geocode-first 与 Directions fallback | `places-agent-geocode-directions` | Provider 判定以 Geocode 为准；Google Directions 全方法支持 Worker MCP fallback | 见下文 | **3c** |
| 26 | agent | 语言路由与搜索关键词 | `places-agent-language-keywords` | 按 locale/CJK 路由语言；搜索关键词多语言映射，去掉行程硬编码文案 | 见下文 | **4a** |
| 27 | agent | 搜索缓存与并行 | `places-agent-perf-cache` | Geocode/search 短期缓存；行程餐食/多天搜索并行，目标端到端 <15s | 见下文 | **4b** |
| 28 | app | Admin API 加固 | `places-agent-admin-hardening` | Prisma 错误→404/409、Admin Error Boundary、reset token 4h、session iat；邀请 E2E 已有，密码重置 E2E 待补 | 见下文 | **5** |
| 29 | agent | Prompt 组装器 | `places-agent-prompt-assembler` | base.{en,zh} + overlays 拼接系统 prompt；budget/time-of-day 内联 | 见下文 | **6** |
| 30 | agent | LLM 行程规划 | `places-agent-itinerary-llm` | 单 LLM+自查+Zod；`ITINERARY_MODE=llm\|legacy`；失败 fallback 旧路径 | 见下文 | **6** |
| 31 | agent | 行程 MCP 拆分 | `places-agent-itinerary-mcp-split` | MCP `discover_places` / `arrange_day`；HTTP 对等路由 ✅ MVP-7 | 见下文 | **6** |

---

# 第二部分 — 用户故事

## `places-agent-search-restaurants` — 餐厅搜索

通过一个或多个请求的地点供应商按位置和条件搜索餐厅。

### 用户故事 1 — 在某位置附近搜索餐厅

**作为** 餐厅应用调用方
**我希望** 在坐标或命名区域附近搜索餐厅，支持可选条件（菜系、关键词、当前营业中）
**以便** 无需自行维护地图供应商适配器即可推荐餐饮选项

#### AC1

```gherkin
Scenario: 在坐标附近按关键词搜索餐厅
  Given 调用方请求地图供应商 GOOGLE_MAPS
  And 在纬度 22.28 经度 114.17 附近存在匹配"ramen"的餐厅
  When 调用方在该图钉附近使用关键词"ramen"搜索餐厅
  Then 调用方收到一张或多张餐厅卡片
  And 每张卡片均为餐饮场所
  And 每张卡片包含名称和坐标
```

#### AC2

```gherkin
Scenario: 按命名区域和菜系搜索餐厅
  Given 调用方请求地图供应商 AMAP
  And 上海存在火锅餐厅
  When 调用方在命名区域"上海"附近使用菜系"hotpot"搜索餐厅
  Then 调用方收到该区域的餐厅卡片
  And 每张卡片的来源供应商为 AMAP
```

#### AC3

```gherkin
Scenario: 实时 AMAP 对地址进行地理编码然后按菜系搜索附近
  Given 调用方请求地图供应商 AMAP
  And PLACES_VENDOR_MODE 为 live
  And AMAP Web 服务已配置
  When 调用方使用菜系"barbecue"和地址"上海地铁十号线紫藤路站"且无附近图钉搜索餐厅
  Then 智能体对该地址进行地理编码
  And 智能体在该图钉周围使用餐饮类型 050000 进行搜索
  And 搜索关键词包含 烧烤
  And 返回的卡片供应商为 AMAP，坐标系为 GCJ-02
  And 没有 native_id 以 fixture_ 开头
```

### 用户故事 2 — 餐厅搜索无结果

**作为** 餐厅应用调用方
**我希望** 在没有餐厅匹配时收到明确的空结果
**以便** 我的产品可以显示空状态，而非空白或虚构列表

#### AC1

```gherkin
Scenario: 没有餐厅匹配
  Given 调用方请求已配置的地图供应商
  And 关键词"xyznonexistentplace"没有匹配的餐厅
  When 调用方在有效图钉附近使用该关键词搜索餐厅
  Then 结果列表为空
  And 结果键为 errors.empty_results
  And 智能体不编造餐厅卡片
```

### 用户故事 3 — 供应商失败时的餐厅搜索

**作为** 餐厅应用调用方
**我希望** 了解请求的供应商失败或被跳过，并附带原因键
**以便** 我可以降级处理（使用其他供应商的结果，或显示可见错误），而不是静默失败

#### AC1

```gherkin
Scenario: 一个请求的供应商失败，另一个返回餐厅
  Given 调用方请求 AMAP 和 GOOGLE_MAPS
  And AMAP 无法完成此搜索
  And GOOGLE_MAPS 返回至少一家餐厅
  When 调用方在有效图钉附近搜索餐厅
  Then 调用方收到 GOOGLE_MAPS 餐厅卡片
  And 跳过的供应商包含 AMAP，原因键为 errors.provider_failed
```

#### AC2

```gherkin
Scenario: 所有请求的供应商均失败
  Given 调用方请求 GOOGLE_MAPS
  And GOOGLE_MAPS 无法完成此搜索（直连 REST 和 Cloudflare Worker MCP 均失败，或直连失败后 Worker 未配置）
  When 调用方在有效图钉附近搜索餐厅
  Then 结果列表为空
  And 跳过的供应商包含 GOOGLE_MAPS，原因键为 errors.provider_failed
  And 智能体不编造餐厅卡片
  And 智能体不从 AMAP 填充列表
```

---

## `places-agent-search-places` — 地点搜索

以与餐厅搜索相同的方式搜索非餐厅地点（景点、公园、博物馆及其他 POI）。

### 用户故事 1 — 搜索景点和 POI

**作为** 行程应用调用方
**我希望** 在目的地附近搜索非餐厅地点，支持可选条件
**以便** 无需自行维护地图供应商适配器即可填充行程想法

#### AC1

```gherkin
Scenario: 在目的地附近搜索景点
  Given 调用方请求地图供应商 GOOGLE_MAPS
  And 在纬度 35.68 经度 139.76 附近存在博物馆
  When 调用方在该图钉附近使用关键词"museum"搜索地点
  Then 调用方收到一张或多张地点卡片
  And 每张卡片包含名称和坐标
```

### 用户故事 2 — 地点搜索保持非餐饮

**作为** 行程应用调用方
**我希望** 收到景点和其他 POI，而非以餐饮为主的列表
**以便** 游玩/行程结果与观光和活动保持相关

#### AC1

```gherkin
Scenario: 地点搜索不返回以餐饮为主的列表
  Given 调用方请求已配置的地图供应商
  And 图钉附近既有餐厅又有博物馆
  When 调用方在该图钉附近使用关键词"museum"搜索地点
  Then 返回的卡片为景点或其他非餐厅 POI
  And 餐饮场所不构成列表的主体
```

### 用户故事 3 — 地点搜索为空或失败

**作为** 行程应用调用方
**我希望** 当搜索无结果或供应商无法运行时收到明确的空结果或跳过/错误原因键
**以便** 我的产品可以显示诚实的空状态或错误状态

#### AC1

```gherkin
Scenario: 没有地点匹配
  Given 调用方请求已配置的地图供应商
  And 没有地点匹配该关键词
  When 调用方在有效图钉附近使用该关键词搜索地点
  Then 结果列表为空
  And 结果键为 errors.empty_results
```

#### AC2

```gherkin
Scenario: 请求的供应商无法运行地点搜索
  Given 调用方请求无法完成地点搜索的地图供应商
  When 调用方在有效图钉附近搜索地点
  Then 结果列表为空
  And 跳过的供应商包含该供应商及原因键
```

---

## `places-agent-place-details` — 地点详情

使用该供应商的原生地点 id 获取调用方已识别地点的详情。

### 用户故事 1 — 获取已知地点的详情

**作为** 调用方
**我希望** 加载已知地点的详情（名称、地址、坐标、营业时间、评分、联系方式、照片、分类）
**以便** 无需再次完整搜索即可显示地点卡片

#### AC1

```gherkin
Scenario: 加载已知地点 id 的详情
  Given GOOGLE_MAPS 上存在具有原生地点 id 的地点
  And 调用方请求地图供应商 GOOGLE_MAPS
  When 调用方请求该地点 id 的详情
  Then 调用方收到一张地点卡片
  And 卡片包含名称、地址和坐标
  And 供应商提供时，营业时间、评分、联系方式、照片和分类均已包含
```

### 用户故事 2 — 未知或无法解析的地点

**作为** 调用方
**我希望** 当 id 未知或供应商无法解析时收到明确的未找到/无法解析结果
**以便** 我不会显示虚构的地点

#### AC1

```gherkin
Scenario: 未知地点 id
  Given 调用方请求已配置的地图供应商
  And id"not-a-real-place-id"不存在对应地点
  When 调用方请求该 id 的详情
  Then 结果键为 errors.place_not_found
  And 智能体不返回虚构的地点卡片
```

---

## `places-agent-navigate` — 导航助手

为地点返回导航深度链接和 URL。链接不得包含密钥。

### 用户故事 1 — 地点导航链接

**作为** 调用方
**我希望** 收到地点的导航深度链接和网页 URL
**以便** 旅行者可以从我的产品在地图应用中打开路线

#### AC1

```gherkin
Scenario: 收到已知地点的导航链接
  Given 一张地点卡片具有坐标和至少一个地图供应商来源
  When 调用方请求该地点的导航
  Then 调用方收到至少一个网页 URL 或应用深度链接
  And 旅行者可以通过该链接打开路线
```

### 用户故事 2 — 链接不含密钥

**作为** 旅行者
**我希望** 在设备上打开这些链接时不暴露供应商 API 密钥
**以便** 地图凭据保留在智能体上，而不是浏览器或聊天客户端中

#### AC1

```gherkin
Scenario: 导航链接不含供应商密钥
  Given 地点具有 AMAP 或 GOOGLE_MAPS 导航链接
  When 调用方请求该地点的导航
  Then 返回的 URL 中不含 AMAP、Google 或 Tripadvisor API 密钥
```

### 用户故事 3 — 返回所有可用链接，不强制指定地图应用

**作为** 调用方
**我希望** 收到所有可用的无密钥链接（AMAP、Google Maps 以及其他可用链接）
**以便** 我的 UI 可以根据**客户端环境**选择打开哪个地图，而非由智能体内部的搜索目的地决定

#### AC1

```gherkin
Scenario: 智能体返回所有可用链接
  Given 地点同时有 AMAP 链接和 Google Maps 链接
  When 调用方请求该地点的导航
  Then AMAP 链接和 Google Maps 链接均存在
  And 智能体不因搜索目的地在中国大陆而丢弃某个链接
```

---

## `places-agent-geocode` — 地理编码

将地址转换为坐标，或将坐标转换为地址，使搜索在旅行者输入地名或放置图钉时也能运行。最初可能是内部功能，后续可作为工具对外暴露。

### 用户故事 1 — 地址转坐标

**作为** 调用方
**我希望** 将城市或地址转换为坐标
**以便** 旅行者输入位置而非放置图钉时，餐厅/地点搜索也能运行

#### AC1

```gherkin
Scenario: 对命名城市进行地理编码
  Given 调用方请求地图供应商 AMAP
  And AMAP 支持地理编码
  When 调用方对地址"People's Square, Shanghai"进行地理编码
  Then 调用方收到纬度和经度
```

### 用户故事 2 — 坐标转地址

**作为** 调用方
**我希望** 将坐标转换为人类可读的地址
**以便** 以旅行者的语言环境标注地图图钉

#### AC1

```gherkin
Scenario: 对图钉进行反向地理编码
  Given 调用方请求地图供应商 GOOGLE_MAPS
  And GOOGLE_MAPS 支持反向地理编码
  And 输出语言环境为 EN
  When 调用方对纬度 22.28 经度 114.17 进行反向地理编码
  Then 调用方收到 EN 语言环境下的人类可读地址
```

### 用户故事 3 — 请求的供应商不支持地理编码

**作为** 调用方
**我希望** 当请求的供应商不支持地理编码（例如 Tripadvisor）时收到跳过或错误原因键
**以便** 不会静默收到错误的供应商或虚假坐标

#### AC1

```gherkin
Scenario: Tripadvisor 不支持地理编码
  Given 调用方仅请求 TRIPADVISOR
  When 调用方对地址"Tokyo"进行地理编码
  Then 不编造坐标
  And 跳过的供应商包含 TRIPADVISOR，原因键为 errors.provider_capability_unsupported
```

---

## `places-agent-map-vendors` — 地图供应商选择

调用方传递要查询的**地图供应商**（`providers[]`：`AMAP`、`GOOGLE_MAPS`、`TRIPADVISOR`）。智能体验证凭据和能力矩阵。**不**强制大陆目的地使用 AMAP。这不是 HTTP vs MCP（功能 11），也不是驾车/公交路线。

**`GOOGLE_MAPS` 传输（ADR-017）：** 优先直连 Google Maps Platform REST；仅在出口故障时使用 Cloudflare Worker MCP（`GMAPS_MCP_*`）。卡片保持标记为 `GOOGLE_MAPS`。Worker 不是 `providers[]` id。除非调用方请求了 `AMAP`，否则不回退到 AMAP。如果直连失败后 Worker 未配置，则跳过 Google 并附带原因键。

### 用户故事 1 — 调用方按请求选择地图供应商

**作为** 调用方
**我希望** 传递本次请求要查询的地图供应商（例如 `AMAP`、`GOOGLE_MAPS`、`TRIPADVISOR`）
**以便** 我的产品策略保留在我的应用中，而非硬编码在智能体中

#### AC1

```gherkin
Scenario: 仅查询请求的供应商
  Given AMAP 和 GOOGLE_MAPS 均已配置
  When 调用方使用仅 AMAP 的 providers 搜索餐厅
  Then 返回的卡片来源为 AMAP
  And 本次请求不查询 GOOGLE_MAPS
```

### 用户故事 2 — 不支持或未配置的地图供应商须明确说明

**作为** 调用方
**我希望** 当请求的地图供应商不支持、未配置或缺少凭据时收到明确的跳过或错误及原因键
**以便** 我绝不会静默收到不同的供应商

#### AC1

```gherkin
Scenario: 未配置的供应商被跳过并附带原因键
  Given AMAP 无凭据
  When 调用方使用 providers AMAP 搜索餐厅
  Then 结果列表不从其他供应商静默填充
  And 跳过的供应商包含 AMAP，原因键为 errors.provider_unconfigured
```

#### AC2

```gherkin
Scenario: 未知供应商 id 须明确说明
  Given 调用方请求 providers"NOT_A_VENDOR"
  When 调用方在有效图钉附近搜索餐厅
  Then 跳过的供应商包含 NOT_A_VENDOR 及原因键
  And 智能体不将该 id 映射为 AMAP 或 GOOGLE_MAPS
```

### 用户故事 3 — 搜索目的地不决定供应商

**作为** 调用方
**我希望** 搜索目的地（例如上海 vs 东京）**不**覆盖我的 `providers[]`
**以便** 大陆 vs 海外的地图供应商策略仍由我决定

#### AC1

```gherkin
Scenario: 上海目的地不强制使用 AMAP
  Given GOOGLE_MAPS 已配置
  And 搜索图钉在上海
  When 调用方使用 providers GOOGLE_MAPS 搜索餐厅
  Then 智能体查询 GOOGLE_MAPS
  And 智能体不因目的地在中国大陆而将 GOOGLE_MAPS 替换为 AMAP
```

### 用户故事 4 — Google Maps 使用 Cloudflare Worker MCP 作为传输回退

**作为** 请求了 `GOOGLE_MAPS` 的调用方
**我希望** 当智能体无法访问 `maps.googleapis.com` 时使用已配置的 Cloudflare Worker MCP
**以便** 我仍能收到标记为 `GOOGLE_MAPS` 的 Google 地点卡片，而非 AMAP 或第四个供应商 id

#### AC1

```gherkin
Scenario: 直连 Google REST 失败后 Worker MCP 成功
  Given 调用方请求 providers GOOGLE_MAPS
  And GMAPS_MCP_URL 和 GMAPS_MCP_BEARER 已配置
  And 直连 maps.googleapis.com 因出口错误而失败
  And Cloudflare Worker MCP 返回至少一家餐厅
  When 调用方在有效图钉附近搜索餐厅
  Then 调用方收到标记为 GOOGLE_MAPS 的餐厅卡片
  And sources 不包含供应商 id GMAPS_MCP
  And 不查询 AMAP
```

#### AC2

```gherkin
Scenario: 直连 Google 成功，不使用 Worker MCP
  Given 调用方请求 providers GOOGLE_MAPS
  And 直连 maps.googleapis.com 返回餐厅
  When 调用方在有效图钉附近搜索餐厅
  Then 调用方收到标记为 GOOGLE_MAPS 的餐厅卡片
  And 不调用 Cloudflare Worker MCP
```

#### AC3

```gherkin
Scenario: 直连 Google 失败且 Worker MCP 未配置
  Given 调用方请求 providers GOOGLE_MAPS
  And 直连 maps.googleapis.com 因出口错误而失败
  And GMAPS_MCP_URL 或 GMAPS_MCP_BEARER 缺失
  When 调用方在有效图钉附近搜索餐厅
  Then 跳过的供应商包含 GOOGLE_MAPS 及原因键
  And 结果列表不从 AMAP 静默填充
```

---

## `places-agent-card-sources` — 地点卡来源

每张地点卡列出其来自哪些**地图供应商**（`sources[]`）。可选合并将来自多个供应商的同一场所聚合为一张卡片。**应用**选择打开哪个地图应用深度链接。这不是"要调用哪些供应商"（功能 6），也不是 HTTP vs MCP（功能 11）。

### 用户故事 1 — 每张卡片列出其来源

**作为** 调用方
**我希望** 在每张地点卡片上收到 `provider` 和/或 `sources[]`（供应商 id、可选 logo URL、深度链接）
**以便** 无需猜测供应商即可显示来源 logo 并提供地图链接

#### AC1

```gherkin
Scenario: 每张餐厅卡片携带来源元数据
  Given 调用方使用 providers GOOGLE_MAPS 搜索餐厅
  And 至少返回一家餐厅
  When 调用方收到结果列表
  Then 每张卡片有 provider 或 sources
  And 每个 source 包含供应商 id
  And 供应商提供时，logo URL 和深度链接均存在
```

### 用户故事 2 — 可选合并同一地点

**作为** 调用方
**我希望** 可选地将来自多个地图供应商的同一场所合并为一张卡片，包含多个 `sources[]` 和一个 `primary_provider`
**以便** 旅行者看到一个地点，而非重复的卡片

#### AC1

```gherkin
Scenario: 启用合并时聚合同一场所
  Given GOOGLE_MAPS 和 TRIPADVISOR 均在图钉附近返回同一场所
  When 调用方启用合并搜索
  Then 该场所显示为一张卡片
  And 卡片的 sources 包含 GOOGLE_MAPS 和 TRIPADVISOR
  And 卡片有 primary_provider
```

#### AC2

```gherkin
Scenario: 禁用合并时保留单独卡片
  Given GOOGLE_MAPS 和 TRIPADVISOR 均返回同一场所
  When 调用方禁用合并搜索
  Then 调用方可能收到该场所的多张卡片
```

### 用户故事 3 — 应用选择打开哪个地图

**作为** 旅行者
**我希望** 我的应用根据我的客户端环境（例如在大陆设备上优先 AMAP 链接）选择打开哪个地图深度链接
**以便** 智能体作为数据网关，不单独从目的地重写导航

#### AC1

```gherkin
Scenario: 智能体不从目的地选择地图应用
  Given 合并卡片同时有 AMAP 深度链接和 Google Maps 深度链接
  When 调用方收到该卡片
  Then 两个深度链接均保留在卡片上
  And 智能体不根据搜索目的地将某个链接标记为唯一可打开的链接
```

---

## `places-agent-tripadvisor-enrich` — Tripadvisor 丰富化

对主要结果进行可选的、尽力而为的 Tripadvisor 评分/内容丰富化。仅通过名称和位置匹配。

### 用户故事 1 — 按名称和位置丰富主要结果

**作为** 调用方
**我希望** 可选地通过名称和位置匹配将 Tripadvisor 评分和内容附加到主要结果
**以便** 旅行者无需二次搜索即可看到评论信号

#### AC1

```gherkin
Scenario: 按名称和位置丰富 Google 结果
  Given 调用方使用 providers GOOGLE_MAPS 且启用 Tripadvisor 丰富化进行搜索
  And 图钉附近名为"Ichiran"的 Google 餐厅按名称和位置匹配到 Tripadvisor 地点
  When 调用方收到结果
  Then 主要 Google 卡片包含 Tripadvisor 评分或内容
  And 匹配使用名称和位置，而非 Google place id
```

### 用户故事 2 — 丰富化失败时主要结果保留

**作为** 调用方
**我希望** 当 Tripadvisor 丰富化失败或找不到匹配时主要搜索结果仍然保留
**以便** Tripadvisor 故障不会清空列表

#### AC1

```gherkin
Scenario: Tripadvisor 故障不清空搜索结果
  Given GOOGLE_MAPS 返回餐厅
  And 启用 Tripadvisor 丰富化
  And Tripadvisor 无法完成丰富化
  When 调用方搜索餐厅
  Then Google 餐厅卡片保留
  And 丰富化失败报告带有原因键
```

#### AC2

```gherkin
Scenario: 无 Tripadvisor 匹配时主要卡片保留
  Given GOOGLE_MAPS 返回一家在 Tripadvisor 上没有名称和位置匹配的餐厅
  And 启用 Tripadvisor 丰富化
  When 调用方搜索餐厅
  Then 该餐厅卡片保留
  And 缺少丰富化不会移除该卡片
```

### 用户故事 3 — 不将 Google id 传递给 Tripadvisor

**作为** 调用方
**我希望** 智能体绝不将 Google `place_id`（或其他 Google 原生 id）作为地点标识符发送给 Tripadvisor
**以便** 丰富化不会误用供应商 id 或跨供应商泄露

#### AC1

```gherkin
Scenario: 丰富化不使用 Google place id 作为 Tripadvisor id
  Given 对 Google 搜索启用 Tripadvisor 丰富化
  When 智能体丰富化 Google 餐厅
  Then 向 Tripadvisor 查询时使用名称和位置
  And Google place id 不作为地点标识符发送给 Tripadvisor
```

#### AC2

```gherkin
Scenario: 实时 Terra 附近搜索仅使用纬度和经度
  Given PLACES_VENDOR_MODE 为 live
  And TRIPADVISOR_API_KEY 已配置
  And 启用 Tripadvisor 丰富化
  When 智能体丰富化 Google 餐厅
  Then 智能体调用 Terra GET /locations/nearby，参数为 lat、lon、radius 和 unit=KM
  And 请求不包含 location_id
  And 请求 URL 不含 Google 或 AMAP native_id
  And 匹配卡片的 tripadvisor url 不以 fixture 路径开头
```

---

## `places-agent-plan-itinerary` — 行程规划

根据行程边界、地点结果和旅行者偏好生成结构化行程建议。规划引擎在此处；行程屏幕、编辑、保存和分享保留在 where2play。偏好 **id**（`tight`、`medium`、`relaxed`、`premium`、`budget`、`transit_preferred` 及类似）为协议，不进行本地化。调用方 UI 中的显示标签和任何自然语言回复使用 i18n 键。

### 用户故事 1 — 从行程边界和地点规划

**作为** 行程应用调用方
**我希望** 根据行程时间/地点边界和地点结果收到结构化行程建议
**以便** 无需拥有规划逻辑即可展示计划

#### AC1

```gherkin
Scenario: 从时间边界和地点结果规划
  Given 调用方在东京有两天时间
  And 地点结果包含至少三个景点
  When 调用方根据这些边界和地点请求行程
  Then 调用方收到包含天数或时间块的结构化行程
  And 计划停留点来自提供的地点
```

### 用户故事 2 — 行程是调用方可展示的数据

**作为** 行程应用调用方
**我希望** 将行程作为结构化数据，以便在我自己的 UX 中展示、编辑、保存和分享
**以便** where2play 保持行程产品身份，智能体保持引擎身份

#### AC1

```gherkin
Scenario: 行程是结构化数据，而非完整的行程产品
  Given 可以生成有效的行程
  When 调用方请求行程
  Then 响应是调用方可展示、编辑、保存或分享的结构化数据
  And 智能体不声称已在 where2play 中保存了行程
```

### 用户故事 3 — 边界不可用或无地点

**作为** 行程应用调用方
**我希望** 当边界缺失/无效或没有地点可规划时收到明确的结果
**以便** 可以显示错误或空状态，而非虚构的行程

#### AC1

```gherkin
Scenario: 边界缺失
  Given 调用方有地点结果
  And 行程时间边界缺失
  When 调用方请求行程
  Then 结果键为 errors.bounds_invalid
  And 智能体不虚构行程
```

#### AC2

```gherkin
Scenario: 无地点可规划
  Given 有效的行程时间边界
  And 地点列表为空
  When 调用方请求行程
  Then 结果键为 errors.no_places_to_plan
  And 智能体不虚构停留点
```

### 用户故事 4 — 按偏好规划（包括自然语言）

**作为** 行程应用调用方
**我希望** 在请求计划时传递旅行者偏好——节奏（`tight`、`medium`、`relaxed`）、消费（`premium`、`budget`）、交通（`transit_preferred` / 偏好交通服务）等——以结构化 id 或支持语言环境（`EN`、`CN`、`HK`、`TW`）的自然语言文本形式
**以便** 行程符合旅行者的出行、消费和日程安排方式，而无需调用方拥有规划逻辑

当计划包含 Open-Meteo 天气时，条件文本遵循功能 13 / ADR-014（目录键，而非英语 Open-Meteo 短语）。

#### AC1

```gherkin
Scenario: 结构化节奏和消费偏好
  Given 有效边界和地点结果
  When 调用方以 tight 节奏和 budget 消费请求行程
  Then 计划反映比 relaxed premium 请求（使用相同地点）更紧凑的日程和较低消费的停留点
```

#### AC2

```gherkin
Scenario: 公交偏好
  Given 有效边界和地点结果
  And 地点之间存在公共交通选项
  When 调用方以 transit_preferred 请求行程
  Then 计划优先选择公共交通或交通服务，而非忽略该偏好的默认方案
```

#### AC3

```gherkin
Scenario: 支持语言环境中的自然语言偏好
  Given 有效边界和地点结果
  And 输出语言环境为 EN
  When 调用方以自然语言偏好"relaxed weekend, budget, prefer metro"请求行程
  Then 使用等效偏好 id 生成计划
  And 调用方不被要求仅发送结构化 id
```

### 用户故事 5 — 行程日的实时 Open-Meteo 预报

**作为** 行程应用调用方
**我希望** 行程对每天的天气使用实时 Open-Meteo 预报
**以便** 天气数据来自真实的预报 API 而非 fixture，且在 Open-Meteo 不可用时计划可降级处理

#### AC1

```gherkin
Scenario: 实时预报仅使用纬度和经度
  Given PLACES_VENDOR_MODE 为 live
  And Open-Meteo 预报可访问
  When 调用方请求包含有坐标地点的行程
  Then 智能体调用 GET /forecast，参数为 latitude、longitude、daily weather_code 和 temperatures，以及 timezone=auto
  And 请求不使用 AMAP weatherInfo 或 Google Weather
  And 每天的 weather_code 是来自预报的数字，而非 fixture 特征值 80（温度 24/18）
```

#### AC2

```gherkin
Scenario: Open-Meteo 失败时行程保留
  Given PLACES_VENDOR_MODE 为 live
  And Open-Meteo HTTP 或网络失败
  When 调用方请求行程
  Then 行程天数和停留点保留
  And 天气被省略或跳过，显示 errors.weather_unavailable
```

### 用户故事 6 — 含起点的计时日计划（detail timed）

**作为** 行程应用调用方
**我希望** 请求 `detail: "timed"` 时提供**起点**（如酒店名称或图钉）、行程边界和偏好
**以便** 收到边界内**每一天**的按时钟排列的访问块、带天气缓冲的深度链接出行选项，以及明确的天气规划影响——无需自行拥有日程引擎

当 `places` 为空时，计时自动搜索使用**城市**查询文本，而非酒店或目的地地标作为关键词。语言环境为 CN/HK/TW **或** 起点/目的地/自然语言包含 CJK 字符 → 组合的 `search_places` / `search_restaurants` 查询使用中文（CN 为简体，HK/TW 为繁体）；调用方 `query` 不被改写。当同时有起点**和**目的地跨多天时，每天在沿走廊的插值图钉附近搜索。当省略起点时，`search_anchor` 为城市。`days[].day_index` 从 **1** 开始。

#### AC1

```gherkin
Scenario: 计时计划从起点填充所有天的时钟时段
  Given detail 为 timed
  And 起点为酒店名称或经纬度
  And 边界跨越五个日历天
  And places 为空或已提供
  When 调用方请求 plan_itinerary
  Then 响应包含 origin 和 timezone
  And data.days 长度等于日历天数
  And 每个有访问记录的天包含 kind visit 的块，含 slot start 和 end
  And legs_to_here 包含带有 duration_min 和 weather_buffer_min 的深度链接选项
  And 当 PLACES_VENDOR_MODE 为 live 时，没有 native_id 以 fixture_ 开头
```

#### AC2

```gherkin
Scenario: places 为空时计时计划自动搜索
  Given detail 为 timed
  And 起点和边界有效
  And places 为空
  When 调用方请求 plan_itinerary
  Then 智能体在起点附近搜索地点
  And 访问地点来自搜索结果，而非虚构名称
```

#### AC3

```gherkin
Scenario: 省略或 stops 模式下行为不变
  Given detail 为 stops 或已省略
  And places 为空
  When 调用方请求 plan_itinerary
  Then 结果键为 errors.no_places_to_plan
```

### 用户故事 7 — 天气影响计时计划

**作为** 行程应用调用方
**我希望** Open-Meteo 每日天气改变路段缓冲/模式排序提示，并以 `planning_impact` 显示在每天中
**以便** 恶劣天气在结果中可见，而不仅仅是 WMO 标签

#### AC1

```gherkin
Scenario: 恶劣天气增加步行缓冲并标注影响
  Given detail 为 timed
  And Open-Meteo 为某天返回雨天 weather_code
  When 调用方请求 plan_itinerary
  Then 该天有 planning_impact.severity adverse 或 severe
  And 该天的步行路段 weather_buffer_min 大于 0
  And planning_impact.summary_key 是目录键，而非英语 Open-Meteo 散文
```

#### AC2

```gherkin
Scenario: 晴好天气时步行天气缓冲为零
  Given detail 为 timed
  And Open-Meteo 返回晴天或基本晴天代码以及温和气温
  When 调用方请求 plan_itinerary
  Then planning_impact.severity 为 fair
  And 步行 weather_buffer_min 为 0
```

### 用户故事 8 — 计时计划中的餐食（故事 B）

**作为** 行程应用调用方
**我希望** 计时日期包含午餐、可选的下午咖啡/茶和晚餐选项块（实时餐厅搜索，按消费排名；每餐选项在整个行程中唯一；访问地点在整个行程中唯一）
**以便** 日计划是一站式访问+用餐日程，无需单独搜索餐食

晚餐安排在 **18:00–20:00**。若最后一次访问在 17:00 前结束，可填充 `meal: "cafe"` 块直至晚餐。CN/HK/TW 计时搜索优先使用 AMAP（**当调用方已列出 AMAP** 时，不注入 AMAP）。场所身份为 `native_id`（小写）或规范化名称。同日午餐选项不得出现在咖啡或晚餐中。访问和餐食 POI 互斥。若额外搜索仍无法填充某个时段，**省略**该餐食或访问——绝不复用行程中已有的场所。

#### AC1

```gherkin
Scenario: 计时日包含午餐和晚餐选项及访问衍生时段
  Given detail 为 timed
  And 边界有效且已安排访问
  And 在访问附近的餐厅搜索返回至少两个餐饮场所
  When 调用方请求 plan_itinerary
  Then 有访问的天包含 kind meal 的午餐和晚餐块（当有选项时）
  And lunch.slot 等于上午和下午访问之间的间隔（非固定的 12:00–13:30）
  And 当最后一次访问在 18:00 或之前结束时，dinner.slot 为 18:00–20:00
  And 若最后一次访问在 17:00 前结束，可填充咖啡餐食块直至 18:00
  And 每个午餐选项身份与当天的咖啡和晚餐选项不重叠
  And 每餐最多有两个选项，含地点卡片和 leg_from_previous
  And duration_min 超过 300 的餐食选项被丢弃
  And 实时时没有餐厅 native_id 以 fixture_ 开头
```

#### AC2

```gherkin
Scenario: 餐食搜索失败或营业时间已关闭时访问保留
  Given detail 为 timed
  And 某餐食时段的餐厅搜索失败或返回空
  Or 所有候选在推导的餐食窗口内均已关闭
  When 调用方请求 plan_itinerary
  Then 访问块保留
  And 该餐食块被省略或选项减少
  And skipped 可能包含 errors.provider_failed 或空餐食说明
  And 当供应商省略营业时间时，不编造营业时间
```

#### AC3

```gherkin
Scenario: 有路线时餐食路段使用路线导航
  Given detail 为 timed
  And 路线导航对某餐食选项成功
  When 构建餐食块
  Then leg_from_previous.source 可为 directions
  And 每餐最多请求两个选项
```

#### AC4

```gherkin
Scenario: 同日餐食选项不重叠
  Given detail 为 timed
  And 午餐有两个餐饮选项
  When 咖啡和晚餐被填充
  Then 没有午餐选项身份出现在咖啡或晚餐中
```

#### AC5

```gherkin
Scenario: 跨天访问和餐食唯一
  Given detail 为 timed 且边界跨越多天
  When 计划构建完成
  Then 所有天的访问身份两两不相交
  And 所有天的餐食选项身份两两不相交
  And 用作访问的 POI 不同时作为餐食选项
```

#### AC6

```gherkin
Scenario: 唯一场所不足时省略餐食而非重复
  Given detail 为 timed
  And 额外餐厅搜索后，晚餐只剩一个未使用的餐饮身份
  When 构建餐食块
  Then 晚餐被省略
  And 午餐 native_id 不被晚餐复用
```

### 用户故事 9 — 实时路线路段（故事 C）

**作为** 行程应用调用方
**我希望** 出行路段在可用时使用供应商路线 ETA（加上天气缓冲）
**以便** 逐小时出行时间不仅仅是半正矢距离估算

#### AC1

```gherkin
Scenario: 路线成功时路段使用供应商时长
  Given detail 为 timed
  And Google 或 AMAP 路线返回步行或公交或驾车的时长
  When 调用方请求 plan_itinerary
  Then 具有供应商 ETA 的 legs_to_here 条目 source 为 directions
  And duration_min 等于 base_duration_min 加 weather_buffer_min
```

#### AC2

```gherkin
Scenario: 路线失败时保留深度链接启发式路段
  Given detail 为 timed
  And 某模式的路线 HTTP 失败
  When 调用方请求 plan_itinerary
  Then 该模式保留 source heuristic 或在不编造 ETA 的情况下被省略
  And skipped 可能包含失败供应商 id 的 errors.directions_unavailable
  And 访问块保留
```

#### AC3

```gherkin
Scenario: 仅 AMAP providers 使用 AMAP 路线
  Given providers 仅为 AMAP
  And AMAP 路线成功
  When 调用方请求 plan_itinerary
  Then 访问路段可有 source directions，无需 Google
```

### 用户故事 10 — 营业时间映射

**作为** 调用方
**我希望** 供应商营业时间被映射到地点卡片上
**以便** 营业时间数据反映供应商的实际字段值，当供应商省略时缺失而非被编造

#### AC1

```gherkin
Scenario: 供应商营业时间映射到 PlaceCard.hours
  Given Google regularOpeningHours 或 AMAP opentime 字段存在
  When 搜索或详情返回卡片
  Then PlaceCard.hours 为非空的供应商来源摘要
  And 当供应商省略营业数据时，hours 不设置
```

### 用户故事 11 — 计时搜索允许/拒绝和目的地偏向

**作为** 行程应用调用方
**我希望** 计时自动搜索排除住宿、交通枢纽、广场和地标餐厅，后续日期偏向目的地，且天数从 1 开始编号
**以便** 访问池包含真实景点，且日程地理分布合理

#### AC1

```gherkin
Scenario: 住宿不作为计时访问使用
  Given detail 为 timed 且 places 为空
  And 附近搜索返回青旅与景点混合
  When 智能体构建访问
  Then 住宿名称/类别匹配项被排除
  And 智能体不回退到未过滤的列表
```

#### AC2

```gherkin
Scenario: 目的地偏向后续日期
  Given 起点和目的地相距较远
  And detail timed 跨越多天
  When 地点分配完成
  Then 后续日期的访问比早期日期更靠近目的地
```

#### AC3

```gherkin
Scenario: 广场商场车站和地标餐厅被拒绝
  Given 计时自动搜索返回广场、商场、车站、码头或风景区
  When 景点过滤器运行
  Then 这些卡片从访问池中排除
  And 餐饮过滤器排除广州塔 管理办 贵宾楼，即使其类别为餐厅
```

#### AC4

```gherkin
Scenario: 计时天数从 1 开始编号
  Given detail 为 timed 或 stops，边界跨越多天
  When plan_itinerary 成功
  Then days[0].day_index 等于 1
```

#### AC5

```gherkin
Scenario: 城市作为搜索锚点，而非目的地地标
  Given 省略起点，目的地为 广州塔，自然语言提及 广州
  When 计时计划构建
  Then search_anchor 为城市而非地标
```

#### AC6

```gherkin
Scenario: CN 语言环境在已列出 AMAP 时优先使用 AMAP
  Given 语言环境为 CN 且 providers 包含 AMAP
  When 计时自动搜索运行
  Then 优先查询 AMAP
  And 仅当 AMAP 未返回可用景点时 Google 才补充
  And 当调用方未列出 AMAP 时，不注入 AMAP
```

#### AC7

```gherkin
Scenario: 组合搜索查询在语言环境或 CJK 名称时使用中文
  Given detail 为 timed 且 places 为空
  And 语言环境为 CN 或 HK 或 TW，或起点、目的地、自然语言包含 CJK 字符
  When 智能体自动搜索地点和餐厅
  Then 组合查询字符串使用中文（CN 为简体，HK/TW 为繁体）
  And 不在该波次中混入英文 museum/restaurant 模板
  And 调用方提供的搜索查询原样转发
```

---

## `places-agent-nl-chat` — 自然语言地点聊天

旅行者以自然语言询问地点，可选上传文件（包括图片）。智能体在**其**服务器 Quanzil 上运行工具循环。LLM 不因搜索目的地而切换。上传错误使用 i18n 键。

### 用户故事 1 — 以自然语言询问地点

**作为** 旅行者（通过智能体主机）
**我希望** 以自然语言询问餐厅或地点并收到基于工具的回答
**以便** 聊天产品无需自定义工具循环即可使用 places-agent

#### AC1

```gherkin
Scenario: 自然语言餐厅问题使用工具
  Given 旅行者通过具有有效调用方 API 密钥的智能体主机连接
  When 旅行者询问"ramen near Tsim Sha Tsui"
  Then 回复基于餐厅或地点工具结果
  And 回复不是未经工具调用的虚构场所列表
```

### 用户故事 2 — 聊天文案使用键，而非单一语言

**作为** 旅行者
**我希望** 聊天回复和用户可见错误以所请求语言环境（`EN`、`CN`、`HK` 或 `TW`；见功能 13）的 i18n 键解析
**以便** 文案不锁定于单一语言，且缺少翻译时回退而非导致轮次中断

#### AC1

```gherkin
Scenario: 聊天错误使用语言环境键
  Given 旅行者请求语言环境 CN
  When 发生用户可见的聊天错误
  Then 错误通过消息键标识
  And 显示文本为该键的 CN 目录条目，若缺失则回退到 EN 再到键本身
```

### 用户故事 3 — LLM 不按目的地路由

**作为** 运营商
**我希望** 智能体的模型来自此可部署单元的服务器 Quanzil 配置
**以便** 搜索目的地不切换 LLM 供应商或模型

#### AC1

```gherkin
Scenario: 上海问题不切换智能体模型
  Given 智能体可部署单元配置了一个服务器 Quanzil 模型
  When 旅行者询问上海的餐厅
  Then 智能体使用已配置的模型
  And 不因目的地在中国大陆而切换模型
```

### 用户故事 4 — 文件上传，包括图片

**作为** 旅行者（通过智能体主机）
**我希望** 在地点聊天轮次中附加文件，包括图片（例如场所照片、菜单或截图）
**以便** 智能体在搜索或推荐地点时可以将该内容与我的自然语言问题结合使用
**并且** 如果文件缺失、不支持或过大，我收到带键的错误，且轮次不会从失败的上传中虚构地点

#### AC1

```gherkin
Scenario: 图片附件与问题一起使用
  Given 旅行者附上一张餐厅门面照片
  And 旅行者询问"what is this place and nearby similar spots"
  When 旅行者发送轮次
  Then 智能体将图片与问题一起使用
  And 当可以识别或搜索到地点时，回复基于工具
```

#### AC2

```gherkin
Scenario: 不支持或过大的文件
  Given 旅行者附上不支持或超过允许大小的文件
  When 旅行者发送轮次
  Then 结果键为 errors.upload_unsupported 或 errors.upload_too_large
  And 智能体不从失败的上传中虚构地点
```

---

## `places-agent-http-mcp` — HTTP API 和 MCP

通过两种**访问渠道**暴露相同的地点工具：HTTP API 用于第一方应用 BFF，MCP 用于智能体主机（`/mcp`、`/sse`）。单一工具核心；无分叉行为。这不是驾车/公交路线。两种渠道均将服务标识为 **`places-agent`**。

此 MCP 是 **places-agent** 的工具界面。它**不是** Google Maps Cloudflare Worker MCP（`GMAPS_MCP_*`），后者是 `GOOGLE_MAPS` 适配器的内部**传输回退**（功能 6 / ADR-017）。

### 用户故事 1 — 应用 BFF 的 HTTP 工具

**作为** 第一方应用 BFF
**我希望** 使用已认证的调用方密钥通过 HTTP API 调用地点工具
**以便** what2eat 和 where2play 可以从服务器而非浏览器使用智能体

#### AC1

```gherkin
Scenario: 应用 BFF 使用调用方 API 密钥通过 HTTP 调用搜索
  Given what2eat 的服务器持有有效的调用方 API 密钥
  When 该 BFF 通过 HTTP 访问渠道搜索餐厅
  Then BFF 收到餐厅卡片
  And 旅行者的浏览器未将调用方 API 密钥发送给地图供应商
```

### 用户故事 2 — 智能体主机的 MCP 工具

**作为** 智能体主机
**我希望** 通过 MCP 调用相同的工具，含义与 HTTP API 相同
**以便** chatboxai 等主机无需第二份合约即可使用 places-agent

#### AC1

```gherkin
Scenario: 智能体主机通过 MCP 调用相同搜索
  Given MCP 主机持有有效的调用方 API 密钥
  When 主机通过 MCP 搜索餐厅
  Then 主机收到含义与 HTTP 搜索相同的餐厅卡片
```

### 用户故事 3 — HTTP 和 MCP 上的结果相同

**作为** 调用方
**我希望** HTTP API 和 MCP 上的工具名称、输入及结果/错误含义相同
**以便** 无需为同一能力维护两套行为

#### AC1

```gherkin
Scenario: 两种渠道上工具名称和空结果相同
  Given 关键词"xyznonexistentplace"无匹配餐厅
  When 调用方通过 HTTP 搜索餐厅
  And 第二个调用方使用相同输入通过 MCP 搜索餐厅
  Then 两者均收到空列表
  And 两者均使用结果键 errors.empty_results
```

### 用户故事 4 — 调用方看到智能体 id `places-agent`

**作为** 调用方（应用 BFF 或 MCP 主机）
**我希望** HTTP 响应和 MCP initialize 将服务标识为 `places-agent`
**以便** 我可以将此智能体与 what2eat、where2play 或 ChatBox 显示标题区分开

#### AC1

```gherkin
Scenario: HTTP 工具响应标识智能体
  Given 调用方持有有效的调用方 API 密钥
  When 调用方通过 HTTP 搜索餐厅
  Then JSON 正文字段 agent 为"places-agent"
```

#### AC2

```gherkin
Scenario: MCP initialize 标识智能体
  Given MCP 主机持有有效的调用方 API 密钥
  When 主机完成 MCP initialize
  Then serverInfo.name 为"places-agent"
```

#### AC3

```gherkin
Scenario: 健康检查文档标识智能体
  When 调用方读取 HTTP 健康或就绪文档
  Then JSON 正文字段 agent 为"places-agent"
```

---

## `places-agent-caller-trust` — 调用方 API 密钥认证

智能体**仅**向提供有效**调用方 API 密钥**（在功能 17 中签发）的调用方提供 HTTP 和 MCP 工具。缺失、无效或已撤销的密钥将被拒绝。地图和 Tripadvisor 密钥仅保留在 places-agent 上，绝不作为调用方凭据。用户可见错误为消息键。

### 用户故事 1 — 使用调用方 API 密钥认证调用方

**作为** 调用方（应用 BFF 或 MCP 主机）
**我希望** 使用智能体时发送调用方 API 密钥
**以便** 仅在密钥有效时收到地点工具和聊天
**并且** 缺失、未知或已撤销的密钥被拒绝，附带键错误（`errors.caller_unauthorized`）且无工具结果

#### AC1

```gherkin
Scenario: 有效的调用方 API 密钥收到服务
  Given 调用方 API 密钥存在且未撤销
  When 调用方使用该密钥搜索餐厅
  Then 调用方收到搜索结果（有结果或为空）
```

#### AC2

```gherkin
Scenario: 缺少密钥时被拒绝
  Given 调用方未发送调用方 API 密钥
  When 调用方搜索餐厅
  Then 结果键为 errors.caller_unauthorized
  And 不返回餐厅卡片
```

#### AC3

```gherkin
Scenario: 未知或已撤销的密钥被拒绝
  Given 调用方发送未知或已撤销的密钥
  When 调用方搜索餐厅
  Then 结果键为 errors.caller_unauthorized
  And 不返回餐厅卡片
```

### 用户故事 2 — 地图供应商密钥不作为调用方凭据

**作为** 产品负责人
**我希望** AMAP / Google / Tripadvisor 密钥仅保留在 places-agent 上，绝不出现在浏览器、导航链接或调用方认证头中
**以便** 供应商凭据不被泄露，也不能用于替代调用方 API 密钥

#### AC1

```gherkin
Scenario: 地图供应商密钥不能认证调用方
  Given 调用方发送 AMAP 或 Google 密钥而非调用方 API 密钥
  When 调用方搜索餐厅
  Then 结果键为 errors.caller_unauthorized
```

#### AC2

```gherkin
Scenario: 导航链接仍不含地图供应商密钥
  Given 有效的调用方 API 密钥
  When 调用方请求导航链接
  Then 返回的 URL 不含 AMAP、Google 或 Tripadvisor API 密钥
```

### 用户故事 3 — 错误为 i18n 键

**作为** 调用方
**我希望** 用户可见失败以消息键形式返回（加上可选的默认语言环境参考文案），而非单一硬编码语言正文
**以便** 我的应用可以本地化错误，且缺少翻译时回退到 `EN` 再到键本身

#### AC1

```gherkin
Scenario: 未授权错误为键，而非单一语言正文
  Given 调用方未发送调用方 API 密钥
  And 请求的语言环境为 HK
  When 调用方搜索餐厅
  Then 结果键为 errors.caller_unauthorized
  And 显示文案为该键的 HK 目录条目，若缺失则回退到 EN 再到键本身
```

---

## `places-agent-admin-home` — 管理员首页

类别：**app**。`places.agent-mate.ai` 管理 Web 应用的公开落地页。所有标签和控件使用 i18n 键（功能 19：`EN`、`CN`、`HK`、`TW`）。

### 用户故事 1 — 首页显示设置指令和管理员登录

**作为** 访客
**我希望** 看到一个包含智能体指令链接（功能 18）和管理员登录控件的首页
**以便** 我可以了解如何调用 places.agent-mate.ai 或登录管理它

#### AC1

```gherkin
Scenario: 访客看到指令链接和登录入口
  Given 访客未登录
  When 访客打开管理首页
  Then 键为 admin.home.instructions_link 的控件可用
  And 该控件指向智能体指令
  And 键为 admin.home.login 的控件可用
```

---

## `places-agent-admin-users` — 管理员登录和用户

类别：**app**。仅限邀请的管理员。邮件（重置、邀请）通过 **Resend** 发送。UI 和邮件正文中的文案为 i18n 键。默认管理员标识符不进行本地化：用户名 `admin`，邮箱 `me@ethanhuang.com`。

### 用户故事 1 — 管理员登录

**作为** 管理员
**我希望** 使用用户名或邮箱和密码登录
**以便** 访问登录后落地页（功能 16）

#### AC1

```gherkin
Scenario: 使用用户名和密码登录
  Given 用户名"admin"的管理员存在且密码非空
  When 管理员使用用户名"admin"和正确密码登录
  Then 管理员到达登录后落地页
```

#### AC2

```gherkin
Scenario: 使用邮箱登录
  Given 邮箱"me@ethanhuang.com"的管理员存在且密码非空
  When 管理员使用该邮箱和正确密码登录
  Then 管理员到达登录后落地页
```

#### AC3

```gherkin
Scenario: 密码错误
  Given 用户名"admin"的管理员存在
  When 管理员使用用户名"admin"和错误密码登录
  Then 结果键为 errors.login_failed
  And 管理员未到达落地页
  And 未建立会话
```

### 用户故事 2 — 默认管理员用户

**作为** 运营商
**我希望** 有一个用户名为 `admin`、邮箱为 `me@ethanhuang.com` 的默认管理员
**以便** 首次部署后无需公开注册即可登录

#### AC1

```gherkin
Scenario: 首次部署后默认管理员存在
  Given 全新部署且无额外邀请管理员
  When 运营商以用户名"admin"和邮箱"me@ethanhuang.com"登录
  Then 该账户被接受为管理员
  And 不需要公开注册来创建它
```

### 用户故事 3 — 通过邮件重置密码（Resend）

**作为** 管理员
**我希望** 请求密码重置并通过 Resend 收到重置邮件
**以便** 无需他人设置密码即可重新获得访问权限

#### AC1

```gherkin
Scenario: 发送密码重置邮件
  Given 邮箱"me@ethanhuang.com"的管理员存在
  And Resend 已配置
  When 管理员为该邮箱请求密码重置
  Then 通过 Resend 发送重置邮件
  And 邮件正文文案使用 i18n 键
  And 邮件包含绝对设置密码 URL（`PUBLIC_BASE_URL` 或 `APP_URL`）
```

#### AC2

```gherkin
Scenario: Resend 不可用
  Given Resend 无法发送邮件
  When 管理员请求密码重置
  Then 显示带键的错误
  And 密码未更改
```

### 用户故事 4 — 通过邮件邀请新管理员

**作为** 管理员
**我希望** 通过邮件（Resend）邀请另一位管理员
**以便** 他们无需公开注册即可加入
**并且** 他们在 `/accept-invite` 上完成个人资料设置（名字、姓氏、用户名）并设置密码后方可登录

#### AC1

```gherkin
Scenario: 邀请邮件链接到 accept-invite 入职流程
  Given 已登录的管理员
  And Resend 已配置
  When 管理员邀请"new.admin@example.com"
  Then 通过 Resend 发送邀请邮件
  And 邀请邮件包含带 token 查询参数的绝对 accept-invite URL
  And URL 路径为 /accept-invite 而非 /set-password
  And 被邀请者在完成入职前无法使用应用
```

#### AC2

```gherkin
Scenario: 被邀请管理员在 accept-invite 上设置个人资料和密码
  Given "new.admin@example.com"的有效邀请 token
  When 被邀请者打开 accept-invite 链接
  Then 看到名字、姓氏、用户名、密码和确认密码字段
  And 表单显示被邀请的邮箱作为上下文
  When 他们提交匹配的密码和有效的唯一用户名
  Then 账户被激活
  And 他们看到带有登录操作的成功状态
  And 邀请 token 不可重用
  And 凭据在提交后不出现在浏览器 URL 中
```

#### AC3

```gherkin
Scenario: 过期或已使用的邀请 token
  Given 已过期或已使用的邀请 token
  When 被邀请者打开 accept-invite 链接
  Then 显示带键的过期邀请提示
  And 该 token 的个人资料表单不可提交
```

### 用户故事 5 — 密码为空时强制重置密码

**作为** 密码为空的管理员（包括首次被邀请的管理员）
**我希望** 在使用应用前被要求设置密码
**以便** 没有人以空密码使用管理应用

#### AC1

```gherkin
Scenario: 空密码阻止访问落地页
  Given 管理员账户存在且密码为空
  When 该管理员尝试使用管理应用
  Then 管理员必须在落地页可用前设置密码
  And 在设置密码前结果键为 errors.password_required
```

### 用户故事 6 — 公开注册已禁用

**作为** 访客
**我希望** 看到公开注册已关闭的明确提示，以及联系管理员获取 api-key 的方式
**以便** 我不期望自己创建账户（管理员仅限邀请）

#### AC1

```gherkin
Scenario: 访客无法自注册
  Given 访客在管理应用上
  When 访客查找新用户注册入口
  Then 注册不可用
  And 显示登录提示 register-disabled
  And 提示由 admin.register.disabled_prefix、admin.register.contact_admin 和 admin.register.disabled_suffix 组合而成
  And api-key 以等宽字体显示为协议 id
```

#### AC2

```gherkin
Scenario: 联系管理员时显示微信二维码
  Given 访客在登录页面
  And 联系管理员控件可见
  When 访客悬停或聚焦联系管理员
  Then 工具提示 contact-admin-qr 可见
  And 工具提示图片来源为 EthanWeChat.png
  And 标题使用 admin.register.wechat_qr_caption
  And 二维码在悬停或聚焦前不可见
```

### 用户故事 7 — 删除管理员

#### AC1

```gherkin
Scenario: 已登录管理员确认后删除另一位管理员
  Given 已登录的管理员
  And 列表中存在至少一位其他管理员或待处理邀请
  When 已登录管理员对另一行选择删除
  And 确认删除
  Then 该账户从管理员列表中移除
  And 向被删除地址发送通知邮件
  And 邮件文案使用 i18n 键
```

#### AC2

```gherkin
Scenario: 管理员不能删除自己的账户
  Given 已登录管理员查看管理员列表
  When 已登录管理员查找自己行的删除选项
  Then 自己行不提供删除选项
  And 尝试删除自己 id 的 API 请求返回 errors.cannot_delete_self
```

#### AC3

```gherkin
Scenario: 最后一位管理员不可删除
  Given 系统中只有一个管理员账户
  When 运营商尝试删除管理员
  Then 不进行会导致零管理员的删除
  And 当触发该保护时应用 errors.cannot_delete_last_admin
```

#### AC4

```gherkin
Scenario: 删除通知邮件失败
  Given Resend 无法发送邮件
  When 已登录管理员确认删除另一位管理员
  Then 返回 errors.delete_admin_failed
  And 目标账户未被删除
```

---

## `places-agent-admin-api-keys` — 调用方 API 密钥

类别：**app**。签发功能 12 所检查的**调用方 API 密钥**。不显示地图供应商密钥。明文 `secret` 入库供列表 Copy（[ADR-034](../../workspace-specs/adr/ADR-034-caller-api-key-secret-at-rest.md)）；创建/重新生成面板仍可立即复制。所有其他 UI 文案为 i18n 键。

### 用户故事 1 — 创建调用方 API 密钥

**作为** 管理员
**我希望** 创建带有名称和描述的密钥，生成密钥，并将其复制到剪贴板
**以便** 可以将有效密钥提供给调用方（what2eat、where2play、ChatBox）而无需手动输入

#### AC1

```gherkin
Scenario: 创建带名称、描述、生成和复制的密钥
  Given 已登录的管理员
  When 管理员创建名为"what2eat-prod"且带描述的调用方 API 密钥
  Then 生成新密钥
  And 管理员可通过键 admin.keys.copy 将密钥复制到剪贴板
  And 明文密钥在创建时显示
  And 该密钥写入 CallerApiKey.secret，之后可在列表再次 Copy
```

#### AC2

```gherkin
Scenario: 已创建的密钥可调用智能体
  Given 管理员已创建调用方 API 密钥
  When 调用方使用该密钥搜索餐厅
  Then 调用方通过认证
```

### 用户故事 1b — 列表复制调用方 API 密钥

**作为** 管理员
**我希望** 在 Keys 列表一键复制完整密钥
**以便** 无需重新签发即可粘贴到调用方配置

#### AC1

```gherkin
Scenario: 列表 Copy 写入剪贴板
  Given 已登录管理员
  And 列表中存在带入库 secret 的密钥"what2eat-prod"
  When 管理员点击该行 Copy（admin.keys.copy_list）
  Then 完整 secret 写入剪贴板
  And 按钮短暂显示 admin.common.copied
```

#### AC2

```gherkin
Scenario: 无入库 secret 的旧密钥不能 Copy
  Given 列表中存在 secret 为 null 的遗留密钥
  When 管理员查看该行
  Then Copy 禁用
  And 提示需重新签发（admin.keys.copy_unavailable）
```

### 用户故事 2 — 编辑调用方 API 密钥

**作为** 管理员
**我希望** 编辑密钥的名称和描述
**以便** 在不轮换密钥的情况下保持列表易于理解

#### AC1

```gherkin
Scenario: 编辑名称和描述而不轮换密钥
  Given 名为"old-name"的调用方 API 密钥存在
  When 管理员将名称改为"new-name"并更新描述
  Then 存储的名称和描述匹配新值
  And 密钥仍能认证相同的调用方
```

### 用户故事 3 — 重新生成调用方 API 密钥

**作为** 管理员
**我希望** 编辑页面上有重新生成控件来签发新密钥
**以便** 轮换泄露或过期的密钥；旧密钥停止工作

#### AC1

```gherkin
Scenario: 重新生成使旧密钥失效
  Given 调用方 API 密钥"old-secret"存在
  When 管理员在编辑页面重新生成密钥
  Then 显示新密钥
  And"old-secret"被拒绝，返回 errors.caller_unauthorized
  And 新密钥认证调用方
  And 新密钥写入 CallerApiKey.secret
```

### 用户故事 4 — 删除调用方 API 密钥

**作为** 管理员
**我希望** 删除密钥
**以便** 已退役的调用方不再能调用智能体

#### AC1

```gherkin
Scenario: 已删除的密钥无法调用智能体
  Given 调用方 API 密钥存在
  When 管理员删除该密钥
  Then 密钥不再出现在列表中
  And 该密钥被拒绝，返回 errors.caller_unauthorized
```

### 用户故事 5 — 批量选择和删除调用方 API 密钥

**作为** 管理员
**我希望** 在列表上选择一个或多个密钥（包括全选）并在确认后删除它们
**以便** 无需逐个打开每个密钥即可退役多个调用方

#### AC1

```gherkin
Scenario: 全选勾选列表上的每个密钥
  Given 已登录管理员查看两个调用方 API 密钥
  When 管理员勾选全选
  Then 两行复选框均被勾选
  And 批量删除已启用
```

#### AC2

```gherkin
Scenario: 确认批量删除后密钥被删除且请求被拒绝
  Given 两个调用方 API 密钥存在
  And 已登录管理员已选中两个密钥
  When 管理员确认批量删除
  Then 这些密钥不再出现在列表中
  And 两个密钥均被拒绝，返回 errors.caller_unauthorized
```

#### AC3

```gherkin
Scenario: 空选择不删除
  Given 已登录管理员查看调用方 API 密钥
  And 没有行被勾选
  Then 批量删除已禁用
  And 空 ids 列表的批量删除被拒绝，返回 errors.invalid_input
```

#### AC4

```gherkin
Scenario: 未登录的批量删除被拒绝
  Given 访客未登录
  When 访客发送带密钥 id 的 DELETE /api/admin/api-keys
  Then 密钥未被删除
  And 响应为 errors.session_expired
```

---

## `places-agent-admin-landing` — 管理员落地页

类别：**app**。成功登录后的首个页面。页面外壳：左侧导航加头部。所有页面外壳文案为 i18n 键。已登录的**用户名**为插值数据，而非硬编码文案。

### 用户故事 1 — 登录后的左侧导航

**作为** 管理员
**我希望** 落地页有左侧导航，指向已登录区域（API 密钥、用户及其他管理区域）
**以便** 登录后可以在管理应用中移动

#### AC1

```gherkin
Scenario: 落地页显示左侧导航
  Given 管理员已登录
  When 管理员到达落地页
  Then 显示左侧导航
  And 包含 API 密钥和用户的已登录目标
  And 导航标签使用 i18n 键
```

#### AC2

```gherkin
Scenario: 未登录访客不显示落地页外壳
  Given 访客未登录
  When 访客尝试打开落地页
  Then 带左侧导航的落地页不显示
  And 访客被引导去登录
```

### 用户故事 2 — 头部问候语和指令链接

**作为** 管理员
**我希望** 落地页头部显示智能体指令链接（功能 18）和包含我用户名的问候语
**以便** 我知道谁已登录，并可以在不离开外壳的情况下打开设置帮助

#### AC1

```gherkin
Scenario: 头部问候已登录用户名并链接到指令
  Given 已登录用户名为"admin"
  When 管理员在落地页上
  Then 头部显示键 admin.landing.hello，插值用户名"admin"
  And 头部显示键 admin.landing.instructions_link
  And 该链接打开智能体指令
```

---

## `places-agent-admin-instructions` — 智能体指令

类别：**app**。调用 **places.agent-mate.ai** 的说明（HTTP API、MCP、调用方 API 密钥、智能体 id `places-agent`）。仅两个入口：公开首页和登录后落地页头部。页面文案为 i18n 键（`EN`、`CN`、`HK`、`TW`）。机器 id `places-agent` 不翻译。

### 用户故事 1 — 指令页面内容

**作为** 访客或管理员
**我希望** 指令页面说明如何调用 places.agent-mate.ai（HTTP 和 MCP、如何发送调用方 API 密钥，以及智能体 id 为 `places-agent`）
**以便** 无需猜测 URL、头部或 MCP 服务器名称即可连接调用方

#### AC1

```gherkin
Scenario: 指令涵盖 HTTP、MCP 和调用方 API 密钥
  When 访客打开智能体指令页面
  Then 页面说明如何通过 HTTP 调用 places.agent-mate.ai
  And 页面说明如何通过 MCP 调用
  And 页面说明如何发送调用方 API 密钥
  And 页面说明智能体 id 为 places-agent
  And 页面文案使用 i18n 键
  And 字符串 places-agent 不被翻译的目录值替换
```

### 用户故事 2 — 从公开首页入口

**作为** 访客
**我希望** 公开首页（功能 14）链接到此指令页面
**以便** 登录前可以阅读设置帮助

#### AC1

```gherkin
Scenario: 首页链接到指令
  Given 访客在公开首页
  When 访客跟随 admin.home.instructions_link
  Then 显示智能体指令页面
```

### 用户故事 3 — 从落地页头部入口

**作为** 管理员
**我希望** 登录后落地页头部（功能 16）链接到此指令页面
**以便** 登录后可以打开相同的帮助

#### AC1

```gherkin
Scenario: 落地页头部链接到相同指令
  Given 管理员在登录后落地页
  When 管理员跟随 admin.landing.instructions_link
  Then 显示与公开首页相同的智能体指令页面
```

### 用户故事 4 — 智能体能力

**作为** 访客或管理员
**我希望** 指令页面列出智能体能力（工具、仅 HTTP 聊天、Tripadvisor 丰富化）
**以便** 在接入 HTTP 或 MCP 前了解 places-agent 能做什么

#### AC1

```gherkin
Scenario: 指令列出智能体能力
  When 访客打开智能体指令页面
  Then 智能体能力部分在目录中排第一
  And 能力以表格形式展示
  And 该部分以字面量形式列出 search_restaurants、search_places、get_place_details、geocode、navigate 和 plan_itinerary
  And 该部分列出 Place chat 和 Tripadvisor.enrich
  And Place chat 渠道为仅 HTTP，使用 POST /v1/chat
  And Tripadvisor.enrich 渠道为仅 HTTP
  And 能力正文使用 i18n 键
```

---

## `places-agent-admin-i18n` — 管理应用 i18n

类别：**app**。四种产品语言环境的管理 Web 应用目录和邮件。不替代功能 13（智能体输出给调用方）。

### 用户故事 1 — 四种语言环境目录

**作为** 管理员
**我希望** 每个管理应用标签、按钮、空状态、错误、通知和邮件均从 `EN`、`CN`、`HK` 和 `TW` 的 i18n 键解析
**以便** 运营商 UI 不锁定于单一语言，且 `HK` vs `TW` 用语保持不同

#### AC1

```gherkin
Scenario Outline: 管理页面外壳在每种语言环境中解析
  Given 管理应用语言环境为 <locale>
  When 访客打开公开首页
  Then 控件从 admin.home.login 等键解析
  And 显示文字为 <locale> 目录，HK 和 TW 不视为相同

  Examples:
    | locale |
    | EN     |
    | CN     |
    | HK     |
    | TW     |
```

#### AC2

```gherkin
Scenario: 邀请和重置邮件使用键
  Given 管理员语言环境为 CN
  When 发送密码重置邮件
  Then 邮件正文从 CN 的 i18n 键构建（或 EN 再到键本身）
  And 重置链接为绝对设置密码 URL
  When 发送邀请邮件
  Then 邀请链接为绝对 accept-invite URL
```

### 用户故事 2 — 切换语言环境

**作为** 管理员
**我希望** 在 `EN`、`CN`、`HK` 和 `TW` 之间切换管理应用
**以便** 以我能读懂的变体工作

#### AC1

```gherkin
Scenario: 管理员从 EN 切换到 HK
  Given 管理应用显示 EN
  When 管理员切换语言环境到 HK
  Then 后续页面使用 HK 目录
```

### 用户故事 3 — 缺失翻译回退

**作为** 管理员
**我希望** 缺失的目录条目回退到 `EN`，再到键本身，而不崩溃页面
**以便** 不完整的翻译不阻碍登录或密钥管理

#### AC1

```gherkin
Scenario: 缺失的 CN 条目在不崩溃的情况下回退
  Given 选中语言环境 CN
  And 管理应用键无 CN 条目
  When 显示该页面
  Then 如果存在则使用 EN 文案
  And 如果 EN 也缺失则显示键本身
  And 页面保持可用
```

---

## `places-agent-bilingual-output` — 双语输出

类别：**agent**。四种产品语言环境下的用户可见智能体输出（聊天、错误、供展示的地点卡文本、行程文案）。调用方传递语言环境 id。这不是地图供应商选择，也不是 HTTP vs MCP。

### 用户故事 1 — 四种语言环境之一的输出

**作为** 调用方
**我希望** 请求 `EN`、`CN`（简体中文）、`HK`（繁体中文，香港方言）或 `TW`（繁体中文，台湾方言）的智能体输出
**以便** 旅行者看到他们所读变体的文案，而非另一地区的繁简转换

#### AC1

```gherkin
Scenario Outline: 用户可见智能体文案在单一语言环境中
  Given 调用方请求输出语言环境 <locale>
  When 发生用户可见的空搜索结果
  Then 结果键为 errors.empty_results
  And 显示文案为该键的 <locale> 目录，而非另一地区的繁简转换

  Examples:
    | locale |
    | EN     |
    | CN     |
    | HK     |
    | TW     |
```

#### AC2

```gherkin
Scenario: HK 和 TW 目录用语不同
  Given errors.empty_results 的 HK 和 TW 目录均存在
  When 调用方先后请求 HK 和 TW 进行相同的空搜索
  Then 两者均使用键 errors.empty_results
  And HK 用语不要求与 TW 用语相同
```

### 用户故事 2 — 双语对

**作为** 调用方
**我希望** 从四种语言环境中请求**双语**对（例如 `CN`+`EN` 或 `HK`+`EN`）
**以便** 当产品需要两种变体时，同一回复可显示两种

#### AC1

```gherkin
Scenario: 同一回复的 CN 和 EN 双语对
  Given 调用方请求双语输出 CN 和 EN
  When 发生用户可见的空搜索结果
  Then 结果包含键 errors.empty_results
  And 该键的 CN 文案和 EN 文案均存在
```

### 用户故事 3 — 不支持或缺失的语言环境

**作为** 调用方
**我希望** 未知语言环境 id 或缺失翻译时回退到 `EN` 再到键本身，必要时附带跳过/原因键
**以便** 无效语言环境不导致整个搜索或聊天轮次失败

#### AC1

```gherkin
Scenario: 未知语言环境回退
  Given 调用方请求输出语言环境"XX"
  When 调用方搜索餐厅
  Then 搜索仍然完成
  And 用户可见文案回退到 EN 再到键本身
```

#### AC2

```gherkin
Scenario: 缺失目录条目在不导致轮次失败的情况下回退
  Given 请求语言环境 CN
  And 某消息键无 CN 条目
  When 显示该消息
  Then 如果存在则使用 EN 文案
  And 如果 EN 也缺失则使用键本身
  And 搜索或聊天轮次不因缺失翻译而失败
```

### 用户故事 4 — Open-Meteo 天气文案已翻译

**作为** 调用方
**我希望** Open-Meteo 的天气条件以我请求的语言环境（`EN`、`CN`、`HK` 或 `TW`）显示
**以便** 旅行者在请求中文输出时不会看到英语 Open-Meteo 标签（例如"Slight rain showers"）

#### AC1

```gherkin
Scenario Outline: 天气条件使用目录，而非 Open-Meteo 英语
  Given Open-Meteo 返回 weather_code 80
  And 调用方请求输出语言环境 <locale>
  When 生成用户可见天气文本
  Then 条件键为 weather.wmo.80
  And 显示文案为该键的 <locale> 目录
  And 英语 Open-Meteo 短语"Slight rain showers"不显示，除非 <locale> 为 EN

  Examples:
    | locale |
    | EN     |
    | CN     |
    | HK     |
    | TW     |
```

#### AC2

```gherkin
Scenario: HK 和 TW 天气用语可以不同
  Given weather.wmo.80 在 HK 和 TW 目录中均存在
  When 调用方先后请求 HK 和 TW 的相同 weather_code 80
  Then 两者均使用键 weather.wmo.80
  And HK 用语不要求与 TW 用语相同
```

#### AC3

```gherkin
Scenario: 行程叙述不将英语天气粘贴到 CN 中
  Given Open-Meteo 返回 weather_code 80
  And 调用方请求输出语言环境 CN
  When 智能体撰写提及天气的行程或聊天叙述
  Then 天气用语与 weather.wmo.80 的 CN 目录匹配
  And 叙述不含该代码的英语 Open-Meteo 文档短语
```

---

# 供应商自动选择 — `places-agent-provider-auto`

**类别：** agent

作为**调用方**，当我搜索时不指定 `providers[]`，places-agent 会根据我的目的地和语言环境自动选择最佳供应商：

- **策略1**（Google + TripAdvisor 丰富化）：目的地在中国大陆以外，或语言环境为 EN/TW/HK
- **策略2**（AMAP）：目的地在中国大陆或香港

两种策略可同时适用（例如上海 + EN 语言环境 → Google + AMAP + TripAdvisor）。

### US1 — 中文地址自动选择 AMAP

**AC1**

Given caller 未传 providers[]
And location 为 "上海市南京西路"
When search_restaurants
Then 结果中 provider 包含 AMAP
And 所有结果 location.lat 在 30–32 范围, location.lng 在 120–122 范围

### US2 — 非中文地址自动选择 Google

**AC2**

Given caller 未传 providers[]
And location 为 "Tokyo Tower"
When search_places
Then 结果中 provider 为 GOOGLE_MAPS
And enrichProviders 包含 TRIPADVISOR

### US3 — 中文地址 + EN 语言环境同时使用两者

**AC3**

Given caller 未传 providers[]
And location 为 "上海市南京西路", locale 为 "EN"
When search_restaurants
Then 同时使用 GOOGLE_MAPS 和 AMAP

### US4 — 显式 providers 覆盖自动选择

**AC4**

Given caller 传 providers: ["AMAP"]
And location 为 "Tokyo Tower"
When search_restaurants
Then 仅使用 AMAP（自动选择不触发）

### US5 — 香港同时使用两者

**AC5**

Given location 坐标在香港范围 (lat ~22.28, lng ~114.17)
When search_restaurants
Then searchProviders 包含 GOOGLE_MAPS 和 AMAP

### US6 — 台湾仅使用 Google

**AC6**

Given location 为 "台北市信義區"
When search_places
Then searchProviders 仅包含 GOOGLE_MAPS（不注入 AMAP）

---

# 服务器稳定性 — `places-agent-server-stability`

**类别：** infra

### US1 — 安全 JSON 解析

**AC1**

Given 客户端发送 "not json" body 到 POST /mcp
When server 解析请求体
Then 返回 HTTP 400
And 服务进程不崩溃

### US2 — 优雅关机

**AC2**

Given server 正在监听端口
When SIGTERM 信号发送
Then server 停止接受新连接
And 10 秒内退出进程
And 日志包含 "SIGTERM received, shutting down"

### US3 — Session TTL 清理

**AC3**

Given SSE session 创建于 31 分钟前
And TTL 为 30 分钟
When 清理定时器触发
Then 该 session 从 SessionManager 中移除
And SessionManager.size 减少 1

---

# 照片与价格档 — `places-agent-photos-price`

**类别：** agent · **MVP-3b** · Feature **24**

**作为** 调用方应用  
**我希望** 搜索结果卡片带有照片 URL 与归一化价格档  
**以便** 用户在列表中快速判断观感与消费水平

### US1 — Google / AMAP 照片

**AC1**

Given 供应商 live 返回含 photos 的 POI  
When `search_restaurants` 或 `search_places`  
Then 卡片含 `photos[]`（URL 可请求）  
And 无图时省略 `photos`（不为空数组）

### US2 — 价格档归一化

**AC2**

Given Google `priceLevel` 或 AMAP `cost` 可用  
When 映射为 PlaceCard  
Then `price_level` 为 `$` / `$$` / `$$$`（或产品约定档位）  
And 不可用时省略字段，不编造

---

# Geocode-first 与 Directions fallback — `places-agent-geocode-directions`

**类别：** agent · **MVP-3c** · Feature **25**

**作为** 调用方  
**我希望** provider 选择基于可靠地理编码，且 Google Directions 在直连失败时可走 Worker  
**以便** 中国/海外判定准确、路线工具不因单点失败而全挂

### US1 — Geocode-first（无 CJK 占比捷径）

**AC1**

Given caller 未显式传 `providers[]`  
When 解析目的地  
Then 使用 Geocode 结果（地址文本优先于粗坐标）决定 provider 策略  
And 不再使用「CJK 字符占比」作为主规则

### US2 — Directions Worker fallback

**AC2**

Given Google Directions 直连失败或 `GOOGLE_DIRECT_FORCE_FAIL=1`  
When 调用导航/路线相关方法  
Then 回退到 GMaps Worker MCP  
And 成功时仍返回可用路线结果

---

# 语言路由与搜索关键词 — `places-agent-language-keywords`

**类别：** agent · **MVP-4a** · Feature **26**

**作为** 多语言调用方  
**我希望** 工具定义与搜索关键词按 locale 路由  
**以便** 中英文 prompt/关键词不混杂，本地化搜索更准

### US1 — Language router

**AC1**

Given 请求 locale 为 `CN` / `EN` / `HK` / `TW`  
When 组装 chat/tool 定义或搜索  
Then 使用对应语言路由（含 CJK 检测辅助）  
And tool defs 经 locale 感知 API 提供

### US2 — 关键词映射、去硬编码

**AC2**

Given 行程或搜索需要「餐厅/景点」类查询词  
When 构建搜索 query  
Then 从多语言关键词表取值  
And timed itinerary 路径不再内嵌大段硬编码中文词

---

# 搜索缓存与并行 — `places-agent-perf-cache`

**类别：** agent · **MVP-4b** · Feature **27**

**作为** 调用方  
**我希望** 重复 geocode/搜索更快，行程规划减少串行等待  
**以便** 常见路径接近 <15s 体验目标

### US1 — 短期缓存

**AC1**

Given 相同 address 在 TTL 内再次 geocode  
When 第二次请求  
Then 命中 geocode 缓存（不重复打供应商）

Given 相同 query+near 在 TTL 内再次搜索  
When 第二次请求  
Then 命中 search 缓存

### US2 — 并行搜索

**AC2**

Given 规划含景点与餐厅（或多天）  
When `plan_itinerary`（legacy 或 llm 路径的搜索阶段）  
Then 独立搜索并行执行  
And 不无故串行等待

**验收备注：** 端到端 <5s / <15s / 二次 <1s 的 live 勾选见 [`0.refactor-plan.md`](./0.refactor-plan.md) MVP-4b；CI 默认 fixture。

---

# Admin API 加固 — `places-agent-admin-hardening`

**类别：** app · **MVP-5** · Feature **28**

**作为** 运营商  
**我希望** Admin API 错误可预期、页面有 Error Boundary、重置/会话更安全  
**以便** 后台操作稳定、可诊断

### US1 — Prisma 错误映射

**AC1**

Given DELETE 不存在的资源  
When Admin API  
Then HTTP 404 + `{ error: { key } }`

Given 违反唯一约束的 PATCH/POST  
When Admin API  
Then HTTP 409 + 稳定 error key

### US2 — Error Boundary

**AC2**

Given Admin 子树渲染抛错  
When 打开 `/admin/*`  
Then 显示可恢复的错误 UI  
And 不白屏

### US3 — Reset TTL 与 session iat

**AC3**

Given 密码重置 token  
When 签发  
Then 过期时间为 **4h**

Given 登录会话  
When 签发 cookie payload  
Then 含 `iat`

### US4 — E2E

**AC4**

Given 邀请流  
When E2E  
Then 邀请 → 设密码 → 登录 通过

Given 密码重置全流程 E2E  
Then 申请重置 → seed token → 设新密码 → 登录 通过（`e2e/test_admin.py` + `scripts/seed-e2e-reset.ts`，MVP-7）

---

# Prompt 组装器 — `places-agent-prompt-assembler`

**类别：** agent · **MVP-6** · Feature **29**  
（Claude Code Plan Feature 24）

**作为** 智能体运行时  
**我希望** 按 locale + intent 拼接 base 与 overlay  
**以便** 中英文 system prompt 分离且场景指引可组合

### US1 — base + overlay

**AC1**

Given locale=`EN`、intent=`meal`  
When 组装 system prompt  
Then 加载 `prompts/base.en.md` + `prompts/overlays/meal-search.md`

Given locale=`CN`、intent=`itinerary`
When 组装
Then 加载 `base.zh.md` + `overlays/itinerary-planner.md`

Given locale=`HK`、intent=`place`
When 组装
Then 加载 `base.zh.md` + `overlays/place-search.md`

Given locale=`EN`、intent=`chat`
When 组装
Then 加载 `base.en.md`（chat 无额外 overlay，仅 base）

### US2 — budget / time-of-day 内联

**AC2**

Given `budget` 或 `timeOfDay` 有值  
When 组装  
Then 追加内联常量提示（**无**独立 `budget.md` / `time-of-day.md` 文件）

### US3 — 接入 loop

**AC3**

Given chat/agent loop  
When 构建 system prompt  
Then 经 prompt-assembler，而非手工拼接旧单文件 chat prompt

---

# LLM 行程规划 — `places-agent-itinerary-llm`

**类别：** agent · **MVP-6** · Feature **30**  
（Claude Code Plan Feature 25）

**作为** 调用方  
**我希望** 行程由单次 LLM 规划并经 Zod 校验，失败可回退  
**以便** 理由更自然，同时保持结构安全

### US1 — 单 LLM + Zod

**AC1**

Given `ITINERARY_MODE=llm` 且 detail=timed  
When `plan_itinerary`  
Then 代码搜索候选 → LLM 规划+自查 → Zod  
And 每个 block 含推荐理由  
And name 必须落在候选列表

### US2 — 重试与 fallback

**AC2**

Given Zod 失败  
When 首次失败  
Then 带着错误反馈重试 LLM 一次

Given 两次仍失败或超时  
Then fallback legacy 路径 + outcomeKey

### US3 — 开关默认值（文档诚实）

**AC3**

Given 未设置环境变量  
When 读取模式  
Then 默认为 `llm`（`process.env.ITINERARY_MODE ?? "llm"`）  
And 旧路径测试须显式设置 `ITINERARY_MODE=legacy`

### US4 — 范围过宽

**AC4**

Given 仅国家级/大洲级地址且无可用城市  
When discover/plan  
Then 返回 `errors.location_too_broad`（或等价 key），不盲搜

---

# 行程 MCP 拆分 — `places-agent-itinerary-mcp-split`

**类别：** agent · **MVP-6** · Feature **31**

**作为** MCP 客户端  
**我希望** 先 `discover_places` 再按天 `arrange_day`  
**以便** 长行程可逐步返回、控制 token

### US1 — MCP 工具

**AC1**

Given MCP `tools/list`  
When 查询  
Then 包含 `discover_places` 与 `arrange_day`（及既有 `plan_itinerary`）

Given `discover_places`  
When 调用成功  
Then 返回候选（每类 ≤8）+ weather；候选不含 hours/price 细节（token 优化）

Given `arrange_day`  
When 调用成功  
Then 返回单天 blocks（含 reason）；可选 `from_origin` / `to_destination`

### US2 — HTTP 对等

**AC2**

Given HTTP `POST /v1/discover_places` 与 `POST /v1/arrange_day`  
When 使用有效 caller Bearer  
Then 返回与 MCP 同义的 JSON envelope（`agent`、`ok`、`data`）  
And `plan_itinerary` 的 HTTP 路径保持可用

### US3 — 配图

**AC3**

Given 候选含 photos  
When 格式化行程 blocks  
Then 按 name 匹配挂回 `block.photos`  
And 封面图可为 Day1 首个 attraction 的首张 photo（零额外供应商调用）
