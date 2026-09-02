# E2E-16 马拉喀什（Marrakech）4天行程

> 本文件由 `scripts/e2e-places-agent.py` 自动生成，模拟用户调用 places-agent 工具链路得到的真实结果。

## 模拟用户输入（8 行表单）

| 字段 | 值 |
| --- | --- |
| 城市 | 马拉喀什（Marrakech） |
| 出发日期 | 2026-10-10 |
| 天数 | 4 |
| 酒店 | （未提供） |
| 节奏 | medium |
| 预算 | 1（节约） |
| 兴趣 | 市集、花园 |
| 必去 | （用户未选择，走目的地无关路径） |

## places-agent 工具链路

1. `geocode`（有酒店时）→ 2. `discover_places` → 3. `make_itinerary` → 4. `display_current_stop` / `plan_next_stop` 交替直到 `trip_complete`

## 工具调用记录

| # | 工具 | 结果 | 耗时(s) |
| --- | --- | --- | --- |
| 1 | geocode | ✓ skipped(no hotel) |  |
| 2 | discover_places | ✓ places=27, restaurants=39 | 2.13 |
| 3 | make_itinerary | ✓ next=display_current_stop | 4.43 |
| 4 | display_current_stop | ✓ next=plan_next_stop | 0.02 |
| 5 | plan_next_stop | ✓ next=display_current_stop | 1.2 |
| 6 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 7 | plan_next_stop | ✓ next=display_current_stop | 0.69 |
| 8 | display_current_stop | ✓ next=plan_next_stop | 0.02 |
| 9 | plan_next_stop | ✓ next=display_current_stop | 0.67 |
| 10 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 11 | plan_next_stop | ✓ next=display_current_stop | 0.83 |
| 12 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 13 | plan_next_stop | ✓ next=display_current_stop | 0.75 |
| 14 | display_current_stop | ✓ next=display_current_stop | 0.01 |
| 15 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 16 | plan_next_stop | ✓ next=display_current_stop | 0.85 |
| 17 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 18 | plan_next_stop | ✓ next=display_current_stop | 0.75 |
| 19 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 20 | plan_next_stop | ✓ next=display_current_stop | 0.69 |
| 21 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 22 | plan_next_stop | ✓ next=display_current_stop | 0.69 |
| 23 | display_current_stop | ✓ next=plan_next_stop | 0.02 |
| 24 | plan_next_stop | ✓ next=display_current_stop | 0.79 |
| 25 | display_current_stop | ✓ next=display_current_stop | 0.01 |
| 26 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 27 | plan_next_stop | ✓ next=display_current_stop | 0.96 |
| 28 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 29 | plan_next_stop | ✓ next=display_current_stop | 0.69 |
| 30 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 31 | plan_next_stop | ✓ next=display_current_stop | 0.7 |
| 32 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 33 | plan_next_stop | ✓ next=display_current_stop | 0.66 |
| 34 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 35 | plan_next_stop | ✓ next=display_current_stop | 0.73 |
| 36 | display_current_stop | ✓ next=display_current_stop | 0.01 |
| 37 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 38 | plan_next_stop | ✓ next=display_current_stop | 0.75 |
| 39 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 40 | plan_next_stop | ✓ next=display_current_stop | 0.68 |
| 41 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 42 | plan_next_stop | ✓ next=display_current_stop | 0.8 |
| 43 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 44 | plan_next_stop | ✓ next=display_current_stop | 0.7 |
| 45 | display_current_stop | ✓ next=plan_next_stop | 0.02 |
| 46 | plan_next_stop | ✓ next=display_current_stop | 0.66 |
| 47 | display_current_stop | ✓ next=trip_complete | 0.01 |

## 结果：成功（trip_complete）

**Trip Store:** `trip_id=cmtjtmzni000i4e0uq8wwfgep` · `revision=47`

## 骨架

