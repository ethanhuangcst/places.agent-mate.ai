# places-agent 性能与 MCP 路由调优方案

**Status:** Draft（v2.5 — L2 必须 LLM；§11-P0 Progressive **已实现**；agent Mode H Feature **35** **已交付**；2play Mode H + enrich **as-built**；ChatBox MCP **强制 agent** 见 [ADR-043](../../workspace-specs/adr/ADR-043-chatbox-mcp-and-cross-product-closure.md)）
**Scope:** `1.places-agent` 行程相关工具 + HTTP / MCP 双通道；where2play 初排/助手交叉引用  
**Related:** [ADR-032](../../workspace-specs/adr/ADR-032-llm-itinerary-mcp-tool-split.md)、[ADR-037](../../workspace-specs/adr/ADR-037-where2play-plan-l2-quanzil.md)、[ADR-038](../../workspace-specs/adr/ADR-038-discover-places-quality.md)、[agent-design §9.2](./agent-design.md)、[agent-stories MVP-8](./agent-stories.md)、where2play [2play-design §2.4](../../3.where2play/2play-specs/2play-design.md)、[itinerary-design.md](../../3.where2play/2play-specs/itinerary-design.md)（Progressive UI 交互真源）

**实现状态图例（对照 2026-08-23 代码）：**

| 标记 | 含义 |
| --- | --- |
| **已实现** | 主路径代码已落地，可测 |
| **部分** | 有一部分能力，或仅文案/软约束，未达本文目标形态 |
| **未实现** | 方案已写、代码未做 |
| **共识待做** | 探针后产品共识，尚未 merge 主路径 |

---

## 0. 决策前提（v2）

| 决策 | 内容 | 状态 |
| --- | --- | --- |
| **接受** | L2「形成行程」（选点、排序、hour-by-hour、理由）**必须由 LLM 推理**，不用内建代码逻辑替代。 | **已实现**（agent `arrange_day` / 2play OPENAI_CN arrange） |
| **拒绝** | 以 heuristic / skeleton 代码作为默认排程引擎（v1 草案作废）。 | **已实现**（产品路径无默认骨架排程） |
| **瓶颈共识** | 慢的不是 discover/search，而是 **工具链路里非流式、等完整结构化 JSON（常 30–45s/次）+ 叠跑/重试**。ChatBox 秒级主要来自 **对话流式上屏 + 未走 arrange 工具硬等**，不是「换了更快的模型厂商」。 | 观测共识（仍成立） |
| **模型事实（2026-08-22 澄清）** | **OPENAI_CN = gpt-5.4**。**ChatBox 与 places-agent 都走 OPENAI_CN**。**Cursor 用自带 LLM**。where2play **已接** OPENAI_CN（初排 L2 + 助手，ADR-036/037）。 | **已实现**（2play 已接；旧句「可接未接」作废） |

v2 目标：**保留 LLM 排程质量，把「在哪执行、是否流式、是否堵在 MCP 工具返回上」改对**，从而把等待压到可接受。

### 0.1 质量与路由共识（2026-08-22 西安/里斯本探针后）

证据：[discover-xian-ab-probe](../../workspace-specs/knowledge/agent/discover-xian-ab-probe.md)、[discover-lisbon-ab-probe](../../workspace-specs/knowledge/agent/discover-lisbon-ab-probe.md)。

| # | 共识 | 状态 |
| --- | --- | --- |
| Q1 | **L1 不接 LLM**；质量靠通用模板 / 过滤 / 去重 / 排序（ADR-038/042：无城市种子） | **已实现**（架构）；候选质量见 Q2 |
| Q2 | **主路径通用模板填池 + Google RELEVANCE**；must-see 由 **LLM 从候选池推断**（ADR-042/D9：删城市种子 CATALOG）；**不**以「LLM 写 search query」为主路径 | **已实现**（Feature 34；TC-M8-U34-01 / TC-E2E-12） |
| Q3 | L2 现 prompt 多为 Prefer；需 **硬必去**（行程级必去类必须出现）→ LLM 漏排 **硬失败重试一次** + **theme 门控 focus**（D9：删确定性注入） | **已实现**（Feature 36；`must-include-coverage.ts`） |
| Q4 | **真交通**（navigate / directions）进 2play L2 时间线 | **已实现**（Feature 37；`legs_to_here` + `transit_outcome`；2play 消费另故事） |
| Q5 | **不纳入**：search/discover 任意专名自动机翻（如 匹诺曹→Pinocchio） | 明确排除 |
| Q6 | MCP `POST /sse` session 失效 | **已实现**（Feature 38；`errors.mcp_session_invalid` + initialize 恢复） |

