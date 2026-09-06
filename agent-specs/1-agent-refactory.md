# places-agent 行程规划真智能体方案-draft：

> **规范真源已迁至** [`real-agent-refactory.md`](./real-agent-refactory.md)（含 where2play 零产品 LLM、[ADR-050](../../workspace-specs/adr/ADR-050-where2play-no-product-llm.md)）。本文件仅保留历史 draft / ai-proposed，勿当产品目标。

## 新增 intake_trip_requirement 方法协助完成从用户获得行程边界
- 输入起点时用现有逻辑验起点坐标 （无LLM）
- 建 stops pool: 通过LLM找目的地景点，并打标必去点，坐标验真后存到内存+行程数据库(代替现在的 discover_places)
- stops pool 沿用只放景点不放餐厅的设计

## 改写 make_itinerary
- 根据 intake_trip_requirement 拼装 prompt 调用 LLM 建行程骨架（有LLM）
- 根据起点、开始时间、类型、节奏、预算、交通偏好合理安排：
1. 根据起点、开始时间和节奏合理规划当日行程密度
2. 根据类型规划stops的选择偏好
3. 根据交通偏好和当日日期预估stop之间的交通时间
- LLM找到的行程每一stop, 首先与已建 pool 内 stop 对比，匹配则用 pool 内 stop （带已验真坐标）；找不到则验真后入池（无LLM）
- 待决：排餐和餐厅推荐是否放在这一步？
- 创建全程行程骨架，存内存+入库

## 新增 plan_trip_details (trip_id, day_index)，根据行程骨架，按天规划行程细节
- 循环：每天调用一次，添加每一站预计到达时间、停留时间、出发至下一站时间、交通推荐、待决：排餐
- 生成当日行程待优化版本。具体方案待决：
A. 无LLM，内部再循环：按每一个stop添加上述细节，直至一天完成
B. 有LLM，但是不再内部循环：按天只调一次LLM给每一站添加上述细节
C. 其他
- 调用一次LLM对当日行程合理性做优化

# chat功能
- 行程助手允许用户用自然语言与 places-agent 互动

# places-agent 行程规划真智能体方案-ai-proposed：
循环在 places-agent 进程内：模型看行程目标 + 已有 Trip + 可用工具，决定 act 或停。宿主 / BFF **不**再按 discover → make → plan_next_stop（或 draft 的 intake → make → plan_trip_details×N）调度。draft 里的三阶段是环的内部意图，不是对外 API。

## 对外方法（两个）
- `plan_trip`：MCP/HTTP 编排入口（替代稿内曾用名 `compose_trip`）。收行程边界（或 `trip_id` + 自然语言补丁）。**目的地一旦有**（城市 geocode 成功）即懒创建 `trip_id`，先出必去点推荐（见下节），再对其余缺口返回 `need_input`。此时**不**建完整规划池、不跑骨架。其余字段齐了再进入工具环排程。回 `trip_id` / `revision` / `status`（`needs_input` | `planning` | `ready` | `failed`）。HTTP 写响应不当行程真源；芯片与必去名单经 `fetch_trip_details`。描述须含触发语（安排行程、N日游、plan a trip）；别名转同一 handler：`plan_itinerary`、`trip_plan`、`trips`。与 draft 的 `plan_trip_details` 不是同一方法。
- `fetch_trip_details`（已有）：`trip_id` + `fields[]` + 可选 `day_index`。Web 逐行/按日显示只读这里的 `skeleton` / `filled` / `candidates`，不依赖环的中间 JSON。

## 内部工具（3–5，不升 MCP 主路径）
模型自己选下一跳，代码不写死顺序：
1. `geocode`：验起点/城市坐标（无LLM）。起点必须落在目的地内，否则丢坐标或 `need_input`（沿用现有逻辑 + 目的地约束）。
2. `search_places`：按名或类目搜供应商，命中则入 stops pool。池只放景点、不放餐厅。
3. `directions`：站间 ETA / 交通推荐。权威时长只来自供应商腿；失败 heuristic 并标明，禁止把模型口算写进 filled。
4. `commit_trip`：声明式补丁（constraints / candidates / skeleton / filled / artifacts），升 `revision`。仅内部。
5. （可选）`ask_user`：环中仍缺约束时停，等价 `need_input`，不猜。

