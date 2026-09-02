# E2E-14 杜布罗夫尼克（Dubrovnik）2天行程

> 本文件由 `scripts/e2e-places-agent.py` 自动生成，模拟用户调用 places-agent 工具链路得到的真实结果。

## 模拟用户输入（8 行表单）

| 字段 | 值 |
| --- | --- |
| 城市 | 杜布罗夫尼克（Dubrovnik） |
| 出发日期 | 2026-10-10 |
| 天数 | 2 |
| 酒店 | （未提供） |
| 节奏 | relaxed |
| 预算 | 3（宽松） |
| 兴趣 | 海边、老城 |
| 必去 | （用户未选择，走目的地无关路径） |

## places-agent 工具链路

1. `geocode`（有酒店时）→ 2. `discover_places` → 3. `make_itinerary` → 4. `display_current_stop` / `plan_next_stop` 交替直到 `trip_complete`

## 工具调用记录

| # | 工具 | 结果 | 耗时(s) |
| --- | --- | --- | --- |
| 1 | geocode | ✓ skipped(no hotel) |  |
| 2 | discover_places | ✓ places=32, restaurants=32 | 2.79 |
| 3 | make_itinerary | ✓ next=display_current_stop | 2.39 |
| 4 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 5 | plan_next_stop | ✓ next=display_current_stop | 0.79 |
| 6 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 7 | plan_next_stop | ✓ next=display_current_stop | 0.7 |
| 8 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 9 | plan_next_stop | ✓ next=display_current_stop | 0.69 |
| 10 | display_current_stop | ✓ next=plan_next_stop | 0.03 |
| 11 | plan_next_stop | ✓ next=display_current_stop | 0.68 |
| 12 | display_current_stop | ✓ next=display_current_stop | 0.01 |
| 13 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 14 | plan_next_stop | ✓ next=display_current_stop | 0.79 |
| 15 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 16 | plan_next_stop | ✓ next=display_current_stop | 0.64 |
| 17 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 18 | plan_next_stop | ✓ next=display_current_stop | 0.71 |
| 19 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 20 | plan_next_stop | ✓ next=display_current_stop | 0.69 |
| 21 | display_current_stop | ✓ next=trip_complete | 0.01 |

## 结果：成功（trip_complete）

**Trip Store:** `trip_id=cmtjtm9wy000g4e0uyicrhnab` · `revision=21`

## 骨架

- **Day 1** 老城经典与海港风景：Pile Gate → Onofrio's Large Fountain → Nautika → Walls of Dubrovnik → Old Port of Dubrovnik
- **Day 2** 高处海景与老城东侧：Bosanka viewpoint → Homeland War Museum → Restaurant Panorama → Ploce Gate → 罗维里耶纳克要塞

## 逐站填充结果

### Pile Gate  · attraction
- 时段：09:00 – 10:30

### Onofrio's Large Fountain  · attraction
- 时段：10:31 – 12:01
- 到达：walk 约 1 分钟

### Nautika  · meal
- 时段：12:05 – 13:05
- 到达：walk 约 4 分钟

### Walls of Dubrovnik  · attraction
- 时段：13:16 – 14:46
- 到达：walk 约 11 分钟
- 备注：station_timing_adjusted

### Old Port of Dubrovnik  · attraction
- 时段：14:47 – 16:17
- 到达：walk 约 1 分钟

### Bosanka viewpoint  · attraction
- 时段：09:00 – 10:30

### Homeland War Museum  · attraction
- 时段：10:51 – 12:21
- 到达：walk 约 21 分钟
- 备注：station_timing_adjusted

### Restaurant Panorama  · meal
- 时段：12:23 – 13:23
- 到达：walk 约 2 分钟

### Ploce Gate  · attraction
- 时段：14:07 – 15:37
- 到达：walk 约 44 分钟
- 备注：station_timing_adjusted

### 罗维里耶纳克要塞  · attraction
- 时段：15:50 – 17:20
- 到达：walk 约 13 分钟
- 备注：station_timing_adjusted
