# places-agent — 测试策略

扩展工作区 **common-test-strategy** 基准。本文件新增领域固定数据、用户旅程及更严格的质量门控。**不**裁减测试金字塔层级、跳过身份验证测试，或降低质量检查清单要求。

| 绑定项 | 位置 |
| --- | --- |
| 基准 | `common-test-strategy`（常驻规则） |
| 用户故事与验收标准 | [`agent-stories.md`](./agent-stories.md) — 每个 Gherkin 场景均映射到自动化测试 |
| **用户测试用例（HTTP 自动化；ChatBox 已暂停）** | §13–§18 — TC-H01–H15 位于 `tests/http-tc-h.test.ts`；ChatBox 手动用例已推迟 |
| 架构 / 信任 | [`../../workspace-specs/2.architecture.md`](../../workspace-specs/2.architecture.md) |
| HK / TW 输出 | [`../../workspace-specs/knowledge/i18n/hk-tw-output.md`](../../workspace-specs/knowledge/i18n/hk-tw-output.md) |
| Admin E2E 实践 | Python Playwright，真实 Chromium，`networkidle`（webapp-testing 技能） |

**状态：** 活跃 — §1、§1.1（供应商实时完成标准）和 §5 中的诚实门控绑定完成标准（[ADR-021](../../workspace-specs/adr/ADR-021-live-vendor-no-fixture.md)）。AC/用户故事状态使用 `live-honest` / `fail-closed` / `fixture-only`，绝不以 `implemented` 代替上述状态。

---

## 1. 相较于 common-test-strategy 的更严格变化点

| 变化点 | 规则 |
| --- | --- |
| 双访问通道 | 功能 11：同一工具在 **HTTP 和 MCP** 上具有相同含义。不得只测试一个通道就声称功能完成。 |
| Agent id | 每个 HTTP 工具/健康检查响应体及 MCP `initialize` 必须断言 `agent` / `serverInfo.name` 恰好为 `places-agent`（不本地化）。 |
| 两种身份验证模式 | 调用方 API key（HTTP/MCP）和管理员会话（运维 UI）需**分别**测试。管理员 cookie 不得授权工具调用；调用方 key 不得授权管理员页面。 |
| 四种语言环境 | 管理后台界面及 Agent 展示字符串：目录 `EN`、`CN`、`HK`、`TW`。HK 与 TW 的措辞在固定术语键上必须不同（如出租车、`weather.wmo.80`）。回退顺序为语言环境 → `EN` → key，**绝不**在 HK↔TW 之间互相回退。天气测试不得将 Open-Meteo 英文文档字符串视为 `CN`/`HK`/`TW` 文案。 |
| 禁止捏造地点 | 搜索/详情/行程测试，在供应商返回空结果或失败时，如果 Agent 捏造 POI，则测试不得通过。 |
| Tripadvisor | 契约测试必须证明 Google `place_id` **未**作为 id 发送给 Tripadvisor。 |
| 密钥 | 地图供应商 key、`GMAPS_MCP_BEARER`、Quanzil、Resend、会话密钥及调用方 key 明文（除一次性复制 UI 外）不得出现在浏览器存储、MCP/HTTP 错误响应体或日志中。 |
| 默认 CI | 仅使用 fixture / 沙盒供应商。实时 AMAP / Google / Tripadvisor / Quanzil / Resend / Open-Meteo 均为**可选加入**任务。 |
| 供应商诚实性（ADR-021） | `PLACES_VENDOR_MODE=live` 不得返回 fixture 卡片、Tripadvisor fixture 评分或 Open-Meteo fixture 预报。缺少实时客户端 → 跳过/省略，绝不回退到 fixture。供应商故事未完成，直到注入式 fetch 测试**以及**可选加入的真实 key 探测（`verify-amap-live`、`test-live` 等）均断言无 `fixture_` id 为止。 |

通用质量检查清单仍完整适用。额外项目见 §11。

### 1.1 供应商实时完成标准（DoD，具有约束力）

扩展 `common-test-strategy` 和 [ADR-021](../../workspace-specs/adr/ADR-021-live-vendor-no-fixture.md)。**不**裁减测试金字塔层级或通用质量检查清单。

一项供应商能力**完成**，当且仅当以下**所有**条件均为真：

1. `PLACES_VENDOR_MODE=live` 时选择实时客户端。
2. 默认 CI 使用注入式 `fetchFn` / 录制 HTTP — 每次 PR 不调用实时 key。
3. 诚实测试：实时 + 缺少或失败的客户端 → 跳过/省略，**零** fixture 卡片、Tripadvisor fixture 评分或 Open-Meteo fixture 三元组（`weather_code: 80` 加 24/18 °C）。仅 WMO `80` 本身是真实阵雨。
4. 可选加入探测（`make verify-*-live` 或 `make test-live`）命中真实主机，若出现 `fixture_`（或天气为预设 fixture 特征值）则失败。
5. 运维人员（或附在用户故事中的脚本输出）已见到**真实地图标记**，而不仅是 `make test`。
6. AC/用户故事状态为 **`live-honest`**、**`fail-closed`** 或 **`fixture-only`**，绝不以 **`implemented`** 代替条件（1）–（5）。

**诚实矩阵**（探测最近一次通过时更新状态列）：

| 供应商 | 实时客户端 | 诚实测试 | 可选加入探测 | 状态 | 截至 |
| --- | --- | --- | --- | --- | --- |
| AMAP 搜索 | 是 | 实时无 `fixture_` | `make verify-amap-live` | live-honest | 2026-08-19 |
| Google 搜索 | 是 | Worker/直连测试 | `make test-live` / Google 标记 | live-honest | 2026-08-19 |
| Tripadvisor 增强 | 是 | 实时无 fixture 评分 | `make verify-tripadvisor-live` | live-honest | 2026-08-19 |
| Open-Meteo | 是 | 实时：客户端为 null 时抛出未配置；HTTP 失败时省略天气 | `make verify-open-meteo-live` | live-honest | 2026-08-19 |

---

## 2. 范围

| 包含 | 排除 |
| --- | --- |
| places-agent **工具**（HTTP + MCP） | what2eat / where2play 页面（属于各自应用的策略） |
| 同一进程上的运维**管理后台** | 视觉像素级 QA（除非 AC 要求截图） |
| 管理员用户、调用方 API key、指令、i18n | 部署 / Portainer / Cloudflare |
| 隔离的测试数据库 / 卷 | 生产数据 |

两个访问面，一个进程（ADR-012）：为契约测试和 E2E 启动**一个** places-agent 服务器。

---

## 3. 测试金字塔（本产品）

目标比例约为 70 / 20 / 10。

| 层级 | 放置内容 | 典型工具 |
| --- | --- | --- |
| 单元 / 组件（约 70%） | 供应商响应解析器、合并/聚类、Tripadvisor 名称+位置匹配、语言环境映射（`HK`→`zh-HK`）、目录查找、行程节奏计算、key 哈希 | 服务语言中的快速测试 |
| 集成 / 契约（约 20%） | HTTP 工具路由、MCP 初始化 + 工具、管理员会话 API、Resend 沙盒、用户/key 数据库 | 真实测试数据库；fixture 地图 HTTP |
| E2E（约 10%） | 少量**管理员**旅程，在真实浏览器中运行 | Python Playwright + Chromium 无头模式 |

**不得**仅通过管理后台 UI 驱动搜索/行程测试。工具通过 HTTP/MCP 断言。浏览器覆盖运维 UX（功能 14–19）。

---

## 4. AC → 测试映射（TDD）

1. 选取**一个**用户故事（增量交付）。
2. 对 [`agent-stories.md`](./agent-stories.md) 中的每个 Gherkin 场景：
   - **Red** — 编写断言 Then（key、`agent: "places-agent"`、空列表、状态码）的测试。
   - **Green** — 最小实现。
   - **Refactor** — 保持绿色。
3. 测试命名采用 `should_[expected]_when_[condition]` 或等价格式。
4. 每个测试只测一个行为；遵循 AAA 模式；顺序无关。

类别 **agent** 场景 → 单元 + HTTP/MCP 契约（功能 11 适用的两个通道）。
类别 **app** 场景 → 有逻辑时用单元/组件 + **Playwright** 覆盖用户可见路径。

---

## 5. 单元与组件测试

至少覆盖：

- `providers[]` 验证（未知供应商、缺少凭据 → 跳过/原因 key，不静默替换）。
- Google 传输（ADR-017）：覆盖于 [`src/adapters/google/live.test.ts`](../src/adapters/google/live.test.ts) — fixture **直连成功**（不调用 Worker MCP）；**直连出口失败 → Worker MCP 成功**，且溯源仍为 `GOOGLE_MAPS`（`sources[]` 中绝不出现 `GMAPS_MCP`）；**直连失败 + MCP 未配置** → 跳过，不用 AMAP 填充。默认 CI 使用模拟 fetch + 录制 MCP JSON-RPC（不需要实时 `GMAPS_MCP_BEARER`）。**手动开发（VPN 开启时）：** 设置 `GOOGLE_DIRECT_FORCE_FAIL=1` 或黑洞 `GOOGLE_MAPS_BASE_URL` + 实时 `GMAPS_MCP_*`；运行 **`scripts/verify-gmaps-fallback.sh`** 或 TC-H15 curl。**生产环境绝不**设置 force-fail（`NODE_ENV=production` 时启动时拒绝）。
- AMAP 实时 Web 服务：覆盖于 [`src/adapters/amap/direct.test.ts`](../src/adapters/amap/direct.test.ts) — 注入式 `fetchFn`（默认 CI 不使用实时 `AMAP_API_KEY`）。断言 `lng,lat` 周边、`types=050000`、菜系映射（`barbecue` → `烧烤`）、地址 → 地理编码再周边搜索、WGS `near` → 坐标转换、`status != 1` 抛出异常、`pois` 为空 → `[]`，卡片 `crs=GCJ-02` 且无 `fixture_` id。HTTP 注入于 [`tests/http-tc-h.test.ts`](../tests/http-tc-h.test.ts)。**可选加入实时 key：** `make verify-amap-live` / [`scripts/verify-amap-live.sh`](../scripts/verify-amap-live.sh)。
- 地点卡片 `sources[]` / 合并 / `primary_provider`。
- 导航：仅生成不含密钥的深度链接。
- 地理编码输入清洗。
- 语言环境：`languageCode` 映射；目录缺失 → `EN` → key；HK 出租车 ≠ TW 出租车 fixture。
- 行程偏好 id（tight/medium/relaxed、premium/budget、`transit_preferred`），不调用实时 LLM。
- 调用方 key 哈希/验证；重新生成使上一个密钥失效。
- 供应商诚实性（ADR-021）：[`tests/vendor-honesty.test.ts`](../tests/vendor-honesty.test.ts) — 无 `TRIPADVISOR_API_KEY` 的实时模式不得附加 fixture 评分；无可用客户端的实时 Open-Meteo 不得返回 fixture `weather_code: 80`。
- Tripadvisor Terra 实时增强：覆盖于 [`src/adapters/tripadvisor/direct.test.ts`](../src/adapters/tripadvisor/direct.test.ts) — 注入式 `fetchFn`（默认 CI 无实时 Terra key）。断言周边 `lat`/`lon`/`unit=KM`，无 `location_id`，URL 上无 Google/AMAP 原生 id，名称匹配时附加评分，不匹配时保留卡片，HTTP 失败时保留卡片 + 跳过，每个共享标记只调用一次周边接口。HTTP 注入于 [`tests/http-tc-h.test.ts`](../tests/http-tc-h.test.ts)。**可选加入实时 key：** `make verify-tripadvisor-live`。
- Open-Meteo 实时预报：覆盖于 [`src/adapters/open-meteo/direct.test.ts`](../src/adapters/open-meteo/direct.test.ts) — 注入式 `fetchFn`（默认 CI 不调用实时 Open-Meteo）。断言 `latitude`/`longitude`/`daily`/`timezone=auto`，日期行映射到 `weather_code` + 温度，HTTP 失败抛出异常，缺少日期返回 null。**可选加入：** `make verify-open-meteo-live`。
- 定时行程（`detail: "timed"`）：[`tests/itinerary-timed.test.ts`](../tests/itinerary-timed.test.ts)、[`tests/meal-windows.test.ts`](../tests/meal-windows.test.ts)、[`tests/place-filters.test.ts`](../tests/place-filters.test.ts)、[`src/core/itinerary-weather.test.ts`](../src/core/itinerary-weather.test.ts) — 1-based `day_index`、城市 `search_anchor`、广场/地标过滤、晚餐 18:00–20:00 + 下午茶填充、餐饮去重、CN 时优先 AMAP、语言环境为 CN/HK/TW 或名称含 CJK 时拼装中文查询、起点+终点跨多天时使用廊道标记、丢弃 `> 300` 分钟的腿段。默认 CI 不调用实时 Google。**运维 UAT：** §16 中的 HTTP 套件（T01–T07、D01/D01a、G01、F02、A01、M03–M05、P01）。

**定时 UAT 进程环境：** 如需实时 Directions，在进程环境中以 `GOOGLE_DIRECT_FORCE_FAIL=0` 启动 Agent（先 `make down`，再 `GOOGLE_DIRECT_FORCE_FAIL=0 make up`）。已导出的 `=1` 不会被 `.env.local` 覆盖。**不要**用 `scripts/with_server.py` 包裹完整 UAT 套件——该辅助脚本在被包裹命令退出时会停止服务器。

**允许使用 mock：** 时钟、随机数、付费/不可逆第三方（Resend、实时地图、Quanzil），前提是未配置沙盒。
**不允许：** 发布仅能通过进程内模拟成功响应的搜索/详情功能。仅通过 fixture 的测试**不构成**实时供应商完成（ADR-021）。

---