- **Day 1** 老城露天广场与本约瑟夫片区：Jemaa el-Fnaa → Le Jardin Secret → Café des Épices → Madrasa Ben Youssef → 马拉喀什博物馆 → Le Jardin Restaurant Marrakech Medina
- **Day 2** 南部皇宫与卡斯巴片区：巴西亞王宮 → 巴迪皇宫 → BlackChich - African Berber Fusion → Bab Agnaou → 萨阿迪王朝陵墓 → Kasbah Andalussiya
- **Day 3** 马约尔花园与新城博物馆片区：Musée Berbère Jardin Majorelle → Yves Saint Laurent Museum → 19GRAMS Cafe → Musée Macma → Banksy Universe Marrakech → Beldi Fusion Kitchen Guéliz
- **Day 4** 库图比亚与花园慢游：Koutoubia Minaret → Park Lalla Hasana → Mandala Society - Koutoubia - Marrakech → Park Arsat Moulay Abdesalam → 梅纳拉花园 → Rooftop Garden

## 逐站填充结果

### Jemaa el-Fnaa  · attraction
- 时段：09:00 – 10:30

### Le Jardin Secret  · attraction
- 时段：10:38 – 12:08
- 到达：walk 约 8 分钟
- 备注：station_timing_adjusted

### Café des Épices  · meal
- 时段：12:14 – 13:14
- 到达：walk 约 6 分钟
- 备注：station_timing_adjusted

### Madrasa Ben Youssef  · attraction
- 时段：13:20 – 14:50
- 到达：walk 约 6 分钟
- 备注：station_timing_adjusted

### 马拉喀什博物馆  · attraction
- 时段：14:51 – 16:21
- 到达：walk 约 1 分钟

### Le Jardin Restaurant Marrakech Medina  · meal
- 时段：18:00 – 19:00
- 到达：walk 约 5 分钟

### 巴西亞王宮  · attraction
- 时段：09:00 – 10:30

### 巴迪皇宫  · attraction
- 时段：10:38 – 12:08
- 到达：walk 约 8 分钟
- 备注：station_timing_adjusted

### BlackChich - African Berber Fusion  · meal
- 时段：12:17 – 13:17
- 到达：walk 约 9 分钟
- 备注：station_timing_adjusted

### Bab Agnaou  · attraction
- 时段：13:33 – 15:03
- 到达：walk 约 16 分钟
- 备注：station_timing_adjusted

### 萨阿迪王朝陵墓  · attraction
- 时段：15:07 – 16:37
- 到达：walk 约 4 分钟

### Kasbah Andalussiya  · meal
- 时段：18:00 – 19:00
- 到达：walk 约 2 分钟

### Musée Berbère Jardin Majorelle  · attraction
- 时段：09:00 – 10:30

### Yves Saint Laurent Museum  · attraction
- 时段：10:31 – 12:01
- 到达：walk 约 1 分钟

### 19GRAMS Cafe  · meal
- 时段：12:19 – 13:19
- 到达：walk 约 18 分钟
- 备注：station_timing_adjusted

### Musée Macma  · attraction
- 时段：13:29 – 14:59
- 到达：walk 约 10 分钟
- 备注：station_timing_adjusted

### Banksy Universe Marrakech  · attraction
- 时段：15:40 – 17:10
- 到达：walk 约 41 分钟
- 备注：station_timing_adjusted

### Beldi Fusion Kitchen Guéliz  · meal
- 时段：18:00 – 19:00
- 到达：walk 约 39 分钟
- 备注：station_timing_adjusted

### Koutoubia Minaret  · attraction
- 时段：09:00 – 10:30

### Park Lalla Hasana  · attraction
- 时段：10:34 – 12:04
- 到达：walk 约 4 分钟

### Mandala Society - Koutoubia - Marrakech  · meal
- 时段：12:15 – 13:15
- 到达：walk 约 11 分钟
- 备注：station_timing_adjusted

### Park Arsat Moulay Abdesalam  · attraction
- 时段：13:24 – 14:54
- 到达：walk 约 9 分钟
- 备注：station_timing_adjusted

### 梅纳拉花园  · attraction
- 时段：15:49 – 17:19
- 到达：walk 约 55 分钟
- 备注：station_timing_adjusted

### Rooftop Garden  · meal
- 时段：18:09 – 19:09
- 到达：walk 约 50 分钟
- 备注：station_timing_adjusted
