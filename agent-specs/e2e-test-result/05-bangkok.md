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
| 2 | discover_places | ✓ places=32, restaurants=32 | 2.68 |
| 3 | make_itinerary | ✓ next=display_current_stop | 6.41 |
| 4 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 5 | plan_next_stop | ✓ next=display_current_stop | 1.07 |
| 6 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 7 | plan_next_stop | ✓ next=display_current_stop | 0.69 |
| 8 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 9 | plan_next_stop | ✓ next=display_current_stop | 0.64 |
| 10 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 11 | plan_next_stop | ✓ next=display_current_stop | 0.76 |
| 12 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 13 | plan_next_stop | ✓ next=display_current_stop | 0.76 |
| 14 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 15 | plan_next_stop | ✓ next=display_current_stop | 0.66 |
| 16 | display_current_stop | ✓ next=display_current_stop | 0.01 |
| 17 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 18 | plan_next_stop | ✓ next=display_current_stop | 0.85 |
| 19 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 20 | plan_next_stop | ✓ next=display_current_stop | 0.67 |
| 21 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 22 | plan_next_stop | ✓ next=display_current_stop | 0.68 |
| 23 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 24 | plan_next_stop | ✓ next=display_current_stop | 0.71 |
| 25 | display_current_stop | ✓ next=plan_next_stop | 0.03 |
| 26 | plan_next_stop | ✓ next=display_current_stop | 0.62 |
| 27 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 28 | plan_next_stop | ✓ next=display_current_stop | 0.75 |
| 29 | display_current_stop | ✓ next=plan_next_stop | 0.02 |
| 30 | plan_next_stop | ✓ next=display_current_stop | 0.76 |
| 31 | display_current_stop | ✓ next=trip_complete | 0.01 |

## 结果：成功（trip_complete）

**Trip Store:** `trip_id=cmtjthn0000074e0u5c72q2tg` · `revision=31`

## 骨架

- **Day 1** 老城区寺庙与大皇宫：玉佛寺 → 大皇宫 → Pad Thai Kratong Thong by ama → 卧佛寺 → 郑王庙 → Wat Arun Viewing Point → Orin Coffee roaster & Specialty tea
- **Day 2** 拉达那哥欣寺庙与唐人街周边：曼谷国家博物馆 → 皇家田广场 → MaeThum Padthai → 国柱神庙 → Wat Suthat Thepwararam Ratchaworamahawihan → 大秋千 → 金佛寺 → Irvin Thai Kitchen 1976

## 逐站填充结果

### 玉佛寺  · attraction
- 时段：09:00 – 10:30

### 大皇宫  · attraction
- 时段：10:34 – 12:04
- 到达：walk 约 4 分钟

### Pad Thai Kratong Thong by ama  · meal
- 时段：12:13 – 13:13
- 到达：walk 约 9 分钟
- 备注：station_timing_adjusted

### 卧佛寺  · attraction
- 时段：13:17 – 14:47
- 到达：walk 约 4 分钟

### 郑王庙  · attraction
- 时段：14:57 – 16:27
- 到达：walk 约 10 分钟
- 备注：station_timing_adjusted

### Wat Arun Viewing Point  · attraction
- 时段：16:36 – 18:06
- 到达：walk 约 9 分钟
- 备注：station_timing_adjusted

### Orin Coffee roaster & Specialty tea  · meal
- 时段：18:07 – 19:07
- 到达：walk 约 1 分钟

### 曼谷国家博物馆  · attraction
- 时段：09:00 – 10:30

### 皇家田广场  · attraction
- 时段：10:34 – 12:04
- 到达：walk 约 4 分钟

### MaeThum Padthai  · meal
- 时段：12:24 – 13:24
- 到达：walk 约 20 分钟
- 备注：station_timing_adjusted

### 国柱神庙  · attraction
- 时段：13:39 – 15:09
- 到达：walk 约 15 分钟
- 备注：station_timing_adjusted

### Wat Suthat Thepwararam Ratchaworamahawihan  · attraction
- 时段：15:23 – 16:53
- 到达：walk 约 14 分钟
- 备注：station_timing_adjusted

### 大秋千  · attraction
- 时段：16:55 – 18:25
- 到达：walk 约 2 分钟

### 金佛寺  · attraction
- 时段：18:59 – 20:29
- 到达：walk 约 34 分钟
- 备注：station_timing_adjusted

### Irvin Thai Kitchen 1976  · meal
- 时段：20:42 – 21:42
- 到达：walk 约 13 分钟
- 备注：station_timing_adjusted
