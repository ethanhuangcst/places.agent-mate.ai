# places-agent E2E 测试用例

> 模拟用户按 8 行表单输入，调用 places-agent 完整工具链路生成多日行程。共 30 个城市场景，覆盖不同天数、节奏、预算、酒店有无、兴趣有无、必去点选择与否。
>
> 自动化脚本：`scripts/e2e-places-agent.py`（Python，经 `/mcp` JSON-RPC `tools/call` 复现 host 调用顺序）。结果产物：`agent-specs/e2e-test-result/<id>-<city>.md` + `INDEX.md`。

## 1. 测试目标

1. 验证 places-agent 完整工具链路可端到端跑通：从用户输入到 `trip_complete`。
2. 验证「填充链路连续性」修复：`make_itinerary` 起的每一步都返回具体 `next_tool_call`，host 沿链执行无需自行推断下一步，直到 `trip_complete`，不中途终止。
3. 覆盖目的地无关路径：约 2/3 场景用户未选择必去点，依赖 `discover_places` 的 inferred must-see + 候选池，而非源码内城市目录（ADR-042）。
4. 暴露 `make_itinerary` 骨架生成的健壮性缺口（节奏上限、站名匹配）。

## 2. places-agent 完整工具链路

一次完整行程规划由 host 按以下顺序调用 places-agent 工具：

| 步 | 工具 | 何时调用 | 输入要点 | 输出要点 |
| --- | --- | --- | --- | --- |
| 1 | `geocode` | 用户提供酒店/住宿区域时 | `query`（酒店名）、`locale` | `{lat, lng, address}`，作为后续 `origin`；无酒店时跳过 |
| 2 | `discover_places` | 必调 | `city / bounds / numDays / pace / spend_level / providers / must_include / interests? / origin?` | 候选池 `places`+`restaurants`、`inferred_must_see`、`host_instructions` |
| 3 | `make_itinerary` | 必调 | `candidates`（精简：仅 `name/location/must_see/sources`）、`pace/budget/must_include/origin?` | 多日停靠顺序**骨架**（`name/kind/meal_slot`，无时间无交通）+ 首个 `next_tool_call`（指向 Day1 stay 的 `display_current_stop`，携带 `skeleton`+`cursor`） |
| 4 | `display_current_stop` | 沿链 | `stop`、`time_from`、`skeleton`、`cursor`、`legs_to_here?`、`previous_stop?` | 当前 stop 卡片、`from_origin`/`legs_to_here`、时段 + 下一 `next_tool_call` |
| 5 | `plan_next_stop` | 沿链 | `current_stop`、`next_stop`、`candidates`、`transit_preference`、`providers`、`skeleton`、`cursor` | `legs`+recommended + 下一 `next_tool_call`（下一 stop 的 `display_current_stop`） |

**目标态（ADR-046 / MVP-16，未实现）：** 链改为以 `trip_id` 为中心；新增 `fetch_trip_details`；删除 `display_current_stop`（写并入 `plan_next_stop`）。见 `e2e-test.md` Q11 / S11。现行 30 城脚本仍按上表 as-built 执行直至 F65。
| 6 | 重复 4↔5 | 直到末站 | — | `next_action == trip_complete` 时结束 |

> 关键断言：`make_itinerary` 起的每一步响应都含具体 `next_tool_call`（`name`+`arguments`，携带 `skeleton`+`cursor`），host 逐字执行即可，不应中途停止或改调 `travel_tips` 等他工具。

## 3. 测试环境与前置

- places-agent 运行于 `http://localhost:3010`（`PLACES_AGENT_BASE` 可覆盖）。
- 已签发 caller API key，导出 `PLACES_AGENT_CALLER_KEY`。
- 调用通道：`POST /mcp`，`Content-Type: application/json`，`Accept: application/json, text/event-stream`，`Authorization: Bearer <key>`；body 为 JSON-RPC `tools/call`。
- 固定 `start_date = 2026-10-10`、`locale = CN`、`providers = [GOOGLE_MAPS, AMAP, TRIPADVISOR]`。
- `budget` 由 `spend` 派生：`spend>=3 → premium`，否则 `budget`。

