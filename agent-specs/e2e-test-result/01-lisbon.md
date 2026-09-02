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

1. `geocode`（有酒店时）→ 2. `discover_places` → 3. `make_itinerary` → 4. `display_current_stop` / `plan_next_stop` 交替直到 `trip_complete`

## 工具调用记录

| # | 工具 | 结果 | 耗时(s) |
| --- | --- | --- | --- |
| 1 | geocode | ✓  | 0.34 |
| 2 | discover_places | ✓ places=28, restaurants=35 | 1.11 |
| 3 | make_itinerary | ✓ next=display_current_stop | 47.49 |
| 4 | display_current_stop | ✓ next=plan_next_stop | 0.02 |
| 5 | plan_next_stop | ✓ next=display_current_stop | 0.87 |
| 6 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 7 | plan_next_stop | ✓ next=display_current_stop | 0.5 |
| 8 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 9 | plan_next_stop | ✓ next=display_current_stop | 0.49 |
| 10 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 11 | plan_next_stop | ✓ next=display_current_stop | 0.76 |
| 12 | display_current_stop | ✓ next=display_current_stop | 0.02 |
| 13 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 14 | plan_next_stop | ✓ next=display_current_stop | 0.59 |
| 15 | display_current_stop | ✓ next=plan_next_stop | 0.02 |
| 16 | plan_next_stop | ✓ next=display_current_stop | 0.49 |
| 17 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 18 | plan_next_stop | ✓ next=display_current_stop | 0.47 |
| 19 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 20 | plan_next_stop | ✓ next=display_current_stop | 0.54 |
| 21 | display_current_stop | ✓ next=display_current_stop | 0.01 |
| 22 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 23 | plan_next_stop | ✓ next=display_current_stop | 0.58 |
| 24 | display_current_stop | ✓ next=plan_next_stop | 0.02 |
| 25 | plan_next_stop | ✓ next=display_current_stop | 0.42 |
| 26 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 27 | plan_next_stop | ✓ next=display_current_stop | 0.54 |
| 28 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 29 | plan_next_stop | ✓ next=display_current_stop | 0.5 |
| 30 | display_current_stop | ✓ next=display_current_stop | 0.01 |
| 31 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 32 | plan_next_stop | ✓ next=display_current_stop | 0.52 |
| 33 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 34 | plan_next_stop | ✓ next=display_current_stop | 0.44 |
| 35 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 36 | plan_next_stop | ✓ next=display_current_stop | 0.51 |
| 37 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 38 | plan_next_stop | ✓ next=display_current_stop | 0.55 |
| 39 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 40 | plan_next_stop | ✓ next=display_current_stop | 0.82 |
| 41 | display_current_stop | ✓ next=trip_complete | 0.01 |

## 结果：成功（trip_complete）

**Trip Store:** `trip_id=cmtjtbcrs00034e0uem7xah3r` · `revision=41`

## 骨架

- **Day 1** 贝伦区经典：Hills Hotel Lisboa → 阿茹达宫 → 热罗尼莫斯修道院 → 贝伦塔 → 发现者纪念碑
- **Day 2** 辛特拉宫殿山城：Hills Hotel Lisboa → 辛特拉宫 → 雷加莱拉宫 → 佩纳宫 → 摩尔人城堡
- **Day 3** 卡斯凯什海边风景：Hills Hotel Lisboa → Centro Histórico de Cascais → 地狱之口 → Belcanto → The Charm of Cascais
- **Day 4** 阿尔法玛与城堡历史建筑：Hills Hotel Lisboa → 圣若热城堡 → Garden of the Castle of São Jorge → Farol de Santa Luzia → 圣卢西亚观景台 → Miradouro das Portas do Sol

## 逐站填充结果

### Hills Hotel Lisboa  · stay
- 时段：09:00 – 09:00
- 备注：origin_stop

### 阿茹达宫  · attraction
- 时段：09:49 – 11:19
- 到达：transit 约 49 分钟
- 起点直达：transit 约 49 分钟
- 备注：station_timing_adjusted

### 热罗尼莫斯修道院  · attraction
- 时段：11:41 – 13:11
- 到达：walk 约 22 分钟
- 备注：station_timing_adjusted

### 贝伦塔  · attraction
- 时段：13:35 – 15:05
- 到达：walk 约 24 分钟
- 备注：station_timing_adjusted

### 发现者纪念碑  · attraction
- 时段：15:20 – 16:50
- 到达：walk 约 15 分钟
- 备注：station_timing_adjusted

### Hills Hotel Lisboa  · stay
- 时段：09:00 – 09:00
- 备注：origin_stop

### 辛特拉宫  · attraction
- 时段：10:20 – 11:50
- 到达：transit 约 80 分钟
- 起点直达：transit 约 80 分钟
- 备注：station_timing_adjusted

### 雷加莱拉宫  · attraction
- 时段：12:02 – 13:32
- 到达：walk 约 12 分钟
- 备注：station_timing_adjusted

### 佩纳宫  · attraction
- 时段：13:57 – 15:27
- 到达：transit 约 25 分钟
- 备注：station_timing_adjusted

### 摩尔人城堡  · attraction
- 时段：15:53 – 17:23
- 到达：walk 约 26 分钟
- 备注：station_timing_adjusted

### Hills Hotel Lisboa  · stay
- 时段：09:00 – 09:00
- 备注：origin_stop

### Centro Histórico de Cascais  · attraction
- 时段：10:07 – 11:37
- 到达：transit 约 67 分钟
- 起点直达：transit 约 67 分钟
- 备注：station_timing_adjusted

### 地狱之口  · attraction
- 时段：12:00 – 13:30
- 到达：walk 约 23 分钟
- 备注：station_timing_adjusted

### Belcanto  · meal
- 时段：18:00 – 19:00
- 到达：transit 约 68 分钟
- 备注：station_timing_adjusted, meal_promoted_to_dinner

### The Charm of Cascais  · attraction
- 时段：20:13 – 21:43
- 到达：transit 约 73 分钟
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

### Miradouro das Portas do Sol  · attraction
- 时段：15:22 – 16:52
- 到达：walk 约 2 分钟
