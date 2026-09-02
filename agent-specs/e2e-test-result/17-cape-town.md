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
| 2 | discover_places | ✓ places=29, restaurants=27 | 4.08 |
| 3 | make_itinerary | ✓ next=display_current_stop | 4.06 |
| 4 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 5 | plan_next_stop | ✓ next=display_current_stop | 1.18 |
| 6 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 7 | plan_next_stop | ✓ next=display_current_stop | 0.77 |
| 8 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 9 | plan_next_stop | ✓ next=display_current_stop | 0.69 |
| 10 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 11 | plan_next_stop | ✓ next=display_current_stop | 0.8 |
| 12 | display_current_stop | ✓ next=display_current_stop | 0.01 |
| 13 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 14 | plan_next_stop | ✓ next=display_current_stop | 0.97 |
| 15 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 16 | plan_next_stop | ✓ next=display_current_stop | 0.63 |
| 17 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 18 | plan_next_stop | ✓ next=display_current_stop | 0.93 |
| 19 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 20 | plan_next_stop | ✓ next=display_current_stop | 0.8 |
| 21 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 22 | plan_next_stop | ✓ next=display_current_stop | 0.59 |
| 23 | display_current_stop | ✓ next=display_current_stop | 0.01 |
| 24 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 25 | plan_next_stop | ✓ next=display_current_stop | 0.96 |
| 26 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 27 | plan_next_stop | ✓ next=display_current_stop | 0.86 |
| 28 | display_current_stop | ✓ next=plan_next_stop | 0.02 |
| 29 | plan_next_stop | ✓ next=display_current_stop | 0.85 |
| 30 | display_current_stop | ✓ next=display_current_stop | 0.01 |
| 31 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 32 | plan_next_stop | ✓ next=display_current_stop | 0.76 |
| 33 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 34 | plan_next_stop | ✓ next=display_current_stop | 0.67 |
| 35 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 36 | plan_next_stop | ✓ next=display_current_stop | 0.67 |
| 37 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 38 | plan_next_stop | ✓ next=display_current_stop | 0.76 |
| 39 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 40 | plan_next_stop | ✓ next=display_current_stop | 0.75 |
| 41 | display_current_stop | ✓ next=display_current_stop | 0.01 |
| 42 | display_current_stop | ✓ next=plan_next_stop | 0.0 |
| 43 | plan_next_stop | ✓ next=display_current_stop | 0.74 |
| 44 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 45 | plan_next_stop | ✓ next=display_current_stop | 0.9 |
| 46 | display_current_stop | ✓ next=plan_next_stop | 0.02 |
| 47 | plan_next_stop | ✓ next=display_current_stop | 0.93 |
| 48 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 49 | plan_next_stop | ✓ next=display_current_stop | 0.98 |
| 50 | display_current_stop | ✓ next=trip_complete | 0.01 |

## 结果：成功（trip_complete）

**Trip Store:** `trip_id=cmtjtnidt000j4e0uzsmj8yur` · `revision=50`

## 骨架

- **Day 1** V&A海滨与当代艺术：The Silo Hotel → Zeitz Museum of Contemporary Art Africa → Two Oceans Aquarium → PIER Restaurant → City Sightseeing Harbour cruise
- **Day 2** 开普半岛与海角自然风光：The Silo Hotel → Cape of Good Hope → Cape Point Nature Reserve → Whole Earth Cafe → Old Cape Point Lighthouse → New Cape Point Lighthouse
- **Day 3** 酒庄与山麓花园：The Silo Hotel → Kirstenbosch National Botanical Garden → Chefs Warehouse Beau Constantia → 南非桌山国家公园
- **Day 4** 城市历史与博物馆：The Silo Hotel → District Six Museum → 開普敦奴隸小屋 → Belly of the beast → South African National Gallery → Iziko Bo-Kaap Museum
- **Day 5** 北郊文化与酒庄午餐：The Silo Hotel → Long March to Freedom → Cape Town Museum of Childhood → De Grendel Wine Estate and Restaurant → Heart of Cape Town Museum

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