## 4. 通过 / 失败判据

- **通过**：链路到达 `next_action == trip_complete`，且 `make_itinerary` 返回 `ok:true` 并含 `skeleton` 与首个 `next_tool_call`。
- **失败**：任一工具返回 `ok:false`，或链路在 200 次调用内未到达 `trip_complete`。
- 失败原因记录原始 `outcome` / `data.detail`（含 `validateSkeleton` 校验信息）。

## 5. 30 个测试用例

每个用例模拟一个用户。`必去` 列：有值 = 用户选择了必去（区域/一日游名，非 POI 目录）；`—` = 用户未选择，走目的地无关路径。`酒店` 列：有 = 调 `geocode`；无 = 跳过 `geocode`，`origin` 缺失。

| # | 城市 | 天数 | 节奏 | 预算 | 酒店 | 兴趣 | 必去 | 期望链路 | 当前结果 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 里斯本 Lisbon | 4 | relaxed | 3 | Hills Hotel Lisboa | 历史建筑、海边风景、美食 | 贝伦区、辛特拉、卡斯凯什 | geocode→discover→make→fill→complete | ✓ |
| 2 | 巴黎 Paris | 3 | medium | 3 | Hotel du Louvre | 艺术、建筑、美食 | 凡尔赛 | geocode→discover→make→fill→complete | ✓ |
| 3 | 东京 Tokyo | 5 | medium | 1 | 无 | 无 | — | discover→make→fill→complete | ✗ make 超节奏+站名不匹配 |
| 4 | 罗马 Rome | 3 | relaxed | 3 | Hotel Vilon | 古罗马遗迹、教堂 | 梵蒂冈 | geocode→discover→make→fill→complete | ✓ |
| 5 | 曼谷 Bangkok | 2 | tight | 1 | 无 | 街头美食、寺庙 | — | discover→make→fill→complete | ✓ |
| 6 | 巴塞罗那 Barcelona | 4 | medium | 3 | Hotel 1898 | 建筑、海边 | 蒙特塞拉特 | geocode→discover→make→fill→complete | ✓ |
| 7 | 纽约 New York | 3 | tight | 3 | The New Yorker Hotel | 博物馆、音乐剧、购物 | — | geocode→discover→make→fill→complete | ✓ |
| 8 | 伊斯坦布尔 Istanbul | 3 | medium | 1 | 无 | 清真寺、市集 | — | discover→make→fill→complete | ✓ |
| 9 | 新加坡 Singapore | 2 | medium | 3 | 无 | 亲子、美食 | 圣淘沙 | discover→make→fill→complete | ✓ |
| 10 | 首尔 Seoul | 4 | medium | 2 | Hotel28 Myeongdong | 无 | — | geocode→discover→make→fill→complete | ✗ make 站名不匹配 |
| 11 | 布拉格 Prague | 2 | relaxed | 1 | 无 | 老城、啤酒 | — | discover→make→fill→complete | ✓ |
| 12 | 维也纳 Vienna | 3 | medium | 3 | Hotel Sacher | 古典音乐、宫殿 | — | geocode→discover→make→fill→complete | ✓ |
| 13 | 阿姆斯特丹 Amsterdam | 3 | tight | 2 | 无 | 博物馆、运河 | — | discover→make→fill→complete | ✓ |
| 14 | 杜布罗夫尼克 Dubrovnik | 2 | relaxed | 3 | 无 | 海边、老城 | — | discover→make→fill→complete | ✓ |
| 15 | 爱丁堡 Edinburgh | 3 | medium | 2 | The Balmoral | 城堡、文学 | — | geocode→discover→make→fill→complete | ✓ |
| 16 | 马拉喀什 Marrakech | 4 | medium | 1 | 无 | 市集、花园 | — | discover→make→fill→complete | ✓ |
| 17 | 开普敦 Cape Town | 5 | relaxed | 3 | The Silo Hotel | 自然、海边、酒庄 | — | geocode→discover→make→fill→complete | ✓ |
| 18 | 墨西哥城 Mexico City | 3 | medium | 1 | 无 | 博物馆、美食 | — | discover→make→fill→complete | ✓ |
| 19 | 布宜诺斯艾利斯 Buenos Aires | 4 | medium | 2 | 无 | 探戈、美食、建筑 | — | discover→make→fill→complete | ✓ |
| 20 | 京都 Kyoto | 3 | relaxed | 3 | Hiiragiya Ryokan | 寺庙、庭院 | 岚山 | geocode→discover→make→fill→complete | ✗ make 超节奏 |
| 21 | 河内 Hanoi | 2 | tight | 1 | 无 | 街头美食、老城 | — | discover→make→fill→complete | ✓ |
| 22 | 雅典 Athens | 3 | medium | 2 | Electra Hotel Athens | 古迹、海边 | — | geocode→discover→make→fill→complete | ✓ |
| 23 | 波尔图 Porto | 2 | relaxed | 1 | 无 | 酒庄、河边 | — | discover→make→fill→complete | ✗ make 超节奏 |
| 24 | 苏黎世 Zurich | 3 | medium | 3 | Baur au Lac | 无 | — | geocode→discover→make→fill→complete | ✓ |
| 25 | 哥本哈根 Copenhagen | 3 | medium | 2 | 无 | 设计、美食 | — | discover→make→fill→complete | ✓ |
| 26 | 雷克雅未克 Reykjavik | 4 | relaxed | 3 | Hotel Borg | 自然、温泉 | 金圈 | geocode→discover→make→fill→complete | ✓ |
| 27 | 吉隆坡 Kuala Lumpur | 2 | medium | 1 | 无 | 美食、购物 | — | discover→make→fill→complete | ✓ |
| 28 | 特拉维夫 Tel Aviv | 3 | medium | 3 | 无 | 海边、美食、夜生活 | — | discover→make→fill→complete | ✓ |
| 29 | 清迈 Chiang Mai | 4 | relaxed | 1 | 无 | 寺庙、自然、咖啡 | — | discover→make→fill→complete | ✓ |
| 30 | 上海 Shanghai | 3 | tight | 3 | The Peninsula Shanghai | 建筑、美食、购物 | — | geocode→discover→make→fill→complete | ✗ make 超节奏 |