## 6. 集成 / 契约测试

### 6.1 HTTP 工具

- **TC-H 可追溯性：** [`tests/http-tc-h.test.ts`](../tests/http-tc-h.test.ts) 中每个用例对应一个自动化测试（调用真实 `/v1/*` 路由处理器；默认 CI 使用 fixture 模式）。
- 需要调用方 API key 验证（功能 12）。缺少/无效/已吊销 → 带 key 的错误（`errors.caller_unauthorized`），无工具结果。
- JSON `agent` 在健康检查/就绪检查和工具响应中均为 `places-agent`。
- 正常路径 + 空结果 + 供应商失败（原因 key `errors.provider_failed`）。
- 测试数据隔离；测试间重置。

### 6.2 MCP

- 工具名称、输入和结果 key 与 HTTP 相同（功能 11）。
- `initialize` → `serverInfo.name === "places-agent"`。
- MCP 传输上使用调用方 API key；无 key 时拒绝。

### 6.3 管理员 API（同源）

- 登录后需要会话 cookie；公开首页和指令页无需会话即可访问。
- 邀请/重置通过 Resend **沙盒**或默认 CI 中的捕获测试传输发送。
- 调用方 key 创建/重新生成时仅返回**一次**明文；后续 GET 不得返回明文。
- 地图供应商环境 key 不得出现在管理员 JSON 中。

### 6.4 默认 CI 中的供应商

对 AMAP / Google / Tripadvisor / Open-Meteo 使用录制或沙盒 HTTP（已批准 fixture）。AMAP、Tripadvisor 和 Open-Meteo 的实时单元测试注入 `fetchFn`；默认 CI 中不得调用 `restapi.amap.com`、`terra.tripadvisor.com` 或 `api.open-meteo.com`。实时 key/主机仅在明确可选加入任务中使用（`make test-live`、`make verify-amap-live`、`make verify-tripadvisor-live`、`make verify-open-meteo-live`），绝不在每次 PR 中使用。

Google Worker MCP 测试使用 **fixture MCP**（或录制的 Streamable HTTP）。默认 CI 不得要求实时 `GMAPS_MCP_BEARER`。不得在断言中将 Worker 视为第四个供应商。

---

## 7. E2E — 运维后台（Playwright）

管理后台 UI 是**动态**应用。启动真实 places-agent 进程，然后进行自动化操作。

**测试框架（webapp-testing）：**

1. 在自行创建运行器之前，先运行 `python scripts/with_server.py --help`。
2. 一个服务器：places-agent 进程（管理员 HTML + API + HTTP 工具）。
3. 脚本使用 `playwright.sync_api`，**Chromium `headless=True`**，然后 `page.goto` + **`wait_for_load_state("networkidle")`**（或显式 role/test id）后再检查/断言。
4. 不使用硬编码 sleep 作为主要等待方式。
5. 脚本结束时关闭浏览器。

**选择器：** 使用 `get_by_role`、无障碍名称或 `data-testid`。优先使用 **i18n key / test id**，而非英文文案。若需断言可见文本，先设置语言环境并使用对应目录。

**关键旅程（最少）：**

| 旅程 | 覆盖功能 |
| --- | --- |
| 公开首页 → 指令页 | 功能 14、18；页面标明 Agent id `places-agent` |
| 以默认管理员登录 → 落地页（导航 + 问候语） | 功能 15、16 |
| 登录失败 / 注册已禁用 | 功能 15 失败路径；悬停时显示客服微信二维码 |
| 接受邀请 → 登录 → 落地页 | 功能 15 US4 — token → 个人信息表单 → 成功 → 以新用户名登录；**提交后 URL 不含凭据** |
| 创建调用方 API key、复制密钥，然后使用该 key 发起 HTTP 调用 | 功能 17 + 12 |
| 切换语言环境 `EN` → `HK`（冒烟测试） | 功能 19 |

**视口：** 桌面端和一个移动端宽度（针对有变化的管理员页面）。键盘：登录及主要操作可通过键盘访问；Escape 关闭对话框（如有）。

**侦察：** 若选择器未知，在 `networkidle` 后截图 + DOM 检查，然后将稳定选择器锁定到测试中——不保留布局脆弱的 CSS 选择器。

消费者地点搜索**不是**管理员 E2E 路径。**HTTP** 用户用例已在 [`tests/http-tc-h.test.ts`](../tests/http-tc-h.test.ts) 中自动化（`make test`）。**ChatBox MCP** §15 中的手动用例，在对应 HTTP 用例在 CI 中通过后，**已暂停/推迟**至发布时。

### 7.1 E2E — 调用方模拟（HTTP API）

除管理后台 UI E2E 外，Agent 还必须从**调用方视角**进行测试——模拟 what2eat、where2play 和 chatbox 客户端的真实使用场景。

**原则：**
- **E2E 中无 fixture** — 调用方模拟测试针对实时（或沙盒）供应商运行，绝不使用 fixture 模式
- **无硬编码预期结果** — 验证结构、字段是否存在及地理准确性，而非精确的场所名称
- **随机化输入** — 使用真实地址和查询词池，避免对 fixture 数据过度拟合

**测试框架：**

1. 以 `PLACES_VENDOR_MODE=live`（或有沙盒时使用沙盒）启动 places-agent
2. 通过管理员 API 创建调用方 API key
3. 使用 Bearer 认证向 `/v1/*` 端点发送 HTTP 请求
4. 验证响应结构、地理准确性及字段完整性

**调用方画像：**

| 调用方 | 端点 | 典型输入 | 验证方式 |
| --- | --- | --- | --- |
| what2eat（餐饮） | `POST /v1/search_restaurants` | 中文地址 + 菜系 + 预算 | 结果在输入位置 5km 范围内；供应商支持时 `photos` 非空；评分为数字 |
| where2play（地点） | `POST /v1/search_places` | 城市 + 活动类型 | 结果在正确城市内；`sources[]` 非空 |
| chatbox（自然语言） | `POST /v1/chat` | 中文/英文自由文本问题 | 响应语言与请求匹配；无捏造场所 |
| 任意调用方 | `POST /v1/plan_itinerary` | 城市 + 日期 + 节奏 | 天数与日期范围匹配；餐饮在正确时间段；无重复场所 |

**地理准确性门控：**
- 中国地址的搜索结果必须返回中国境内场所（纬度 18–54°N，经度 73–135°E）
- 非中国地址的搜索结果不得返回中国场所（除非地址临近边界）
- `provider` 字段必须与实际数据来源匹配

**字段完整性门控：**
- `name`、`address`、`location`、`provider`、`sources[]` — 始终存在
- `photos` — 供应商支持时存在（Google 带字段掩码，AMAP 带 biz_ext）
- `rating` — 供应商返回时存在

**测试用例：** 见下方 §19（TC-E2E-01 至 TC-E2E-08）。

**CI 集成：** 可选加入门控 `make test-e2e-caller` — 需要实时供应商 key。不在默认 PR CI 中运行。

---

## 8. i18n 与 HK vs TW

- 测试断言 **key**（及插值数据如用户名），而非仅英文合约。
- 至少有一条路径为默认 `EN` 解析目录。
- HK vs TW：使用 fixture 验证固定旅行术语的差异；HK 缺失的 key 不得解析为 TW。
- 协议 id（`places-agent`、`AMAP`、`GOOGLE_MAPS` 等）保持字面量。
- Agent 功能 13：HTTP/MCP 测试传入 `locale` / 双语组合；供应商 fixture 遵守 `languageCode`，不改写官方名称。

---

## 9. CI 与命令

| 门控 | 触发时机 | 内容 |
| --- | --- | --- |
| 默认 PR / push | 始终 | 单元 + 契约（fixture 供应商）+ `http-tc-h.test.ts` 中的 **TC-H01–H15** + 管理员 Playwright 关键旅程 |
| `make test-live` | 可选加入 | `scripts/verify-gmaps-fallback.sh`（TC-H15 实时 Worker MCP）；真实地图/Quanzil/Resend 沙盒或实时 key；非破坏性 |
| `make verify-amap-live` | 可选加入 | `scripts/verify-amap-live.sh` — 实时 AMAP 搜索（`query=烧烤` + 站点地址）；断言 `AMAP` 且无 `fixture_` id |
| `make verify-tripadvisor-live` | 可选加入 | `scripts/verify-tripadvisor-live.sh` — 附带 `GOOGLE_DIRECT_FORCE_FAIL=0` 的辅助进程（不复用仅 Worker 的守护进程）；在 HK 标记上实时 Terra 增强；断言数字 `tripadvisor.rating` 且无 fixture Ichiran URL |
| `make verify-open-meteo-live` | 可选加入 | `scripts/verify-open-meteo-live.sh` — 在 HK 标记行程上实时预报；断言数字 `weather_code` 0–99 且非 fixture 特征值（80 + 24/18 °C） |
| 运维 UAT 定时行程 | 每个故事 A/B/C | HTTP `POST /v1/plan_itinerary`，`detail:"timed"`；运维人员提供起点/边界；Agent 输出 JSON；运维人员判断。故事 A 套件：Hyatt Lisbon，`2026-08-25`→`2026-08-30`，relaxed/premium，`GOOGLE_MAPS` |
| `make test-e2e-caller` | 可选加入 | `scripts/test-e2e-caller.sh` 中的 TC-E2E-01~08 — 实时供应商调用方模拟；中国餐厅、自动供应商、东京 POI、成都行程、对话、照片、混合语言、餐饮上下文 |
| 覆盖率 | 技术栈支持时 | 关键路径 **100%**；总体 **≥ 80%** |

### 覆盖率测量（Vitest v8）

`make test-coverage` 运行 `npx vitest run --coverage`。包含范围为 `src/**/*.{ts,tsx}`。

**总体门控：** 语句、行、函数及分支覆盖率均 **≥ 80%**。

**明确排除的覆盖路径（列出，非静默）：**

| 路径 | 原因 |
| --- | --- |
| `**/*.test.ts(x)` | 测试文件本身 |
| `src/adapters/**/fixture.ts`、`src/adapters/fixtures.ts` | Fixture 供应商；默认 CI 诚实性通过实时/诚实测试验证，而非 fixture 文件行覆盖 |
| `src/ui/**` | 管理后台 UI；关键旅程使用 Playwright（`make test-e2e`） |
| `app/**` | 不在 `include` 范围内（位于 `src/` 外）；同管理后台 UI |
| `src/adapters/google/mcp-client.ts` | Worker MCP 客户端；默认 CI 使用注入替身；实时探测为 `make test-live` |
| `src/adapters/**/config.ts`、`src/adapters/**/live.ts` | 环境变量加载器 / 适配器接线 |
| `src/auth/admin.ts`、`src/auth/session.ts`、`src/auth/mail.ts` | Next cookies / Resend；由管理员 E2E 和相邻模块的身份验证单元测试覆盖 |
| `src/agent/loop.ts` | 自然语言对话循环；HTTP 对话契约在 Vitest 中；默认 CI 使用 LLM fixture |
| `scripts/run-tc-c07.ts`、`scripts/run-tc-c08.ts` | 不在 Vitest 中；ChatBox TC-C 已推迟 |

**核心文件底线**（`vitest.config.ts` 中的 glob 阈值）：`place-filters.ts` 全部指标 100%；`amap/direct.ts` 行覆盖 100%；`itinerary.ts` / `itinerary-timed.ts` / `tools.ts` 行覆盖 ≥90%（在穷举分支 100% 尚不实际的情况下，分支底线为 75–80%）。

Agent 核心使用 Vitest 覆盖率。管理后台 UI 使用 Playwright。

### 默认质量门控

```
make quality
```

等价于 `make typecheck && make lint && make test-coverage && make test-e2e`。

| 命令 | 作用 |
| --- | --- |
| `make test` | 仅快速 fixture Vitest（无浏览器，无覆盖率） |
| `make lint` | `npx eslint .`（Babel 解析器 + Next core-web-vitals；**非** `tsc`） |
| `make typecheck` | `npx tsc --noEmit` |
| `make test-coverage` | Vitest + 阈值 |
| `make test-e2e` | 通过 `scripts/with_server.py` 运行管理员 Playwright（独立端口；`NEXT_DIST_DIR=.next-e2e` 避免与运行中的 `make up` 冲突；`QUANZIL_MODE=fixture` 用于对话冒烟测试） |

类型感知的 `eslint-config-next/typescript` **未**使用：`typescript-eslint` 不支持 TypeScript 7。语法 lint 使用 `@babel/eslint-parser` + `@babel/preset-typescript`。不得为使该插件工作而将 TypeScript 降级至 5.x（[ADR-024](../../workspace-specs/adr/ADR-024-quality-gates-typescript-7.md)）。

将 `make test`（以及 `make lint` / typecheck，如已存在）绑定到真实命令。失败将阻止合并。不得跳过工具、身份验证或管理员变更操作的测试。

---

## 10. 功能 × 层级（证明所在位置）

| # | 代码 | 单元 | HTTP/MCP 契约 | 管理员 Playwright |
| --- | --- | --- | --- | --- |
| 1–5 | 搜索 / 详情 / 导航 / 地理编码 | 解析器、空结果、失败 | 两个通道 | — |
| 6–8 | 供应商 / 来源 / Tripadvisor | 无静默替换；Google 直连→Worker MCP；无 `place_id` 透传 | 两个通道 | — |
| 9–10 | 行程 / 自然语言对话 | 节奏、截断 | HTTP/MCP；默认 CI 使用 LLM fixture | — |
| 11–13 | 双通道、调用方 key、语言环境 | 语言环境映射 | 标识 `places-agent`；身份验证；语言环境 | — |
| 14–16 | 首页、用户、落地页 | — | 会话 API；接受邀请 POST | 必须 |
| 17 | 调用方 API key | 哈希/轮换 | 管理员 API + 使用新 key 的工具调用 | 必须（一次性复制） |
| 18 | 指令 | — | — | 必须（id `places-agent`） |
| 19 | 管理员 i18n | 目录回退 | — | 语言环境切换冒烟测试 |

