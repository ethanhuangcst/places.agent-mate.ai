# 行程框架 UI 失败 — E2E 证据

**日期：** 2026-09-03  
**应用：** where2play `http://127.0.0.1:3030/assistant`  
**Agent：** `http://127.0.0.1:3010`  
**截图：** [make-itinerary-issue.png](./make-itinerary-issue.png)  
**原始抓包：** [_last-ui-e2e.json](./_last-ui-e2e.json)、[_last-bff-make-capture.json](./_last-bff-make-capture.json)、[_last-agent-make-capture.json](./_last-agent-make-capture.json)

**直连对比（同城同酒店）：** [lisbon-direct-vs-ui.md](./lisbon-direct-vs-ui.md)

本次运行**不支持**先前仅凭日志得出的结论——即 UI 报错等于 `POST /v1/make_itinerary` **502**。本次 E2E 中，make 返回 **200**，Postgres 写入了骨架，`fetch_trip_details` 也返回该骨架，随后 BFF 判定该骨架**不能给 UI 使用**并拒绝。

---

## 1. UI 步骤（真实浏览器）

| 字段 | 取值 |
| --- | --- |
| 目的地 | 里斯本 |
| 天数 | 4 |
| 预算 | 中等 |
| 酒店 | Hills Hotel Lisboa |
| 节奏 / 交通 / POI 来源 | 默认（轻松、捷运+步行、按目的地推荐） |

**可见结果（7.4s）：** 助手错误文案 — 行程框架生成失败，请稍后重试。

---

## 2. `make_itinerary` 结果（接口执行成功）

**判定：HTTP 执行成功，不是 502。** Agent 日志：`POST /v1/make_itinerary 200 in 7.1s`。双写把 `revision` 从 4 写到 5。

**入（BFF → agent，摘要）：**

- `trip_id`: `cmtl6bppe00004ei2lbzmuytv`
- `locale`: `zh-CN`
- `constraints.city`: 里斯本，`numDays`: 4，`origin.name`: Hills Hotel Lisboa（请求里没有经纬度；agent 侧编码后写入 22.186785 / 113.549525）
- `transport`: metro_walk，`pace`: relaxed，`budget`: mid
- `must_include`: `[]`（默认「按目的地推荐」）
- `providers`: **AMAP** 与 **GOOGLE_MAPS**（中国 locale / region）
- 进入 make 前候选池：40 景点、37 餐厅（里斯本坐标）

**出（agent HTTP / dualWrite）：**

| 字段 | 取值 |
| --- | --- |
| HTTP | **200**，耗时 **7.1s** |
| `ok` | true |
| `trip_id` | `cmtl6bppe00004ei2lbzmuytv` |
| `expectedRevision` → 写入 `revision` | 4 → **5** |
| `skeleton` | 4 天，每天仅酒店 `stay`（见下方 JSON） |
| 响应里的 `candidates_slim` | `places: []`，`restaurants: []`（空 overlay，**不覆盖**库里已有候选） |

返回的骨架 JSON（与 dualWrite.patch.skeleton 相同）：

```json
{
  "days": [
    {
      "day_index": 1,
      "date": "2024-06-01",
      "day_theme": "阿尔法玛老城漫步",
      "stops": [{ "name": "Hills Hotel Lisboa", "kind": "stay" }]
    },
    {
      "day_index": 2,
      "date": "2024-06-02",
      "day_theme": "贝伦文化地标",
      "stops": [{ "name": "Hills Hotel Lisboa", "kind": "stay" }]
    },
    {
      "day_index": 3,
      "date": "2024-06-03",
      "day_theme": "希亚多与商业广场",
      "stops": [{ "name": "Hills Hotel Lisboa", "kind": "stay" }]
    },
    {
      "day_index": 4,
      "date": "2024-06-04",
      "day_theme": "城市全景与现代 Lisbon",
      "stops": [{ "name": "Hills Hotel Lisboa", "kind": "stay" }]
    }
  ]
}
```

完整抓包：`_last-agent-make-capture.json`。

---

## 3. 库中数据（`places_agent."Trip"`）

查询（本地 Postgres `:5435`，表 `"Trip"`）：

```sql
SELECT id, revision, "updatedAt", skeleton, candidates, constraints
FROM "Trip"
WHERE id = 'cmtl6bppe00004ei2lbzmuytv';
```

**行级实测（make 完成后，与 HTTP 双写一致）：**

| 列 | 库中值 |
| --- | --- |
| `id` | `cmtl6bppe00004ei2lbzmuytv` |
| `revision` | **5** |
| `updatedAt` | `2026-09-03T06:58:45.941` |
| `constraints.city` | 里斯本 |
| `constraints.numDays` | 4 |
| `constraints.origin` | 见下方 JSON（坐标错误：澳门/珠海，不是里斯本） |
| `skeleton` | 见下方 JSON（与 make 返回相同，4 天全 `stay`） |
| `candidates.places` | **40** 条（里斯本 lat/lng，未被这次 make 清空） |
| `candidates.restaurants` | **37** 条 |

`constraints.origin`（库中）：

```json
{
  "name": "Hills Hotel Lisboa",
  "lat": 22.186785,
  "lng": 113.549525
}
```

`skeleton`（库中，与第 2 节返回体相同）：

