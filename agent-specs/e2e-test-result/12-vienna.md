# E2E-12 维也纳（Vienna）3天行程

> 本文件由 `scripts/e2e-places-agent.py` 自动生成，模拟用户调用 places-agent 工具链路得到的真实结果。

## 模拟用户输入（8 行表单）

| 字段 | 值 |
| --- | --- |
| 城市 | 维也纳（Vienna） |
| 出发日期 | 2026-10-10 |
| 天数 | 3 |
| 酒店 | Hotel Sacher |
| 节奏 | medium |
| 预算 | 3（宽松） |
| 兴趣 | 古典音乐、宫殿 |
| 必去 | （用户未选择，走目的地无关路径） |

## places-agent 工具链路

1. `geocode`（有酒店时）→ 2. `discover_places` → 3. `make_itinerary` → 4. `display_current_stop` / `plan_next_stop` 交替直到 `trip_complete`

## 工具调用记录

| # | 工具 | 结果 | 耗时(s) |
| --- | --- | --- | --- |
| 1 | geocode | ✓  | 0.22 |
| 2 | discover_places | ✓ places=37, restaurants=35 | 2.45 |
| 3 | make_itinerary | ✓ next=display_current_stop | 4.48 |
| 4 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 5 | plan_next_stop | ✓ next=display_current_stop | 1.32 |
| 6 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 7 | plan_next_stop | ✓ next=display_current_stop | 0.62 |
| 8 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 9 | plan_next_stop | ✓ next=display_current_stop | 0.83 |
| 10 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 11 | plan_next_stop | ✓ next=display_current_stop | 0.76 |
| 12 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 13 | plan_next_stop | ✓ next=display_current_stop | 0.85 |
| 14 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 15 | plan_next_stop | ✓ next=display_current_stop | 0.77 |
| 16 | display_current_stop | ✓ next=display_current_stop | 0.01 |
| 17 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 18 | plan_next_stop | ✓ next=display_current_stop | 0.94 |
| 19 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 20 | plan_next_stop | ✓ next=display_current_stop | 0.67 |
| 21 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 22 | plan_next_stop | ✓ next=display_current_stop | 0.84 |
| 23 | display_current_stop | ✓ next=plan_next_stop | 0.02 |
| 24 | plan_next_stop | ✓ next=display_current_stop | 0.97 |
| 25 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 26 | plan_next_stop | ✓ next=display_current_stop | 0.67 |
| 27 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 28 | plan_next_stop | ✓ next=display_current_stop | 0.98 |
| 29 | display_current_stop | ✓ next=display_current_stop | 0.01 |
| 30 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 31 | plan_next_stop | ✓ next=display_current_stop | 0.72 |
| 32 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 33 | plan_next_stop | ✓ next=display_current_stop | 0.78 |
| 34 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 35 | plan_next_stop | ✓ next=display_current_stop | 0.8 |
| 36 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 37 | plan_next_stop | ✓ next=display_current_stop | 0.86 |
| 38 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 39 | plan_next_stop | ✓ next=display_current_stop | 0.68 |
| 40 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 41 | plan_next_stop | ✓ next=display_current_stop | 0.7 |
| 42 | display_current_stop | ✓ next=trip_complete | 0.01 |

## 结果：成功（trip_complete）

**Trip Store:** `trip_id=cmtjtlbl3000e4e0uma5a21dx` · `revision=42`

## 骨架

- **Day 1** 老城皇宫与古典地标：Hotel Sacher → Schweizerhof Hofburg Wien → 皇家珍宝馆 → Zum Schwarzen Kameel → Sisi Museum → St. Stephen's Cathedral South Tower → Restaurant Meissl & Schadn Wien
- **Day 2** 美景宫与环城大道艺术：Hotel Sacher → Lower Belvedere → 美景宫 → Glasswing Restaurant by Alexandru Simon → 卡尔教堂 → 维也纳分离派 → Wiener Wiazhaus
- **Day 3** 美泉宫宫殿园林：Hotel Sacher → 美泉宫 → Parade Court Fountains → Strasser-Bräu → Schönbrunn Palace Park → Gloriette Schönbrunn → Bauernbräu

## 逐站填充结果

### Hotel Sacher  · stay
- 时段：09:00 – 09:00
- 备注：origin_stop

### Schweizerhof Hofburg Wien  · attraction
- 时段：09:15 – 10:45
- 到达：walk 约 15 分钟
- 起点直达：walk 约 15 分钟
- 备注：station_timing_adjusted

### 皇家珍宝馆  · attraction
- 时段：10:46 – 12:16
- 到达：walk 约 1 分钟

### Zum Schwarzen Kameel  · meal
- 时段：12:27 – 13:27
- 到达：walk 约 11 分钟
- 备注：station_timing_adjusted

### Sisi Museum  · attraction
- 时段：13:32 – 15:02
- 到达：walk 约 5 分钟

### St. Stephen's Cathedral South Tower  · attraction
- 时段：15:11 – 16:41
- 到达：walk 约 9 分钟
- 备注：station_timing_adjusted

### Restaurant Meissl & Schadn Wien  · meal
- 时段：18:00 – 19:00
- 到达：walk 约 12 分钟
- 备注：station_timing_adjusted

### Hotel Sacher  · stay
- 时段：09:00 – 09:00
- 备注：origin_stop

### Lower Belvedere  · attraction
- 时段：09:17 – 10:47
- 到达：walk 约 17 分钟
- 起点直达：walk 约 17 分钟
- 备注：station_timing_adjusted

### 美景宫  · attraction
- 时段：10:56 – 12:26
- 到达：walk 约 9 分钟
- 备注：station_timing_adjusted

### Glasswing Restaurant by Alexandru Simon  · meal
- 时段：12:47 – 13:47
- 到达：walk 约 21 分钟
- 备注：station_timing_adjusted

### 卡尔教堂  · attraction
- 时段：13:54 – 15:24
- 到达：walk 约 7 分钟
- 备注：station_timing_adjusted

### 维也纳分离派  · attraction
- 时段：15:33 – 17:03
- 到达：walk 约 9 分钟
- 备注：station_timing_adjusted

### Wiener Wiazhaus  · meal
- 时段：18:00 – 19:00
- 到达：walk 约 10 分钟
- 备注：station_timing_adjusted

### Hotel Sacher  · stay
- 时段：09:00 – 09:00
- 备注：origin_stop

### 美泉宫  · attraction
- 时段：09:34 – 11:04
- 到达：transit 约 34 分钟
- 起点直达：transit 约 34 分钟
- 备注：station_timing_adjusted

### Parade Court Fountains  · attraction
- 时段：11:07 – 12:37
- 到达：walk 约 3 分钟

### Strasser-Bräu  · meal
- 时段：13:15 – 14:15
- 到达：transit 约 38 分钟
- 备注：station_timing_adjusted

### Schönbrunn Palace Park  · attraction
- 时段：14:57 – 16:27
- 到达：transit 约 42 分钟
- 备注：station_timing_adjusted

### Gloriette Schönbrunn  · attraction
- 时段：16:33 – 18:03
- 到达：walk 约 6 分钟
- 备注：station_timing_adjusted

### Bauernbräu  · meal
- 时段：18:47 – 19:47
- 到达：walk 约 44 分钟
- 备注：station_timing_adjusted
