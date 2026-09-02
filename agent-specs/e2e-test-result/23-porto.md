# E2E-23 波尔图（Porto）2天行程

> 本文件由 `scripts/e2e-places-agent.py` 自动生成，模拟用户调用 places-agent 工具链路得到的真实结果。

## 模拟用户输入（8 行表单）

| 字段 | 值 |
| --- | --- |
| 城市 | 波尔图（Porto） |
| 出发日期 | 2026-10-10 |
| 天数 | 2 |
| 酒店 | （未提供） |
| 节奏 | relaxed |
| 预算 | 1（节约） |
| 兴趣 | 酒庄、河边 |
| 必去 | （用户未选择，走目的地无关路径） |

## places-agent 工具链路

1. `geocode`（有酒店时）→ 2. `discover_places` → 3. `make_itinerary` → 4. `display_current_stop` / `plan_next_stop` 交替直到 `trip_complete`

## 工具调用记录

| # | 工具 | 结果 | 耗时(s) |
| --- | --- | --- | --- |
| 1 | geocode | ✓ skipped(no hotel) |  |
| 2 | discover_places | ✓ places=32, restaurants=32 | 5.11 |
| 3 | make_itinerary | ✓ next=display_current_stop | 11.48 |
| 4 | display_current_stop | ✓ next=plan_next_stop | 0.02 |
| 5 | plan_next_stop | ✓ next=display_current_stop | 1.16 |
| 6 | display_current_stop | ✓ next=plan_next_stop | 0.02 |
| 7 | plan_next_stop | ✓ next=display_current_stop | 0.79 |
| 8 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 9 | plan_next_stop | ✓ next=display_current_stop | 0.77 |
| 10 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 11 | plan_next_stop | ✓ next=display_current_stop | 0.72 |
| 12 | display_current_stop | ✓ next=display_current_stop | 0.01 |
| 13 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 14 | plan_next_stop | ✓ next=display_current_stop | 0.89 |
| 15 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 16 | plan_next_stop | ✓ next=display_current_stop | 0.7 |
| 17 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 18 | plan_next_stop | ✓ next=display_current_stop | 0.75 |
| 19 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 20 | plan_next_stop | ✓ next=display_current_stop | 0.75 |
| 21 | display_current_stop | ✓ next=trip_complete | 0.01 |

## 结果：成功（trip_complete）

## 骨架

- **Day 1** 里贝拉河边与老城：Ribeira do Porto → 路易一世大桥 → Taberna dos Fernandes → 波尔图主教座堂 → Muralha Primitiva do Porto
- **Day 2** 花园酒庄与博物馆一带：Palácio das Sereias → 波尔图植物园 → InDiferente → 塞拉维斯 → Porto Bridge Climb

## 逐站填充结果

### Ribeira do Porto  · attraction
- 时段：09:00 – 10:30

### 路易一世大桥  · attraction
- 时段：10:35 – 12:05
- 到达：walk 约 5 分钟

### Taberna dos Fernandes  · meal
- 时段：12:13 – 13:13
- 到达：walk 约 8 分钟
- 备注：station_timing_adjusted

### 波尔图主教座堂  · attraction
- 时段：13:25 – 14:55
- 到达：walk 约 12 分钟
- 备注：station_timing_adjusted

### Muralha Primitiva do Porto  · attraction
- 时段：14:56 – 16:26
- 到达：walk 约 1 分钟

### Palácio das Sereias  · attraction
- 时段：09:00 – 10:30

### 波尔图植物园  · attraction
- 时段：11:09 – 12:39
- 到达：walk 约 39 分钟
- 备注：station_timing_adjusted

### InDiferente  · meal
- 时段：13:24 – 14:24
- 到达：walk 约 45 分钟
- 备注：station_timing_adjusted

### 塞拉维斯  · attraction
- 时段：14:53 – 16:23
- 到达：walk 约 29 分钟
- 备注：station_timing_adjusted

### Porto Bridge Climb  · attraction
- 时段：17:00 – 18:30
- 到达：walk 约 37 分钟
- 备注：station_timing_adjusted
