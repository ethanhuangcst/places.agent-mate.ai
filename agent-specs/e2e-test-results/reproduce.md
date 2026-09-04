# 里斯本 3 日：起飞栏 → intake → 规划 → 详情（链路复现）

复现日期：2026-09-03。条件取自产品截图。本文只写「谁调了什么、拿到什么、怎么处理、界面怎么用」，不写修复方案。

## 输入（图 1）

| 字段 | 值 |
| --- | --- |
| 目的地 | 里斯本 |
| 起始日 / 天数 | 2026-09-03 / 3 天 |
| 人数 / 预算 | 2 人 / 中等（$$） |
| 住宿 | Hills Hotel Lisboa |
| 每日开始 | 7:00 |
| 类型 / 节奏 / 交通 | 情侣出游 / 轻松 / 捷运 + 步行 |
| 必去 | 贝伦塔、罗卡角 |
| 其他 | 无 |

2play 发给 agent 时：城市多为「里斯本」，`locale` 多为 `CN`，日期窗 `2026-09-03`～`2026-09-05`，节奏 `relaxed`。中等预算在映射里常常对不上 `budget`/`premium`，`make_itinerary` 可能不带预算档。

## 数据落在哪（总表）

权威行程在 **places-agent 的 Trip 账本**（ADR-046）：PostgreSQL `places_agent.Trip` 一行 + agent 进程内存热副本。宿主不直连库。可读切片只有：`constraints`、`candidates`、`skeleton`、`cursor`、`filled`、`artifacts`。读方法只有 `fetch_trip_details(trip_id, fields[])`。

| 账本字段 | 谁写入 | 里面是什么 |
| --- | --- | --- |
| `Trip.id` / `revision` | 任一写工具懒创建 | 宿主后续必须带着走 |
| `constraints` | `discover_places`、`make_itinerary` | 城市、日期窗、origin、天数、必去等 |
| `candidates` | `discover_places`；`make_itinerary` 仅在候选非空时覆盖 | 瘦身后的景点/餐厅（名、坐标、`must_see`、评分等），无照片大包 |
| `skeleton` | `make_itinerary` | 按日主题 + stops |
| `filled` | `plan_next_stop` | **当前这一站**的 slot/legs（每次覆盖，不是按日累加数组） |
| `artifacts` | `travel_tips`（`tips`）、签证工具（`visa`） | 贴士四卡等 |
| `cursor` | 本链路 2play **未读未写** | — |

写工具响应里的 `data`（discover / make / tips / plan_next_stop 信封）**不是** 2play 展示真相。BFF 必须再 `fetch`。

2play 自己还有三层，都不是 agent 权威：

| 位置 | 内容 | 用途 |
| --- | --- | --- |
| 浏览器 React state | `tripId`/`revision`、芯片、intake 答案、NDJSON 拼出的 `itinerary` | 当场画页面 |
| 2play 库 `PlanSessionCache` | `criteriaJson` + `itineraryJson` | `GET /api/plan/current` 刷新恢复；**不**含 `trip_id` |
| 2play 库 `SavedItinerary` | 用户点保存后的快照 | 与本次规划链路无关 |

`geocode` 结果不进 Trip。酒店坐标只活在当次 BFF 请求内存里，再塞进 `make_itinerary.origin`。

---

## 第 1 步：起飞栏提交

**UI 做什么**

用户填起飞栏，点开始。页面不调 places-agent。只做本地校验，进入助手 intake（问酒店、出发时间、类型、节奏、交通、必去、其他）。同时后台开「提前搜点」。

**UI → 2play BFF**

`POST /api/plan/discover`（登录态），body：目的地、起始日、天数、locale。**没有**酒店、必去、人数。

**BFF → places-agent**

1. `discover_places`：城市 + 日期窗 + locale + 供应商 + `numDays=3`。无 `origin`，无 `must_include`。
2. 用返回的 `trip_id` 再调 `fetch_trip_details`，字段只要 `candidates`。

**places-agent 做什么**

`discover_places` 内部（对宿主不可见）并行：

