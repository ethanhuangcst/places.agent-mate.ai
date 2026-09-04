# 直连 agent vs 2play UI：里斯本 4 日骨架对比

**日期：** 2026-09-03  
**脚本：** `3.where2play/e2e/e2e_lisbon_direct_make.py`  
**原始 JSON：** [_last-direct-lisbon-make.json](./_last-direct-lisbon-make.json)  
**UI 对照：** [make-itinerary-issue.md](./make-itinerary-issue.md)

---

## 架构问答

### `plan-skeleton-only.ts` 是不是 2play 的代码？

是。路径：`3.where2play/src/core/plan-skeleton-only.ts`。这是 where2play **BFF**，在 `app/api/plan/route.ts` 里当 `criteria.planMode === "skeleton"` 时走这条生成器。它自己**不调聊天模型生成骨架**，只调 places-agent：`geocode` → `fetch_trip_details(candidates)` → `make_itinerary` → `fetch_trip_details(skeleton|…)`。

默认 `PLAN_PIPELINE` 不是 `legacy` 时，计划页还会走 `plan-skeleton-fill.ts`。骨架同样来自 agent `make_itinerary`；**同样会先对酒店名单独 geocode，再把 lat/lng 塞进 make。**

### 2play 到底有没有用 places-agent 规划行程？

**当前骨架主路径：有。** 停点顺序由 agent `make_itinerary`（agent 侧 Qwen）生成，展示真源按 ADR-046 再 `fetch_trip_details`。

**不是「2play 用自己的 LLM 画骨架」。** 2play 没有在 `plan-skeleton-only` 里组 skeleton JSON。

**和 ADR-001「2play 不具备 LLM」不完全一致的残留：**

| 模块 | 现状 |
| --- | --- |
| `plan-skeleton-only` / `plan-skeleton-fill` 的 **make** | 正确：HTTP → agent |
| `plan-arrange-llm.ts` + `plan-day-by-day.ts` | **遗留 L2**：BFF 仍可本地 `resolveChatLlmConfig` 排日；`PLAN_PIPELINE=legacy` 时走这条 |
| `chat-assistant.ts` | 助手改行程仍可走 BFF 聊天 LLM |

约束「2play 自己不具备 LLM」= 产品规划应只打 agent。骨架路径已按这个走；BFF 里还留着 arrange/chat 的 LLM 客户端，属于规格债，不是这次 UI 全住宿的原因。

### 调用方式对不对？为何和直连不一致？

主链路（make + fetch）是对的。不一致来自 **make 之前多出来的一步**：2play 用酒店名、中文 locale、AMAP 优先做 **geocode**，把错误坐标写进 `origin.lat/lng`。直连若只传 `origin.name`、不传坐标，agent 用城市做 80km 锚点，骨架正常。

---

## 同条件：里斯本 4 天，酒店 Hills Hotel Lisboa

| 路径 | origin 传给 make | 候选池 | HTTP | 骨架 |
| --- | --- | --- | --- | --- |
| 2play UI E2E | 名称 + **22.186785, 113.549525** | 40 / 37（里斯本） | make **200** | **4 天全 stay** |
| 直连 A：仅酒店名 | `{ name }`，无经纬度 | discover 城市原点，40 / 37 | make **200**，17.5s | **每天 stay + 4 个景点 + lunch**（正常） |
| 直连 B：带上 geocode 坐标 | 与 UI 相同 lat/lng | 另一次 discover 40 景点 | make **200**，7.2s | **4 天全 stay**（与 UI 同类） |

直连 geocode（酒店名、locale CN、AMAP+Google）：**同样** `22.186785, 113.549525`。

直连 A 第 1 天停点示例：Hills Hotel Lisboa → 圣若热城堡 → 卡尔莫修道院 → 午餐 → 主教座堂 → 罗马剧场博物馆。第 4 天辛特拉主题（佩纳宫等）。这就是「不经过 UI、直连 agent」应有的骨架密度。

直连 B / UI：主题文案仍像贝伦/阿尔法玛，但 `stops` 只剩酒店。`skeletonIsFillable` 在 UI 会失败；直连只看 HTTP 则仍是 200。

---

## 结论

1. 2play **没有**用自己的 LLM 生成这次骨架；错骨架是 **agent `make_itinerary` 在错误 origin 坐标下的合法输出**。  
2. 直连 **不传酒店坐标** 时，同一城市同一酒店名，结果与「好的」直连 E2E 一致（多日多景点）。  
3. 直连 **传入 2play 那种 geocode 结果** 时，与 UI 失败形态一致。  
4. 架构上应删掉「BFF 先 geocode 酒店再当过滤锚点」；origin 只传名字，或 geocode 必须带目的地城市。agent 侧 80km 锚点应绑城市，不应绑未校验的酒店坐标。BFF 残留 LLM 模块另开故事，不阻塞这条修复。
