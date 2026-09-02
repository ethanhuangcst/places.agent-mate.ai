# E2E-04 罗马（Rome）3天行程

> 本文件由 `scripts/e2e-places-agent.py` 自动生成，模拟用户调用 places-agent 工具链路得到的真实结果。

## 模拟用户输入（8 行表单）

| 字段 | 值 |
| --- | --- |
| 城市 | 罗马（Rome） |
| 出发日期 | 2026-10-10 |
| 天数 | 3 |
| 酒店 | Hotel Vilon |
| 节奏 | relaxed |
| 预算 | 3（宽松） |
| 兴趣 | 古罗马遗迹、教堂 |
| 必去 | 梵蒂冈 |

## places-agent 工具链路

1. `geocode`（有酒店时）→ 2. `discover_places` → 3. `make_itinerary` → 4. `display_current_stop` / `plan_next_stop` 交替直到 `trip_complete`

## 工具调用记录

| # | 工具 | 结果 | 耗时(s) |
| --- | --- | --- | --- |
| 1 | geocode | ✓  | 0.29 |
| 2 | discover_places | ✓ places=29, restaurants=32 | 1.57 |
| 3 | make_itinerary | ✓ next=display_current_stop | 22.65 |
| 4 | display_current_stop | ✓ next=plan_next_stop | 0.02 |
| 5 | plan_next_stop | ✓ next=display_current_stop | 1.03 |
| 6 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 7 | plan_next_stop | ✓ next=display_current_stop | 0.59 |
| 8 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 9 | plan_next_stop | ✓ next=display_current_stop | 0.74 |
| 10 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 11 | plan_next_stop | ✓ next=display_current_stop | 0.88 |
| 12 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 13 | plan_next_stop | ✓ next=display_current_stop | 0.69 |
| 14 | display_current_stop | ✓ next=display_current_stop | 0.01 |
| 15 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 16 | plan_next_stop | ✓ next=display_current_stop | 0.65 |
| 17 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 18 | plan_next_stop | ✓ next=display_current_stop | 0.68 |
| 19 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 20 | plan_next_stop | ✓ next=display_current_stop | 0.94 |
| 21 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 22 | plan_next_stop | ✓ next=display_current_stop | 0.62 |
| 23 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 24 | plan_next_stop | ✓ next=display_current_stop | 0.55 |
| 25 | display_current_stop | ✓ next=display_current_stop | 0.01 |
| 26 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 27 | plan_next_stop | ✓ next=display_current_stop | 0.46 |
| 28 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 29 | plan_next_stop | ✓ next=display_current_stop | 0.88 |
| 30 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 31 | plan_next_stop | ✓ next=display_current_stop | 0.63 |
| 32 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 33 | plan_next_stop | ✓ next=display_current_stop | 0.67 |
| 34 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 35 | plan_next_stop | ✓ next=display_current_stop | 0.84 |
| 36 | display_current_stop | ✓ next=trip_complete | 0.01 |

## 结果：成功（trip_complete）

## 骨架

- **Day 1** 梵蒂冈艺术与圣堂：Hotel Vilon → 圣彼得大教堂 → 西斯汀小堂 → Rione XIV Bistrot → 宗座宫 → 圣天使城堡
- **Day 2** 古罗马遗迹：Hotel Vilon → Parco archeologico del Colosseo → 古罗马广场 → Fuorinorma → 罗马斗兽场 → 君士坦丁凯旋门
- **Day 3** 历史中心教堂与博物馆：Hotel Vilon → 万神庙 → 阿尔腾普斯宫 → Ristorante Ad Hoc → Vicus Caprarius - The Water City → 维托里亚诺

## 逐站填充结果

### Hotel Vilon  · stay
- 时段：09:00 – 09:00
- 备注：origin_stop

### 圣彼得大教堂  · attraction
- 时段：09:30 – 11:00
- 到达：walk 约 30 分钟
- 起点直达：walk 约 30 分钟
- 备注：station_timing_adjusted

### 西斯汀小堂  · attraction
- 时段：11:06 – 12:36
- 到达：walk 约 6 分钟
- 备注：station_timing_adjusted

### Rione XIV Bistrot  · meal
- 时段：12:53 – 13:53
- 到达：walk 约 17 分钟
- 备注：station_timing_adjusted

### 宗座宫  · attraction
- 时段：14:01 – 15:31
- 到达：walk 约 8 分钟
- 备注：station_timing_adjusted

### 圣天使城堡  · attraction
- 时段：15:50 – 17:20
- 到达：walk 约 19 分钟
- 备注：station_timing_adjusted

### Hotel Vilon  · stay
- 时段：09:00 – 09:00
- 备注：origin_stop

### Parco archeologico del Colosseo  · attraction
- 时段：09:30 – 11:00
- 到达：walk 约 30 分钟
- 起点直达：walk 约 30 分钟
- 备注：station_timing_adjusted

