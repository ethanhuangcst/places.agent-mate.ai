# places-agent 行程规划真智能体修改方案

**Status:** 方案稿 / 规范真源（2026-09-06）  
**Related:** [ADR-050](../../workspace-specs/adr/ADR-050-where2play-no-product-llm.md) **Proposed**（where2play 零产品 LLM）；取图 [ADR-051](../../workspace-specs/adr/ADR-051-discover-resolve-display-photo.md)（含 D6：高德 CDN `http`→`https`；`maxWidthPx=800`）；供应商 [ADR-052](../../workspace-specs/adr/ADR-052-map-provider-routing.md)（含 2026-09-06：废除 discover 扩源 + D9/D10）；起点整卡 [ADR-053](../../workspace-specs/adr/ADR-053-origin-stay-as-stop-card.md)（均 Accepted，050 除外）  
**漂移课：** [`../../workspace-specs/knowledge/maps/adr-052-discover-expansion-drift.md`](../../workspace-specs/knowledge/maps/adr-052-discover-expansion-drift.md)  
**对照：** [1-agent-refactory.md](./1-agent-refactory.md) 仅历史 draft/ai-proposed。  
**细化检查表：** [`../../workspace-specs/knowledge/agent/real-agent-refinement-checklist.md`](../../workspace-specs/knowledge/agent/real-agent-refinement-checklist.md)  
**现行 as-built：** 宿主/BFF 调 `discover_places` → `make_itinerary` → `plan_next_stop`×N；HTTP 读 `fetch_trip_details`（ADR-046）；2play 可能仍持产品 Qwen（至实现切片前）。

---

## 原则

循环在 places-agent 进程内：模型看行程目标 + 已有 Trip + 可用工具，决定 act 或停。

- 宿主 **只**调对外两个方法，不按 discover → make → plan_next_stop 调度，也不按 draft 的 intake → make → plan_trip_details×N 调度。
- draft 里的「收边界 / 建骨架 / 填细节」是环的内部意图，**不是**对外 API。
- 实现可拆私有函数；**不**注册 `intake_*` / `compose_*` MCP 或 HTTP。
- 真智能体 = 谁持有循环；事实闸（验真、Directions、eligible）仍由代码执行。
- **where2play 零产品 LLM（ADR-050）：** 无 `QWEN_*` / `OPENAI_*` 做问卷、L2、助手、贴士散文、改行程。BFF 只渲染 `need_input`、回传答案、HTTP 写/读。
- **what2eat 不受本方案改契约：** ADR-050 D3。不并入 `plan_trip`、不改 2eat 产品 LLM、不改其 HTTP 工具名与超时。供应商省略 `providers[]` 服从已接受的 [ADR-052](../../workspace-specs/adr/ADR-052-map-provider-routing.md)，不是本方案新开的 2eat 故事。
- **起点是普通 stop 卡（ADR-053）：** 用户选定酒店当时落齐 PlaceCard；之后骨架 / 填站 / 图 / 钉 **只抄卡**，禁止按店名重搜或 `cards[0]`。
- **搜哪家由 agent 自动选（ADR-052）：** 行程环内 `search_places` / 酒店搜 / discover **省略** `providers[]`。禁止 2play 按汉字拼双源；discover **不再**扩双源（Feature **89**）。

### 宿主分型

| 宿主 | 行为 | 纪律风险 |
| --- | --- | --- |
| **2play HTTP** | 确定性：`plan_trip` + `fetch_trip_details`；展示 agent 下发问题与芯片 | 无工具选择；勿把写信封当 UI |
| **what2eat HTTP** | **不在本方案范围。** 仍只调现有 Decide/Chat 工具（见下节），不经 `plan_trip` | 禁止把 2eat 收进行程环或零产品 LLM |
| **MCP（ChatBox / Cursor）** | 自然语言应命中 `plan_trip`（别名）；细节 fetch | 并行/问确认/编造行程 — 见既有 MCP knowledge；不靠改 system prompt |

---

## 对外方法（两个）

### `plan_trip`（MCP + HTTP）

编排入口。收行程边界，或 `trip_id` + 自然语言/字段补丁。

