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
| 2 | discover_places | ✓ places=27, restaurants=40 | 6.34 |
| 3 | make_itinerary | ✓ next=display_current_stop | 10.21 |
| 4 | display_current_stop | ✓ next=plan_next_stop | 0.02 |
| 5 | plan_next_stop | ✓ next=display_current_stop | 1.1 |
| 6 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 7 | plan_next_stop | ✓ next=display_current_stop | 0.63 |
| 8 | display_current_stop | ✓ next=plan_next_stop | 0.02 |
| 9 | plan_next_stop | ✓ next=display_current_stop | 0.67 |
| 10 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 11 | plan_next_stop | ✓ next=display_current_stop | 0.68 |
| 12 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 13 | plan_next_stop | ✓ next=display_current_stop | 0.68 |
| 14 | display_current_stop | ✓ next=display_current_stop | 0.01 |
| 15 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 16 | plan_next_stop | ✓ next=display_current_stop | 0.84 |
| 17 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 18 | plan_next_stop | ✓ next=display_current_stop | 0.69 |
| 19 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 20 | plan_next_stop | ✓ next=display_current_stop | 0.61 |
| 21 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 22 | plan_next_stop | ✓ next=display_current_stop | 0.65 |
| 23 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 24 | plan_next_stop | ✓ next=display_current_stop | 0.71 |
| 25 | display_current_stop | ✓ next=display_current_stop | 0.01 |
| 26 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 27 | plan_next_stop | ✓ next=display_current_stop | 0.8 |
| 28 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 29 | plan_next_stop | ✓ next=display_current_stop | 0.68 |
| 30 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 31 | plan_next_stop | ✓ next=display_current_stop | 0.78 |
| 32 | display_current_stop | ✓ next=plan_next_stop | 0.02 |
| 33 | plan_next_stop | ✓ next=display_current_stop | 0.63 |
| 34 | display_current_stop | ✓ next=plan_next_stop | 0.02 |
| 35 | plan_next_stop | ✓ next=display_current_stop | 0.65 |
| 36 | display_current_stop | ✓ next=display_current_stop | 0.01 |
| 37 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 38 | plan_next_stop | ✓ next=display_current_stop | 0.75 |
| 39 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 40 | plan_next_stop | ✓ next=display_current_stop | 0.68 |
| 41 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 42 | plan_next_stop | ✓ next=display_current_stop | 0.69 |
| 43 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 44 | plan_next_stop | ✓ next=display_current_stop | 0.71 |
| 45 | display_current_stop | ✓ next=plan_next_stop | 0.01 |
| 46 | plan_next_stop | ✓ next=display_current_stop | 0.7 |
| 47 | display_current_stop | ✓ next=trip_complete | 0.02 |

## 结果：成功（trip_complete）

## 骨架

- **Day 1** 老城露天市场与本约瑟夫片区：Jemaa el-Fnaa → Le Jardin Secret → Café des Épices → Madrasa Ben Youssef → 马拉喀什博物馆 → Chez Omar
- **Day 2** 达尔巴查与麦地那北侧：Dar El Bacha Museum → Banksy Universe Marrakech → Le Mart → Art De Cuivre Travel → Almoravid Koubba → Ksar Essaoussan
- **Day 3** 南部古迹与卡斯巴：巴西亞王宮 → 巴迪皇宫 → Mazel | Street Food Restaurant Marrakech → Bab Agnaou → 萨阿迪王朝陵墓 → Kasbah Andalussiya
- **Day 4** 花园与新城：Musée Berbère Jardin Majorelle → Yves Saint Laurent Museum → 19GRAMS Cafe → 梅纳拉花园 → Musée Macma → Beldi Fusion Kitchen Guéliz

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

### Chez Omar  · meal
- 时段：18:00 – 19:00
- 到达：walk 约 10 分钟
- 备注：station_timing_adjusted

### Dar El Bacha Museum  · attraction
- 时段：09:00 – 10:30

### Banksy Universe Marrakech  · attraction
- 时段：10:47 – 12:17
- 到达：walk 约 17 分钟
- 备注：station_timing_adjusted

### Le Mart  · meal
- 时段：12:31 – 13:31
- 到达：walk 约 14 分钟
- 备注：station_timing_adjusted

### Art De Cuivre Travel  · attraction
- 时段：13:39 – 15:09
- 到达：walk 约 8 分钟
- 备注：station_timing_adjusted

### Almoravid Koubba  · attraction
- 时段：15:20 – 16:50
- 到达：walk 约 11 分钟
- 备注：station_timing_adjusted

### Ksar Essaoussan  · meal
- 时段：18:00 – 19:00
- 到达：walk 约 11 分钟
- 备注：station_timing_adjusted

### 巴西亞王宮  · attraction
- 时段：09:00 – 10:30

### 巴迪皇宫  · attraction
- 时段：10:38 – 12:08
- 到达：walk 约 8 分钟
- 备注：station_timing_adjusted

### Mazel | Street Food Restaurant Marrakech  · meal
- 时段：12:10 – 13:10
- 到达：walk 约 2 分钟

### Bab Agnaou  · attraction
- 时段：13:20 – 14:50
- 到达：walk 约 10 分钟
- 备注：station_timing_adjusted

### 萨阿迪王朝陵墓  · attraction
- 时段：14:54 – 16:24
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

### 梅纳拉花园  · attraction
- 时段：14:11 – 15:41
- 到达：walk 约 52 分钟
- 备注：station_timing_adjusted

### Musée Macma  · attraction
- 时段：16:30 – 18:00
- 到达：walk 约 49 分钟
- 备注：station_timing_adjusted

### Beldi Fusion Kitchen Guéliz  · meal
- 时段：18:02 – 19:02
- 到达：walk 约 2 分钟