**建议落地顺序：** Q2 merge → Q3 硬必去 → Q4 交通 → Q6 MCP session（可并行）。

---


## 1. 问题与目标

### 1.1 问题

| 问题 | 状态（2026-08-22） |
| --- | --- |
| OPENAI_CN 结构化完成：单日常 30–45s；×N 天串行 | **仍成立**（L2 仍非流式等满 JSON） |
| MCP 叠跑 discover/arrange + plan | **部分**（MCP description 已劝阻；无服务端硬互斥） |
| 大包候选回灌；`date: null` | **部分**（slim + `date` nullish 已落地；调用方仍可能传肥包） |
| HTTP NDJSON `place` 仍在整日 LLM 结束后才发 | **部分**（2play：discover 候选可流式；**单日**仍等 `completeArrangeDay` 整段完成后再推 `place`）→ 完整改造见 **§11** |
| Plan「行程细节提示」仅为候选池统计 | **已实现** Progressive（§11-P0：`slot_preview` + preview_*） |
| ChatBox 体感快 vs agent arrange 慢 | **仍成立**（通道差，非模型差） |

### 1.2 目标 SLA（LLM 排程前提下）

| Caller | 可接受 | 理想 | 状态 |
| --- | --- | --- | --- |
| where2play HTTP | Discover 流式秒出；**首日首个 block &lt; 15–20s**（**BFF OPENAI_CN**）；三日结构 &lt; 60–90s | 首 block &lt; 10s | **部分**（L2 在 BFF；首 block 仍受整日 LLM 约束） |
| where2play **行程助手** | BFF **本应用 OPENAI_CN 流式**；小改秒级开写 | 禁助手默认 `plan_itinerary` | **已实现**（ADR-036） |
| ChatBox（OPENAI_CN）MCP | 返回当日 JSON（`start_time` + `legs_to_here`）；按天上屏 | discover → arrange **强制 agent**（ADR-043） | **已定** — MCP **不作** Mode H 默认 |
| Cursor MCP | 同上 | 结构化日结果 | **已定**（ADR-043） |

相对叠跑 ~8 min：互斥 + 单管道即可先砍一半以上。  
相对「干净但工具内非流式 ×3」：靠 **流式首字节 + Mode H 把生成挪到对话通道**，目标把「空等无字」从分钟级压到 **十几秒内有内容**。

### 1.3 非目标

- 不用代码排程冒充 LLM 质量。  
- 不靠删图片当主提速。  
- 不在 arrange 后再 `search_*` 补图。  
- **不**做任意搜索专名自动机翻（§0.1 Q5）。

---

## 2. 目标架构：仍是三层，L2 = LLM

```
L1 Discover（地图，无 LLM）
    → L2 Schedule（LLM 推理行程）—— 执行位置按通道拆分，见 §3
    → L3 Enrich（可选：真 directions、挂图 join、校验）
```

| Layer | 职责 | LLM？ | 状态 |
| --- | --- | --- | --- |
| **L1 Discover** | 候选景点+餐厅（+ weather）；slim；热门城 must-see seed + 过滤（ADR-038） | 否 | **已实现**（含 Feature **34** Arm A） |
| **L2 Schedule** | 按条件从候选推理 hour-by-hour | **是（硬性）** | **已实现**（2play BFF OPENAI_CN；agent `arrange_day` execution=agent 供 MCP；**Mode H** host 供宿主） |
| **L3 Enrich** | join 照片；可选 navigate；Zod/业务校验 | 校验否；算路否 | **部分**（agent Feature **37** `legs_to_here` **已有**；2play 时间线消费见 `plan-13`） |

