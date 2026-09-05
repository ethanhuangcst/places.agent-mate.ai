# Sign-off — Hangzhou 3d + Lisbon 3d (MVP-22 / 19-P3)

**Date:** 2026-09-04  
**Scope:** `discover_places` → `make_itinerary` → `fetch_trip_details` `{fields:["skeleton","candidates"]}`. No `plan_next_stop` / fill. No CATALOG growth.  
**Probe script:** [`_signoff-probe.mjs`](./_signoff-probe.mjs) against `http://127.0.0.1:3010` with 2play `PLACES_AGENT_CALLER_KEY_LOCAL`.

## AC table

| ID | Result | Evidence |
| --- | --- | --- |
| TC-M22-SIGN-HZ | **Pass** | Discover 37 places (1.7s); make HTTP 200 / 13.2s; each of 3 days has 4 attractions; meals `lunch`/`dinner`; no stop named 西湖十景 / …名胜区. `must_include: ["西湖十景"]` did not 502. |
| TC-M22-SIGN-LX | **Pass** | Origin Hills Hotel Lisboa + **Macau** coords (22.19, 113.55). Discover **42** places (not emptied). Make 200 / 15.7s; fetch pool 40; each day ≥3 attractions; meal slot ids. |
| TC-M22-SIGN-UI | **Pass** | Unit: `3.where2play/tests/plan-fetch-trip.test.ts`. Live: [`e2e_signoff_skeleton.py`](../../../3.where2play/e2e/e2e_signoff_skeleton.py) → `plan-thread-skeleton` in 13.7s; screenshot [`signoff-lisbon-3d-ui.png`](./signoff-lisbon-3d-ui.png). Meal copy via catalog (`午餐`). Stay-only / stay+meal-only is not fillable. |

## Hangzhou skeleton (fetch)

| Day | Theme | Attractions | Meals |
| --- | --- | --- | --- |
| 1 | 西湖核心东线 | 集贤亭, 断桥残雪, 苏堤, 花港观鱼 | lunch, dinner |
| 2 | 西湖西线与灵隐文化圈 | 雷峰塔, 灵隐寺, 飞来峰造像, 法云古村 | lunch, dinner |
| 3 | 西湖北线与人文山园 | 宝石山, 保俶塔, 杭州植物园, 黄龙吐翠 | lunch, dinner |

## Lisbon skeleton (fetch; far-origin coords dropped)

| Day | Theme | Attractions | Meals |
| --- | --- | --- | --- |
| 1 | 阿尔法玛与历史中心经典线 | 圣若热城堡, 卡尔莫修道院, 里斯本主教座堂, 罗马剧场博物馆 | lunch, dinner |
| 2 | 贝伦文化区与特茹河岸 | 贝伦塔, 热罗尼莫斯修道院, 发现者纪念碑, Cais das Colunas | lunch, dinner |
| 3 | 西海岸壮景日：罗卡角一日游 | 罗卡角, Our Lady of the Mount Viewpoint, Street Sculpture | lunch, dinner |

## Failures seen before the city-anchor discover fix

First probe (hotel/origin used as discover 80km clip): Hangzhou `AMAP+GOOGLE` and Lisbon `CN` + Macau coords → **0** places; make 200 stay+meal-only. Same failure class as [make-itinerary-issue.md](./make-itinerary-issue.md). Fix: geocode **city** for the clip; `dropFarOriginCoords` (ADR-048). Restart `tsx` after core change.

## Out of scope (not claimed)

- Fill / F41 Story 4 beyond skeleton
- 18-P2 chip CSS
- Duplicate “午餐” line in skeleton preview (parked)
