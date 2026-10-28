"""Head-to-head results for the matchup pages -> data/h2h.json: every game of this season and the last two,
as [date, home, away, home pts, away pts, overtimes], grouped by team pair ("BOS-NYK", codes in alphabetical order)."""
import glob
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
PBP = os.path.join(HERE, "data", "pbp")
OUT = os.path.join(HERE, "data", "h2h.json")
SEASONS = 3


def build():
    files = sorted(glob.glob(os.path.join(PBP, "20*.json")))[-SEASONS:]
    pairs = {}
    for path in files:
        try:
            with open(path, encoding="utf-8") as f:
                tg = (json.load(f) or {}).get("tgames") or {}
        except (OSError, ValueError):
            continue
        for gid, (date, h, a, hl, al, gm) in tg.items():
            if not hl[0] or not al[0]:
                continue
            key = "-".join(sorted((h, a)))
            pairs.setdefault(key, []).append([date, h, a, hl[0], al[0], max(0, (gm - 48) // 5), gid])
    for v in pairs.values():
        v.sort(key=lambda r: r[0], reverse=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump({"seasons": [os.path.basename(p)[:-5] for p in files], "pairs": pairs}, f, separators=(",", ":"))
    print(f"Head-to-head: {len(pairs)} pairs")


if __name__ == "__main__":
    build()
