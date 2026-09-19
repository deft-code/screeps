#!/usr/bin/env python3
"""Season scoreboard scraper: pulls the full scoreboard twice and reports score growth.

    python scoreboard.py              # 300 s between pulls
    python scoreboard.py --interval 60 --csv growth.csv

The API hangs for limit > 20, so pages are fetched 20 at a time.
"""
import argparse
import csv
import json
import sys
import time
import urllib.request

API = "https://screeps.com/season/api/scoreboard/list?limit={limit}&offset={offset}&search="
PAGE = 20


def fetch_page(offset, retries=3):
    url = API.format(limit=PAGE, offset=offset)
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(url, timeout=30) as resp:
                data = json.load(resp)
            if data.get("ok") != 1:
                raise RuntimeError(f"bad response: {data}")
            return data
        except Exception as e:
            if attempt == retries - 1:
                raise
            print(f"offset {offset}: {e}; retrying", file=sys.stderr)
            time.sleep(2)


def pull():
    """Return ({username: score}, fetch time) for every player on the scoreboard."""
    scores, offset, total = {}, 0, None
    t = time.time()
    while total is None or offset < total:
        data = fetch_page(offset)
        total = data["meta"]["length"]
        users = data["users"]
        if not users:
            break
        for u in users:
            scores[u["username"]] = u.get("score", 0)
        offset += PAGE
    return scores, t


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--interval", type=float, default=300, help="seconds between the two pulls")
    ap.add_argument("--csv", help="also write results to this CSV file")
    args = ap.parse_args()

    first, t1 = pull()
    print(f"pull 1: {len(first)} players; waiting {args.interval:g}s", file=sys.stderr)
    time.sleep(args.interval)
    second, t2 = pull()
    print(f"pull 2: {len(second)} players", file=sys.stderr)

    hours = (t2 - t1) / 3600
    rows = []
    for name, s2 in second.items():
        if s2 <= 0:
            continue
        s1 = first.get(name, 0)
        delta = s2 - s1
        rows.append({
            "username": name,
            "score1": s1,
            "score2": s2,
            "delta": delta,
            "per_hour": delta / hours,
            "per_day": delta / hours * 24,
            "pct_per_hour": (delta / s1 * 100 / hours) if s1 > 0 else None,
        })
    rows.sort(key=lambda r: r["per_hour"], reverse=True)

    print(f"{'#':>3} {'username':<20} {'score':>10} {'delta':>8} {'/hour':>10} {'/day':>11} {'%/hour':>7}")
    for i, r in enumerate(rows, 1):
        pct = f"{r['pct_per_hour']:.2f}" if r["pct_per_hour"] is not None else "new"
        print(f"{i:>3} {r['username']:<20} {r['score2']:>10} {r['delta']:>8} "
              f"{r['per_hour']:>10.0f} {r['per_day']:>11.0f} {pct:>7}")

    if args.csv:
        with open(args.csv, "w", newline="") as f:
            w = csv.DictWriter(f, fieldnames=list(rows[0]) if rows else ["username"])
            w.writeheader()
            w.writerows(rows)


if __name__ == "__main__":
    main()