---

## 11. 质量检查清单（额外项）

满足 common-test-strategy 中**所有适用**项，以及：

- [ ] 接受邀请旅程由 Playwright 覆盖（功能 15 US4）；提交后 URL 不含密码字段
- [ ] 任何新工具行为均覆盖 HTTP 和 MCP（或有明确 AC 说明该故事仅 HTTP——目前没有）
- [ ] MCP 初始化和 HTTP `agent` 中均断言 `places-agent`
- [ ] 管理员会话不能调用地图工具；调用方 key 不能打开管理员落地页
- [ ] HK 和 TW 目录不是同一个文件；测试中不使用 OpenCC 作为替代
- [ ] Playwright 追踪、管理员截图或 HAR 中无地图供应商 key
- [ ] 默认 CI 不需要实时供应商 key
- [ ] 实时模式 + 注入或真实客户端：`sources[].native_id` 不以 `fixture_` 开头
- [ ] 实时模式 + 缺少实时客户端：跳过/省略，**零** fixture 响应（卡片、Tripadvisor 评分、`weather_code: 80`）
- [ ] 可选加入 `make verify-*-live` / `make test-live` 命中真实主机，若出现 `fixture_` 则失败
- [ ] AC 状态为 `live-honest` / `fail-closed` / `fixture-only`——不以 `implemented` 代替诚实矩阵
- [ ] E2E 测试中无硬编码 fixture 数据——验证结构和地理位置，而非精确场所名称
- [ ] 调用方模拟覆盖三种调用方画像（餐饮、地点、chatbox），使用随机化输入
- [ ] 中国地址的搜索结果返回中国坐标范围内的场所（纬度 18–54°N，经度 73–135°E）
- [ ] 供应商支持时 `photos` 字段有值；不支持时省略（而非空数组）
- [ ] 英文语言环境查询字符串中无硬编码中文关键词
- [ ] 无混合语言搜索查询（例如在同一查询中包含 `"cafe tea house"` + `"咖啡馆"`）
- [ ] 发布前 `make test-e2e-caller` 在实时 key 下通过（可选加入，不在默认 CI 中）

---

## 12. 失败处理

修复生产代码或错误的测试。不得通过删除或跳过失败的 AC 测试来使 CI 变绿。不得降低覆盖率或删减 Playwright 旅程来通过 CI。

---

## 13. 测试配置（手动 QA 和 HTTP）

标题中带 **★** 的用例在发布签核前为必测项。其余用例建议测试。

**ChatBox 手动 QA 已暂停**，当 HTTP 等价用例存在时，发布签核不再要求 ChatBox 手动测试。运行 **`make test`** 可通过 [`tests/http-tc-h.test.ts`](../tests/http-tc-h.test.ts) 获得自动化 **TC-H01–H15** 覆盖。可选加入实时 Worker 回退：**`make test-live`**（TC-H15 针对真实 `GMAPS_MCP_*`）。

### 13.1 调用方 key

管理后台 → 密钥 → 签发 key → 一次性复制 `pa_…`。

### 13.2 ChatBox

| 字段 | 值 |
| --- | --- |
| 类型 | 远程（HTTP/SSE） |
| URL（生产） | `https://places.agent-mate.ai/sse` |
| URL（本地） | `http://localhost:3010/sse`（或 `.env.local` 中的 `PORT`） |
| 请求头 | `Authorization=Bearer <caller_api_key>` |

使用 **`/sse`**，而非 `/mcp`。为对话启用 **MCP 工具**。对话模型是 ChatBox 的（Qwen、GPT 等），而非 places-agent 的。

将 ChatBox MCP 连接命名为 **`places-agent`**。**不要**在同一对话中同时连接 Google Maps Worker（`GMAPS_MCP_*` / `maps-mcp.*`）或另一个通用搜索 MCP——宿主模型会优先选择它们而非 `search_restaurants`。对于餐厅查询，在提示词中注明工具名，例如 `用 places-agent search_restaurants 找上海紫藤路烧烤`。

在本地更改服务器代码后，重启开发服务器并重新连接 ChatBox，以刷新工具 schema。

### 13.3 HTTP（curl / BFF / Postman）

```bash
export CALLER_KEY='pa_…'
curl -s -H "Authorization: Bearer $CALLER_KEY" \
  -H "Content-Type: application/json" \
  -d '<json body>' \
  http://localhost:3010/v1/<endpoint>
```

生产环境：`https://places.agent-mate.ai/v1/<endpoint>`

签发开发 key（可选）：

```bash
npx tsx --env-file=.env.local scripts/issue-caller-key.ts my-label
# → 包含 "secret": "pa_…" 的 JSON — 将该值用作 CALLER_KEY
export CALLER_KEY='pa_…'
```

保持服务器运行：`make dev`（前台）或 `make up` + `make status`。遇到锁定/ENOENT 错误后：`make reset-dev` 再 `make dev`。

### 13.4 供应商模式

| 模式 | 适用场景 |
| --- | --- |
| **fixture** | 本地开发（`PLACES_VENDOR_MODE=fixture`）— 样本 HK + 上海数据，无需实时供应商 key |
| **live** | 预发布 / 生产 — 真实 AMAP / Google / Tripadvisor |

**定时 Directions（运维 UAT）：** 先 `make down`，再 `GOOGLE_DIRECT_FORCE_FAIL=0 make up`（或 `make dev`），以确保 Google Directions 不被强制关闭。已导出 `GOOGLE_DIRECT_FORCE_FAIL=1` 的 shell 会覆盖 `.env.local`。**不要**用 `scripts/with_server.py` 包裹完整定时 UAT 套件——该辅助脚本在被包裹命令退出时会停止服务器。

### 13.5 如何在 ChatBox 中检查 MCP 工具

模型回复后，助手消息中包含**工具调用块**（如 `mcp__geocode`、`mcp__search_restaurants`，完成时显示绿色对勾）。请通过这些块验证通过标准——而非仅靠摘要文本。

**步骤**

1. 发送测试提示词并等待回复完成（工具块显示已完成 / 对勾）。
2. 在助手回合中找到如 `mcp__search_restaurants` 的工具行（带对勾）。
3. **点击该行**展开工具面板。
4. ChatBox 显示两个标签页/区域（各版本标签名略有不同）：

| ChatBox 标签 | 内容 | 检查要点 |
| --- | --- | --- |
| **Arguments** | 模型发送给工具的 JSON | 例如 `"providers": ["GOOGLE_MAPS","AMAP"]`、`"merge": true`、`"near": { "lat": …, "lng": … }` |
| **Result** | places-agent 返回的 JSON | `"isError": false`；在 `content[0].text` 中解析信封：`agent`、`ok`、`data`、`skipped` |

5. 对于多步骤流程（地理编码 → 搜索），按顺序展开**每个**工具块。

**如果看不到工具块**

- 确认该对话已启用 **MCP 工具**。
- 确认 MCP 服务器已连接（设置 → MCP → 测试）。
- 重新连接 MCP 后，开启**新对话**。

**输出信封字段**（位于 **Result** → `content[0].text`，通常是 JSON 字符串）

| 字段 | 含义 |
| --- | --- |
| `agent` | 必须为 `"places-agent"` |
| `ok` | 工具成功时为 `true` |
| `data` | 地点卡片、地理编码结果、行程等 |
| `skipped[]` | 已跳过的供应商，含 `provider` + `reason_key` |
| `outcomeKey` / 顶级错误 | 例如 `errors.empty_results`、`errors.caller_unauthorized` |

**示例（TC-C05 通过）：** 展开 `mcp__search_restaurants` → **Arguments** 显示 `"providers":["GOOGLE_MAPS","AMAP"]` 且 `"merge":true` → **Result** 显示 `"isError": false` 且 **`data` 数量为 3**（fixture 中为 Yat Lok、Tim Ho Wan、太興燒味）。`skipped` 中对 Google/AMAP 无 `errors.capability_unsupported`。

**如何获取完整 Result 文本（当显示框被截断时）**

**Result** 面板通常只显示长 JSON 字符串的开头（`"data":[{…` 被截断）。可采用以下方法之一：

1. **在 Result 中滚动** — 点击 Result 代码框内部，然后向下滚动（触控板 / 鼠标滚轮）。完整 JSON 通常就在那里；面板只是高度固定。
2. **全选并复制** — 点击 Result 框内部 → `Cmd+A`（Mac）或 `Ctrl+A`（Windows）→ `Cmd+C` / `Ctrl+C` → 粘贴到 VS Code 或文本编辑器中。搜索 `"provider"` 或 `"name"` 以统计卡片数量。
3. **复制图标** — 如果 ChatBox 在工具面板标题或 Result 旁显示复制按钮，使用它，然后粘贴到其他地方。
4. **解析内层信封** — Result 结构为：
   ```json
   { "isError": false, "content": [ { "type": "text", "text": "{ \"agent\": \"places-agent\", \"ok\": true, \"data\": [ … ] }" } ] }
   ```
   places-agent 的响应体是 `content[0].text` 中的**字符串**。复制后，找到 `"text":` 并解析其中的内层 JSON（或在其中搜索 `"Yat Lok"` / `"Tim Ho Wan"` / `太興燒味`）。

**不使用 ChatBox UI 的替代方法：** 通过 HTTP（TC-H04）在终端运行相同请求体——完整 JSON 将输出到 stdout：

```bash
curl -s -H "Authorization: Bearer $CALLER_KEY" -H "Content-Type: application/json" \
  -d '{"query":"restaurant","near":{"lat":22.2819,"lng":114.158},"providers":["GOOGLE_MAPS","AMAP"],"merge":true,"locale":"EN"}' \
  http://localhost:3010/v1/search_restaurants | python3 -m json.tool
```

---

## 14. 地图供应商（`providers[]` 与增强）

places-agent 在服务器端与**地图供应商**通信。调用方按请求选择供应商。

| 供应商 id（精确值） | 显示名称 | 搜索 / 地理编码 / 详情 / 导航？ | 请求方式 |
| --- | --- | --- | --- |
| **`GOOGLE_MAPS`** | Google Maps | 是 | `"providers": ["GOOGLE_MAPS"]` |
| **`AMAP`** | 高德 / Gaode | 是（中国大陆使用 GCJ-02） | `"providers": ["AMAP"]` |
| **`TRIPADVISOR`** | Tripadvisor | **否** — 仅作增强 | 在 **HTTP 搜索**中使用 `"enrich": { "tripadvisor": true }` |

**若省略 `providers`**，服务器默认使用 **`GOOGLE_MAPS`**。

### 14.1 ChatBox：在提示词中使用精确 id

ChatBox 模型常在工具参数中写 **`Google Maps`**。服务器要求 **`GOOGLE_MAPS`**。当用例需要特定供应商时，**在提示词中拼写 id**：

| 正确（提示词中使用 id） | 有风险（仅使用显示名称） |
| --- | --- |
| `providers GOOGLE_MAPS and AMAP` | `using Google Maps and AMAP` |
| `Use AMAP only` | `Use Gaode only`（若服务器规范化则可能有效） |
| `provider GOOGLE_MAPS` | `Google Maps only` |

若 `skipped[]` 中显示 Google 或 AMAP 的 `errors.capability_unsupported`，打开工具 JSON 检查 `providers` 是否使用了显示名称。用上表中的 id 重试。

### 14.2 如何按通道设置供应商

| 通道 | 方式 |
| --- | --- |
| **ChatBox** | 在提示词中写供应商 **id**（§14.1）。模型将其传入工具参数。 |
| **HTTP** | 在 POST 请求体中写 `"providers": ["GOOGLE_MAPS"]` 或 `["AMAP"]` |
| **Tripadvisor 评分** | 仅 HTTP：`"enrich": { "tripadvisor": true }` — 当前 ChatBox MCP 不支持 |

**Google Maps Cloudflare Worker MCP**（ADR-017）：places-agent 内部的**传输层** — **不是**第二个 ChatBox MCP，**也不是** `providers[]` id。调用方请求 `GOOGLE_MAPS` 时，服务器优先直连 `maps.googleapis.com`；**仅在出口失败时**才调用 Cloudflare Worker（服务器侧使用 `GMAPS_MCP_URL` + `GMAPS_MCP_BEARER`）。调用方仍只使用 places-agent `/sse` 或 HTTP；溯源保持为 `GOOGLE_MAPS`。手动回退验证：**TC-C07**（MCP）/ **TC-H15**（HTTP）。自动化覆盖：§5。

### 14.3 仅 HTTP 的访问面

| 端点 | 用途 |
| --- | --- |
| `GET /v1/health` | 存活检测 + 工具列表 |
| `POST /v1/chat` | 服务端自然语言循环（Quanzil）— 与 ChatBox + MCP 不同 |
| 搜索中的 `enrich.tripadvisor` | 卡片上的 Tripadvisor 评分 |

### 14.4 常见结果（故障排查）

| 现象 | 可能原因 | 处理方式 |
| --- | --- | --- |
| `Google Maps` 的 `errors.capability_unsupported` | `providers[]` 中使用了显示名称，而非 `GOOGLE_MAPS` | 在提示词中使用 id 重试（§14.1） |
| 搜索中 `TRIPADVISOR` 的 `errors.capability_unsupported` | Tripadvisor 仅作增强 | TC-C10 预期行为；评分请使用 TC-H05 |
| `errors.provider_unconfigured` | 实时模式，服务器缺少供应商 key | 配置 key 或在本地使用 fixture 模式 |
| 地理编码成功，搜索始终为空 | 查询对 fixture 数据过于具体，或无 `near` 坐标 | 使用 TC-C03 风格的查询（`ramen`、`goose`）或确保搜索包含地理编码返回的 `near` |
| 地理编码成功，搜索始终为空 | 服务器 URL 错误、MCP 连接过时，或生产未部署 | 确认 `/v1/health`，重启本地服务器，重新连接 ChatBox |

