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
| 1 | geocode | ✓  | 0.17 |
| 2 | discover_places | ✓ places=34, restaurants=23 | 4.13 |
| 3 | make_itinerary | ✓ next=display_current_stop | 7.25 |
| 4 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 5 | plan_next_stop | ✓ next=display_current_stop | 1.39 |
| 6 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 7 | plan_next_stop | ✓ next=display_current_stop | 0.79 |
| 8 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 9 | plan_next_stop | ✓ next=display_current_stop | 0.8 |
| 10 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 11 | plan_next_stop | ✓ next=display_current_stop | 0.74 |
| 12 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 13 | plan_next_stop | ✓ next=display_current_stop | 0.76 |
| 14 | display_current_stop | ✓ next=display_current_stop | 0.01 |
| 15 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 16 | plan_next_stop | ✓ next=display_current_stop | 0.88 |
| 17 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 18 | plan_next_stop | ✓ next=display_current_stop | 0.82 |
| 19 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 20 | plan_next_stop | ✓ next=display_current_stop | 0.84 |
| 21 | display_current_stop | ✓ next=display_current_stop | 0.01 |
| 22 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 23 | plan_next_stop | ✓ next=display_current_stop | 0.79 |
| 24 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 25 | plan_next_stop | ✓ next=display_current_stop | 1.2 |
| 26 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 27 | plan_next_stop | ✓ next=display_current_stop | 0.87 |
| 28 | display_current_stop | ✓ next=plan_next_stop | 0.07 |
| 29 | plan_next_stop | ✓ next=display_current_stop | 1.57 |
| 30 | display_current_stop | ✓ next=trip_complete | 0.02 |

## 结果：成功（trip_complete）

## 骨架

- **Day 1** 东山寺院与庭院：Hiiragiya Ryokan → 清水寺 → Kiyomizu-dera Hondo (Main Hall) → Okabeya → 二年坂 → 建仁寺
- **Day 2** 岚山：Hiiragiya Ryokan → 岚山 → 岚山 竹林小径 → 岚山猴子公园
- **Day 3** 北山与洛北寺院：Hiiragiya Ryokan → Kinkaku-ji Temple → 龙安寺 → 飲茶 柏三葉 西陣店 → 慈照寺

## 逐站填充结果

### Hiiragiya Ryokan  · stay
- 时段：09:00 – 09:00
- 备注：origin_stop

### 清水寺  · attraction
- 时段：09:24 – 10:54
- 到达：transit 约 24 分钟
- 起点直达：transit 约 24 分钟
- 备注：station_timing_adjusted

### Kiyomizu-dera Hondo (Main Hall)  · attraction
- 时段：10:59 – 12:29
- 到达：walk 约 5 分钟

### Okabeya  · meal
- 时段：12:35 – 13:35
- 到达：walk 约 6 分钟
- 备注：station_timing_adjusted

### 二年坂  · attraction
- 时段：13:40 – 15:10
- 到达：walk 约 5 分钟

### 建仁寺  · attraction
- 时段：15:22 – 16:52
- 到达：walk 约 12 分钟
- 备注：station_timing_adjusted

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

### 岚山猴子公园  · attraction
- 时段：13:54 – 15:24
- 到达：walk 约 18 分钟
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

### 飲茶 柏三葉 西陣店  · meal
- 时段：13:31 – 14:31
- 到达：transit 约 26 分钟
- 备注：station_timing_adjusted

### 慈照寺  · attraction
- 时段：15:09 – 16:39
- 到达：transit 约 38 分钟
- 备注：station_timing_adjusted
