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
| 2 | discover_places | ✓ places=43, restaurants=33 | 2.53 |
| 3 | make_itinerary | ✓ next=display_current_stop | 9.05 |
| 4 | display_current_stop | ✓ next=plan_next_stop | 0.02 |
| 5 | plan_next_stop | ✓ next=display_current_stop | 1.41 |
| 6 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 7 | plan_next_stop | ✓ next=display_current_stop | 0.92 |
| 8 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 9 | plan_next_stop | ✓ next=display_current_stop | 0.92 |
| 10 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 11 | plan_next_stop | ✓ next=display_current_stop | 0.95 |
| 12 | display_current_stop | ✓ next=plan_next_stop | 0.04 |
| 13 | plan_next_stop | ✓ next=display_current_stop | 0.99 |
| 14 | display_current_stop | ✓ next=plan_next_stop | 0.02 |
| 15 | plan_next_stop | ✓ next=display_current_stop | 0.94 |
| 16 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 17 | plan_next_stop | ✓ next=display_current_stop | 1.07 |
| 18 | display_current_stop | ✓ next=display_current_stop | 0.01 |
| 19 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 20 | plan_next_stop | ✓ next=display_current_stop | 0.95 |
| 21 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 22 | plan_next_stop | ✓ next=display_current_stop | 0.91 |
| 23 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 24 | plan_next_stop | ✓ next=display_current_stop | 0.94 |
| 25 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 26 | plan_next_stop | ✓ next=display_current_stop | 0.89 |
| 27 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 28 | plan_next_stop | ✓ next=display_current_stop | 0.95 |
| 29 | display_current_stop | ✓ next=plan_next_stop | 0.02 |
| 30 | plan_next_stop | ✓ next=display_current_stop | 0.9 |
| 31 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 32 | plan_next_stop | ✓ next=display_current_stop | 0.88 |
| 33 | display_current_stop | ✓ next=display_current_stop | 0.01 |
| 34 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 35 | plan_next_stop | ✓ next=display_current_stop | 1.0 |
| 36 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 37 | plan_next_stop | ✓ next=display_current_stop | 0.82 |
| 38 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 39 | plan_next_stop | ✓ next=display_current_stop | 0.84 |
| 40 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 41 | plan_next_stop | ✓ next=display_current_stop | 0.88 |
| 42 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 43 | plan_next_stop | ✓ next=display_current_stop | 1.06 |
| 44 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 45 | plan_next_stop | ✓ next=display_current_stop | 1.0 |
| 46 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 47 | plan_next_stop | ✓ next=display_current_stop | 0.95 |
| 48 | display_current_stop | ✓ next=display_current_stop | 0.01 |
| 49 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 50 | plan_next_stop | ✓ next=display_current_stop | 0.91 |
| 51 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 52 | plan_next_stop | ✓ next=display_current_stop | 0.88 |
| 53 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 54 | plan_next_stop | ✓ next=display_current_stop | 1.0 |
| 55 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 56 | plan_next_stop | ✓ next=display_current_stop | 1.07 |
| 57 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 58 | plan_next_stop | ✓ next=display_current_stop | 0.96 |
| 59 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 60 | plan_next_stop | ✓ next=display_current_stop | 0.87 |
| 61 | display_current_stop | ✓ next=trip_complete | 0.01 |

## 结果：成功（trip_complete）

**Trip Store:** `trip_id=cmtjtka2z000c4e0uo9g972yv` · `revision=61`

## 骨架

- **Day 1** 景福宫与西村北村韩屋线：Hotel28 Myeongdong → 景福宫 → 光化门 → A Flower Blossom on the Rice → 国立古宫博物馆 → Seochon Hanok Village → Bukchon Hanok Hall → 853 팔오삼
- **Day 2** 昌德宫益善洞仁寺洞历史散步：Hotel28 Myeongdong → 昌德宫 → Gongpyeong Historic Sites Museum → Ikseon Chwihyang → Ikseon-dong Hanok Village → 仁寺洞 → 北村韩屋村 → Solsot Pot Rice House
- **Day 3** 南山明洞市中心轻松一日：Hotel28 Myeongdong → 德寿宫 → 清溪川 → 미성옥 → Myeongdong Shopping Street → Namsan Mountain Park → Namsan Octagonal Pavilion Park Observatory → Daol Charcoal Grilling (Korean BBQ Daol)
- **Day 4** 龙山博物馆到弘大延伸：Hotel28 Myeongdong → 韩国国立中央博物馆 → 韩国战争纪念馆 → 봄이네식당 → Gyeongui Line Forest Park → Hongdae Street → Hongdae Food Street

## 逐站填充结果

