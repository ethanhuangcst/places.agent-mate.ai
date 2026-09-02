# E2E-21 河内（Hanoi）2天行程

> 本文件由 `scripts/e2e-places-agent.py` 自动生成，模拟用户调用 places-agent 工具链路得到的真实结果。

## 模拟用户输入（8 行表单）

| 字段 | 值 |
| --- | --- |
| 城市 | 河内（Hanoi） |
| 出发日期 | 2026-10-10 |
| 天数 | 2 |
| 酒店 | （未提供） |
| 节奏 | tight |
| 预算 | 1（节约） |
| 兴趣 | 街头美食、老城 |
| 必去 | （用户未选择，走目的地无关路径） |

## places-agent 工具链路

1. `geocode`（有酒店时）→ 2. `discover_places` → 3. `make_itinerary` → 4. `display_current_stop` / `plan_next_stop` 交替直到 `trip_complete`

## 工具调用记录

| # | 工具 | 结果 | 耗时(s) |
| --- | --- | --- | --- |
| 1 | geocode | ✓ skipped(no hotel) |  |
| 2 | discover_places | ✓ places=32, restaurants=32 | 3.05 |
| 3 | make_itinerary | ✗  |  |

## 结果：失败

```
make_itinerary not ok: {'key': 'errors.make_itinerary_failed', 'locales': {'CN': '无法生成行程骨架。'}} make_itinerary: skeleton validation failed — LLM response is not valid JSON
```

**Trip Store:** `trip_id=cmtjtqy5t000n4e0u1qbmia78` · `revision=2`