- 地图搜景点 / 餐厅（本次 Google）。
- `findIconicPlaces`：此时池子还没齐，走**未落地**模式——模型按城市和天数「报名字」，3 天会倾向一日游点（如罗卡角），**不按评论数排序**。
- 把模型名字和用户必去（本步还没有）对到卡片上，打 `must_see: true`。
- 80 km 锚点过滤（本步锚点是城市，不是酒店）。
- 双写账本：内存 → PG。本步写入 `constraints` + `candidates`（瘦身）。信封另带 `inferred_must_see`（**不是** Trip 字段，只在 discover 响应里）。

**数据存在哪**

- Agent：`Trip.candidates`、`Trip.constraints`（PG + 内存）。`inferred_must_see` 不落库。
- 2play BFF：discover 路由内存里跑完 fetch，JSON 回浏览器后丢掉；**不**写 `PlanSessionCache`。
- 浏览器：`tripId`、`tripRevision`、`suggestedMustSee`（芯片名数组）。完整候选池 **不**留在前端。

**UI 如何获得**

1. 页面 `POST /api/plan/discover`。
2. BFF 调 `discover_places`（写库），立刻 `fetch_trip_details({ fields: ["candidates"] })`。
3. BFF 从 **fetch 切片**（不是 discover 信封）按池顺序抽 `must_see === true` → `iconic_places`。
4. 页面 `setSuggestedMustSee` / `setTripId`。约束条必去行读这份数组。

**本次实打实数据（直连 agent `:3010`）**

- `trip_id` 例：`cmtkt8fi0000c4ecx8fu3uusb`，`revision` 2。
- `inferred_must_see`：贝伦塔、热罗尼莫斯修道院、罗卡角。
- 景点 40、餐厅 37；`must_see` 恰好这 3 个。
- 池子**前 5 个**（供应商返回顺序，不是热度）：Street Sculpture、Our Lady of the Mount Viewpoint、罗卡角、奥古斯塔街之门、阿茹达宫。
- 几乎全部 `user_ratings_total` 为空，只有 `rating`（4.6～5）。无法按「 commment 数」排热度。

本次芯片会是：罗卡角、贝伦塔、热罗尼莫斯修道院。不是圣若热城堡、阿尔法玛、电车 28 这类「大家心里的最热」，也不是评论数最高的前五。芯片**从不**按热度重排。

---

## 第 2 步：助手 intake（b–h）

**UI 做什么**

逐题收答案。本图：酒店 Hills Hotel Lisboa，7:00，情侣，轻松，捷运+步行，必去手填「贝伦塔、罗卡角」，其他空。

**places-agent**

intake **不再**调 agent。必去芯片只是建议；用户手填则 `mustInclude` = 贝伦塔、罗卡角（不会自动并上修道院）。

**数据存在哪**

- Agent：无新写。第 1 步的 `Trip.candidates` 仍在。
- 浏览器：`intakeAnswers`、起飞栏字段、已缓存的芯片与 `tripId`。
- 2play 库：仍无本趟 session。

**UI 如何获得**

全部本地。合并函数 `mergeIntakeToBoundaries` 用起飞栏 + 答案 +（可选）芯片拼出 `PlanBoundaries`。不 fetch、不 discover。

**合并后的规划参数（给下一步）**

目的地 / 日期 / 3 天 / 2 人 / 中等预算 / 每日起点酒店 / `timeFrom` 07:00 / 类型与节奏与交通 / `mustInclude` 两个中文名。若用户一步都没改必去、芯片已到，才会把芯片整表当必去。

---

## 第 3 步：点「开始规划」

**UI → BFF**

`POST /api/plan`，Accept NDJSON。body = 上表参数 + `trip_id` / `revision`。

**BFF（`planItinerarySkeletonFill`，默认 skeleton 管线）**