```json
{
  "days": [
    {
      "date": "2024-06-01",
      "stops": [{ "kind": "stay", "name": "Hills Hotel Lisboa" }],
      "day_index": 1,
      "day_theme": "阿尔法玛老城漫步"
    },
    {
      "date": "2024-06-02",
      "stops": [{ "kind": "stay", "name": "Hills Hotel Lisboa" }],
      "day_index": 2,
      "day_theme": "贝伦文化地标"
    },
    {
      "date": "2024-06-03",
      "stops": [{ "kind": "stay", "name": "Hills Hotel Lisboa" }],
      "day_index": 3,
      "day_theme": "希亚多与商业广场"
    },
    {
      "date": "2024-06-04",
      "stops": [{ "kind": "stay", "name": "Hills Hotel Lisboa" }],
      "day_index": 4,
      "day_theme": "城市全景与现代 Lisbon"
    }
  ]
}
```

`candidates.places` 抽样（库中仍是里斯本坐标，与错误 origin 不一致）：

```json
[
  {
    "name": "Street Sculpture",
    "location": { "crs": "WGS84", "lat": 38.7345936, "lng": -9.1371328 },
    "provider": "GOOGLE_MAPS"
  },
  {
    "name": "Our Lady of the Mount Viewpoint",
    "location": { "crs": "WGS84", "lat": 38.7192091, "lng": -9.1327772 },
    "provider": "GOOGLE_MAPS"
  },
  {
    "name": "罗卡角",
    "location": { "crs": "WGS84", "lat": 38.7804282, "lng": -9.4989171 },
    "provider": "GOOGLE_MAPS"
  }
]
```

起点坐标**不是里斯本**，落在**澳门 / 珠海**一带（约 22.2°N, 113.5°E）。库里景点约 38.7°N, 9.1°W。

**含义：** `filterCardsNearAnchor(..., origin, 80km)` 把这家酒店当作地理锚点。里斯本候选卡距离超过 80 km，在进 LLM 之前被丢掉。过滤后景点列表可能不足 3 条，于是 `validateSkeleton` **允许**全住宿日。Make 仍返回 200，上述骨架与 origin **已写入库**。

make 响应里 `candidates_slim` 为空，符合「overlay 为空则不 patch candidates」；库中 40/37 保留。

---

## 4. `fetch_trip_details`

BFF 请求切片 `skeleton|candidates|constraints`。

| 字段 | 取值 |
| --- | --- |
| HTTP | 200 |
| `trip_id` / `revision` | `cmtl6bppe00004ei2lbzmuytv` / 5 |
| `skeleton` | 与 PG 相同的 4 天全住宿骨架 |
| `candidates` | 40 景点、37 餐厅 |
| `constraints.origin` | 同上，澳门一带经纬度 |

Fetch 与 Postgres 一致。持久化不是 UI 失败原因。

---

## 5. 解析 / UI 闸门

BFF `skeletonIsFillable(days)` 要求**每一天**至少有一个 `kind !== "stay"` 的停点。

本骨架：4 天 × 仅住宿 → **不可填充**。

| 检查 | 结果 |
| --- | --- |
| `asSkeletonDays` | 4 |
| `skeletonIsFillable` | **false** |
| UI 错误 key | `errors.make_itinerary_failed` |
| UI 文案 | 行程框架生成失败，请稍后重试 |

用户看到的是**通用的 make 失败**文案，无法区分 HTTP 502、超时、空骨架，或「骨架已入库但是全住宿」。

---

## 6. 本次 E2E 结论

1. **Make 成功**（HTTP 200，revision 5，骨架已在 PG）。  
2. **Fetch 成功**，返回该骨架以及完整候选池。  
3. **UI 失败**是因为 BFF 把全住宿日当作不可用（`skeletonIsFillable`）。  
4. **全住宿内容的根因：** 酒店地理编码没有目的地约束（`zh-CN` 下优先 AMAP），把 Hills Hotel Lisboa 标到了**粤港澳大湾区**，地理过滤再把里斯本候选池对 LLM 清空。

先前 17 秒 UI 失败且 `make_itinerary 502` 仍可能发生（LLM / 校验）。本次 E2E 证明还有**第二条、对用户同样可见的路径**：make 200 + fetch 200 + **解析拒绝**。

---

## 7. 架构说明（取舍）

**地理编码 vs 目的地**

- **A.** 按城市/国家编码酒店（或起点相对目的地过远则拒绝）。能修这类问题；多一次编码或距离检查。  
- **B.** 起点与目的地不一致时，不用起点做 80 km 过滤。候选池更完整；地图上酒店位置仍可能错。  
- **C.** 非中国城市 + 拉丁文酒店名时，即使 locale 是 `zh-CN` 也优先 Google（或目的地区域供应商）。按 locale 强制 AMAP 优先，不适合里斯本住宿。

**仅住宿 vs HTTP 200**

- **A.** 过滤后池子再小，`validateSkeleton` 也拒绝全住宿 → make 502，UI 文案相同，但含义是「生成失败」。  
- **B.** 继续 200；BFF 已经把它藏掉。用户看不出 make 其实成功了。  
- **C.** 拆开错误（起点/地理不一致 vs LLM 失败）。运维更清楚；要更多文案 key。

**UI 错误映射**

现在一个 i18n key 同时覆盖 agent 502、BFF 超时、以及 fillable-false。拆 key 后下次 E2E 一眼能看懂。

**值得写 ADR（此处未立）：** 起点地理编码必须约束在行程目的地；locale 不得强制对欧洲酒店名走 AMAP。与目的地无关的地理策略（ADR-042）一致：修 **供应商 / 锚点**，不要加里斯本酒店表。

**不值得写 ADR：** `e2e-test-results/` 下的抓包 JSON（仅调试）。
