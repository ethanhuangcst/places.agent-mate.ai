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
| 1 | geocode | ✓  | 0.18 |
| 2 | discover_places | ✓ places=34, restaurants=36 | 3.82 |
| 3 | make_itinerary | ✓ next=display_current_stop | 9.63 |
| 4 | display_current_stop | ✓ next=plan_next_stop | 0.02 |
| 5 | plan_next_stop | ✓ next=display_current_stop | 1.37 |
| 6 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 7 | plan_next_stop | ✓ next=display_current_stop | 0.71 |
| 8 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 9 | plan_next_stop | ✓ next=display_current_stop | 0.93 |
| 10 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 11 | plan_next_stop | ✓ next=display_current_stop | 0.85 |
| 12 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 13 | plan_next_stop | ✓ next=display_current_stop | 0.58 |
| 14 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 15 | plan_next_stop | ✓ next=display_current_stop | 0.81 |
| 16 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 17 | plan_next_stop | ✓ next=display_current_stop | 0.74 |
| 18 | display_current_stop | ✓ next=display_current_stop | 0.01 |
| 19 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 20 | plan_next_stop | ✓ next=display_current_stop | 0.73 |
| 21 | display_current_stop | ✓ next=plan_next_stop | 0.03 |
| 22 | plan_next_stop | ✓ next=display_current_stop | 0.99 |
| 23 | display_current_stop | ✓ next=plan_next_stop | 0.02 |
| 24 | plan_next_stop | ✓ next=display_current_stop | 0.83 |
| 25 | display_current_stop | ✓ next=plan_next_stop | 0.02 |
| 26 | plan_next_stop | ✓ next=display_current_stop | 0.84 |
| 27 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 28 | plan_next_stop | ✓ next=display_current_stop | 0.72 |
| 29 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 30 | plan_next_stop | ✓ next=display_current_stop | 0.72 |
| 31 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 32 | plan_next_stop | ✓ next=display_current_stop | 0.76 |
| 33 | display_current_stop | ✓ next=display_current_stop | 0.01 |
| 34 | display_current_stop | ✓ next=plan_next_stop | 0.04 |
| 35 | plan_next_stop | ✓ next=display_current_stop | 0.63 |
| 36 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 37 | plan_next_stop | ✓ next=display_current_stop | 0.82 |
| 38 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 39 | plan_next_stop | ✓ next=display_current_stop | 0.76 |
| 40 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 41 | plan_next_stop | ✓ next=display_current_stop | 0.98 |
| 42 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 43 | plan_next_stop | ✓ next=display_current_stop | 0.83 |
| 44 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 45 | plan_next_stop | ✓ next=display_current_stop | 0.84 |
| 46 | display_current_stop | ✓ next=plan_next_stop | 0.13 |
| 47 | plan_next_stop | ✓ next=display_current_stop | 0.86 |
| 48 | display_current_stop | ✓ next=trip_complete | 0.01 |

## 结果：成功（trip_complete）

## 骨架

- **Day 1** 霍夫堡与老城古典核心：Hotel Sacher → 艺术史博物馆 → Kunstkammer → Hǎo Noodle & Tea → Schweizerhof Hofburg Wien → 皇家珍宝馆 → Dom- und Metropolitanpfarre St. Stephan → Restaurant Meissl & Schadn Wien
- **Day 2** 美泉宫与宫苑：Hotel Sacher → 美泉宫 → Parade Court Fountains → Strasser-Bräu → Gloriette Schönbrunn → Schönbrunn Palace Park → Roman Ruin → Bauernbräu
- **Day 3** 环城南段与音乐艺术：Hotel Sacher → 卡尔教堂 → 维也纳博物馆 → Glasswing Restaurant by Alexandru Simon → 美景宫 → 城市公园 → 维也纳艺术之家 → ef16 Restaurant Weinbar

## 逐站填充结果

### Hotel Sacher  · stay
- 时段：09:00 – 09:00
- 备注：origin_stop

### 艺术史博物馆  · attraction
- 时段：09:11 – 10:41
- 到达：walk 约 11 分钟
- 起点直达：walk 约 11 分钟
- 备注：station_timing_adjusted

### Kunstkammer  · attraction
- 时段：10:42 – 12:12
- 到达：walk 约 1 分钟

### Hǎo Noodle & Tea  · meal
- 时段：12:15 – 13:15
- 到达：walk 约 3 分钟

### Schweizerhof Hofburg Wien  · attraction
- 时段：13:25 – 14:55
- 到达：walk 约 10 分钟
- 备注：station_timing_adjusted

### 皇家珍宝馆  · attraction
- 时段：14:56 – 16:26
- 到达：walk 约 1 分钟

### Dom- und Metropolitanpfarre St. Stephan  · attraction
- 时段：16:42 – 18:12
- 到达：walk 约 16 分钟
- 备注：station_timing_adjusted

### Restaurant Meissl & Schadn Wien  · meal
- 时段：18:24 – 19:24
- 到达：walk 约 12 分钟
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
- 时段：13:14 – 14:14
- 到达：transit 约 37 分钟
- 备注：station_timing_adjusted

### Gloriette Schönbrunn  · attraction
- 时段：14:55 – 16:25
- 到达：transit 约 41 分钟
- 备注：station_timing_adjusted

### Schönbrunn Palace Park  · attraction
- 时段：16:30 – 18:00
- 到达：walk 约 5 分钟

### Roman Ruin  · attraction
- 时段：18:06 – 19:36
- 到达：walk 约 6 分钟
- 备注：station_timing_adjusted

### Bauernbräu  · meal
- 时段：20:25 – 21:25
- 到达：walk 约 49 分钟
- 备注：station_timing_adjusted

### Hotel Sacher  · stay
- 时段：09:00 – 09:00
- 备注：origin_stop

### 卡尔教堂  · attraction
- 时段：09:11 – 10:41
- 到达：walk 约 11 分钟
- 起点直达：walk 约 11 分钟
- 备注：station_timing_adjusted

### 维也纳博物馆  · attraction
- 时段：10:43 – 12:13
- 到达：walk 约 2 分钟

### Glasswing Restaurant by Alexandru Simon  · meal
- 时段：12:19 – 13:19
- 到达：walk 约 6 分钟
- 备注：station_timing_adjusted

### 美景宫  · attraction
- 时段：13:42 – 15:12
- 到达：walk 约 23 分钟
- 备注：station_timing_adjusted

### 城市公园  · attraction
- 时段：15:34 – 17:04
- 到达：walk 约 22 分钟
- 备注：station_timing_adjusted

### 维也纳艺术之家  · attraction
- 时段：17:27 – 18:57
- 到达：walk 约 23 分钟
- 备注：station_timing_adjusted

### ef16 Restaurant Weinbar  · meal
- 时段：19:19 – 20:19
- 到达：walk 约 22 分钟
- 备注：station_timing_adjusted
