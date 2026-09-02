# E2E-11 布拉格（Prague）2天行程

> 本文件由 `scripts/e2e-places-agent.py` 自动生成，模拟用户调用 places-agent 工具链路得到的真实结果。

## 模拟用户输入（8 行表单）

| 字段 | 值 |
| --- | --- |
| 城市 | 布拉格（Prague） |
| 出发日期 | 2026-10-10 |
| 天数 | 2 |
| 酒店 | （未提供） |
| 节奏 | relaxed |
| 预算 | 1（节约） |
| 兴趣 | 老城、啤酒 |
| 必去 | （用户未选择，走目的地无关路径） |

## places-agent 工具链路

1. `geocode`（有酒店时）→ 2. `discover_places` → 3. `make_itinerary` → 4. `display_current_stop` / `plan_next_stop` 交替直到 `trip_complete`

## 工具调用记录

| # | 工具 | 结果 | 耗时(s) |
| --- | --- | --- | --- |
| 1 | geocode | ✓ skipped(no hotel) |  |
| 2 | discover_places | ✓ places=32, restaurants=32 | 2.12 |
| 3 | make_itinerary | ✓ next=display_current_stop | 2.27 |
| 4 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 5 | plan_next_stop | ✓ next=display_current_stop | 0.88 |
| 6 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 7 | plan_next_stop | ✓ next=display_current_stop | 0.79 |
| 8 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 9 | plan_next_stop | ✓ next=display_current_stop | 0.73 |
| 10 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 11 | plan_next_stop | ✓ next=display_current_stop | 0.66 |
| 12 | display_current_stop | ✓ next=display_current_stop | 0.01 |
| 13 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 14 | plan_next_stop | ✓ next=display_current_stop | 0.89 |
| 15 | display_current_stop | ✓ next=plan_next_stop | 0.04 |
| 16 | plan_next_stop | ✓ next=display_current_stop | 0.66 |
| 17 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 18 | plan_next_stop | ✓ next=display_current_stop | 0.72 |
| 19 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 20 | plan_next_stop | ✓ next=display_current_stop | 0.74 |
| 21 | display_current_stop | ✓ next=trip_complete | 0.01 |

## 结果：成功（trip_complete）

**Trip Store:** `trip_id=cmtjtl2z2000d4e0ua0xywipr` · `revision=21`

## 骨架

- **Day 1** 老城与啤酒散步：Story of Prague Museum → 查理大桥 → Havelská Koruna → 布拉格天文钟 → 火药塔
- **Day 2** 城堡区经典：布拉格城堡 → 圣维特主教座堂 → ROESEL - beer & food → 黄金巷 → 罗瑞塔堂

## 逐站填充结果

### Story of Prague Museum  · attraction
- 时段：09:00 – 10:30

### 查理大桥  · attraction
- 时段：10:33 – 12:03
- 到达：walk 约 3 分钟

### Havelská Koruna  · meal
- 时段：12:15 – 13:15
- 到达：walk 约 12 分钟
- 备注：station_timing_adjusted

### 布拉格天文钟  · attraction
- 时段：13:18 – 14:48
- 到达：walk 约 3 分钟

### 火药塔  · attraction
- 时段：14:55 – 16:25
- 到达：walk 约 7 分钟
- 备注：station_timing_adjusted

### 布拉格城堡  · attraction
- 时段：09:00 – 10:30

### 圣维特主教座堂  · attraction
- 时段：10:31 – 12:01
- 到达：walk 约 1 分钟

### ROESEL - beer & food  · meal
- 时段：12:15 – 13:15
- 到达：walk 约 14 分钟
- 备注：station_timing_adjusted

### 黄金巷  · attraction
- 时段：13:34 – 15:04
- 到达：walk 约 19 分钟
- 备注：station_timing_adjusted

### 罗瑞塔堂  · attraction
- 时段：15:23 – 16:53
- 到达：walk 约 19 分钟
- 备注：station_timing_adjusted
