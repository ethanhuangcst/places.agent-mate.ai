---
title: QLP — AMAP needs Chinese attraction queries
type: ops-lesson
status: active
as_of: 2026-08-21
tags:
  - places-agent
  - QLP
  - discover_places
  - AMAP
related_spec: agent-specs/agent-design.md
related:
  - adr/ADR-030-geocode-first-region-detection.md
  - adr/ADR-032-llm-itinerary-mcp-tool-split.md
---

# QLP — AMAP needs Chinese attraction queries

## Summary

where2play Harbin 3-day plans showed **restaurants only**. `discover_places` composed a hardcoded English attractions phrase (`attractions landmarks museums parks`). AMAP returned **0** places; Chinese `景点` returned many. Restaurants still appeared because English `restaurant` sometimes hits AMAP.

## Fix

Itinerary-composed search (`discover_places`, LLM Phase1, timed auto-search) uses [`query-assembler.ts`](../src/core/query-assembler.ts) **QLP** (agent-design §5.2.3):

- AMAP jobs → Simplified Chinese catalog keywords
- Google jobs → EN (+ UI locale if ≠ EN)
- Split dual `providers[]` into separate jobs

**Out of scope:** rewriting caller `query` on public `search_restaurants` / `search_places`.

## Check

- `GET /v1/health` lists `discover_places`
- Harbin discover: `candidates.places.length >= 1`
- EN UI + Harbin still gets places (QLP-A on AMAP)
