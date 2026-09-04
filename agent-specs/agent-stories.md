# places-agent — 用户故事

**places-agent** (`places.agent-mate.ai`) 的高层级产品待办列表。

调用方通过机器 id `places-agent`（MCP `serverInfo.name`，HTTP JSON `agent`）来标识此服务。该字符串不进行本地化。主机名为 `places.agent-mate.ai`。

- **agent** — 地点网关和工具（HTTP + MCP）。**不**拥有面向消费者的 Web UX（what2eat / where2play 屏幕保留在各自应用中）。
- **app** — 同一主机上的运营管理 Web 应用：公开首页、登录、登录后落地页（左侧导航 + 头部）、管理员、调用方 API 密钥、智能体指令、i18n。


| 相关文档                | 位置                                                                                                                           |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 家族目标（简述）            | `[../../workspace-specs/1.req-specs.md](../../workspace-specs/1.req-specs.md)`                                               |
| 架构与信任               | `[../../workspace-specs/2.architecture.md](../../workspace-specs/2.architecture.md)`                                         |
| 供应商能力矩阵             | `[../../workspace-specs/knowledge/maps/places-capabilities.md](../../workspace-specs/knowledge/maps/places-capabilities.md)` |
| 管理 UI               | `[agent-design.md](./agent-design.md)` §12                                                                                   |
| 管理 UI 原型            | `[ui-mockup/](./ui-mockup/)`                                                                                                 |
| 测试策略                | `[agent-test-plan.md](./agent-test-plan.md)`                                                                                 |
| 用户测试用例（ChatBox MCP） | `[agent-test-plan.md](./agent-test-plan.md)` §13–§19                                                                         |
| 技术设计                | `[agent-design.md](./agent-design.md)`                                                                                       |


**状态：** MVP-1 / **MVP-2** 已验收（2026-08-19）。**MVP-3a～MVP-15** 见 `[0.refactor-plan.md](./0.refactor-plan.md)`。**MVP-16** F63/64/65 部分 Done。**MVP-17** P0–P2 代码切片。**MVP-18** Feature **74–77** / **71–72** 代码 **Done**（2026-09-02；usable 签收待用户确认；P2 F68/70/37f 未做）。

**相关：** `[performance.md](./performance.md)`（L1/L2/L3、Mode H、§11 Progressive 交叉引用 where2play）· [ADR-037](../../workspace-specs/adr/ADR-037-where2play-plan-l2-quanzil.md) · [ADR-038](../../workspace-specs/adr/ADR-038-discover-places-quality.md) · [ADR-044](../../workspace-specs/adr/ADR-044-orizn-visa-rest-adapter.md) · [ADR-046](../../workspace-specs/adr/ADR-046-trip-store-pg-memory-fetch.md) · where2play `[2play-stories.md](../../3.where2play/2play-specs/2play-stories.md)` features **31–33**, **38–39**

### Given-When-Then 约定

每个场景描述一种行为。每个功能标记为 **agent**（网关/工具）或 **app**（管理 Web 应用）。用户可见文案使用 **i18n 键**（`EN` 默认；`CN`、`HK`、`TW`）。测试断言键（及插值数据），而非单一语言的句子。协议 id 不进行本地化。

如何自动化这些场景：`[agent-test-plan.md](./agent-test-plan.md)`。

**AC 状态：** MVP-2 **已验收** 2026-08-19（运营商确认可用）。供应商诚实性（[ADR-021](../../workspace-specs/adr/ADR-021-live-vendor-no-fixture.md)，`[agent-test-plan.md](./agent-test-plan.md)` §1.1）：AMAP 搜索 **live-honest**；Google 搜索 **live-honest**；功能 8 Tripadvisor 丰富化 **live-honest**；功能 9 行程天气 **live-honest**。功能 9 **已计时**：中文组合查询（US11 AC7）；走廊图钉搜索（US11 AC2）——live T05 G01 第 3 天比第 1 天更靠近目的地；仅 AMAP 的 D01 返回了带有 `source: directions` 的访问记录。功能 2 和 10：HTTP + fixture CI；聊天仅 HTTP（[ADR-020](../../workspace-specs/adr/ADR-020-http-only-chat-and-enrich.md)）。ChatBox TC-C 已推迟（[ADR-019](../../workspace-specs/adr/ADR-019-http-first-user-test-automation.md)）。质量门控：[ADR-024](../../workspace-specs/adr/ADR-024-quality-gates-typescript-7.md)。不得将 AC 状态写为 **implemented** 来替代 `live-honest` / `fail-closed` / `fixture-only`。

**默认前提条件：** 除非场景另有说明：调用方提供有效的调用方 API 密钥；请求的地图供应商已配置。

## 角色


| 角色      | 身份                            | 价值                       |
| ------- | ----------------------------- | ------------------------ |
| 餐厅应用调用方 | what2eat BFF                  | 无需自行维护地图供应商即可搜索餐厅和详情     |
| 行程应用调用方 | where2play BFF                | 地点搜索、详情、导航、行程引擎          |
| 智能体主机   | MCP 主机（如 chatboxai.app）       | 通过 MCP 使用相同工具；自然语言地点聊天   |
| 旅行者     | 上述调用方的终端用户                    | 查找地点、打开地图、跟随行程计划         |
| 运营商     | 部署 places-agent 的人            | 凭据、地图供应商可用性、无目的地强制供应商选择  |
| 管理员     | places.agent-mate.ai 管理应用的运营商 | 登录、邀请管理员、签发和撤销调用方 API 密钥 |




## 术语（避免混用）


| 术语             | 含义                                                                     | 不是这个                                                 |
| -------------- | ---------------------------------------------------------------------- | ---------------------------------------------------- |
| **地图供应商**      | AMAP、Google Maps、Tripadvisor——智能体所查询的对象。请求字段保持 `providers[]`。          | HTTP vs MCP；驾车/公交路线                                  |
| **地点卡来源**      | 结果上的 `sources[]`：卡片来自哪个供应商，包含 logo、深度链接；可选合并重复项                        | 要调用哪些供应商（即地图供应商选择）                                   |
| **访问渠道**       | 调用方访问智能体的方式：HTTP API 或 MCP                                             | 将旅行者带到某个地点                                           |
| **路线导航**       | 路线、预计到达时间或前往某地点的地图应用深度链接（功能 4）                                         | HTTP vs MCP                                          |
| **调用方 API 密钥** | 在管理应用中签发的密钥；调用方发送此密钥以使用 HTTP/MCP 工具                                    | 地图供应商密钥（AMAP / Google / Tripadvisor），此类密钥不会出现在本 UI 中 |
| **智能体 id**     | 机器 id `places-agent`。调用方在 MCP `serverInfo.name` 和 HTTP 字段 `agent` 中可见。 | 主机名 `places.agent-mate.ai`；ChatBox 显示标题；工具名称前缀       |
| **类别** `agent` | 网关 / 工具核心故事                                                            | 管理 Web 应用                                            |
| **类别** `app`   | places.agent-mate.ai 上的管理 Web 应用                                       | what2eat / where2play 产品屏幕                           |
| **输出语言环境**     | 产品 id `CN`、`HK`、`TW`、`EN`（参见 i18n 表）。由调用方或管理员选择。                       | 地图供应商选择；搜索目的地                                        |




## i18n（全产品）

所有**调用方可见**和**管理应用**字符串（标签、按钮、空状态、错误、邮件、通知、聊天回复、供展示的行程文案）均为 **i18n 键**，而非某一语言的文案。

支持的输出语言环境（四种，非两种）：


| 产品 id | BCP 47  | 语言         |
| ----- | ------- | ---------- |
| `EN`  | `en`    | 英语（默认）     |
| `CN`  | `zh-CN` | 简体中文（大陆用语） |
| `HK`  | `zh-HK` | 繁体中文，香港方言  |
| `TW`  | `zh-TW` | 繁体中文，台湾方言  |


`HK` 和 `TW` 均使用繁体字，但**用语不同**。不得将它们视为 `CN` 的繁简转换。

- 默认语言环境：`EN`
- 对语言环境敏感的值（日期、时间、数字、距离、货币/价格信号）使用所请求语言环境的本地化格式
- 缺少翻译 → 回退到 `EN`，再回退到键本身；绝不因目录条目缺失而使请求失败
- 协议 id（`places-agent`、`AMAP`、`GOOGLE_MAPS`、`TRIPADVISOR`、`OPEN_METEO`、`CN` / `HK` / `TW` / `EN`、偏好 id）、默认管理员用户名 `admin`、默认管理员邮箱 `me@ethanhuang.com` 以及运营商日志不进行本地化
- Open-Meteo 天气**标签**进行本地化：`weather_code` → 所请求语言环境中的键 `weather.wmo.{code}`。不得在 `CN` / `HK` / `TW` 中显示英语 Open-Meteo 文档字符串（ADR-014）
- 管理应用目录：功能 19。智能体工具/聊天/行程输出：功能 13。



## 非目标（本待办列表）

- what2eat / where2play 屏幕、品牌，或产品 OPENAI_CN
- 硬规则"搜索目的地在中国大陆 ⇒ 仅 AMAP"
- 按搜索目的地切换 LLM
- 部署拓扑、Portainer stacks、umbrella git 布局
- 管理用户的公开自注册（注册已禁用；仅限邀请）
- 在管理应用中编辑或展示地图供应商密钥（AMAP / Google / Tripadvisor）

---



## MVP 计划（两个切片，按智能体能力划分）

切片遵循**智能体能力**，而非"管理 vs 网关 vs 智能"。每个 **app** 功能（14–19）均属于 **MVP-1**。14–19 中任何一项未完成，不得启动 MVP-2。

**能力**（工具 + 聊天循环）。共用基础设施列在首个需要它的能力下。


| 能力                  | 调用方获得的内容                             | 功能                                  | 切片        |
| ------------------- | ------------------------------------ | ----------------------------------- | --------- |
| **运营**              | 登录、邀请、签发密钥、语言环境配置、指令页面               | **14, 15, 16, 17, 18, 19**（所有管理 UI） | **MVP-1** |
| **调用**              | HTTP + MCP 作为 `places-agent`；调用方密钥认证 | **11, 12**                          | **MVP-1** |
| **搜索餐厅**            | 带卡片、来源、地理编码、深度链接、语言环境的餐厅发现           | **1, 3, 4, 5, 6, 7, 13**            | **MVP-1** |
| **搜索地点**            | 非餐厅 POI 发现（相同卡片/供应商合约）               | **2**                               | **MVP-2** |
| **规划行程**            | 多站点计划 + Open-Meteo 天气标签              | **9**                               | **MVP-2** |
| **Tripadvisor 丰富化** | 按名称+位置可选评分/内容                        | **8**                               | **MVP-2** |
| **地点聊天**            | 在已发布工具上通过 OPENAI_CN 进行自然语言工具循环         | **10**                              | **MVP-2** |



| 切片                                 | 结果                                                                                                                      | 功能                                                |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| **MVP-1 — 运营、调用、搜索餐厅**             | 管理 UI 完整。密钥在 HTTP 和 MCP 上均可用。what2eat 可以搜索餐厅、打开详情并获取地图链接。无 OPENAI_CN 循环。                                                  | **14–19** · **11, 12** · **1, 3, 4, 5, 6, 7, 13** |
| **MVP-2 — 地点、行程、丰富化、聊天**           | where2play 可搜索 POI 并请求结构化行程（功能 13 中的天气键）。卡片上的 Tripadvisor 匹配。ChatBox 自然语言聊天复用工具核心。                                      | **2, 9, 8, 10**                                   |
| **MVP-3a — 稳定与自动供应商**              | 服务器稳定 + 目的地/语言驱动的 provider 自动选择                                                                                         | **20, 21**                                        |
| **MVP-3b — 卡片富化**                  | 搜索结果 Photos + Price Level                                                                                               | **24**                                            |
| **MVP-3c — Resolver / Directions** | Geocode-first provider + Directions Worker fallback                                                                     | **25**                                            |
| **MVP-4a — 语言与关键词**                | Language router + 多语言搜索关键词                                                                                              | **26**                                            |
| **MVP-4b — 性能**                    | Geocode/search 缓存 + itinerary 并行（目标 <15s）                                                                               | **27**                                            |
| **MVP-5 — Admin 加固**               | API 错误映射、Error Boundary、reset 4h、session iat；邀请 E2E 已有，密码重置 E2E 待补                                                      | **28**                                            |
| **MVP-6 — Prompt + LLM 行程**        | Prompt assembler、LLM itinerary+Zod、MCP `discover_places`/`arrange_day`                                                  | **29, 30, 31**                                    |
| **MVP-7 — 收尾**                     | HTTP discover/arrange、password-reset E2E、`make quality`（Branches≥80%）、Guide + release-bot 部署清单；行程 P0 止损 + discover 质量门面 | **32, 33**（及收尾项）                                  |
| **MVP-8 — 行程优化**                   | Arm A 种子增强、Mode H handoff、L2 硬必去、真交通进时间线、MCP session                                                                    | **34–38**                                         |
| **MVP-9 — 收尾与硬闸**（待批，未开工） | tsc 技术债清零恢复 quality 门、MCP arrange 服务端硬闸、opt-in 分层 + runbook、arrange 输出校验三件套（Lisbon 4D 样本回归） | **39–42**                                         |
| **MVP-11 — 签证知识**（规格已确定，未开工） | Orizn REST adapter + `visa_requirement` 工具（HTTP + MCP）；按护照/目的地返回签证类型、材料、流程；配额缓存与 fail-closed 诚实 | **48**                                            |


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
- **where2play 初排（ADR-037）：** BFF 调 agent **仅** `discover_places`；L2 在 where2play OPENAI_CN。不得将「2play 必须调 `plan_itinerary`」写进验收。
- Tripadvisor 丰富化在搜索/详情上可选；切勿将 Google `place_id` 作为 Tripadvisor id 传递。
- 自然语言聊天是在 MVP-1 和本切片工具上的 OPENAI_CN 循环。不得发明第二个工具核心。

