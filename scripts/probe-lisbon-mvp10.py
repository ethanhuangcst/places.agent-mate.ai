#!/usr/bin/env python3
"""
Lisbon 4-day MVP-10 live probe — calls the new tool chain directly:
  discover_places -> make_itinerary (skeleton) -> per stop:
    display_current_stop(origin stay) -> plan_next_stop -> display_current_stop(next)

Measures skeleton streaming latency + per-stop fill latency (zero LLM expected)
against the §12.9 baseline (skeleton 15-25s, fill <3s/stop).

Usage:
  python3 scripts/probe-lisbon-mvp10.py
  python3 scripts/probe-lisbon-mvp10.py --days 3

Output: tmp/probe-lisbon-mvp10.json
"""

from __future__ import annotations

import argparse
import json
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
OUT_JSON = ROOT / "tmp" / "probe-lisbon-mvp10.json"

CITY = "Lisbon"
DEFAULT_DAYS = 4
LOCALE = "EN"
PROVIDERS = ["GOOGLE_MAPS"]
ORIGIN_NAME = "Hills Hotel Lisboa"
PACE = "medium"
BUDGET = "premium"
NATURAL_LANGUAGE = "couple trip, medium pace, prefer public transit"

BASE = "http://127.0.0.1:3010"
KEY = "pa_a3601eb21ac9752537f76a9a8dce31332f16a83ec8a382681c8a627f633bbbd1"


def http_json(path: str, body: dict[str, Any], timeout: float = 180) -> dict[str, Any]:
    req = urllib.request.Request(
        BASE + path,
        data=json.dumps(body).encode("utf-8"),
        headers={"Authorization": f"Bearer {KEY}", "Content-Type": "application/json", "Accept": "application/json"},
        method="POST",
    )
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return {"data": data, "elapsed_s": round(time.time() - t0, 2)}
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace")[:500]
        raise RuntimeError(f"HTTP {e.code} {path}: {raw}") from e


def http_ndjson(path: str, body: dict[str, Any], timeout: float = 180) -> dict[str, Any]:
    req = urllib.request.Request(
        BASE + path,
        data=json.dumps(body).encode("utf-8"),
        headers={"Authorization": f"Bearer {KEY}", "Content-Type": "application/json", "Accept": "application/x-ndjson"},
        method="POST",
    )
    t0 = time.time()
    first_event_at: float | None = None
    events: list[dict[str, Any]] = []
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        for raw_line in resp:
            line = raw_line.decode("utf-8", errors="replace").strip()
            if not line:
                continue
            if first_event_at is None:
                first_event_at = round(time.time() - t0, 2)
            try:
                events.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    return {"elapsed_s": round(time.time() - t0, 2), "first_event_s": first_event_at, "events": events}


def slim_card(c: dict[str, Any]) -> dict[str, Any]:
    o: dict[str, Any] = {"name": c.get("name")}
    if c.get("location"):
        o["location"] = c["location"]
    if isinstance(c.get("rating"), (int, float)):
        o["rating"] = c["rating"]
    return o