- **目的地一旦有**（城市 geocode 成功）：懒创建 `trip_id`，写出必去芯片，其余缺口 `need_input`（问题列表由 **agent** 给出，2play 只渲染）。此时不建完整规划池、不跑骨架。
- **边界齐了：** 进入工具环排程（建/补池 → 骨架 → 填细节 → 硬闸）。
- 回 `trip_id` / `revision` / `status`：`needs_input` | `planning` | `ready` | `failed`。
- HTTP 写响应不当行程真源。
- 描述须含触发语：安排行程、N日游、plan a trip。缺字段由本工具 `need_input`，不要指引宿主改调其它 MCP。
- 别名转同一 handler：`plan_itinerary`、`trip_plan`、`trips`。过渡期 `discover_places` / `make_itinerary` 可进同一入口。
- 与 draft `plan_trip_details`、曾用名 `compose_trip` 不是对外方法。

### `fetch_trip_details`（已有）

`trip_id` + `fields[]`（`skeleton` | `candidates` | `constraints` | `filled` | `cursor` | `artifacts`）+ 可选 `day_index`。

Web 逐行/按日、芯片、四卡、缩略图只读这里。不新增 `get_trip_details`。读路径**不**解析图、不升 `revision`（ADR-046 / ADR-051）。

---

## 行程问卷与第 6 题（必去芯片）

问句由 **`plan_trip` 返回的 `need_input` / questions** 给出；where2play **不组织、不生成**问句文案以外的地名选项（产品文案可用 i18n 包装 agent 字段，不得本地模型列景点）。

```text
用户答完城市（通常第 1 题）
  → POST /v1/plan_trip { city, …已有字段 }
  → 芯片写入 candidates（must_see）
  → 回 needs_input + trip_id
  → fetch_trip_details(fields: ["candidates"])
  → 第 6 题 A/B/C = 验真卡（展示 name，value = native_id；图 = 卡上已解析的 `photos[0]`）
  → 芯片未就绪：不得伪造选项；可显示加载或跳过勾选

用户勾选
  → plan_trip { trip_id, must_include: 所选卡 id/验真名, …其余答案 }
```

勾选写入 `constraints.must_include`（可标 `user_requested`）。后续骨架/filled 只引用同一池卡。

用户选定酒店（非 skip）：同一次 `plan_trip` 写入 `constraints.originStay` **整卡**（ADR-053），并当时 `resolveDisplayPhoto`。2play 只回传所选卡的 `native_id` / 指针，不自己搜地图钉点。

---

## 环内工具（3–5，不升 MCP 主路径）

模型自己选下一跳；顺序不写死为对外契约：

1. `geocode`：验**城市**锚点（无LLM）。区域判法 ADR-052 D3（坐标 / Geocode 国家文本；**禁 CJK 占比**）。滤池 80km 锚=城市（ADR-048）。
2. `search_places`：省略 `providers[]`（ADR-052）。按名或类目搜；景点命中入 stops pool（池只放景点，不放餐厅/酒店）。酒店选店是**另一次**住宿类搜索，结果进 `originStay` 卡，不进景点池。
3. `directions`：先 `resolveProviderStrategy`（ADR-052 D7）；**禁止**硬编码 `["GOOGLE_MAPS","AMAP"]`。权威时长只来自供应商腿。禁止模型口算；**只用账本坐标**，不按店名再定位。
4. `commit_trip`：声明式补丁，升 `revision`。仅内部（沿用 `patchTrip` 语义）。
5. （可选）`ask_user`：仍缺约束时停，等价 `need_input`，不猜。

签证、天气：内部 adapter（Orizn REST、Open-Meteo），由 `plan_trip` 在写四卡前拉事实，不升宿主 MCP。

取图：内部 `resolveDisplayPhoto`（不升 MCP/HTTP）。景点/餐：第一次写卡；**起点：选定当时写卡**（ADR-053），fill 有指针则只抄。

---

## 起点 stay 整卡（ADR-053）

用户点选酒店的那一刻，建成与景点/正餐**同形**的 PlaceCard，身份一次钉死。

| 必须 | 说明 |
| --- | --- |
| `name` | 供应商店名 |
| `location.lat/lng`（WGS84） | **这张卡**的点，不是城市中心 |
| `provider` + `sources[].native_id` | 详情 / deeplink 只认此 ID |
| `photos[0]` | 选定当时能解析才写（ADR-051 D3） |
| 住宿类信号 | 钟楼等纯景点不得当 `hit` |