**切片内构建顺序：** 每次将一个用户故事推至 DoD（`[agent-design.md](./agent-design.md)` §16）。建议 MVP-1：**14 → 15 → 16 → 19 → 18 → 17 → 12 → 11 → 6 → 5 → 1 → 3 → 7 → 4 → 13**。MVP-2：**2 → 9 → 8 → 10**。MVP-3a：**20 → 21**。MVP-3b→6：**24 → 25 → 26 → 27 → 28 → 29 → 30 → 31**。MVP-7：**32 → 33**。MVP-8：**按下方开发计划 Wave A→E**（默认 **34 → 36 → 35 → 37**；**38** 可与 A/B 并行）。where2play Progressive §11-P0 已交付；2play **31–33** 依赖本仓库 **35 / 流式契约 / 37**。

---



# 第一部分 — 产品待办列表

**列说明：** `#` = 功能号（稳定 id，不随表序变）；`MVP` = 切片标签（**MVP-1**…**MVP-8**，含 **MVP-3a** 等子切片）；表内按 MVP 批次排列，同批内按功能号。`itinerary 优化相关` = 与行程发现/排程/交通/MCP 行程通道相关（含 `[performance.md](./performance.md)`）。`完工情况` = **Done**（已交付可测）/ **ToDo**（未做或共识待 merge）。


| #   | 类别    | 功能名称                                | 功能代码                                  | 描述                                                                                                                              | 验收标准 | MVP    | itinerary 优化相关 | 完工情况 |
| --- | ----- | ----------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---- | ------ | -------------- | ---- |
| 1 | agent | 餐厅搜索 | `places-agent-search-restaurants` | 通过调用方请求的供应商按位置和条件搜索餐厅 | 见下文 | **MVP-1** | — | Done |
| 3 | agent | 地点详情 | `places-agent-place-details` | 使用供应商原生地点 id 获取已知地点的详情 | 见下文 | **MVP-1** | — | Done |
| 4 | agent | 导航助手 | `places-agent-navigate` | 为地点返回不含密钥的导航深度链接和 URL；行程时间线真交通见 **37** | 见下文 | **MVP-1** | 是 | Done |
| 5 | agent | 地理编码 | `places-agent-geocode` | 按需对地址进行地理编码和反向地理编码，使搜索可从地址或图钉运行 | 见下文 | **MVP-1** | — | Done |
| 6 | agent | 地图供应商选择 | `places-agent-map-vendors` | 调用方传递要查询的**地图供应商**（`providers[]`）；智能体验证凭据和能力；不静默换供应商。`GOOGLE_MAPS` 先使用直连 REST，再使用 Cloudflare Worker MCP（ADR-017） | 见下文 | **MVP-1** | — | Done |
| 7 | agent | 地点卡来源 | `places-agent-card-sources` | 每张地点卡列出 `sources[]`；可选合并重复项；**应用**选择打开哪个地图深度链接 | 见下文 | **MVP-1** | — | Done |
| 11 | agent | HTTP API 和 MCP | `places-agent-http-mcp` | 通过 HTTP API（应用 BFF）和 MCP（智能体主机）提供相同工具；两种渠道均将服务标识为 `places-agent`；session 修复见 **38** | 见下文 | **MVP-1** | 是 | Done |
| 12 | agent | 调用方 API 密钥认证 | `places-agent-caller-trust` | 仅向通过**调用方 API 密钥**认证的调用方提供 HTTP/MCP 服务；地图供应商密钥保留在智能体上；用户可见错误使用 i18n 键 | 见下文 | **MVP-1** | — | Done |
| 13 | agent | 双语输出 | `places-agent-bilingual-output` | 智能体用户可见输出支持 `EN` / `CN` / `HK` / `TW`；单语言环境或双语对。Open-Meteo `weather.wmo.*` 键随功能 9 一起提供 | 见下文 | **MVP-1** | — | Done |
| 14 | app | 管理员首页 | `places-agent-admin-home` | 公开首页：指向智能体指令（功能 18）的链接和管理员登录控件 | 见下文 | **MVP-1** | — | Done |
| 15 | app | 管理员登录和用户 | `places-agent-admin-users` | 管理员登录、默认管理员、通过 Resend 重置密码和邀请；公开注册已禁用 | 见下文 | **MVP-1** | — | Done |
| 16 | app | 管理员落地页 | `places-agent-admin-landing` | 登录后：左侧导航；头部含智能体指令链接和已登录用户名问候语 | 见下文 | **MVP-1** | — | Done |
| 17 | app | 调用方 API 密钥 | `places-agent-admin-api-keys` | 创建、编辑、重新生成、删除调用方 API 密钥；复制密钥 | 见下文 | **MVP-1** | — | Done |
| 18 | app | 智能体指令 | `places-agent-admin-instructions` | 调用 places.agent-mate.ai 的方法；两个入口——公开首页链接和登录后头部链接 | 见下文 | **MVP-1** | — | Done |
| 19 | app | 管理应用 i18n | `places-agent-admin-i18n` | 管理 UI 和邮件支持 `EN` / `CN` / `HK` / `TW`；语言环境切换；缺失键回退 | 见下文 | **MVP-1** | — | Done |
| 2 | agent | 地点搜索 | `places-agent-search-places` | 以相同方式搜索非餐厅地点（景点、POI） | 见下文 | **MVP-2** | — | Done |
| 8 | agent | Tripadvisor 丰富化 | `places-agent-tripadvisor-enrich` | 按名称+位置匹配可选的 Tripadvisor 评分/内容；切勿将 Google `place_id` 作为 id 传递 | 见下文 | **MVP-2** | — | Done |
| 9 | agent | 行程规划 | `places-agent-plan-itinerary` | 多站点结构化行程（LLM/legacy）；**where2play 初排主路径不调本工具**（ADR-037：L1 `discover_places` + 调用方 OPENAI_CN L2）。MCP/HTTP 一站式仍可用 | 见下文 | **MVP-2** | 是 | Done |
| 10 | agent | 自然语言地点聊天 | `places-agent-nl-chat` | 旅行者以自然语言提问（可选文件/图片上传）；智能体在服务器 OPENAI_CN 上运行工具循环；where2play 助手走应用侧 OPENAI_CN（ADR-036），不转发本工具为默认 | 见下文 | **MVP-2** | — | Done |
| 20 | agent | 供应商自动选择 | `places-agent-provider-auto` | 智能体根据目的地+语言自动选择 provider 组合（策略1 Google+TA / 策略2 AMAP），caller 可覆盖 | 见下文 | **MVP-3a** | 是 | Done |
| 21 | infra | 服务器稳定性 | `places-agent-server-stability` | JSON 解析安全、graceful shutdown、session TTL 清理 | 见下文 | **MVP-3a** | — | Done |
| 24 | agent | 照片与价格档 | `places-agent-photos-price` | 搜索卡片返回 photos 与归一化 price_level（$/$$/$$$）；无图时省略字段 | 见下文 | **MVP-3b** | — | Done |
| 25 | agent | Geocode-first 与 Directions fallback | `places-agent-geocode-directions` | Provider 判定以 Geocode 为准；Google Directions 全方法支持 Worker MCP fallback | 见下文 | **MVP-3c** | 是 | Done |
| 26 | agent | 语言路由与搜索关键词 | `places-agent-language-keywords` | 按 locale/CJK 路由语言；搜索关键词多语言映射，去掉行程硬编码文案 | 见下文 | **MVP-4a** | 是 | Done |
| 27 | agent | 搜索缓存与并行 | `places-agent-perf-cache` | Geocode/search 短期缓存；行程餐食/多天搜索并行；端到端秒级目标见 performance（L2 LLM 等待另计） | 见下文 | **MVP-4b** | 是 | Done |
| 28 | app | Admin API 加固 | `places-agent-admin-hardening` | Prisma 错误→404/409、Admin Error Boundary、reset token 4h、session iat；邀请/密码重置 E2E | 见下文 | **MVP-5** | — | Done |
| 29 | agent | Prompt 组装器 | `places-agent-prompt-assembler` | base.{en,zh} + overlays 拼接系统 prompt；budget/time-of-day 内联；与 Mode H 共享见 **35** | 见下文 | **MVP-6** | 是 | Done |
| 30 | agent | LLM 行程规划 | `places-agent-itinerary-llm` | 单日/多日 LLM+Zod（`arrange_day` / `plan_itinerary`）；失败可降级。where2play L2 用**调用方** OPENAI_CN（ADR-037），本功能服务 MCP 与一站式 HTTP | 见下文 | **MVP-6** | 是 | Done |
| 31 | agent | 行程 MCP 拆分 | `places-agent-itinerary-mcp-split` | MCP+HTTP `discover_places` / `arrange_day`；与 `plan_itinerary` 并存；2play 主路径仅 L1 discover | 见下文 | **MVP-6** | 是 | Done |
| 32 | agent | 行程 MCP P0 止损 | `places-agent-itinerary-mcp-p0` | `date` nullish；arrange 入模 slim；MCP description 互斥/禁回灌（performance P0） | 见下文 | **MVP-7** | 是 | Done |
| 33 | agent | Discover 候选质量 | `places-agent-discover-quality` | L1 无 LLM：热门城 must-see seed、过滤、cluster 去重、池头多样性（ADR-038） | 见下文 | **MVP-7** | 是 | Done |
| 34 | agent | Discover 候选质量（Arm A 演进） | `places-agent-discover-arm-a` | 通用模板填池 + Google RELEVANCE 排序；must-see 由 LLM 从候选池推断（ADR-042/043：删城市种子 CATALOG）；不以 LLM 写 search query 为主路径（performance Q2） | 见下文 | **MVP-8** | 是 | Done |
| 35 | agent | Arrange Mode H handoff | `places-agent-arrange-host` | `execution=host`：返回 `system_prompt`/`user_prompt`/`candidates_slim`，本请求不调 LLM；宿主执行（ChatBox/Cursor/可选 2play）（performance Mode H） | 见下文 | **MVP-8** | 是 | Done |
| 36 | agent | L2 硬必去 | `places-agent-arrange-hard-must-see` | 行程级必去类必须出现在排程结果；LLM 漏排 → 硬失败重试一次；theme 门控 focus（仅 day_theme 命中才强制 focus）；删确定性注入（ADR-043 D9）（performance Q3） | 见下文 | **MVP-8** | 是 | Done |
| 37 | agent | 行程真交通 | `places-agent-itinerary-real-transit` | 将 `navigate`/directions 结果写入行程时间线（非仅 reason 估时）；2play L2 时间线消费（performance Q4） | 见下文 | **MVP-8** | 是 | Done |
| 38 | infra | MCP SSE session | `places-agent-mcp-sse-session` | 修复 `POST /sse` Streamable session（无/过期 session → 明确错误或可恢复）（performance Q6） | 见下文 | **MVP-8** | 是 | Done |
| 39 | infra | Typecheck 清零 | `places-agent-tsc-debt-zero` | 9 处预存 `tsc` 错误清零（test union 收窄 / provider 字面量 / mock 缺字段），恢复 `make quality` typecheck 门 | 见下文 | **MVP-9** | — | ToDo |
| 40 | infra | MCP arrange 服务端硬闸 | `places-agent-mcp-arrange-hard-gate` | ~~并发 arrange 硬闸~~ **Cancelled**（MVP-10 删 `arrange_day`，竞态随工具消失） | 见下文 | **MVP-9** | 是 | **Cancelled** |
| 41 | infra | Opt-in 分层 + runbook | `places-agent-optin-triage` | E2E-live 边界裁剪 wontfix；`test-e2e-caller` 保留 + runbook；build warning 清单落档 | 见下文 | **MVP-9** | — | ToDo |
| 42 | agent | Arrange 输出校验三件套 | `places-agent-arrange-output-gates` | 站间时序 / 同日餐厅去重 / day-trip 补搜（MVP-9）；填充层迁入见 F44 | 见下文 | **MVP-9** | 是 | Done |
| 43 | agent | make_itinerary 轻骨架 | `places-agent-make-itinerary` | 一次 LLM 多日 stop-order 骨架 | 见下文 | **MVP-10** | 是 | Done |
| 44 | agent | plan_next_stop / display 填充 | `places-agent-plan-next-stop` | 无 LLM 逐站 transit + 卡片 | 见下文 | **MVP-10** | 是 | Done |
| 45 | agent | 工具清理 | `places-agent-tool-cleanup` | `navigate` 已删；`arrange_day`/enrich 硬删 gate plan-46 | 见下文 | **MVP-10** | 是 | **部分 Done** |
| 47 | infra | MCP 骨架 host_instructions | `places-agent-mcp-skeleton-host` | discover→make→fill 链指令 | 见下文 | **MVP-10** | 是 | Done |
| 48 | agent | 签证要求查询 | `places-agent-visa-requirement` | Orizn REST adapter；MCP/HTTP `visa_requirement`（ADR-044） | 见下文 | **MVP-11** | — | **Done** |
| 49 | agent | findIconicPlaces 双模 | `places-agent-find-iconic-places` | grounded/ungrounded 必去（ADR-045） | 见下文 | **MVP-12** | 是 | **Done** |
| 50 | agent | travel_tips | `places-agent-travel-tips` | 目的地 tips 工具（ADR-045） | 见下文 | **MVP-12** | — | **Done** |
| 51 | infra | 别名重指向 make_itinerary | `places-agent-alias-repoint` | plan_itinerary/trip_plan/trips → 骨架流 | 见下文 | **MVP-12** | 是 | **Done** |
| 52 | infra | MCP `/mcp` stateless | `places-agent-mcp-stateless` | 无会话化（ADR-045） | 见下文 | **MVP-12** | 是 | **Done** |
| 53–58 | agent | E2E 填充/骨架整改 | （见第二部分） | end_time / meal / pace / 站名 / 区域展开 / 失败 detail | 见下文 | **MVP-13** | 是 | Done |
| 59–61 | agent | 填充可用性 | （见第二部分） | stay 角色 / leg 闸 / 迟到午餐 | 见下文 | **MVP-14** | 是 | Done |
| 62 | agent | 骨架确定性修复 | `places-agent-skeleton-deterministic-repair` | reseatStay + dropCity + 超时 prior validation | 见下文 | **MVP-15** | 是 | **Done** |
| 63 | agent | Trip Store | `places-agent-trip-store` | PG+内存；懒创建；revision（ADR-046） | 见下文 | **MVP-16** | 是 | **Done（P0）** |
| 64 | agent | fetch_trip_details | `places-agent-fetch-trip-details` | 按 fields 只读切片 | 见下文 | **MVP-16** | 是 | **Done（P0）** |
| 65 | agent | 删除 display_current_stop | `places-agent-drop-display-current-stop` | 写并入 plan_next_stop；读走 fetch | 见下文 | **MVP-16** | 是 | **Done** |
| 66 | agent | 对外工具精简 | `places-agent-tool-surface-slim` | 评估并落地删/合并（含 arrange gate） | 见下文 | **MVP-16** | 是 | **评估 Done（硬删 ToDo）** |


