# E2E-10 首尔（Seoul）4天行程

> 本文件由 `scripts/e2e-places-agent.py` 自动生成，模拟用户调用 places-agent 工具链路得到的真实结果。

## 模拟用户输入（8 行表单）

| 字段 | 值 |
| --- | --- |
| 城市 | 首尔（Seoul） |
| 出发日期 | 2026-10-10 |
| 天数 | 4 |
| 酒店 | Hotel28 Myeongdong |
| 节奏 | medium |
| 预算 | 2（适中） |
| 兴趣 | （未提供） |
| 必去 | （用户未选择，走目的地无关路径） |

## places-agent 工具链路

1. `geocode`（有酒店时）→ 2. `discover_places` → 3. `make_itinerary` → 4. `display_current_stop` / `plan_next_stop` 交替直到 `trip_complete`

## 工具调用记录

| # | 工具 | 结果 | 耗时(s) |
| --- | --- | --- | --- |
| 1 | geocode | ✓  | 0.18 |
| 2 | discover_places | ✓ places=45, restaurants=33 | 3.33 |
| 3 | make_itinerary | ✓ next=display_current_stop | 29.89 |
| 4 | display_current_stop | ✓ next=plan_next_stop | 0.02 |
| 5 | plan_next_stop | ✓ next=display_current_stop | 1.53 |
| 6 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 7 | plan_next_stop | ✓ next=display_current_stop | 1.01 |
| 8 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 9 | plan_next_stop | ✓ next=display_current_stop | 1.02 |
| 10 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 11 | plan_next_stop | ✓ next=display_current_stop | 0.88 |
| 12 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 13 | plan_next_stop | ✓ next=display_current_stop | 1.01 |
| 14 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 15 | plan_next_stop | ✓ next=display_current_stop | 0.94 |
| 16 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 17 | plan_next_stop | ✓ next=display_current_stop | 0.93 |
| 18 | display_current_stop | ✓ next=display_current_stop | 0.01 |
| 19 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 20 | plan_next_stop | ✓ next=display_current_stop | 0.9 |
| 21 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 22 | plan_next_stop | ✓ next=display_current_stop | 0.81 |
| 23 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 24 | plan_next_stop | ✓ next=display_current_stop | 0.9 |
| 25 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 26 | plan_next_stop | ✓ next=display_current_stop | 0.92 |
| 27 | display_current_stop | ✓ next=plan_next_stop | 0.02 |
| 28 | plan_next_stop | ✓ next=display_current_stop | 1.02 |
| 29 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 30 | plan_next_stop | ✓ next=display_current_stop | 0.96 |
| 31 | display_current_stop | ✓ next=plan_next_stop | 0.03 |
| 32 | plan_next_stop | ✓ next=display_current_stop | 0.94 |
| 33 | display_current_stop | ✓ next=display_current_stop | 0.01 |
| 34 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 35 | plan_next_stop | ✓ next=display_current_stop | 0.91 |
| 36 | display_current_stop | ✓ next=plan_next_stop | 0.0 |
| 37 | plan_next_stop | ✓ next=display_current_stop | 0.96 |
| 38 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 39 | plan_next_stop | ✓ next=display_current_stop | 0.95 |
| 40 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 41 | plan_next_stop | ✓ next=display_current_stop | 0.99 |
| 42 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 43 | plan_next_stop | ✓ next=display_current_stop | 0.91 |
| 44 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 45 | plan_next_stop | ✓ next=display_current_stop | 0.9 |
| 46 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 47 | plan_next_stop | ✓ next=display_current_stop | 1.03 |
| 48 | display_current_stop | ✓ next=display_current_stop | 0.01 |
| 49 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 50 | plan_next_stop | ✓ next=display_current_stop | 0.89 |
| 51 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 52 | plan_next_stop | ✓ next=display_current_stop | 0.92 |
| 53 | display_current_stop | ✓ next=plan_next_stop | 0.0 |
| 54 | plan_next_stop | ✓ next=display_current_stop | 0.95 |
| 55 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 56 | plan_next_stop | ✓ next=display_current_stop | 0.94 |
| 57 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 58 | plan_next_stop | ✓ next=display_current_stop | 1.12 |
| 59 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 60 | plan_next_stop | ✓ next=display_current_stop | 1.13 |
| 61 | display_current_stop | ✓ next=trip_complete | 0.01 |

## 结果：成功（trip_complete）

## 骨架

- **Day 1** 景福宫与北村古迹：Hotel28 Myeongdong → 光化门 → 国立古宫博物馆 → 景福宫 → Artist Bakery → Geonchunmun Gate → Bukchon Yukgyeong (Photo Spot) → A Flower Blossom on the Rice
- **Day 2** 昌德宫与钟路韩屋街区：Hotel28 Myeongdong → 昌德宫 → Changgyeonggung Greenhouse → Ikseon-dong Hanok Village → Ikseon Chwihyang → 仁寺洞 → Gongpyeong Historic Sites Museum → 853 팔오삼
- **Day 3** 南山与德寿宫：Hotel28 Myeongdong → 南山谷韩屋村 → Namsan Mountain Park → Namsan Octagonal Pavilion Park Observatory → Geumseonggwan Naju Gomtang → 德寿宫 → Seokjojeon (Korean Empire History Museum) → 미성옥
- **Day 4** 龙山博物馆群：Hotel28 Myeongdong → 韩国战争纪念馆 → 용산역사박물관 → Kyochon Pilbang → 韩国国立中央博物馆 → Children's Museum of the National Museum of Korea → 다오리식당

