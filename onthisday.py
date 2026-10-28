"""On this day in the NBA -> data/onthisday.json, from every game since 2002-03 (data/pbp/*.json).

For each calendar date (MM-DD): the biggest scoring nights, the best all-around nights by Pulse, triple-doubles
with big numbers, and the wildest games (most overtimes, highest-scoring). Up to 6 items per date, spread across
different years. Rebuilt in the daily update so this season's games join the list."""
import glob
import json
import os
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")
PBP = os.path.join(DATA, "pbp")
OUT = os.path.join(DATA, "onthisday.json")
PER_DAY = 6


def pp(l):
    return l[5] + 2 * l[6] + 2 * (l[7] + l[8]) + 4 * l[9] + l[10] - 4 * l[11]


def build():
    idmap = {}
    try:
        with open(os.path.join(DATA, "idmap.json"), encoding="utf-8") as f:
            idmap = json.load(f)
    except (OSError, ValueError):
        pass
    cand = defaultdict(list)   # MM-DD -> [(score, year, kind, text, bbr id or None, gid)]
    for path in sorted(glob.glob(os.path.join(PBP, "20*.json"))):
        try:
            with open(path, encoding="utf-8") as f:
                d = json.load(f)
        except (OSError, ValueError):
            continue
        tg = d.get("tgames") or {}
        for gid, (date, h, a, hl, al, gm) in tg.items():
            if not hl[0] or not al[0]:
                continue
            md, yr = date[5:10], int(date[:4])
            ots = max(0, (gm - 48) // 5)
            tot = hl[0] + al[0]
            w, l_, ws, ls = (h, a, hl[0], al[0]) if hl[0] > al[0] else (a, h, al[0], hl[0])
            if ots >= 2:
                cand[md].append((60 + 15 * ots, yr, "game", f"{w} beat {l_} {ws}-{ls} in {'triple' if ots == 3 else 'quadruple' if ots == 4 else 'double' if ots == 2 else str(ots)} overtime", None, gid))
            if tot >= 270:
                cand[md].append((tot - 200, yr, "game", f"{w} beat {l_} {ws}-{ls}: {tot} combined points", None, gid))
        for pid, p in (d.get("players") or {}).items():
            name = p.get("n") or pid
            for l in p.get("logs") or []:
                g = tg.get(l[0])
                if not g or l[4] <= 0:
                    continue
                date = g[0]
                md, yr = date[5:10], int(date[:4])
                team = g[1] if l[3] == 1 else g[2]
                opp = l[2]
                pts, reb, ast = l[5], l[7] + l[8], l[6]
                bid = idmap.get(pid)
                where = f"{'vs' if l[3] == 1 else 'at'} {opp}"
                if pts >= 50:
                    cand[md].append((pts * 1.6, yr, "points", f"{name} scored {pts} for {team} {where}", bid, l[0]))
                elif pts >= 45:
                    cand[md].append((pts * 1.2, yr, "points", f"{name} scored {pts} for {team} {where}", bid, l[0]))
                tens = sum(1 for v in (pts, reb, ast, l[9], l[10]) if v >= 10)
                if tens >= 3 and pts + reb + ast >= 60:
                    cand[md].append((pts + reb + ast + 10, yr, "triple", f"{name}: {pts} points, {reb} rebounds, {ast} assists ({team} {where})", bid, l[0]))
                if l[4] >= 30 and pp(l) >= 95:
                    cand[md].append((pp(l) * 0.8, yr, "pulse", f"{name} put up {pp(l)} Pulse production ({pts}-{reb}-{ast}) for {team} {where}", bid, l[0]))
    out = {}
    for md, items in cand.items():
        items.sort(key=lambda x: -x[0])
        pick, years, seen_players = [], set(), set()
        for x in items:
            key = (x[1], x[4] or x[3])
            if key in seen_players or (x[1] in years and len(pick) >= 3):
                continue
            pick.append([x[1], x[2], x[3], x[4], x[5]])
            years.add(x[1])
            seen_players.add(key)
            if len(pick) >= PER_DAY:
                break
        out[md] = sorted(pick, key=lambda x: -x[0])
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump({"since": "2002-03", "cols": ["year", "kind", "text", "id", "gid"], "days": out}, f, separators=(",", ":"))
    print(f"On this day: {len(out)} dates, {sum(len(v) for v in out.values())} moments")


if __name__ == "__main__":
    build()