**本表变更摘要（2026-09-02）：**

| 类型 | 项 |
| --- | --- |
| **新增 MVP** | **MVP-16** Trip Store（Feature **63–66**，ADR-046） |
| **状态更正** | **40** → Cancelled；**48–52 / 62** → Done（as-built）；**45** 仍部分 Done |
| **开放 ToDo** | **39 / 41 / 45 剩余 / 63–66**（详见 `e2e-test-result/04-rome.md` 开发计划） |

**本表变更摘要（2026-09-01）：**

| 类型 | 项 |
| --- | --- |
| **新增 MVP** | **MVP-11** 签证知识（Feature **48**） |
| **新增功能** | **48** `visa_requirement` — Orizn REST adapter，非 MCP 子进程 |
| **ADR** | [ADR-044](../../workspace-specs/adr/ADR-044-orizn-visa-rest-adapter.md) |

**本表变更摘要（2026-08-23）：**


| 类型       | 项                                                                                                               |
| -------- | --------------------------------------------------------------------------------------------------------------- |
| **MVP 列** | 改为 **MVP-1**…**MVP-8** 全文；表内按 MVP 批次重排（同批内按功能号） |
| **新增列**  | `itinerary 优化相关`、`完工情况`                                                                                         |
| **新增功能** | **32–33**（原 Feature 31 延伸故事升格）；**34–38**（performance Q2–Q4 / Mode H / MCP session）                              |
| **改动**   | **9 / 10 / 11 / 30 / 31** 描述对齐 ADR-036/037（2play 不默认调 agent arrange/plan/chat）；**4 / 20 / 25–27 / 29** 标注行程优化关联 |
| **删除**   | 无（编号 22–23 历史空号保留，不补）                                                                                           |
| **明确排除** | 搜索专名自动机翻（performance Q5）；不写入本表                                                                                  |
| **开发计划** | 新增本节 **「MVP-8 剩余功能开发计划」**（Wave A–E）                                                                             |


---



## MVP-8 剩余功能开发计划

**状态（2026-08-23）：** Feature **34–38** 全部 **Done**（ADR-040/043 D9 精简后落地）。下表保留原计划作历史；as-built 见各 Wave 节末「落地」注。真源 AC 见第二部分同名章节；工程约束见 `[performance.md](./performance.md)` §0.1 / §3.1 / §6。  
**原则：** 一次只推一个 Feature 至 DoD；不并行开多条主线；不把「LLM 写 search query」或专名机翻纳入范围。

### 剩余清单


| Wave  | Feature                | 代码                                    | performance   | 依赖                | 预估   | 目标                              | 状态 |
| ----- | ---------------------- | ------------------------------------- | ------------- | ----------------- | ---- | ------------------------------- | -- |
| **A** | **34** Discover Arm A  | `places-agent-discover-arm-a`         | Q2            | 无（建在 **33** 上）    | 3–5d | 西安等热门城池头必去 + 餐更近                | ✅ Done（ADR-042：删城市种子，改通用模板 + LLM 推断 must-see） |
| **B** | **36** L2 硬必去          | `places-agent-arrange-hard-must-see`  | Q3            | **34** 池够硬后收益最大   | 2–4d | 池中必去不会被 arrange 漏掉              | ✅ Done（D9：删确定性注入，改硬失败重试 + theme 门控 focus） |
| **C** | **35** Mode H handoff  | `places-agent-arrange-host`           | Mode H / §3.1 | 可与 B 交错，但建议 B 后   | 3–5d | MCP/宿主秒级开写；解锁 2play **plan-11** | ✅ Done（`execution=host` 返 prompt；MCP 缺省强制 agent） |
| **D** | **37** 行程真交通           | `places-agent-itinerary-real-transit` | Q4            | 复用 **4** / **25** | 3–5d | legs 进时间线；解锁 2play **plan-13**  | ✅ Done（`enrich_arrange_transit` → `legs_to_here`，失败降级 heuristic） |
| **E** | **38** MCP SSE session | `places-agent-mcp-sse-session`        | Q6            | **与 A/B 并行 OK**   | 1–3d | ChatBox `POST /sse` 可恢复         | ✅ Done（`http-transport.ts` + session-manager；缺/过期 session 可恢复） |


**建议默认顺序：** A → B → C → D；**E 随时可插**（不挡质量主线）。  
**与 where2play：** Progressive §11-P0 已完成。2play **plan-11**（Mode H）跟 **35**；**plan-12**（arrange stream）主要在 2play；**plan-13**（真交通）跟 **37**。

```text
Wave A  34 Arm A seed/双源/餐
   │
Wave B  36 硬必去（agent arrange + 契约；2play L2 可随后对齐）
   │
Wave C  35 execution=host  ——→  2play plan-11 换 prompt 源
   │
Wave D  37 directions 进行程  ——→  2play plan-13
   │
Wave E  38 SSE session（可与 A/B 并行）
```



### Wave A — Feature 34 Discover 质量（Arm A 演进）✅ Done


| 项        | 内容                                                                                                                             |
| -------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **目标**   | 主路径通用模板填池 + Google RELEVANCE；must-see 由 **LLM 从候选池推断**（ADR-042/D9：删城市种子 CATALOG）；**不**接 L1 LLM 写 search query                                                     |
| **基线**   | Feature **33** / ADR-038：`discover-must-see`、filter、cluster dedupe 已有；ADR-042 把 CATALOG 清空                                                          |
| **实现要点** | `discover-must-see.ts` CATALOG 置空（no-op stub）；`discover-must-see-llm.ts` 用无城市名 prompt 推断公认 must-see；`query-assembler.ts` 通用模板 jobs；Google `rankPreference=RELEVANCE`（禁 POPULARITY） |
| **主要文件** | `src/core/discover-must-see.ts`、`discover-must-see-llm.ts`、`query-assembler.ts`、`itinerary-planner.ts`（`searchCandidatePools`）、`provider-resolver.ts` |
| **测试**   | `tests/discover-arm-a.test.ts`（通用模板填池 + 零 LLM）；`tests/discover-quality.test.ts`；`src/core/query-assembler.test.ts`；`tests/no-city-hardcode-guard.test.ts` |
| **DoD**  | AC1–3 绿；knowledge 探针表更新；**33** 回归不破；源码无城市 POI 知识                                                                                            |
| **非目标**  | LLM 生成 query；专名机翻                                                                                                              |




### Wave B — Feature 36 L2 硬必去 ✅ Done


| 项         | 内容                                                                           |
| --------- | ---------------------------------------------------------------------------- |
| **目标**    | 排程结果**强制**覆盖行程级必去类；LLM 漏排 → 硬失败重试一次（删确定性注入），非仅 Prefer                                          |
| **依赖**    | **34** 先保证池内有真必去；否则硬规则无米之炊                                                   |
| **实现要点**  | `must-include-coverage.ts` 追踪 covered/missing + sticky；theme 门控 focus（仅 day_theme 命中才强制 focus）；LLM 漏排 → `callItineraryLlmWithValidationRetry` 重试一次；prompt 保留 Prefer 作辅 |
| **主要文件**  | `src/core/itinerary-planner.ts`（arrange）、`must-include-coverage.ts`、Zod/自查   |
| **测试**    | `src/core/must-include-coverage.test.ts`（硬失败重试 + theme 门控 focus）；超时/失败路径不静默标成功                                  |
| **DoD**   | AC1 绿；MCP+HTTP arrange 行为一致                                                  |
| **2play** | BFF OPENAI_CN L2 可随后镜像同一规则（另故事，勿塞进本 Wave）                                      |




### Wave C — Feature 35 Mode H handoff ✅ Done


| 项        | 内容                                                                                           |
| -------- | -------------------------------------------------------------------------------------------- |
| **目标**   | `execution=host`：返回 prompt + slim 候选，**本请求不调 LLM**；`execution=agent` 兼容现网                    |
| **依赖**   | 建议在 **36** 之后，使 host prompt 已含硬必去约束；可与 **38** 并行                                             |
| **实现要点** | 抽出共享 `buildSchedulePrompt`；MCP + HTTP 参数与响应契约；description 标明默认推荐 host；指标字段预留（execution、TTFB） |
| **主要文件** | `src/mcp/create-server.ts`、`src/core/itinerary-planner.ts`、HTTP arrange 路由、prompt 模块         |
| **测试**   | host 路径 spy：零 OpenAI 调用；快照 prompt；agent 路径回归                                                 |
| **DoD**  | AC1–2 绿；ChatBox/Cursor 手测：工具返回后即可流式写                                                         |
| **解锁**   | where2play **plan-11**（换 prompt 源，UI 事件不变）                                                   |




### Wave D — Feature 37 行程真交通 ✅ Done


| 项        | 内容                                                                                              |
| -------- | ----------------------------------------------------------------------------------------------- |
| **目标**   | 站间/首尾 transit 写入真实 directions/navigate 时长与方式（无密钥外泄）                                             |
| **依赖**   | Feature **4**、**25**；可选等 **35** 后再做以减少并行面                                                       |
| **实现要点** | arrange/plan 后处理或 L3 enrich：有坐标则调 directions；失败降级估时 + 可观测 outcome；DTO 与 MCP 字段对齐 2play timeline |
| **主要文件** | `navigate` / directions 客户端、`itinerary-planner.ts`、map/DTO                                      |
| **测试**   | fixture directions；失败降级；deeplink 无 key                                                          |
| **DoD**  | AC1 绿；文档标明 2play **plan-13** 消费契约                                                               |




### Wave E — Feature 38 MCP SSE session（可并行）✅ Done


| 项        | 内容                                                                         |
| -------- | -------------------------------------------------------------------------- |
| **目标**   | `POST /sse` 无/过期 session 时明确错误或可 initialize 恢复                             |
| **依赖**   | 无；**不挡** A/B                                                               |
| **实现要点** | 厘清 SSE vs Streamable 路由；session 生命周期；错误体可诊断；更新 admin instructions / MCP 文案 |
| **主要文件** | `server.ts`、MCP transport、session 存储                                       |
| **测试**   | 缺 session → 明确错误；initialize → 后续工具可用                                       |
| **DoD**  | AC1 绿；ChatBox 复测不再卡死在 Bad Request                                          |




### 节奏与门禁


| 规则  | 说明                                                                           |
| --- | ---------------------------------------------------------------------------- |
| 粒度  | 一 Wave = 一 Feature = 一 DoD 周期（`incremental-delivery`）                        |
| 质量  | `make test` / 相关 contract；live 探针仅 opt-in                                    |
| 文档  | 完工后把本表对应行 **ToDo → Done**；更新 `[performance.md](./performance.md)` 状态；必要时 ADR |
| 禁止  | 本计划内做专名机翻（Q5）；用代码骨架替换 LLM 排程主路径                                              |




