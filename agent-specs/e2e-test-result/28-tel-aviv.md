# E2E-28 特拉维夫（Tel Aviv）3天行程

> 本文件由 `scripts/e2e-places-agent.py` 自动生成，模拟用户调用 places-agent 工具链路得到的真实结果。

## 模拟用户输入（8 行表单）

| 字段 | 值 |
| --- | --- |
| 城市 | 特拉维夫（Tel Aviv） |
| 出发日期 | 2026-10-10 |
| 天数 | 3 |
| 酒店 | （未提供） |
| 节奏 | medium |
| 预算 | 3（宽松） |
| 兴趣 | 海边、美食、夜生活 |
| 必去 | （用户未选择，走目的地无关路径） |

## places-agent 工具链路

1. `geocode`（有酒店时）→ 2. `discover_places` → 3. `make_itinerary` → 4. `display_current_stop` / `plan_next_stop` 交替直到 `trip_complete`

## 工具调用记录

| # | 工具 | 结果 | 耗时(s) |
| --- | --- | --- | --- |
| 1 | geocode | ✓ skipped(no hotel) |  |
| 2 | discover_places | ✓ places=33, restaurants=39 | 3.22 |
| 3 | make_itinerary | ✓ next=display_current_stop | 22.48 |
| 4 | display_current_stop | ✓ next=plan_next_stop | 0.02 |
| 5 | plan_next_stop | ✓ next=display_current_stop | 1.26 |
| 6 | display_current_stop | ✓ next=plan_next_stop | 0.02 |
| 7 | plan_next_stop | ✓ next=display_current_stop | 0.81 |
| 8 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 9 | plan_next_stop | ✓ next=display_current_stop | 0.8 |
| 10 | display_current_stop | ✓ next=plan_next_stop | 0.02 |
| 11 | plan_next_stop | ✓ next=display_current_stop | 0.84 |
| 12 | display_current_stop | ✓ next=plan_next_stop | 0.02 |
| 13 | plan_next_stop | ✓ next=display_current_stop | 0.76 |
| 14 | display_current_stop | ✓ next=plan_next_stop | 0.02 |
| 15 | plan_next_stop | ✓ next=display_current_stop | 0.74 |
| 16 | display_current_stop | ✓ next=display_current_stop | 0.01 |
| 17 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 18 | plan_next_stop | ✓ next=display_current_stop | 0.93 |
| 19 | display_current_stop | ✓ next=plan_next_stop | 0.02 |
| 20 | plan_next_stop | ✓ next=display_current_stop | 0.77 |
| 21 | display_current_stop | ✓ next=plan_next_stop | 0.02 |
| 22 | plan_next_stop | ✓ next=display_current_stop | 0.7 |
| 23 | display_current_stop | ✓ next=plan_next_stop | 0.02 |
| 24 | plan_next_stop | ✓ next=display_current_stop | 0.75 |
| 25 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 26 | plan_next_stop | ✓ next=display_current_stop | 0.8 |
| 27 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 28 | plan_next_stop | ✓ next=display_current_stop | 0.85 |
| 29 | display_current_stop | ✓ next=display_current_stop | 0.01 |
| 30 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 31 | plan_next_stop | ✓ next=display_current_stop | 0.96 |
| 32 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 33 | plan_next_stop | ✓ next=display_current_stop | 0.77 |
| 34 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 35 | plan_next_stop | ✓ next=display_current_stop | 0.78 |
| 36 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 37 | plan_next_stop | ✓ next=display_current_stop | 0.74 |
| 38 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 39 | plan_next_stop | ✓ next=display_current_stop | 0.89 |
| 40 | display_current_stop | ✓ next=trip_complete | 0.01 |

## 结果：成功（trip_complete）

## 骨架

- **Day 1** 雅法海滨与老城：Old Jaffa → Abrasha Park → Ilana Goor Museum → Abu Hassan → The Clock Tower → 以马内利教堂 → Popina
- **Day 2** 市中心建筑与文化：Bialik Square → Bialik House → Meir Park → Dizengoff Square → Mashya → Ben-Gurion House → Taizu
- **Day 3** 北部海滨与港口：Tel Aviv Promenade → Independence Park → Tel Aviv Port → Nini Hachi → Eretz Israel Museum → Mela

## 逐站填充结果

### Old Jaffa  · attraction
- 时段：09:00 – 10:30

### Abrasha Park  · attraction
- 时段：10:36 – 12:06
- 到达：walk 约 6 分钟
- 备注：station_timing_adjusted

### Ilana Goor Museum  · attraction
- 时段：12:10 – 13:40
- 到达：walk 约 4 分钟

### Abu Hassan  · meal
- 时段：13:47 – 14:47
- 到达：walk 约 7 分钟
- 备注：station_timing_adjusted

### The Clock Tower  · attraction
- 时段：14:58 – 16:28
- 到达：walk 约 11 分钟
- 备注：station_timing_adjusted

### 以马内利教堂  · attraction
- 时段：16:39 – 18:09
- 到达：walk 约 11 分钟
- 备注：station_timing_adjusted

### Popina  · meal
- 时段：18:26 – 19:26
- 到达：walk 约 17 分钟
- 备注：station_timing_adjusted

### Bialik Square  · attraction
- 时段：09:00 – 10:30

### Bialik House  · attraction
- 时段：10:31 – 12:01
- 到达：walk 约 1 分钟

### Meir Park  · attraction
- 时段：12:05 – 13:35
- 到达：walk 约 4 分钟

### Dizengoff Square  · attraction
- 时段：13:44 – 15:14
- 到达：walk 约 9 分钟
- 备注：station_timing_adjusted

### Mashya  · meal
- 时段：18:00 – 19:00
- 到达：walk 约 8 分钟
- 备注：station_timing_adjusted, meal_promoted_to_dinner

### Ben-Gurion House  · attraction
- 时段：19:12 – 20:42
- 到达：walk 约 12 分钟
- 备注：station_timing_adjusted

### Taizu  · meal
- 时段：21:27 – 22:27
- 到达：walk 约 45 分钟
- 备注：station_timing_adjusted

### Tel Aviv Promenade  · attraction
- 时段：09:00 – 10:30

### Independence Park  · attraction
- 时段：11:08 – 12:38
- 到达：walk 约 38 分钟
- 备注：station_timing_adjusted

### Tel Aviv Port  · attraction
- 时段：12:49 – 14:19
- 到达：walk 约 11 分钟
- 备注：station_timing_adjusted

### Nini Hachi  · meal
- 时段：14:30 – 15:30
- 到达：walk 约 11 分钟
- 备注：station_timing_adjusted

### Eretz Israel Museum  · attraction
- 时段：16:11 – 17:41
- 到达：walk 约 41 分钟
- 备注：station_timing_adjusted

### Mela  · meal
- 时段：18:19 – 19:19
- 到达：walk 约 38 分钟
- 备注：station_timing_adjusted
