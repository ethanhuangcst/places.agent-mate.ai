# E2E-15 爱丁堡（Edinburgh）3天行程

> 本文件由 `scripts/e2e-places-agent.py` 自动生成，模拟用户调用 places-agent 工具链路得到的真实结果。

## 模拟用户输入（8 行表单）

| 字段 | 值 |
| --- | --- |
| 城市 | 爱丁堡（Edinburgh） |
| 出发日期 | 2026-10-10 |
| 天数 | 3 |
| 酒店 | The Balmoral |
| 节奏 | medium |
| 预算 | 2（适中） |
| 兴趣 | 城堡、文学 |
| 必去 | （用户未选择，走目的地无关路径） |

## places-agent 工具链路

1. `geocode`（有酒店时）→ 2. `discover_places` → 3. `make_itinerary` → 4. `display_current_stop` / `plan_next_stop` 交替直到 `trip_complete`

## 工具调用记录

| # | 工具 | 结果 | 耗时(s) |
| --- | --- | --- | --- |
| 1 | geocode | ✓  | 0.22 |
| 2 | discover_places | ✓ places=32, restaurants=37 | 2.02 |
| 3 | make_itinerary | ✓ next=display_current_stop | 4.0 |
| 4 | display_current_stop | ✓ next=plan_next_stop | 0.02 |
| 5 | plan_next_stop | ✓ next=display_current_stop | 1.24 |
| 6 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 7 | plan_next_stop | ✓ next=display_current_stop | 0.78 |
| 8 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 9 | plan_next_stop | ✓ next=display_current_stop | 0.73 |
| 10 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 11 | plan_next_stop | ✓ next=display_current_stop | 0.73 |
| 12 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 13 | plan_next_stop | ✓ next=display_current_stop | 0.78 |
| 14 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 15 | plan_next_stop | ✓ next=display_current_stop | 0.75 |
| 16 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 17 | plan_next_stop | ✓ next=display_current_stop | 0.79 |
| 18 | display_current_stop | ✓ next=display_current_stop | 0.01 |
| 19 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 20 | plan_next_stop | ✓ next=display_current_stop | 0.7 |
| 21 | display_current_stop | ✓ next=plan_next_stop | 0.02 |
| 22 | plan_next_stop | ✓ next=display_current_stop | 0.76 |
| 23 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 24 | plan_next_stop | ✓ next=display_current_stop | 0.76 |
| 25 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 26 | plan_next_stop | ✓ next=display_current_stop | 0.79 |
| 27 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 28 | plan_next_stop | ✓ next=display_current_stop | 0.67 |
| 29 | display_current_stop | ✓ next=plan_next_stop | 0.03 |
| 30 | plan_next_stop | ✓ next=display_current_stop | 0.79 |
| 31 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 32 | plan_next_stop | ✓ next=display_current_stop | 0.9 |
| 33 | display_current_stop | ✓ next=display_current_stop | 0.02 |
| 34 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 35 | plan_next_stop | ✓ next=display_current_stop | 0.65 |
| 36 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 37 | plan_next_stop | ✓ next=display_current_stop | 0.78 |
| 38 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 39 | plan_next_stop | ✓ next=display_current_stop | 0.76 |
| 40 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 41 | plan_next_stop | ✓ next=display_current_stop | 0.74 |
| 42 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 43 | plan_next_stop | ✓ next=display_current_stop | 0.69 |
| 44 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 45 | plan_next_stop | ✓ next=display_current_stop | 0.9 |
| 46 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 47 | plan_next_stop | ✓ next=display_current_stop | 0.76 |
| 48 | display_current_stop | ✓ next=trip_complete | 0.01 |

## 结果：成功（trip_complete）

**Trip Store:** `trip_id=cmtjtmhza000h4e0u221h3xii` · `revision=48`

## 骨架

