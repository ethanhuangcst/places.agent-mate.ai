#!/usr/bin/env python3
"""
Lisbon 3-day Discover A/B live probe.

Arm A — deterministic must-see seeds + Google (+ optional AMAP skipped for EU)
Arm B — Quanzil writes search queries only → same search_* + post-process

Usage:
  python3 scripts/probe-lisbon-discover-ab.py
  python3 scripts/probe-lisbon-discover-ab.py --l2
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
W2P = ROOT.parent / "3.where2play"
OUT_JSON = ROOT / "tmp" / "probe-lisbon-discover-ab.json"

CITY = "Lisbon"
CITY_CN = "里斯本"
NUM_DAYS = 3
LOCALE = "EN"
PROVIDERS = ["GOOGLE_MAPS"]
CAP = 8 * min(NUM_DAYS, 3)

ARMA_ATTRACTION_QUERIES = [
    "Torre de Belém Lisbon",
    "Mosteiro dos Jerónimos Lisbon",
    "Castelo de São Jorge Lisbon",
    "Alfama Lisbon",
    "Praça do Comércio Lisbon",
    "Tram 28 Lisbon viewpoint",
    "LX Factory Lisbon",
]
ARMA_RESTAURANT_QUERIES = [
    "Pastéis de Belém Lisbon",
    "pastel de nata Lisbon",
    "bacalhau restaurant Lisbon",
    "seafood restaurant Alfama Lisbon",
    "Time Out Market Lisbon restaurants",
]

LOCAL_DINING = re.compile(
    r"pastel|nata|bel[eé]m|bacalhau|marisco|seafood|tasca|fado|cervejaria|sardin",
    re.I,
)
CHAIN_DENY = re.compile(
    r"McDonald|Starbucks|Burger King|KFC|Pizza Hut|Subway|Hard Rock|Domino",
    re.I,
)

LODGING_DENY = re.compile(
    r"hostel|hotel|\binn\b|lodging|motel|resort|guesthouse|hilton|hyatt|apartment",
    re.I,
)
BUSINESS_TRANSIT = re.compile(
    r"parking|bus.?stop|transit_station|car rental|ticket office",
    re.I,
)
ATTRACTION_ALLOW = re.compile(
    r"museum|park|landmark|tourist_attraction|monument|gallery|temple|church|castle|"
    r"viewpoint|palace|bridge|memorial|scenic|monastery|convent|fort|tower|"
    r"miradouro|square|plaza|garden|cathedral|basilica",
    re.I,
)
DINING_ALLOW = re.compile(
    r"restaurant|cafe|café|coffee|bakery|pastry|seafood|dining|food|bar|tasca",
    re.I,
)

MUST_SEE = {
    "belem_tower": re.compile(r"bel[eé]m|belem tower|torre de bel", re.I),
    "jeronimos": re.compile(r"jer[oó]nimos|jeronimos|hieronymites", re.I),
    "sao_jorge": re.compile(r"s[aã]o jorge|sao jorge|st\.?\s*george|castelo", re.I),
    "alfama_or_baixa": re.compile(
        r"alfama|com[eé]rcio|comercio|rossio|baixa|tram\s*28", re.I
    ),
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


def http_json(base: str, path: str, body: dict[str, Any], key: str, timeout: float = 120) -> dict[str, Any]:
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
    return []


def blob(c: dict[str, Any]) -> str:
    return f"{c.get('name') or ''} {c.get('category') or ''}"


def filter_attractions(cards: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out = []
    for c in cards:
        b = blob(c)
        if LODGING_DENY.search(b) or BUSINESS_TRANSIT.search(b):
            continue
        if not ATTRACTION_ALLOW.search(b):
            # keep strong name hits for must-sees even if category thin
            n = c.get("name") or ""
            if not any(rx.search(n) for rx in MUST_SEE.values()):
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


def norm_name(n: str) -> str:
    return re.sub(r"[^\w]+", "", n.lower())


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


def card_score(c: dict[str, Any], dining: bool = False) -> float:
    name = c.get("name") or ""
    rating = float(c["rating"]) if isinstance(c.get("rating"), (int, float)) else 0.0
    score = rating
    if dining:
        if LOCAL_DINING.search(name):
            score += 5
        if CHAIN_DENY.search(name):
            score -= 8
    else:
        for rx in MUST_SEE.values():
            if rx.search(name):
                score += 4
                break
    return score


def dedupe_stem(cards: list[dict[str, Any]], dining: bool = False) -> list[dict[str, Any]]:
    best: dict[str, dict[str, Any]] = {}
    for c in cards:
        name = c.get("name") or ""
        stem = re.sub(r"[（(][^）)]*[）)]", "", name).strip()
        key = norm_name(stem) or norm_name(name)
        if not key:
            continue
        prev = best.get(key)
        if not prev or card_score(c, dining) > card_score(prev, dining):
            best[key] = c
    return list(best.values())


def ensure_must_see_head(cards: list[dict[str, Any]]) -> list[dict[str, Any]]:
    head: list[dict[str, Any]] = []
    used: set[str] = set()
    for key, rx in MUST_SEE.items():
        pick = None
        for c in cards:
            n = c.get("name") or ""
            if n in used:
                continue
            if rx.search(n):
                pick = c
                break
        if pick:
            head.append(pick)
            used.add(pick["name"])
    rest = [c for c in cards if c.get("name") not in used]
    rest.sort(key=lambda c: card_score(c), reverse=True)
    return head + rest


def post_process(
    place_lists: list[list[dict[str, Any]]],
    rest_lists: list[list[dict[str, Any]]],
) -> dict[str, list[dict[str, Any]]]:
    places = ensure_must_see_head(
        dedupe_stem(filter_attractions(merge_by_name(place_lists)))
    )[:CAP]
    restaurants = sorted(
        dedupe_stem(filter_dining(merge_by_name(rest_lists)), dining=True),
        key=lambda c: card_score(c, dining=True),
        reverse=True,
    )[:CAP]
    return {"places": places, "restaurants": restaurants}


def search_all(
    base: str,
    key: str,
    aq: list[str],
    rq: list[str],
) -> tuple[dict[str, list[dict[str, Any]]], int, float]:
    t0 = time.time()
    place_lists: list[list[dict[str, Any]]] = []
    rest_lists: list[list[dict[str, Any]]] = []
    n = 0
    for q in aq:
        for prov in PROVIDERS:
            n += 1
            env = http_json(
                base,
                "/v1/search_places",
                {"address": CITY, "query": q, "locale": LOCALE, "providers": [prov]},
                key,
            )
            place_lists.append(extract_cards(env))
    for q in rq:
        for prov in PROVIDERS:
            n += 1
            env = http_json(
                base,
                "/v1/search_restaurants",
                {"address": CITY, "query": q, "locale": LOCALE, "providers": [prov]},
                key,
            )
            rest_lists.append(extract_cards(env))
    return post_process(place_lists, rest_lists), n, time.time() - t0


def discover_baseline(base: str, key: str) -> tuple[dict[str, list[dict[str, Any]]], float]:
    t0 = time.time()
    body = {
        "city": CITY,
        "bounds": {"start": "2026-09-01", "end": "2026-09-03"},
        "locale": LOCALE,
        "numDays": NUM_DAYS,
        "origin": {"name": "Lisbon"},
        "providers": PROVIDERS,
    }
    env = http_json(base, "/v1/discover_places", body, key, timeout=180)
    c = (env.get("data") or {}).get("candidates") or {}
    return {
        "places": list(c.get("places") or []),
        "restaurants": list(c.get("restaurants") or []),
    }, time.time() - t0


def quanzil_chat(env: dict[str, str], system: str, user: str, timeout: int = 120) -> str:
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


def llm_queries(env: dict[str, str]) -> tuple[list[str], list[str], float]:
    system = (
        "You plan map search queries for a travel agent. "
        "Return ONLY JSON: "
        '{"attractionQueries": string[], "restaurantQueries": string[]}. '
        "Each array length 4..8. Concrete search strings for a first-time Lisbon "
        "3-day trip (must-see landmarks + local food). Do not invent POI cards."
    )
    user = (
        f"City: {CITY} ({CITY_CN})\nDays: {NUM_DAYS}\nLocale: {LOCALE}\n"
        "Interests: classic icons, Belém, Alfama, local pastries and seafood."
    )
    t0 = time.time()
    text = quanzil_chat(env, system, user, timeout=90)
    elapsed = time.time() - t0
    m = re.search(r"\{[\s\S]*\}", text)
    if not m:
        raise RuntimeError(f"no JSON: {text[:300]}")
    parsed = json.loads(m.group(0))
    aq = [str(x).strip() for x in (parsed.get("attractionQueries") or []) if str(x).strip()][:8]
    rq = [str(x).strip() for x in (parsed.get("restaurantQueries") or []) if str(x).strip()][:8]
    if len(aq) < 2 or len(rq) < 2:
        raise RuntimeError(f"too few queries: {parsed}")
    return aq, rq, elapsed


def scorecard(pool: dict[str, list[dict[str, Any]]]) -> dict[str, Any]:
    places = pool.get("places") or []
    rests = pool.get("restaurants") or []
    names = [p.get("name") or "" for p in places]
    rnames = [r.get("name") or "" for r in rests]

    def first(rx: re.Pattern[str]) -> str | None:
        for n in names:
            if rx.search(n):
                return n
        return None

    hits = {k: first(rx) for k, rx in MUST_SEE.items()}
    return {
        "n_places": len(places),
        "n_restaurants": len(rests),
        "must_see": hits,
        "must_see_ok": all(hits.values()),
        "dining_local": sum(1 for n in rnames if LOCAL_DINING.search(n)),
        "dining_chain": sum(1 for n in rnames if CHAIN_DENY.search(n)),
        "place_names": names,
        "restaurant_names": rnames,
    }


def slim(pool: dict[str, list[dict[str, Any]]]) -> dict[str, list[dict[str, Any]]]:
    def one(c: dict[str, Any]) -> dict[str, Any]:
        o: dict[str, Any] = {"name": c.get("name")}
        if isinstance(c.get("rating"), (int, float)):
            o["rating"] = c["rating"]
        if c.get("category"):
            o["category"] = c["category"]
        return o

    return {
        "places": [one(c) for c in pool.get("places") or []],
        "restaurants": [one(c) for c in pool.get("restaurants") or []],
    }


def arrange_via_quanzil(
    env: dict[str, str],
    pool: dict[str, list[dict[str, Any]]],
    day_index: int,
    exclude: list[str],
) -> dict[str, Any]:
    cands = slim(pool)
    places = cands.get("places") or []
    rests = cands.get("restaurants") or []
    system = (
        "You plan ONE day in Lisbon from candidates only. Return ONLY JSON: "
        '{ "theme": string, "blocks": [ { "name": string, "type": string, '
        '"start_time": "HH:MM", "duration_min": number, "reason": string } ] }. '
        "Every block.name must be in the candidate lists. One clear theme. "
        "Prefer must-sees not in excludeNames."
    )
    user = "\n".join(
        [
            f"Day {day_index} of 3 in Lisbon",
            f"excludeNames: {json.dumps(exclude)}",
            "Attractions:",
            *[f"- {p.get('name')}" for p in places[:16]],
            "Restaurants:",
            *[f"- {r.get('name')}" for r in rests[:16]],
        ]
    )
    raw = quanzil_chat(env, system, user, timeout=150)
    m = re.search(r"\{[\s\S]*\}", raw)
    if not m:
        raise RuntimeError(raw[:300])
    parsed = json.loads(m.group(0))
    names = {p.get("name") for p in places + rests if p.get("name")}
    blocks = [
        b
        for b in (parsed.get("blocks") or [])
        if isinstance(b, dict) and b.get("name") in names
    ]
    if not blocks:
        raise RuntimeError(f"no valid blocks: {parsed}")
    return {"theme": parsed.get("theme"), "blocks": blocks}


def arrange_three(env: dict[str, str], pool: dict[str, list[dict[str, Any]]]) -> dict[str, Any]:
    exclude: list[str] = []
    days = []
    t0 = time.time()
    for day in range(1, NUM_DAYS + 1):
        try:
            arranged = arrange_via_quanzil(env, pool, day, exclude)
            names = [b.get("name") for b in arranged["blocks"] if b.get("name")]
            exclude.extend([n for n in names if isinstance(n, str)])
            days.append({"day": day, "ok": True, "theme": arranged.get("theme"), "blocks": names})
        except Exception as e:
            days.append({"day": day, "ok": False, "error": str(e)[:400]})
    return {"elapsed_s": round(time.time() - t0, 1), "days": days}


def print_score(label: str, sc: dict[str, Any], meta: dict[str, Any]) -> None:
    print(f"\n=== {label} ===")
    print(
        f"places={sc['n_places']} rest={sc['n_restaurants']} "
        f"must_see_ok={sc['must_see_ok']} "
        f"dining_local={sc['dining_local']} chain={sc['dining_chain']}"
    )
    print("must_see:", sc["must_see"])
    print("places:", sc["place_names"][:14])
    print("rest:", sc["restaurant_names"][:10])
    for k, v in meta.items():
        print(f"  {k}: {v}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--l2", action="store_true")
    ap.add_argument("--skip-b", action="store_true")
    args = ap.parse_args()

    env = {**load_env(ROOT / ".env.local"), **load_env(W2P / ".env.local")}
    key = (env.get("PLACES_AGENT_CALLER_KEY_LOCAL") or env.get("PLACES_AGENT_CALLER_KEY") or "").strip()
    base = (
        env.get("PLACES_AGENT_BASE_URL_LOCAL")
        or env.get("PLACES_AGENT_BASE_URL")
        or "http://127.0.0.1:3010"
    ).rstrip("/")
    if not key:
        print("Missing caller key", file=sys.stderr)
        return 2

    report: dict[str, Any] = {"city": CITY, "numDays": NUM_DAYS, "providers": PROVIDERS, "arms": {}}

    # baseline discover (with Google providers — Lisbon)
    try:
        pool0, e0 = discover_baseline(base, key)
        sc0 = scorecard(pool0)
        report["arms"]["baseline"] = {"ok": True, "elapsed_s": round(e0, 1), "scorecard": sc0}
        print_score("baseline discover (GOOGLE)", sc0, {"elapsed_s": round(e0, 1)})
    except Exception as e:
        report["arms"]["baseline"] = {"ok": False, "error": str(e)}
        print("baseline FAIL", e)

    # Arm A
    try:
        pool_a, n_a, e_a = search_all(base, key, ARMA_ATTRACTION_QUERIES, ARMA_RESTAURANT_QUERIES)
        sc_a = scorecard(pool_a)
        report["arms"]["armA"] = {
            "ok": True,
            "elapsed_s": round(e_a, 1),
            "search_calls": n_a,
            "attraction_queries": ARMA_ATTRACTION_QUERIES,
            "restaurant_queries": ARMA_RESTAURANT_QUERIES,
            "scorecard": sc_a,
        }
        print_score("armA deterministic", sc_a, {"elapsed_s": round(e_a, 1), "search_calls": n_a})
    except Exception as e:
        report["arms"]["armA"] = {"ok": False, "error": str(e)}
        print("armA FAIL", e)
        pool_a = {"places": [], "restaurants": []}
        sc_a = scorecard(pool_a)

    # Arm B
    if args.skip_b:
        report["arms"]["armB"] = {"ok": False, "skipped": True}
        pool_b = {"places": [], "restaurants": []}
        sc_b = scorecard(pool_b)
    else:
        try:
            aq, rq, llm_s = llm_queries(env)
            pool_b, n_b, e_b = search_all(base, key, aq, rq)
            sc_b = scorecard(pool_b)
            report["arms"]["armB"] = {
                "ok": True,
                "llm_mode": "live",
                "llm_elapsed_s": round(llm_s, 1),
                "search_elapsed_s": round(e_b, 1),
                "elapsed_s": round(llm_s + e_b, 1),
                "search_calls": n_b,
                "attraction_queries": aq,
                "restaurant_queries": rq,
                "scorecard": sc_b,
            }
            print_score(
                "armB LLM queries",
                sc_b,
                {
                    "llm_s": round(llm_s, 1),
                    "search_s": round(e_b, 1),
                    "queries_a": aq,
                    "queries_r": rq,
                },
            )
        except Exception as e:
            report["arms"]["armB"] = {"ok": False, "error": str(e)}
            print("armB FAIL", e)
            pool_b = {"places": [], "restaurants": []}
            sc_b = scorecard(pool_b)

    if args.l2:
        for label, pool in (("armA", pool_a), ("armB", pool_b)):
            if not (report["arms"].get(label) or {}).get("ok"):
                continue
            try:
                arranged = arrange_three(env, pool)
                report["arms"][label]["l2"] = arranged
                print(f"\n--- L2 {label} ({arranged['elapsed_s']}s) ---")
                for d in arranged["days"]:
                    print(f"  day{d['day']} ok={d.get('ok')} theme={d.get('theme')} blocks={d.get('blocks')}")
            except Exception as e:
                report["arms"][label]["l2"] = {"ok": False, "error": str(e)}
                print(f"L2 {label} FAIL", e)

    a_ok = bool((report["arms"].get("armA") or {}).get("scorecard", {}).get("must_see_ok"))
    b_ok = bool((report["arms"].get("armB") or {}).get("scorecard", {}).get("must_see_ok"))
    report["verdict"] = {
        "armA_l1_pass": a_ok,
        "armB_l1_pass": b_ok,
        "recommend": (
            "Prefer Arm A"
            if a_ok and not b_ok
            else "Prefer Arm B"
            if b_ok and not a_ok
            else "Both pass L1 — prefer Arm A for cost"
            if a_ok and b_ok
            else "Neither fully passes — inspect queries/filters"
        ),
    }
    print("\n=== VERDICT ===")
    print(json.dumps(report["verdict"], ensure_ascii=False, indent=2))

    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nWrote {OUT_JSON}")
    return 0 if (report["arms"].get("armA") or {}).get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
