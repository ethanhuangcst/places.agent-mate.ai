# E2E-14 杜布罗夫尼克（Dubrovnik）2天行程

> 本文件由 `scripts/e2e-places-agent.py` 自动生成，模拟用户调用 places-agent 工具链路得到的真实结果。

## 模拟用户输入（8 行表单）

| 字段 | 值 |
| --- | --- |
| 城市 | 杜布罗夫尼克（Dubrovnik） |
| 出发日期 | 2026-10-10 |
| 天数 | 2 |
| 酒店 | （未提供） |
| 节奏 | relaxed |
| 预算 | 3（宽松） |
| 兴趣 | 海边、老城 |
| 必去 | （用户未选择，走目的地无关路径） |

## places-agent 工具链路

1. `geocode`（有酒店时）→ 2. `discover_places` → 3. `make_itinerary` → 4. `display_current_stop` / `plan_next_stop` 交替直到 `trip_complete`

## 工具调用记录

| # | 工具 | 结果 | 耗时(s) |
| --- | --- | --- | --- |
| 1 | geocode | ✓ skipped(no hotel) |  |
| 2 | discover_places | ✓ places=32, restaurants=32 | 1.14 |
| 3 | make_itinerary | ✓ next=display_current_stop | 47.43 |
| 4 | display_current_stop | ✓ next=plan_next_stop | 0.03 |
| 5 | plan_next_stop | ✓ next=display_current_stop | 0.85 |
| 6 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 7 | plan_next_stop | ✓ next=display_current_stop | 0.56 |
| 8 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 9 | plan_next_stop | ✓ next=display_current_stop | 0.47 |
| 10 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 11 | plan_next_stop | ✓ next=display_current_stop | 0.66 |
| 12 | display_current_stop | ✓ next=display_current_stop | 0.01 |
| 13 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 14 | plan_next_stop | ✓ next=display_current_stop | 0.71 |
| 15 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 16 | plan_next_stop | ✓ next=display_current_stop | 0.72 |
| 17 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 18 | plan_next_stop | ✓ next=display_current_stop | 0.6 |
| 19 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 20 | plan_next_stop | ✓ next=display_current_stop | 0.59 |
| 21 | display_current_stop | ✓ next=trip_complete | 0.01 |

## 结果：成功（trip_complete）

## 骨架

- **Day 1** 老城经典：Pile Gate → Onofrio's Large Fountain → Dubrovnik Old Town → Restaurant 360 → Clock Tower of Dubrovnik
- **Day 2** 海边与城墙：Dubrovnik West Harbour → 罗维里耶纳克要塞 → Walls of Dubrovnik → Dubravka 1836 Restaurant & Cafe → Love Stories Museum

## 逐站填充结果

### Pile Gate  · attraction
- 时段：09:00 – 10:30

### Onofrio's Large Fountain  · attraction
- 时段：10:31 – 12:01
- 到达：walk 约 1 分钟

### Dubrovnik Old Town  · attraction
- 时段：12:04 – 13:34
- 到达：walk 约 3 分钟

### Restaurant 360  · meal
- 时段：13:35 – 14:35
- 到达：walk 约 1 分钟

### Clock Tower of Dubrovnik  · attraction
- 时段：14:37 – 16:07
- 到达：walk 约 2 分钟

### Dubrovnik West Harbour  · attraction
- 时段：09:00 – 10:30

### 罗维里耶纳克要塞  · attraction
- 时段：10:32 – 12:02
- 到达：walk 约 2 分钟

### Walls of Dubrovnik  · attraction
- 时段：12:15 – 13:45
- 到达：walk 约 13 分钟
- 备注：station_timing_adjusted

### Dubravka 1836 Restaurant & Cafe  · meal
- 时段：13:54 – 14:54
- 到达：walk 约 9 分钟
- 备注：station_timing_adjusted

### Love Stories Museum  · attraction
- 时段：14:56 – 16:26
- 到达：walk 约 2 分钟
