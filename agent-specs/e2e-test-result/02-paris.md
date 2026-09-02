# E2E-02 巴黎（Paris）3天行程

> 本文件由 `scripts/e2e-places-agent.py` 自动生成，模拟用户调用 places-agent 工具链路得到的真实结果。

## 模拟用户输入（8 行表单）

| 字段 | 值 |
| --- | --- |
| 城市 | 巴黎（Paris） |
| 出发日期 | 2026-10-10 |
| 天数 | 3 |
| 酒店 | Hotel du Louvre |
| 节奏 | medium |
| 预算 | 3（宽松） |
| 兴趣 | 艺术、建筑、美食 |
| 必去 | 凡尔赛 |

## places-agent 工具链路

1. `geocode`（有酒店时）→ 2. `discover_places` → 3. `make_itinerary` → 4. `display_current_stop` / `plan_next_stop` 交替直到 `trip_complete`

## 工具调用记录

| # | 工具 | 结果 | 耗时(s) |
| --- | --- | --- | --- |
| 1 | geocode | ✓  | 0.24 |
| 2 | discover_places | ✓ places=34, restaurants=17 | 4.14 |
| 3 | make_itinerary | ✗  |  |

## 结果：失败

```
make_itinerary not ok: {'key': 'errors.make_itinerary_failed', 'locales': {'CN': '无法生成行程骨架。'}} make_itinerary: LLM timed out after 90000ms
```

**Trip Store:** `trip_id=cmtjtcoei00044e0ubgmchfnq` · `revision=2`