## 必去地推荐（intake 就要列出）
**何时：** 目的地（城市）确定之后立刻出，与问日期/酒店/节奏**并行**。不要等 8 行收齐，不要等酒店验真，不要等骨架。这是 intake 产物，不是完整 stops pool。

**如何产生（固定，不靠宿主另调 discover）：**
1. `geocode` 目的地（无LLM）→ 城市锚点。
2. LLM 按目的地提名必去（有LLM，知识在权重，不写城表）。上限建议 3–5，供勾选。
3. 对提名并行 `search_places` + eligible（无LLM）。命中写入 `candidates` 并打 `must_see`（及用户尚未选的推荐态）。
4. `commit_trip` 后 UI `fetch` `candidates`（或 `artifacts.iconic`）列出。Chat / Web 芯片同一份。

**两层名单，勿混：**
- **可勾选 / 可进骨架：** 仅 search 命中且 eligible 的点。用户勾选写入 `constraints.must_include`（可另标 `user_requested`）。
- **仅展示：** search 未命中的 LLM 名可以短暂显示，不得当已选必去，也不得进可排程 stop。禁止只 geocode 中文名当验真。

**合适 / 不合适：**
- 合适：城市已锚；名单短；与后续问句同时在屏上。
- 不合适：城市未定就猜；用完整类目 discover 挡 intake（慢，且把推荐绑到规划池）；等 `make_itinerary` / 贴士四卡再出芯片（太晚）；intake 期 ungrounded 名直接当 must_include。

完整规划池（更多景点、多样性）仍在字段齐后由环内 `search_places` 补；intake 必去命中的卡保留并继续带 `must_see`。用户未勾选的推荐，骨架可当软偏好，不强制覆盖。

## 出行贴士四卡（并入行程，不新增对外方法）
四卡写入 `artifacts.tips`（签证事实另写入 `artifacts.visa`），UI 只 `fetch_trip_details` `artifacts`。**01 必须列出必去点**（与 intake 芯片同一份验真名单，不是第二套 LLM 名单）。

| 卡 | 内容 | 事实从哪来 | 能否 LLM 编 |
| --- | --- | --- | --- |
| 01 | 目的地简介 ≤80 字 + **必去点列表** + 签证需求 | 必去：intake 已 `search`+eligible 的 `must_see`（用户已选优先，否则推荐态）。签证：内部 `visa_requirement`（Orizn REST）。简介：LLM | 简介能；必去店名/签证事实不能 |
| 02 | 行程期间天气 + 交通推荐 | 天气：Open-Meteo（有日期）。交通偏好：constraints | 天气数字不能编；交通建议能（须引用预报与偏好） |
| 03 | 衣着穿搭 | 喂入已聚合天气 | 能 |
| 04 | 安全提示 | 目的地 + 可选 Orizn safety | 能，但不得与签证事实矛盾 |

**放在哪个方法：** `plan_trip` 的内部阶段（可复用现有 `travel_tips` 函数，**不**再要求宿主另调 `travel_tips` / Orizn MCP）。MCP 仅要贴士、不排程时：同一 `plan_trip`（有目的地+日期即可停在 `ready` 且无骨架），或保留 `travel_tips` 为别名指向同一内部函数。

**何时出：** 目的地已锚 **且** 行程起止日已有（02/03 依赖预报）。此时 intake 必去芯片应已有（城市即可，早于四卡）。国籍有则打签证；缺国籍则 01 签证格诚实空缺/`need_input` 国籍，简介+必去+其余卡照出。与问酒店/节奏可并行；**不要**等骨架或 filled。芯片未就绪则四卡等芯片写入后再出 01（01 不得用未验真 LLM 名凑必去列表）。

