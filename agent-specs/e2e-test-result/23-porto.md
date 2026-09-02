# E2E-23 波尔图（Porto）2天行程

> 本文件由 `scripts/e2e-places-agent.py` 自动生成，模拟用户调用 places-agent 工具链路得到的真实结果。

## 模拟用户输入（8 行表单）

| 字段 | 值 |
| --- | --- |
| 城市 | 波尔图（Porto） |
| 出发日期 | 2026-10-10 |
| 天数 | 2 |
| 酒店 | （未提供） |
| 节奏 | relaxed |
| 预算 | 1（节约） |
| 兴趣 | 酒庄、河边 |
| 必去 | （用户未选择，走目的地无关路径） |

## places-agent 工具链路

1. `geocode`（有酒店时）→ 2. `discover_places` → 3. `make_itinerary` → 4. `display_current_stop` / `plan_next_stop` 交替直到 `trip_complete`

## 工具调用记录

| # | 工具 | 结果 | 耗时(s) |
| --- | --- | --- | --- |
| 1 | geocode | ✓ skipped(no hotel) |  |
| 2 | discover_places | ✓ places=32, restaurants=32 | 2.74 |
| 3 | make_itinerary | ✓ next=display_current_stop | 2.93 |
| 4 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 5 | plan_next_stop | ✓ next=display_current_stop | 0.8 |
| 6 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 7 | plan_next_stop | ✓ next=display_current_stop | 0.75 |
| 8 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 9 | plan_next_stop | ✓ next=display_current_stop | 0.69 |
| 10 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 11 | plan_next_stop | ✓ next=display_current_stop | 0.81 |
| 12 | display_current_stop | ✓ next=display_current_stop | 0.01 |
| 13 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 14 | plan_next_stop | ✓ next=display_current_stop | 0.92 |
| 15 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 16 | plan_next_stop | ✓ next=display_current_stop | 0.68 |
| 17 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 18 | plan_next_stop | ✓ next=display_current_stop | 0.77 |
| 19 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 20 | plan_next_stop | ✓ next=display_current_stop | 0.83 |
| 21 | display_current_stop | ✓ next=trip_complete | 0.01 |

## 结果：成功（trip_complete）

**Trip Store:** `trip_id=cmtjtsy18000p4e0u5g7fxxnj` · `revision=21`

## 骨架

- **Day 1** 里贝拉河边与酒庄氛围：波尔图主教座堂 → 路易一世大桥 → Taberna Dos Mercadores → Ribeira do Porto → 证券交易所宫
- **Day 2** 市中心经典与花园博物馆：Chapel of Souls → Praça da Liberdade → Brasão Aliados → Clérigos Church → 塞拉维斯

## 逐站填充结果

### 波尔图主教座堂  · attraction
- 时段：09:00 – 10:30

### 路易一世大桥  · attraction
- 时段：10:36 – 12:06
- 到达：walk 约 6 分钟
- 备注：station_timing_adjusted

### Taberna Dos Mercadores  · meal
- 时段：12:13 – 13:13
- 到达：walk 约 7 分钟
- 备注：station_timing_adjusted

### Ribeira do Porto  · attraction
- 时段：13:23 – 14:53
- 到达：walk 约 10 分钟
- 备注：station_timing_adjusted

### 证券交易所宫  · attraction
- 时段：15:01 – 16:31
- 到达：walk 约 8 分钟
- 备注：station_timing_adjusted

### Chapel of Souls  · attraction
- 时段：09:00 – 10:30

### Praça da Liberdade  · attraction
- 时段：10:40 – 12:10
- 到达：walk 约 10 分钟
- 备注：station_timing_adjusted

### Brasão Aliados  · meal
- 时段：12:15 – 13:15
- 到达：walk 约 5 分钟

### Clérigos Church  · attraction
- 时段：13:22 – 14:52
- 到达：walk 约 7 分钟
- 备注：station_timing_adjusted

### 塞拉维斯  · attraction
- 时段：15:33 – 17:03
- 到达：transit 约 41 分钟
- 备注：station_timing_adjusted