### Hotel28 Myeongdong  · stay
- 时段：09:00 – 09:00
- 备注：origin_stop

### 景福宫  · attraction
- 时段：09:22 – 10:52
- 到达：walk 约 22 分钟
- 起点直达：walk 约 22 分钟
- 备注：station_timing_adjusted

### 光化门  · attraction
- 时段：10:57 – 12:27
- 到达：walk 约 5 分钟

### A Flower Blossom on the Rice  · meal
- 时段：12:35 – 13:35
- 到达：walk 约 8 分钟
- 备注：station_timing_adjusted

### 国立古宫博物馆  · attraction
- 时段：13:45 – 15:15
- 到达：walk 约 10 分钟
- 备注：station_timing_adjusted

### Seochon Hanok Village  · attraction
- 时段：15:20 – 16:50
- 到达：walk 约 5 分钟

### Bukchon Hanok Hall  · attraction
- 时段：17:04 – 18:34
- 到达：walk 约 14 分钟
- 备注：station_timing_adjusted

### 853 팔오삼  · meal
- 时段：18:45 – 19:45
- 到达：walk 约 11 分钟
- 备注：station_timing_adjusted

### Hotel28 Myeongdong  · stay
- 时段：09:00 – 09:00
- 备注：origin_stop

### 昌德宫  · attraction
- 时段：09:22 – 10:52
- 到达：walk 约 22 分钟
- 起点直达：walk 约 22 分钟
- 备注：station_timing_adjusted

### Gongpyeong Historic Sites Museum  · attraction
- 时段：11:05 – 12:35
- 到达：walk 约 13 分钟
- 备注：station_timing_adjusted

### Ikseon Chwihyang  · meal
- 时段：12:42 – 13:42
- 到达：walk 约 7 分钟
- 备注：station_timing_adjusted

### Ikseon-dong Hanok Village  · attraction
- 时段：13:47 – 15:17
- 到达：walk 约 5 分钟

### 仁寺洞  · attraction
- 时段：15:22 – 16:52
- 到达：walk 约 5 分钟

### 北村韩屋村  · attraction
- 时段：17:05 – 18:35
- 到达：walk 约 13 分钟
- 备注：station_timing_adjusted

### Solsot Pot Rice House  · meal
- 时段：18:46 – 19:46
- 到达：walk 约 11 分钟
- 备注：station_timing_adjusted

### Hotel28 Myeongdong  · stay
- 时段：09:00 – 09:00
- 备注：origin_stop

### 德寿宫  · attraction
- 时段：09:10 – 10:40
- 到达：walk 约 10 分钟
- 起点直达：walk 约 10 分钟
- 备注：station_timing_adjusted

### 清溪川  · attraction
- 时段：10:46 – 12:16
- 到达：walk 约 6 分钟
- 备注：station_timing_adjusted

### 미성옥  · meal
- 时段：12:25 – 13:25
- 到达：walk 约 9 分钟
- 备注：station_timing_adjusted

### Myeongdong Shopping Street  · attraction
- 时段：13:30 – 15:00
- 到达：walk 约 5 分钟

### Namsan Mountain Park  · attraction
- 时段：15:18 – 16:48
- 到达：walk 约 18 分钟
- 备注：station_timing_adjusted

### Namsan Octagonal Pavilion Park Observatory  · attraction
- 时段：16:53 – 18:23
- 到达：walk 约 5 分钟

### Daol Charcoal Grilling (Korean BBQ Daol)  · meal
- 时段：18:38 – 19:38
- 到达：walk 约 15 分钟
- 备注：station_timing_adjusted

### Hotel28 Myeongdong  · stay
- 时段：09:00 – 09:00
- 备注：origin_stop

### 韩国国立中央博物馆  · attraction
- 时段：09:30 – 11:00
- 到达：transit 约 30 分钟
- 起点直达：transit 约 30 分钟
- 备注：station_timing_adjusted

### 韩国战争纪念馆  · attraction
- 时段：11:17 – 12:47
- 到达：walk 约 17 分钟
- 备注：station_timing_adjusted

### 봄이네식당  · meal
- 时段：13:15 – 14:15
- 到达：walk 约 28 分钟
- 备注：station_timing_adjusted

### Gyeongui Line Forest Park  · attraction
- 时段：14:49 – 16:19
- 到达：walk 约 34 分钟
- 备注：station_timing_adjusted

### Hongdae Street  · attraction
- 时段：16:24 – 17:54
- 到达：walk 约 5 分钟

### Hongdae Food Street  · meal
- 时段：18:00 – 19:00
- 到达：walk 约 6 分钟
- 备注：station_timing_adjusted