**当前通过 25/30。** 失败用例均停在 `make_itinerary`（第 3 步），见第 6 节。

## 6. 已知失败与根因

5 个失败全部发生在 `make_itinerary`，为 LLM 骨架生成未通过 `validateSkeleton` 的两类问题（既有健壮性缺口，非填充链路修复引入）：

| # | 城市 | 原始校验信息 | 根因 |
| --- | --- | --- | --- |
| 3 | 东京 | day1/day2 各 6 景点 > 上限 5；`Tokyo National Museum Store`、`日本科学未来館` 不在候选池 | A + B |
| 10 | 首尔 | `북촌한옥마을`(day2) 不在候选池 | B |
| 20 | 京都 | day2 5 景点 > 上限 4 | A |
| 23 | 波尔图 | day1 5 景点 > 上限 4 | A |
| 30 | 上海 | day1 8 景点 > 上限 6 | A |

- **A. 超出节奏上限**：LLM 骨架未遵守 `pace → 每日最大景点数`，且无重试/修复回路。
- **B. 站名不在候选池**：LLM 用本地语言名/音译名/臆造名，与候选池名称形态不一致，校验要求精确匹配。

## 7. 结果分析

30 个用例中 25 个跑通完整链路至 `trip_complete`，5 个在 `make_itinerary` 失败（见第 6 节）。从通过的 25 个看：