### 14.5 全局通过标准

- 工具 / HTTP JSON 包含 `"agent": "places-agent"`。
- 回答基于工具数据——在空结果或失败时**不捏造地点**。
- 失败使用结果 **key**（`errors.*`），而非堆栈追踪。
- 深度链接中无地图供应商 key、调用方 `pa_` 密钥或 `key=`。

---

## 15. ChatBox 测试用例

**前提条件（§15 所有用例）：** ChatBox MCP 按 §13.2 配置，MCP 工具已启用，持有有效调用方 key。

---

### TC-C01 — 连接与工具目录 ★

| | |
| --- | --- |
| **前提条件** | 有效调用方 key。MCP 服务器未连接，或在配置变更后重新测试。 |
| **测试步骤** | 1. ChatBox → 设置 → MCP → 添加服务器（URL `/sse`，Bearer 请求头）。2. 保存并连接 / 测试。3. 打开 `places-agent` 的工具列表。 |
| **预期结果** | 连接成功。恰好六个工具：`search_restaurants`、`search_places`、`get_place_details`、`geocode`、`navigate`、`plan_itinerary`。 |

---

### TC-C02 — 无效调用方 key ★

| | |
| --- | --- |
| **前提条件** | 无。 |
| **测试步骤** | 1. 将 MCP 请求头设置为 `Authorization=Bearer pa_invalid`。2. 连接或发送：`Find ramen near Tsim Sha Tsui` |
| **预期结果** | `errors.caller_unauthorized`。无地点结果。 |

---

### TC-C03 — 餐厅搜索（默认 Google）★

| | |
| --- | --- |
| **前提条件** | MCP 已连接。**不**指定供应商（默认为 `GOOGLE_MAPS`）。 |
| **测试步骤** | 1. 新建对话，启用 MCP 工具。2. 精确发送：`Find ramen near Tsim Sha Tsui` |
| **预期结果** | `search_restaurants`（可选地先执行 `geocode`）。≥1 家餐厅，含名称 + 坐标。助手提到的名称与工具 `data` 匹配。 |

---

### TC-C04 — 餐厅搜索（仅 AMAP）★

| | |
| --- | --- |
| **前提条件** | MCP 已连接。AMAP 可用（fixture 模式下始终可用）。 |
| **测试步骤** | 1. 新建对话，启用 MCP 工具。2. 精确发送：`Use provider AMAP only. Find 烧味 near Central Hong Kong.` |
| **预期结果** | `search_restaurants`，`providers: ["AMAP"]`。卡片的 `sources[].provider` = `AMAP`。坐标 CRS `GCJ-02`。 |

---

### TC-C05 — 餐厅搜索（Google + AMAP，合并）

| | |
| --- | --- |
| **前提条件** | MCP 已连接。Fixture 模式（本地）或实时模式且两个供应商均已配置。 |
| **测试步骤** | 1. 新建对话，启用 MCP 工具。2. 发送：`Find restaurants near Central Hong Kong. Geocode first, then search with providers GOOGLE_MAPS and AMAP, merge true, query restaurant.` 3. 按 §13.5，展开 `mcp__search_restaurants` → **Arguments** / **Result**。 |
| **预期结果** | 地理编码约 22.28°N、约 114.16°E。搜索使用 `merge: true`。Fixture 模式下 **3 张卡片**：Yat Lok Roast Goose、Tim Ho Wan（GOOGLE_MAPS），太興燒味（AMAP）。`skipped` 中对 Google/AMAP 无 `errors.capability_unsupported`。HTTP 等价用例：**TC-H04**。 |

---

### TC-C06 — 步骤 2A：餐厅搜索（仅 GOOGLE_MAPS，MCP）★

| | |
| --- | --- |
| **前提条件** | MCP 已连接（places-agent `/sse`）。服务器/模式与 **TC-C05** 相同。 |
| **测试步骤** | 1. 新建对话，启用 MCP 工具。2. 发送：`Find restaurants near Central Hong Kong. Geocode first, then search with provider GOOGLE_MAPS only, query restaurant.` 3. 按 §13.5，展开 `mcp__search_restaurants` → **Arguments** / **Result**。 |
| **预期结果** | 地理编码约 22.28°N、约 114.16°E。**Arguments** 仅含 `providers: ["GOOGLE_MAPS"]`（无 AMAP）。Fixture 模式下 **2 张卡片**（Yat Lok Roast Goose、Tim Ho Wan）。HTTP 等价用例：**TC-H14**。 |

---

### TC-C07 — 步骤 2B：GOOGLE_MAPS 通过 Worker MCP 回退（ADR-017）★

| | |
| --- | --- |
| **前提条件** | **实时**模式（`PLACES_VENDOR_MODE=live`）；服务器环境含 `GMAPS_MCP_URL` + `GMAPS_MCP_BEARER`。ChatBox MCP 同 §13.2（`/sse` + 调用方 key）。**非**本地 fixture。**不要**将 Worker 作为独立 ChatBox MCP 服务器添加。**网络（二选一）：**（A）**中国大陆** — `maps.googleapis.com` 从 places-agent 不可达；或（B）**开发等价（VPN 开启）** — `.env.local` 中设置 `GOOGLE_DIRECT_FORCE_FAIL=1` 或 `GOOGLE_MAPS_BASE_URL=http://127.0.0.1:9` 以模拟出口失败，同时 Worker MCP 保持可达。 |
| **测试步骤** | 1. MCP 连接至 places-agent。2. 发送与 **TC-C06** 相同的内容：`Find restaurants near Central Hong Kong. Geocode first, then search with provider GOOGLE_MAPS only, query restaurant.` 3. 按 §13.5，展开 `mcp__search_restaurants` → **Arguments** / **Result**。4. 与 **TC-C06**（fixture/直连路径）和 **TC-H15**（HTTP 相同场景）比较。 |
| **预期结果** | 仍然是 **`mcp__search_restaurants`** 且 `"agent":"places-agent"`。**Arguments** 仅含 `providers: ["GOOGLE_MAPS"]`。**`sources[].provider`** = `GOOGLE_MAPS` 且唯一——绝不出现 `GMAPS_MCP`，绝不静默使用 AMAP。**实时** Google 卡片（`native_id` 前缀不含 `fixture_`）。中环附近 ≥1 家餐厅。若直连和 Worker 均失败 → `skipped[]` 含原因 key；不捏造地点。**本地 fixture 签核：** TC-C07 **不适用**；使用自动化测试（§5）或在 `GOOGLE_DIRECT_FORCE_FAIL=1`（VPN 开启）下运行 **`scripts/verify-gmaps-fallback.sh`**。 |

**TC-C06 vs TC-C07**

| | TC-C06（步骤 2A） | TC-C07（步骤 2B） |
| --- | --- | --- |
| 模式 | Fixture 或实时（Google 直连正常） | **实时** + Google 直连**失败**（大陆或开发强制失败） |
| 网络 | VPN 或 HK/海外出口正常 | 大陆封锁**或** `GOOGLE_DIRECT_FORCE_FAIL=1`（VPN 开启） |
| 传输 | 直连 REST 或 fixture | Worker MCP 回退（服务器内部） |
| ChatBox MCP | places-agent `/sse` | 同一 places-agent `/sse` |
| 工具 | `search_restaurants` | 同一 `search_restaurants` |
| `native_id` | Fixture 模式下 `fixture_*` | 实时 Google id |

---

### TC-C08 — 餐厅搜索（上海日料）★

| | |
| --- | --- |
| **前提条件** | MCP 已连接。Fixture 或实时模式且含大陆覆盖。 |
| **测试步骤** | 1. 新建对话，启用 MCP 工具。2. 精确发送：`找上海爱琴海附近的日料店` |
| **预期结果** | `geocode` 然后 `search_restaurants`，带 `near`。纬度约 31°N，经度约 121°E（上海，**非**香港）。≥1 家日本料理；地址提及上海 / 爱琴海 / 闵行。 |

---

### TC-C09 — 餐厅搜索（空结果）

| | |
| --- | --- |
| **前提条件** | MCP 已连接。 |
| **测试步骤** | 1. 新建对话，启用 MCP 工具。2. 精确发送：`Restaurants named xyznonexistent999 near Central Hong Kong` |
| **预期结果** | `data` 为空；`errors.empty_results`。助手**不**捏造场所。 |

---

### TC-C10 — Tripadvisor 作为搜索供应商（不支持）

| | |
| --- | --- |
| **前提条件** | MCP 已连接。 |
| **测试步骤** | 1. 新建对话，启用 MCP 工具。2. 精确发送：`Search restaurants with providers ["TRIPADVISOR"] only` |
| **预期结果** | `skipped[]` 包含 TRIPADVISOR + `errors.capability_unsupported`。Tripadvisor **评分**请使用 **TC-H05**（`enrich.tripadvisor`）。 |

---

### TC-C11 — 地点搜索（POI）

| | |
| --- | --- |
| **前提条件** | MCP 已连接。 |
| **测试步骤** | 1. 新建对话，启用 MCP 工具。2. 精确发送：`Museums near Tsim Sha Tsui` |
| **预期结果** | `search_places`。≥1 个博物馆/POI；非餐饮类为主。每张卡片含名称 + 坐标。 |

---

### TC-C12 — 地理编码（上海与香港）

| | |
| --- | --- |
| **前提条件** | MCP 已连接。 |
| **测试步骤** | 1. 精确发送：`What are the coordinates of 上海爱琴海购物公园?` 2. 精确发送：`What are the coordinates of Tsim Sha Tsui Star Ferry Pier?` |
| **预期结果** | 每次均触发 `geocode`。上海约 31°N、约 121°E。香港约 22.3°N、约 114.17°E。 |

---

### TC-C13 — 地点详情（搜索后）

| | |
| --- | --- |
| **前提条件** | MCP 已连接。同一对话线程。 |
| **测试步骤** | 1. 精确发送：`Find ramen in Central Hong Kong` 2. 精确发送：`Tell me more about the first restaurant — rating and details` |
| **预期结果** | `search_restaurants` 然后 `get_place_details`，使用第一张卡片的 `provider` + `native_id`。详情与搜索结果中的地点匹配；`sources[]` 存在。 |

---

### TC-C14 — 导航（地图链接）

| | |
| --- | --- |
| **前提条件** | MCP 已连接。 |
| **测试步骤** | 1. 精确发送：`Find a roast goose restaurant in Central Hong Kong, then give me map deeplinks to open it in GOOGLE_MAPS and AMAP` |
| **预期结果** | `search_restaurants` 然后 `navigate`。深度链接包括 `google_web`、`google_app` 和/或 `amap_web`。URL 中无 `key=` 或 API 密钥。 |

---

### TC-C15 — 行程（正常路径）★

| | |
| --- | --- |
| **前提条件** | MCP 已连接。 |
| **测试步骤** | 1. 精确发送：`Plan a 2-day Tokyo trip from March 10 to March 12, 2026. Include Ueno museum and nearby attractions. Medium pace.` |
| **预期结果** | `search_places` 然后 `plan_itinerary`。`days[]` 含来自搜索结果的站点。天气使用本地化的 `weather.wmo.*` 标签。不声称行程已保存至 where2play。 |

---

### TC-C16 — 行程（无效日期）

| | |
| --- | --- |
| **前提条件** | MCP 已连接。 |
| **测试步骤** | 1. 精确发送：`Plan a trip from March 10, 2026 to March 5, 2026 visiting Tokyo museums` |
| **预期结果** | `errors.bounds_invalid`。不生成虚假的成功行程。 |

---

### TC-C17 — 多轮对话：搜索 → 详情 → 导航 ★

| | |
| --- | --- |
| **前提条件** | MCP 已连接。同一对话线程。 |
| **测试步骤** | 1. 精确发送：`Ramen near TST` 2. 精确发送：`Tell me more about the first one` 3. 精确发送：`Open it in Google Maps` |
| **预期结果** | `search_restaurants` → `get_place_details` → `navigate`。全程为同一家餐厅名称。 |

---

### TC-C18 — 语言环境（中文空结果消息）

| | |
| --- | --- |
| **前提条件** | MCP 已连接。ChatBox 界面语言为 **CN**（简体中文）。 |
| **测试步骤** | 1. 精确发送：`Restaurants named xyznonexistent999 near Central Hong Kong` |
| **预期结果** | 与 TC-C09 相同（`errors.empty_results`）。用户可见文本来自消息目录，使用中文。 |

---

### TC-C19 — 对话中无密钥 ★

| | |
| --- | --- |
| **前提条件** | TC-C17 在同一会话中已完成。 |
| **测试步骤** | 1. 按 §13.5 展开工具块，阅读 TC-C17 线程中的助手回复。 |
| **预期结果** | 用户可见文本中无 `pa_…` key、无供应商 API key、无堆栈追踪。 |

---

## 16. HTTP API 测试用例

**前提条件（§16 所有用例，TC-H01 除外）：** `Authorization: Bearer` 请求头中携带有效调用方 key。

### 16.0 对比运行 — 中环 HK `restaurant` 搜索

使用与步骤 1 相同的坐标（地理编码后 `22.2819`、`114.158`）。比较 **Result / 响应 `data` 数量**——而非仅靠助手文字叙述。