- 括号副标（「西安钟楼回民街店」）只进 `address` / `near`，**不进**主 query。
- **`skip`（无固定酒店）：** 无店卡；可用城市坐标；禁止城市点冒充某酒店。
- Trip：`originStay` 整对象，不要只 `hotel: 店名`。骨架每日 `kind: stay` **带指针**。`stampStayCoords` 只盖这张卡的点。
- 填站：有 `native_id` 或已有可展示图 → **只 slim/抄卡**。无指针才可搜，必须名称覆盖 + 住宿类，**禁止 `cards[0]`**；无合格卡则空图。
- 搜酒店：ADR-052 自动选源（与 discover 同一套 D2+D4）；discover **不再**扩双源。
- 旧错绑 stay 不回填。2play 不按名称再 geocode / search 已入账的起点。

---

## 地图供应商（ADR-052，环内默认）

`plan_trip` 环与过渡路径（`discover_places` / `search_places` / 搜餐 / 酒店 / Directions）：**省略** `providers[]`，传 `address` 和/或 `near`。一律 `resolveProviderStrategy` + D4。

| 区域 | 搜索 |
| --- | --- |
| 大陆 | AMAP-only；**该次** 0 卡再一次 Google（仅自动选时） |
| 香港 | Google + AMAP |
| 其他（含台湾、海外） | Google |

Locale **不**决定供应商。Chat 剥掉模型填的 `providers[]`；HTTP 显式列表覆盖且不触发 D4。打开哪张地图 App ≠ 搜哪家（D6）。what2eat 同样省略 `providers[]`，工具名不变。

### 废除 discover 扩源

**禁止** `resolveDiscoverProviders` / Feature 34 式「大陆 AMAP-only → 无条件 AMAP+Google」。芯片、补池、骨架、fill、stay、餐厅 **同一套** D2+D4。不得先双源再按 rating 混排进池。as-built 仍漂移时见漂移课；实现切片 agent Feature **89**。

### 三层同一身份（D9）+ 详情语言（D10）

供应商在 **search 写入 PlaceCard** 时钉死；之后只抄卡，不换源。

| 表面 | 规则 |
| --- | --- |
| **框架**（池 / 骨架 / fill） | 大陆候选 `provider` 应为 `AMAP`（除非该次 D4）。Fill **拷贝**池卡；禁止跨供应商按 rating 重选「同一景点」；合并不把 Google 英文名当成另一张必去卡。 |
| **列表** | 渲染槽位 `name` / 地址 / `provider` / `native_id` / `photos[0]`。**不**调 `get_place_details`、不重搜。 |
| **Stop 详情** | `get_place_details({ provider: slot.provider, native_id, locale })` — 只打槽位这一家，禁止 fan-out。Google 必须带 UI `languageCode`。不得用拉丁详情名盖掉槽位已有 CJK 名/地址。 |

旧 trip 槽位已是 Google 的详情仍走 Google；**新**大陆行程不得再写入 Google 景点卡（除非 D4）。列表中文、详情半秒变英文视为缺陷。

---

## what2eat 隔离（本方案不得改其产品面）

what2eat 是薄 BFF + 荐餐厅，**不是**行程宿主。as-built 只打 places-agent：

| HTTP | 用途 | 本方案 |
| --- | --- | --- |
| `POST /v1/geocode` | 点选/地址 | **保持**；不得改成必须带 `trip_id` |
| `POST /v1/search_restaurants` | Decide 列表 | **保持**独立工具；禁止并入 `plan_trip` / 景点池 |
| `POST /v1/get_place_details` | 卡片详情 | **保持**；2eat 可继续用（与 2play「不为补图主路径调 details」正交） |
| `POST /v1/chat` | 页内 chat（agent 工具环，常 geocode + `search_restaurants`） | **保持**；禁止改道 `plan_trip` 或砍掉 `search_restaurants` 工具 |

what2eat **不调用** `discover_places` / `make_itinerary` / `plan_next_stop` / `plan_trip` / `fetch_trip_details`。实现切片：