- **链路连续性修复生效**：所有通过用例均完整执行 `geocode（可选）→ discover_places → make_itinerary → display_current_stop / plan_next_stop 交替 → trip_complete`，未出现中途停止、改调 `travel_tips` 或由 host 臆造行程的情况。`make_itinerary` 起的每一步都返回了具体 `next_tool_call`，host 逐字执行即可。本次修复目标达成。
- **调用规模**：单用例工具调用 21–53 次（含 1 次 discover、1 次 make、其余为 display/plan_next_stop 交替），耗时 19–59 秒。`make_itinerary` 单次 20–29 秒（LLM 骨架生成），是主要耗时点；`plan_next_stop` 0.5–1 秒（交通计算），`display_current_stop` ~0.01 秒。
- **目的地无关路径覆盖**：约 2/3 用例（19/30）`must_include` 为空，依赖 `discover_places` 的 inferred must-see + 候选池生成骨架，未走源码内城市目录（ADR-042）。这些用例多数通过，说明候选池信号对非目录目的地可用。
- **geocode 覆盖**：13/30 用例提供酒店并成功 `geocode` 解析为 origin；其余跳过 geocode，origin 缺失，骨架仍能生成。

## 8. 质量问题

以下问题来自对通过用例填充结果的逐站检查（证据见 `agent-specs/e2e-test-result/01-lisbon.md`、`02-paris.md`、`05-bangkok.md` 等）。这些问题不影响链路跑通，但影响行程可用性。

### Q1. 时段不递进 — 所有 stop 共享同一时段（用户发现）

一天内多个 stop 的时段几乎完全相同：景点恒为 `10:00 – 11:30`，餐厅恒为 `10:00 – 11:00`，不按停留时长或到达时长推进。

证据（里斯本 Day1）：

```
热罗尼莫斯修道院  10:00 – 11:30
贝伦塔            10:00 – 11:30
发现者纪念碑      10:00 – 11:30
Museum of MAC/CCB  10:00 – 11:30
```

一天 4 个景点全落在 10:00–11:30，没有 10:00、11:30、13:00… 的真实时间轴。仅每日首站为 `09:00 – 10:30`（或 stay 为 `09:00 – 09:00`）。`display_current_stop` 似乎只返回固定时段模板，未根据上一站结束时间 + 交通耗时累加。

### Q2. 午餐时段错位 — meal 落在 10:00，且系统自知在午餐窗外

餐厅 stop 时段统一为 `10:00 – 11:00`，并非午餐时间（应约 12:00–14:00）。部分 meal 还自带备注 `lunch_window_outside`，说明系统知道它落在午餐窗外，但既未调整时段也未挪到午餐窗。

证据：里斯本 Belcanto `10:00 – 11:00 lunch_window_outside`；巴黎 La Jacobine、Les Frenchies 同；曼谷 Pad Thai、Local food for Pad Thai 同。

### Q3. 每日双 meal 堆叠在同一上午时段

骨架为多日行程每天放 2 个 meal stop（如巴黎 Day1 `La Jacobine → Au Bougat`、Day2 `Les Frenchies → Le Florimond`；曼谷 Day1 `Pad Thai → Savoey`），但填充时两个 meal 都塞进 `10:00 – 11:00` 同一时段，未区分午餐/晚餐，也未分时段。meal_slot 字段在填充结果中未体现。

### Q4. 时段与到达时长矛盾

时段固定 90 分钟（10:00–11:30），但到达时长从 1 分钟到 100 分钟不等，起止时间与交通耗时脱节。

证据：里斯本 Day2 辛特拉 `transit 约 100 分钟` 但时段仍 `10:00 – 11:30`——若 10:00 出发 100 分钟到达为 11:40，已超出 11:30；且一日游交通 100 分钟却只留 90 分钟时段。`display_current_stop` 的时段未把 `legs_to_here.duration_min` 计入。

### Q5. 必去一日游日填充过稀

必去一日游（辛特拉、卡斯凯什、凡尔赛）骨架仅放 1–2 个通用名 stop，填充未展开为目的地的多个景点。

证据：里斯本 Day2「辛特拉」仅 1 个 stop（`辛特拉 · attraction 10:00–11:30 transit 100 分钟`），无佩纳宫/摩尔城堡/雷加莱拉等具体景点，无午餐、无回程；Day3 卡斯凯什仅 2 stop；巴黎 Day3 凡尔赛仅 1 stop。必去一日游的深度明显不足，骨架把一日游目的地当成单个景点处理。

### Q6. `make_itinerary` 骨架健壮性（见第 6 节）

