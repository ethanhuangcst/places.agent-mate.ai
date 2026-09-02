# E2E-25 哥本哈根（Copenhagen）3天行程

> 本文件由 `scripts/e2e-places-agent.py` 自动生成，模拟用户调用 places-agent 工具链路得到的真实结果。

## 模拟用户输入（8 行表单）

| 字段 | 值 |
| --- | --- |
| 城市 | 哥本哈根（Copenhagen） |
| 出发日期 | 2026-10-10 |
| 天数 | 3 |
| 酒店 | （未提供） |
| 节奏 | medium |
| 预算 | 2（适中） |
| 兴趣 | 设计、美食 |
| 必去 | （用户未选择，走目的地无关路径） |

## places-agent 工具链路

1. `geocode`（有酒店时）→ 2. `discover_places` → 3. `make_itinerary` → 4. `display_current_stop` / `plan_next_stop` 交替直到 `trip_complete`

## 工具调用记录

| # | 工具 | 结果 | 耗时(s) |
| --- | --- | --- | --- |
| 1 | geocode | ✓ skipped(no hotel) |  |
| 2 | discover_places | ✓ places=27, restaurants=34 | 2.63 |
| 3 | make_itinerary | ✓ next=display_current_stop | 3.24 |
| 4 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 5 | plan_next_stop | ✓ next=display_current_stop | 0.94 |
| 6 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 7 | plan_next_stop | ✓ next=display_current_stop | 0.74 |
| 8 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 9 | plan_next_stop | ✓ next=display_current_stop | 0.71 |
| 10 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 11 | plan_next_stop | ✓ next=display_current_stop | 0.77 |
| 12 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 13 | plan_next_stop | ✓ next=display_current_stop | 0.71 |
| 14 | display_current_stop | ✓ next=display_current_stop | 0.01 |
| 15 | display_current_stop | ✓ next=plan_next_stop | 0.02 |
| 16 | plan_next_stop | ✓ next=display_current_stop | 0.93 |
| 17 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 18 | plan_next_stop | ✓ next=display_current_stop | 0.74 |
| 19 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 20 | plan_next_stop | ✓ next=display_current_stop | 0.8 |
| 21 | display_current_stop | ✓ next=plan_next_stop | 0.02 |
| 22 | plan_next_stop | ✓ next=display_current_stop | 0.79 |
| 23 | display_current_stop | ✓ next=plan_next_stop | 0.04 |
| 24 | plan_next_stop | ✓ next=display_current_stop | 0.7 |
| 25 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 26 | plan_next_stop | ✓ next=display_current_stop | 0.65 |
| 27 | display_current_stop | ✓ next=display_current_stop | 0.01 |
| 28 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 29 | plan_next_stop | ✓ next=display_current_stop | 0.87 |
| 30 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 31 | plan_next_stop | ✓ next=display_current_stop | 0.79 |
| 32 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 33 | plan_next_stop | ✓ next=display_current_stop | 0.77 |
| 34 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 35 | plan_next_stop | ✓ next=display_current_stop | 0.71 |
| 36 | display_current_stop | ✓ next=trip_complete | 0.01 |

## 结果：成功（trip_complete）

**Trip Store:** `trip_id=cmtjttnwn000r4e0u3v1w2806` · `revision=36`

## 骨架

- **Day 1** 市中心经典与设计博物馆：趣伏里公园 → 新嘉士伯美术馆 → Boulevardcph Coffee and Street Food → 丹麦国家博物馆 → 克里斯蒂安堡宫 → Restaurant 1733
- **Day 2** 王宫区与新港漫步：罗森堡城堡 → 哥本哈根大学植物园 → Schønnemann → 阿馬林堡宮 → Amalienborg Museum → Nyhavn → Hyttefadet
- **Day 3** 腓特烈斯贝与嘉士伯片区：腓特烈斯贝宫 → 哥本哈根动物园 → Mad & Kaffe → Home of Carlsberg → Smagsløget sandwiches

## 逐站填充结果

### 趣伏里公园  · attraction
- 时段：09:00 – 10:30

### 新嘉士伯美术馆  · attraction
- 时段：10:40 – 12:10
- 到达：walk 约 10 分钟
- 备注：station_timing_adjusted

### Boulevardcph Coffee and Street Food  · meal
- 时段：12:19 – 13:19
- 到达：walk 约 9 分钟
- 备注：station_timing_adjusted

### 丹麦国家博物馆  · attraction
- 时段：13:31 – 15:01
- 到达：walk 约 12 分钟
- 备注：station_timing_adjusted

### 克里斯蒂安堡宫  · attraction
- 时段：15:08 – 16:38
- 到达：walk 约 7 分钟
- 备注：station_timing_adjusted

### Restaurant 1733  · meal
- 时段：18:00 – 19:00
- 到达：walk 约 7 分钟
- 备注：station_timing_adjusted

### 罗森堡城堡  · attraction
- 时段：09:00 – 10:30

### 哥本哈根大学植物园  · attraction
- 时段：10:36 – 12:06
- 到达：walk 约 6 分钟
- 备注：station_timing_adjusted

### Schønnemann  · meal
- 时段：12:12 – 13:12
- 到达：walk 约 6 分钟
- 备注：station_timing_adjusted

### 阿馬林堡宮  · attraction
- 时段：13:31 – 15:01
- 到达：walk 约 19 分钟
- 备注：station_timing_adjusted

### Amalienborg Museum  · attraction
- 时段：15:02 – 16:32
- 到达：walk 约 1 分钟

### Nyhavn  · attraction
- 时段：16:41 – 18:11
- 到达：walk 约 9 分钟
- 备注：station_timing_adjusted

### Hyttefadet  · meal
- 时段：18:12 – 19:12
- 到达：walk 约 1 分钟

### 腓特烈斯贝宫  · attraction
- 时段：09:00 – 10:30

### 哥本哈根动物园  · attraction
- 时段：10:33 – 12:03
- 到达：walk 约 3 分钟

### Mad & Kaffe  · meal
- 时段：12:45 – 13:45
- 到达：walk 约 42 分钟
- 备注：station_timing_adjusted

### Home of Carlsberg  · attraction
- 时段：14:05 – 15:35
- 到达：transit 约 20 分钟
- 备注：station_timing_adjusted

### Smagsløget sandwiches  · meal
- 时段：18:00 – 19:00
- 到达：walk 约 34 分钟
- 备注：station_timing_adjusted