- **Day 1** 城堡与皇家一英里：The Balmoral → Royal Mile → 玛丽金街 → Makars Mash Bar → 爱丁堡城堡 → Great Hall → 圣玛格丽特礼拜堂 → The Piper's Rest
- **Day 2** 文学博物馆与旧城区：The Balmoral → 司各特纪念塔 → The Writers' Museum → Edinburgh Street Food → Museum on the Mound → 苏格兰国家画廊 → 苏格兰国立博物馆 → Bistro Coco
- **Day 3** 荷里路德与亚瑟王座：The Balmoral → 约翰诺克斯故居 → 荷里路德宫 → The Haggis Box → The King's Gallery, Palace of Holyroodhouse → 爱丁堡博物馆 → Arthur's Seat → Wedgwood The Restaurant

## 逐站填充结果

### The Balmoral  · stay
- 时段：09:00 – 09:00
- 备注：origin_stop

### Royal Mile  · attraction
- 时段：09:06 – 10:36
- 到达：walk 约 6 分钟
- 起点直达：walk 约 6 分钟
- 备注：station_timing_adjusted

### 玛丽金街  · attraction
- 时段：10:39 – 12:09
- 到达：walk 约 3 分钟

### Makars Mash Bar  · meal
- 时段：12:12 – 13:12
- 到达：walk 约 3 分钟

### 爱丁堡城堡  · attraction
- 时段：13:23 – 14:53
- 到达：walk 约 11 分钟
- 备注：station_timing_adjusted

### Great Hall  · attraction
- 时段：14:54 – 16:24
- 到达：walk 约 1 分钟

### 圣玛格丽特礼拜堂  · attraction
- 时段：16:25 – 17:55
- 到达：walk 约 1 分钟

### The Piper's Rest  · meal
- 时段：18:06 – 19:06
- 到达：walk 约 11 分钟
- 备注：station_timing_adjusted

### The Balmoral  · stay
- 时段：09:00 – 09:00
- 备注：origin_stop

### 司各特纪念塔  · attraction
- 时段：09:03 – 10:33
- 到达：walk 约 3 分钟
- 起点直达：walk 约 3 分钟

### The Writers' Museum  · attraction
- 时段：10:40 – 12:10
- 到达：walk 约 7 分钟
- 备注：station_timing_adjusted

### Edinburgh Street Food  · meal
- 时段：12:25 – 13:25
- 到达：walk 约 15 分钟
- 备注：station_timing_adjusted

### Museum on the Mound  · attraction
- 时段：13:42 – 15:12
- 到达：walk 约 17 分钟
- 备注：station_timing_adjusted

### 苏格兰国家画廊  · attraction
- 时段：15:15 – 16:45
- 到达：walk 约 3 分钟

### 苏格兰国立博物馆  · attraction
- 时段：16:54 – 18:24
- 到达：walk 约 9 分钟
- 备注：station_timing_adjusted

### Bistro Coco  · meal
- 时段：18:44 – 19:44
- 到达：walk 约 20 分钟
- 备注：station_timing_adjusted

### The Balmoral  · stay
- 时段：09:00 – 09:00
- 备注：origin_stop

### 约翰诺克斯故居  · attraction
- 时段：09:08 – 10:38
- 到达：walk 约 8 分钟
- 起点直达：walk 约 8 分钟
- 备注：station_timing_adjusted

### 荷里路德宫  · attraction
- 时段：10:48 – 12:18
- 到达：walk 约 10 分钟
- 备注：station_timing_adjusted

### The Haggis Box  · meal
- 时段：12:31 – 13:31
- 到达：walk 约 13 分钟
- 备注：station_timing_adjusted

### The King's Gallery, Palace of Holyroodhouse  · attraction
- 时段：13:40 – 15:10
- 到达：walk 约 9 分钟
- 备注：station_timing_adjusted

### 爱丁堡博物馆  · attraction
- 时段：15:16 – 16:46
- 到达：walk 约 6 分钟
- 备注：station_timing_adjusted

### Arthur's Seat  · attraction
- 时段：17:28 – 18:58
- 到达：walk 约 42 分钟
- 备注：station_timing_adjusted

### Wedgwood The Restaurant  · meal
- 时段：19:37 – 20:37
- 到达：walk 约 39 分钟
- 备注：station_timing_adjusted
