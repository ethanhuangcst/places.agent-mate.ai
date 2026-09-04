# E2E-01 里斯本（Lisbon）4天行程

> 本文件由 `scripts/e2e-places-agent.py` 自动生成，模拟用户调用 places-agent 工具链路得到的真实结果。

## 模拟用户输入（8 行表单）

| 字段 | 值 |
| --- | --- |
| 城市 | 里斯本（Lisbon） |
| 出发日期 | 2026-10-10 |
| 天数 | 4 |
| 酒店 | Hills Hotel Lisboa |
| 节奏 | relaxed |
| 预算 | 3（宽松） |
| 兴趣 | 历史建筑、海边风景、美食 |
| 必去 | 贝伦区、辛特拉、卡斯凯什 |

## places-agent 工具链路

1. `geocode`（有酒店时）→ `travel_tips`（记录 `iconic_places`，ADR-045 展示源）→ 2. `discover_places` → 3. `make_itinerary` → 4. `plan_next_stop` 链直到 `trip_complete`（F65：无 `display_current_stop`）

## 工具调用记录

| # | 工具 | 结果 | 耗时(s) |
| --- | --- | --- | --- |
| 1 | geocode | ✓  | 1.5 |
| 2 | travel_tips | ✓ iconic=Belém Tower、Jerónimos Monastery、Alfama、São Jorge Castle、Sintra、Cascais | 9.49 |
| 3 | discover_places | ✓ places=32, restaurants=34 | 5.18 |
| 4 | make_itinerary | ✓ next=plan_next_stop | 88.16 |
| 5 | plan_next_stop | ✓ next=plan_next_stop | 1.43 |
| 6 | plan_next_stop | ✓ next=plan_next_stop | 1.14 |
| 7 | plan_next_stop | ✓ next=plan_next_stop | 1.21 |
| 8 | plan_next_stop | ✓ next=plan_next_stop | 0.91 |
| 9 | plan_next_stop | ✓ next=plan_next_stop | 1.67 |
| 10 | plan_next_stop | ✓ next=plan_next_stop | 0.1 |
| 11 | plan_next_stop | ✓ next=plan_next_stop | 1.76 |
| 12 | plan_next_stop | ✓ next=plan_next_stop | 1.11 |
| 13 | plan_next_stop | ✓ next=plan_next_stop | 1.45 |
| 14 | plan_next_stop | ✓ next=plan_next_stop | 1.71 |
| 15 | plan_next_stop | ✓ next=plan_next_stop | 0.37 |
| 16 | plan_next_stop | ✓ next=plan_next_stop | 1.12 |
| 17 | plan_next_stop | ✓ next=plan_next_stop | 0.78 |
| 18 | plan_next_stop | ✓ next=plan_next_stop | 1.69 |
| 19 | plan_next_stop | ✓ next=plan_next_stop | 1.12 |
| 20 | plan_next_stop | ✓ next=plan_next_stop | 1.02 |
| 21 | plan_next_stop | ✓ next=plan_next_stop | 0.08 |
| 22 | plan_next_stop | ✓ next=plan_next_stop | 1.27 |
| 23 | plan_next_stop | ✓ next=plan_next_stop | 1.11 |
| 24 | plan_next_stop | ✓ next=plan_next_stop | 1.32 |
| 25 | plan_next_stop | ✓ next=plan_next_stop | 1.32 |
| 26 | plan_next_stop | ✓ next=trip_complete | 1.44 |

## 结果：成功（trip_complete）

**Trip Store:** `trip_id=cmtk7j1b300014ecxsds9yato` · `revision=25`

## travel_tips iconic_places（展示源）

Belém Tower、Jerónimos Monastery、Alfama、São Jorge Castle、Sintra、Cascais


## 骨架

