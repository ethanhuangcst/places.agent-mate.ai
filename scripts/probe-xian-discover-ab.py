#!/usr/bin/env python3
"""
Xi'an 3-day Discover A/B live probe (ADR-038 follow-up).

Arms:
  baseline — POST /v1/discover_places with no providers (agent mainland default)
  armA     — deterministic dual-provider seeds + filters + dining rank (no LLM)
  armB     — Quanzil generates search queries only; same search_* + shared post-process

Optional --l2: arrange 3 days via /v1/arrange_day for armA and armB pools.

Usage:
  python3 scripts/probe-xian-discover-ab.py
  python3 scripts/probe-xian-discover-ab.py --l2
  python3 scripts/probe-xian-discover-ab.py --skip-b   # if Quanzil unavailable
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
W2P = ROOT.parent / "3.where2play"
OUT_DIR = ROOT / "tmp"
OUT_JSON = OUT_DIR / "probe-xian-discover-ab.json"

CITY = "西安"
NUM_DAYS = 3
LOCALE = "CN"
PROVIDERS = ["AMAP", "GOOGLE_MAPS"]
CAP = 8 * min(NUM_DAYS, 3)  # matches CANDIDATE_CAP * min(numDays, 3)

# --- Arm A seeds (deterministic improvements; probe-only) ---
ARMA_ATTRACTION_QUERIES = [
    "秦始皇帝陵博物院",
    "西安 兵马俑",
    "西安 城墙",
    "西安 大雁塔",
    "西安 华清池",
    "西安 钟楼 鼓楼",
    "陕西历史博物馆",
]
ARMA_RESTAURANT_QUERIES = [
    "西安 回民街 美食",
    "西安 肉夹馍 泡馍",
    "西安 葫芦头 凉皮",
    "西安 陕菜 老字号",
    "西安 biangbiang面",
]

LOCAL_DINING_TOKENS = re.compile(
    r"泡馍|肉夹馍|biang|裤带面|陕|回民|葫芦头|凉皮|臊子|腊汁|羊肉|德发长|老孙家|同盛斋",
    re.I,
)
CHAIN_DENY = re.compile(
    r"必胜客|肯德基|麦当劳|星巴克|汉堡王|赛百味|永和大王|真功夫|海底捞|西贝|喜茶|奈雪|"
    r"Pizza Hut|KFC|McDonald|Starbucks|Burger King|Subway",
    re.I,
)
FAR_DISTRICT = re.compile(r"凤城|经开|浐灞|未央大道|高新一路|丈八", re.I)

LODGING_DENY = re.compile(
    r"hostel|hotel|\binn\b|lodging|motel|resort|guesthouse|hilton|hyatt|"
    r"公寓|宾馆|酒店|旅馆|旅舍|民宿|客栈|贵宾楼|怡宾楼|迎宾楼|希尔顿|凯悦",
    re.I,
)
BUSINESS_TRANSIT_DENY = re.compile(
    r"公司企业|农林牧渔|停车场|停車|公交站|巴士站|parking|bus.?stop|transit_station",
    re.I,
)
ATTRACTION_FRAGMENT_DENY = re.compile(
    r"售票处|售票處|直通车|直通車|乘车点|乘車點|发车点|發車點|"
    r"敌台|敵台|敌楼|敵樓|瓮城|甕城|箭楼|箭樓",
    re.I,
)
LANDMARK_DASH_FRAGMENT = re.compile(
    r"(?:城墙|城牆|大雁塔|兵马俑|兵馬俑|钟楼|鐘樓|鼓楼|鼓樓|华清)[-–—]",
)
VISIT_DENY = re.compile(
    r"shopping_mall|fashion plaza|garden plaza|\bplaza\b|\bmall\b|美食街|residential|"
    r"transit_station|地铁站|\bstation\b|码头|景区|商城|购物中心|步行街|"
    r"tourist_information|information_center|visitor.?center|不对外开放",
    re.I,
)
ATTRACTION_ALLOW = re.compile(
    r"museum|park|landmark|tourist_attraction|monument|gallery|temple|church|castle|"
    r"viewpoint|zoo|aquarium|palace|bridge|memorial|scenic|"
    r"景点|博物馆|博物館|公园|公園|风景|風景|名胜|名勝|古迹|古跡|寺庙|寺廟|园林|園林|"
    r"展览|展覽|美术馆|美術館|科教文化|风景名胜|風景名勝|文物古迹|纪念馆|紀念館|"
    r"展览馆|展覽館|观光|觀光|人文景观|14\d{4}",
    re.I,
)
DINING_ALLOW = re.compile(
    r"restaurant|cafe|café|coffee|tea house|teahouse|dining|food|"
    r"餐|饭店|料理|烧烤|火锅|茶馆|咖啡馆|酒楼|菜馆|050000",
    re.I,
)

MUST_SEE = {
    "terracotta": re.compile(r"兵马俑|兵馬俑|秦始皇|秦始皇帝陵"),
    "dayan": re.compile(r"大雁塔|大慈恩寺"),
    "wall": re.compile(r"城墙|城牆"),
    "bell_drum": re.compile(r"钟楼|鐘樓|鼓楼|鼓樓"),
}


def load_env(path: Path) -> dict[str, str]:
    env: dict[str, str] = {}
    if not path.exists():
        return env
    for line in path.read_text().splitlines():
        s = line.strip()
        if not s or s.startswith("#") or "=" not in s:
            continue
        k, v = s.split("=", 1)
        env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def merge_env(*dicts: dict[str, str]) -> dict[str, str]:
    out: dict[str, str] = {}
    for d in dicts:
        out.update(d)
    return out


def http_json(
    base: str,
    path: str,
    body: dict[str, Any],
    key: str,
    timeout: float = 120,
) -> dict[str, Any]:
    req = urllib.request.Request(
        base.rstrip("/") + path,
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace")[:800]
        raise RuntimeError(f"HTTP {e.code} {path}: {raw}") from e


def extract_cards(envelope: dict[str, Any]) -> list[dict[str, Any]]:
    data = envelope.get("data")
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        for k in ("places", "restaurants", "candidates"):
            if isinstance(data.get(k), list):
                return data[k]
        c = data.get("candidates")
        if isinstance(c, dict):
            return []
    return []


def blob(card: dict[str, Any]) -> str:
    return f"{card.get('name') or ''} {card.get('category') or ''}"


def filter_attractions(cards: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out = []
    for c in cards:
        b = blob(c)
        name = c.get("name") or ""
        if LODGING_DENY.search(b) or VISIT_DENY.search(b) or BUSINESS_TRANSIT_DENY.search(b):
            continue
        if ATTRACTION_FRAGMENT_DENY.search(b):
            continue
        if LANDMARK_DASH_FRAGMENT.search(name):
            continue
        if not ATTRACTION_ALLOW.search(b):
            continue
        out.append(c)
    return out


def filter_dining(cards: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out = []
    for c in cards:
        b = blob(c)
        if LODGING_DENY.search(b):
            continue
        if not DINING_ALLOW.search(b):
            continue
        out.append(c)
    return out


def cluster_key(name: str) -> str:
    n = name.strip()
    if re.search(r"城墙|城牆|明城墙|古城墙", n):
        return "wall"
    if re.search(r"钟楼|鐘樓|鼓楼|鼓樓|钟鼓楼", n):
        return "bell_drum"
    if re.search(r"兵马俑|兵馬俑|秦始皇|秦始皇帝陵", n):
        return "terracotta"
    if re.search(r"大雁塔|大慈恩寺", n):
        return "dayan"
    if re.search(r"华清|華清|骊山|驪山", n):
        return "huaqing"
    if "回民街" in n:
        return "muslim_street"
    stem = re.sub(r"[^\w\u4e00-\u9fff]+", "", n.lower())
    return f"other:{stem or 'unknown'}"


def card_score(card: dict[str, Any], dining: bool = False) -> float:
    name = card.get("name") or ""
    rating = float(card["rating"]) if isinstance(card.get("rating"), (int, float)) else 0.0
    primary = 10.0 if not re.search(r"[-–—(（]", name) else 0.0
    short = max(0, 24 - len(name)) * 0.05
    score = rating + primary + short
    if dining:
        if LOCAL_DINING_TOKENS.search(name):
            score += 5.0
        if CHAIN_DENY.search(name):
            score -= 8.0
        if FAR_DISTRICT.search(name) or FAR_DISTRICT.search(card.get("address") or ""):
            score -= 3.0
    return score


def dedupe_by_cluster(cards: list[dict[str, Any]]) -> list[dict[str, Any]]:
    best: dict[str, dict[str, Any]] = {}
    for c in cards:
        key = cluster_key(c.get("name") or "")
        prev = best.get(key)
        if not prev or card_score(c) > card_score(prev):
            best[key] = c
    return list(best.values())


def ensure_diversity(cards: list[dict[str, Any]]) -> list[dict[str, Any]]:
    order = ["terracotta", "dayan", "wall", "bell_drum", "huaqing"]
    by_c: dict[str, dict[str, Any]] = {}
    for c in cards:
        key = cluster_key(c.get("name") or "")
        prev = by_c.get(key)
        if not prev or card_score(c) > card_score(prev):
            by_c[key] = c
    head = []
    used: set[str] = set()
    for k in order:
        c = by_c.get(k)
        if c and c.get("name") not in used:
            head.append(c)
            used.add(c["name"])
    rest = [c for c in cards if c.get("name") not in used]
    return head + rest


def dedupe_rest_stem(cards: list[dict[str, Any]]) -> list[dict[str, Any]]:
    best: dict[str, dict[str, Any]] = {}
    for c in cards:
        name = c.get("name") or ""
        stem = re.sub(r"[（(][^）)]*[）)]", "", name).strip()
        key = re.sub(r"[^\w\u4e00-\u9fff]+", "", stem.lower()) or name
        prev = best.get(key)
        if not prev or card_score(c, dining=True) > card_score(prev, dining=True):
            best[key] = c
    return list(best.values())


def merge_by_name(lists: list[list[dict[str, Any]]]) -> list[dict[str, Any]]:
    seen: set[str] = set()
    out: list[dict[str, Any]] = []
    for lst in lists:
        for c in lst:
            n = (c.get("name") or "").strip()
            if not n or n in seen:
                continue
            seen.add(n)
            out.append(c)
    return out


def rank_places(cards: list[dict[str, Any]]) -> list[dict[str, Any]]:
    tokens = ["兵马俑", "秦始皇", "城墙", "大雁塔", "华清", "钟楼", "鼓楼", "陕西历史"]

    def hit(name: str) -> int:
        return 1 if any(t in name for t in tokens) else 0

    return sorted(
        cards,
        key=lambda c: (hit(c.get("name") or ""), card_score(c)),
        reverse=True,
    )


def rank_restaurants(cards: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(cards, key=lambda c: card_score(c, dining=True), reverse=True)


def post_process(
    place_lists: list[list[dict[str, Any]]],
    rest_lists: list[list[dict[str, Any]]],
) -> dict[str, list[dict[str, Any]]]:
    places = rank_places(
        ensure_diversity(dedupe_by_cluster(filter_attractions(merge_by_name(place_lists))))
    )[:CAP]
    restaurants = rank_restaurants(
        dedupe_rest_stem(filter_dining(merge_by_name(rest_lists)))
    )[:CAP]
    return {"places": places, "restaurants": restaurants}


def search_all(
    base: str,
    key: str,
    attraction_queries: list[str],
    restaurant_queries: list[str],
    providers: list[str],
) -> tuple[dict[str, list[dict[str, Any]]], int, float]:
    t0 = time.time()
    place_lists: list[list[dict[str, Any]]] = []
    rest_lists: list[list[dict[str, Any]]] = []
    n_search = 0
    for q in attraction_queries:
        for prov in providers:
            n_search += 1
            env = http_json(
                base,
                "/v1/search_places",
                {
                    "address": CITY,
                    "query": q,
                    "locale": LOCALE,
                    "providers": [prov],
                },
                key,
            )
            place_lists.append(extract_cards(env))
    for q in restaurant_queries:
        for prov in providers:
            n_search += 1
            env = http_json(
                base,
                "/v1/search_restaurants",
                {
                    "address": CITY,
                    "query": q,
                    "locale": LOCALE,
                    "providers": [prov],
                },
                key,
            )
            rest_lists.append(extract_cards(env))
    pool = post_process(place_lists, rest_lists)
    return pool, n_search, time.time() - t0


def discover_baseline(base: str, key: str) -> tuple[dict[str, list[dict[str, Any]]], float]:
    t0 = time.time()
    body = {
        "city": CITY,
        "bounds": {"start": "2026-08-22", "end": "2026-08-24"},
        "locale": LOCALE,
        "numDays": NUM_DAYS,
        "origin": {"name": "西安钟楼"},
    }
    env = http_json(base, "/v1/discover_places", body, key, timeout=180)
    c = (env.get("data") or {}).get("candidates") or {}
    pool = {
        "places": list(c.get("places") or []),
        "restaurants": list(c.get("restaurants") or []),
    }
    return pool, time.time() - t0


# When Quanzil is unreachable: representative LLM-shaped queries (not Arm A catalog).
# Distinct from Arm A so we still isolate "query list quality" as a lever.
ARMB_PROXY_ATTRACTION_QUERIES = [
    "秦始皇帝陵博物院",
    "兵马俑一号坑",
    "西安城墙永宁门",
    "大雁塔大慈恩寺",
    "陕西历史博物馆",
    "西安钟楼鼓楼",
    "华清宫临潼",
    "大唐不夜城",
]
ARMB_PROXY_RESTAURANT_QUERIES = [
    "回民街羊肉泡馍",
    "洒金桥肉夹馍",
    "西安老字号葫芦头",
    "biangbiang面西安",
    "德发长饺子",
    "西安凉皮甑糕",
]


def llm_queries(env: dict[str, str]) -> tuple[list[str], list[str], float, str]:
    """Returns (attraction_qs, restaurant_qs, elapsed_s, mode). mode=live on success."""
    system = (
        "You plan map search queries for a travel agent. "
        "Return ONLY JSON: "
        '{"attractionQueries": string[], "restaurantQueries": string[]}. '
        "Each array length 4..8. Queries must be concrete place/food search strings "
        "for Xi'an first-time visitors (must-sees + local food). "
        "Do not invent POI cards — queries only. Prefer museum official names "
        "(e.g. 秦始皇帝陵博物院) over tour-bus keywords."
    )
    user = (
        f"City: {CITY}\nDays: {NUM_DAYS}\nLocale: {LOCALE}\n"
        "Interests: first visit, classic icons, local Shaanxi food.\n"
        "Stay near: 西安钟楼"
    )
    t0 = time.time()
    text = quanzil_chat(env, system, user, timeout=90)
    elapsed = time.time() - t0
    m = re.search(r"\{[\s\S]*\}", text)
    if not m:
        raise RuntimeError(f"Arm B LLM no JSON: {text[:300]}")
    parsed = json.loads(m.group(0))
    aq = [str(x).strip() for x in (parsed.get("attractionQueries") or []) if str(x).strip()][:8]
    rq = [str(x).strip() for x in (parsed.get("restaurantQueries") or []) if str(x).strip()][:8]
    if len(aq) < 2 or len(rq) < 2:
        raise RuntimeError(f"Arm B LLM too few queries: {parsed}")
    return aq, rq, elapsed, "live"


def scorecard(pool: dict[str, list[dict[str, Any]]]) -> dict[str, Any]:
    places = pool.get("places") or []
    rests = pool.get("restaurants") or []
    names = [p.get("name") or "" for p in places]
    rnames = [r.get("name") or "" for r in rests]

    def first_match(rx: re.Pattern[str]) -> str | None:
        for n in names:
            if rx.search(n):
                return n
        return None

    hits = {k: first_match(rx) for k, rx in MUST_SEE.items()}
    wall_count = sum(1 for n in names if MUST_SEE["wall"].search(n))
    frag = [
        n
        for n in names
        if ATTRACTION_FRAGMENT_DENY.search(n) or LANDMARK_DASH_FRAGMENT.search(n)
    ]
    local_food = sum(1 for n in rnames if LOCAL_DINING_TOKENS.search(n))
    chain = sum(1 for n in rnames if CHAIN_DENY.search(n))
    far = sum(1 for n in rnames if FAR_DISTRICT.search(n))
    return {
        "n_places": len(places),
        "n_restaurants": len(rests),
        "must_see": hits,
        "must_see_ok": all(
            hits[k] for k in ("terracotta", "dayan", "wall", "bell_drum")
        ),
        "wall_count": wall_count,
        "wall_ok": wall_count <= 2,
        "fragments": frag,
        "fragments_ok": len(frag) == 0,
        "dining_local_signal": local_food,
        "dining_chain": chain,
        "dining_far_district": far,
        "place_names": names,
        "restaurant_names": rnames,
    }


def slim_for_arrange(pool: dict[str, list[dict[str, Any]]]) -> dict[str, list[dict[str, Any]]]:
    def slim(c: dict[str, Any]) -> dict[str, Any]:
        out: dict[str, Any] = {"name": c.get("name")}
        if c.get("category"):
            out["category"] = c["category"]
        if isinstance(c.get("rating"), (int, float)):
            out["rating"] = c["rating"]
        loc = c.get("location")
        if isinstance(loc, dict):
            out["location"] = {
                k: loc[k] for k in ("lat", "lng") if isinstance(loc.get(k), (int, float))
            }
        return out

    return {
        "places": [slim(c) for c in pool.get("places") or []],
        "restaurants": [slim(c) for c in pool.get("restaurants") or []],
    }


def quanzil_chat(env: dict[str, str], system: str, user: str, timeout: int = 120) -> str:
    """Probe L2/B: call Quanzil via Node with TLS bypass (cert often IP-SAN only)."""
    import subprocess

    api_key = env.get("OPENAI_API_KEY", "").strip()
    if not api_key or api_key == "fixture":
        raise RuntimeError("OPENAI_API_KEY missing")
    base = (env.get("OPENAI_BASE_URL") or "https://quanzil.com/v1").rstrip("/")
    model = env.get("OPENAI_CHAT_MODEL") or "gpt-5.4"
    payload = json.dumps(
        {
            "model": model,
            "temperature": 0.2,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        }
    )
    node_src = f"""
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
fetch({json.dumps(base + '/chat/completions')}, {{
  method: 'POST',
  headers: {{
    Authorization: 'Bearer ' + {json.dumps(api_key)},
    'Content-Type': 'application/json',
  }},
  body: {json.dumps(payload)},
}}).then(async (r) => {{
  const t = await r.text();
  if (!r.ok) {{ console.error('HTTP', r.status, t.slice(0, 400)); process.exit(2); }}
  process.stdout.write(t);
}}).catch((e) => {{ console.error(e); process.exit(1); }});
"""
    node = subprocess.run(
        ["node", "-e", node_src],
        capture_output=True,
        text=True,
        timeout=timeout,
    )
    if node.returncode != 0 or not node.stdout.strip().startswith("{"):
        raise RuntimeError((node.stderr or node.stdout or "quanzil empty")[:500])
    data = json.loads(node.stdout)
    return data["choices"][0]["message"]["content"]


def arrange_day_via_quanzil(
    env: dict[str, str],
    pool: dict[str, list[dict[str, Any]]],
    day_index: int,
    date: str,
    exclude: list[str],
) -> dict[str, Any]:
    """Same contract as where2play plan-arrange-llm (theme + blocks from candidates only)."""
    cands = slim_for_arrange(pool)
    place_lines = [
        f"- {p.get('name')} rating={p.get('rating')}" for p in (cands.get("places") or [])[:16]
    ]
    rest_lines = [
        f"- {r.get('name')} rating={r.get('rating')}" for r in (cands.get("restaurants") or [])[:16]
    ]
    system = "\n".join(
        [
            "You are the where2play day itinerary planner.",
            f"Respond in locale {LOCALE}.",
            "Select and order places for ONE day from the candidate lists only.",
            "Return ONLY a JSON object with shape:",
            '{ "day_index": number, "date"?: "YYYY-MM-DD", "theme": string, "blocks": [',
            '  { "name": string, "type": "attraction"|"lunch"|"dinner"|...,',
            '    "start_time": "HH:MM", "duration_min": number, "reason": string }',
            "] }",
            "Rules:",
            "- Every block.name MUST appear in the candidate lists.",
            "- Give the day one clear theme in `theme`.",
            "- Prefer geographically coherent stops; do not schedule two stops from the same landmark cluster.",
            "- Prefer iconic candidates not listed in excludeNames when available.",
            "- Prefer a balanced day (attractions + meals when candidates exist).",
        ]
    )
    user = "\n".join(
        [
            f"City: {CITY}",
            f"Day index: {day_index}",
            f"Date: {date}",
            "pace: medium",
            f"excludeNames: {json.dumps(exclude, ensure_ascii=False)}",
            "Attraction candidates:",
            *place_lines,
            "Restaurant candidates:",
            *rest_lines,
        ]
    )
    raw = quanzil_chat(env, system, user, timeout=150)
    m = re.search(r"\{[\s\S]*\}", raw)
    if not m:
        raise RuntimeError(f"no JSON in arrange: {raw[:300]}")
    parsed = json.loads(m.group(0))
    names = set()
    for p in (cands.get("places") or []) + (cands.get("restaurants") or []):
        if p.get("name"):
            names.add(p["name"])
    blocks = []
    for b in parsed.get("blocks") or []:
        if not isinstance(b, dict):
            continue
        n = b.get("name")
        if isinstance(n, str) and n in names:
            blocks.append(b)
    if not blocks:
        raise RuntimeError(f"no valid blocks: {parsed}")
    return {
        "theme": parsed.get("theme"),
        "blocks": blocks,
        "day_index": parsed.get("day_index", day_index),
    }


def arrange_three_days(
    base: str,
    key: str,
    pool: dict[str, list[dict[str, Any]]],
    openai_env: dict[str, str] | None = None,
) -> dict[str, Any]:
    """Prefer agent /v1/arrange_day; fall back to direct Quanzil (probe TLS bypass)."""
    candidates = slim_for_arrange(pool)
    exclude: list[str] = []
    days: list[dict[str, Any]] = []
    t0 = time.time()
    mode = "live_arrange_day"
    for day in range(1, NUM_DAYS + 1):
        date = f"2026-08-{21 + day:02d}"
        body = {
            "candidates": candidates,
            "dayIndex": day,
            "date": date,
            "city": CITY,
            "locale": LOCALE,
            "pace": "medium",
            "exclude_names": exclude,
        }
        try:
            env = http_json(base, "/v1/arrange_day", body, key, timeout=150)
            ok = bool(env.get("ok"))
            data = env.get("data") or {}
            blocks = data.get("blocks") or []
            theme = data.get("theme")
            names = [b.get("name") for b in blocks if isinstance(b, dict)]
            if ok and names:
                for n in names:
                    if isinstance(n, str) and n:
                        exclude.append(n)
                days.append(
                    {
                        "day": day,
                        "ok": True,
                        "theme": theme,
                        "blocks": names,
                        "mode": "agent_arrange_day",
                    }
                )
                continue
            raise RuntimeError(str(env.get("outcome") or "arrange_day not ok"))
        except Exception as agent_err:
            if not openai_env:
                days.append({"day": day, "ok": False, "error": str(agent_err)[:400]})
                continue
            try:
                arranged = arrange_day_via_quanzil(openai_env, pool, day, date, exclude)
                mode = "direct_quanzil"
                names = [b.get("name") for b in arranged["blocks"] if b.get("name")]
                for n in names:
                    exclude.append(n)
                days.append(
                    {
                        "day": day,
                        "ok": True,
                        "theme": arranged.get("theme"),
                        "blocks": names,
                        "mode": "direct_quanzil",
                        "agent_error": str(agent_err)[:200],
                    }
                )
            except Exception as e:
                days.append({"day": day, "ok": False, "error": str(e)[:400]})
    return {"elapsed_s": round(time.time() - t0, 1), "mode": mode, "days": days}


def print_score(label: str, sc: dict[str, Any], meta: dict[str, Any]) -> None:
    print(f"\n=== {label} ===")
    print(
        f"places={sc['n_places']} rest={sc['n_restaurants']} "
        f"must_see_ok={sc['must_see_ok']} wall={sc['wall_count']} "
        f"frag={len(sc['fragments'])} "
        f"dining_local={sc['dining_local_signal']} chain={sc['dining_chain']} far={sc['dining_far_district']}"
    )
    print("must_see:", sc["must_see"])
    print("places:", sc["place_names"][:16])
    print("rest:", sc["restaurant_names"][:12])
    for k, v in meta.items():
        print(f"  {k}: {v}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--l2", action="store_true", help="Run arrange_day 3 days for armA/armB")
    ap.add_argument("--skip-b", action="store_true", help="Skip Arm B LLM")
    ap.add_argument("--skip-baseline", action="store_true")
    args = ap.parse_args()

    env = merge_env(load_env(ROOT / ".env.local"), load_env(W2P / ".env.local"))
    key = (
        env.get("PLACES_AGENT_CALLER_KEY_LOCAL")
        or env.get("PLACES_AGENT_CALLER_KEY")
        or ""
    ).strip()
    base = (
        env.get("PLACES_AGENT_BASE_URL_LOCAL")
        or env.get("PLACES_AGENT_BASE_URL")
        or "http://127.0.0.1:3010"
    ).rstrip("/")
    if not key:
        print("Missing PLACES_AGENT_CALLER_KEY_LOCAL", file=sys.stderr)
        return 2

    report: dict[str, Any] = {
        "city": CITY,
        "numDays": NUM_DAYS,
        "base": base,
        "providers_forced": PROVIDERS,
        "arms": {},
    }

    # --- baseline ---
    if not args.skip_baseline:
        try:
            pool, elapsed = discover_baseline(base, key)
            sc = scorecard(pool)
            report["arms"]["baseline"] = {
                "ok": True,
                "elapsed_s": round(elapsed, 1),
                "scorecard": sc,
                "search_calls": "discover_places×1",
            }
            print_score("baseline (discover no providers)", sc, {"elapsed_s": round(elapsed, 1)})
        except Exception as e:
            report["arms"]["baseline"] = {"ok": False, "error": str(e)}
            print("baseline FAILED", e)

    # --- Arm A ---
    try:
        pool_a, n_search_a, elapsed_a = search_all(
            base, key, ARMA_ATTRACTION_QUERIES, ARMA_RESTAURANT_QUERIES, PROVIDERS
        )
        sc_a = scorecard(pool_a)
        report["arms"]["armA"] = {
            "ok": True,
            "elapsed_s": round(elapsed_a, 1),
            "search_calls": n_search_a,
            "attraction_queries": ARMA_ATTRACTION_QUERIES,
            "restaurant_queries": ARMA_RESTAURANT_QUERIES,
            "scorecard": sc_a,
            "pool": {
                "places": sc_a["place_names"],
                "restaurants": sc_a["restaurant_names"],
            },
        }
        print_score(
            "armA (deterministic dual-provider)",
            sc_a,
            {"elapsed_s": round(elapsed_a, 1), "search_calls": n_search_a},
        )
    except Exception as e:
        report["arms"]["armA"] = {"ok": False, "error": str(e)}
        print("armA FAILED", e)
        pool_a = {"places": [], "restaurants": []}
        sc_a = scorecard(pool_a)

    # --- Arm B ---
    if args.skip_b:
        report["arms"]["armB"] = {"ok": False, "skipped": True}
        pool_b = {"places": [], "restaurants": []}
        sc_b = scorecard(pool_b)
    else:
        try:
            aq, rq, llm_s, llm_mode = llm_queries(env)
            pool_b, n_search_b, search_s = search_all(base, key, aq, rq, PROVIDERS)
            sc_b = scorecard(pool_b)
            report["arms"]["armB"] = {
                "ok": True,
                "llm_mode": llm_mode,
                "llm_elapsed_s": round(llm_s, 1),
                "search_elapsed_s": round(search_s, 1),
                "elapsed_s": round(llm_s + search_s, 1),
                "search_calls": n_search_b,
                "llm_calls": 1 if llm_mode == "live" else 0,
                "attraction_queries": aq,
                "restaurant_queries": rq,
                "scorecard": sc_b,
                "pool": {
                    "places": sc_b["place_names"],
                    "restaurants": sc_b["restaurant_names"],
                },
            }
            print_score(
                f"armB ({llm_mode} + same post-process)",
                sc_b,
                {
                    "llm_mode": llm_mode,
                    "llm_s": round(llm_s, 1),
                    "search_s": round(search_s, 1),
                    "search_calls": n_search_b,
                    "queries_a": aq,
                    "queries_r": rq,
                },
            )
        except Exception as e:
            report["arms"]["armB"] = {"ok": False, "error": str(e)}
            print("armB FAILED", e)
            pool_b = {"places": [], "restaurants": []}
            sc_b = scorecard(pool_b)

    # --- L2 ---
    if args.l2:
        for label, pool in (("armA", pool_a), ("armB", pool_b)):
            arm = report["arms"].get(label) or {}
            if not arm.get("ok"):
                continue
            if not (pool.get("places") or pool.get("restaurants")):
                continue
            try:
                arranged = arrange_three_days(base, key, pool, openai_env=env)
                arm["l2"] = arranged
                print(f"\n--- L2 {label} ({arranged['elapsed_s']}s) ---")
                for d in arranged["days"]:
                    print(f"  day{d['day']} ok={d.get('ok')} theme={d.get('theme')} blocks={d.get('blocks')}")
            except Exception as e:
                arm["l2"] = {"ok": False, "error": str(e)}
                print(f"L2 {label} FAILED", e)

    # Verdict helpers
    def arm_pass(sc: dict[str, Any] | None) -> bool:
        if not sc:
            return False
        return bool(sc.get("must_see_ok") and sc.get("wall_ok") and sc.get("fragments_ok"))

    report["verdict"] = {
        "baseline_l1_pass": arm_pass((report["arms"].get("baseline") or {}).get("scorecard")),
        "armA_l1_pass": arm_pass((report["arms"].get("armA") or {}).get("scorecard")),
        "armB_l1_pass": arm_pass((report["arms"].get("armB") or {}).get("scorecard")),
        "recommend": None,
    }
    a_ok = report["verdict"]["armA_l1_pass"]
    b_ok = report["verdict"]["armB_l1_pass"]
    if a_ok and (not b_ok or (report["arms"].get("armA") or {}).get("elapsed_s", 99) <= (
        report["arms"].get("armB") or {}
    ).get("elapsed_s", 99)):
        report["verdict"]["recommend"] = (
            "Prefer Arm A deterministic L1 (no LLM); ship dual-provider seeds + dining rank."
        )
    elif b_ok and not a_ok:
        report["verdict"]["recommend"] = (
            "Consider narrow L1 LLM for query generation only; keep POI from search_*."
        )
    elif a_ok and b_ok:
        report["verdict"]["recommend"] = (
            "Both pass L1; prefer Arm A for latency/cost unless L2 quality favors B."
        )
    else:
        report["verdict"]["recommend"] = (
            "Neither arm fully passes must-see gate; inspect vendor/query further."
        )

    print("\n=== VERDICT ===")
    print(json.dumps(report["verdict"], ensure_ascii=False, indent=2))

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nWrote {OUT_JSON}")

    # Exit 0 if at least armA ran; non-zero if armA failed (probe broken)
    if not (report["arms"].get("armA") or {}).get("ok"):
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