**原则：排程推理留给 LLM；加速靠「流式交付 / 勿堵在 MCP 工具返回上 / 瘦 prompt / 禁叠跑」；2play 已直连同一 OPENAI_CN。**

### 2.1 为什么 ChatBox 快、Agent arrange 慢（同模型也可慢）

**重要：** ChatBox 与 places-agent **都用 OPENAI_CN = gpt-5.4**。秒级差 **不是**「ChatBox 换了更快的模型」。

| | ChatBox：search → 对话里写行程 | Agent：discover → `arrange_day` |
| --- | --- | --- |
| L1 | 地图，秒级 | 地图，秒级 |
| L2 模型 | **OPENAI_CN gpt-5.4**（ChatBox 宿主） | **同一 OPENAI_CN gpt-5.4**（agent 服务端调用） |
| 交付 | **对话 token 流式上屏** | **等完整结构化 JSON 后工具才返回** |
| 协议 | 聊天补全 | MCP/HTTP 工具 request-response |
| 校验 | 通常无硬 Zod | Zod；失败可能再等一轮 |
| 次数 | 常一轮流式写 | 易 ×N 天串行或再叠 plan |

额外等待 ≈ **非流式等满结构化输出 + 可能重试 + 叠跑**。  
**Cursor** 例外：宿主是 Cursor 自带 LLM；Mode H 时 L2 在 Cursor 侧执行（**Mode H 已实现**，Feature **35**）。

---

## 3. 双通道：L2 的两种执行方式（核心方案）

同一套 **拼装好的排程 prompt + slim 候选 + 用户条件**（预算、节奏、起终点、自然语言偏好、`exclude_names`、locale）。  
差别只在 **谁跑这个 prompt**。

### 3.1 Mode H — Host execution（HTTP / 显式）— Feature **35**；**ChatBox MCP 不作默认**（ADR-043）

行为（HTTP / 2play）：

1. `discover_places`（或已有候选）。  
2. `arrange_day` 且 `execution=host`：返回 `{ execution: "host", system_prompt, user_prompt, candidates_slim, output_contract }`（本请求不调 agent LLM）。  
3. **2play** 用本应用 OPENAI_CN 执行 prompt，再 `enrich_arrange_transit` 挂 `legs_to_here`。

**代码现实（2026-08-23 / ADR-043）：**

- **HTTP** 仍支持 `execution=host`（2play Mode H **as-built**）。  
- **MCP** **强制** `execution=agent`（忽略宿主传入的 `host`），返回带 `start_time` / `legs_to_here` 的当日 JSON + `next_action: present_day_then_stop`。  
- 禁止要求用户改 ChatBox system prompt。

### 3.2 Mode A — **2play BFF OPENAI_CN 初排（ADR-037）** + 助手（ADR-036） — **已实现**

**初排（as-built）：** where2play → agent `discover_places` → 每日 `arrange_day` `execution=host` → 2play OPENAI_CN → `enrich_arrange_transit` → NDJSON。默认**不**调 agent `execution=agent`。

**行程助手：** `POST /api/chat` → where2play BFF OPENAI_CN 流式。

`plan_itinerary` / agent `arrange_day`（MCP=强制 agent；HTTP 可 host）仍服务其他调用方。

### 3.3 条件如何传入（两通道统一） — **部分**

| 来源 | 条件 | 状态 |
| --- | --- | --- |
| 2play | 表单：budget / pace / origin / destination / bounds / locale / … | **已实现**（传入本地 arrange prompt；P1 改传 agent host） |
| MCP | 工具参数同上 | **已实现**（含 `execution=host`；与 HTTP 共用 `buildSchedulePrompt`） |

`buildSchedulePrompt(input)`：**已实现**于 agent；2play 仍有本地 `buildArrangeDayMessages`（字段对齐意图，**未**单一来源）→ `plan-11` 去掉 duplicate。

---

## 4. 延迟杠杆（在坚持 LLM 排程下）