### 完工勾选（MVP-8）

- [x] **34** Arm A — Done  
- [x] **36** 硬必去 — Done  
- [x] **35** Mode H — Done  
- [x] **37** 真交通 — Done  
- [x] **38** MCP session — Done  

---

## MVP-9 — 收尾与硬闸（2026-08-23 立项，**全部 ToDo，未开工**）

**范围：** Feature **39–41**。来源：MVP-8 收尾 review 发现的预存技术债与架构限制（`0.refactor-plan.md` 批次 9「已知限制」节）。  
**原则：** 一次只推一个 Feature 至 DoD；与 2play MVP-3 补漏波（`plan-14`~`plan-16`）解耦，互不阻塞。

### 剩余清单


| Wave  | Feature | 代码 | 类型 | 优先级 | 目标 | 状态 |
| ----- | ------- | --- | ---- | ---- | --------------------------------- | --- |
| **A** | **39** Typecheck 清零 | `places-agent-tsc-debt-zero` | 技术债 | **P1** | `npx tsc --noEmit` 零错误 → `make quality` typecheck 门恢复绿 | ToDo |
| **B** | **40** MCP arrange 服务端硬闸 | `places-agent-mcp-arrange-hard-gate` | 架构 | **P1** | ~~并发硬闸~~ | **Cancelled**（随 arrange 删除） |
| **C** | **41** Opt-in 分层 + runbook | `places-agent-optin-triage` | 文档/流程 | **P2** | E2E-live 边界裁剪关闭（保留主路径）；`test-e2e-caller` 写 runbook；build warning 清单落档 | ToDo |

### Wave A — Feature 39 Typecheck 清零

| 项 | 内容 |
| --- | --- |
| **目标** | 9 处预存 `tsc --noEmit` 错误清零，`make quality` 全绿 |
| **明细** | `itinerary-planner.test.ts` 699/976/1250（union `.blocks` 收窄，各 2 处）；`itinerary-planner.ts` 918/924（provider 字面量联合类型）；`create-server.adr040.test.ts` 232（mock PlaceCard 缺 `location`/`sources`） |
| **主要文件** | `src/core/itinerary-planner.test.ts`、`src/core/itinerary-planner.ts`、`src/mcp/create-server.adr040.test.ts` |
| **测试** | 现有 548 vitest 不回归；修法本身即测试文件 |
| **DoD** | `npx tsc --noEmit` 零输出；`make quality` 全绿 |
| **非目标** | 不动测试语义（只加类型收窄/补 mock 字段，不改断言） |

### Wave B — Feature 40 MCP arrange 服务端硬闸

| 项 | 内容 |
| --- | --- |
| **目标** | 宿主并发调 `arrange_day` 时，服务端拒绝第 2+ 个并发调用，强制串行逐日展示 |
| **背景** | `host_instructions` 措辞（step2）无法约束宿主 LLM（ChatBox/GPT-5.4）工具调用纪律；软闸 `evaluateArrangePresentGate` 有并发竞态（D9 已知限制）；「问确认」行为属宿主生成习惯，服务端不可约束，仅文档化 |
| **实现要点** | session 级互斥锁（按 trip session id）；第 2+ 并发调用返回结构化错误 `need_present_previous_day` + resume 指令（宿主可恢复）；`arrange-present-gate.ts` 加锁路径 + 单测覆盖并发竞态 |
| **主要文件** | `src/mcp/arrange-present-gate.ts`、`src/mcp/create-server.ts`、`src/mcp/session-manager.ts` |
| **测试** | 并发 2+ 调用 → 第 2 个返回结构化错误；ack 后串行恢复；软闸既有用例不回归 |
| **DoD** | AC 绿；ChatBox 实测不再出现 4 连发 |
| **非目标** | 不改 HTTP `arrange_day`（无 session 语义）；不解决宿主「问确认」措辞问题 |

### Wave C — Feature 41 Opt-in 分层 + runbook

| 项 | 内容 |
| --- | --- |
| **目标** | 三项 opt-in 长尾按价值分层处置，不再无限期挂起 |
| **分层** | ① Claude Plan E2E-live 边界 → **裁剪关闭**（主路径 live 已由 2play `test-e2e-mvp3-live` 覆盖；低价值边界标 wontfix）；② `make test-e2e-caller` → **保留 opt-in + runbook**（何时跑、怎么跑、断言什么，落 knowledge）；③ `npm run build` warning → **跑一次落清单**（在 F39 清零后），非硬门 |
| **主要文件** | `agent-specs/knowledge/caller-e2e-runbook.md`（新）、`agent-specs/0.refactor-plan.md`（backlog 节更新） |
| **DoD** | runbook 评审通过；refactor-plan backlog 节反映分层决定；build warning 清单入档 |
| **非目标** | 不新增 E2E-live 用例；不把 build warning 纳入 CI 硬门 |

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

`GOOGLE_MAPS` **传输（ADR-017）：** 优先直连 Google Maps Platform REST；仅在出口故障时使用 Cloudflare Worker MCP（`GMAPS_MCP_`*）。卡片保持标记为 `GOOGLE_MAPS`。Worker 不是 `providers[]` id。除非调用方请求了 `AMAP`，否则不回退到 AMAP。如果直连失败后 Worker 未配置，则跳过 Google 并附带原因键。

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

旅行者以自然语言询问地点，可选上传文件（包括图片）。智能体在**其**服务器 OPENAI_CN 上运行工具循环。LLM 不因搜索目的地而切换。上传错误使用 i18n 键。

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
**我希望** 智能体的模型来自此可部署单元的服务器 OPENAI_CN 配置
**以便** 搜索目的地不切换 LLM 供应商或模型

#### AC1