1. `geocode`：`Hills Hotel Lisboa`。本次约 `38.73, -9.14`。
2. 若有 `trip_id`：`fetch_trip_details(candidates)`，复用第 1 步的 40+37，**不再**为酒店重跑 discover。
3. `make_itinerary`：瘦身后的候选（名字、坐标、`must_see`、有则带评分）、酒店 origin、节奏、必去中文、`natural_language`（情侣出游等）、账本 id。
4. 再用 `fetch_trip_details(skeleton)`。仅当库里的 stop 数 **≥** 刚才信封里的 stop 数，才用库覆盖信封（防空覆盖；也可能留下一份更「瘦」的旧骨架）。
5. `travel_tips`（带骨架）+ `fetch_trip_details(artifacts)` → NDJSON `tips`。
6. 按骨架每个 stop：`plan_next_stop` + `fetch_trip_details(filled, cursor)`。第一站 `kind=stay` 走 `origin_mode`（酒店出发）。

**places-agent：`make_itinerary`**

- 补搜 / 对齐必去、80 km 过滤（锚点换成酒店后，远郊点可能被切掉）。
- 有模型时让模型排骨架；校验「必去」时，**日主题或站名**任一命中中文子串即可（贝伦塔写在 `day_theme` 里、当天只有酒店，也会过）。
- 空 `candidates` 不再把账本池子抹成空（已修过一类「只有酒店」根因）。
- 无模型则走夹具骨架：池子空时容易只剩住宿站。

**本次第二次直连 `make_itinerary`（约 13 s，200）**

| 日 | 主题 | 站 |
| --- | --- | --- |
| 1 | 贝伦经典 | 酒店 + 热罗尼莫斯修道院 + 国家马车博物馆 + 发现者纪念碑 + 贝伦塔 |
| 2 | 辛特拉与罗卡角 | 酒店 + 佩纳宫 + 雷加莱拉宫 + 罗卡角 + 罗卡角灯塔 |
| 3 | 阿尔法玛与市中心 | 酒店 + 圣若热城堡 + 圣卢西亚观景台 + 一餐 + 观景台 + 主教座堂 |

同一次会话里**第一次** `make_itinerary` 在约 160 s 后收到 **502**。页面若撞上这次超时，规划中断或只画到「每天先落酒店」。502 时账本可能仍停在第 1 步（有池、无骨架）。

**数据存在哪**

| 动作 | Agent 落库 | BFF / 浏览器 |
| --- | --- | --- |
| `geocode` | 不写 Trip | 仅当次内存 `origin` |
| `fetch(candidates)` | 只读 | 池子进 BFF `pool`，再 slim 传给 make |
| `make_itinerary` | 写 `constraints`、`skeleton`；候选非空才写 `candidates` | 信封里的骨架只作对照；展示用随后 fetch |
| `fetch(skeleton)` | 只读 | 库 stop 数 ≥ 信封则用库覆盖，再发 NDJSON `skeleton_*` |
| `travel_tips` | 写 `artifacts.tips` | 不把信封当贴士 UI |
| `fetch(artifacts)` | 只读 | NDJSON `tips` → `setTravelTips` |
| `plan_next_stop` | 写 `filled`（覆盖为**这一站**） | 映射成 slot，累加进内存 `itinerary.days[].slots` |
| `fetch(filled, cursor)` | 只读 | 2play **主要用来拿新 `revision`**，行程板靠 NDJSON 累加，不是把 `filled` 整表当当天全部站 |

**UI 如何获得**

1. 页面 `POST /api/plan`（NDJSON）带 `trip_id`。
2. BFF 按上表写后必 fetch，再把 **fetch 后的切片**编成事件推给页面。
3. 助手：`skeleton_day.stops`（来自 fetch 后的骨架）。
4. 贴士四卡：`tips` 事件（来自 `artifacts.tips`）。
5. 行程板：`stop_filled` / `transit` 拼 `ItineraryDto`。填充中只显示已 fill 的 slot；第一站是酒店 stay。
6. `done` 时 BFF 把拼好的 `itinerary` + 表单 criteria 写入 **2play** `PlanSessionCache`（不是 agent Trip）。

页面**不**把 `make_itinerary` / `plan_next_stop` / `travel_tips` 信封当真相。

---

## 第 4 步：行程详情可用之后