5/30 用例因骨架超节奏上限或站名不匹配在 `make_itinerary` 失败，无自动修复重试。属质量问题，详见第 6 节根因 A/B。

### 质量问题汇总

| 编号 | 问题 | 影响用例 | 严重度 |
| --- | --- | --- | --- |
| Q1 | 时段不递进，多 stop 共享 10:00–11:30 | 全部 25 个通过用例 | 高（行程时间轴不可用） |
| Q2 | 午餐时段错位 10:00–11:00 + lunch_window_outside | 含 meal 的用例（多数） | 高 |
| Q3 | 每日双 meal 堆叠同一上午时段 | 巴黎、曼谷等多 meal 用例 | 中 |
| Q4 | 时段与到达时长矛盾（100 分钟交通 vs 90 分钟时段） | 含长交通的一日游用例 | 中 |
| Q5 | 必去一日游填充过稀（辛特拉/凡尔赛仅 1 stop） | 里斯本、巴黎等含一日游用例 | 中 |
| Q6 | make_itinerary 骨架超节奏/站名不匹配致整单失败 | 5/30（东京、首尔、京都、波尔图、上海） | 高 |
| Q7 | 脏交通时长（39624 分钟、跨午夜时段） | 01-lisbon 等含裸区域名 stop | 高 |
| Q8 | 迟到午餐 16–17 点 + lunch_window_outside | 01-lisbon 等 | 高 |
| Q9 | 非 origin stay 被当作 origin_stop（09:30 重置） | 01-lisbon 辛特拉日 | 高 |
| Q10 | MVP-14 后 make_itinerary 表面超时致整单失败 | 17/30（多数 `LLM timed out`；1 例 lunch 校验 KL） | 高 |
| Q11 | 宿主依赖大包 JSON；多工具无法统一改同一行程；工具面含 display 偏臃肿 | 架构债（ADR-046） | 中（协作） |

**MVP-13 已缓解：** Q1–Q5（30/30 链路通过；时段递进、meal 早窗、区域展开等）。**MVP-14 已缓解：** Q7–Q9（Lisbon 路径）。**MVP-15 目标：** Q10。**MVP-16 目标：** Q11（Trip Store + fetch + 删 display）。

## 9. 质量问题 - 根因分析

以下根因均定位到具体代码位置。Q1/Q4 同根，Q2/Q3 同根。

### RC1 → Q1、Q4：填充链路不传递上一站 `end_time`，时段每站重置为 10:00

`displayCurrentStop` 本身会按「上一站 `end_time` + 推荐交通耗时」累加时段（`plan-next-stop.ts:283` `baseStart = previous_stop?.end_time ? end_time : (time_from ?? "10:00")`，`earliestFeasibleStart` 在 `prevEnd` 为空时直接回退 fallback）。但链路传递时 `end_time` 被丢弃：

- `slimStop`（`create-server.ts:76`）只保留 `{ name, kind, meal_slot }`，**不含 `end_time`**。
- `nextFillStep`（`create-server.ts:117`）构造下一个 `plan_next_stop` 时 `current_stop: slimStop(current)`；`plan_next_stop` handler（`create-server.ts:997`）构造下一个 `display_current_stop` 时 `previous_stop: slimStop(args.current_stop)` —— 两处都丢了 `end_time`。
- 因此每个 `display_current_stop` 收到的 `previous_stop.end_time` 恒为 `undefined`，`baseStart` 回退 `time_from`（10:00），`end = 10:00 + 90/60`。

结果：`displayCurrentStop` 内部算出了正确 `slot.end`，但该值没有沿链前传，下一站又从 10:00 起算。这就是「所有 stop 时段都是 10:00–11:30」的直接原因，也使时段与 `legs_to_here.duration_min` 脱节（Q4：辛特拉 transit 100 分钟，时段仍 10:00–11:30）。

### RC2 → Q2、Q3：`meal_slot` 仅用于软提示，不锚定时段