| 步骤 | 通道 | 用例 | `providers` | `merge` | Fixture `data` 数量 |
| --- | --- | --- | --- | --- | --- |
| **1** | ChatBox MCP | TC-C05 | `GOOGLE_MAPS`、`AMAP` | `true` | **3** |
| **1** | HTTP | TC-H04 | `GOOGLE_MAPS`、`AMAP` | `true` | **3** |
| **2A** | ChatBox MCP | TC-C06 | 仅 `GOOGLE_MAPS` | — | **2**（fixture） |
| **2A** | HTTP | TC-H14 | 仅 `GOOGLE_MAPS` | — | **2**（fixture） |
| **2B** | ChatBox MCP | TC-C07 | 仅 `GOOGLE_MAPS` | — | **实时**（大陆；Worker 回退） |
| **2B** | HTTP | TC-H15 | 仅 `GOOGLE_MAPS` | — | **实时**（大陆；Worker 回退） |

**步骤 1 HTTP（两个供应商）：**

```bash
curl -s -H "Authorization: Bearer $CALLER_KEY" -H "Content-Type: application/json" \
  -d '{"query":"restaurant","near":{"lat":22.2819,"lng":114.158},"providers":["GOOGLE_MAPS","AMAP"],"merge":true,"locale":"EN"}' \
  http://localhost:3010/v1/search_restaurants
```

**步骤 2A HTTP（仅 Google）：**

```bash
curl -s -H "Authorization: Bearer $CALLER_KEY" -H "Content-Type: application/json" \
  -d '{"query":"restaurant","near":{"lat":22.2819,"lng":114.158},"providers":["GOOGLE_MAPS"],"locale":"EN"}' \
  http://localhost:3010/v1/search_restaurants
```

**步骤 2B（Worker 回退）：** 与步骤 2A 相同请求体，但在**实时**模式下从 Google Maps 不可用的**中国大陆网络**发起。调用方 JSON 不变；回退为服务器内部行为（ADR-017）。参见 **TC-C07** / **TC-H15**。

---

### TC-H01 — 健康检查 ★

| | |
| --- | --- |
| **前提条件** | 服务器运行中。无需身份验证。 |
| **测试步骤** | 1. `GET /v1/health` |
| **预期结果** | `{ "agent": "places-agent", "ok": true, "data": { "tools": [ … ] } }`。仅首页 `200` 不足以通过。 |

---

### TC-H02 — 搜索餐厅（Google Maps）

| | |
| --- | --- |
| **前提条件** | 调用方 key 已设置。`GOOGLE_MAPS` 可用。 |
| **测试步骤** | 1. `POST /v1/search_restaurants` — 请求体：`{"query":"ramen","near":{"lat":22.28,"lng":114.17},"providers":["GOOGLE_MAPS"],"locale":"EN"}` |
| **预期结果** | `"ok": true`、`"agent": "places-agent"`、≥1 张卡片，`sources[].provider` 包含 `GOOGLE_MAPS`。 |

---

### TC-H03 — 搜索餐厅（仅 AMAP）

| | |
| --- | --- |
| **前提条件** | 调用方 key 已设置。`AMAP` 可用。 |
| **测试步骤** | 1. 与 TC-H02 相同，`"providers":["AMAP"]`。 |
| **预期结果** | AMAP 卡片；坐标 CRS `GCJ-02`。 |

---

### TC-H04 — 合并搜索（Google + AMAP）

| | |
| --- | --- |
| **前提条件** | 调用方 key 已设置。两个供应商均可用。 |
| **测试步骤** | 1. `POST /v1/search_restaurants` — 请求体：`{"query":"restaurant","near":{"lat":22.2819,"lng":114.158},"providers":["GOOGLE_MAPS","AMAP"],"merge":true,"locale":"EN"}` |
| **预期结果** | `"ok": true`、`"agent": "places-agent"`、≥1 张卡片。合并后数量少于两个供应商单独结果之和。`sources[]` 中同时出现 `GOOGLE_MAPS` 和 `AMAP`。每张卡片均有名称、位置和来源。`skipped` 为空。 |

---

### TC-H05 — 搜索中的 Tripadvisor 增强 ★

| | |
| --- | --- |
| **前提条件** | 调用方 key 已设置。Tripadvisor 增强可用。 |
| **测试步骤** | 1. `POST /v1/search_restaurants` — 请求体：`{"query":"ramen","near":{"lat":22.28,"lng":114.17},"providers":["GOOGLE_MAPS"],"enrich":{"tripadvisor":true},"locale":"EN"}` |
| **预期结果** | 返回 Google 卡片。匹配项含 `tripadvisor` 字段。增强使用名称 + 位置，而非 Google `native_id` 作为 Tripadvisor id。 |

---

### TC-H06 — Tripadvisor 增强失败时的容错性

| | |
| --- | --- |
| **前提条件** | 调用方 key 已设置。Fixture 失败 token 或实时中断路径可用。 |
| **测试步骤** | 1. 与 TC-H05 相同，使用触发增强失败的查询/路径（如 fixture `__ta_fail__`）。 |
| **预期结果** | 主要 Google 卡片仍返回。增强失败出现在 `skipped[]` 中。列表不被清空。 |

---

### TC-H07 — 地点搜索（POI）

| | |
| --- | --- |
| **前提条件** | 调用方 key 已设置。 |
| **测试步骤** | 1. `POST /v1/search_places` — 请求体：`{"query":"museum","near":{"lat":22.30,"lng":114.18},"providers":["GOOGLE_MAPS"],"locale":"EN"}` |
| **预期结果** | 非餐饮类 POI；信封格式与餐厅搜索相同。 |

---

### TC-H08 — 地理编码与导航

| | |
| --- | --- |
| **前提条件** | 调用方 key 已设置。 |
| **测试步骤** | 1. `POST /v1/geocode` — 请求体：`{"query":"上海爱琴海购物公园","providers":["AMAP"],"locale":"CN"}` 2. 使用步骤 1 返回的经纬度 `POST /v1/navigate`。 |
| **预期结果** | 上海区域坐标。深度链接中不含密钥。 |

---

### TC-H09 — 规划行程

| | |
| --- | --- |
| **前提条件** | 调用方 key 已设置。来自 TC-H07 或等价来源的地点卡片。 |
| **测试步骤** | 1. `POST /v1/plan_itinerary`，含有效 `bounds`、`places[]`、`"preferences":{"pace":"relaxed"}`、`"locale":"HK"`。2. 以结束日期早于开始日期重复测试。 |
| **预期结果** | 有效时：`days[]`，HK 天气标签。无效边界：`errors.bounds_invalid`。 |

---

### TC-H10 — HTTP 自然语言对话 ★

| | |
| --- | --- |
| **前提条件** | 调用方 key 已设置。无需实时 Quanzil key，fixture 模式即可。 |
| **测试步骤** | 1. `POST /v1/chat` — 请求体：`{"messages":[{"role":"user","content":"ramen near Tsim Sha Tsui"}],"locale":"EN"}` |
| **预期结果** | `"ok": true`。助手消息存在。服务器调用了 `search_restaurants`。 |

---

### TC-H11 — 对话上传被拒

| | |
| --- | --- |
| **前提条件** | 调用方 key 已设置。 |
| **测试步骤** | 1. `POST /v1/chat`，包含不支持的附件 MIME 类型或超大文件。 |
| **预期结果** | `errors.upload_unsupported` 或 `errors.upload_too_large`。不捏造 POI。 |

---

### TC-H12 — HTTP 与 MCP 相同请求 ★

| | |
| --- | --- |
| **前提条件** | 调用方 key 已设置。ChatBox MCP 已连接。 |
| **测试步骤** | 1. 通过 curl 运行 TC-H02。2. 在 ChatBox 中精确发送：`Search for ramen near latitude 22.28 longitude 114.17. Use provider GOOGLE_MAPS only.` 3. 将工具 JSON 与 HTTP 响应比较。 |
| **预期结果** | 卡片数量相同；信封字段相同（`agent`、`ok`、`data`、`skipped`）。 |

---

### TC-H13 — 未配置的供应商（仅实时）

| | |
| --- | --- |
| **前提条件** | **实时**模式；某一供应商 key 未设置（如无 `AMAP_API_KEY`）。 |
| **测试步骤** | 1. `POST /v1/search_restaurants`，仅含 `"providers":["AMAP"]`。 |
| **预期结果** | `skipped[]` + AMAP 的 `errors.provider_unconfigured`。若 `providers[]` 中未包含 Google，则不静默回退至 Google。 |

---

### TC-H14 — 步骤 2A：搜索餐厅（仅 GOOGLE_MAPS）★

| | |
| --- | --- |
| **前提条件** | 调用方 key 已设置。服务器/模式与步骤 1（TC-H04 / TC-C05）相同。 |
| **测试步骤** | 1. 可选：`POST /v1/geocode` — `{"query":"Central Hong Kong","locale":"EN"}`。2. `POST /v1/search_restaurants` — 请求体：`{"query":"restaurant","near":{"lat":22.2819,"lng":114.158},"providers":["GOOGLE_MAPS"],"locale":"EN"}` |
| **预期结果** | `"ok": true`、`"agent": "places-agent"`。≥1 张卡片。所有卡片 `provider` / `sources[].provider` = `GOOGLE_MAPS`。无 AMAP 卡片。`skipped` 为空。 |

**开发基准（2026-08-18，fixture，HTTP）：** 2 张 Google 卡片；步骤 1 的 3 张减去此处的 2 张 = 1 张 AMAP 卡片（太興燒味）。

---

### TC-H15 — 步骤 2B：GOOGLE_MAPS 通过 Worker MCP 回退（HTTP，实时）★

| | |
| --- | --- |
| **前提条件** | 与 **TC-C07** 相同：实时模式 + `GMAPS_MCP_*`；大陆封锁**或** `GOOGLE_DIRECT_FORCE_FAIL=1` / 黑洞 `GOOGLE_MAPS_BASE_URL`。调用方 key 已设置。 |
| **测试步骤** | 1. `POST /v1/search_restaurants` — 与 **TC-H14** 相同请求体：`{"query":"restaurant","near":{"lat":22.2819,"lng":114.158},"providers":["GOOGLE_MAPS"],"locale":"EN"}` |
| **预期结果** | `"ok": true`、`"agent": "places-agent"`。≥1 张实时 Google 卡片；所有 `sources[].provider` = `GOOGLE_MAPS`。无 `fixture_*` id。不静默使用 AMAP。与 **TC-C07** MCP 结果一致。 |

---

### 定时行程 UAT（`detail: "timed"`）— 运维 HTTP

运维人员提供/确认**输入**列。运维人员（或脚本）调用 `POST /v1/plan_itinerary`。运维人员判断**预期结果**。实时模式；无 `fixture_*` `native_id`。边界使用半开区间日期计算：`end` 不包含最后一个日历晚（2 天 → `end = start + 2d`；3 天 → `start + 3d`）。

`origin` = 出发点。`destination` = 终点（与 `origin` 结构相同）。**省略 start 时**：使用 `natural_language` / 目的地名称中的**城市**作为 `search_anchor`（而非塔楼标记）；每天第一个站点**省略** `legs_to_here`。**省略 end 时**：最后一个站点**省略** `legs_to_destination`。**两者均省略时**：需在自然语言中提供城市提示（或提供 `places[]`）；**不得**返回 `errors.origin_invalid`。

**质量门控：** `days[0].day_index === 1`。站点为景点（非住宿、广场、商场、站点、码头、`景区`）。餐饮为餐厅/咖啡馆（非广州塔 / 管理办 / 贵宾楼）。晚餐 `slot.start` 不早于 18:00（当站点更早结束时）；下午茶可填充下午。同日午餐选项名称与下午茶/晚餐选项名称不重叠。跨日站点身份和餐饮选项身份交集为空（TC-UAT-M05）。可用唯一场所不足时 → 省略该餐，绝不复用。`duration_min > 300` 的腿段被省略。CN + `providers[]` 含 AMAP 时：AMAP 有数据则优先选 AMAP 卡片。`PlaceCard.hours` 仅来自供应商。`providers[]` 含 AMAP 时可能产生 `source: "directions"`。

---

### TC-UAT-T01 — 里斯本 · 2 天 · 起点 = 终点 · Boavista 83 Hostel

| | |
| --- | --- |
| **语言环境 / 语言** | EN |
| **城市** | 里斯本（Lisboa） |
| **天数** | 2 |
| **出发点** | Boavista 83 Hostel Lisbon |
| **终点** | Boavista 83 Hostel Lisbon（与出发点相同） |
| **前提条件** | 调用方 key；`PLACES_VENDOR_MODE=live`；Google Directions 可用（`GOOGLE_DIRECT_FORCE_FAIL` 未设置或为 0）。 |
| **输入** | `POST /v1/plan_itinerary` 请求体：`{"detail":"timed","origin":{"name":"Boavista 83 Hostel Lisbon"},"destination":{"name":"Boavista 83 Hostel Lisbon"},"timezone":"Europe/Lisbon","bounds":{"start":"2026-08-25","end":"2026-08-27"},"preferences":{"pace":"relaxed","spend":"premium","natural_language":"2-day Lisboa trip, start and end at Boavista 83 Hostel"},"providers":["GOOGLE_MAPS"],"locale":"EN"}` |
| **预期结果** | `"ok": true`，`data.detail` = `timed`。`days[0].day_index` = **1**。`data.origin.name` 解析结果在 Boavista 83 附近。`data.days.length` = **2**。每天：`weather` + `planning_impact`；带 `slot` 的站点 `blocks`；含深度链接的腿段。**站点名称不得与旅馆/酒店/住宿匹配。** 有餐厅搜索结果时含餐饮；晚餐不早于 18:00；同日午餐选项与晚餐/下午茶不重叠；跨日站点/餐饮身份不重叠（M05）。无 `fixture_*`。`destination` 被采纳时，最后一天计划返回旅馆。 |

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

### TC-UAT-T03 — 里斯本 · 2 天 · 起点与终点均未指定

