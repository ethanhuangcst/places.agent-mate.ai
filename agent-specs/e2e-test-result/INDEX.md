# E2E places-agent 30 城行程规划测试 · 索引

> 由 `scripts/e2e-places-agent.py` 生成。每个场景模拟一个用户按 8 行表单输入，调用 places-agent 完整工具链路（geocode → discover_places → make_itinerary → display_current_stop / plan_next_stop 链 → trip_complete）。

## places-agent 完整工具链路

1. **geocode**（可选，有酒店时）— 解析住宿坐标作为 origin。
2. **discover_places** — L1 候选池（景点 + 餐厅）+ inferred must-see + host_instructions。
3. **make_itinerary** — 生成多日停靠顺序骨架（无时间、无交通），返回首个 `next_tool_call`。
4. **display_current_stop** / **plan_next_stop** 交替 — 沿 `next_tool_call` 链逐站填充卡片、交通、时段，直到 `next_action == trip_complete`。

## 设计要点

- 30 个不同城市，天数 2–5 不等。
- 节奏：tight / medium / relaxed 混合；预算 1–3 混合。
- 酒店有时提供、有时省略（省略时跳过 geocode，origin 缺失）。
- 兴趣有时提供、有时省略。
- **必去点**：每个场景都触发「提示用户选择必去点」的 intake 步骤；模拟约 1/3 场景用户给出了必去（区域/一日游名，非 POI 目录），其余用户未选择，走目的地无关路径（ADR-042）。

## 结果汇总

| # | 城市 | 天数 | 节奏 | 预算 | 酒店 | 必去 | 结果 | 耗时(s) | 文件 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 里斯本 | 4 | relaxed | 3 | 有 | 贝伦区、辛特拉、卡斯凯什 | ✓ | 58.8 | [01-lisbon.md](01-lisbon.md) |
| 2 | 巴黎 | 3 | medium | 3 | 有 | 凡尔赛 | ✗ | 104.3 | [02-paris.md](02-paris.md) |
| 3 | 东京 | 5 | medium | 1 | 无 | — | ✗ | 105.6 | [03-tokyo.md](03-tokyo.md) |
| 4 | 罗马 | 3 | relaxed | 3 | 有 | 梵蒂冈 | ✓ | 23.2 | [04-rome.md](04-rome.md) |
| 5 | 曼谷 | 2 | tight | 1 | 无 | — | ✓ | 18.9 | [05-bangkok.md](05-bangkok.md) |
| 6 | 巴塞罗那 | 4 | medium | 3 | 有 | 蒙特塞拉特 | ✓ | 30.0 | [06-barcelona.md](06-barcelona.md) |
| 7 | 纽约 | 3 | tight | 3 | 有 | — | ✓ | 25.8 | [07-new-york.md](07-new-york.md) |
| 8 | 伊斯坦布尔 | 3 | medium | 1 | 无 | — | ✓ | 20.8 | [08-istanbul.md](08-istanbul.md) |
| 9 | 新加坡 | 2 | medium | 3 | 无 | 圣淘沙 | ✓ | 27.7 | [09-singapore.md](09-singapore.md) |
| 10 | 首尔 | 4 | medium | 2 | 有 | — | ✓ | 38.0 | [10-seoul.md](10-seoul.md) |
| 11 | 布拉格 | 2 | relaxed | 1 | 无 | — | ✓ | 10.6 | [11-prague.md](11-prague.md) |
| 12 | 维也纳 | 3 | medium | 3 | 有 | — | ✓ | 22.2 | [12-vienna.md](12-vienna.md) |
| 13 | 阿姆斯特丹 | 3 | tight | 2 | 无 | — | ✓ | 22.2 | [13-amsterdam.md](13-amsterdam.md) |
| 14 | 杜布罗夫尼克 | 2 | relaxed | 3 | 无 | — | ✓ | 11.0 | [14-dubrovnik.md](14-dubrovnik.md) |
| 15 | 爱丁堡 | 3 | medium | 2 | 有 | — | ✓ | 23.0 | [15-edinburgh.md](15-edinburgh.md) |
| 16 | 马拉喀什 | 4 | medium | 1 | 无 | — | ✓ | 22.1 | [16-marrakech.md](16-marrakech.md) |
| 17 | 开普敦 | 5 | relaxed | 3 | 有 | — | ✓ | 25.8 | [17-cape-town.md](17-cape-town.md) |
| 18 | 墨西哥城 | 3 | medium | 1 | 无 | — | ✓ | 21.7 | [18-mexico-city.md](18-mexico-city.md) |
| 19 | 布宜诺斯艾利斯 | 4 | medium | 2 | 无 | — | ✓ | 24.9 | [19-buenos-aires.md](19-buenos-aires.md) |
| 20 | 京都 | 3 | relaxed | 3 | 有 | 岚山 | ✓ | 89.2 | [20-kyoto.md](20-kyoto.md) |
| 21 | 河内 | 2 | tight | 1 | 无 | — | ✗ | 67.9 | [21-hanoi.md](21-hanoi.md) |
| 22 | 雅典 | 3 | medium | 2 | 有 | — | ✓ | 25.6 | [22-athens.md](22-athens.md) |
| 23 | 波尔图 | 2 | relaxed | 1 | 无 | — | ✓ | 12.1 | [23-porto.md](23-porto.md) |
| 24 | 苏黎世 | 3 | medium | 3 | 有 | — | ✓ | 21.6 | [24-zurich.md](24-zurich.md) |
| 25 | 哥本哈根 | 3 | medium | 2 | 无 | — | ✓ | 17.7 | [25-copenhagen.md](25-copenhagen.md) |
| 26 | 雷克雅未克 | 4 | relaxed | 3 | 有 | 金圈 | ✓ | 18.7 | [26-reykjavik.md](26-reykjavik.md) |
| 27 | 吉隆坡 | 2 | medium | 1 | 无 | — | ✓ | 14.3 | [27-kuala-lumpur.md](27-kuala-lumpur.md) |
| 28 | 特拉维夫 | 3 | medium | 3 | 无 | — | ✓ | 20.7 | [28-tel-aviv.md](28-tel-aviv.md) |
| 29 | 清迈 | 4 | relaxed | 1 | 无 | — | ✓ | 20.0 | [29-chiang-mai.md](29-chiang-mai.md) |
| 30 | 上海 | 3 | tight | 3 | 有 | — | ✓ | 39.9 | [30-shanghai.md](30-shanghai.md) |

**通过 27/30**