## 逐站填充结果

### Hotel28 Myeongdong  · stay
- 时段：09:00 – 09:00
- 备注：origin_stop

### 光化门  · attraction
- 时段：09:17 – 10:47
- 到达：walk 约 17 分钟
- 起点直达：walk 约 17 分钟
- 备注：station_timing_adjusted

### 国立古宫博物馆  · attraction
- 时段：10:52 – 12:22
- 到达：walk 约 5 分钟

### 景福宫  · attraction
- 时段：12:27 – 13:57
- 到达：walk 约 5 分钟

### Artist Bakery  · meal
- 时段：14:06 – 15:06
- 到达：walk 约 9 分钟
- 备注：station_timing_adjusted

### Geonchunmun Gate  · attraction
- 时段：15:12 – 16:42
- 到达：walk 约 6 分钟
- 备注：station_timing_adjusted

### Bukchon Yukgyeong (Photo Spot)  · attraction
- 时段：16:49 – 18:19
- 到达：walk 约 7 分钟
- 备注：station_timing_adjusted

### A Flower Blossom on the Rice  · meal
- 时段：18:29 – 19:29
- 到达：walk 约 10 分钟
- 备注：station_timing_adjusted

### Hotel28 Myeongdong  · stay
- 时段：09:00 – 09:00
- 备注：origin_stop

### 昌德宫  · attraction
- 时段：09:22 – 10:52
- 到达：walk 约 22 分钟
- 起点直达：walk 约 22 分钟
- 备注：station_timing_adjusted

### Changgyeonggung Greenhouse  · attraction
- 时段：10:58 – 12:28
- 到达：walk 约 6 分钟
- 备注：station_timing_adjusted

### Ikseon-dong Hanok Village  · attraction
- 时段：12:41 – 14:11
- 到达：walk 约 13 分钟
- 备注：station_timing_adjusted

### Ikseon Chwihyang  · meal
- 时段：14:16 – 15:16
- 到达：walk 约 5 分钟

### 仁寺洞  · attraction
- 时段：15:21 – 16:51
- 到达：walk 约 5 分钟

### Gongpyeong Historic Sites Museum  · attraction
- 时段：16:56 – 18:26
- 到达：walk 约 5 分钟

### 853 팔오삼  · meal
- 时段：18:31 – 19:31
- 到达：walk 约 5 分钟

### Hotel28 Myeongdong  · stay
- 时段：09:00 – 09:00
- 备注：origin_stop

### 南山谷韩屋村  · attraction
- 时段：09:13 – 10:43
- 到达：walk 约 13 分钟
- 起点直达：walk 约 13 分钟
- 备注：station_timing_adjusted

### Namsan Mountain Park  · attraction
- 时段：10:55 – 12:25
- 到达：walk 约 12 分钟
- 备注：station_timing_adjusted

### Namsan Octagonal Pavilion Park Observatory  · attraction
- 时段：12:30 – 14:00
- 到达：walk 约 5 分钟

### Geumseonggwan Naju Gomtang  · meal
- 时段：14:16 – 15:16
- 到达：walk 约 16 分钟
- 备注：station_timing_adjusted

### 德寿宫  · attraction
- 时段：15:23 – 16:53
- 到达：walk 约 7 分钟
- 备注：station_timing_adjusted

### Seokjojeon (Korean Empire History Museum)  · attraction
- 时段：16:58 – 18:28
- 到达：walk 约 5 分钟

### 미성옥  · meal
- 时段：18:39 – 19:39
- 到达：walk 约 11 分钟
- 备注：station_timing_adjusted

### Hotel28 Myeongdong  · stay
- 时段：09:00 – 09:00
- 备注：origin_stop

### 韩国战争纪念馆  · attraction
- 时段：09:38 – 11:08
- 到达：walk 约 38 分钟
- 起点直达：walk 约 38 分钟
- 备注：station_timing_adjusted

### 용산역사박물관  · attraction
- 时段：11:27 – 12:57
- 到达：walk 约 19 分钟
- 备注：station_timing_adjusted

### Kyochon Pilbang  · meal
- 时段：13:29 – 14:29
- 到达：walk 约 32 分钟
- 备注：station_timing_adjusted

### 韩国国立中央博物馆  · attraction
- 时段：14:49 – 16:19
- 到达：walk 约 20 分钟
- 备注：station_timing_adjusted

### Children's Museum of the National Museum of Korea  · attraction
- 时段：16:24 – 17:54
- 到达：walk 约 5 分钟

### 다오리식당  · meal
- 时段：18:20 – 19:20
- 到达：transit 约 26 分钟
- 备注：station_timing_adjusted
