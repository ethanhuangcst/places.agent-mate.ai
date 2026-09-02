# E2E-03 东京（Tokyo）5天行程

> 本文件由 `scripts/e2e-places-agent.py` 自动生成，模拟用户调用 places-agent 工具链路得到的真实结果。

## 模拟用户输入（8 行表单）

| 字段 | 值 |
| --- | --- |
| 城市 | 东京（Tokyo） |
| 出发日期 | 2026-10-10 |
| 天数 | 5 |
| 酒店 | （未提供） |
| 节奏 | medium |
| 预算 | 1（节约） |
| 兴趣 | （未提供） |
| 必去 | （用户未选择，走目的地无关路径） |

## places-agent 工具链路

1. `geocode`（有酒店时）→ 2. `discover_places` → 3. `make_itinerary` → 4. `display_current_stop` / `plan_next_stop` 交替直到 `trip_complete`

## 工具调用记录

| # | 工具 | 结果 | 耗时(s) |
| --- | --- | --- | --- |
| 1 | geocode | ✓ skipped(no hotel) |  |
| 2 | discover_places | ✓ places=36, restaurants=21 | 1.31 |
| 3 | make_itinerary | ✗  |  |

## 结果：失败

```
make_itinerary not ok: {'key': 'errors.make_itinerary_failed', 'locales': {'CN': '无法生成行程骨架。'}} make_itinerary: LLM timed out after 90000ms
```