`plan-next-stop.ts:297-302`：当 `stop.kind === "meal" && meal_slot === "lunch"` 且 start 不在 11:30–14:30 时，**只 push 一条 `lunch_window_outside` note，不调整 start**。没有 lunch/dinner 窗口锚定逻辑，`meal_slot`（`make-itinerary.ts:34` 骨架字段）在填充层只用于 note，未参与时段分配。

叠加 RC1：meal start 被钉在 10:00 → 10:00–11:00，落在午餐窗外，触发 `lunch_window_outside`。即使 RC1 修复（时钟累加），meal 仍可能落在窗外，因为没有任何逻辑把 meal 拉到午餐（11:30–14:30）/晚餐（18:00–20:00）窗口。每日双 meal（Q3）也因此都堆在同一个 10:00–11:00，未按 lunch/dinner 分时段。

### RC3 → Q5：区域型 `must_include`（一日游）未展开为子景点

`buildSkeletonUserMessage`（`make-itinerary.ts:236-244`）要求区域型 `must_include`（区/一带/一日游）用「名称含核心的候选」覆盖，并明确「fewer stops is OK」，鼓励稀疏日。`discover_places` 候选池对一日游目的地通常只有区域名本身（如「辛特拉」「凡尔赛宫」），不含子景点（佩纳宫/摩尔城堡/镜厅），骨架只能排 1 个 stop。

没有任何「区域型 must_include → 子景点子搜索/展开」机制。一日游日被当成单个景点处理，无回程、无午餐。这是产品架构缺口，不是 ADR-042 禁止的城市目录——修复方向是目的地无关的子搜索，而非源码内城市表。

### RC4 → Q6：骨架校验严格 + 修复仅靠重问 LLM，无确定性回退

`validateSkeleton`（`make-itinerary.ts:96`）严格：`stop.name` 必须 `names.has` **精确匹配**（`:136`）；`attractions > paceStopLimit` 即报错（`:167`）。修复回路（`make-itinerary.ts:519-576`）仅 2 次重问 LLM，第 2 次把错误拼进 prompt（`Fix and return valid JSON`），**无确定性修复**（裁剪超限 stop、名称归一化匹配）。

LLM 即使看到错误也不可靠修正：5/30 两次都失败，`make_itinerary` 抛错 → 整条行程失败。两类：
- A 超节奏（东京/京都/波尔图/上海）：LLM 无视 pace 上限。
- B 站名不匹配（东京/首尔）：LLM 用本地语言名/音译名（`日本科学未来館`、`북촌한옥마을`），与候选池名称形态不一致，精确匹配失败。

### RC5 → Q7：裸名 geocode + 无距离/时长闸

`resolvePoint`（`plan-next-stop.ts:77`）对无坐标 stop 用裸 `stop.name` geocode，易解析到远距同名点；`planNextStop` 不校验距 anchor 距离，`duration_min` 无硬顶 → 39624 分钟进入 `earliestFeasibleStart`。

### RC6 → Q8：F54 只抬早 lunch，不处理晚 lunch

`displayCurrentStop`（`plan-next-stop.ts:304-316`）仅在 feasible < 11:30 时抬到 lunch 窗；feasible > 14:30 仍标 lunch 并 push `lunch_window_outside`。骨架常把 lunch 排在末 attraction 之后。

### RC7 → Q9：所有 `kind=stay` 走 origin 短路

`displayCurrentStop`（`plan-next-stop.ts:275-289`）对所有 stay 重置时钟、push `origin_stop`、清空 legs；回程酒店（辛特拉花园酒店）被误当作日首 origin。

### RC8 → Q10：F59/F61 校验严 + stay/city 缺确定性预修复 → 二次 LLM → 超时掩盖 lastError

MVP-14 在 `validateSkeleton` 加严（stay 须 stops[0]、lunch 不得在末 attraction 后、拒城市名站），但校验前仅有 `reseatLateLunchStops` / `trimAreaAliasStops`，**缺少** stay 前移与 city 名剔除（对比 MVP-13 F55/F56 的确定性回退）。

attempt 1 更易失败 → 强制第二次 LLM；attempt 2 触 90s 上限时抛 `LLM timed out`，**丢掉 attempt 1 的 `lastError`**。失败用例停在 3 tool calls（未进填充链）。东京/曼谷在批跑早期即失败；同批首尔 ~95s 仍通过 → **非「连续批跑」主因**。