- **Day 1** 贝伦区经典：Hills Hotel Lisboa → 贝伦塔 → 热罗尼莫斯修道院 → Museu de Marinha → MAAT - Museum of Art, Architecture and Technology
- **Day 2** 辛特拉王宫与山城：Hills Hotel Lisboa → 佩纳宫 → 雷加莱拉宫 → 辛特拉宫 → 摩尔人城堡
- **Day 3** 卡斯凯什海边风景：Hills Hotel Lisboa → Fortress Nossa Senhora da Luz de Cascais → Centro Histórico de Cascais → KAPPO | Japanese Cuisine → 地狱之口 → The Charm of Cascais
- **Day 4** 老城历史建筑与观景台：Hills Hotel Lisboa → 圣若热城堡 → Garden of the Castle of São Jorge → Farol de Santa Luzia → 圣卢西亚观景台 → 奥古斯塔街之门

## 逐站填充结果

### Hills Hotel Lisboa  · stay
- 时段：09:00 – 09:00
- 备注：origin_stop

### 贝伦塔  · attraction
- 时段：10:01 – 11:31
- 到达：transit 约 61 分钟
- 起点直达：transit 约 61 分钟
- 备注：station_timing_adjusted

### 热罗尼莫斯修道院  · attraction
- 时段：11:55 – 13:25
- 到达：walk 约 24 分钟
- 备注：station_timing_adjusted

### Museu de Marinha  · attraction
- 时段：13:36 – 15:06
- 到达：walk 约 11 分钟
- 备注：station_timing_adjusted

### MAAT - Museum of Art, Architecture and Technology  · attraction
- 时段：15:30 – 17:00
- 到达：walk 约 24 分钟
- 备注：station_timing_adjusted

### Hills Hotel Lisboa  · stay
- 时段：09:00 – 09:00
- 备注：origin_stop

### 佩纳宫  · attraction
- 时段：10:47 – 12:17
- 到达：transit 约 107 分钟
- 起点直达：transit 约 107 分钟
- 备注：station_timing_adjusted

### 雷加莱拉宫  · attraction
- 时段：12:56 – 14:26
- 到达：walk 约 39 分钟
- 备注：station_timing_adjusted

### 辛特拉宫  · attraction
- 时段：14:37 – 16:07
- 到达：walk 约 11 分钟
- 备注：station_timing_adjusted

### 摩尔人城堡  · attraction
- 时段：16:46 – 18:16
- 到达：walk 约 39 分钟
- 备注：station_timing_adjusted

### Hills Hotel Lisboa  · stay
- 时段：09:00 – 09:00
- 备注：origin_stop

### Fortress Nossa Senhora da Luz de Cascais  · attraction
- 时段：10:21 – 11:51
- 到达：transit 约 81 分钟
- 起点直达：transit 约 81 分钟
- 备注：station_timing_adjusted

### Centro Histórico de Cascais  · attraction
- 时段：12:00 – 13:30
- 到达：walk 约 9 分钟
- 备注：station_timing_adjusted

### KAPPO | Japanese Cuisine  · meal
- 时段：13:35 – 14:35
- 到达：walk 约 5 分钟

### 地狱之口  · attraction
- 时段：14:53 – 16:23
- 到达：walk 约 18 分钟
- 备注：station_timing_adjusted

### The Charm of Cascais  · attraction
- 时段：16:43 – 18:13
- 到达：walk 约 20 分钟
- 备注：station_timing_adjusted

### Hills Hotel Lisboa  · stay
- 时段：09:00 – 09:00
- 备注：origin_stop

### 圣若热城堡  · attraction
- 时段：09:41 – 11:11
- 到达：walk 约 41 分钟
- 起点直达：walk 约 41 分钟
- 备注：station_timing_adjusted

### Garden of the Castle of São Jorge  · attraction
- 时段：11:12 – 12:42
- 到达：walk 约 1 分钟

### Farol de Santa Luzia  · meal
- 时段：12:49 – 13:49
- 到达：walk 约 7 分钟
- 备注：station_timing_adjusted

### 圣卢西亚观景台  · attraction
- 时段：13:50 – 15:20
- 到达：walk 约 1 分钟

### 奥古斯塔街之门  · attraction
- 时段：15:32 – 17:02
- 到达：walk 约 12 分钟
- 备注：station_timing_adjusted