| # | 杠杆 | 作用 | 状态 |
| --- | --- | --- | --- |
| 1 | **MCP 默认 Mode H** | 绕开 OPENAI_CN 工具等待 | **部分**（能力 **已实现**；默认仍 `execution=agent`，须显式 host） |
| 2 | **HTTP Mode A 真流式** | 首 block 不必等满日 | **部分**（按日完成后 staged；非生成中流式）→ **§11** |
| 3 | **路径互斥** | 禁止 discover/arrange 与 plan 叠跑 | **部分**（description 文案；无强制闸门） |
| 4 | **Slim 候选 + 短输出契约** | 少 token | **已实现**（agent slim；2play slice 16 + slim） |
| 5 | **同一 OPENAI_CN，优化用法** | 流式、短 contract | **部分**（2play 助手流式；arrange 仍等满 JSON） |
| 6 | **按日流式优先于一次多日巨型 JSON** | `exclude_names` 串行 | **已实现**（2play 按日 + exclude） |
| 7 | **校验失败才重试；超时不重试** | — | **已实现**（agent arrange） |
| 8 | 可选 `validate_itinerary` | Mode H 补结构 | **未实现** |

**代码骨架仅允许作为：** Mode A 超时后的 **显式 degraded 应急**；**不是**默认排程。

---

## 5. MCP description 与路由（v2）

### 5.1 互斥 — **ADR-043**

- **ChatBox MCP：** `discover_places` → `arrange_day`（强制 agent）→ 按天上屏。勿默认 `plan_itinerary`；勿传 `execution=host`。  
- **2play HTTP：** discover + Mode H host prompt + OPENAI_CN + `enrich_arrange_transit`。  
- **一站式整包：** `plan_itinerary` / `trip_plan` / `trips`。

### 5.2 建议文案要点 — **已按 ADR-043 落地**

Discover / arrange MCP description：**强制 agent**、按天上屏、`presented_previous_day`。  
HTTP Mode H handoff **保留**（Feature 35）。  
**禁止**运营强制 ChatBox system prompt prefer host。

### 5.3 ChatBox system prompt — **非验收前提**（ADR-040/043）

可选运维模板见 knowledge；产品路径不依赖用户改设定。

---

## 6. 分期落地

### P0 — 止损 — **大部分已实现**

| 项 | 状态 |
| --- | --- |
| 1. 路径互斥（description + operator prompt） | **部分**（description；operator prompt 非代码） |
| 2. `date` nullish；arrange 入参强制 slim | **已实现** |
| 3. 超时不二次 LLM；校验失败才重试一次 | **已实现** |
| 4. 指标：`execution=host|agent`、模型 id、TTFB | **部分**（host 路径可区分；完整 metrics 仍薄） |

### P1 — Mode H（MCP / HTTP） — **能力已实现**；默认与 2play 消费仍待

1. `buildSchedulePrompt` + handoff 载荷 — **已实现**（Feature **35**）。  
2. MCP **默认** `execution=host` — **未实现**（缺省仍 agent）。  
3. 可选 `validate_itinerary` — **未实现**。  
4. ChatBox 实测 prefer host — **运营配置待做**（§5.3）。  
5. `POST /sse` session — **已实现**（Feature **38**）。  
6. 2play 改拉 host（`plan-11`）— **未实现**。

### P2 — 2play L2 OPENAI_CN + 真流式（HTTP） — **大部分已实现**；Progressive UX 见 §11

| 项 | 状态 |
| --- | --- |
| 1. discover（agent）+ BFF OPENAI_CN arrange×N（ADR-037） | **已实现** |
| 2. 首 block 尽早上屏 | **部分**（日级完成后 staged；非 token 级）→ §11-P2 stream |
| 3. agent arrange / plan 保留给 MCP | **已实现**（含 Mode H） |
| 4. 排程 prompt 与 Mode H 字段对齐 | **部分**（agent 有 `buildSchedulePrompt`；2play 仍本地 duplicate → `plan-11`） |
| 5. Progressive 四段 UI + `slot_preview`/`slot` | **已实现**（§11-P0；规格 [itinerary-design](../../3.where2play/2play-specs/itinerary-design.md)） |
| 附加（ADR-038 P0） | 候选 16、theme/同区软规则、day_highlights 吃 theme — **已实现** |

### P3 — 质量与观测 — **agent 侧已交付；2play 消费部分待做**