| | |
| --- | --- |
| **语言环境 / 语言** | EN |
| **城市** | 里斯本 |
| **天数** | 2 |
| **出发点** | *（未指定）* |
| **终点** | *（未指定）* |
| **前提条件** | 调用方 key；实时模式。 |
| **输入** | `POST /v1/plan_itinerary` 请求体：`{"detail":"timed","bounds":{"start":"2026-08-25","end":"2026-08-27"},"preferences":{"pace":"relaxed","natural_language":"2 days in Lisboa"},"providers":["GOOGLE_MAPS"],"locale":"EN"}` — **省略** `origin` 和 `destination`。 |
| **预期结果** | `"ok": true`，`detail` = `timed`。`days[0].day_index` = **1**。**无** `data.origin`。`search_anchor` 在里斯本附近。`days.length` = **2**。每天**第一个**站点的 `legs_to_here: []`（无入境腿段）。后续站点仍有站间腿段。无 `legs_to_destination`。站点为景点（非旅馆）。晚餐不早于 18:00。无 `fixture_*`。 |

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

### TC-UAT-T05 — 上海 · 3 天 · 天山 Hyatt Place → 闵行 MixC

| | |
| --- | --- |
| **语言环境 / 语言** | EN |
| **城市** | 上海 |
| **天数** | 3 |
| **出发点** | Hyatt Place Shanghai Tianshan Plaza |
| **终点** | Shanghai MixC in Minhang District |
| **前提条件** | 调用方 key；实时模式；CN 优先 AMAP，Google 作为备选。 |
| **输入** | `POST /v1/plan_itinerary` 请求体：`{"detail":"timed","origin":{"name":"Hyatt Place Shanghai Tianshan Plaza"},"destination":{"name":"Shanghai MixC Minhang"},"timezone":"Asia/Shanghai","bounds":{"start":"2026-08-25","end":"2026-08-28"},"preferences":{"pace":"relaxed","spend":"premium","natural_language":"3 days Shanghai, start Hyatt Place Tianshan Plaza, end Shanghai MixC Minhang"},"providers":["AMAP","GOOGLE_MAPS"],"locale":"EN"}` |
| **预期结果** | `"ok": true`，`days.length` = **3**，`days[0].day_index` = **1**。出发点在天山 / 长宁 Hyatt Place 附近。站点不包含住宅/美食街广场（Garden Plaza / Jiadun Plaza 排除在外）。**第 3 天站点重心比第 1 天更靠近闵行 MixC**。最后一个站点可包含 `legs_to_destination`。无 `duration_min > 300` 的餐饮选项。无 `fixture_*`。 |

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

### TC-UAT-T07 — 里斯本 · 5 天 · 起点 = 终点 · Boavista 83 Hostel

| | |
| --- | --- |
| **语言环境 / 语言** | EN |
| **城市** | 里斯本 |
| **天数** | 5 |
| **出发点** | Boavista 83 Hostel Lisbon |
| **终点** | Boavista 83 Hostel Lisbon（与出发点相同） |
| **前提条件** | 调用方 key；实时模式；Google Directions 可用。 |
| **输入** | `POST /v1/plan_itinerary` 请求体：`{"detail":"timed","origin":{"name":"Boavista 83 Hostel Lisbon"},"destination":{"name":"Boavista 83 Hostel Lisbon"},"timezone":"Europe/Lisbon","bounds":{"start":"2026-08-25","end":"2026-08-30"},"preferences":{"pace":"relaxed","spend":"premium","natural_language":"5-day Lisboa trip, start and end at Boavista 83 Hostel"},"providers":["GOOGLE_MAPS"],"locale":"EN"}` |
| **预期结果** | `"ok": true`，`days.length` = **5**，所有天均有站点。无住宿类站点。跨日站点和餐饮选项身份不重叠（M05）。无餐厅/咖啡馆每天重复出现。无 `fixture_*`。 |

---

### 定时行程 UAT — 紧凑节奏（`preferences.pace: "tight"`）

紧凑行程每天使用 **4 个站点**，时间段为 **09:00–10:15**、**10:30–11:45**、**13:30–14:45**、**15:00–16:15**（天气可能缩短户外结束时间）。午餐使用最大的站点间隙（通常为 **11:45–13:30**）。最后一个站点结束于 **16:15**（早于 17:00），下午茶可填充至 18:00。晚餐保持 **18:00–20:00**。唯一场所规则（M05）仍适用。搜索必须提供足够景点（`searchNeed` = 4 × 天数），否则后几天可能站点较少。

---

### TC-UAT-K01 — 里斯本 · 2 天 · 紧凑 · 起点 = 终点 · Boavista 83 Hostel

| | |
| --- | --- |
| **语言环境 / 语言** | EN |
| **城市** | 里斯本 |
| **天数** | 2 |
| **节奏** | tight |
| **出发点** | Boavista 83 Hostel Lisbon |
| **终点** | Boavista 83 Hostel Lisbon（与出发点相同） |
| **前提条件** | 调用方 key；实时模式；Google Directions 可用。 |
| **输入** | `POST /v1/plan_itinerary` 请求体：`{"detail":"timed","origin":{"name":"Boavista 83 Hostel Lisbon"},"destination":{"name":"Boavista 83 Hostel Lisbon"},"timezone":"Europe/Lisbon","bounds":{"start":"2026-08-25","end":"2026-08-27"},"preferences":{"pace":"tight","spend":"premium","natural_language":"tight 2-day Lisboa itinerary, start and end at Boavista 83 Hostel"},"providers":["GOOGLE_MAPS"],"locale":"EN"}` |
| **预期结果** | `"ok": true`，`preferences_applied.pace` = `tight`，`days.length` = **2**。景点充足时每天有 **4** 个站点块。第一个站点 `slot.start` = **09:00**；最后一个站点 `slot.end` 为 **16:15**（除非天气缩短）。午餐 `slot` 为中午间隙（不仅限于 12:00–13:30）。晚餐不早于 18:00。无住宿类站点。M05 唯一站点/餐饮身份。最后一天可有 `legs_to_destination`。无 `fixture_*`。 |

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

### TC-UAT-K03 — 里斯本 · 2 天 · 紧凑 · 起点与终点均未指定

| | |
| --- | --- |
| **语言环境 / 语言** | EN |
| **城市** | 里斯本 |
| **天数** | 2 |
| **节奏** | tight |
| **出发点** | *（未指定）* |
| **终点** | *（未指定）* |
| **前提条件** | 调用方 key；实时模式。 |
| **输入** | `POST /v1/plan_itinerary` 请求体：`{"detail":"timed","bounds":{"start":"2026-08-25","end":"2026-08-27"},"preferences":{"pace":"tight","natural_language":"packed 2 days in Lisboa"},"providers":["GOOGLE_MAPS"],"locale":"EN"}` — **省略** `origin` 和 `destination`。 |
| **预期结果** | `"ok": true`。**无** `data.origin`。`search_anchor` 在里斯本附近。搜索充足时每天 **4** 个站点时间段。每天第一个站点的 `legs_to_here: []`。无 `legs_to_destination`。晚餐不早于 18:00。M05。无 `fixture_*`。 |

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

### TC-UAT-K05 — 东京 · 2 天 · 紧凑 · 起点 = 终点 · Park Hyatt Tokyo

| | |
| --- | --- |
| **语言环境 / 语言** | EN |
| **城市** | 东京 |
| **天数** | 2 |
| **节奏** | tight |
| **出发点** | Park Hyatt Tokyo |
| **终点** | Park Hyatt Tokyo（与出发点相同） |
| **前提条件** | 调用方 key；实时模式；Google Directions 可用。 |
| **输入** | `POST /v1/plan_itinerary` 请求体：`{"detail":"timed","origin":{"name":"Park Hyatt Tokyo"},"destination":{"name":"Park Hyatt Tokyo"},"timezone":"Asia/Tokyo","bounds":{"start":"2026-08-25","end":"2026-08-27"},"preferences":{"pace":"tight","spend":"premium","natural_language":"tight 2-day Tokyo itinerary, start and end at Park Hyatt Tokyo"},"providers":["GOOGLE_MAPS"],"locale":"EN"}` |
| **预期结果** | `"ok": true`，`days.length` = **2**，`pace` = `tight`。站点为景点（非 Hyatt 酒店）。第一个站点 09:00。晚餐 18:00–20:00。M05。最后一天可向酒店收尾。无 `fixture_*`。 |

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

### TC-UAT-H01 — 供应商提供营业时间时正确映射

| | |
| --- | --- |
| **前提条件** | 实时模式；Google 和/或 AMAP 已配置。 |
| **测试步骤** | 对知名景点（如里斯本博物馆或外滩）执行 `POST /v1/search_places` 或 `get_place_details`。 |
| **预期结果** | 至少一张卡片有非空的 `hours`，**或** `hours` 未设置（绝不出现空字符串的虚构营业时间）。不捏造营业时间。 |

---

### TC-UAT-F01 — 定时自动搜索不回退到住宿类场所

| | |
| --- | --- |
| **前提条件** | 实时模式；与 T01 请求体相同，或 fixture 搜索仅返回旅馆。 |
| **测试步骤** | 在旅馆密集标记附近进行带空 `places` 的定时规划；或覆盖过滤逻辑的单元/HTTP 路径。 |
| **预期结果** | 站点排除 Hostel/Hotel/宾馆/酒店；若无剩余 → `errors.timed_no_places`（而非未过滤的旅馆列表）。 |

---

### TC-UAT-M01 — 从站点间隙推导餐饮时间窗口

| | |
| --- | --- |
| **前提条件** | Fixture 或定时规划，宽松节奏两个站点（10:00–12:00、14:00–16:00）。 |
| **测试步骤** | 执行 `plan_itinerary` 定时后检查第一天的餐饮块。 |
| **预期结果** | `lunch.slot.start` 等于第一个站点的 `end`；`lunch.slot.end` 等于第二个站点的 `start`。`dinner.slot` 为 **18:00–20:00**。16:00–18:00 有咖啡馆时段（若咖啡馆搜索返回结果）。不出现 16:00–18:00 的晚餐。 |

---

### TC-UAT-D01a — 仅 AMAP 定时搜索（空 places）

| | |
| --- | --- |
| **前提条件** | 实时模式；`AMAP_API_KEY` 已设置。语言环境 CN。上海出发点。`places` 为空。`"providers":["AMAP"]`。 |
| **测试步骤** | 定时 `plan_itinerary`；检查 days 和 skipped。 |
| **预期结果** | 第 1 天至少有一个站点。结果不为 `errors.timed_no_places`。拼装查询为中文。 |

### TC-UAT-D01 — 仅 AMAP Directions

| | |
| --- | --- |
| **前提条件** | 实时模式；`AMAP_API_KEY` 已设置。 |
| **测试步骤** | 以 `"providers":["AMAP"]` 进行上海定时规划，出发点 + **places 跨两个标记**。 |
| **预期结果** | AMAP 路线成功时，至少一个站点的 `legs_to_here[].source === "directions"`；失败时 → 启发式 + skipped 可引用 `AMAP` 或 `errors.directions_unavailable`。不为 `errors.timed_no_places`。 |

---

### TC-UAT-M02 — 餐饮腿段通过 Directions 获取

| | |
| --- | --- |
| **前提条件** | 实时 Directions 可用（Google 和/或 AMAP）。 |
| **测试步骤** | T01 或 T02 响应；检查餐饮 `options[].leg_from_previous`。 |
| **预期结果** | Directions 成功时，`source` 可为 `directions`（不仅是夸大的启发式值）。 |

---

### TC-UAT-G01 — 终点地理偏移

| | |
| --- | --- |
| **前提条件** | 与 T05 相同。 |
| **测试步骤** | 比较第 1 天与第 3 天的站点坐标与闵行 MixC 的距离。 |
| **预期结果** | 第 3 天的站点比第 1 天重心更靠近终点（沿行程方向推进）。 |

---

### TC-UAT-F02 — 严格的站点/餐饮黑名单

| | |
| --- | --- |
| **前提条件** | 单元测试或包含广场/商场/塔楼/办公室名称的实时定时规划。 |
| **测试步骤** | 对照黑名单示例（Garden Plaza、当代商城、广州塔、管理办、贵宾楼）检查站点和餐饮名称。 |
| **预期结果** | 这些名称不出现在站点/餐饮中。真实餐厅保留。由 `place-filters.test.ts` 覆盖。 |

---

### TC-UAT-A01 — 终点塔楼不作为 search_anchor

| | |
| --- | --- |
| **前提条件** | 与 T06 相同。 |
| **测试步骤** | 检查 `data.search_anchor`。 |
| **预期结果** | Anchor 名称/位置为城市（广州），而非广州塔。`destination` 字段仍标注广州塔。 |

---

### TC-UAT-M03 — 晚餐 18:00–20:00 及下午茶填充

| | |
| --- | --- |
| **前提条件** | 宽松节奏两个站点 10:00–12:00 和 14:00–16:00（单元测试或实时）。 |
| **测试步骤** | 检查餐饮块。 |
| **预期结果** | `dinner.slot` 为 18:00–20:00。咖啡馆搜索返回结果时，咖啡馆块为 16:00–18:00；咖啡馆搜索为空时省略。由 `meal-windows.test.ts` 覆盖。 |

---

### TC-UAT-M04 — 午餐与晚餐不重叠

| | |
| --- | --- |
| **前提条件** | 定时行程当天至少有两个餐饮候选场所。 |
| **测试步骤** | 比较午餐和晚餐的主 `native_id` / 名称。 |
| **预期结果** | 午餐选项身份与晚餐/下午茶不重叠。若只剩一个未使用餐饮身份用于晚餐，则省略晚餐，而非重复午餐。 |

---