`plan_next_stop` 把每一站写成可展示 slot（时间、交通、地点 id）。全部 `done` 后页面内存里已有完整 `itinerary`；BFF 已写入 2play `PlanSessionCache`。

**数据存在哪**

- Agent Trip：池、骨架、最后一站 `filled`、`artifacts.tips` 仍在（TTL 默认 24h）。`filled` 不是「整天行程表」。
- 浏览器：`itinerary` state。刷新后靠 `GET /api/plan/current` 读 2play 缓存，**不会**自动再 `fetch_trip_details`。缓存里没有 `trip_id`，刷新后芯片/账本续写会断，除非用户重新起飞。
- 点地点：`GET /api/places/{provider}/{id}` → agent `get_place_details`。结果不进 Trip，只进地点抽屉 state。
- 用户点保存：2play `SavedItinerary.snapshot`，与 Trip 无关。

**UI 如何获得**

规划中：NDJSON。刷新：`/api/plan/current`。地点抽屉：地点 API。不再 discover / make。

---

## 对照两个产品问题

### 1. 必去推荐不像「最热前五」

链路设计如此，不是芯片随机坏了。

- 芯片 = 池子里带 `must_see` 的名字，**保持供应商顺序**，上限天数+2（3 天最多 5）。
- `must_see` 来自**未落地模型名单**对齐，不是 `user_ratings_total`。本次评论数字段全空，即使要排热度也排不成。
- 池子头顶是 Street Sculpture 这类检索头，不是城堡 / 贝伦塔。贝伦塔在池子更后面，只因被模型点名才进芯片。
- 3 天未落地提示会带罗卡角这类远郊「必去」，用户若拿「市区最热」来衡量，会对不上。

### 2. 每天只有酒店一个 stop

本次在 agent 上把完整参数再跑一遍，**骨架可以是每天多站**。界面上「只有酒店」更常见于：

1. **`make_itinerary` 502 / 超时**（本次第一次就是）。页面停在 discovering/skeleton，或填充只完成每天第一站 stay。
2. **校验把必去算在 `day_theme` 上**，模型可以交「主题写了贝伦塔、stops 只有酒店」的合法 JSON。
3. **池子曾被写空**（旧 bug）：夹具 / 模型只剩 origin stay。现已禁止空 candidates 抹池，但旧会话或失败重试仍可能空。
4. **中文必去对不上英文站名**时，模型不敢排点，又用主题「糊弄」校验。
5. 用户看的是**填充中的行程板**（只显示已 fill 的 slot），不是助手里的骨架预览。

---

## 工具对照（宿主可见）

| 阶段 | 2play 调的 agent 方法 | 读切片 / UI 入口 |
| --- | --- | --- |
| 起飞后并行 | `discover_places` 写池；`fetch_trip_details(candidates)` | BFF → `POST /api/plan/discover` → 芯片 + `trip_id` |
| intake | 无 | 仅 React |
| 开始规划 | `geocode`（不落库）→ `fetch(candidates)` → `make_itinerary` 写骨架 → `fetch(skeleton)` → `travel_tips` 写 artifacts → `fetch(artifacts)` → `plan_next_stop` 写 filled → `fetch(filled, cursor)` | NDJSON `/api/plan` |
| 刷新 | 不调 agent | `GET /api/plan/current`（2play 缓存） |
| 地点抽屉 | `get_place_details` | `/api/places/...` |

不调：`findIconicPlaces`、intake 期 `travel_tips`、`patch_skeleton`（仅内部）。贴士信封不作芯片源。

---

## 怎么自己再跑一遍

1. 起飞栏填上表，等芯片出现（应接近罗卡角 / 贝伦塔 / 修道院，而不是池子前五英文名）。
2. intake 填酒店与两个中文必去，开始规划。
3. 看助手骨架是否已是多站；若行程板整天只有酒店，先看是否长时间后 502，再看当天是不是还停在第一站 fill。
4. 对照 agent：同一 `trip_id` `fetch_trip_details`，字段 `candidates` / `skeleton` / `artifacts` / `filled`。芯片应对 `candidates.places[].must_see`；行程板应对骨架 stops，不是单条 `filled`。