| 项 | 状态 |
| --- | --- |
| Arm A merge：双源馆名种子、餐排策、默认 provider | **已实现**（Feature **34**） |
| L2 硬必去 | **已实现**（Feature **36**） |
| L3 directions 进 2play | **agent 已实现**（Feature **37**）；**2play 消费** `plan-13` **未做** |
| 城市缓存、叠跑告警、质量抽检 | **未实现** |

---

## 7. 预期收益（诚实口径）

| 路径 | 相对现状 | 状态 |
| --- | --- | --- |
| MCP ChatBox | 强制 agent + 按天上屏（ADR-043） | **已定** |
| HTTP Mode A 流式（2play OPENAI_CN） | 空等缩短；总完成仍可能数十秒/日 | **部分**兑现（按日推进；整日 LLM 仍堵）→ **§11** |
| 仅互斥 + slim | 去掉叠跑与大包 | **部分**兑现 |

**不会**在坚持「非流式等满结构化 JSON」时把总完成稳定压到纯秒级。秒感来自 **流式与少堵工具**。

---

## 8. ADR 建议

| # | 建议 | 状态 |
| --- | --- | --- |
| 1 | L2 必须 LLM；执行器分 Host vs Agent | **决策已采纳**；Host **已实现**（Feature **35**） |
| 2 | MCP 默认 Prompt Handoff（Host） | **未实现**（能力有；缺省仍 agent） |
| 3 | HTTP 默认 Agent/BFF 执行 + 流式 NDJSON | **部分**（2play BFF **已实现**；真流式粒度不足） |
| 4 | 一套 `buildSchedulePrompt`，禁止双管道叠跑 | **部分**（agent 单一模块 **已有**；2play 仍 duplicate → `plan-11`） |
| 5 | 执行器可为 OPENAI_CN；Cursor 自带；差别在通道 | **决策已澄清** |

（作废 v1「默认代码骨架排程」为产品主路径的表述。）

---

## 9. 文档与代码索引

| 项 | 路径 |
| --- | --- |
| MCP 注册 | `src/mcp/create-server.ts` |
| Discover / arrange / llm plan | `src/core/itinerary-planner.ts` |
| Discover 种子 / 去重 | `src/core/discover-must-see.ts`、`discover-dedupe.ts`、`place-filters.ts` |
| plan_itinerary 入口 | `src/core/itinerary.ts` |
| MCP/SSE 路由 | `server.ts`（`POST /sse` → Streamable：session 问题见 Q6） |
| where2play 编排 | `3.where2play/src/core/plan-day-by-day.ts`、`plan-arrange-llm.ts` |
| where2play Progressive 规格 | `3.where2play/2play-specs/itinerary-design.md`（交互真源）；本文件 **§11**（落地状态与分期） |
| where2play Plan UI | `3.where2play/src/ui/plan-page.tsx`、`plan-itinerary-view.tsx` |
| 探针 | `scripts/probe-xian-discover-ab.py`、`probe-lisbon-discover-ab.py` |

---

## 10. 修订记录

| 日期 | 说明 |
| --- | --- |
| 2026-08-22 | v1：三层 + 默认代码骨架（已否决为排程主路径） |
| 2026-08-22 | **v2：L2 必须 LLM；Mode H 宿主执行 + Mode A 流式 Agent 执行；更新 SLA/分期/MCP 文案** |
| 2026-08-22 | **澄清：OPENAI_CN=gpt-5.4；ChatBox 与 places-agent 同用 OPENAI_CN；Cursor 自带 LLM；秒级差在流式/通道** |
| 2026-08-22 | **采纳 ADR-036：2play 行程助手 = 本应用 OPENAI_CN** |
| 2026-08-22 | **采纳 ADR-037：2play 初排 L2 亦 = 本应用 OPENAI_CN；agent 仅 L1 discover** |
| 2026-08-22 | **v2.1：全文标注实现状态；§0.1 写入西安/里斯本探针质量共识（Arm A、硬必去、交通、排除专名机翻、MCP session）；更正 2play 已接 OPENAI_CN** |
| 2026-08-22 | **v2.2：新增 §11 where2play Progressive UX 完整方案（对照代码审查 + itinerary-design）；P2 增 Progressive 行** |
| 2026-08-22 | **v2.3：§11-P0 落地** — `expandArrangeDayToSlots`、staged `slot_preview`/`slot`、四段 UI、i18n、pending skeleton；状态表更新 |
| 2026-08-23 | **v2.4：MVP-8 Feature 34–38 Done** — Mode H / Arm A / 硬必去 / 真交通 DTO / MCP session 状态与 agent-stories 对齐；§11-P1 缺口改为 **2play 消费** |

