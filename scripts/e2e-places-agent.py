#!/usr/bin/env python3
"""
E2E harness: simulate 30 city itinerary-planning calls against places-agent.

Drives the FULL places-agent tool chain (the same chain the host LLM must
follow) over HTTP /v1 for each scenario:

  1. geocode            (only when a hotel/origin name is given)
  2. discover_places    — L1 candidate pool + inferred must-see
  3. make_itinerary     — stop-order skeleton + first next_tool_call
  4. display_current_stop → plan_next_stop → display_current_stop → …
                         — follow the concrete next_tool_call chain until trip_complete

Each scenario simulates a different user: days 2-5, pace tight/medium/relaxed,
spend 1-3, hotel sometimes given / sometimes omitted, interests sometimes
given, and must_include sometimes provided / sometimes left empty (the
"prompt for must-see, but user declines" case). must_include tokens are area /
day-trip style names (user input), not a per-city POI catalog — ADR-042 compliant.

Output: agent-specs/e2e-test-result/<id>-<city>.md per scenario + INDEX.md

Usage:
  python3 scripts/e2e-places-agent.py --only 1
  python3 scripts/e2e-places-agent.py --limit 3
  python3 scripts/e2e-places-agent.py
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import date, timedelta
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "agent-specs" / "e2e-test-result"
BASE = os.environ.get("PLACES_AGENT_BASE", "http://localhost:3010")
CALLER_KEY = os.environ.get("PLACES_AGENT_CALLER_KEY", "")
PROVIDERS = ["GOOGLE_MAPS", "AMAP", "TRIPADVISOR"]

# 30 scenarios. must_include = simulated user's answer to the must-see prompt;
# empty list = user declined (destination-agnostic path).
SCENARIOS: list[dict[str, Any]] = [
    {"id": 1,  "city": "Lisbon",        "city_cn": "里斯本",       "days": 4, "pace": "relaxed", "spend": 3, "hotel": "Hills Hotel Lisboa",    "interests": "历史建筑、海边风景、美食",   "must_include": ["贝伦区", "辛特拉", "卡斯凯什"]},
    {"id": 2,  "city": "Paris",         "city_cn": "巴黎",         "days": 3, "pace": "medium",  "spend": 3, "hotel": "Hotel du Louvre",           "interests": "艺术、建筑、美食",             "must_include": ["凡尔赛"]},
    {"id": 3,  "city": "Tokyo",         "city_cn": "东京",         "days": 5, "pace": "medium",  "spend": 1, "hotel": None,                      "interests": None,                        "must_include": []},
    {"id": 4,  "city": "Rome",          "city_cn": "罗马",         "days": 3, "pace": "relaxed", "spend": 3, "hotel": "Hotel Vilon",               "interests": "古罗马遗迹、教堂",           "must_include": ["梵蒂冈"]},
    {"id": 5,  "city": "Bangkok",       "city_cn": "曼谷",         "days": 2, "pace": "tight",   "spend": 1, "hotel": None,                      "interests": "街头美食、寺庙",             "must_include": []},
    {"id": 6,  "city": "Barcelona",     "city_cn": "巴塞罗那",     "days": 4, "pace": "medium",  "spend": 3, "hotel": "Hotel 1898",               "interests": "建筑、海边",                 "must_include": ["蒙特塞拉特"]},
    {"id": 7,  "city": "New York",      "city_cn": "纽约",         "days": 3, "pace": "tight",   "spend": 3, "hotel": "The New Yorker Hotel",     "interests": "博物馆、音乐剧、购物",         "must_include": []},
    {"id": 8,  "city": "Istanbul",      "city_cn": "伊斯坦布尔",   "days": 3, "pace": "medium",  "spend": 1, "hotel": None,                      "interests": "清真寺、市集",               "must_include": []},
    {"id": 9,  "city": "Singapore",     "city_cn": "新加坡",       "days": 2, "pace": "medium",  "spend": 3, "hotel": None,                      "interests": "亲子、美食",                 "must_include": ["圣淘沙"]},
    {"id": 10, "city": "Seoul",         "city_cn": "首尔",         "days": 4, "pace": "medium",  "spend": 2, "hotel": "Hotel28 Myeongdong",       "interests": None,                        "must_include": []},
    {"id": 11, "city": "Prague",        "city_cn": "布拉格",       "days": 2, "pace": "relaxed", "spend": 1, "hotel": None,                      "interests": "老城、啤酒",                 "must_include": []},
    {"id": 12, "city": "Vienna",        "city_cn": "维也纳",       "days": 3, "pace": "medium",  "spend": 3, "hotel": "Hotel Sacher",              "interests": "古典音乐、宫殿",             "must_include": []},
    {"id": 13, "city": "Amsterdam",     "city_cn": "阿姆斯特丹",   "days": 3, "pace": "tight",   "spend": 2, "hotel": None,                      "interests": "博物馆、运河",                 "must_include": []},
    {"id": 14, "city": "Dubrovnik",     "city_cn": "杜布罗夫尼克", "days": 2, "pace": "relaxed", "spend": 3, "hotel": None,                      "interests": "海边、老城",                 "must_include": []},
    {"id": 15, "city": "Edinburgh",     "city_cn": "爱丁堡",       "days": 3, "pace": "medium",  "spend": 2, "hotel": "The Balmoral",             "interests": "城堡、文学",                 "must_include": []},
    {"id": 16, "city": "Marrakech",     "city_cn": "马拉喀什",     "days": 4, "pace": "medium",  "spend": 1, "hotel": None,                      "interests": "市集、花园",                 "must_include": []},
    {"id": 17, "city": "Cape Town",     "city_cn": "开普敦",       "days": 5, "pace": "relaxed", "spend": 3, "hotel": "The Silo Hotel",           "interests": "自然、海边、酒庄",           "must_include": []},
    {"id": 18, "city": "Mexico City",   "city_cn": "墨西哥城",     "days": 3, "pace": "medium",  "spend": 1, "hotel": None,                      "interests": "博物馆、美食",                 "must_include": []},
    {"id": 19, "city": "Buenos Aires",  "city_cn": "布宜诺斯艾利斯","days": 4, "pace": "medium",  "spend": 2, "hotel": None,                      "interests": "探戈、美食、建筑",             "must_include": []},
    {"id": 20, "city": "Kyoto",         "city_cn": "京都",         "days": 3, "pace": "relaxed", "spend": 3, "hotel": "Hiiragiya Ryokan",        "interests": "寺庙、庭院",                 "must_include": ["岚山"]},
    {"id": 21, "city": "Hanoi",         "city_cn": "河内",         "days": 2, "pace": "tight",   "spend": 1, "hotel": None,                      "interests": "街头美食、老城",               "must_include": []},
    {"id": 22, "city": "Athens",        "city_cn": "雅典",         "days": 3, "pace": "medium",  "spend": 2, "hotel": "Electra Hotel Athens",     "interests": "古迹、海边",                 "must_include": []},
    {"id": 23, "city": "Porto",          "city_cn": "波尔图",       "days": 2, "pace": "relaxed", "spend": 1, "hotel": None,                      "interests": "酒庄、河边",                 "must_include": []},
    {"id": 24, "city": "Zurich",        "city_cn": "苏黎世",       "days": 3, "pace": "medium",  "spend": 3, "hotel": "Baur au Lac",             "interests": None,                        "must_include": []},
    {"id": 25, "city": "Copenhagen",    "city_cn": "哥本哈根",     "days": 3, "pace": "medium",  "spend": 2, "hotel": None,                      "interests": "设计、美食",                 "must_include": []},
    {"id": 26, "city": "Reykjavik",     "city_cn": "雷克雅未克",   "days": 4, "pace": "relaxed", "spend": 3, "hotel": "Hotel Borg",               "interests": "自然、温泉",                 "must_include": ["金圈"]},
    {"id": 27, "city": "Kuala Lumpur",  "city_cn": "吉隆坡",       "days": 2, "pace": "medium",  "spend": 1, "hotel": None,                      "interests": "美食、购物",                 "must_include": []},
    {"id": 28, "city": "Tel Aviv",       "city_cn": "特拉维夫",     "days": 3, "pace": "medium",  "spend": 3, "hotel": None,                      "interests": "海边、美食、夜生活",           "must_include": []},
    {"id": 29, "city": "Chiang Mai",     "city_cn": "清迈",         "days": 4, "pace": "relaxed", "spend": 1, "hotel": None,                      "interests": "寺庙、自然、咖啡",             "must_include": []},
    {"id": 30, "city": "Shanghai",       "city_cn": "上海",         "days": 3, "pace": "tight",   "spend": 3, "hotel": "The Peninsula Shanghai", "interests": "建筑、美食、购物",             "must_include": []},
]


_id = 0


def mcp_call(tool: str, args: dict[str, Any], key: str, timeout: float = 300) -> dict[str, Any]:
    """Call a places-agent tool over the canonical stateless MCP /mcp endpoint.
    Returns the parsed envelope ({agent, ok, data, outcome?}) just like the host
    receives it — including the next_tool_call chain handoff."""
    global _id
    _id += 1
    body = {"jsonrpc": "2.0", "id": _id, "method": "tools/call",
            "params": {"name": tool, "arguments": args}}
    req = urllib.request.Request(
        BASE.rstrip("/") + "/mcp",
        data=json.dumps(body).encode("utf-8"),
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json",
                 "Accept": "application/json, text/event-stream"},
        method="POST",
    )
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"HTTP {e.code} /mcp {tool}: {e.read().decode('utf-8','replace')[:1200]}") from e
    except Exception as e:
        raise RuntimeError(f"/mcp {tool}: {e}") from e
    # Response is SSE: one or more "event: message\\ndata: <json>" blocks.
    data_json: str | None = None
    for line in raw.splitlines():
        if line.startswith("data: "):
            data_json = line[6:].strip()
            break
    if not data_json:
        raise RuntimeError(f"/mcp {tool}: no data line in response: {raw[:400]}")
    msg = json.loads(data_json)
    if "error" in msg:
        raise RuntimeError(f"/mcp {tool}: {msg['error']}")
    content = (msg.get("result") or {}).get("content") or []
    if not content:
        raise RuntimeError(f"/mcp {tool}: empty content")
    envelope = json.loads(content[0].get("text", "{}"))
    return {"envelope": envelope, "elapsed_s": round(time.time() - t0, 2)}


def budget_from_spend(spend: int) -> str:
    return "premium" if spend >= 3 else "budget"


def bounds_for(days: int, start: str) -> dict[str, str]:
    s = date.fromisoformat(start)
    return {"start": start, "end": (s + timedelta(days=days - 1)).isoformat()}


def slim_pool(pool: dict[str, list[dict[str, Any]]]) -> dict[str, list[dict[str, Any]]]:
    def slim(c: dict[str, Any]) -> dict[str, Any]:
        o: dict[str, Any] = {"name": c.get("name")}
        if c.get("location"):
            o["location"] = c["location"]
        if c.get("must_see"):
            o["must_see"] = True
        if c.get("sources"):
            o["sources"] = c["sources"]
        return o
    return {"places": [slim(c) for c in pool.get("places") or []],
            "restaurants": [slim(c) for c in pool.get("restaurants") or []]}


def run_scenario(sc: dict[str, Any], key: str) -> dict[str, Any]:
    rec: dict[str, Any] = {"id": sc["id"], "city": sc["city"], "city_cn": sc["city_cn"],
                           "days": sc["days"], "pace": sc["pace"], "spend": sc["spend"],
                           "hotel": sc["hotel"], "must_include": sc["must_include"],
                           "interests": sc["interests"], "steps": [], "days_md": [],
                           "ok": False, "error": None}
    start = "2026-10-10"
    bounds = bounds_for(sc["days"], start)
    locale = "CN"
    origin: dict[str, Any] | None = None

    # Step 1: geocode (only if a hotel/origin name is given)
    if sc["hotel"]:
        try:
            r = mcp_call("geocode", {"query": sc["hotel"], "locale": locale}, key)
            d = r["envelope"].get("data") or {}
            origin = {"name": sc["hotel"], "lat": d.get("lat"), "lng": d.get("lng")}
            rec["steps"].append({"tool": "geocode", "ok": True, "elapsed_s": r["elapsed_s"], "origin": origin})
        except Exception as e:
            rec["error"] = f"geocode failed: {e}"
            rec["steps"].append({"tool": "geocode", "ok": False, "error": str(e)})
            return rec
    else:
        rec["steps"].append({"tool": "geocode", "ok": True, "skipped": "no hotel"})

    # Step 2: discover_places
    disc: dict[str, Any] = {"city": sc["city"], "bounds": bounds, "locale": locale,
                            "numDays": sc["days"], "pace": sc["pace"], "spend_level": sc["spend"],
                            "providers": PROVIDERS, "must_include": sc["must_include"]}
    if sc["interests"]:
        disc["interests"] = sc["interests"]
    if origin:
        disc["origin"] = origin
    try:
        r = mcp_call("discover_places", disc, key, timeout=300)
        env = r["envelope"]
        if env.get("ok") is False:
            rec["error"] = f"discover_places not ok: {env.get('outcome')}"
            rec["steps"].append({"tool": "discover_places", "ok": False, "envelope": env})
            return rec
        data = env.get("data") or {}
        cand = data.get("candidates") or {}
        pool = {"places": list(cand.get("places") or []),
                "restaurants": list(cand.get("restaurants") or [])}
        rec["steps"].append({"tool": "discover_places", "ok": True, "elapsed_s": r["elapsed_s"],
                              "n_places": len(pool["places"]), "n_restaurants": len(pool["restaurants"]),
                              "inferred_must_see": data.get("inferred_must_see") or []})
        rec["pool"] = pool
    except Exception as e:
        rec["error"] = f"discover_places failed: {e}"
        rec["steps"].append({"tool": "discover_places", "ok": False, "error": str(e)})
        return rec

    # Step 3: make_itinerary
    mk: dict[str, Any] = {"city": sc["city"], "numDays": sc["days"], "pace": sc["pace"],
                          "budget": budget_from_spend(sc["spend"]), "locale": locale,
                          "must_include": sc["must_include"], "candidates": slim_pool(pool),
                          "providers": PROVIDERS}
    if origin:
        mk["origin"] = origin
    if sc["interests"]:
        mk["natural_language"] = sc["interests"]
    try:
        r = mcp_call("make_itinerary", mk, key, timeout=300)
        env = r["envelope"]
        if env.get("ok") is False:
            rec["error"] = f"make_itinerary not ok: {env.get('outcome')} {(env.get('data') or {}).get('detail')}"
            rec["steps"].append({"tool": "make_itinerary", "ok": False, "envelope": env})
            return rec
        data = env.get("data") or {}
        rec["skeleton"] = data.get("skeleton")
        rec["steps"].append({"tool": "make_itinerary", "ok": True, "elapsed_s": r["elapsed_s"],
                              "next_action": data.get("next_action")})
        ntc = data.get("next_tool_call")
    except Exception as e:
        rec["error"] = f"make_itinerary failed: {e}"
        rec["steps"].append({"tool": "make_itinerary", "ok": False, "error": str(e)})
        return rec

    # Step 4: follow the next_tool_call chain until trip_complete
    chain_calls = 0
    cur = ntc
    while cur is not None and chain_calls < 200:
        name = cur.get("name")
        args = cur.get("arguments") or {}
        chain_calls += 1
        try:
            r = mcp_call(name, args, key, timeout=300)
            env = r["envelope"]
            if env.get("ok") is False:
                rec["error"] = f"{name} not ok: {env.get('outcome')}"
                rec["steps"].append({"tool": name, "ok": False, "envelope": env})
                return rec
            d = env.get("data") or {}
            rec["steps"].append({"tool": name, "ok": True, "elapsed_s": r["elapsed_s"],
                                  "next_action": d.get("next_action"),
                                  "stop": d.get("stop")})
            if name == "display_current_stop":
                rec["days_md"].append(render_stop(d))
            cur = d.get("next_tool_call")
            if d.get("next_action") == "trip_complete":
                rec["ok"] = True
                break
        except Exception as e:
            rec["error"] = f"{name} failed: {e}"
            rec["steps"].append({"tool": name, "ok": False, "error": str(e)})
            return rec

    if rec["ok"] is False and rec["error"] is None:
        rec["error"] = f"chain ended without trip_complete after {chain_calls} calls"
    return rec


def render_stop(d: dict[str, Any]) -> str:
    stop = d.get("stop") or {}
    name = stop.get("name", "?")
    kind = stop.get("kind", "")
    slot = d.get("slot") or {}
    legs = d.get("legs_to_here") or []
    rec_leg = next((l for l in legs if l.get("recommended")), legs[0] if legs else None)
    lines: list[str] = []
    lines.append(f"### {name}  · {kind}")
    lines.append(f"- 时段：{slot.get('start','?')} – {slot.get('end','?')}")
    if rec_leg:
        lines.append(f"- 到达：{rec_leg.get('mode','?')} 约 {rec_leg.get('duration_min','?')} 分钟"
                      + (f"（{rec_leg.get('distance_km','')} km）" if rec_leg.get("distance_km") else ""))
    if d.get("from_origin"):
        lines.append(f"- 起点直达：{d['from_origin'].get('transport','?')} 约 {d['from_origin'].get('duration_min','?')} 分钟")
    card = stop.get("card") or {}
    if card:
        if card.get("rating"):
            lines.append(f"- 评分：{card.get('rating')}")
        if card.get("category"):
            lines.append(f"- 类别：{card.get('category')}")
    deeplinks = stop.get("deeplinks") or {}
    for k, v in deeplinks.items():
        if v:
            lines.append(f"- [{k}]({v})")
    notes = d.get("notes") or []
    if notes:
        lines.append(f"- 备注：{', '.join(str(n) for n in notes)}")
    return "\n".join(lines)


def write_scenario_md(rec: dict[str, Any]) -> Path:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    slug = f"{rec['id']:02d}-{rec['city'].lower().replace(' ', '-')}"
    p = OUT_DIR / f"{slug}.md"
    sc = rec
    lines: list[str] = []
    lines.append(f"# E2E-{rec['id']:02d} {sc['city_cn']}（{sc['city']}）{sc['days']}天行程")
    lines.append("")
    lines.append("> 本文件由 `scripts/e2e-places-agent.py` 自动生成，模拟用户调用 places-agent 工具链路得到的真实结果。")
    lines.append("")
    lines.append("## 模拟用户输入（8 行表单）")
    lines.append("")
    lines.append("| 字段 | 值 |")
    lines.append("| --- | --- |")
    lines.append(f"| 城市 | {sc['city_cn']}（{sc['city']}） |")
    lines.append(f"| 出发日期 | 2026-10-10 |")
    lines.append(f"| 天数 | {sc['days']} |")
    lines.append(f"| 酒店 | {sc['hotel'] or '（未提供）'} |")
    lines.append(f"| 节奏 | {sc['pace']} |")
    lines.append(f"| 预算 | {sc['spend']}（{'宽松' if sc['spend']>=3 else '节约' if sc['spend']<=1 else '适中'}） |")
    lines.append(f"| 兴趣 | {sc['interests'] or '（未提供）'} |")
    mi = sc['must_include']
    lines.append(f"| 必去 | {('、'.join(mi)) if mi else '（用户未选择，走目的地无关路径）'} |")
    lines.append("")
    lines.append("## places-agent 工具链路")
    lines.append("")
    lines.append("1. `geocode`（有酒店时）→ 2. `discover_places` → 3. `make_itinerary` → "
                  "4. `display_current_stop` / `plan_next_stop` 交替直到 `trip_complete`")
    lines.append("")
    lines.append("## 工具调用记录")
    lines.append("")
    lines.append("| # | 工具 | 结果 | 耗时(s) |")
    lines.append("| --- | --- | --- | --- |")
    for i, st in enumerate(sc.get("steps", []), 1):
        ok = "✓" if st.get("ok") else "✗"
        extra = ""
        if st.get("n_places") is not None:
            extra = f"places={st['n_places']}, restaurants={st['n_restaurants']}"
        elif st.get("next_action"):
            extra = f"next={st['next_action']}"
        elif st.get("skipped"):
            extra = f"skipped({st['skipped']})"
        elif st.get("error"):
            extra = st["error"][:60]
        lines.append(f"| {i} | {st['tool']} | {ok} {extra} | {st.get('elapsed_s','')} |")
    lines.append("")
    if sc.get("error"):
        lines.append(f"## 结果：失败\n\n```\n{sc['error']}\n```")
    else:
        lines.append("## 结果：成功（trip_complete）")
    lines.append("")
    skel = sc.get("skeleton") or {}
    skel_days = skel.get("days") or []
    if skel_days:
        lines.append("## 骨架")
        lines.append("")
        for dy in skel_days:
            stops = " → ".join(s.get("name", "?") for s in dy.get("stops") or [])
            lines.append(f"- **Day {dy.get('day_index')}** {dy.get('day_theme','')}：{stops}")
        lines.append("")
    if sc.get("days_md"):
        lines.append("## 逐站填充结果")
        lines.append("")
        for blk in sc["days_md"]:
            lines.append(blk)
            lines.append("")
    p.write_text("\n".join(lines), encoding="utf-8")
    return p


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", type=int)
    ap.add_argument("--limit", type=int)
    args = ap.parse_args()

    if not CALLER_KEY:
        print("ERROR: set PLACES_AGENT_CALLER_KEY env var (a places-agent caller API key)", file=sys.stderr)
        return 2

    selected = SCENARIOS
    if args.only:
        selected = [s for s in SCENARIOS if s["id"] == args.only]
    elif args.limit:
        selected = SCENARIOS[: args.limit]

    print(f"Running {len(selected)} scenario(s) against {BASE}")
    results: list[dict[str, Any]] = []
    for sc in selected:
        print(f"\n=== E2E-{sc['id']:02d} {sc['city_cn']} ({sc['city']}) {sc['days']}d ===", flush=True)
        t0 = time.time()
        try:
            rec = run_scenario(sc, CALLER_KEY)
        except Exception as e:
            rec = {"id": sc["id"], "city": sc["city"], "city_cn": sc["city_cn"], "ok": False,
                    "error": f"unhandled: {e}", "steps": [], "days_md": [],
                    "days": sc["days"], "pace": sc["pace"], "spend": sc["spend"],
                    "hotel": sc["hotel"], "must_include": sc["must_include"], "interests": sc["interests"]}
        rec["total_s"] = round(time.time() - t0, 1)
        p = write_scenario_md(rec)
        results.append(rec)
        status = "OK" if rec.get("ok") else "FAIL"
        print(f"  -> {status} in {rec.get('total_s')}s  ({len(rec.get('steps',[]))} tool calls)  -> {p.name}", flush=True)

    # INDEX
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    idx = OUT_DIR / "INDEX.md"
    lines: list[str] = []
    lines.append("# E2E places-agent 30 城行程规划测试 · 索引")
    lines.append("")
    lines.append("> 由 `scripts/e2e-places-agent.py` 生成。每个场景模拟一个用户按 8 行表单输入，"
                  "调用 places-agent 完整工具链路（geocode → discover_places → make_itinerary → "
                  "display_current_stop / plan_next_stop 链 → trip_complete）。")
    lines.append("")
    lines.append("## places-agent 完整工具链路")
    lines.append("")
    lines.append("1. **geocode**（可选，有酒店时）— 解析住宿坐标作为 origin。")
    lines.append("2. **discover_places** — L1 候选池（景点 + 餐厅）+ inferred must-see + host_instructions。")
    lines.append("3. **make_itinerary** — 生成多日停靠顺序骨架（无时间、无交通），返回首个 `next_tool_call`。")
    lines.append("4. **display_current_stop** / **plan_next_stop** 交替 — 沿 `next_tool_call` 链逐站填充卡片、"
                  "交通、时段，直到 `next_action == trip_complete`。")
    lines.append("")
    lines.append("## 设计要点")
    lines.append("")
    lines.append("- 30 个不同城市，天数 2–5 不等。")
    lines.append("- 节奏：tight / medium / relaxed 混合；预算 1–3 混合。")
    lines.append("- 酒店有时提供、有时省略（省略时跳过 geocode，origin 缺失）。")
    lines.append("- 兴趣有时提供、有时省略。")
    lines.append("- **必去点**：每个场景都触发「提示用户选择必去点」的 intake 步骤；"
                  "模拟约 1/3 场景用户给出了必去（区域/一日游名，非 POI 目录），其余用户未选择，"
                  "走目的地无关路径（ADR-042）。")
    lines.append("")
    lines.append("## 结果汇总")
    lines.append("")
    lines.append("| # | 城市 | 天数 | 节奏 | 预算 | 酒店 | 必去 | 结果 | 耗时(s) | 文件 |")
    lines.append("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |")
    ok_n = 0
    for r in results:
        ok_n += 1 if r.get("ok") else 0
        mi = "、".join(r.get("must_include") or []) or "—"
        hotel = "有" if r.get("hotel") else "无"
        status = "✓" if r.get("ok") else "✗"
        slug = f"{r['id']:02d}-{r['city'].lower().replace(' ', '-')}"
        lines.append(f"| {r['id']} | {r['city_cn']} | {r.get('days')} | {r.get('pace')} | "
                      f"{r.get('spend')} | {hotel} | {mi} | {status} | {r.get('total_s','')} | "
                      f"[{slug}.md]({slug}.md) |")
    lines.append("")
    lines.append(f"**通过 {ok_n}/{len(results)}**")
    idx.write_text("\n".join(lines), encoding="utf-8")
    print(f"\nINDEX written: {idx.name}  ({ok_n}/{len(results)} passed)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
# %%END%%
