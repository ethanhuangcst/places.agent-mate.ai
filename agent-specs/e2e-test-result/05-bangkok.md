# E2E-05 曼谷（Bangkok）2天行程

> 本文件由 `scripts/e2e-places-agent.py` 自动生成，模拟用户调用 places-agent 工具链路得到的真实结果。

## 模拟用户输入（8 行表单）

| 字段 | 值 |
| --- | --- |
| 城市 | 曼谷（Bangkok） |
| 出发日期 | 2026-10-10 |
| 天数 | 2 |
| 酒店 | （未提供） |
| 节奏 | tight |
| 预算 | 1（节约） |
| 兴趣 | 街头美食、寺庙 |
| 必去 | （用户未选择，走目的地无关路径） |

## places-agent 工具链路

1. `geocode`（有酒店时）→ 2. `discover_places` → 3. `make_itinerary` → 4. `display_current_stop` / `plan_next_stop` 交替直到 `trip_complete`

## 工具调用记录

| # | 工具 | 结果 | 耗时(s) |
| --- | --- | --- | --- |
| 1 | geocode | ✓ skipped(no hotel) |  |
| 2 | discover_places | ✓ places=32, restaurants=32 | 1.24 |
| 3 | make_itinerary | ✓ next=display_current_stop | 14.84 |
| 4 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 5 | plan_next_stop | ✓ next=display_current_stop | 0.82 |
| 6 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 7 | plan_next_stop | ✓ next=display_current_stop | 0.64 |
| 8 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 9 | plan_next_stop | ✓ next=display_current_stop | 0.48 |
| 10 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 11 | plan_next_stop | ✓ next=display_current_stop | 0.46 |
| 12 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 13 | plan_next_stop | ✓ next=display_current_stop | 0.56 |
| 14 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 15 | plan_next_stop | ✓ next=display_current_stop | 0.71 |
| 16 | display_current_stop | ✓ next=display_current_stop | 0.01 |
| 17 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 18 | plan_next_stop | ✓ next=display_current_stop | 0.5 |
| 19 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 20 | plan_next_stop | ✓ next=display_current_stop | 0.51 |
| 21 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 22 | plan_next_stop | ✓ next=display_current_stop | 0.76 |
| 23 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 24 | plan_next_stop | ✓ next=display_current_stop | 0.6 |
| 25 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 26 | plan_next_stop | ✓ next=display_current_stop | 0.5 |
| 27 | display_current_stop | ✓ next=trip_complete | 0.01 |

## 结果：成功（trip_complete）

## 骨架

- **Day 1** 大皇宫与河畔寺庙：大皇宫 → 玉佛寺 → 国柱神庙 → Pad Thai Kratong Thong by ama → 卧佛寺 → 郑王庙 → Orin Coffee roaster & Specialty tea
- **Day 2** 老城寺庙与博物馆：Wat Suthat Thepwararam Ratchaworamahawihan → 大秋千 → 曼谷国家博物馆 → Olive Kitchen - Khaosan → 皇家田广场 → Long's thai soup restaurant

## 逐站填充结果

### 大皇宫  · attraction
- 时段：09:00 – 10:30

### 玉佛寺  · attraction
- 时段：10:33 – 12:03
- 到达：walk 约 3 分钟

### 国柱神庙  · attraction
- 时段：12:06 – 13:36
- 到达：walk 约 3 分钟

### Pad Thai Kratong Thong by ama  · meal
- 时段：13:49 – 14:49
- 到达：walk 约 13 分钟
- 备注：station_timing_adjusted

### 卧佛寺  · attraction
- 时段：14:53 – 16:23
- 到达：walk 约 4 分钟

### 郑王庙  · attraction
- 时段：16:33 – 18:03
- 到达：walk 约 10 分钟
- 备注：station_timing_adjusted

### Orin Coffee roaster & Specialty tea  · meal
- 时段：18:11 – 19:11
- 到达：walk 约 8 分钟
- 备注：station_timing_adjusted

### Wat Suthat Thepwararam Ratchaworamahawihan  · attraction
- 时段：09:00 – 10:30

### 大秋千  · attraction
- 时段：10:32 – 12:02
- 到达：walk 约 2 分钟

### 曼谷国家博物馆  · attraction
- 时段：12:25 – 13:55
- 到达：walk 约 23 分钟
- 备注：station_timing_adjusted

### Olive Kitchen - Khaosan  · meal
- 时段：14:05 – 15:05
- 到达：walk 约 10 分钟
- 备注：station_timing_adjusted

### 皇家田广场  · attraction
- 时段：15:19 – 16:49
- 到达：walk 约 14 分钟
- 备注：station_timing_adjusted

### Long's thai soup restaurant  · meal
- 时段：18:00 – 19:00
- 到达：walk 约 29 分钟
- 备注：station_timing_adjusted