### 古罗马广场  · attraction
- 时段：11:02 – 12:32
- 到达：walk 约 2 分钟

### Fuorinorma  · meal
- 时段：12:39 – 13:39
- 到达：walk 约 7 分钟
- 备注：station_timing_adjusted

### 罗马斗兽场  · attraction
- 时段：13:50 – 15:20
- 到达：walk 约 11 分钟
- 备注：station_timing_adjusted

### 君士坦丁凯旋门  · attraction
- 时段：15:25 – 16:55
- 到达：walk 约 5 分钟

### Hotel Vilon  · stay
- 时段：09:00 – 09:00
- 备注：origin_stop

### 万神庙  · attraction
- 时段：09:12 – 10:42
- 到达：walk 约 12 分钟
- 起点直达：walk 约 12 分钟
- 备注：station_timing_adjusted

### 阿尔腾普斯宫  · attraction
- 时段：10:49 – 12:19
- 到达：walk 约 7 分钟
- 备注：station_timing_adjusted

### Ristorante Ad Hoc  · meal
- 时段：12:31 – 13:31
- 到达：walk 约 12 分钟
- 备注：station_timing_adjusted

### Vicus Caprarius - The Water City  · attraction
- 时段：13:51 – 15:21
- 到达：walk 约 20 分钟
- 备注：station_timing_adjusted

### 维托里亚诺  · attraction
- 时段：15:37 – 17:07
- 到达：walk 约 16 分钟
- 备注：station_timing_adjusted

---

## 开发计划（开放用户故事 · 人工维护）

> **勿被 `e2e-places-agent.py` 覆盖时丢失：** 本段为 2026-09-02 从 `agent-stories.md` 评审后写入的开放清单。罗马本文件上方为成功样例链路（as-built 仍含 `display_current_stop`）；下列故事是后续实现须覆盖/回归的范围。真源 AC 见 `agent-stories.md` / `2play-stories.md`；工程批次见 `0.refactor-plan.md`。

### 仍须实现（places-agent）

| Feature | 代号 | 为何保留 | 批次 |
| --- | --- | --- | --- |
| **39** | `places-agent-tsc-debt-zero` | `make quality` typecheck 门仍欠清零 | MVP-9 |
| **41** | `places-agent-optin-triage` | opt-in E2E / runbook 未收口 | MVP-9 |
| **45**（剩余） | `places-agent-tool-cleanup` | `navigate` 已删；**硬删** `arrange_day` / `enrich_arrange_transit` 仍 gate 2play plan-46 | MVP-10 |
| **63** | `places-agent-trip-store` | ADR-046：PG+内存权威行程 | MVP-16 |
| **64** | `places-agent-fetch-trip-details` | 按需只读；罗马类链路宿主改持 `trip_id` | MVP-16 |
| **65** | `places-agent-drop-display-current-stop` | 删 display；写并入 `plan_next_stop`（本文件 as-built 链将改） | MVP-16 |
| **66** | `places-agent-tool-surface-slim` | 对外工具精简评估与落地 | MVP-16 |

### 仍须实现（where2play · 交叉引用）

| Feature | 代号 | 说明 | 真源 |
| --- | --- | --- | --- |
| **37** | `plan-46` | 轻骨架消费端；**与 agent F65 同窗**：勿先接 display 再拆，直接 `trip_id` + `plan_next_stop` + `fetch_trip_details` | `2play-stories.md` §37 · refactor-plan 批次 11/16 |
| **38** | `profile-03` | 国籍字段（签证前置） | `2play-stories.md` §38 · ADR-044 |
| **39** | `plan-47` | 出行建议签证位（占位→消费 `visa_requirement`） | `2play-stories.md` §39 |

### 已关闭（本轮评审 · 不写入待办）

| Feature | 处置 |
| --- | --- |
| **40** | **Cancelled**（随 `arrange_day` 删除无适用工具）— 故事保留作废记录，不实现 |
| **48–52** | **Done**（as-built：visa / iconic / tips / 别名 / MCP stateless） |
| **62** | **Done**（as-built：确定性修复 + TC-M15） |
| **53–61** | **Done** |

### 建议实现顺序（罗马回归口径）

```text
1. F63+F64（Trip Store + fetch）— 罗马可改持 trip_id 拉骨架/某日
2. F65 + 2play plan-46（同窗）— 无 display 链到 trip_complete；本文件工具表更新
3. F45 剩余 + F66 — 硬删 arrange 等
4. F39 / F41 — 正交技术债，可插空
5. 2play F38→F39 — 签证产品面（依赖 agent F48 已 Done）
```

**罗马验收锚点（MVP-16 后）：** 同输入表；工具链无 `display_current_stop`；存在 `fetch_trip_details`；`trip_complete`；梵蒂冈必去仍在骨架中。