### RC9 → Q11：宿主回传大包 JSON 当共享状态；无服务端权威 Trip；display 与读职责重叠

- 根因：MCP 无业务态（ADR-045）下由宿主携带 skeleton/candidates；工具面另含纯展示型 `display_current_stop`。
- 对策：ADR-046 Trip Store（PG+内存）+ `fetch_trip_details` + 删 display（F63–66）。

## 10. 运行方式

```bash
export PLACES_AGENT_CALLER_KEY="pa_..."
python3 scripts/e2e-places-agent.py --only 1      # 单用例
python3 scripts/e2e-places-agent.py --limit 3     # 前 3 个
python3 scripts/e2e-places-agent.py               # 全部 30 个（约 17 分钟）
```

每用例产出 `agent-specs/e2e-test-result/<id>-<city>.md`（含输入表、工具调用记录表、骨架、逐站填充结果），汇总见 `agent-specs/e2e-test-result/INDEX.md`。

## 11. 整改 story 清单

每条 story 对应根因（RC），给出范围、验收标准、回归用例。按 `incremental-delivery` 一次完成一个 story。

交叉引用 Feature **53–58**（`[0.refactor-plan.md](./0.refactor-plan.md)` 批次 13）。实现顺序：S1→S2→S4→S5→S3→S6。

### S1 [RC1] 填充链路传递 `end_time`，时段逐站累加 — Feature **53**
- 范围：`create-server.ts` 的 `slimStop`/`nextFillStep`/`plan_next_stop` handler，让 `previous_stop` 携带上一站 `slot.end`；`plan-next-stop.ts` `earliestFeasibleStart` 据此累加。
- 验收：30 城通过用例的 stop 时段单调递增（首站 09:00/10:00，后续按 prev_end + leg 推进），无 10:00–11:30 重复；长交通（如辛特拉 100 分钟）使下一站 start ≥ prev_end + leg。
- 回归：全部 30 用例，重点 01-lisbon、04-rome。

### S2 [RC2] `meal_slot` 锚定午餐/晚餐窗口 — Feature **54**
- 范围：`plan-next-stop.ts` `displayCurrentStop`，对 `meal` stop 按 `meal_slot` 把 start 落到 `max(prev_end, 窗口起点)`（lunch 11:30–14:30、dinner 18:00–20:00）；`lunch_window_outside` 仅作兜底 note。
- 验收：meal stop 时段落在午餐/晚餐窗；每日双 meal 分别落在 lunch/dinner 两个窗口，不再堆叠。
- 回归：02-paris、05-bangkok、01-lisbon。

### S3 [RC3] 区域型 `must_include` 子景点展开 — Feature **57**
- 范围：`discover_places` 或 `make_itinerary` 对区域型 `must_include`（一日游）做目的地无关的子搜索，把目的地展开为多个子景点 stop + 回程（ADR-042：子搜索，非源码城市表）。
- 验收：辛特拉/凡尔赛/卡斯凯什日 ≥ 3 个子景点 + 回程，不再只有 1 个区域名 stop。
- 回归：01-lisbon（辛特拉/卡斯凯什）、02-paris（凡尔赛）、26-reykjavik（金圈）。

### S4 [RC4-A] 骨架超节奏确定性修复回退 — Feature **55**
- 范围：`make-itinerary.ts`，`validateSkeleton` 失败为「超节奏」时，对超限日裁剪多余 attraction stop 后重校验，作为 LLM 重试前的确定性回退。
- 验收：原超节奏失败用例（京都 #20、波尔图 #23、上海 #30、东京 #3 的超节奏部分）不再因超节奏整单失败。
- 回归：03、20、23、30。

### S5 [RC4-B] 站名归一化匹配 — Feature **56**
- 范围：`make-itinerary.ts` `validateSkeleton` 名称匹配改为归一化（去重音/本地名别名/大小写），候选池携带别名；精确匹配优先，归一化为回退。
- 验收：首尔 `북촌한옥마을`、东京 `日本科学未来館` 等本地名 stop 通过匹配。
- 回归：03、10。