```gherkin
Scenario: 上海问题不切换智能体模型
  Given 智能体可部署单元配置了一个服务器 OPENAI_CN 模型
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

通过两种**访问渠道**暴露相同的地点工具：HTTP API 用于第一方应用 BFF，MCP 用于智能体主机（`/mcp`、`/sse`）。单一工具核心；无分叉行为。这不是驾车/公交路线。两种渠道均将服务标识为 `places-agent`。

此 MCP 是 **places-agent** 的工具界面。它**不是** Google Maps Cloudflare Worker MCP（`GMAPS_MCP_`*），后者是 `GOOGLE_MAPS` 适配器的内部**传输回退**（功能 6 / ADR-017）。

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

**验收备注：** 端到端 <5s / <15s / 二次 <1s 的 live 勾选见 `[0.refactor-plan.md](./0.refactor-plan.md)` MVP-4b；CI 默认 fixture。

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

**类别：** agent · **MVP-6** · Feature **30** · itinerary 优化相关 · 完工：**Done**  
**改动说明（2026-08-23）：** where2play 初排 L2 改由调用方 OPENAI_CN（ADR-037）；本功能仍服务 MCP 与一站式 HTTP `plan_itinerary` / `arrange_day`。  
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

**类别：** agent · **MVP-6** · Feature **31** · itinerary 优化相关 · 完工：**Done**  
**改动说明（2026-08-23）：** 2play 主路径仅用 `discover_places`（L1）；`arrange_day` 仍供 MCP / 其他 HTTP 调用方。Mode H 见 Feature **35**。

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
And 每个后续 block 含游中交通（`legs_to_here`，agent 路径）  
And 无 origin 时**不含** `from_origin` / `to_destination`，行程自首 block 至末 block  
And 默认 pace=`medium` 时日程排满至晚餐结束附近（含 dinner；末块结束不得早于 16:00）

### US1b — MCP 对话收齐（Option A）

**AC1b**

Given 用户说「推荐 N 日游」且缺开始日等硬边界  
When 宿主尚未收齐  
Then 贴出**固定 8 行行程表**（城市、开始日、天数、可选酒店、节奏、消费 1–3、兴趣、必去地名），不得少问  
And `discover_places` 仅在硬边界（城市+开始日+天数）齐后调用一次  
And 每日酒店缺失不阻止 discover / arrange  
And 节奏默认适中、消费默认 `spend_level=2`  

Given 宿主在一问中同时提出多个一日游选项且用户列出「辛特拉、卡斯凯什」  
When 排程至末日  
Then `must_include` 两项均须被某日 **真实 blocks** 硬覆盖（必去 pool 或锚点 10km+名称；**`day_theme` 文案不算**）  
And HTTP `/v1/arrange_day` 与 MCP 同返回 `must_include_coverage`  
And 若仍缺项 → `present_day_then_cover_must_include`，不得直接总览  

Given 某日 `day_theme` 含「辛特拉」但 blocks 仅为里斯本近郊（如克卢什/Fronteira）  
When `arrange_day` 返回  
Then `must_include_coverage.missing` 仍含「辛特拉」  

Given `arrange_day` 成功返回  
When 宿主上屏  
Then 日卡为多行块（时间标题、说明、前往、路线链接、地点链接），禁止单行 `|` 压缩  
And 末日总览后不得再贴同一日卡（Day N 与 overview 各一次）  

Given `arrange_day` 收到空 `candidates.places` / `restaurants` 且 `city` 已给  
When 服务端执行（ADR-043 D8）  
Then 自动 `discoverPlaces` 填空侧后再排程  
And 不得要求宿主 invent POI 或依赖「Fix candidates」手补  
And 无 city 且池空 → 清晰失败

### US2 — HTTP 对等

**AC2**

Given HTTP `POST /v1/discover_places` 与 `POST /v1/arrange_day`  
When 使用有效 caller Bearer  
Then 返回与 MCP 同义的 JSON envelope（`agent`、`ok`、`data`）  
And `arrange_day` 在传入 `preferences.must_include` 时，`data.must_include_coverage` 与 MCP 同语义（ADR-043 D7）  
And 空候选 + city 时与 MCP 同走 D8 自动 discover  
And `plan_itinerary` 的 HTTP 路径保持可用

### US3 — 配图

**AC3**

Given 候选含 photos  
When 格式化行程 blocks  
Then 按 name 匹配挂回 `block.photos`  
And 封面图可为 Day1 首个 attraction 的首张 photo（零额外供应商调用）

---



# 行程 MCP P0 止损 — `places-agent-itinerary-mcp-p0`

**类别：** agent · **性能 P0** · 参见 `[performance.md](./performance.md)` §4–§5 · Feature **32** · 完工：**Done**

**作为** MCP / HTTP 调用方  
**我希望** `arrange_day` 接受缺省日期、进入 LLM 前候选已瘦身、工具 description 标明互斥与禁回灌  
**以便** 降低叠跑与校验失败，且不改变「LLM 排程」产品语义

### US1 — `date` nullish

**AC1**

Given HTTP `POST /v1/arrange_day` 或 MCP `arrange_day`  
When `date` 为省略、`null` 或合法日期字符串  
Then 请求通过 schema 校验（不因 JSON `null` 返回 -32602 / Zod 失败）

### US2 — arrange 候选瘦身

**AC2**

Given `arrange_day` 收到含 `photos` / `hours` / `sources` / `deeplinks` 的候选  
When 组装进入 LLM 的 prompt 输入  
Then 候选已 strip：不含 `photos`、`hours`、`sources`、`deeplinks`  
And 仍保留 name / category / rating / location 等入模字段  
And Phase 4 挂图仍可从**原始**候选池按 name 匹配 photos

### US3 — MCP 工具 description 互斥与禁回灌

**AC3**

Given MCP `tools/list`  
When 读取 `discover_places` / `arrange_day` / `plan_itinerary` / `search_*` 的 description  
Then 文案标明：`plan_itinerary` 与「discover + arrange」互斥（勿串联叠跑）  
And 标明勿将 `photos` / `hours` 等大字段回灌 `arrange_day`  
And 慢路径（`plan_itinerary` / 完整排程）有明确标注

---



# Discover 候选质量 — `places-agent-discover-quality`

**类别：** agent · **质量** · [ADR-038](../../workspace-specs/adr/ADR-038-discover-places-quality.md) · Feature **33** · 完工：**Done**

**作为** where2play / MCP 调用方  
**我希望** `discover_places` 在无 LLM 下仍返回可用必去点候选  
**以便** L2 排程不会被噪声池锁死

### US1 — 热门城必去覆盖

**AC1**

Given HTTP/MCP `discover_places`，`city` = `西安`，`numDays` ≥ 1  
When 调用成功（CI 用 mock 供应商；live 可选）  
Then `candidates.places` 名称集合命中「兵马俑」或「秦始皇」类 **且** 命中「大雁塔」类 **且** 命中城墙主点  
And 城墙系（含「城墙」名）计数 **≤ 2**  
And 无售票处 / 直通车 / 乘车点 / 「城墙-敌楼」类碎片  
And 无 category 含「公司企业」的景点卡  
And 路径**不**调用 LLM / OpenAI

### US2 — 过滤与排序

**AC2**

Given 合并后的候选含博物馆真点 + 公司企业/停车场/公交站噪声  
When discover 返回池  
Then 噪声被过滤；must-see token 命中名排在池头部（同 rating 时优先）

### US3 — 非白名单城

**AC3**

Given 未知/非热门城  
When discover  
Then 仍跑改进泛搜 + 过滤；不保证必去点；不伪造 POI

---



# Discover 候选质量（Arm A 演进）— `places-agent-discover-arm-a`

**类别：** agent · **质量** · `[performance.md](./performance.md)` §0.1 Q2 · Feature **34** · 完工：**Done**（ADR-042/D9 精简后）

**作为** where2play / MCP 调用方  
**我希望** discover 用通用模板填池 + Google RELEVANCE 排序，must-see 由 LLM 从候选池推断（源码无城市 POI 知识）  
**以便** 池中稳定出现真必去点且不靠硬编码城市字典，餐食更近本地

### US1 — 通用模板填池（无城市种子）

**AC1**

Given 任意城市（如西安）  
When `discover_places`  
Then 用通用热门模板 query（如「{city} 景点」）填池，源码不含任何城市专属种子/馆名表  
And 结果仍来自地图供应商（不伪造 POI）

### US2 — Google RELEVANCE + must-see LLM 推断

**AC2**

Given 大陆热门城且 caller 未强制单 provider  
When discover must-see 相关搜索  
Then Google 用 `rankPreference=RELEVANCE`（禁 POPULARITY）；must-see 由 `discover-must-see-llm.ts` 用无城市名 prompt 从池中推断  
And 不以「LLM 生成 search query」为主路径

### US3 — 本地餐加权

**AC3**

Given 同城餐厅候选  
When 组装 `candidates.restaurants`  
Then 本地/近锚点餐排在池头（相对过远连锁噪声）

---



# Arrange Mode H handoff — `places-agent-arrange-host`

**类别：** agent · **性能** · `[performance.md](./performance.md)` §3.1 · Feature **35** · 完工：**Done**

**作为** MCP 宿主（ChatBox / Cursor）或 HTTP BFF  
**我希望** `arrange_day`（或等价）支持 `execution=host`，仅返回排程 prompt 与 slim 候选  
**以便** 宿主流式写行程，而不堵在工具内非流式 LLM

### US1 — host 不调 LLM

**AC1**

Given `execution=host`  
When 调用成功  
Then 响应含 `system_prompt`、`user_prompt`、`candidates_slim`、`output_contract`  
And 本请求**不**调用 OPENAI_CN / OpenAI

### US2 — agent 模式保留

**AC2**

Given `execution=agent` 或缺省（兼容）  
When 调用  
Then 行为与现有服务端 LLM `arrange_day` 一致

---



# L2 硬必去 — `places-agent-arrange-hard-must-see`

**类别：** agent · **质量** · `[performance.md](./performance.md)` §0.1 Q3 · Feature **36** · 完工：**Done**

**作为** 行程调用方  
**我希望** 排程结果强制覆盖行程级必去类（非仅 Prefer 文案）  
**以便** 池中已有必去 token 命中点时不会被 LLM 整日漏掉

### US1 — 硬覆盖（硬失败重试 + theme 门控 focus）

**AC1**

Given 候选池含必去 token 命中点，且 `arrange_day` / 宿主 L2 排程  
When 返回当日 blocks  
Then 必去类至少各出现一次；LLM 漏排 focus token → 硬失败重试一次（不再服务端造低质块注入）  
And theme 门控：仅当本日 `day_theme` 命中 missing token 才强制 focus；无 theme 不抢排，末日门仍保证覆盖  
And 不得仅依赖 prompt「Prefer」软约束作为唯一手段

---



# 行程真交通 — `places-agent-itinerary-real-transit`

**类别：** agent · **L3** · `[performance.md](./performance.md)` §0.1 Q4 · Feature **37** · 完工：**Done**

**作为** where2play / MCP 调用方  
**我希望** 行程时间线含真实 `navigate`/directions 段（时长/方式）  
**以便** 不再只靠 LLM reason 估时

### US1 — 站间 directions

**AC1**

Given 相邻两站有坐标  
When 组装行程 legs / transit slots  
Then 调用（或复用）directions/navigate 结果写入时长与方式  
And 深度链接不含供应商密钥

---



# MCP SSE session — `places-agent-mcp-sse-session`

**类别：** infra · **MCP** · `[performance.md](./performance.md)` §0.1 Q6 · Feature **38** · 完工：**Done**

**作为** MCP 宿主  
**我希望** `POST /sse` Streamable 会话在无/过期 session 时行为明确且可恢复  
**以便** 不再出现难诊断的 `No valid session ID`

### US1 — 会话错误可诊断

**AC1**

Given 缺少或过期的 `mcp-session-id`  
When `POST /sse`  
Then 返回明确协议错误（非静默挂起）  
And 文档/指令说明如何 initialize 新 session

---



# Typecheck 清零 — `places-agent-tsc-debt-zero`

**类别：** infra · **技术债** · Feature **39** · 完工：**ToDo**（MVP-9 Wave A，2026-08-23 立项，未开工）

**作为** places-agent 维护者  
**我希望** `npx tsc --noEmit` 零错误  
**以便** `make quality` typecheck 门恢复绿，后续提交不被预存错误掩盖

### US1 — 清零 9 处预存错误

**AC1**

Given 当前 `main`（`b3ae597` 后）  
When `npx tsc --noEmit`  
Then 零输出（9 处全清：`itinerary-planner.test.ts` 699/976/1250 union 收窄 ×2、`itinerary-planner.ts` 918/924 provider 字面量、`create-server.adr040.test.ts` 232 mock 缺 `location`/`sources`）  
And 全量 vitest 548 不回归  
And 测试断言语义不变（只加类型收窄 / 补 mock 字段）

---

# MCP arrange 服务端硬闸 — `places-agent-mcp-arrange-hard-gate`

**类别：** infra · **MCP** · ADR-043 D9 已知限制 · Feature **40** · 完工：**Cancelled**（2026-08-31：MVP-10 硬删除 `arrange_day`，并发竞态随工具消失；见 `[0.refactor-plan.md](./0.refactor-plan.md)` 批次 11）

**原作为** MCP 宿主用户  
**原希望** 宿主并发调 `arrange_day` 时服务端直接拒绝第 2+ 个并发调用  
**作废原因：** `arrange_day` 将被 `make_itinerary` + `plan_next_stop` 取代，F40 硬闸无适用工具。

~~### US1 — 并发拒绝且可恢复~~（不再实现）

---

# Opt-in 分层 + runbook — `places-agent-optin-triage`

**类别：** infra · **文档/流程** · Feature **41** · 完工：**ToDo**（MVP-9 Wave C，未开工）

**作为** places-agent 维护者  
**我希望** 三项 opt-in 长尾按价值分层处置并有 runbook  
**以便** backlog 不再无限期挂起低价值项

### US1 — E2E-live 边界裁剪

**AC1**

Given Claude Plan 遗留的 E2E-live 边界用例清单  
When 分层评审  
Then 主路径 live 已由 2play `test-e2e-mvp3-live` 覆盖的项标 wontfix；仅保留无法替代的项入待办

### US2 — caller E2E runbook

**AC2**

Given `make test-e2e-caller`（TC-E2E-01~12）  
When 维护者需要验证 live 供应商  
Then `agent-specs/knowledge/caller-e2e-runbook.md` 说明前置（密钥/环境）、命令、断言范围

### US3 — build warning 清单

**AC3**

Given Feature 39 tsc 清零完成  
When `npm run build`  
Then warning 清单落 `0.refactor-plan.md` backlog 节（非 CI 硬门）

---

# Arrange 输出校验三件套 — `places-agent-arrange-output-validation`

**类别：** agent · **质量** · Feature **42** · 完工：**Done**（MVP-9 Wave D，2026-08-24：validateStationTiming 站间时序校验 post-enrich 容差 5min + validateItinerary 同日餐厅去重 + buildDayTripSearchQueries 通用景点类词补搜 ADR-042 合规 + buildUserMessage 午间窗口软提示 + Lisbon 4D fixture 回归 3 测试绿；vitest 560 绿，tsc 无新增错误）

**来源：** Lisbon 4D MCP 样本（`agent-specs/sample_lisbon_4d.md`）回归评估。D9 修复了必去覆盖、末日重复、串行调用、真交通，但样本暴露三类新缺陷，均属 arrange 输出未被服务端校验。

**作为** 行程调用方（MCP 宿主 / HTTP BFF）  
**我希望** `arrange_day` 返回的 blocks 在时间轴、同日去重、day-trip 池粒度上可执行  
**以便** 宿主无需自行复算时序或去重，day-trip 日能排到具体景点而非镇级一块

### US1 — 站间时序一致性（硬失败重试）

**AC1**

Given `arrange_day` 返回 blocks 数 ≥ 2，且相邻两站含 recommended `legs_to_here`  
When 校验 `blocks[i].start_time`  
Then 满足 `start_time ≥ 前块 end_time + recommended leg duration_min`（容差 5min）  
And 违背时触发一次硬失败重试（与 F36 must_include 重试同机制），重试 prompt 注入违规清单  
And 重试仍失败则保留最接近的版本并在 `transit_outcome` 标 `partial`（不静默放过）

**样本反例（Lisbon 4D）：** D2 辛特拉 14:00 结束 + 100min transit，午餐却 14:15 开始（差 85min）；D3 卡斯凯什→午餐差 30min、午餐→卡斯凯什差 29min。

### US2 — 同日餐厅去重

**AC2**

Given 同一次 `arrange_day` 返回的 blocks  
When 校验 meal 类块（lunch/dinner/cafe）  
Then 同日内同名餐厅不得出现两次（lunch 与 dinner 同名即违规）  
And 违规时触发一次硬失败重试，prompt 注入「已用于 lunch 的餐厅不得再用于 dinner」  
And 重试仍失败则剔除后出现的重复块并在 `transit_outcome` 标 `partial`

**样本反例（Lisbon 4D）：** D3 `Ato Gastronómico美食行动` 同日 13:15 午餐 + 18:15 晚餐，且该餐厅不在卡斯凯什（距卡斯凯什 transit 45min），全天三次跨城往返。

### US3 — day-trip focus 补搜词扩展

**AC3**

Given `must_include` token 为 day-trip 镇（如辛特拉/卡斯凯什），且当日 `day_theme` 命中该 token 触发 focus  
When D7 对 focus token 补搜候选池  
Then 补搜 query 模板扩展为「{token} 景点」「{token} 宫殿」「{token} 城堡」「{token} 海滩」等通用景点类词（非城市专属硬编码，符合 ADR-042）  
And 池中应出现 token 城内的具体 POI（如佩纳宫/摩尔人城堡/雷加莱拉庄园），而非仅镇本身一个 POI  
And 池仍来自地图供应商（不伪造 POI）；补搜失败则池可仅含镇本身，但 `transit_outcome` 标 `partial`

**样本反例（Lisbon 4D）：** D2 host 明确要「佩纳宫、摩尔人城堡、雷加莱拉庄园」，但补搜池只有「辛特拉」镇一个 POI，LLM 只能排 240min 的「辛特拉」块，午后全部回里斯本。D3 同病：卡斯凯什镇块同日排两次，池内无海滩/海岸步道。

### US4 — 午间窗口覆盖（软提示，非硬失败）

**AC4**

Given 紧凑节奏（`pace=tight`）且首块 start_time ≤ 10:00  
When 返回 blocks  
Then 若 11:30–14:30 窗口内无 meal 类块，prompt 软提示「建议安排午餐」  
And 此项不触发硬失败重试（属 LLM 行为偏好，不强制）

**样本反例（Lisbon 4D）：** D4 12:45 贝伦塔 → 14:15 阿茹达宫 → 16:20 cafe，全天唯一正餐是 19:00 晚餐。

### 明确排除

- 宿主「问确认」「批量展示」属宿主习惯（F40 硬闸范围），本 story 不约束。
- 2play HTTP 路径的 origin/dest name-only、schema 删 transit 字段 — **plan-15 并入 MVP-10 plan-46 / Feature 44**（2026-08-31 方案确定）；本 story arrange 层校验 **迁移至 Feature 44** 填充层。

---

# 轻骨架 make_itinerary — `places-agent-make-itinerary`

**类别：** agent · **L2** · `[performance.md](./performance.md)` §12 · Feature **43** · 完工：**Done**（2026-09-01，MVP-10 P1）— `src/core/make-itinerary.ts` + HTTP NDJSON + MCP 注册 + TC-M10-43 全绿

**作为** where2play BFF / MCP 宿主  
**我希望** 一次 LLM 调用流式得到多日 stop 顺序骨架（无时间）  
**以便** 全局优化路由与 must_include，且首顺序尽早可见

### US1 — 流式骨架事件

**AC1**

Given discover 候选池已就绪  
When 调用 `make_itinerary`  
Then NDJSON 顺序为 `skeleton_start` → `skeleton_day` × N → `skeleton_done`  
And 每个 `skeleton_day` 含 `day_theme` 与 `stops[]`（name/kind/meal_slot），**无** start_time  
And must_include 漏排触发一次硬失败重试

---

# 逐 stop 填充 — `places-agent-plan-next-stop`

**类别：** agent · **L3** · Feature **44** · 完工：**Done**（2026-09-01，MVP-10 P2）— `src/core/plan-next-stop.ts`（planNextStop + displayCurrentStop）+ HTTP + MCP + TC-M10-44 全绿；F42 等价校验迁入填充层

**作为** 行程调用方  
**我希望** 骨架定序后每站由 `plan_next_stop` + `display_current_stop` 串行填充 transit 与富信息  
**以便** 填充阶段零 LLM，且 F42 校验在 agent 侧统一执行

### US1 — 串行 transit + 双模

**AC1**

Given 骨架与 current/next stop  
When `plan_next_stop`  
Then 返回 `legs`（有偏好单 mode，无偏好高低搭配）与 `transit_outcome`  
And directions 串行调用（非并行 batch arrange）

### US2 — F42 校验迁入

**AC2**

Given 相邻 stop 含 recommended leg 时长  
When `display_current_stop` 组装时间轴  
Then 站间时序容差 5min、同日餐厅去重、day-trip 补搜、午间软提示与 F42 等价  
And 违规一次重试后仍失败标 `transit_outcome: partial`

---

# 工具清理 — `places-agent-tool-cleanup`

**类别：** agent · **infra** · Feature **45** · 完工：**部分 Done**（2026-09-01，MVP-10 P3）— `navigate` 已从 agent + what2eat 双端删除（死代码，零调用方）；**剩余 gate：** `arrange_day` / `enrich_arrange_transit` 删除 + `plan_itinerary`/`trip_plan`/`trips` 别名指向 `make_itinerary` 仍 gate 于 where2play plan-46 切新 API（as-built 仍在调用）

**作为** places-agent 维护者  
**我希望** 删除废弃工具并注册别名  
**以便** MCP/HTTP 面与 §12 架构一致

### US1 — 硬删除与别名

**AC1**

Given where2play 已不再调用 `arrange_day` / `enrich_arrange_transit`  
When 部署 Feature 45  
Then `arrange_day`、`enrich_arrange_transit`、`navigate` 从注册表移除  
And `plan_itinerary`/`trip_plan`/`trips` 别名指向 `make_itinerary`  
And `arrange-present-gate` 测试随删或改写

---

# MCP 客户端迁移 — `places-agent-mcp-client-migration`

**类别：** infra · **MCP** · Feature **47** · 完工：**Done**（2026-09-01，MVP-10 P5）— 3 个新工具 MCP 注册 + `MCP_SKELETON_HOST_INSTRUCTIONS`（推荐 discover → make_itinerary → 逐 stop；arrange_day 标 legacy）；旧工具与别名不动（F45 gate）

**作为** ChatBox 等 MCP 宿主  
**我希望** 宿主指令与工具调用改 `make_itinerary` + 逐 stop 填充  
**以便** 不再依赖已删除的 `arrange_day`

### US1 — 宿主指令更新

**AC1**

Given Feature 44 已交付  
When MCP 宿主规划多日行程  
Then 调用 discover → make_itinerary → 循环 plan_next_stop/display_current_stop  
And 文档禁止并发 arrange_day 模式

---

# 签证要求查询 — `places-agent-visa-requirement`

**类别：** agent · **visa** · Feature **48** · 完工：**Done**（2026-09-02 as-built：`src/adapters/orizn/*` + `visa-requirement.ts` + MCP/HTTP）

**作为** where2play BFF / ChatBox MCP 宿主  
**我希望** 调用 `visa_requirement` 并传入用户护照国与目的地国（ISO alpha-3）  
**以便** 在出行建议等页面展示签证类型、材料与流程，而无需 caller 持有 Orizn 密钥

**规格：** [ADR-044](../../workspace-specs/adr/ADR-044-orizn-visa-rest-adapter.md) · `[agent-design.md](./agent-design.md)` §19 · where2play Feature **38–39**（国籍字段 + 出行建议页占位）

**非目标（本 Feature）：** 不把签证查询嵌入 `plan_itinerary` / `arrange_day` / `make_itinerary` 自动管线；不消费 Orizn `get_recent_changes`（feed 已停用）。

### US1 — 双传输对等

**AC1**

Given 有效 caller API 密钥与 `ORIZN_API_KEY` 已配置  
When 调用 MCP `visa_requirement` 或 HTTP `POST /v1/visa_requirement`  
Then 返回同一 envelope：`requirement`、`visa_free_days`、`description`、`documents`、`process`、`processing_time`、`validity`、`max_stay`、`extension`、`last_verified`、`source_url`  
And `passport` / `destination` 必须为 ISO 3166-1 alpha-3（如 `CHN`、`JPN`）；非法码返回结构化 i18n 错误，不静默猜国家

### US2 — 语言环境与诚实降级

**AC2**

Given 请求 `locale` 为 `CN` / `HK` / `TW` / `EN`  
When Orizn 返回数据  
Then 映射 Orizn `lang`（EN→`en`；CN/HK/TW→`zh`）  
And 免费档 `{upgrade: "..."}` 占位字段列入 `unavailable_fields`，不伪造值  
And 输出携带 `last_verified`；工具 description 声明以目的地官方移民机构为准

### US3 — 配额保护与 fail-closed

**AC3**

Given 同一 `(passport, destination, lang)` 在 TTL 内重复查询  
When 第二次调用  
Then 命中进程内缓存，不重复消耗 Orizn 配额

**AC4**

Given Orizn 返回 403/429（`quota_exceeded` / `missing_key`）或网络失败  
When 工具处理  
Then 返回 `outcome` + 明确 i18n key（如 `errors.visa_quota_exceeded`）  
And **绝不**用编造的签证信息冒充成功（ADR-021 live-honest）

### US4 — Fixture 模式

**AC5**

Given `PLACES_VENDOR_MODE=fixture`  
When 调用 `visa_requirement`  
Then 返回固定样本（如 CHN→JPN `visa_required`、CHN→SGP `visa_free` 30 天）  
And Fast CI 不消耗 live 配额

### 探针验收（live，可选 opt-in）

| 护照 | 目的地 | 期望 |
| --- | --- | --- |
| CHN | JPN | `visa_required`；含材料清单与流程 |
| CHN | KOR | `visa_required`（国家级；区域例外不在 Orizn 粒度内） |
| CHN | SGP | `visa_free`；`visa_free_days: 30`；含 `source_url` |
---

# 必去地统一获取 — `places-agent-find-iconic-places`

**类别：** agent · **infra** · Feature **49** · 完工：**Done**（2026-09-02 as-built：`find-iconic-places.ts` + discover 接入）

**作为** discover_places / travel_tips 调用方
**我希望** 通过统一方法 `findIconicPlaces` 获取必去地，支持有池（grounded）与无池（ungrounded）双模
**以便** travel_tips 可独立调用，且 discover 与 travel_tips 同源不重复开发

**规格：** [ADR-045](../../workspace-specs/adr/ADR-045-iconic-places-unified-acquisition.md) · `[agent-design.md](./agent-design.md)` §20

### US1 — 双模获取

**AC1**

Given 候选池非空
When 调用 `findIconicPlaces({ destination, pool, limit })`
Then **不**再调供应商搜点、**不**走 LLM；按 `user_ratings_total`（缺则 `rating`）从该池取 ≤ limit 并打 `must_see`
And 返回 `grounded: true`，名字可进 `make_itinerary`

**AC2**

Given 候选池为空或未传
When 调用 `findIconicPlaces({ destination, limit })`
Then LLM 按目的地参数化生成 ≤ limit 个（prompt 含目的地名）
And 返回 `grounded: false`，仅供展示，不保证可排程

**AC3**

Given LLM 返回超 limit 个
When 截断
Then 仅保留前 limit 个，归一化去重

### US2 — discover_places 改造（并行 + 补搜 + 标志）

**AC4**

Given 调用 `discover_places`
When 执行
Then `findIconicPlaces`（ungrounded）与 `searchCandidatePools`（类目）并行
And iconic ∪ user_must_include 与类目池匹配；unmatched 名补搜一次保证进池
And 命中卡片打 `must_see: true`；仍搜不到的记日志后丢弃

**AC5**

Given `discover_places` 返回
When `make_itinerary` 消费候选池
Then 直接读 `candidate.must_see`，无需独立 `must_include: string[]` 对账回合

### US3 — 合并下沉

**AC6**

Given 用户 `must_include` 与 LLM iconic 合并
When 走 HTTP 或 MCP 任一通道
Then 合并逻辑在 core（`dedupeMustInclude` 下沉），两通道一致
And 用户优先，归一化去重，limit 截断

---

# 目的地 tips — `places-agent-travel-tips`

**类别：** agent · **tips** · Feature **50** · 完工：**Done**（2026-09-02 as-built：`travel-tips.ts` + MCP/HTTP）

**作为** where2play BFF / ChatBox MCP 宿主
**我希望** 调用 `travel_tips` 获得目的地介绍、必去 top3、交通、天气、着装、安全
**以便** 在出行建议等页面展示，且可在 discover 之前独立调用

**规格：** [ADR-045](../../workspace-specs/adr/ADR-045-iconic-places-unified-acquisition.md) · `[agent-design.md](./agent-design.md)` §20

**非目标（本 Feature）：** 不把 tips 嵌入 `make_itinerary` 自动管线；不替代 discover 的候选池构建。

### US1 — 双传输对等

**AC1**

Given 有效 caller API 密钥
When 调用 MCP `travel_tips` 或 HTTP `POST /v1/travel_tips`
Then 返回同一 envelope：`intro`（≤80 字）、`iconic_places`（≤3）、`transit`、`weather`、`clothing`、`safety`
And 所有用户可见文案为 i18n 键，非硬编码语言串

### US2 — 无池独立调用

**AC2**

Given 未传 `pool` 且未传 `skeleton`，且未先调 discover
When 调用 `travel_tips({ destination })`
Then `findIconicPlaces` 走 ungrounded 模式返回必去 top3
And 不依赖候选池，不阻塞于 discover
And `iconic_places` 携带 `grounded:false`，展示层可标注「未验证」

### US3 — skeleton 消费（方案 A）

**AC3**

Given 调用方传 `skeleton`（make_itinerary 产物）
When travel_tips 处理输入
Then 内部提取 `skeleton.stops[].name`（attraction 类）组装 pool 传给 findIconicPlaces（grounded）
And 提取为纯数据转换，不调用 LLM
And `skeleton` 与显式 `pool` 二选一；两者都传时 skeleton 优先

### US4 — 天气聚合

**AC4**

Given 传 `bounds` 跨多日，open-meteo 返回逐日预报
When travel_tips 聚合天气
Then `weather.severity` 取全段最差值（fair < caution < adverse < severe）
And `weather.drivers` 为全段并集去重
And `weather.temperature` 为 `[min(逐日最低), max(逐日最高)]` 区间
And 单日行程直接用当日预报，不聚合

### US5 — 天气与诚实降级

**AC5**

Given 传 `bounds`（行程日期）
When open-meteo 返回数据
Then `weather` 为行程期间真实预报
And open-meteo 失败时 `weather` 降级为气候平均或 `unavailable_fields` 标注，不伪造

**AC6**

Given `PLACES_VENDOR_MODE=fixture`
When 调用 `travel_tips`
Then 返回固定样本（如 Lisbon），Fast CI 不消耗 live 配额

### US6 — 20s 超时与并行降级

**AC7**

Given 单次 `travel_tips` 调用
When 执行
Then geocode+weather 与 findIconicPlaces 并行；tips-prose 在两者完成后执行
And 关键路径墙钟 ≤ 20s（外层 `AbortSignal.timeout(20_000)` 硬保证）

**AC8**

Given geocode 或 weather 超时/失败
When 降级触发
Then tips-prose 不带天气数据继续生成（intro/交通/着装/安全仍返回），不报错

Given findIconicPlaces 超时
When 降级触发
Then tips-prose 不带 iconic 名自生成，`iconic_places.grounded:false`

Given tips-prose 超时
When 超时触发
Then **MVP-12：** 返回结构化 i18n 错误 `errors.travel_tips_timeout`。**MVP-18 F76 覆盖：** 若 iconic 已有 names → HTTP 200 + 双写 artifacts，intro 可空；2play 仍只 fetch。不静默伪造 iconic 名单。

### US7 — LLM 调用预算

**AC9**

Given 单次 `travel_tips` 调用
When 执行
Then LLM 调用 ≤ 2 次（`findIconicPlaces` 1 次 + tips-prose 1 次）
And findIconicPlaces 返回结果不做二次供应商验证，直接信任

---

# 别名重指向 — `places-agent-alias-repoint`

**类别：** infra · **MCP** · Feature **51** · 完工：**Done**（2026-09-02 as-built：别名重指向骨架流；`arrange_day` 硬删仍属 F45）

**作为** MCP 宿主用户
**我希望** `plan_itinerary` / `trip_plan` / `trips` 别名命中后落到新骨架管线
**以便** 自然语言"plan a trip"/"行程"仍可用，且不依赖将删除的旧 one-shot

### US1 — 别名重指向

**AC1**

Given 别名 `plan_itinerary` / `trip_plan` / `trips` 仍注册
When MCP 宿主调用任一别名
Then handler 调 `makeItinerary`（参数适配），返回骨架而非旧 one-shot JSON
And 旧 `planItinerary`（core/itinerary.ts）在 plan-46 gate 后删除

# MCP 无会话化 + 防编造兜底 — `places-agent-mcp-stateless`

**类别：** infra · **MCP** · Feature **52** · 完工：**Done**（2026-09-02 as-built：`http-transport.ts` stateless `/mcp`）

**作为** MCP 客户端用户（ChatBox / Cursor 等）
**我希望** 服务重启或会话过期后，工具调用仍正常工作，宿主 LLM 不会因会话失败而编造行程
**以便** 规划服务在部署/重启/闲置后保持可用，不输出伪造内容

### US1 — `/mcp` 改 stateless

**AC1**

Given `http-transport.ts` 的 `handleMcp` 改用单例 stateless transport（`sessionIdGenerator: undefined`）
When 客户端发 `initialize` 后 `tools/call`，或**不带**任何 `mcp-session-id` 直接 `tools/call`
Then 响应**不**含 `mcp-session-id` 头，请求被正常处理并返回结果
And 不再出现 `mcp_session_invalid` 错误

**AC2**

Given 服务端重启（内存会话全清）
When 客户端用旧会话 id（或无 id）再次调用
Then 请求仍成功（stateless 不校验会话），无需客户端 re-initialize

**AC3**

Given stateless 模式
When 收到 `GET /mcp`（SSE 上行）
Then 返回 `405 Method Not Allowed`（places-agent MCP 不用服务端发起通知）
And `DELETE /mcp` 返回 `405`（无会话可删）

**AC4**

Given `/sse` legacy 传输仍保留
When 旧客户端走 `/sse`
Then 行为不变（本 ADR 不动 `/sse`）

### US2 — host_instructions 防编造兜底

**AC5**

Given `host_instructions`（F47）已追加"工具失败禁编造"硬约束
When 任何工具调用失败（provider 超时/限流等，即便 stateless 下不再有会话失败）
Then 宿主 LLM **不**用参数知识编造行程/地点/交通
And 告知用户服务暂不可用并请重试；可降级调 `travel_tips` 给通用信息，但不得伪造具体行程

### US3 — 回归

**AC6**

Given stateless 改造完成
When 跑 `make test` + `make quality` + MCP live 探针（initialize → tools/list → tools/call discover_places/make_itinerary/travel_tips）
Then 全绿，且 live 探针确认无 `mcp-session-id` 头、工具结果正确

---

# 填充时钟 — `places-agent-fill-clock`

**类别：** agent · **L3** · Feature **53** · `[e2e-test.md](./e2e-test.md)` S1 / RC1 · 状态：**Done**（2026-09-01）

**作为** MCP 宿主  
**我希望** `display_current_stop` 算出的 `slot.end` 沿 `next_tool_call` 传到下一站  
**以便** 时段按「上一站结束 + 交通」累加，而不是每站重置 10:00

### US1 — 链上传 end_time

**AC1**

Given `display_current_stop` 已算出 `slot.end`  
When 返回的 `next_tool_call` 为 `plan_next_stop`  
Then `arguments.current_stop.end_time` 等于该 `slot.end`  
And 随后 `plan_next_stop` 的 `next_tool_call` 把 `previous_stop.end_time` 传给下一 `display_current_stop`  
And 下一站 `slot.start` ≥ `previous_stop.end_time`（加推荐 leg）  
And 跨日 stay 仍用 `time_from=09:00`，不继承昨日结束时间

---

# 餐位窗口 — `places-agent-meal-window`

**类别：** agent · **L3** · Feature **54** · 依赖 53 · `[e2e-test.md](./e2e-test.md)` S2 / RC2 · 状态：**Done**（2026-09-01）

**作为** 旅行者  
**我希望** 午餐/晚餐 stop 的时段落在合理窗口  
**以便** 不出现 10:00 的午餐

### US1 — meal_slot 锚定

**AC1**

Given stop `kind=meal` 且 `meal_slot` 为 lunch / dinner / afternoon_tea  
When `display_current_stop`  
Then start = max(earliestFeasible, 窗口起点)（lunch 11:30、afternoon_tea 15:00、dinner 18:00）  
And `lunch_window_outside` 仅在仍无法落入午餐窗时作为 note

---

# 骨架超节奏裁剪 — `places-agent-skeleton-pace-trim`

**类别：** agent · **L2** · Feature **55** · `[e2e-test.md](./e2e-test.md)` S4 / RC4-A · 状态：**Done**（2026-09-01）

**作为** 行程调用方  
**我希望** LLM 骨架某日景点超过 pace 上限时确定性裁剪  
**以便** 不因超节奏整单失败

### US1 — 尾部裁 attraction

**AC1**

Given 某日 attraction 数 > `paceStopLimit`  
When `make_itinerary` 校验失败  
Then 从该日尾部去掉多余 attraction（保留 stay / meal）后重校验  
And 通过则返回骨架，不再仅依赖第二次 LLM

---

# 站名归一化 — `places-agent-skeleton-name-match`

**类别：** agent · **L2** · Feature **56** · `[e2e-test.md](./e2e-test.md)` S5 / RC4-B · 状态：**Done**（2026-09-01）

**作为** 行程调用方  
**我希望** 骨架 stop 名与候选池规范名可归一化对齐  
**以便** 本地语言名/大小写差异不导致整单失败

### US1 — 精确优先，归一化回退

**AC1**

Given 候选池含规范名  
When 骨架 stop 名精确不匹配但归一化（NFKC、去空白、大小写）匹配池内一名  
Then 将该 stop.name 改写为池内规范名后通过校验  
And 不使用源码城市别名表，只匹配当次 candidates  
And 臆造名仍失败（交给 Feature 58）

---

# 区域 must_include 展开 — `places-agent-area-expand`

**类别：** agent · **L1/L2** · Feature **57** · `[e2e-test.md](./e2e-test.md)` S3 / RC3 · ADR-042 · 状态：**Done**（2026-09-01）

**作为** 选择一日游区域的旅行者  
**我希望** 该日有多个子景点而非一个区域名 stop  
**以便** 辛特拉/凡尔赛一类日子可用

### US1 — geocode + nearby，禁止百科

**AC1**

Given `must_include` token 无法精确命中候选池 venue  
When `make_itinerary` 前展开  
Then geocode 该 token 后 nearby/`search_places` 拉取子景点并入候选  
And **不**向 `discover-must-see` CATALOG 加城市行  
And 一日游日骨架可排 ≥3 子景点（候选充足时）

---

# make_itinerary 失败 detail — `places-agent-make-itinerary-detail`

**类别：** agent · **L2** · Feature **58** · `[e2e-test.md](./e2e-test.md)` S6 · 状态：**Done**（2026-09-01）

**作为** MCP 宿主  
**我希望** 骨架仍失败时看到校验原文  
**以便** 向用户提示调整天数/必去，而不是空白 `errors.make_itinerary_failed`

### US1 — data.detail

**AC1**

Given `validateSkeleton` 最终仍失败  
When HTTP/MCP `make_itinerary`  
Then envelope `ok:false` 且 `data.detail` 含校验信息  
And `host_instructions` 提示调整必去或天数，禁止编造行程

---

# Stay 角色 — `places-agent-stay-roles`

**类别：** agent · **L3** · Feature **59** · `[e2e-test.md](./e2e-test.md)` Q9 · 状态：**Done**（2026-09-02）

**作为** 行程调用方  
**我希望** 仅日首 origin stay 重置时钟，回程/途中 stay 正常累加  
**以便** 辛特拉花园酒店不再显示 09:30 origin_stop

### US1 — day_origin vs return

**AC1**

Given 同日非首站 `kind=stay`（非 origin 名）  
When `display_current_stop`  
Then 保留 `legs_to_here`、按 prev_end + leg 累加 slot  
And notes 含 `return_stay` 或 `midday_stay`，不含 `origin_stop`

**AC2**

Given 每 day 仅 stops[0] 可为 origin stay  
When `validateSkeleton`  
Then 第二个 origin 同名 stay 或 index>0 的 stay 报错

---

# 交通地理/时长闸 — `places-agent-leg-sanity`

**类别：** agent · **L3** · Feature **60** · `[e2e-test.md](./e2e-test.md)` Q7 · 状态：**Done**（2026-09-02）

**作为** 行程调用方  
**我希望** 脏 geocode / 洲际 directions 不进入时钟  
**以便** 无 39624 分钟与跨午夜乱跳

### US1 — geocode + 闸

**AC1**

Given stop 名裸 geocode 会解析到远距点  
When `plan_next_stop` 带 `city` 与 anchor  
Then geocode 查询含 city；距 anchor >80km 丢弃；duration>180 不进时钟

**AC2**

Given 骨架含与区域 token 等价的单字 attraction  
When `validateSkeleton` 或 trim  
Then 剔除或 retryable 失败

---

# 迟到午餐重座 — `places-agent-late-meal-reseat`

**类别：** agent · **L3** · Feature **61** · `[e2e-test.md](./e2e-test.md)` Q8 · 依赖 F54 · 状态：**Done**（2026-09-02）

**作为** 旅行者  
**我希望** 迟到 lunch 升 dinner 或骨架把 lunch 放 midday  
**以便** 16–17 点不再标 lunch_window_outside

### US1 — 填充层升 dinner

**AC1**

Given `meal_slot=lunch` 且 feasible > 14:30  
When `display_current_stop`  
Then start ≥ 18:00；note=`meal_promoted_to_dinner`

### US2 — 骨架 lunch 位置

**AC1**

Given lunch 排在当日最后一个 attraction 之后  
When `validateSkeleton` 或确定性修复  
Then 前移到 midday 或 retryable 错误

---

# 骨架确定性修复 + 可读超时 — `places-agent-skeleton-deterministic-repair`

**类别：** agent · **L3** · Feature **62** · `[e2e-test.md](./e2e-test.md)` Q10 · 依赖 F55/F56/F59/F61 · 状态：**Done**（2026-09-02 as-built：`reseatStayToDayOrigin` / `dropCityNameStops` + TC-M15 单测）

**作为** 行程调用方  
**我希望** stay/city 坏形态在校验前被确定性修掉，且 LLM 超时时能看到先前校验错误  
**以便** 不再因二次 LLM + 90s 超时误报整单失败

### US1 — stay 确定性前移

**AC1**

Given 某 day 的 stay 不在 `stops[0]` 或有多个 stay  
When `reseatStayToDayOrigin` 后 `validateSkeleton`  
Then 仅保留一个 stay 且位于 index 0；常见坏形态无需 LLM 重试即可通过

### US2 — city 名站剔除

**AC1**

Given attraction/meal 站名归一化等于 destination `city`  
When `dropCityNameStops`  
Then 该站被剔除；骨架仅剩合法 venue

### US3 — 超时含 prior validation

**AC1**

Given attempt 1 校验失败写入 `lastError`，attempt 2 LLM 超时  
When `make_itinerary` 抛错  
Then 消息含 `LLM timed out` **且** 含 prior validation 摘要

**AC2**

Given F59–F61 填充路径  
When 本 Feature 落地  
Then 填充语义不变；不默认提高 `LLM_SKELETON_TIMEOUT_MS`

---

# plan_next_stop fill 契约 — `plan-fill-contract`

**类别：** agent + 2play BFF · Feature **67** · MVP-17 P1 · 状态：**ToDo**

**作为** 行程调用方  
**我希望** 第 2 站起的 `plan_next_stop` 请求体始终通过 Zod（`end_time` 为 `HH:MM`、不传 `revision: null`）  
**以便** 骨架生成后不会以 `errors.invalid_input` 中断填充

### US1 — 时间格式

**AC1** Given 上一站 `slot.end` 为 `9:00` 或 `09:00`  
When BFF 构造下一站 body  
Then `current_stop.end_time` 与 `previous_stop.end_time` 均为 `09:00`（`^\d{2}:\d{2}$`）

### US2 — revision

**AC1** Given `revision` 缺失或非正整数  
When 发送 `plan_next_stop` / `make_itinerary`  
Then body **省略** `revision` 字段（不传 `null`）

**AC2** Given `errors.trip_revision_conflict`  
When BFF 重试  
Then 先 `fetch_trip_details` 读取当前 `revision`，再带新 revision 重试一次

### US3 — 可观测性与 i18n

**AC1** Given Zod `safeParse` 失败  
When dispatch `plan_next_stop`  
Then 服务端日志含 `issues` 路径；用户 envelope 仍为 `errors.invalid_input`（无内部 stack）

**AC2** Given 2play 收到 `errors.invalid_input`  
When Plan 错误区渲染  
Then 使用 `play.errors.invalid_input` 译文（EN/CN/HK/TW），不展示 raw key

---

# 必去地单一源（findIconicPlaces）— `iconic-single-source`

**类别：** agent core + 2play · Feature **69** · MVP-17 P2 · 依赖 F49/F50 · 状态：**ToDo**

**作为** 规划用户  
**我希望** 出行贴士 01 与助手步骤 g 的必去地名单相同，且多天行程含附近一日游地区名  
**以便** 不在 BFF 拼 discover 池当展示真相（ADR-045 / ADR-042）

### US1 — 展示源

**AC1** Given where2play 需要必去地芯片或贴士 01  
When 拉取名单  
Then **只**消费 `travel_tips.iconic_places`（内部 `findIconicPlaces`）；**不**与 `discover_places.inferred_must_see` merge 作为产品名单

**AC2** Given 同一行程 prefetch  
When 助手步骤 g 与贴士 01 渲染  
Then 有序列表字符串相等（同一数组引用或深等）

### US2 — 多天 ungrounded

**AC1** Given `numDays >= 3` 且 pool 空  
When `findIconicPlaces` ungrounded  
Then user prompt 要求同时给出 **附近一日游地区名** 与 **城内地标**；源码 **无** 城市 POI 表（ADR-042）

**AC2** Given discover 对某 iconic 名补搜失败  
When 返回 `inferred_must_see`  
Then 该失败 **不得**覆盖 2play 已拿到的 `travel_tips.iconic_places`

### US3 — Lisbon 主干

**AC1** Given `python3 scripts/e2e-places-agent.py --only 1`  
When 链路完成  
Then `trip_complete`；`travel_tips.iconic_places` 被写入结果 md（展示源基线）

---

# findIconicPlaces 必去地质量 — `iconic-ranking-quality`

**类别：** agent core · Feature **74** · MVP-18 P1 · 依赖 F49 · 状态：**Done**（2026-09-02，夹具测绿）

**作为** 任意目的地的规划用户  
**我希望** 必去名单按**知名度**和**空间多样性**（多天含一日游尺度）排序，且全世界同一套逻辑  
**以便** 质量不靠为某一城市点名过关

### US1 — 无城市表、无城市验收

**AC1** Given 实现与测试  
When 审查源码与用例  
Then **不**增长 per-city POI 表；**不**出现「某城 live 必须含某镇」类 AC 或 expected 字符串

### US2 — 热度

**AC1** Given 合成 attraction 池：部分卡片 `user_ratings_total` 显著更高  
When grounded 排序 / 再选  
Then 高热度名进入截断后的名单（具体名用夹具，非真实城市）

### US3 — 多天空间多样性

**AC1** Given `numDays >= 3` 且夹具坐标含「中心簇」与「外围簇」（相对虚构 city geocode）  
When 合并 iconic 名单  
Then 至少一名落在外围簇；不得 100% 落在中心小半径内

**AC2** Given ungrounded `numDays >= 3`  
When 构造 LLM prompt  
Then 要求城内地标与附近一日游目的地；prompt **不**枚举真实城镇名

---

# 宿主逐步 fetch_trip_details — `trip-host-fetch`

**类别：** agent 契约 + 2play · Feature **75** · MVP-18 P0 · 依赖 F64 · 状态：**Done**（2026-09-02）

**作为** where2play  
**我希望** places-agent 每步写入 Trip 后，用 `fetch_trip_details` 取当前 UI 所需切片  
**以便** 芯片、骨架、行程卡与账本一致，而不是用写工具的 LLM 响应当展示真相

### US1 — 字段切片

**AC1** Given 刚完成 `make_itinerary`  
When 2play 需要骨架预览  
Then `fetch_trip_details` `fields: ["skeleton"]`（可含 `trip_id`/`revision`），UI 列表来自该切片

**AC2** Given 刚完成一次 `plan_next_stop`  
When 更新行程卡  
Then fetch `filled`（及所需 `cursor`），不以仅 NDJSON 本地拼装为唯一真源

**AC3** Given 刚完成 `travel_tips` 写 artifacts（F76）  
When 助手步骤 g 或贴士 01  
Then fetch `artifacts`；`iconic_places` 与账本一致

**AC4** Given Plan 页任何行程相关区块（含贴士四卡、签证、骨架、填站）  
When 渲染  
Then 不以 BFF OPENAI_CN 或写工具响应里的散文为真源（ADR-046 D6）

### US2 — 编排

**AC1** Given 写工具返回 `trip_id` + `revision`  
When 下一步写  
Then BFF 带上该对；冲突则 fetch 再写（延续 F67 AC2）

---

# artifacts：travel_tips 与 visa_requirement — `artifacts-tips-visa`

**类别：** agent · Feature **76** · MVP-18 P0 · 状态：**Done**（2026-09-02；技术设计见 agent-design §22.3）

**作为** 行程账本  
**我希望** `travel_tips` 与 `visa_requirement` 把结构化结果写入 `artifacts`  
**以便** 2play 只 `fetch_trip_details`，不为贴士/签证再跑 LLM 散文、也不把写工具 HTTP 体当 UI

### US1 — tips 双写与超时

**AC1** Given `travel_tips` 成功或部分成功  
When dispatch 返回  
Then `dualWriteTrip` 含 `artifacts.tips.iconic_places`（及已有散文/天气若有）

**AC2** Given 散文 LLM 超时但 iconic 分支已有 names  
When 工具结束  
Then HTTP **200**；账本仍有 iconic；intro 可空

**AC3** Given 2play 渲染贴士或步骤 g  
When 取数  
Then 只读 fetch `artifacts`；测试禁止断言 UI 绑定 `travelTips()` HTTP 字段为展示源

### US2 — visa 双写

**AC1** Given `visa_requirement` 返回结构化签证（adapter，非 LLM）  
When dispatch  
Then 写入 `artifacts.visa`；不覆盖已有 `artifacts.tips`

**AC2** Given 2play 签证卡或出行建议签证块  
When 渲染  
Then 数据来自 fetch `artifacts.visa`，不是 `POST /v1/visa_requirement` 响应体

---

# 助手时刻高容错 — `intake-time-coerce`

**类别：** agent + 2play · Feature **77** · MVP-18 P0 · 依赖 F67 · 状态：**Done**（2026-09-02）

**作为** 使用行程助手的用户  
**我希望** 用口语说出出发时刻仍能规划  
**以便** 智能体不因 `7:00 am` 触发 `invalid_input`

### US1 — ABC

**AC1** Given 步骤 c 输入 `7:00 am` / `7am` / `早上七点` / `七点半`  
When 合并进 `timeFrom`  
Then 内部值为 `07:00` 或 `07:30`

**AC2** Given 无法解析的字符串  
When 提交步骤 c  
Then 使用 `09:00`，不把原串送给 agent

**AC3** Given `time_from` 或 `end_time` 为 `9:00`  
When agent `plan_next_stop`  
Then preprocess 为 `09:00` 且 200（非 400）

---

# make 墙钟与失败可恢复 — `make-wall-clock`

**类别：** agent + 2play BFF · Feature **78** · MVP-19 · 状态：**Done**

**作为** 规划用户  
**我希望** `make_itinerary` 在网关断开前结束，或失败后仍能读到已落库骨架  
**以便** 不会看起来像「每天只有酒店」

### US1

**AC1** Given 工具超时配置  
When 与反向代理 / 2play `maxDuration` 比较  
Then agent 超时更短；超时错误含 prior validation（延续 F62）

**AC2** Given make HTTP 非 200  
When 2play 已有 `trip_id`  
Then **先** `fetch_trip_details(skeleton)`；若每天 ≥1 非 stay 则视为成功并继续 fill；否则 i18n 错误，不进入 filling

**AC3** Given 校验失败的 stay-only 骨架  
When dispatch  
Then 不作为 200 成功写入供 UI 当完成态

---

# 池后热度打标 — `iconic-from-pool-heat`

**类别：** agent · Feature **79** · MVP-19 · 状态：**Done**  
**依赖：** 不扩 CATALOG

**作为** 步骤 g 用户  
**我希望** 芯片来自供应商池里评论数最高的若干 attraction  
**以便** 前 5 项含可核验热门点

### US1

**AC1** Given discover 类目搜索已返回带 `user_ratings_total` 的合成池  
When Phase B 打标  
Then 内部 `findIconicPlaces({ pool })` 按评论数（缺则 rating）降序打 `must_see`；默认 cap 为请求 `max_number` 否则 5；不调用无池 LLM；不另搜附近热点

**AC2** Given slim 入库  
When fetch `candidates`  
Then 卡片仍有 `user_ratings_total` / `rating`（供应商有则保留）

**AC3** Given 非目录城市与热门城市  
When 同一代码路径  
Then 无 per-city 表；测试禁止硬编码真实镇名 expected

---

# 骨架必去只认站名 — `skeleton-stop-must-include`

**类别：** agent · Feature **80** · MVP-19 · 状态：**Done**

**作为** 行程校验  
**我希望** 用户必去出现在 stop 名上，且池非空时每天不只有酒店  
**以便** 主题句不能冒充已安排

### US1

**AC1** Given `must_include: ["贝伦塔"]` 且 `day_theme` 含贝伦、stops 仅 stay  
When `validateSkeleton`  
Then 失败（retryable）

**AC2** Given 池 ≥3 个 attraction  
When 某日 stops 全部 `kind=stay`  
Then 失败

**AC3** Given 中文必去与英文池名 coverage 命中  
When 合法骨架  
Then 通过；站名为池内官方名

---

# Trip 无 watch — `trip-no-watch`

**类别：** agent 合同 + 2play · Feature **81** · MVP-19 · 状态：**Done**

**作为** 宿主  
**我希望** 规格写明没有推送，必须同流 fetch，且 session 记住 `trip_id`  
**以便** 断流后仍能续读账本

### US1

**AC1** Given agent-design §24.5  
When 审查  
Then 明确不做 SSE/Redis 推送；观察者只有 `fetch_trip_details`

**AC2** Given 2play `PlanSessionCache`  
When upsert  
Then 含 `trip_id` 与 `revision`（criteria 或独立列）

**AC3** Given `GET /api/plan/current`  
When 有未过期 cache 且含 trip_id  
Then 可再 fetch skeleton/filled 恢复，不丢账本

---

# iconic 与用户必去正交 — `must-see-orthogonal`

**类别：** agent + 2play · Feature **82** · MVP-19 · 状态：**Done**

**作为** 账本  
**我希望** 8 处热门打标与 3 处用户指定分开存  
**以便** 用户选 3 处不会抹掉 8 处 `must_see`

### US1

**AC1** Given 池上 8 张 `must_see`  
When `make_itinerary` 带 `must_include` 3 名  
Then 写后 fetch：仍 ≥8 个 `must_see`（除非补搜只增加）；`constraints.must_include` 长度为 3

**AC2** Given 用户名不在池  
When 补搜命中  
Then 新卡可 `user_requested`；不得把其他卡 `must_see` 设 false

**AC3** Given 步骤 g  
When 渲染芯片  
Then 名单 = `must_see`（热门）；约束条用户必去 = `mustInclude`；二者可重叠但不是同一字段覆盖

---

# 骨架过滤锚点是目的地 — `skeleton-geo-anchor-city`

**类别：** agent · Feature **83** · MVP-21 S2 · 状态：**Done**（2026-09-03，用户确认可用）  
**ADR：** [ADR-048](../../workspace-specs/adr/ADR-048-skeleton-geo-anchor-is-destination.md)

**作为** 行程调用方  
**我希望** 错误的酒店坐标不会把目的地候选滤空，且全住宿骨架不能当成功  
**以便** 直连与 2play 都不会 200 写入「每天只有酒店」

### US1

**AC1** Given 里斯本坐标候选池 ≥3 且 `origin` 为远离城市的 lat/lng（如澳门一带）  
When `enrichMakeItineraryInput` / `make_itinerary`  
Then 80km 过滤锚点为 **city**（或候选质心），池不被掏空；过远 origin 坐标被丢弃、保留 name

**AC2** Given 过滤前 attractions ≥3  
When LLM 或夹具产出某日仅 stay  
Then `validateSkeleton` 失败（retryable）；HTTP 不得 200 成功落库该骨架

**AC3** Given 过滤前池很小（<3）且无景点  
When stay-only  
Then 行为与现网「池不足」一致（允许或失败须在测试中写明）；**不**用 per-city 酒店表

---

# 可规划景点门槛 + 内部 patchTrip — `eligible-attraction`

**类别：** agent · Feature **84** · MVP-22 S1 · 状态：**Done**（2026-09-04；用户确认 usable）  
**ADR：** [ADR-049](../../workspace-specs/adr/ADR-049-verified-attraction-and-meal-slots.md)

**作为** 规划调用方  
**我希望** 合称/名胜区不进候选池与芯片，对不上的必去被降级，漏网脏卡能从本 trip 池删掉  
**以便** 杭州类目的地不会因脏 `must_include` 整单 502

### US1

**AC1** Given 卡片名为「西湖十景」或「…风景名胜区」，或无坐标，或类型为餐馆  
When `isEligibleAttraction`  
Then 不合格。有 id（或 slim 无 sources）、有坐标、非合称、非餐馆 → 合格。不打 details。无 per-city 表。

**AC2** Given discover Phase A 池含合称与合格景点  
When `discover_places` 写入 candidates / 打标  
Then 合称不在 `candidates.places`、不打 `must_see`。`must_include` 合称不补搜、不走 F57 展开。

**AC3** Given `must_include` 含合称，池内其余为合格景点  
When `validateSkeleton` / `make_itinerary`  
Then 合称被降级（不要求骨架覆盖）；不因该项 502。仍覆盖能对上 eligible 名的必去（F80）。

**AC4** Given Trip 池已有合称卡  
When 内部 `patchTrip`（`candidatesWrite=replace`）写入过滤后池  
Then fetch `candidates` 不再含该卡；`revision` 升。HTTP `patch_trip` 仍只改 constraints，不得改池。

---

