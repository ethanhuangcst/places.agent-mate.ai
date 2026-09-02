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
| 2 | discover_places | ✓ places=32, restaurants=38 | 2.94 |
| 3 | make_itinerary | ✓ next=display_current_stop | 3.86 |
| 4 | display_current_stop | ✓ next=plan_next_stop | 0.02 |
| 5 | plan_next_stop | ✓ next=display_current_stop | 0.85 |
| 6 | display_current_stop | ✓ next=plan_next_stop | 0.05 |
| 7 | plan_next_stop | ✓ next=display_current_stop | 0.71 |
| 8 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 9 | plan_next_stop | ✓ next=display_current_stop | 0.71 |
| 10 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 11 | plan_next_stop | ✓ next=display_current_stop | 0.71 |
| 12 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 13 | plan_next_stop | ✓ next=display_current_stop | 0.79 |
| 14 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 15 | plan_next_stop | ✓ next=display_current_stop | 0.74 |
| 16 | display_current_stop | ✓ next=display_current_stop | 0.01 |
| 17 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 18 | plan_next_stop | ✓ next=display_current_stop | 0.87 |
| 19 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 20 | plan_next_stop | ✓ next=display_current_stop | 0.68 |
| 21 | display_current_stop | ✓ next=plan_next_stop | 0.02 |
| 22 | plan_next_stop | ✓ next=display_current_stop | 0.75 |
| 23 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 24 | plan_next_stop | ✓ next=display_current_stop | 0.78 |
| 25 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 26 | plan_next_stop | ✓ next=display_current_stop | 0.73 |
| 27 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 28 | plan_next_stop | ✓ next=display_current_stop | 0.74 |
| 29 | display_current_stop | ✓ next=display_current_stop | 0.03 |
| 30 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 31 | plan_next_stop | ✓ next=display_current_stop | 0.85 |
| 32 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 33 | plan_next_stop | ✓ next=display_current_stop | 0.74 |
| 34 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 35 | plan_next_stop | ✓ next=display_current_stop | 0.78 |
| 36 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 37 | plan_next_stop | ✓ next=display_current_stop | 0.76 |
| 38 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 39 | plan_next_stop | ✓ next=display_current_stop | 0.68 |
| 40 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 41 | plan_next_stop | ✓ next=display_current_stop | 0.75 |
| 42 | display_current_stop | ✓ next=trip_complete | 0.01 |

## 结果：成功（trip_complete）

**Trip Store:** `trip_id=cmtjturcc000u4e0ul5fvw9lk` · `revision=42`

## 骨架

- **Day 1** 雅法古城与海港经典：Old Jaffa → Ilana Goor Museum → Abu Hassan → House of Simon the Tanner → The Clock Tower → Park HaTachana → Popina
- **Day 2** 海滨漫步与白城核心：Tel Aviv Promenade → Bialik House → Mashya → Bialik Square → Dizengoff Square → Tel Aviv Port → Villa Mare
- **Day 3** 艺术文化与北城夜生活：特拉维夫艺术博物馆 → 舞台广场 → Taizu → Ben-Gurion House → Eretz Israel Museum → TLV Bike Tours → Nini Hachi

## 逐站填充结果

### Old Jaffa  · attraction
- 时段：09:00 – 10:30

### Ilana Goor Museum  · attraction
- 时段：10:38 – 12:08
- 到达：walk 约 8 分钟
- 备注：station_timing_adjusted

### Abu Hassan  · meal
- 时段：12:15 – 13:15
- 到达：walk 约 7 分钟
- 备注：station_timing_adjusted

### House of Simon the Tanner  · attraction
- 时段：13:23 – 14:53
- 到达：walk 约 8 分钟
- 备注：station_timing_adjusted

### The Clock Tower  · attraction
- 时段：15:02 – 16:32
- 到达：walk 约 9 分钟
- 备注：station_timing_adjusted

### Park HaTachana  · attraction
- 时段：16:44 – 18:14
- 到达：walk 约 12 分钟
- 备注：station_timing_adjusted

### Popina  · meal
- 时段：18:29 – 19:29
- 到达：walk 约 15 分钟
- 备注：station_timing_adjusted

### Tel Aviv Promenade  · attraction
- 时段：09:00 – 10:30

### Bialik House  · attraction
- 时段：10:46 – 12:16
- 到达：walk 约 16 分钟
- 备注：station_timing_adjusted

### Mashya  · meal
- 时段：12:29 – 13:29
- 到达：walk 约 13 分钟
- 备注：station_timing_adjusted

### Bialik Square  · attraction
- 时段：13:42 – 15:12
- 到达：walk 约 13 分钟
- 备注：station_timing_adjusted

### Dizengoff Square  · attraction
- 时段：15:22 – 16:52
- 到达：walk 约 10 分钟
- 备注：station_timing_adjusted

### Tel Aviv Port  · attraction
- 时段：17:27 – 18:57
- 到达：walk 约 35 分钟
- 备注：station_timing_adjusted

### Villa Mare  · meal
- 时段：19:29 – 20:29
- 到达：walk 约 32 分钟
- 备注：station_timing_adjusted

### 特拉维夫艺术博物馆  · attraction
- 时段：09:00 – 10:30

### 舞台广场  · attraction
- 时段：10:47 – 12:17
- 到达：walk 约 17 分钟
- 备注：station_timing_adjusted

### Taizu  · meal
- 时段：12:35 – 13:35
- 到达：walk 约 18 分钟
- 备注：station_timing_adjusted

### Ben-Gurion House  · attraction
- 时段：14:19 – 15:49
- 到达：walk 约 44 分钟
- 备注：station_timing_adjusted

### Eretz Israel Museum  · attraction
- 时段：16:09 – 17:39
- 到达：transit 约 20 分钟
- 备注：station_timing_adjusted

### TLV Bike Tours  · attraction
- 时段：18:11 – 19:41
- 到达：walk 约 32 分钟
- 备注：station_timing_adjusted

### Nini Hachi  · meal
- 时段：19:51 – 20:51
- 到达：walk 约 10 分钟
- 备注：station_timing_adjusted