### S6 [RC4] `make_itinerary` 失败可展示回退 — Feature **58**
- 范围：`make_itinerary` 失败时 `data.detail` 携带校验信息，host 可向用户展示可读回退，而非空白 `errors.make_itinerary_failed`。
- 验收：失败用例的响应含可读 detail；host 能向用户提示「骨架生成失败，请调整必去/天数」。
- 回归：03、10、20、23、30。

### 优先级建议

| 顺序 | story | 理由 |
| --- | --- | --- |
| 1 | S1 | 阻塞行程可用性，影响全部通过用例；纯链路传递修复，风险低 |
| 2 | S2 | 依赖 S1（时钟累加后才能稳定锚定 meal 窗口） |
| 3 | S4 + S5 | 把 5/30 失败救回，提升通过率到 30/30 |
| 4 | S3 | 一日游深度，依赖子搜索设计，工作量较大 |
| 5 | S6 | 体验兜底，可与 S4/S5 同期 |

### MVP-14 story 清单（Feature 59–61）

交叉引用 `[0.refactor-plan.md](./0.refactor-plan.md)` 批次 14。实现顺序：S7→S8→S9。

### S7 [RC7] Stay 角色区分 — Feature **59**
- 范围：`plan-next-stop.ts` `displayCurrentStop` 仅 day_origin stay 走 origin 短路；`create-server.ts` 传 `stay_role`；`validateSkeleton` 每 day 至多一个 stay 且须 stops[0]。
- 验收：辛特拉日回程 stay 接在末 attraction 之后，无 09:30 origin_stop。
- 回归：01-lisbon Day2。

### S8 [RC5] Leg 地理/时长闸 — Feature **60**
- 范围：`resolvePoint` geocode 带 city；距 anchor >80km 丢弃；duration>180 不进时钟；骨架拒区域名单站。
- 验收：Lisbon 无 39624min；裸 `Belem` 不单独成站。
- 回归：01-lisbon Day1。

### S9 [RC6] 迟到午餐重座 — Feature **61**
- 范围：feasible>14:30 的 lunch 升 dinner（≥18:00）；骨架 lunch 不在末 attraction 后。
- 验收：无 16–17 点 lunch + lunch_window_outside。
- 回归：01-lisbon。

### MVP-15 story 清单（Feature 62）

交叉引用 `[0.refactor-plan.md](./0.refactor-plan.md)` 批次 15。

### S10 [RC8] 骨架确定性修复 + 可读超时 — Feature **62**
- 范围：`make-itinerary.ts` 校验前增加 `reseatStayToDayOrigin`、`dropCityNameStops`；LLM 超时抛错拼接 prior `lastError`。不放宽 F59/F61 规则，不默认提高 90s。
- 验收：stay 非首位/多 stay、city 名 attraction 在 attempt 1 经确定性修复后可通过；超时消息含 previous validation；东京/曼谷/吉隆坡到 `trip_complete`；全量接近 30/30；Lisbon 不回归。
- 回归：03、05、27；全量 30。

### MVP-16 story 清单（Feature 63–66）

交叉引用 [ADR-046](../../workspace-specs/adr/ADR-046-trip-store-pg-memory-fetch.md)、`[0.refactor-plan.md](./0.refactor-plan.md)` 批次 16、`[agent-design.md](./agent-design.md)` §21。

### S11 [Q11] Trip Store + fetch + 删 display — Feature **63–66**
- 范围：PG+内存 Trip；懒创建 `trip_id`；`fetch_trip_details`；删 `display_current_stop`；写并入 `plan_next_stop`；工具精简评估与硬删波次。
- 验收：持 `trip_id` 可拉 skeleton/某日；无 display 链到 `trip_complete`；30 城不回归；不下发 DB 连接；不新增 `start_trip`；`patch_skeleton` 不对外。
- 回归：01-lisbon；全量 30（F65 后）。
- 依赖：建议 F62 收口后再开 P0；与 where2play plan-46 同窗迁读模型。