---

## 11. where2play Progressive UX — 完整方案（v2.2）

**UI / 事件交互真源：** [itinerary-design.md](../../3.where2play/2play-specs/itinerary-design.md)（Accepted）。  
**本节职责：** 对照 **2026-08-23 代码现实**、列出 **2play 须改清单**、分期与验收；与 Mode H / Mode A 对齐，避免再误判「未接自家 LLM」。

### 11.1 架构事实（审查结论）

| 判断 | 结论 | 状态 |
| --- | --- | --- |
| L1 | BFF → places-agent `discover_places`（NDJSON 候选） | **已实现** |
| L2 LLM 谁跑 | **where2play BFF 本应用 OPENAI_CN**（`plan-arrange-llm.ts`），**不是** agent `arrange_day` execution=agent | **已实现**（ADR-037） |
| Mode H handoff | agent `execution=host` 返回 prompt → 2play 执行 | **agent 已实现**（Feature **35**）；**2play 未消费**（仍本地 `buildArrangeDayMessages`） |
| OPENAI_CN 调用形态 | `stream: false`，等满 **整日** JSON 再解析 | **已实现**（阻塞首 block；P0 后用 staged 掩盖） |
| 推送粒度 | 解析后 staged `slot_preview` → `slot`（兼发 `place` alias） | **已实现**（§11-P0；非 token 流式） |
| 行程日提示 | `phase` /「正在安排第 d/N 天」 | **已实现** → **保持** |
| 行程细节提示 | `slot_preview` + i18n preview_*；等待期 `arrange_planning_day` | **已实现**（§11-P0） |
| 下条加载中 | `.slot--pending` 同构 skeleton | **已实现**（§11-P0） |

```text
现状管线：
  UI → BFF → discover(agent) → BFF 自建 prompt → OPENAI_CN(等满日)
       → day_highlights + staged slot_preview/slot* → day_done → 下一天…

目标管线（§11-P1 prompt 源 + §11-P2 stream）：
  … → agent execution=host → OPENAI_CN（P0 等满日 / P2 流式）
       → day_highlights
       → (slot_preview → slot)*  一条一条
       → day_done → …
```

**明确不做（本方案）：** 默认改回 agent `arrange_day` execution=agent；用候选池统计作 arrange 主文案；token 级在 UI 展示 LLM 原文；专名自动机翻（§0.1 Q5）。

### 11.2 产品需求 ↔ 改动映射

| # | 需求 | 现状 | 目标改动 |
| --- | --- | --- | --- |
| 1 | 点「生成行程」后，**行程日提示**保持 | 已有 | **不改**行为；继续 `.plan-phase.is-busy` |
| 2 | **行程细节提示**按条说明正在生成什么 | 池摘要一句 | BFF 发 `slot_preview`；UI 按 kind 套 i18n |
| 2a | places | — | 「正在加入行程：{name}，入选原因：{reason}，预计游览时间：{window}」 |
| 2b | 交通 | — | 「正在安排下一段行程的交通：{label}，选择原因：{reason}，预计耗时：{duration}」 |
| 2c | 餐厅 | — | 「正在安排{午餐/下午茶/晚餐}，推荐：{name}，推荐原因：{reason}，预计用餐时间：{window}」 |
| 3 | 一次只加载一条行程；下条显示加载中 | 整日一次上屏 | `slot` 逐条；下条前 `.slot--pending` |

LLM 等待期（首个 `slot_preview` 前）：细节提示用「正在规划第 d/N 天…」（`arrange_planning_day`），**不再**以池统计为主文案。

### 11.3 NDJSON 事件契约（BFF → UI）

在 `plan-day-by-day.ts` 的 `PlanProgressEvent` 上扩展（保留 `place` 为 `slot` 的兼容 alias）。