### TC-UAT-M05 — 跨日唯一站点、餐厅与茶点/咖啡馆

| | |
| --- | --- |
| **前提条件** | 多日定时规划（T07 体量：里斯本 5 天，或 T01/T02）。实时餐厅/咖啡馆搜索。 |
| **测试步骤** | 收集所有天次的每个站点身份（`native_id` 或规范化名称）以及所有天次的每个餐饮选项身份。 |
| **预期结果** | 各天站点身份集合两两不相交。各天餐饮选项身份集合两两不相交。无 POI 同时既是站点又是餐饮。Fifty Seconds / Marlene / Feng Shui（或任何一家餐厅/咖啡馆）不得每天出现。由 `itinerary-timed.test.ts` + 运维 HTTP 覆盖。 |

---

### TC-UAT-P01 — CN 定时搜索优先 AMAP

| | |
| --- | --- |
| **前提条件** | `locale: CN`，`providers: ["GOOGLE_MAPS","AMAP"]`。 |
| **测试步骤** | 单元 mock `searchPlacesFn`（推荐）或实时 T02 卡片。 |
| **预期结果** | 第一轮搜索仅用 AMAP。AMAP 无可用景点时才由 Google 补充。`providers[]` 中未包含 AMAP 时不注入 AMAP。由 `itinerary-timed.test.ts` 覆盖。 |

---

## 17. 运行记录

| 日期 | 测试人员 | 服务器 URL | 模式 | ★ 通过？ | 备注 |
| --- | --- | --- | --- | --- | --- |
| 2026-08-19 | agent + 运维人员 | `http://127.0.0.1:3010` | 实时（`GOOGLE_DIRECT_FORCE_FAIL=0`） | UAT-T01–T06 结构性通过 | 定时 UAT：T01/T02/T04/T05 通过，有定时天次/餐饮；T03/T06 返回 `errors.origin_invalid`。`destination` 在请求体中已接受但尚未回显/强制执行。T01/T04 站点组合可能偏向出发点附近住宿——建议运维人员目视复核。 |
| 2026-08-19 | agent | `http://127.0.0.1:3010` | 实时 | T01/T03/T04/T06/T07/H01 通过。T07 里斯本 **5 天均有站点**。T02 3 天已填充（博物馆），但 AMAP 无结果后卡片来自 Google。T05 G01 终点偏移仍偏弱。D01 仅 AMAP 仍返回 `provider_failed`。 | 额外城市查询 + 拒绝票务办公室（VisitLisboa / Lisboa Card）。 |

**★ 发布检查清单：** C01、C02、C03、C04、C05、C06、C08、C15、C17、C19、H01、H04、H05、H10、H12、H14。（**TC-C07 / TC-H15：** 实时模式下在 Google 被封锁的**大陆网络**上进行；本地 fixture 或 VPN/海外出口下不适用。）

ChatBox ★ 项（C01–C08、C15、C17、C19）在对应 HTTP ★ 用例在 CI 中通过（`make test`）后，可**推迟**执行。TC-C07 在 `make test-live` 通过前保持为手动/仅实时。

---

## 18. 测试用例索引

| ID | ★ | 章节 | 主题 | 自动化 | MVP |
| --- | --- | --- | --- | --- | --- |
| TC-C01 | ✓ | ChatBox | 连接，六个工具 | 已暂停 — 手动 | |
| TC-C02 | ✓ | ChatBox | 身份验证 | 已暂停 — 使用 H01 + dispatch auth | |
| TC-C03–C05 | 部分 | ChatBox | 餐厅搜索 + 合并 | 已暂停 — H02–H04 | |
| TC-C06–C07 | ✓ | ChatBox | 步骤 2 — 仅 Google；Worker 回退（C07 仅实时） | 已暂停 — H14；C07/H15 实时 | |
| TC-C08–C10 | 部分 | ChatBox | 上海、空结果、Tripadvisor 不支持 | 已暂停 — H03/H06 | |
| TC-C11 | | ChatBox | POI 搜索 | 已暂停 — H07 | |
| TC-C12–C14 | | ChatBox | 地理编码、详情、导航 | 已暂停 — H08 | |
| TC-C15–C16 | ✓ | ChatBox | 行程 | 已暂停 — H09 | |
| TC-C17–C19 | ✓ | ChatBox | 多轮对话、语言环境、密钥 | 已暂停 — H10/H11 | |
| TC-H01 | ✓ | HTTP | 健康检查 | `tests/http-tc-h.test.ts` | |
| TC-H02 | | HTTP | Google 搜索（拉面） | `tests/http-tc-h.test.ts` | |
| TC-H03 | | HTTP | 仅 AMAP + GCJ-02 | `tests/http-tc-h.test.ts` | |
| TC-H04 | ✓ | HTTP | 合并（步骤 1 HTTP） | `tests/http-tc-h.test.ts` | |
| TC-H05 | ✓ | HTTP | Tripadvisor 增强 | `tests/http-tc-h.test.ts` | |
| TC-H06 | ✓ | HTTP | Tripadvisor 增强容错 | `tests/http-tc-h.test.ts` | |
| TC-H07 | | HTTP | POI 搜索 | `tests/http-tc-h.test.ts` | |
| TC-H08 | | HTTP | 地理编码 + 导航 | `tests/http-tc-h.test.ts` | |
| TC-H09 | | HTTP | 规划行程 | `tests/http-tc-h.test.ts` | |
| TC-H10 | ✓ | HTTP | 自然语言对话 | `tests/http-tc-h.test.ts` | |
| TC-H11 | ✓ | HTTP | 对话上传被拒 | `tests/http-tc-h.test.ts` | |
| TC-H12 | ✓ | HTTP | HTTP ↔ MCP 一致性 | `tests/http-tc-h.test.ts`（内存 MCP；无 ChatBox） | |
| TC-H13 | ✓ | HTTP | 未配置的供应商（实时） | `tests/http-tc-h.test.ts` | |
| TC-H14 | ✓ | HTTP | 步骤 2A — 仅 GOOGLE_MAPS | `tests/http-tc-h.test.ts` | |
| TC-H15 | ✓ | HTTP | 步骤 2B — Worker 回退 | `tests/http-tc-h.test.ts`（已 mock）；`make test-live` + `verify-gmaps-fallback.sh`（实时） | |
| TC-UAT-T01 | | HTTP UAT | 定时 · 里斯本 · 起点=终点 Boavista 83 | 运维 HTTP（`detail:timed`）— 无住宿类站点 | |
| TC-UAT-T02 | | HTTP UAT | 定时 · 上海 · 起点=终点 上海国际饭店 | 运维 HTTP — AMAP directions 优先 | |
| TC-UAT-T03 | | HTTP UAT | 定时 · 里斯本 · 无起点/终点 | 运维 HTTP — 正常，省略第一段入境腿 | |
| TC-UAT-T04 | | HTTP UAT | 定时 · 北京 · 起点友谊宾馆迎宾楼 · 无终点 | 运维 HTTP — 无住宿类餐饮 | |
| TC-UAT-T05 | | HTTP UAT | 定时 · 上海 · Hyatt 天山 → 闵行 MixC | 运维 HTTP — 终点地理偏移 | |
| TC-UAT-T06 | | HTTP UAT | 定时 · 广州 · 无起点 · 终点广州塔 | 运维 HTTP — 餐饮黑名单噪声 | |
| TC-UAT-T07 | | HTTP UAT | 定时 · 里斯本 · 5 天 Boavista 83 | 运维 HTTP — 额外城市查询 + M05 | |
| TC-UAT-K01 | | HTTP UAT | 定时紧凑 · 里斯本 · 2 天 Boavista 83 | 每天 4 个站点 · 09:00 开始 | |
| TC-UAT-K02 | | HTTP UAT | 定时紧凑 · 上海 · 3 天 上海国际饭店 | 每天 4 个站点 · 经济预算 | |
| TC-UAT-K03 | | HTTP UAT | 定时紧凑 · 里斯本 · 无起点/终点 | 省略第一段入境腿 | |
| TC-UAT-K04 | | HTTP UAT | 定时紧凑 · 北京 · 友谊宾馆 · 无终点 | 比 T04 medium 更密 | |
| TC-UAT-K05 | | HTTP UAT | 定时紧凑 · 东京 · Park Hyatt | 2 天高档 | |
| TC-UAT-K06 | | HTTP UAT | 定时紧凑 · 香港 · 无起点 · 终点天星码头 | 城市 search_anchor | |
| TC-UAT-H01 | | HTTP UAT | 营业时间映射 | 运维 HTTP / 详情 | |
| TC-UAT-F01 | | HTTP UAT | 无住宿类回退 | 运维 + `place-filters.test.ts` | |
| TC-UAT-M01 | | HTTP UAT | 从站点推导餐饮时间窗口 | `meal-windows.test.ts` + 运维 | |
| TC-UAT-D01a | | HTTP UAT | 仅 AMAP 定时搜索（空 places） | `amap/direct.test.ts` + 运维 | |
| TC-UAT-D01 | | HTTP UAT | 仅 AMAP Directions | 运维 + `itinerary-timed.test.ts` AMAP 腿段 | |
| TC-UAT-M02 | | HTTP UAT | 餐饮腿段 Directions | 运维 HTTP | |
| TC-UAT-G01 | | HTTP UAT | 终点地理偏移 | 廊道标记搜索 + `itinerary-timed.test.ts` | |
| TC-UAT-F02 | | HTTP UAT | 严格站点/餐饮黑名单 | `place-filters.test.ts` + T04/T06 | |
| TC-UAT-A01 | | HTTP UAT | 城市 search_anchor | `itinerary-timed.test.ts` + T06 | |
| TC-UAT-M03 | | HTTP UAT | 晚餐 18:00 + 下午茶 | `meal-windows.test.ts` | |
| TC-UAT-M04 | | HTTP UAT | 午餐/晚餐不重叠 | `itinerary-timed.test.ts` | |
| TC-UAT-M05 | | HTTP UAT | 跨日唯一站点/餐饮场所 | `itinerary-timed.test.ts` + T07 | |
| TC-UAT-P01 | | HTTP UAT | CN AMAP 优先定时搜索 | `itinerary-timed.test.ts` | |
| TC-E2E-01 | | 调用方 E2E | what2eat — 中国餐厅搜索 | `make test-e2e-caller`（可选加入，实时） | |
| TC-E2E-02 | | 调用方 E2E | what2eat — 供应商自动选择 | `make test-e2e-caller` | |
| TC-E2E-03 | | 调用方 E2E | where2play — 英文地点搜索 | `make test-e2e-caller` | |
| TC-E2E-04 | | 调用方 E2E | 行程 — 非硬编码城市定时规划 | `make test-e2e-caller` | |
| TC-E2E-05 | | 调用方 E2E | chatbox — 中文自然语言查询 | `make test-e2e-caller` | |
| TC-E2E-06 | | 调用方 E2E | 照片字段验证 | `make test-e2e-caller` | |
| TC-E2E-07 | | 调用方 E2E | 混合语言输入鲁棒性 | `make test-e2e-caller` | |
| TC-E2E-08 | | 调用方 E2E | 行程餐饮上下文匹配 | `make test-e2e-caller` | |
| TC-M3a-S01 | ✓ | 单元 | readJsonBody malformed → {ok:false} | `server.test.ts` | 3a |
| TC-M3a-S02 | ✓ | 单元 | SessionManager TTL 清理 | `src/mcp/session-manager.test.ts` | 3a |
| TC-M3a-S03 | | 单元 | SessionManager close() 清空 | `src/mcp/session-manager.test.ts` | 3a |
| TC-M3a-S04 | | 单元 | SessionManager 未过期保留 | `src/mcp/session-manager.test.ts` | 3a |
| TC-M3a-PS01 | ✓ | 单元 | 上海 + CN → AMAP only | `src/adapters/provider-resolver.test.ts` | 3a |
| TC-M3a-PS02 | ✓ | 单元 | 上海 + EN → Google + AMAP | `src/adapters/provider-resolver.test.ts` | 3a |
| TC-M3a-PS03 | ✓ | 单元 | 香港坐标 + HK → Google + AMAP | `src/adapters/provider-resolver.test.ts` | 3a |
| TC-M3a-PS04 | ✓ | 单元 | 台湾 + TW → Google only | `src/adapters/provider-resolver.test.ts` | 3a |
| TC-M3a-PS05 | ✓ | 单元 | 东京 + EN → Google only | `src/adapters/provider-resolver.test.ts` | 3a |
| TC-M3a-PS06 | ✓ | 单元 | 显式 providers 覆盖 | `src/adapters/provider-resolver.test.ts` | 3a |
| TC-M3a-PS07 | | 单元 | 中国城市列表文本匹配 | `src/adapters/provider-resolver.test.ts` | 3a |
| TC-M3a-PS08 | | 单元 | 坐标范围判断 | `src/adapters/provider-resolver.test.ts` | 3a |
| TC-M3a-PS09 | | 单元 | enrichProviders 含 TRIPADVISOR | `src/adapters/provider-resolver.test.ts` | 3a |
| TC-M3a-H01 | ✓ | HTTP | 中国地址无 providers → 中国结果 | `tests/http-tc-h.test.ts` | 3a |
| TC-M3a-H02 | ✓ | HTTP | 东京无 providers → 日本结果 | `tests/http-tc-h.test.ts` | 3a |
| TC-M3a-H03 | ✓ | HTTP | 发送非 JSON → 400 | `tests/http-tc-h.test.ts` | 3a |
| TC-M3a-H04 | | HTTP | 显式 providers 覆盖 | `tests/http-tc-h.test.ts` | 3a |

