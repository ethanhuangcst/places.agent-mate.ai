# E2E-17 开普敦（Cape Town）5天行程

> 本文件由 `scripts/e2e-places-agent.py` 自动生成，模拟用户调用 places-agent 工具链路得到的真实结果。

## 模拟用户输入（8 行表单）

| 字段 | 值 |
| --- | --- |
| 城市 | 开普敦（Cape Town） |
| 出发日期 | 2026-10-10 |
| 天数 | 5 |
| 酒店 | The Silo Hotel |
| 节奏 | relaxed |
| 预算 | 3（宽松） |
| 兴趣 | 自然、海边、酒庄 |
| 必去 | （用户未选择，走目的地无关路径） |

## places-agent 工具链路

1. `geocode`（有酒店时）→ 2. `discover_places` → 3. `make_itinerary` → 4. `display_current_stop` / `plan_next_stop` 交替直到 `trip_complete`

## 工具调用记录

| # | 工具 | 结果 | 耗时(s) |
| --- | --- | --- | --- |
| 1 | geocode | ✓  | 0.18 |
| 2 | discover_places | ✓ places=31, restaurants=27 | 2.86 |
| 3 | make_itinerary | ✓ next=display_current_stop | 34.68 |
| 4 | display_current_stop | ✓ next=plan_next_stop | 0.02 |
| 5 | plan_next_stop | ✓ next=display_current_stop | 1.31 |
| 6 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 7 | plan_next_stop | ✓ next=display_current_stop | 0.75 |
| 8 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 9 | plan_next_stop | ✓ next=display_current_stop | 0.81 |
| 10 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 11 | plan_next_stop | ✓ next=display_current_stop | 0.7 |
| 12 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 13 | plan_next_stop | ✓ next=display_current_stop | 0.73 |
| 14 | display_current_stop | ✓ next=display_current_stop | 0.01 |
| 15 | display_current_stop | ✓ next=plan_next_stop | 0.0 |
| 16 | plan_next_stop | ✓ next=display_current_stop | 0.82 |
| 17 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 18 | plan_next_stop | ✓ next=display_current_stop | 0.76 |
| 19 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 20 | plan_next_stop | ✓ next=display_current_stop | 0.76 |
| 21 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 22 | plan_next_stop | ✓ next=display_current_stop | 0.68 |
| 23 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 24 | plan_next_stop | ✓ next=display_current_stop | 0.68 |
| 25 | display_current_stop | ✓ next=display_current_stop | 0.01 |
| 26 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 27 | plan_next_stop | ✓ next=display_current_stop | 0.76 |
| 28 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 29 | plan_next_stop | ✓ next=display_current_stop | 0.73 |
| 30 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 31 | plan_next_stop | ✓ next=display_current_stop | 0.67 |
| 32 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 33 | plan_next_stop | ✓ next=display_current_stop | 0.8 |
| 34 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 35 | plan_next_stop | ✓ next=display_current_stop | 0.74 |
| 36 | display_current_stop | ✓ next=display_current_stop | 0.01 |
| 37 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 38 | plan_next_stop | ✓ next=display_current_stop | 0.8 |
| 39 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 40 | plan_next_stop | ✓ next=display_current_stop | 0.87 |
| 41 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 42 | plan_next_stop | ✓ next=display_current_stop | 0.81 |
| 43 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 44 | plan_next_stop | ✓ next=display_current_stop | 0.8 |
| 45 | display_current_stop | ✓ next=display_current_stop | 0.02 |
| 46 | display_current_stop | ✓ next=plan_next_stop | 0.03 |
| 47 | plan_next_stop | ✓ next=display_current_stop | 0.66 |
| 48 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 49 | plan_next_stop | ✓ next=display_current_stop | 0.71 |
| 50 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 51 | plan_next_stop | ✓ next=display_current_stop | 0.75 |
| 52 | display_current_stop | ✓ next=plan_next_stop | 0.02 |
| 53 | plan_next_stop | ✓ next=display_current_stop | 0.66 |
| 54 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 55 | plan_next_stop | ✓ next=display_current_stop | 0.69 |
| 56 | display_current_stop | ✓ next=trip_complete | 0.01 |

## 结果：成功（trip_complete）

## 骨架

- **Day 1** V&A Waterfront海滨：The Silo Hotel → Zeitz Museum of Contemporary Art Africa → Two Oceans Aquarium → City Sightseeing Harbour cruise → PIER Restaurant → Battery Park @ V&A Waterfront
- **Day 2** Bo-Kaap与城市遗产：The Silo Hotel → Iziko Bo-Kaap Museum → 好望堡 → Iziko Old Town House Museum → Belly of the beast → District Six Museum
- **Day 3** 博物馆与艺术花园：The Silo Hotel → Iziko South African Museum → Iziko Planetarium & Digital Dome → South African National Gallery → Black Sheep Restaurant → Woodstock street art
- **Day 4** 开普半岛自然海岸：The Silo Hotel → Chapman's Peak Drive → Cape Point Nature Reserve → Whole Earth Cafe → Cape of Good Hope
- **Day 5** 历史街区与城市宅邸：The Silo Hotel → The Cape Heritage Museum → The Cape Muslim and Slave Heritage Museum → Persian Peacock → Rust En Vreugd → Bertram House