### PIER Restaurant  · meal
- 时段：12:18 – 13:18
- 到达：walk 约 6 分钟
- 备注：station_timing_adjusted

### City Sightseeing Harbour cruise  · attraction
- 时段：13:25 – 14:55
- 到达：walk 约 7 分钟
- 备注：station_timing_adjusted

### The Silo Hotel  · stay
- 时段：09:00 – 09:00
- 备注：origin_stop

### Cape of Good Hope  · attraction
- 时段：12:00 – 13:30
- 到达：transit 约 180 分钟
- 起点直达：transit 约 180 分钟
- 备注：station_timing_adjusted

### Cape Point Nature Reserve  · attraction
- 时段：14:00 – 15:30
- 到达：walk 约 30 分钟
- 备注：station_timing_adjusted

### Whole Earth Cafe  · meal
- 时段：18:00 – 19:00
- 到达：transit 约 140 分钟
- 备注：station_timing_adjusted, meal_promoted_to_dinner

### Old Cape Point Lighthouse  · attraction
- 时段：21:23 – 22:53
- 到达：transit 约 143 分钟
- 备注：station_timing_adjusted

### New Cape Point Lighthouse  · attraction
- 时段：23:06 – 00:36
- 到达：walk 约 13 分钟
- 备注：station_timing_adjusted

### The Silo Hotel  · stay
- 时段：09:00 – 09:00
- 备注：origin_stop

### Kirstenbosch National Botanical Garden  · attraction
- 时段：10:06 – 11:36
- 到达：transit 约 66 分钟
- 起点直达：transit 约 66 分钟
- 备注：station_timing_adjusted

### Chefs Warehouse Beau Constantia  · meal
- 时段：12:09 – 13:09
- 到达：transit 约 33 分钟
- 备注：station_timing_adjusted

### 南非桌山国家公园  · attraction
- 时段：15:42 – 17:12
- 到达：transit 约 153 分钟
- 备注：station_timing_adjusted

### The Silo Hotel  · stay
- 时段：09:00 – 09:00
- 备注：origin_stop

### District Six Museum  · attraction
- 时段：09:39 – 11:09
- 到达：walk 约 39 分钟
- 起点直达：walk 约 39 分钟
- 备注：station_timing_adjusted

### 開普敦奴隸小屋  · attraction
- 时段：11:15 – 12:45
- 到达：walk 约 6 分钟
- 备注：station_timing_adjusted

### Belly of the beast  · meal
- 时段：12:56 – 13:56
- 到达：walk 约 11 分钟
- 备注：station_timing_adjusted

### South African National Gallery  · attraction
- 时段：14:06 – 15:36
- 到达：walk 约 10 分钟
- 备注：station_timing_adjusted

### Iziko Bo-Kaap Museum  · attraction
- 时段：15:54 – 17:24
- 到达：walk 约 18 分钟
- 备注：station_timing_adjusted

### The Silo Hotel  · stay
- 时段：09:00 – 09:00
- 备注：origin_stop

### Long March to Freedom  · attraction
- 时段：10:10 – 11:40
- 到达：transit 约 70 分钟
- 起点直达：transit 约 70 分钟
- 备注：station_timing_adjusted

### Cape Town Museum of Childhood  · attraction
- 时段：11:53 – 13:23
- 到达：drive 约 13 分钟
- 备注：station_timing_adjusted

### De Grendel Wine Estate and Restaurant  · meal
- 时段：18:00 – 19:00
- 到达：transit 约 101 分钟
- 备注：station_timing_adjusted, meal_promoted_to_dinner

### Heart of Cape Town Museum  · attraction
- 时段：20:42 – 22:12
- 到达：transit 约 102 分钟
- 备注：station_timing_adjusted
