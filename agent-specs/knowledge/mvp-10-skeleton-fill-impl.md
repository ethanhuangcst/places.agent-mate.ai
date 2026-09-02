---
title: MVP-10 骨架与填充工具族实现笔记
type: ops-lesson
status: active
as_of: 2026-09-01
tags:
  - mvp-10
  - skeleton
  - transit
  - nextjs
related_spec: 1.places-agent/agent-specs/agent-design.md §18
related:
  - ../../../../workspace-specs/adr/ADR-040-plan-itinerary-align-split-tools.md
  - ../performance.md §12
---

# MVP-10 骨架与填充工具族实现笔记

## Summary

实现 F43 `make_itinerary`、F44 `plan_next_stop` + `display_current_stop`、F45 部分（删 `navigate`）、F47（MCP 注册 + 宿主指令）时记录的两个可复用要点：骨架校验中起点 stay 的跨日重用豁免，以及删除 Next.js route 后必须清理 `.next-e2e/` 避免陈旧类型阻断 `tsc`。

## Evidence

- `src/core/make-itinerary.ts` `validateSkeleton`：起点酒店（`kind: "stay"`）作为每日首站合法重复出现，但跨日唯一性规则最初把它判为「reused」。修复为 `stayNames` 集合豁免——只有非 stay 场馆需要跨日唯一。
- 删除 `app/v1/navigate/route.ts` 后 `npx tsc --noEmit` 报 `Cannot find module '../../../app/v1/navigate/route.js'`，来源是 gitignored 的 `.next-e2e/dev/types/validator.ts`（Next.js e2e 构建产物，`e2e/run.py` 用 `NEXT_DIST_DIR=.next-e2e` 生成）。`rm -rf .next-e2e` 后 typecheck 恢复干净。

## Lesson / guidance

- **骨架校验**：跨日唯一性约束只针对真实场馆（attraction / meal）；每日起点 stay（酒店）应允许跨日重复。任何「跨日唯一」类校验都要显式排除 stay kind，否则合法多日行程会被误拒。
- **删 Next.js route**：删除 `app/v1/<tool>/route.ts` 后，若项目有 e2e 构建产物目录（`.next-e2e/` 或 `.next/`），需一并清理，否则其中生成的 `validator.ts` 仍引用已删模块，`tsc --noEmit` 会假性失败。CI 中 e2e 构建会重新生成，本地则需手动 `rm -rf`。
- **复用而非复制**：`make_itinerary` 的 LLM 重试模式直接复用 `itinerary-planner` 的 `callItineraryLlmWithValidationRetry` 思路（内联实现，因 skeleton 的 timeout/temperature 不同）；`plan_next_stop` 直接复用 `buildLegs`，不重写 directions 串行逻辑。新工具族应优先复用既有核心函数。

## Links

- ADR-040（plan_itinerary 对齐拆分工具——MVP-10 架构真源）
- `performance.md` §12（轻骨架 + 增量无 LLM 填充方案）
- `agent-design.md` §18（工具族设计）