## 逐站填充结果

### The Silo Hotel  · stay
- 时段：09:00 – 09:00
- 备注：origin_stop

### Zeitz Museum of Contemporary Art Africa  · attraction
- 时段：09:01 – 10:31
- 到达：walk 约 1 分钟
- 起点直达：walk 约 1 分钟

### Two Oceans Aquarium  · attraction
- 时段：10:42 – 12:12
- 到达：walk 约 11 分钟
- 备注：station_timing_adjusted

### City Sightseeing Harbour cruise  · attraction
- 时段：12:13 – 13:43
- 到达：walk 约 1 分钟

### PIER Restaurant  · meal
- 时段：13:50 – 14:50
- 到达：walk 约 7 分钟
- 备注：station_timing_adjusted

### Battery Park @ V&A Waterfront  · attraction
- 时段：15:04 – 16:34
- 到达：walk 约 14 分钟
- 备注：station_timing_adjusted

### The Silo Hotel  · stay
- 时段：09:00 – 09:00
- 备注：origin_stop

### Iziko Bo-Kaap Museum  · attraction
- 时段：09:33 – 11:03
- 到达：walk 约 33 分钟
- 起点直达：walk 约 33 分钟
- 备注：station_timing_adjusted

### 好望堡  · attraction
- 时段：11:25 – 12:55
- 到达：walk 约 22 分钟
- 备注：station_timing_adjusted

### Iziko Old Town House Museum  · attraction
- 时段：13:10 – 14:40
- 到达：walk 约 15 分钟
- 备注：station_timing_adjusted

### Belly of the beast  · meal
- 时段：18:00 – 19:00
- 到达：walk 约 15 分钟
- 备注：station_timing_adjusted, meal_promoted_to_dinner

### District Six Museum  · attraction
- 时段：19:04 – 20:34
- 到达：walk 约 4 分钟

### The Silo Hotel  · stay
- 时段：09:00 – 09:00
- 备注：origin_stop

### Iziko South African Museum  · attraction
- 时段：09:41 – 11:11
- 到达：walk 约 41 分钟
- 起点直达：walk 约 41 分钟
- 备注：station_timing_adjusted

### Iziko Planetarium & Digital Dome  · attraction
- 时段：11:12 – 12:42
- 到达：walk 约 1 分钟

### South African National Gallery  · attraction
- 时段：12:46 – 14:16
- 到达：walk 约 4 分钟

### Black Sheep Restaurant  · meal
- 时段：18:00 – 19:00
- 到达：walk 约 21 分钟
- 备注：station_timing_adjusted, meal_promoted_to_dinner

### Woodstock street art  · attraction
- 时段：19:34 – 21:04
- 到达：transit 约 34 分钟
- 备注：station_timing_adjusted

### The Silo Hotel  · stay
- 时段：09:00 – 09:00
- 备注：origin_stop

### Chapman's Peak Drive  · attraction
- 时段：11:14 – 12:44
- 到达：transit 约 134 分钟
- 起点直达：transit 约 134 分钟
- 备注：station_timing_adjusted

### Cape Point Nature Reserve  · attraction
- 时段：15:44 – 17:14
- 到达：transit 约 180 分钟
- 备注：station_timing_adjusted

### Whole Earth Cafe  · meal
- 时段：18:00 – 19:00
- 到达：transit 约 140 分钟
- 备注：station_timing_adjusted, meal_promoted_to_dinner

### Cape of Good Hope  · attraction
- 时段：21:21 – 22:51
- 到达：transit 约 141 分钟
- 备注：station_timing_adjusted

### The Silo Hotel  · stay
- 时段：09:00 – 09:00
- 备注：origin_stop

### The Cape Heritage Museum  · attraction
- 时段：09:40 – 11:10
- 到达：transit 约 40 分钟
- 起点直达：transit 约 40 分钟
- 备注：station_timing_adjusted

### The Cape Muslim and Slave Heritage Museum  · attraction
- 时段：11:41 – 13:11
- 到达：walk 约 31 分钟
- 备注：station_timing_adjusted

### Persian Peacock  · meal
- 时段：13:38 – 14:38
- 到达：walk 约 27 分钟
- 备注：station_timing_adjusted

### Rust En Vreugd  · attraction
- 时段：14:46 – 16:16
- 到达：walk 约 8 分钟
- 备注：station_timing_adjusted

### Bertram House  · attraction
- 时段：16:29 – 17:59
- 到达：walk 约 13 分钟
- 备注：station_timing_adjusted