| `type` | 何时 | UI |
| --- | --- | --- |
| `phase` | discovering / arranging | **行程日提示**（保持） |
| `candidate_place` / `discover_done` | L1 | Discover 同态；**不作** arrange 主文案 |
| `arrange_day_start` | 日开始 | Day tabs；细节提示进入「规划当日」 |
| `day_highlights` | theme 已知 | Highlights |
| **`slot_preview`** | **每条 slot 落地前** | **行程细节提示** |
| **`slot`**（`place` alias） | **每条落地** | **行程** +1 |
| `day_done` / `progress` | 日完成 | merge itinerary；可切下一 Day tab |
| `done` / `error` | 全程结束 / 失败 | 收壳 / i18n error |

**单日顺序：** `arrange_day_start` → `day_highlights` → (`slot_preview` → `slot`)\* → `day_done`。

**`slot_preview` payload：**

```ts
type SlotPreview = {
  kind: "place" | "transit" | "meal";
  name: string;
  reason: string;
  window: string; // "09:30–11:00" 或 "~15 min"
  mealLabel?: "lunch" | "afternoon_tea" | "dinner";
  transportLabel?: string;
};
```

### 11.4 BFF / L2 改造清单

| # | 项 | 说明 | 分期 | 状态 |
| --- | --- | --- | --- | --- |
| B1 | `expandArrangeDayToSlots(blocks, …)` | `itinerary-map` 统一：progressive `slot` 与 `day_done` 最终 slots **同一函数**，避免跳变 | P0 | **已实现** |
| B2 | 合成 transit 行 | 日首/日尾/站间（criteria.transport）；理由可含估时（P0 可不调 navigate） | P0 | **已实现**（估时站间；真 navigate 消费见 `plan-13` / Feature **37**） |
| B3 | 解析后 staged emit | 每对 `slot_preview`→`slot` 间 `sleep(~380ms)`（可 env）；`prefers-reduced-motion` 时 0 | P0 | **已实现**（`PLAN_SLOT_STAGE_MS`；测试为 0） |
| B4 | 废弃池摘要作主文案 | 可保留调试字段；默认不驱动 UI 主句 | P0 | **已实现** |
| B5 | OPENAI_CN `stream: true` + 增量 parse | 首 block 在整日 JSON 完成前即可 `slot_preview` | P2 | **未实现**（现 `stream: false`） |
| B6 | AbortSignal 110s → `errors.arrange_timeout` | 与 ADR-032 对齐（若未齐则补） | P0 | **已实现** |
| B7 | Prompt 来源改 Mode H | `POST` agent `execution=host`；去掉本地 duplicate prompt | P1 | **未实现**（**agent 已就绪**；2play `plan-11`） |
| B8 | 硬必去 / 真交通 | 质量共识 Q3 / Q4 | P3 | **agent 已实现**（36/37）；2play 时间线消费见 `plan-13` |

**P0 关键路径：** 仍 `stream: false` 等满日 JSON → 解析 → **staged** `slot_preview`/`slot`。体感从「整日刷屏」变为「一条一条」，**不必**先等 Mode H 或 token 流式。

### 11.5 UI 改造清单

| # | 项 | 说明 | 分期 | 状态 |
| --- | --- | --- | --- | --- |
| U1 | 行程日提示 | 保持 `.plan-phase.is-busy` + 钮 `.is-generating` | — | **已实现**（保持） |
| U2 | 行程细节提示 | state ← `slot_preview`；模板按 kind；class `.plan-slot-preview` | P0 | **已实现** |
| U3 | 行程列表 | `liveSlots` 每次 +1；`day_done` 前仅 live | P0 | **已实现** |
| U4 | 加载中提示 | `.slot--pending` **同构 skeleton**（非虚线框）；`plan-slot-pending` | P0 | **已实现** |
| U5 | i18n | 见 §11.6；禁硬编码用户可见句 | P0 | **已实现** |
| U6 | 切日 | `day_done` 后 focus 下一日；未排日 tab「排队」 | P0 | **部分** |
| U7 | reduced-motion | 无 delay / shimmer | P0 | **已实现**（CSS；BFF stage 由 env） |
| U8 | Mock SoT | `ui-mockup/06-plan-arrange.html` 等与实现同步 | P0 | **部分**（CSS 已同步） |

