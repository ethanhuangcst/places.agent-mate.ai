#!/usr/bin/env python3
"""
Lisbon 4-day skeleton+incremental performance probe.

Measures current architecture (arrange_day x 4 + enrich x 4) component costs
to validate the section 12 light-skeleton + LLM-free fill estimates in
agent-specs/performance.md.

Steps timed:
  1. discover_places              candidate pool + LLM must-see inference
  2. arrange_day x N (sequential) current architecture per-day LLM cost
  3. enrich_arrange_transit x N   sequential transit enrichment (per day)
  4. geocode origin                coordinate resolution
  5. small LLM "pick next stop"    single-stop LLM cost (plan_next_stop proxy)

Usage:
  python3 scripts/probe-lisbon-skeleton-incremental.py
  python3 scripts/probe-lisbon-skeleton-incremental.py --skip-llm-stop
  python3 scripts/probe-lisbon-skeleton-incremental.py --days 3

Output: tmp/probe-lisbon-skeleton-incremental.json
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
OUT_JSON = ROOT / "tmp" / "probe-lisbon-skeleton-incremental.json"

CITY = "Lisbon"
CITY_CN = "里斯本"
DEFAULT_DAYS = 4
LOCALE = "EN"
PROVIDERS = ["GOOGLE_MAPS"]

ORIGIN_NAME = "Hills Hotel Lisboa"
TIME_FROM = "09:30"
TIME_TO = "20:00"
PACE = "medium"
BUDGET = "premium"
PARTY_SIZE = 2
NATURAL_LANGUAGE = "情侣出游，适中节奏，中等预算，偏好公共交通"


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


def http_json(
    base: str,
    path: str,
    body: dict[str, Any],
    key: str,
    timeout: float = 180,
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
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return {"data": data, "elapsed_s": round(time.time() - t0, 2)}
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace")[:800]
        raise RuntimeError(f"HTTP {e.code} {path}: {raw}") from e


def http_ndjson(
    base: str,
    path: str,
    body: dict[str, Any],
    key: str,
    timeout: float = 180,
) -> dict[str, Any]:
    req = urllib.request.Request(
        base.rstrip("/") + path,
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Accept": "application/x-ndjson",
        },
        method="POST",
    )
    t0 = time.time()
    first_event_at: float | None = None
    last_data: dict[str, Any] = {}
    event_count = 0
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            for raw_line in resp:
                line = raw_line.decode("utf-8", errors="replace").strip()
                if not line:
                    continue
                if first_event_at is None:
                    first_event_at = round(time.time() - t0, 2)
                try:
                    evt = json.loads(line)
                except json.JSONDecodeError:
                    continue
                event_count += 1
                if evt.get("type") == "discover_done":
                    last_data = evt
                elif "data" in evt:
                    last_data = evt
        return {
            "elapsed_s": round(time.time() - t0, 2),
            "first_event_s": first_event_at,
            "event_count": event_count,
            "last_event": last_data,
        }
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace")[:800]
        raise RuntimeError(f"HTTP {e.code} {path}: {raw}") from e


def slim_card(c: dict[str, Any]) -> dict[str, Any]:
    o: dict[str, Any] = {"name": c.get("name")}
    if c.get("location"):
        o["location"] = c["location"]
    if isinstance(c.get("rating"), (int, float)):
        o["rating"] = c["rating"]
    if c.get("category"):
        o["category"] = c["category"]
    if c.get("sources"):
        o["sources"] = c["sources"]
    return o


def slim_pool(pool: dict[str, list[dict[str, Any]]]) -> dict[str, list[dict[str, Any]]]:
    return {
        "places": [slim_card(c) for c in pool.get("places") or []],
        "restaurants": [slim_card(c) for c in pool.get("restaurants") or []],
    }


def quanzil_chat(
    env: dict[str, str],
    system: str,
    user: str,
    timeout: int = 120,
) -> tuple[str, float]:
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
    node_src = (
        "process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';\n"
        "fetch(" + json.dumps(base + "/chat/completions") + ", {\n"
        "  method: 'POST',\n"
        "  headers: {\n"
        "    Authorization: 'Bearer ' + " + json.dumps(api_key) + ",\n"
        "    'Content-Type': 'application/json',\n"
        "  },\n"
        "  body: " + json.dumps(payload) + ",\n"
        "}).then(async (r) => {\n"
        "  const t = await r.text();\n"
        "  if (!r.ok) { console.error('HTTP', r.status, t.slice(0, 400)); process.exit(2); }\n"
        "  process.stdout.write(t);\n"
        "}).catch((e) => { console.error(e); process.exit(1); });\n"
    )
    t0 = time.time()
    node = subprocess.run(
        ["node", "-e", node_src],
        capture_output=True,
        text=True,
        timeout=timeout,
    )
    elapsed = time.time() - t0
    if node.returncode != 0 or not node.stdout.strip().startswith("{"):
        raise RuntimeError((node.stderr or node.stdout or "quanzil empty")[:500])
    data = json.loads(node.stdout)
    return data["choices"][0]["message"]["content"], round(elapsed, 2)


def step_discover(base: str, key: str, num_days: int) -> dict[str, Any]:
    body = {
        "city": CITY,
        "bounds": {"start": "2026-09-20", "end": "2026-09-23"},
        "locale": LOCALE,
        "numDays": num_days,
        "origin": {"name": ORIGIN_NAME},
        "providers": PROVIDERS,
    }
    res = http_ndjson(base, "/v1/discover_places", body, key, timeout=180)
    env = http_json(base, "/v1/discover_places", body, key, timeout=180)
    data = env["data"].get("data") or {}
    candidates = data.get("candidates") or {}
    pool = {
        "places": list(candidates.get("places") or []),
        "restaurants": list(candidates.get("restaurants") or []),
    }
    return {
        "elapsed_s": env["elapsed_s"],
        "stream_first_event_s": res.get("first_event_s"),
        "stream_total_s": res.get("elapsed_s"),
        "n_places": len(pool["places"]),
        "n_restaurants": len(pool["restaurants"]),
        "inferred_must_see": list(data.get("inferred_must_see") or []),
        "pool": pool,
    }


def step_arrange_day(
    base: str,
    key: str,
    pool: dict[str, list[dict[str, Any]]],
    day_index: int,
    num_days: int,
    exclude: list[str],
    origin_coords: dict[str, Any] | None,
) -> dict[str, Any]:
    origin: dict[str, Any] = {"name": ORIGIN_NAME}
    if origin_coords:
        origin.update(origin_coords)
    body = {
        "candidates": slim_pool(pool),
        "dayIndex": day_index,
        "city": CITY,
        "origin": origin,
        "destination": origin,
        "pace": PACE,
        "budget": BUDGET,
        "exclude_names": exclude,
        "execution": "agent",
        "party_size": PARTY_SIZE,
        "num_days": num_days,
        "preferences": {
            "time_from": TIME_FROM,
            "time_to": TIME_TO,
            "transit_preferred": True,
            "natural_language": NATURAL_LANGUAGE,
        },
        "locale": LOCALE,
        "providers": PROVIDERS,
    }
    res = http_json(base, "/v1/arrange_day", body, key, timeout=180)
    data = res["data"].get("data") or {}
    day = data
    blocks = day.get("blocks") or []
    block_names = [b.get("name") for b in blocks if b.get("name")]
    return {
        "elapsed_s": res["elapsed_s"],
        "theme": day.get("theme"),
        "n_blocks": len(blocks),
        "block_names": block_names,
        "day": day,
    }


def step_enrich(
    base: str,
    key: str,
    day: dict[str, Any],
    pool: dict[str, list[dict[str, Any]]],
    origin_coords: dict[str, Any] | None,
) -> dict[str, Any]:
    origin: dict[str, Any] = {"name": ORIGIN_NAME}
    if origin_coords:
        origin.update(origin_coords)
    body = {
        "day": day,
        "candidates": slim_pool(pool),
        "origin": origin,
        "destination": origin,
        "preferences": {"transit_preferred": True},
        "locale": LOCALE,
        "providers": PROVIDERS,
    }
    res = http_json(base, "/v1/enrich_arrange_transit", body, key, timeout=120)
    data = res["data"].get("data") or {}
    blocks = data.get("blocks") or []
    legs_count = sum(len(b.get("legs_to_here") or []) for b in blocks)
    return {
        "elapsed_s": res["elapsed_s"],
        "n_blocks": len(blocks),
        "n_legs": legs_count,
        "transit_outcome": data.get("transit_outcome"),
    }


def step_geocode(base: str, key: str) -> dict[str, Any]:
    body = {"query": ORIGIN_NAME, "locale": LOCALE, "providers": PROVIDERS}
    res = http_json(base, "/v1/geocode", body, key, timeout=60)
    data = res["data"].get("data") or {}
    return {
        "elapsed_s": res["elapsed_s"],
        "lat": data.get("lat"),
        "lng": data.get("lng"),
        "name": data.get("address") or data.get("name"),
    }


def step_llm_pick_stop(
    env: dict[str, str],
    pool: dict[str, list[dict[str, Any]]],
    current: str,
    visited: list[str],
) -> dict[str, Any]:
    places = [p.get("name") for p in (pool.get("places") or [])[:16]]
    rests = [r.get("name") for r in (pool.get("restaurants") or [])[:12]]
    system = (
        "You pick the NEXT ONE stop for a Lisbon day trip from candidates. "
        'Return ONLY JSON: { "name": string, "reason": string }. '
        "name must be in the candidate lists. Avoid visited."
    )
    user = (
        f"Current stop: {current}\n"
        f"Visited: {json.dumps(visited)}\n"
        "Time now: ~11:00 (lunch soon)\n"
        f"Attractions: {json.dumps(places)}\n"
        f"Restaurants: {json.dumps(rests)}"
    )
    raw, elapsed = quanzil_chat(env, system, user, timeout=90)
    m = re.search(r"\{[\s\S]*\}", raw)
    parsed = json.loads(m.group(0)) if m else {}
    return {
        "elapsed_s": elapsed,
        "picked": parsed.get("name"),
        "reason": parsed.get("reason"),
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=DEFAULT_DAYS)
    ap.add_argument("--skip-llm-stop", action="store_true")
    args = ap.parse_args()
    num_days = max(1, min(args.days, 4))

    env = {**load_env(ROOT / ".env.local"), **load_env(W2P / ".env.local")}
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
        print("Missing caller key", file=sys.stderr)
        return 2

    report: dict[str, Any] = {
        "city": CITY,
        "num_days": num_days,
        "origin": ORIGIN_NAME,
        "time_from": TIME_FROM,
        "time_to": TIME_TO,
        "steps": {},
    }

    print(f"=== Lisbon {num_days}D skeleton+incremental probe ===")
    print(f"base={base} origin={ORIGIN_NAME} {TIME_FROM}-{TIME_TO}\n")

    # Step 1: discover
    print("[1/5] discover_places ...", flush=True)
    try:
        d = step_discover(base, key, num_days)
        report["steps"]["discover"] = {
            "ok": True,
            "elapsed_s": d["elapsed_s"],
            "stream_first_event_s": d["stream_first_event_s"],
            "stream_total_s": d["stream_total_s"],
            "n_places": d["n_places"],
            "n_restaurants": d["n_restaurants"],
            "inferred_must_see": d["inferred_must_see"],
        }
        pool = d["pool"]
        print(
            f"  ok {d['elapsed_s']}s (stream first {d['stream_first_event_s']}s) "
            f"places={d['n_places']} rest={d['n_restaurants']} "
            f"must_see={d['inferred_must_see']}"
        )
    except Exception as e:
        report["steps"]["discover"] = {"ok": False, "error": str(e)}
        print(f"  FAIL {e}")
        return 1

    # Step 4: geocode (do early, needed for arrange)
    print("\n[4/5] geocode origin ...", flush=True)
    geo: dict[str, Any] | None = None
    try:
        g = step_geocode(base, key)
        report["steps"]["geocode"] = {
            "ok": True,
            "elapsed_s": g["elapsed_s"],
            "lat": g["lat"],
            "lng": g["lng"],
            "name": g["name"],
        }
        if g["lat"] is not None and g["lng"] is not None:
            geo = {"lat": g["lat"], "lng": g["lng"]}
        print(f"  ok {g['elapsed_s']}s lat={g['lat']} lng={g['lng']} name={g['name']}")
    except Exception as e:
        report["steps"]["geocode"] = {"ok": False, "error": str(e)}
        print(f"  FAIL {e}")

    # Step 2: arrange_day x N (current architecture)
    print(f"\n[2/5] arrange_day x {num_days} (current architecture) ...", flush=True)
    arrange_days: list[dict[str, Any]] = []
    exclude: list[str] = []
    arrange_total = 0.0
    arranged_days_data: list[dict[str, Any]] = []
    for day_idx in range(1, num_days + 1):
        try:
            a = step_arrange_day(base, key, pool, day_idx, num_days, exclude, geo)
            arrange_total += a["elapsed_s"]
            exclude.extend(a["block_names"])
            arrange_days.append(
                {
                    "day": day_idx,
                    "ok": True,
                    "elapsed_s": a["elapsed_s"],
                    "theme": a["theme"],
                    "n_blocks": a["n_blocks"],
                    "block_names": a["block_names"],
                }
            )
            arranged_days_data.append(a["day"])
            print(
                f"  day{day_idx} ok {a['elapsed_s']}s theme={a['theme']} "
                f"blocks={a['n_blocks']} {a['block_names']}"
            )
        except Exception as e:
            arrange_days.append({"day": day_idx, "ok": False, "error": str(e)})
            arranged_days_data.append({})
            print(f"  day{day_idx} FAIL {e}")
    report["steps"]["arrange_day"] = {
        "ok": all(d.get("ok") for d in arrange_days),
        "total_s": round(arrange_total, 2),
        "per_day": arrange_days,
    }
    total_blocks = sum(d.get("n_blocks", 0) for d in arrange_days if d.get("ok"))
    print(f"  total {arrange_total:.1f}s blocks={total_blocks}")

    # Step 3: enrich x N (sequential transit)
    print(f"\n[3/5] enrich_arrange_transit x {num_days} ...", flush=True)
    enrich_days: list[dict[str, Any]] = []
    enrich_total = 0.0
    for day_idx, day_data in enumerate(arranged_days_data, start=1):
        if not day_data:
            enrich_days.append({"day": day_idx, "ok": False, "error": "no day data"})
            print(f"  day{day_idx} SKIP (no day data)")
            continue
        try:
            e = step_enrich(base, key, day_data, pool, geo)
            enrich_total += e["elapsed_s"]
            enrich_days.append(
                {
                    "day": day_idx,
                    "ok": True,
                    "elapsed_s": e["elapsed_s"],
                    "n_blocks": e["n_blocks"],
                    "n_legs": e["n_legs"],
                    "transit_outcome": e["transit_outcome"],
                }
            )
            print(
                f"  day{day_idx} ok {e['elapsed_s']}s blocks={e['n_blocks']} "
                f"legs={e['n_legs']} outcome={e['transit_outcome']}"
            )
        except Exception as e:
            enrich_days.append({"day": day_idx, "ok": False, "error": str(e)})
            print(f"  day{day_idx} FAIL {e}")
    report["steps"]["enrich"] = {
        "ok": all(d.get("ok") for d in enrich_days),
        "total_s": round(enrich_total, 2),
        "per_day": enrich_days,
    }
    print(f"  total {enrich_total:.1f}s")

    # Step 5: small LLM pick next stop (plan_next_stop proxy)
    if not args.skip_llm_stop and arrange_days and arrange_days[0].get("block_names"):
        print("\n[5/5] LLM pick next stop (plan_next_stop proxy) ...", flush=True)
        first_stop = arrange_days[0]["block_names"][0]
        visited = arrange_days[0]["block_names"][:1]
        try:
            p = step_llm_pick_stop(env, pool, first_stop, visited)
            report["steps"]["llm_pick_stop"] = {
                "ok": True,
                "elapsed_s": p["elapsed_s"],
                "picked": p["picked"],
                "reason": p["reason"],
            }
            print(f"  ok {p['elapsed_s']}s picked={p['picked']}")
        except Exception as e:
            report["steps"]["llm_pick_stop"] = {"ok": False, "error": str(e)}
            print(f"  FAIL {e}")
    else:
        report["steps"]["llm_pick_stop"] = {"ok": False, "skipped": True}

    # Summary
    current_total = arrange_total + enrich_total
    report["summary"] = {
        "current_total_s": round(current_total, 2),
        "current_per_day_avg_s": round(arrange_total / num_days, 2) if num_days else 0,
        "arrange_total_s": round(arrange_total, 2),
        "enrich_total_s": round(enrich_total, 2),
        "total_blocks": total_blocks,
        "estimate_skeleton_total_s": "1-2 min (1 LLM + 21 no-LLM fills)",
        "estimate_first_stop_s": "12-18s",
    }

    print("\n=== SUMMARY ===")
    print(f"current architecture total: {current_total:.1f}s ({current_total/60:.1f} min)")
    print(f"  arrange_day: {arrange_total:.1f}s ({arrange_total/num_days:.1f}s/day avg)")
    print(f"  enrich:       {enrich_total:.1f}s ({enrich_total/num_days:.1f}s/day avg)")
    print(f"  total blocks: {total_blocks}")
    print("section 12 estimate: 1-2 min total, 12-18s first stop")

    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nWrote {OUT_JSON}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
