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
| 2 | discover_places | ✓ places=44, restaurants=40 | 3.76 |
| 3 | make_itinerary | ✓ next=display_current_stop | 28.18 |
| 4 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 5 | plan_next_stop | ✓ next=display_current_stop | 2.06 |
| 6 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 7 | plan_next_stop | ✓ next=display_current_stop | 0.64 |
| 8 | display_current_stop | ✓ next=plan_next_stop | 0.02 |
| 9 | plan_next_stop | ✓ next=display_current_stop | 0.71 |
| 10 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 11 | plan_next_stop | ✓ next=display_current_stop | 0.63 |
| 12 | display_current_stop | ✓ next=display_current_stop | 0.01 |
| 13 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 14 | plan_next_stop | ✓ next=display_current_stop | 0.72 |
| 15 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 16 | plan_next_stop | ✓ next=display_current_stop | 0.76 |
| 17 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 18 | plan_next_stop | ✓ next=display_current_stop | 0.75 |
| 19 | display_current_stop | ✓ next=plan_next_stop | 0.02 |
| 20 | plan_next_stop | ✓ next=display_current_stop | 0.83 |
| 21 | display_current_stop | ✓ next=display_current_stop | 0.01 |
| 22 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 23 | plan_next_stop | ✓ next=display_current_stop | 1.01 |
| 24 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 25 | plan_next_stop | ✓ next=display_current_stop | 0.83 |
| 26 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 27 | plan_next_stop | ✓ next=display_current_stop | 0.81 |
| 28 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 29 | plan_next_stop | ✓ next=display_current_stop | 0.61 |
| 30 | display_current_stop | ✓ next=display_current_stop | 0.02 |
| 31 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 32 | plan_next_stop | ✓ next=display_current_stop | 1.01 |
| 33 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 34 | plan_next_stop | ✓ next=display_current_stop | 0.71 |
| 35 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 36 | plan_next_stop | ✓ next=display_current_stop | 0.65 |
| 37 | display_current_stop | ✓ next=trip_complete | 0.01 |

## 结果：成功（trip_complete）

## 骨架

- **Day 1** 古城寺庙与老城文化：Wat Si Koet → Wat Inthakhin Sadue Muang → Huen Phen → Wat Phan On → 塔佩门
- **Day 2** 素贴山自然与寺庙：素贴山国家公园 → 啪啦寺 → The Bowl Spot Nimman - Healthy Poke & Breakfast Restaurant → 双龙寺 → 蒲屏皇宫
- **Day 3** 城南寺庙与皇家花园：乌蒙寺 → 拉查帕皇家花园 → คลีนเหนือมอ Clean Food for Healthy หลังมช. → Wat Phra That Doi Kham → 清迈夜间动物园
- **Day 4** 城北自然与博物馆：淮东陶水库 → The Highland People Discovery Museum → Baan Mae Café & Restaurant → 清迈国家博物馆

## 逐站填充结果

### Wat Si Koet  · attraction
- 时段：09:00 – 10:30

### Wat Inthakhin Sadue Muang  · attraction
- 时段：10:36 – 12:06
- 到达：walk 约 6 分钟
- 备注：station_timing_adjusted

### Huen Phen  · meal
- 时段：12:14 – 13:14
- 到达：walk 约 8 分钟
- 备注：station_timing_adjusted

### Wat Phan On  · attraction
- 时段：13:27 – 14:57
- 到达：walk 约 13 分钟
- 备注：station_timing_adjusted

### 塔佩门  · attraction
- 时段：15:01 – 16:31
- 到达：walk 约 4 分钟

### 素贴山国家公园  · attraction
- 时段：09:00 – 10:30

### 啪啦寺  · attraction
- 时段：11:21 – 12:51
- 到达：walk 约 51 分钟
- 备注：station_timing_adjusted

### The Bowl Spot Nimman - Healthy Poke & Breakfast Restaurant  · meal
- 时段：13:32 – 14:32
- 到达：drive 约 41 分钟
- 备注：station_timing_adjusted

### 双龙寺  · attraction
- 时段：15:13 – 16:43
- 到达：transit 约 41 分钟
- 备注：station_timing_adjusted

### 蒲屏皇宫  · attraction
- 时段：17:06 – 18:36
- 到达：transit 约 23 分钟
- 备注：station_timing_adjusted

### 乌蒙寺  · attraction
- 时段：09:00 – 10:30

### 拉查帕皇家花园  · attraction
- 时段：11:11 – 12:41
- 到达：transit 约 41 分钟
- 备注：station_timing_adjusted

### คลีนเหนือมอ Clean Food for Healthy หลังมช.  · meal
- 时段：13:23 – 14:23
- 到达：transit 约 42 分钟
- 备注：station_timing_adjusted

### Wat Phra That Doi Kham  · attraction
- 时段：15:02 – 16:32
- 到达：transit 约 39 分钟
- 备注：station_timing_adjusted

### 清迈夜间动物园  · attraction
- 时段：17:24 – 18:54
- 到达：walk 约 52 分钟
- 备注：station_timing_adjusted

### 淮东陶水库  · attraction
- 时段：09:00 – 10:30

### The Highland People Discovery Museum  · attraction
- 时段：11:17 – 12:47
- 到达：transit 约 47 分钟
- 备注：station_timing_adjusted

### Baan Mae Café & Restaurant  · meal
- 时段：13:37 – 14:37
- 到达：walk 约 50 分钟
- 备注：station_timing_adjusted

### 清迈国家博物馆  · attraction
- 时段：15:10 – 16:40
- 到达：walk 约 33 分钟
- 备注：station_timing_adjusted