辅助测试（非 1:1 TC-H id）：`tools.test.ts`、`mcp.test.ts`、`itinerary.test.ts`、`itinerary-timed.test.ts`、`meal-windows.test.ts`、`place-filters.test.ts`、`tripadvisor-enrich.test.ts`、`chat.test.ts`、`dispatch.test.ts`、`src/adapters/google/live.test.ts`、`src/adapters/google/directions.test.ts`、`src/adapters/google/card-mapper.test.ts`、`src/adapters/amap/directions.test.ts`、`src/adapters/amap/card-mapper.test.ts`。

---

## 19. 调用方模拟端到端测试用例

这些测试从真实调用方视角验证 places-agent。使用 `make test-e2e-caller` 运行（可选加入，需要实时供应商 key）。框架与原则见 §7.1。

### TC-E2E-01: what2eat — 中国餐厅搜索

**Given** 有效调用方 key 且 `PLACES_VENDOR_MODE=live`
**When** POST `/v1/search_restaurants`，请求体：
```json
{
  "location": "上海市静安区南京西路1515号",
  "occasion": "下班小酌",
  "cuisine": "日料",
  "locale": "CN",
  "providers": ["AMAP", "GOOGLE_MAPS"]
}
```
**Then**：
- 响应 `ok: true`
- 所有结果的 `location.lat` 在 30–32°N 之间，`location.lng` 在 120–122°E 之间（上海区域）
- 至少一条结果的 `photos` 非空（供应商支持时）
- 所有结果的 `provider` ∈ `["AMAP", "GOOGLE_MAPS"]`
- 每条结果的 `sources[]` 非空

### TC-E2E-02: what2eat — 中国地址供应商自动选择

**Given** 有效调用方 key
**When** POST `/v1/search_restaurants`，请求体：
```json
{
  "location": "北京市朝阳区三里屯",
  "occasion": "朋友聚餐",
  "locale": "CN"
}
```
（无显式 `providers`）
**Then**：
- 结果包含来自 AMAP 的场所（针对中国地址自动注入）
- 无中国境外结果

### TC-E2E-03: where2play — 英文地点搜索

**Given** 有效调用方 key
**When** POST `/v1/search_places`，请求体：
```json
{
  "location": "Tokyo Tower, Japan",
  "query": "museums near Tokyo Tower",
  "locale": "EN"
}
```
**Then**：
- 结果的 `location.lat` 在 35–36°N 之间，`location.lng` 在 139–140°E 之间（东京区域）
- `provider` 为 `GOOGLE_MAPS`（非 AMAP，针对日本地址）
- 响应文本/名称为英文或日文（非中文）

### TC-E2E-04: 行程 — 非硬编码城市定时规划

**Given** 有效调用方 key
**When** POST `/v1/plan_itinerary`，请求体：
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
**Then**：
- `days` 数组有 3 条（9 月 1、2、3 日）
- `days[0].day_index === 1`（1-based）
- 每天至少有一个站点块
- 晚餐块的 `start_time` 在 "17:30" 到 "20:00" 之间
- 跨天无重复场所 `native_id`
- 场所坐标在成都区域内（纬度 30–31°N，经度 103–105°E）

### TC-E2E-05: chatbox — 中文自然语言查询

**Given** 有效调用方 key
**When** POST `/v1/chat`，请求体：
```json
{
  "messages": [{"role": "user", "content": "帮我找上海外滩附近的西餐厅，要有露台"}],
  "locale": "CN"
}
```
**Then**：
- 响应包含工具调用结果（非捏造场所）
- 若返回场所，坐标在上海区域内
- 响应文本为中文

### TC-E2E-06: 照片字段验证

**Given** 有效调用方 key
**When** 以 Google Maps 供应商对知名餐厅区域 POST `/v1/search_restaurants`
**Then**：
- 有照片的结果，`photos` 为 string[]，含有效 URL（非空数组）
- 无照片的结果，`photos` 字段完全省略（非 `photos: []`）

### TC-E2E-07: 混合语言输入鲁棒性

**Given** 有效调用方 key
**When** POST `/v1/search_restaurants`，请求体：
```json
{
  "location": "Shanghai Jing'an Temple",
  "cuisine": "火锅",
  "locale": "CN"
}
```
**Then**：
- 结果在上海（非随机全球结果）
- 供应商正确处理英文位置 + 中文菜系的混合输入

### TC-E2E-08: 行程餐饮上下文匹配

**Given** 有效调用方 key
**When** 对任意 2 天行程 POST `/v1/plan_itinerary`，使用定时详情
**Then**：
- 早餐块（如有）在 10:00 前
- 午餐块在 11:00–14:00 之间
- 晚餐块在 17:30–20:00 之间
- 下午茶块（如有）在 14:00–18:00 之间
- 整个行程中无餐饮场所重复出现

---

## MVP-3b：Photos + Price Level（TC-M3b）

对应 Feature **24**（photos）、**25**（price），批次 2。

| ID | 类型 | 主题 | 文件 |
|----|------|------|------|
| TC-M3b-01 | Unit | Google photo URL 含 API key（直接重定向） | `src/adapters/google/card-mapper.test.ts` |
| TC-M3b-02 | Unit | AMAP photo URL 提取 | `src/adapters/amap/card-mapper.test.ts` |
| TC-M3b-03 | Unit | price.ts: Google PRICE_LEVEL → $/$$/$$$/$$$$ | `src/core/price.test.ts` |
| TC-M3b-04 | Unit | price.ts: AMAP cost → price_level + price_per_person | `src/core/price.test.ts` |
| TC-M3b-05 | HTTP | 搜索结果含 photos + price_level 字段 | `tests/http-tc-h.test.ts` |
| TC-M3b-06 | Unit | 无 photos 的 POI → photos 为 undefined | `src/adapters/google/card-mapper.test.ts` |

## MVP-3c：Provider Resolver 重构（TC-M3c）

对应 Feature **22**（provider auto-selection 修复），批次 3。

| ID | 类型 | 主题 | 文件 |
|----|------|------|------|
| TC-M3c-01 | Unit | 中環 → 香港（不再误判为大陆） | `src/adapters/provider-resolver.test.ts` |
| TC-M3c-02 | Unit | 臺北 → 非大陆（Google only） | `src/adapters/provider-resolver.test.ts` |
| TC-M3c-03 | Unit | 銀座 → 非大陆（CJK fallback 删除） | `src/adapters/provider-resolver.test.ts` |
| TC-M3c-04 | Unit | 北京 → 大陆（AMAP only） | `src/adapters/provider-resolver.test.ts` |
| TC-M3c-05 | Unit | async geocode-first 检测 | `src/adapters/provider-resolver.test.ts` |
| TC-M3c-06 | Unit | AMAP 空结果 → Google fallback | `src/adapters/provider-resolver.test.ts` |

## MVP-4a：语言路由 + 搜索关键词（TC-M4a）

对应 Feature **26**（search-keywords）、**27**（language-router），批次 4。

| ID | 类型 | 主题 | 文件 |
|----|------|------|------|
| TC-M4a-01 | Unit | language-router: CN locale → CN 关键词 | `src/agent/language-router.test.ts` |
| TC-M4a-02 | Unit | language-router: HK locale → Google 双语 | `src/agent/language-router.test.ts` |
| TC-M4a-03 | Unit | search-keywords: 日料 ↔ Japanese restaurant 映射 | `src/i18n/search-keywords.ts` |
| TC-M4a-04 | Unit | itinerary-timed 去硬编码城市 | `tests/meal-windows.test.ts` |

## MVP-4b：性能优化（TC-M4b）

对应 Feature **23**（search cache + geocode cache），批次 5。

| ID | 类型 | 主题 | 文件 |
|----|------|------|------|
| TC-M4b-01 | Unit | geocode-cache: 命中返回缓存 | `src/core/geocode-cache.test.ts` |
| TC-M4b-02 | Unit | geocode-cache: TTL 过期后重新请求 | `src/core/geocode-cache.test.ts` |
| TC-M4b-03 | Unit | search-cache: 相同参数命中 | `src/core/search-cache.test.ts` |
| TC-M4b-04 | Unit | search-cache: 不同参数不命中 | `src/core/search-cache.test.ts` |
| TC-M4b-05 | Unit | itinerary 餐厅搜索 Promise.all 并行 | `src/core/itinerary.test.ts` |
| TC-M4b-06 | Integration | 缓存隔离: afterEach clearCache | `tests/http-tc-h.test.ts` |

---

## MVP-5：Admin 加固（TC-M5）

对应 [`agent-stories.md`](./agent-stories.md) Feature **28**、[`0.refactor-plan.md`](./0.refactor-plan.md) 批次 6。

| ID | 类型 | 主题 | 状态 |
|----|------|------|------|
| TC-M5-API01 | Unit / HTTP | DELETE 不存在资源 → 404 + error.key | 已覆盖（api-error-handler 单测 / Admin API） |
| TC-M5-API02 | Unit / HTTP | 唯一约束冲突 → 409 + error.key | 已覆盖 |
| TC-M5-UI01 | Component | Admin Error Boundary 捕获渲染错误 | 已覆盖（`app/admin/error.tsx`） |
| TC-M5-AUTH01 | Unit | 密码重置 token TTL = 4h | 已覆盖 |
| TC-M5-AUTH02 | Unit | Session payload 含 `iat` | 已覆盖 |
| TC-M5-E2E01 | E2E | 邀请 → 设密码 → 登录 | 已覆盖（`e2e/test_admin.py`） |
| TC-M5-E2E02 | E2E | 密码重置 → 邮件 → 设密码 → 登录 | 已覆盖（`e2e/test_admin.py` + `scripts/seed-e2e-reset.ts`） |

---

## MVP-6 续：MCP 工具拆分 + Token 优化 + 行程配图

> **与 Claude Code Plan**（`~/.claude/plans/flickering-humming-gizmo.md`）对照：  
> Plan 中的 TC-M6-PA*（prompt-assembler）/ IT*（itinerary Zod）由单测覆盖（`prompt-assembler.test.ts`、`itinerary-planner.test.ts`）。  
> 下表为落地后续增的 MCP/token/photos 矩阵。  
> **阻塞：** 无（HTTP DP05/AD08 已落地）。  
> Plan 中大量 E2E-live 边界（R*/T*/B*/E*）未全部自动化 → MVP-7 backlog，不虚构已绿。

### discover_places MCP 工具

| ID | 类型 | 主题 | 状态 |
|----|------|------|------|
| TC-M6-DP01 | Unit | discover_places 返回候选景点 ≤ 8 个 | 目标 |
| TC-M6-DP02 | Unit | discover_places 返回候选餐厅 ≤ 8 个 | 目标 |
| TC-M6-DP03 | Unit | 候选含 name, type, rating, lat/lng（不含 hours/price） | 目标 |
| TC-M6-DP04 | Unit | 天气数据包含在返回中 | 目标 |
| TC-M6-DP05 | HTTP | /v1/discover_places 返回 JSON 含 candidates + weather | `tests/dispatch.test.ts` |

### arrange_day MCP 工具

| ID | 类型 | 主题 | 状态 |
|----|------|------|------|
| TC-M6-AD01 | Integration | arrange_day 返回单天 JSON（mock LLM） | 目标 |
| TC-M6-AD02 | Integration | 每个 block 含 reason 字段 | 目标 |
| TC-M6-AD03 | Integration | 有 origin 时含 from_origin 交通段 | 目标 |
| TC-M6-AD04 | Integration | 无 origin 时无 from_origin，start_time ≥ 10:00 | 目标 |
| TC-M6-AD05 | Unit | Zod 校验失败 → 重试一次 | 目标 |
| TC-M6-AD06 | Unit | 2 次失败 → fallback 旧代码 + outcomeKey | 目标 |
| TC-M6-AD07 | Unit | 候选 name 不在列表 → Zod 拒绝 | 目标 |
| TC-M6-AD08 | HTTP | /v1/arrange_day 返回单天 JSON | `tests/dispatch.test.ts` |

### Token 优化

| ID | 类型 | 主题 |
|----|------|------|
| TC-M6-TK01 | Unit | user message 候选数 ≤ 8 per type |
| TC-M6-TK02 | Unit | user message 不含 hours/price 详情 |
| TC-M6-TK03 | Unit | max_completion_tokens = 2048 |
| TC-M6-TK04 | Unit | LLM 超时 45s + AbortController |

### 行程配图

| ID | 类型 | 主题 |
|----|------|------|
| TC-M6-PH01 | Unit | block.photos 从候选 photos 字段匹配 |
| TC-M6-PH02 | Unit | 无 photos 的候选 → block.photos 为 undefined |
| TC-M6-PH03 | Unit | 封面图 = Day 1 第一个 attraction 的首张 photo |

### 性能回归

| ID | 类型 | 主题 | 状态 |
|----|------|------|------|
| TC-M6-PF01 | E2E-live | discover_places 耗时 < 10s | opt-in live |
| TC-M6-PF02 | E2E-live | arrange_day 单天耗时 < 30s | opt-in live |
| TC-M6-PF03 | E2E-live | plan_itinerary 1天 < 40s（discover + arrange） | opt-in live |
| TC-M6-PF04 | E2E-live | plan_itinerary 2天 < 60s | opt-in live |

### MCP 集成

| ID | 类型 | 主题 |
|----|------|------|
| TC-M6-MCP01 | HTTP | MCP tools/list 包含 discover_places + arrange_day |
| TC-M6-MCP02 | HTTP | MCP tools/call discover_places 返回候选 |
| TC-M6-MCP03 | HTTP | MCP tools/call arrange_day 返回单天行程 |

### MVP-7 backlog（Claude Plan 未全自动化项）

| 来源 | 说明 |
|------|------|
| TC-M6-PA* / IT* 索引 | 已有单测文件；可在索引表补正式 ID 映射 |
| Plan E2E-live R/T/B/E | 范围过宽、交通边界、冷门城市等 — 未全部脚本化；opt-in live |
