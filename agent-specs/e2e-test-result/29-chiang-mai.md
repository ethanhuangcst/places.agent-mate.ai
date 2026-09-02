# E2E-29 清迈（Chiang Mai）4天行程

> 本文件由 `scripts/e2e-places-agent.py` 自动生成，模拟用户调用 places-agent 工具链路得到的真实结果。

## 模拟用户输入（8 行表单）

| 字段 | 值 |
| --- | --- |
| 城市 | 清迈（Chiang Mai） |
| 出发日期 | 2026-10-10 |
| 天数 | 4 |
| 酒店 | （未提供） |
| 节奏 | relaxed |
| 预算 | 1（节约） |
| 兴趣 | 寺庙、自然、咖啡 |
| 必去 | （用户未选择，走目的地无关路径） |

## places-agent 工具链路

1. `geocode`（有酒店时）→ 2. `discover_places` → 3. `make_itinerary` → 4. `display_current_stop` / `plan_next_stop` 交替直到 `trip_complete`

## 工具调用记录

| # | 工具 | 结果 | 耗时(s) |
| --- | --- | --- | --- |
| 1 | geocode | ✓ skipped(no hotel) |  |
| 2 | discover_places | ✓ places=44, restaurants=40 | 2.87 |
| 3 | make_itinerary | ✓ next=display_current_stop | 4.5 |
| 4 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 5 | plan_next_stop | ✓ next=display_current_stop | 1.88 |
| 6 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 7 | plan_next_stop | ✓ next=display_current_stop | 0.72 |
| 8 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 9 | plan_next_stop | ✓ next=display_current_stop | 0.6 |
| 10 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 11 | plan_next_stop | ✓ next=display_current_stop | 0.63 |
| 12 | display_current_stop | ✓ next=display_current_stop | 0.01 |
| 13 | display_current_stop | ✓ next=plan_next_stop | 0.03 |
| 14 | plan_next_stop | ✓ next=display_current_stop | 0.8 |
| 15 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 16 | plan_next_stop | ✓ next=display_current_stop | 0.79 |
| 17 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 18 | plan_next_stop | ✓ next=display_current_stop | 0.83 |
| 19 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 20 | plan_next_stop | ✓ next=display_current_stop | 0.87 |
| 21 | display_current_stop | ✓ next=display_current_stop | 0.02 |
| 22 | display_current_stop | ✓ next=plan_next_stop | 0.02 |
| 23 | plan_next_stop | ✓ next=display_current_stop | 0.82 |
| 24 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 25 | plan_next_stop | ✓ next=display_current_stop | 0.63 |
| 26 | display_current_stop | ✓ next=plan_next_stop | 0.0 |
| 27 | plan_next_stop | ✓ next=display_current_stop | 0.67 |
| 28 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 29 | plan_next_stop | ✓ next=display_current_stop | 0.68 |
| 30 | display_current_stop | ✓ next=display_current_stop | 0.0 |
| 31 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 32 | plan_next_stop | ✓ next=display_current_stop | 0.9 |
| 33 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 34 | plan_next_stop | ✓ next=display_current_stop | 0.78 |
| 35 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 36 | plan_next_stop | ✓ next=display_current_stop | 0.81 |
| 37 | display_current_stop | ✓ next=trip_complete | 0.01 |

## 结果：成功（trip_complete）

**Trip Store:** `trip_id=cmtjtv7a5000v4e0u8u2mlstc` · `revision=37`

## 骨架

- **Day 1** 古城寺庙与咖啡：帕辛寺 → 契迪龙寺 → Sweet Home coffee -A little Corner → 盼道寺 → 塔佩门
- **Day 2** 素贴山寺庙与自然：双龙寺 → 素贴山国家公园 → Chiang Mai Restaurant → 乌蒙寺 → Wat Phra That Doi Kham
- **Day 3** 宁曼周边博物馆与寺院：清迈国家博物馆 → 七塔寺 → Baan Mae Café & Restaurant → The Highland People Discovery Museum → 罗摩利寺
- **Day 4** 湄林自然一日：湄沙瀑布 → 淮东陶水库 → Food4Thought (Original Flagship Location) → Buatong Waterfall-Chet Si Fountain National Park

## 逐站填充结果

### 帕辛寺  · attraction
- 时段：09:00 – 10:30

### 契迪龙寺  · attraction
- 时段：10:43 – 12:13
- 到达：walk 约 13 分钟
- 备注：station_timing_adjusted

### Sweet Home coffee -A little Corner  · meal
- 时段：12:28 – 13:28
- 到达：walk 约 15 分钟
- 备注：station_timing_adjusted

### 盼道寺  · attraction
- 时段：13:41 – 15:11
- 到达：walk 约 13 分钟
- 备注：station_timing_adjusted

### 塔佩门  · attraction
- 时段：15:20 – 16:50
- 到达：walk 约 9 分钟
- 备注：station_timing_adjusted

### 双龙寺  · attraction
- 时段：09:00 – 10:30

### 素贴山国家公园  · attraction
- 时段：10:47 – 12:17
- 到达：walk 约 17 分钟
- 备注：station_timing_adjusted

### Chiang Mai Restaurant  · meal
- 时段：13:15 – 14:15
- 到达：transit 约 58 分钟
- 备注：station_timing_adjusted

### 乌蒙寺  · attraction
- 时段：14:46 – 16:16
- 到达：transit 约 31 分钟
- 备注：station_timing_adjusted

### Wat Phra That Doi Kham  · attraction
- 时段：16:53 – 18:23
- 到达：transit 约 37 分钟
- 备注：station_timing_adjusted

### 清迈国家博物馆  · attraction
- 时段：09:00 – 10:30

### 七塔寺  · attraction
- 时段：10:42 – 12:12
- 到达：walk 约 12 分钟
- 备注：station_timing_adjusted

### Baan Mae Café & Restaurant  · meal
- 时段：12:37 – 13:37
- 到达：walk 约 25 分钟
- 备注：station_timing_adjusted

### The Highland People Discovery Museum  · attraction
- 时段：14:27 – 15:57
- 到达：walk 约 50 分钟
- 备注：station_timing_adjusted

### 罗摩利寺  · attraction
- 时段：16:55 – 18:25
- 到达：walk 约 58 分钟
- 备注：station_timing_adjusted

### 湄沙瀑布  · attraction
- 时段：09:00 – 10:30

### 淮东陶水库  · attraction
- 时段：11:22 – 12:52
- 到达：transit 约 52 分钟
- 备注：station_timing_adjusted

### Food4Thought (Original Flagship Location)  · meal
- 时段：13:46 – 14:46
- 到达：transit 约 54 分钟
- 备注：station_timing_adjusted

### Buatong Waterfall-Chet Si Fountain National Park  · attraction
- 时段：17:46 – 19:16
- 到达：transit 约 180 分钟
- 备注：station_timing_adjusted
