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
| 1 | geocode | ✓  | 0.18 |
| 2 | discover_places | ✓ places=34, restaurants=37 | 4.88 |
| 3 | make_itinerary | ✓ next=display_current_stop | 19.4 |
| 4 | display_current_stop | ✓ next=plan_next_stop | 0.02 |
| 5 | plan_next_stop | ✓ next=display_current_stop | 1.21 |
| 6 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 7 | plan_next_stop | ✓ next=display_current_stop | 0.81 |
| 8 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 9 | plan_next_stop | ✓ next=display_current_stop | 0.73 |
| 10 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 11 | plan_next_stop | ✓ next=display_current_stop | 0.77 |
| 12 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 13 | plan_next_stop | ✓ next=display_current_stop | 0.78 |
| 14 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 15 | plan_next_stop | ✓ next=display_current_stop | 0.78 |
| 16 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 17 | plan_next_stop | ✓ next=display_current_stop | 0.82 |
| 18 | display_current_stop | ✓ next=display_current_stop | 0.01 |
| 19 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 20 | plan_next_stop | ✓ next=display_current_stop | 0.73 |
| 21 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 22 | plan_next_stop | ✓ next=display_current_stop | 0.77 |
| 23 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 24 | plan_next_stop | ✓ next=display_current_stop | 0.72 |
| 25 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 26 | plan_next_stop | ✓ next=display_current_stop | 0.84 |
| 27 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 28 | plan_next_stop | ✓ next=display_current_stop | 0.69 |
| 29 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 30 | plan_next_stop | ✓ next=display_current_stop | 0.76 |
| 31 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 32 | plan_next_stop | ✓ next=display_current_stop | 0.76 |
| 33 | display_current_stop | ✓ next=display_current_stop | 0.01 |
| 34 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 35 | plan_next_stop | ✓ next=display_current_stop | 0.76 |
| 36 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 37 | plan_next_stop | ✓ next=display_current_stop | 0.72 |
| 38 | display_current_stop | ✓ next=plan_next_stop | 0.02 |
| 39 | plan_next_stop | ✓ next=display_current_stop | 0.76 |
| 40 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 41 | plan_next_stop | ✓ next=display_current_stop | 0.94 |
| 42 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 43 | plan_next_stop | ✓ next=display_current_stop | 0.76 |
| 44 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 45 | plan_next_stop | ✓ next=display_current_stop | 0.77 |
| 46 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 47 | plan_next_stop | ✓ next=display_current_stop | 0.78 |
| 48 | display_current_stop | ✓ next=trip_complete | 0.01 |

## 结果：成功（trip_complete）

## 骨架

- **Day 1** 城堡与皇家大道文学线：The Balmoral → 司各特纪念塔 → The Writers' Museum → Royal Mile → Makars Mash Bar → 爱丁堡城堡 → Great Hall → Casserole Wang - 王贵仁砂锅麻辣烫爱丁堡店
- **Day 2** 卡尔顿山到荷里路德与亚瑟王座：The Balmoral → National Monument of Scotland → Burns Monument → Edinburgh Street Food → 爱丁堡博物馆 → 荷里路德宫 → Arthur's Seat → The Piper's Rest
- **Day 3** 老城博物馆与城堡视角：The Balmoral → 苏格兰国立博物馆 → 灰衣修士教堂墓地 → Quick & Plenty Cafe → The Vennel Viewpoint Edinburgh Castle → 暗箱 → 苏格兰威士忌体验中心 → The Haggis Box

## 逐站填充结果

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

### Royal Mile  · attraction
- 时段：12:15 – 13:45
- 到达：walk 约 5 分钟

### Makars Mash Bar  · meal
- 时段：13:50 – 14:50
- 到达：walk 约 5 分钟

### 爱丁堡城堡  · attraction
- 时段：15:01 – 16:31
- 到达：walk 约 11 分钟
- 备注：station_timing_adjusted

### Great Hall  · attraction
- 时段：16:32 – 18:02
- 到达：walk 约 1 分钟

### Casserole Wang - 王贵仁砂锅麻辣烫爱丁堡店  · meal
- 时段：18:14 – 19:14
- 到达：walk 约 12 分钟
- 备注：station_timing_adjusted

### The Balmoral  · stay
- 时段：09:00 – 09:00
- 备注：origin_stop

### National Monument of Scotland  · attraction
- 时段：09:10 – 10:40
- 到达：walk 约 10 分钟
- 起点直达：walk 约 10 分钟
- 备注：station_timing_adjusted

### Burns Monument  · attraction
- 时段：10:50 – 12:20
- 到达：walk 约 10 分钟
- 备注：station_timing_adjusted

### Edinburgh Street Food  · meal
- 时段：12:32 – 13:32
- 到达：walk 约 12 分钟
- 备注：station_timing_adjusted

### 爱丁堡博物馆  · attraction
- 时段：13:45 – 15:15
- 到达：walk 约 13 分钟
- 备注：station_timing_adjusted

### 荷里路德宫  · attraction
- 时段：15:21 – 16:51
- 到达：walk 约 6 分钟
- 备注：station_timing_adjusted

### Arthur's Seat  · attraction
- 时段：17:28 – 18:58
- 到达：walk 约 37 分钟
- 备注：station_timing_adjusted

### The Piper's Rest  · meal
- 时段：19:43 – 20:43
- 到达：walk 约 45 分钟
- 备注：station_timing_adjusted

### The Balmoral  · stay
- 时段：09:00 – 09:00
- 备注：origin_stop

### 苏格兰国立博物馆  · attraction
- 时段：09:13 – 10:43
- 到达：walk 约 13 分钟
- 起点直达：walk 约 13 分钟
- 备注：station_timing_adjusted

### 灰衣修士教堂墓地  · attraction
- 时段：10:45 – 12:15
- 到达：walk 约 2 分钟

### Quick & Plenty Cafe  · meal
- 时段：12:33 – 13:33
- 到达：walk 约 18 分钟
- 备注：station_timing_adjusted

### The Vennel Viewpoint Edinburgh Castle  · attraction
- 时段：13:45 – 15:15
- 到达：walk 约 12 分钟
- 备注：station_timing_adjusted

### 暗箱  · attraction
- 时段：15:22 – 16:52
- 到达：walk 约 7 分钟
- 备注：station_timing_adjusted

### 苏格兰威士忌体验中心  · attraction
- 时段：16:53 – 18:23
- 到达：walk 约 1 分钟

### The Haggis Box  · meal
- 时段：18:32 – 19:32
- 到达：walk 约 9 分钟
- 备注：station_timing_adjusted
