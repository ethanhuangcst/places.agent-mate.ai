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
| 2 | discover_places | ✓ places=32, restaurants=32 | 3.53 |
| 3 | make_itinerary | ✓ next=display_current_stop | 9.65 |
| 4 | display_current_stop | ✓ next=plan_next_stop | 0.02 |
| 5 | plan_next_stop | ✓ next=display_current_stop | 1.17 |
| 6 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 7 | plan_next_stop | ✓ next=display_current_stop | 0.69 |
| 8 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 9 | plan_next_stop | ✓ next=display_current_stop | 0.81 |
| 10 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 11 | plan_next_stop | ✓ next=display_current_stop | 0.75 |
| 12 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 13 | plan_next_stop | ✓ next=display_current_stop | 0.89 |
| 14 | display_current_stop | ✓ next=display_current_stop | 0.01 |
| 15 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 16 | plan_next_stop | ✓ next=display_current_stop | 1.02 |
| 17 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 18 | plan_next_stop | ✓ next=display_current_stop | 0.67 |
| 19 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 20 | plan_next_stop | ✓ next=display_current_stop | 0.77 |
| 21 | display_current_stop | ✓ next=plan_next_stop | 0.02 |
| 22 | plan_next_stop | ✓ next=display_current_stop | 0.71 |
| 23 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 24 | plan_next_stop | ✓ next=display_current_stop | 0.72 |
| 25 | display_current_stop | ✓ next=trip_complete | 0.01 |

## 结果：成功（trip_complete）

## 骨架

- **Day 1** 老城与城堡区：布拉格城堡 → 圣维特主教座堂 → 黄金巷 → Havelská Koruna → 圣乔治大殿 → Lokál Dlouhááá
- **Day 2** 老城与啤酒：Prague Museum – House at the Golden Ring → Story of Prague Museum → 布拉格铁艺博物馆 → Kantýna → 火药塔 → 布拉格美食之旅

## 逐站填充结果

### 布拉格城堡  · attraction
- 时段：09:00 – 10:30

### 圣维特主教座堂  · attraction
- 时段：10:31 – 12:01
- 到达：walk 约 1 分钟

### 黄金巷  · attraction
- 时段：12:05 – 13:35
- 到达：walk 约 4 分钟

### Havelská Koruna  · meal
- 时段：14:02 – 15:02
- 到达：walk 约 27 分钟
- 备注：station_timing_adjusted

### 圣乔治大殿  · attraction
- 时段：15:31 – 17:01
- 到达：walk 约 29 分钟
- 备注：station_timing_adjusted

### Lokál Dlouhááá  · meal
- 时段：18:00 – 19:00
- 到达：walk 约 30 分钟
- 备注：station_timing_adjusted

### Prague Museum – House at the Golden Ring  · attraction
- 时段：09:00 – 10:30

### Story of Prague Museum  · attraction
- 时段：10:41 – 12:11
- 到达：walk 约 11 分钟
- 备注：station_timing_adjusted

### 布拉格铁艺博物馆  · attraction
- 时段：12:22 – 13:52
- 到达：walk 约 11 分钟
- 备注：station_timing_adjusted

### Kantýna  · meal
- 时段：14:02 – 15:02
- 到达：walk 约 10 分钟
- 备注：station_timing_adjusted

### 火药塔  · attraction
- 时段：15:10 – 16:40
- 到达：walk 约 8 分钟
- 备注：station_timing_adjusted

### 布拉格美食之旅  · meal
- 时段：18:00 – 19:00
- 到达：walk 约 7 分钟
- 备注：station_timing_adjusted