1. **零产品 LLM 只废 2play**（ADR-050）。what2eat 仍可持产品 `QWEN_*`（ADR-047）；agent 侧 Qwen 供 2eat `chat` 的工具环，不得因 2play 去密钥而关掉 agent LLM。
2. **别名只对行程入口**（`plan_itinerary` / `trip_plan` / `trips` → `plan_trip`）。**禁止**把 `search_restaurants` / `chat` / `geocode` / `get_place_details` 重指向 `plan_trip`。
3. **Trip Store / 景点库 / eligible 景点闸** 只服务行程。`search_restaurants` 不写入 `AttractionPoi`（ADR-049 餐馆不入库）。不得用「可规划景点」谓词滤掉 2eat 餐厅卡。
4. **取图：** 行程挂钩不变。若将 `resolveDisplayPhoto` 复用到 `search_restaurants`，必须是**同一 PlaceCard、无 `trip_id`、失败则无 `photos`**，墙钟落在 2eat search 超时内。2eat **省略** `providers[]`（ADR-052），不另写区域表。
5. **共享进程副作用：** 不改 caller key 校验、`agent` 字段、envelope `ok`/`outcome` 形状；供应商解析以 **ADR-052** 为准（旧 ADR-026/031 已 supersede）。行程 AbortSignal / `plan_trip` 阶段超时不得覆盖 2eat `chat`（默认 ≥90s）与 search 预算。
6. **回归：** 行程切片合入前，2eat Decide 搜餐厅 + 至少一轮 `/api/chat` 仍须对同一 agent 绿（或明确 skip 原因）。红则先修隔离，再合 `plan_trip`。

---

## 可展示图（ADR-051，环内写卡）

Google 搜索只给 `photos[].name`，不是 `<img src>`。带 `key` 的 media 入账本会被 sanitize 剥成死链。高德 `photos[].url` 常为直链，但**经常是 `http://store.is.autonavi.com/...`**；https 门 + 浏览器混合内容会剥掉大半大陆景点图。

**原则：** places-agent 在**第一次把展示卡写入账本**时解析 **一张** 无 key 的公开 **https** → `photos[0]`。宿主不补图、不升协议。起点：**选定当时**解析（ADR-053）；有 `originStay` 指针则 fill **不**按店名再搜再取图。

| 卡 | 何时解析 | 之后 |
| --- | --- | --- |
| 景点 | 建池 / 写芯片 | 填站抄池 |
| 正餐 | 填站现搜后 | — |
| **起点 stay** | **intake `hit` / 芯片选定那一张** | 骨架与 fill **只抄**；同 trip 复用 |

`skip`：无店卡、图空。餐厅与酒店 stay 不进 `AttractionPoi`。

### 挂钩（Target vs 过渡）

| 谁建卡 | 真智能体 | 过渡 as-built（同一函数） |
| --- | --- | --- |
| 芯片 / 景点进 `candidates` | 环内 `search_places` + eligible，`commit_trip` 前 | `discover_places` 建池 |
| 填景点 | 从本 trip 池 **抄** `photos[0]` | `plan_next_stop` 抄池 |
| 正餐店 | 填站现搜后解析 | `plan_next_stop` 现搜后解析 |
| **起点 stay** | 选店写入 `originStay` 时解析 | intake 建卡；fill 有指针则只抄（禁 `cards[0]`） |

### 解析链（每卡最多一张；钥匙不进账本）

对当时写入的景点 / 餐店 / **stay** 卡各最多一张：

1. 高德 `photos[].url`（直链）→ 用。若为 `http://` 且主机为高德 CDN（`*.autonavi.com` / `*.amap.com`），**先升 `https://`**（D6 / `upgradeAmapInsecurePhotoUrl`），再过 https 门。
2. 否则 Google `photos[].name` → `GET .../media?maxWidthPx=800&skipHttpRedirect=true` → JSON **`photoUri`**（CDN，无 key）。**800** = 列表拇指与 place-sheet lightbox **共用**同一张 `photos[0]`（不另存大图 / 第二真源）。
3. 否则 Place Details 的 photos，同一把 key，同宽度。
4. 否则 TripAdvisor（已有 `TRIPADVISOR_API_KEY`）。
5. 都没有 → 不写 `photos`，不编造。

`GOOGLE_PHOTOS_ENABLED=false` 跳过 2–3。写入前：D6 升协议 → `sanitizePublicUrl`；死 media / **非高德 CDN 的 http** 丢掉。挂点：`amapPoiToCard` 与 `resolveDisplayPhoto` / `firstDisplayable`。**不在 2play 升协议。** 并发：芯片 3–5；补池 4–8；stay **仅选定一张**。单卡失败不失败整次 `plan_trip`。不因无图把 Google 当大陆 discover 补图真源（ADR-052）。