**一次 LLM：** 先并行拉事实（无LLM）：已有 `must_see` 卡、`visa_requirement`、天气。再 **一次** tips-prose：产出 01 简介 + 02 交通表述 + 03 + 04。01 必去列表与签证段由字段/模板填入（店名来自验真卡；签证来自 Orizn 的 requirement、天数、`last_verified`）。禁止模型改写必去店名或签证结论。不与「提名必去」那次 LLM 合并（时机不同：城市 vs 城市+日期）。

**降级：** 签证 403/429 → 01 简介+必去仍出，签证格 structured skip。天气失败 → 02 用气候平均并标明非预报；03 仍出。无任何验真必去 → 01 必去格空，不编名单；不挡排程。tips-prose 超时 → visa/天气/`must_see` 保留，简介文案可空。

**明确不做：** 宿主再挂 Orizn MCP 拼 01；用 LLM 编签证类型/免签天数或另造一套必去店名；四卡 HTTP 体当 UI 真源；等 make 之后才写四卡。

打标必去（排程环）：以 intake 已验真芯片 + 用户勾选为准；环内模型可再提名，但**能进可排程骨架的点**仍必须 `search_places` + eligible。搜不到则丢或仅展示。

## 环内怎么排出行程（模型决定是否做、做几次）
- 建/补 stops pool：模型决定搜哪些名或类目；每条入池走 `search_places`（无LLM）。可先 LLM 提名必去与兴趣点，但不能替代搜索。
- 建全程骨架：模型按起点、开始时间、类型、节奏、预算、交通偏好选点与分日：
1. 根据起点、开始时间和节奏规划当日密度
2. 根据类型规划 stops 选择偏好
3. 远郊/同区用粗粒度分区，**不**在此步锁定站间分钟数
- 每一骨架 stop 先对池：匹配则用池内已验真坐标；找不到则 `search_places` 后再入池（无LLM）。对不上则该 stop 不得 commit。
- 排餐：骨架只留 lunch / dinner（及已有 afternoon_tea）档，不写店名。店在填细节时按邻站 `search_places`（午餐 near 景点，晚餐可 near 酒店）。不在骨架步推荐餐厅。
- 填细节（到点、停留、出发、交通、餐店）：模型可按天或按站调用 `directions` + 搜餐，再 `commit_trip`。允许一天内并行搜餐/取腿，叠钟必须按站序。破窗先缩短停留，不丢必去景点。
- 合理性：用硬规则检查（必去未覆盖、超长腿、破窗、餐槽空店）。不通过则模型再 act（补搜或改序），再过同一闸。不另开「每天一次优化 LLM」除非检查项可机器判定且结果再验真。
- 停：骨架+至少按日 filled 可展示，或 `failed` / `need_input`。禁止未验真散文当行程。

## chat功能（与 plan_trip 同一环）
- 自然语言进 `plan_trip`（或薄封装 `chat_trip`，同一 loop、同一工具、同一硬闸）。
- 改已有行程：模型决定小补丁还是补搜/重排，经 `commit_trip`；Web 再 `fetch_trip_details`。
- 不新增第二套助手脑；where2play / ChatBox / Cursor 都是这个入口的宿主。整单重做也走本环，不走宿主逐步调旧工具。

## 明确不做
- 不把 `intake_trip_requirement` / `make_itinerary` / `plan_trip_details` / 宿主必调 `travel_tips` 做成编排序列（内部函数名可沿用）。
- 不恢复按城 POI 源码表。
- 不把地图 key 下发 Web；详情与坐标只经 Trip + agent 工具。
- 不对外暴露 `commit_trip` / `patchTrip`。
- MCP 与 HTTP 同一核心：默认瘦响应（`trip_id`+状态）；细节一律 fetch。不给第三方「拼装全程大 JSON」特权通道。