**视觉签名（Frontend Design，与 itinerary-design §7 一致）：** pending 与真实 `.slot` 同宽同构（时间列 shimmer + thumb + 两行骨架）；微光扫 `--glaze`；小字「下一站加载中」非主视觉。不增加 indeterminate 进度条。

### 11.6 i18n 键

| Key | 用途 |
| --- | --- |
| `play.plan.arrange_planning_day` | LLM 等待期细节提示 |
| `play.plan.preview_place` | 景点 |
| `play.plan.preview_transit` | 交通 |
| `play.plan.preview_meal` | 餐厅（含 `{meal}`） |
| `play.plan.meal_lunch` / `meal_afternoon_tea` / `meal_dinner` | 餐段 |
| `play.plan.next_stop_loading` | pending 小字（已有则保留） |

**Deprecated 作主文案：** `play.plan.arrange_pool_summary`（默认可隐藏；勿再驱动 arrange 主句）。  
Locale：CN / TW / HK / EN。

**餐段映射：** `lunch`→午餐；`dinner`→晚餐；`cafe` 或 lunch 且 start≥15:00→下午茶。

### 11.7 分期与验收

| 阶段 | 内容 | 验收 | 状态 |
| --- | --- | --- | --- |
| **§11-P0** | `expandArrangeDayToSlots` + staged `slot_preview`/`slot` + 四段 UI + pending skeleton + i18n | 细节提示随 kind 变；一次只多一条；无整日同 tick 刷屏；日提示不变 | **已实现** |
| **§11-P1** | BFF 改拉 agent `execution=host` prompt | Prompt 单一真源；UI 事件契约不变 | **未实现**（agent Feature **35** 已就绪；2play `plan-11`） |
| **§11-P2** | OPENAI_CN arrange `stream: true` + 增量 JSON parse | 首个 `slot_preview` 出现在整日 JSON 完成前；逼近 SLA 首 block &lt; 15–20s | **未实现** |

**建议实施顺序：** §11-P0 ✓ → **§11-P1（2play）** → §11-P2 → `plan-13` 真交通消费。

### 11.8 测试要求

| 层 | 内容 |
| --- | --- |
| BFF | mock OPENAI_CN → 断言 `slot_preview` 先于对应 `slot`；`expandArrangeDayToSlots` 含 transit |
| UI | preview 随 kind；一次只多一条；reduced-motion 无动画 |
| E2E | 生成行程：细节提示变化；pending 可见；日提示仍为「正在安排第 d/N 天」 |
| 契约 | **不得**断言 2play 默认调 agent `/v1/arrange_day` execution=agent |

### 11.9 实现文件索引（2play）

| 区域 | 路径 |
| --- | --- |
| BFF 编排 | `3.where2play/src/core/plan-day-by-day.ts` |
| L2 OPENAI_CN | `3.where2play/src/core/plan-arrange-llm.ts` |
| Slot 映射 | `3.where2play/src/core/itinerary-map.ts` |
| Plan UI | `3.where2play/src/ui/plan-page.tsx`、`plan-itinerary-view.tsx` |
| 样式 / mock | `3.where2play/app/mockup.css`、`2play-specs/ui-mockup/` |
| 规格 | `3.where2play/2play-specs/itinerary-design.md` |
| Agent Mode H（P1） | `1.places-agent`（本文件 §3.1） |

### 11.10 与 SLA / 杠杆对照

| 杠杆（§4） | §11 贡献 |
| --- | --- |
| #2 HTTP 真流式 | P0 staged 先兑现「有内容上屏」；P2 再压首 block 延迟 |
| #5 同一 OPENAI_CN 优化用法 | arrange 从「等满日再 dump」改为「按条揭示 / 后改流式」 |
| #6 按日优先 | **已实现**；§11 在日内再切细 |

相对「仅 Mode H」：2play **已在 BFF 跑 OPENAI_CN**；当前体感差主要来自 **非流式整日 JSON + 假 progressive UI**，§11-P0 即可单独改善，不阻塞 MCP Mode H。
