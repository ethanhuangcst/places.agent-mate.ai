# E2E places-agent 30 城行程规划测试 · 索引

> 由 `scripts/e2e-places-agent.py` 生成。每个场景模拟一个用户按 8 行表单输入，调用 places-agent 完整工具链路（geocode → travel_tips → discover_places → make_itinerary → plan_next_stop 链 → trip_complete）。

## places-agent 完整工具链路

1. **geocode**（可选，有酒店时）— 解析住宿坐标作为 origin。
2. **travel_tips** — 记录 `iconic_places`（findIconicPlaces 展示源，ADR-045）。
3. **discover_places** — L1 候选池（景点 + 餐厅）+ inferred must-see + host_instructions。
4. **make_itinerary** — 生成多日停靠顺序骨架（无时间、无交通），返回首个 `next_tool_call`。
5. **plan_next_stop** 链 — 沿 `next_tool_call` 逐站填充（F65：无独立 `display_current_stop`），直到 `next_action == trip_complete`。

## 设计要点

- 30 个不同城市，天数 2–5 不等。
- 节奏：tight / medium / relaxed 混合；预算 1–3 混合。
- 酒店有时提供、有时省略（省略时跳过 geocode，origin 缺失）。
- 兴趣有时提供、有时省略。
- **必去点**：每个场景都触发「提示用户选择必去点」的 intake 步骤；模拟约 1/3 场景用户给出了必去（区域/一日游名，非 POI 目录），其余用户未选择，走目的地无关路径（ADR-042）。

## 结果汇总

| # | 城市 | 天数 | 节奏 | 预算 | 酒店 | 必去 | 结果 | 耗时(s) | 文件 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 里斯本 | 4 | relaxed | 3 | 有 | 贝伦区、辛特拉、卡斯凯什 | ✓ | 129.4 | [01-lisbon.md](01-lisbon.md) |

**通过 1/1**