def step_discover(num_days: int) -> dict[str, Any]:
    body = {
        "city": CITY,
        "bounds": {"start": "2026-09-20", "end": "2026-09-23"},
        "locale": LOCALE,
        "numDays": num_days,
        "origin": {"name": ORIGIN_NAME},
        "providers": PROVIDERS,
    }
    res = http_ndjson("/v1/discover_places", body, timeout=180)
    env = http_json("/v1/discover_places", body, timeout=180)
    data = env["data"].get("data") or {}
    candidates = data.get("candidates") or {}
    pool = {
        "places": [slim_card(c) for c in (candidates.get("places") or [])],
        "restaurants": [slim_card(c) for c in (candidates.get("restaurants") or [])],
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


def step_make_itinerary(pool: dict[str, list[dict[str, Any]]], num_days: int, must_see: list[str]) -> dict[str, Any]:
    body = {
        "city": CITY,
        "numDays": num_days,
        "candidates": pool,
        "origin": {"name": ORIGIN_NAME},
        "pace": PACE,
        "budget": BUDGET,
        "must_include": must_see,
        "natural_language": NATURAL_LANGUAGE,
        "locale": LOCALE,
        "providers": PROVIDERS,
    }
    res = http_ndjson("/v1/make_itinerary", body, timeout=180)
    # Reassemble skeleton from skeleton_day stream events.
    days = [e["day"] for e in res["events"] if e.get("type") == "skeleton_day" and "day" in e]
    skeleton = {"days": days} if days else None
    # Fallback: parse skeleton from JSON envelope if no streaming
    if skeleton is None:
        env = http_json("/v1/make_itinerary", body, timeout=180)
        sk = (env["data"].get("data") or {}).get("skeleton")
        if sk:
            skeleton = {"days": sk["days"]}
    return {
        "elapsed_s": res["elapsed_s"],
        "first_event_s": res.get("first_event_s"),
        "event_count": len(res["events"]),
        "event_types": [e.get("type") for e in res["events"]],
        "skeleton": skeleton,
    }


def step_plan_next_stop(current: dict[str, Any], nxt: dict[str, Any], pool: dict[str, list[dict[str, Any]]]) -> dict[str, Any]:
    body = {
        "current_stop": current,
        "next_stop": nxt,
        "candidates": pool,
        "transit_preference": "prefer public transit",
        "locale": LOCALE,
        "providers": PROVIDERS,
    }
    res = http_json("/v1/plan_next_stop", body, timeout=120)
    data = (res["data"].get("data") or {})
    return {
        "elapsed_s": res["elapsed_s"],
        "legs": data.get("legs") or [],
        "transit_outcome": data.get("transit_outcome"),
        "single_mode": data.get("single_mode"),
    }


def step_display_current_stop(stop: dict[str, Any], pool: dict[str, list[dict[str, Any]]], prev: dict[str, Any] | None, legs: list | None) -> dict[str, Any]:
    body: dict[str, Any] = {
        "stop": stop,
        "candidates": pool,
        "locale": LOCALE,
        "providers": PROVIDERS,
    }
    if prev is None:
        body["time_from"] = "09:30"
    else:
        body["previous_stop"] = prev
    if legs:
        body["legs_to_here"] = legs
    res = http_json("/v1/display_current_stop", body, timeout=60)
    data = (res["data"].get("data") or {})
    return {
        "elapsed_s": res["elapsed_s"],
        "slot": data.get("slot"),
        "transit_outcome": data.get("transit_outcome"),
        "notes": data.get("notes") or [],
        "from_origin": data.get("from_origin"),
        "stop_kind": (data.get("stop") or {}).get("kind"),
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=DEFAULT_DAYS)
    args = ap.parse_args()
    num_days = max(1, min(args.days, 4))

    report: dict[str, Any] = {"city": CITY, "num_days": num_days, "origin": ORIGIN_NAME, "steps": {}}
    print(f"=== Lisbon {num_days}D MVP-10 live probe ===")
    print(f"base={BASE}\n")

    # 1. discover
    print("[1/3] discover_places ...", flush=True)
    try:
        d = step_discover(num_days)
        pool = d["pool"]
        must_see = d["inferred_must_see"]
        report["steps"]["discover"] = {
            "ok": True, "elapsed_s": d["elapsed_s"],
            "stream_first_event_s": d["stream_first_event_s"],
            "n_places": d["n_places"], "n_restaurants": d["n_restaurants"],
            "inferred_must_see": must_see,
        }
        print(f"  ok {d['elapsed_s']}s (first {d['stream_first_event_s']}s) places={d['n_places']} rest={d['n_restaurants']} must_see={must_see}")
    except Exception as e:
        report["steps"]["discover"] = {"ok": False, "error": str(e)}
        print(f"  FAIL {e}")
        _write(report)
        return 1

    # 2. make_itinerary (skeleton)
    print("\n[2/3] make_itinerary (skeleton, 1 LLM) ...", flush=True)
    try:
        m = step_make_itinerary(pool, num_days, must_see)
        skeleton = m["skeleton"]
        days = (skeleton or {}).get("days") or []
        report["steps"]["make_itinerary"] = {
            "ok": skeleton is not None,
            "elapsed_s": m["elapsed_s"],
            "first_event_s": m["first_event_s"],
            "event_types": m["event_types"],
            "n_days": len(days),
            "skeleton": skeleton,
        }
        print(f"  ok {m['elapsed_s']}s (first {m['first_event_s']}s) events={m['event_types']} days={len(days)}")
        for day in days:
            stops = day.get("stops") or []
            print(f"  day{day.get('day_index')} theme={day.get('day_theme')} stops={[s.get('name') for s in stops]}")
    except Exception as e:
        report["steps"]["make_itinerary"] = {"ok": False, "error": str(e)}
        print(f"  FAIL {e}")
        _write(report)
        return 1

    # 3. per-stop fill (plan_next_stop + display_current_stop) — zero LLM
    print(f"\n[3/3] per-stop fill (plan_next_stop + display_current_stop, zero LLM) ...", flush=True)
    fill_results: list[dict[str, Any]] = []
    fill_total = 0.0
    prev_stop_summary: dict[str, Any] | None = None
    for day in days:
        day_idx = day.get("day_index")
        stops = day.get("stops") or []
        print(f"  -- day{day_idx} ({len(stops)} stops) --")
        for i, stop in enumerate(stops):
            stop_name = stop.get("name")
            stop_kind = stop.get("kind")
            try:
                if i == 0:
                    # origin stay: display only (no plan_next_stop inbound)
                    dc = step_display_current_stop(stop, pool, None, None)
                    fill_total += dc["elapsed_s"]
                    fill_results.append({"day": day_idx, "stop": stop_name, "kind": stop_kind, "step": "display(origin)", **dc})
                    print(f"    display(origin) {stop_name} {dc['elapsed_s']}s slot={dc['slot']} notes={dc['notes']}")
                    prev_stop_summary = {"name": stop_name, "end_time": (dc["slot"] or {}).get("end"), "kind": stop_kind}
                else:
                    pn = step_plan_next_stop({"name": stops[i-1].get("name"), "kind": stops[i-1].get("kind")}, stop, pool)
                    fill_total += pn["elapsed_s"]
                    dc = step_display_current_stop(stop, pool, prev_stop_summary, pn["legs"])
                    fill_total += dc["elapsed_s"]
                    fill_results.append({
                        "day": day_idx, "stop": stop_name, "kind": stop_kind, "step": "plan+display",
                        "plan_elapsed_s": pn["elapsed_s"], "display_elapsed_s": dc["elapsed_s"],
                        "transit_outcome": pn["transit_outcome"], "single_mode": pn["single_mode"],
                        "n_legs": len(pn["legs"]), "slot": dc["slot"], "notes": dc["notes"],
                    })
                    print(f"    plan+display {stop_name} plan={pn['elapsed_s']}s display={dc['elapsed_s']}s outcome={pn['transit_outcome']} legs={len(pn['legs'])} slot={dc['slot']}")
                    prev_stop_summary = {"name": stop_name, "end_time": (dc["slot"] or {}).get("end"), "kind": stop_kind}
            except Exception as e:
                fill_results.append({"day": day_idx, "stop": stop_name, "ok": False, "error": str(e)})
                print(f"    FAIL {stop_name}: {e}")
    report["steps"]["fill"] = {"ok": all("error" not in r for r in fill_results), "total_s": round(fill_total, 2), "per_stop": fill_results}
    print(f"  fill total {fill_total:.1f}s ({fill_total/len(fill_results):.2f}s/stop avg)" if fill_results else "  no stops")

    # Summary vs §12.9 baseline
    skel_s = report["steps"]["make_itinerary"]["elapsed_s"]
    report["summary"] = {
        "skeleton_total_s": skel_s,
        "skeleton_first_event_s": report["steps"]["make_itinerary"].get("first_event_s"),
        "fill_total_s": round(fill_total, 2),
        "fill_per_stop_avg_s": round(fill_total / len(fill_results), 2) if fill_results else 0,
        "n_stops_filled": len(fill_results),
        "baseline_skeleton_s": "15-25",
        "baseline_first_stop_s": "<3",
        "verdict_skeleton": "PASS" if skel_s < 30 else "SLOW",
        "verdict_fill": "PASS" if (fill_total / max(len(fill_results), 1)) < 3 else "SLOW",
    }
    print("\n=== SUMMARY (vs §12.9 baseline) ===")
    print(f"skeleton: {skel_s}s (first event {report['steps']['make_itinerary'].get('first_event_s')}s) — baseline 15-25s → {report['summary']['verdict_skeleton']}")
    print(f"fill: {fill_total:.1f}s total, {report['summary']['fill_per_stop_avg_s']}s/stop — baseline <3s/stop → {report['summary']['verdict_fill']}")

    _write(report)
    return 0


def _write(report: dict[str, Any]) -> None:
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nWrote {OUT_JSON}")


if __name__ == "__main__":
    raise SystemExit(main())
