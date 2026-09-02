# E2E-20 京都（Kyoto）3天行程

> 本文件由 `scripts/e2e-places-agent.py` 自动生成，模拟用户调用 places-agent 工具链路得到的真实结果。

## 模拟用户输入（8 行表单）

| 字段 | 值 |
| --- | --- |
| 城市 | 京都（Kyoto） |
| 出发日期 | 2026-10-10 |
| 天数 | 3 |
| 酒店 | Hiiragiya Ryokan |
| 节奏 | relaxed |
| 预算 | 3（宽松） |
| 兴趣 | 寺庙、庭院 |
| 必去 | 岚山 |

## places-agent 工具链路

1. `geocode`（有酒店时）→ 2. `discover_places` → 3. `make_itinerary` → 4. `display_current_stop` / `plan_next_stop` 交替直到 `trip_complete`

## 工具调用记录

| # | 工具 | 结果 | 耗时(s) |
| --- | --- | --- | --- |
| 1 | geocode | ✓  | 0.21 |
| 2 | discover_places | ✓ places=36, restaurants=23 | 7.03 |
| 3 | make_itinerary | ✓ next=display_current_stop | 69.66 |
| 4 | display_current_stop | ✓ next=plan_next_stop | 0.02 |
| 5 | plan_next_stop | ✓ next=display_current_stop | 2.22 |
| 6 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 7 | plan_next_stop | ✓ next=display_current_stop | 0.9 |
| 8 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 9 | plan_next_stop | ✓ next=display_current_stop | 0.7 |
| 10 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 11 | plan_next_stop | ✓ next=display_current_stop | 0.83 |
| 12 | display_current_stop | ✓ next=display_current_stop | 0.01 |
| 13 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 14 | plan_next_stop | ✓ next=display_current_stop | 0.88 |
| 15 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 16 | plan_next_stop | ✓ next=display_current_stop | 0.79 |
| 17 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 18 | plan_next_stop | ✓ next=display_current_stop | 0.74 |
| 19 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 20 | plan_next_stop | ✓ next=display_current_stop | 0.68 |
| 21 | display_current_stop | ✓ next=plan_next_stop | 0.02 |
| 22 | plan_next_stop | ✓ next=display_current_stop | 0.89 |
| 23 | display_current_stop | ✓ next=display_current_stop | 0.01 |
| 24 | display_current_stop | ✓ next=plan_next_stop | 0.02 |
| 25 | plan_next_stop | ✓ next=display_current_stop | 0.93 |
| 26 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 27 | plan_next_stop | ✓ next=display_current_stop | 0.89 |
| 28 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 29 | plan_next_stop | ✓ next=display_current_stop | 0.85 |
| 30 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 31 | plan_next_stop | ✓ next=display_current_stop | 0.78 |
| 32 | display_current_stop | ✓ next=trip_complete | 0.01 |

## 结果：成功（trip_complete）

**Trip Store:** `trip_id=cmtjtp4kj000m4e0udv83dlmq` · `revision=32`

## 骨架

- **Day 1** 西山寺院与竹林：Hiiragiya Ryokan → 岚山 → 岚山 竹林小径 → 天龙寺 → 岚山猴子公园
- **Day 2** 东山至伏见：Hiiragiya Ryokan → Kiyomizu-dera Hondo (Main Hall) → 二年坂 → 三年坂 → Gion Nishikawa → Mount Inari
- **Day 3** 金阁寺与北山庭院：Hiiragiya Ryokan → Kinkaku-ji Temple → 龙安寺 → 鸟岩楼 → 京都御苑

## 逐站填充结果

### Hiiragiya Ryokan  · stay
- 时段：09:00 – 09:00
- 备注：origin_stop

### 岚山  · attraction
- 时段：10:07 – 11:37
- 到达：transit 约 67 分钟
- 起点直达：transit 约 67 分钟
- 备注：station_timing_adjusted

### 岚山 竹林小径  · attraction
- 时段：12:06 – 13:36
- 到达：walk 约 29 分钟
- 备注：station_timing_adjusted

### 天龙寺  · attraction
- 时段：13:40 – 15:10
- 到达：walk 约 4 分钟

### 岚山猴子公园  · attraction
- 时段：15:24 – 16:54
- 到达：walk 约 14 分钟
- 备注：station_timing_adjusted

### Hiiragiya Ryokan  · stay
- 时段：09:00 – 09:00
- 备注：origin_stop

### Kiyomizu-dera Hondo (Main Hall)  · attraction
- 时段：09:24 – 10:54
- 到达：transit 约 24 分钟
- 起点直达：transit 约 24 分钟
- 备注：station_timing_adjusted

### 二年坂  · attraction
- 时段：11:05 – 12:35
- 到达：walk 约 11 分钟
- 备注：station_timing_adjusted

### 三年坂  · attraction
- 时段：12:36 – 14:06
- 到达：walk 约 1 分钟

### Gion Nishikawa  · meal
- 时段：14:10 – 15:10
- 到达：walk 约 4 分钟

### Mount Inari  · attraction
- 时段：15:42 – 17:12
- 到达：transit 约 32 分钟
- 备注：station_timing_adjusted

### Hiiragiya Ryokan  · stay
- 时段：09:00 – 09:00
- 备注：origin_stop

### Kinkaku-ji Temple  · attraction
- 时段：09:39 – 11:09
- 到达：transit 约 39 分钟
- 起点直达：transit 约 39 分钟
- 备注：station_timing_adjusted

### 龙安寺  · attraction
- 时段：11:35 – 13:05
- 到达：walk 约 26 分钟
- 备注：station_timing_adjusted

### 鸟岩楼  · meal
- 时段：13:47 – 14:47
- 到达：walk 约 42 分钟
- 备注：station_timing_adjusted

### 京都御苑  · attraction
- 时段：15:17 – 16:47
- 到达：walk 约 30 分钟
- 备注：station_timing_adjusted