### 落库

- Trip `candidates` / `filled`：`photos[0]` 为 UI 真源（列表 + lightbox 同一 URL）。
- `AttractionPoi.cardSlim`：保留**已解析**的一张 https。跨行程复用则跳过 media。不存 `photos[].name`、不存带 key URL、不存裸 `http://`。

### 读与旧数据

`fetch_trip_details` 只读（含 `stop-origin`）。2play 映射 `photos[0]` / `nativeId` / `mapUrl`。旧坏链 / 裸 http / 缺图 / 错绑 stay **不回填**：景点重跑建池；餐重跑 fill；起点须**新开一程或重跑 intake+fill**。CDN 热链失效再开代理故事。

### 墙钟（相对 LLM 可忽略）

| 阶段 | 增量（并行） |
| --- | --- |
| 芯片 3–5 张 | 约 0.3–1s |
| 补池 20–40 张 | 约 1–4s，可与骨架 LLM 重叠 |
| 每餐 1 店 | 约 0.1–0.4s，叠在搜店 / Directions |
| 起点 stay（选定 1 张） | 约 0.1–0.4s **一次**（此后抄卡，不按日、不按 fill 重打） |
| 高德 D6 升 https | 可忽略（字符串改写，无额外 HTTP） |

不为齐图把一次 HTTP 拖到 `ready`。

---

## 必去地推荐（城市已知就要列出）

**何时：** 目的地确定之后立刻出，与问日期/酒店/节奏并行（后续问题仍由 agent `need_input` 列出）。

**如何产生：**

1. `geocode` 目的地（无LLM）。
2. LLM 提名 3–5 个必去（知识在权重，不写城表）。
3. 并行 `search_places` + eligible。
4. 命中写入 `candidates` 并打 `must_see`。**commit 前**对这 3–5 张卡跑内部 `resolveDisplayPhoto`（见下节）。UI / Chat 均 `fetch` 列出。

**两层名单：** 可勾选 = search + eligible；仅展示 = 未命中 LLM 名。禁止只 geocode 中文名当验真。

完整规划池在边界齐后由环内再搜；未勾选推荐当软偏好。补池写入时同样解析首图（可与骨架 LLM 重叠；不必等齐图才 `need_input`）。

---

## 出行贴士四卡（并入 `plan_trip`）

写入 `artifacts.tips`；签证写入 `artifacts.visa`。UI 只 fetch `artifacts`。不要求宿主另调 `travel_tips` / Orizn MCP。`travel_tips` 可保留为同一内部函数的别名。

| 卡 | 内容 | 事实 | LLM |
| --- | --- | --- | --- |
| 01 | 简介 ≤80 字 + **必去列表** + 签证 | 必去 = 验真 `must_see`；签证 = `visa_requirement` | 只写简介 |
| 02 | 天气 + 交通推荐 | Open-Meteo；`transport` | 交通表述；数字不编 |
| 03 | 衣着 | 聚合天气 | 能 |
| 04 | 安全 | 目的地 + 可选 Orizn safety | 能；不得与签证矛盾 |

**何时：** 目的地已锚 **且** 起止日已有。芯片未就绪则等芯片再写 01 必去格。

**一次 LLM：** 先并行拉事实；再一次 tips-prose。01 必去名与签证字段模板填入。不与「提名必去」合并。

---

## 环内如何排程

- **补池 / 骨架 / 餐档 / 填细节 / 硬闸复查** — 骨架在过闸池上选点；每日 stay **抄 `originStay` 指针**（无店则 skip）；不锁站间分钟；餐档不锁店；Directions 只用账本坐标；破窗缩短停留；全住宿不得 `ready`。
- **停：** `ready` = 质量 A 层通过；否则 `failed` / `need_input`。

质量两层（A 事实闸 / B 口味）与 DoD（非目录城）见检查表 #1–#17、#34。

---

## Chat / 改行程

自然语言进 **`plan_trip`**（同一 loop、同一工具、同一硬闸）。带 `trip_id` 时只补缺，不重开问卷。

改已有行程：模型决定小补丁或补搜/重排，经 `commit_trip`；UI 再 fetch。

**2play `/api/chat` Target：** 不跑本地模型。实现切片可将该路由改为转发 agent（默认仍落 `plan_trip`；具体路径名实现时定），或废弃本地 chat 只保留表单+`need_input` 往返。**禁止** as-built 的 BFF OPENAI_CN/Qwen 补全行程。

where2play / ChatBox / Cursor 都是入口宿主；行程事实只来自 agent。

---

## 相对现行的改动

| 现行 as-built | 本方案 Target |
| --- | --- |
| 对外多工具编排 | `plan_trip` + `fetch_trip_details` |
| 循环在宿主 / 2play L2 | 循环在 agent |
| 2play 持产品 Qwen（ADR-036/037/047） | **2play 零产品 LLM（ADR-050）** |
| 问卷由 2play 助手组织 | 问卷来自 agent `need_input` |
| 芯片等 discover；四卡等 make | 城市→芯片；日期→四卡 |
| 第 6 题可能由 2play 模型列名 | 只 fetch 验真 `must_see` |
| 骨架可估交通、可锁餐厅 | 分区不锁分钟；餐在填细节搜 |
| 图：坏 media；高德 http 被剥；起点 fill 再搜成钟楼 | 写卡解析 https；**D6 仅高德 CDN 升 https**；`maxWidthPx=800` 共用；起点选定建卡+图，fill 只抄 |
| 2play 汉字双源 / 按名再定位 | 省略 `providers[]`（ADR-052）；入账后禁止按名搜 |
| discover 门面扩双源；详情变英文 | **废除扩源**；D9 抄卡同身份；D10 详情跟 UI locale（Feature 89） |

---

## 细化检查表

完整 34 条（含相对最新设计：仍适用 / 须改写 / MCP-only）：

→ [`workspace-specs/knowledge/agent/real-agent-refinement-checklist.md`](../../workspace-specs/knowledge/agent/real-agent-refinement-checklist.md)

审稿时优先：**#1、#4–5、#8、#10、#18–22、#25、#33**（供应商/废除 discover 扩源、起点整卡、芯片、去双脑、取图、规格漂移）。

---

## 明确不做

- 不把 `intake_trip_requirement` / `make_itinerary` / `plan_trip_details` / 宿主必调 `travel_tips` 做成编排序列。
- 不对外暴露 `commit_trip` / `patchTrip` / `intakeTripRequirements` / `compose_trips`。
- **where2play 部署不为排程/助手持 `QWEN_*` / `OPENAI_*`（ADR-050）。不把同一条套到 what2eat。**
- 不把 what2eat 的 `search_restaurants` / `chat` / `geocode` / `get_place_details` 收进 `plan_trip`，不改其超时与 envelope。
- 不恢复按城 POI 源码表。
- 不把地图 key 下发 Web；不把带 key 的 Photo media URL 写入 Trip / 写信封 / 2play 可见 JSON。
- **不在 2play 升协议**；不把任意 `http://` 当可展示图；仅 agent 对 `*.autonavi.com` / `*.amap.com` 做 D6。
- 不为 lightbox 另存第二套大图 URL；列表与详情共用账本 `photos[0]`（`maxWidthPx=800`）。
- 不在 `fetch_trip_details` 上解析图、补身份或改 revision。
- 2play **不**按店名再 `geocode` / `search_places` 已入账起点；不把城市中心盖到有店名的 stay 上。
- fill **禁止**酒店全名 + `cards[0]`；括号副标不进酒店主 query。
- discover **不再**扩双源（禁 `resolveDiscoverProviders`）；stay / 餐厅 / 景点同一套 D2+D4；不按 CJK 或 locale 拼供应商。
- Directions **不**硬编码 `["GOOGLE_MAPS","AMAP"]`；省略时走 `resolveProviderStrategy`。
- 列表 / fill **不**跨供应商重选景点；详情 **不** fan-out、不盖掉槽位 CJK 名（ADR-052 D9/D10）。
- 不为齐图阻塞 `need_input` 或一次 HTTP 等到全程 `ready`。
- 不给 MCP「拼装全程大 JSON」特权通道；默认瘦响应，细节一律 fetch。
- 不要求用户改 ChatBox system prompt。
- 不用 LLM 编签证类型/免签天数或第二套必去店名。
- 不把「按日并发 LLM 骨架」（ADR-046 D11 已否）混进本方案。
- 不整篇假同步改写 Accepted ADR-036/037 正文直至实现切片 + retrospective。
