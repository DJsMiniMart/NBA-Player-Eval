"""Defense test: who's on the floor for every stretch of every game, so each player's effect on the other team can be
measured (adjusted for teammates and opponents). Also counts charges drawn.

Goes through ESPN play-by-play (same on-floor tracking as espn_games.py) and saves data/lineups/<season>.json:
  {"season", "done": [game ids], "fail": {gid: tries},
   "segs": [[gid, home five "id,id,...", away five, seconds, home stats, away stats], ...],
       stats = [pts, ast, reb, stl, blk, tov, fga, fta, oreb]  (the team's own numbers in that stretch)
   "charges": {espn id: charges drawn}, "fouls": {play type: count}  (fouls: to check how ESPN labels charges)}
Garbage time (4th quarter or overtime, margin 20+) is left out. Run by .github/workflows/lineups.yml."""
import datetime as dt
import os
import sys
import time

import espn_games as E

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(HERE, "data", "lineups")
STATUS = os.path.join(OUT_DIR, "status.json")
SEASONS_BACK = 4
BUDGET_SEC = float(os.environ.get("LINEUPS_BUDGET_MIN", "100")) * 60
GARBAGE = 20


def study_game(acc, g, summary, plays):
    box = E.box_score(summary)
    by_tri = {v["tri"]: v for v in box.values()}
    if g["home"] not in by_tri or g["away"] not in by_tri or not plays:
        return False
    H, A = g["home"], g["away"]
    tris = [H, A]
    other = {H: A, A: H}
    tri_of_team = {tid: v["tri"] for tid, v in box.items()}
    tri_of, names = {}, {}
    for t in tris:
        for pl in by_tri[t]["players"]:
            tri_of[pl["id"]] = t
            names[pl["id"]] = pl["name"]
    nickname = {pid: n.lower() for pid, n in names.items()}
    starters = {t: [pl["id"] for pl in by_tri[t]["players"] if pl["starter"]] for t in tris}
    floor = {t: list(starters[t]) for t in tris}
    segs = []
    cur = {"key": None, "sec": 0.0, "st": {H: [0] * 9, A: [0] * 9}}

    def key():
        if len(floor[H]) != 5 or len(floor[A]) != 5:
            return None
        return (",".join(sorted(floor[H])), ",".join(sorted(floor[A])))

    def flush():
        if cur["key"] and (cur["sec"] > 0 or any(cur["st"][H]) or any(cur["st"][A])):
            segs.append([g["id"], cur["key"][0], cur["key"][1], round(cur["sec"]), cur["st"][H], cur["st"][A]])
        cur["key"], cur["sec"], cur["st"] = key(), 0.0, {H: [0] * 9, A: [0] * 9}

    def people(p):
        out = []
        for x in sorted(p.get("participants") or [], key=lambda x: E.to_int(x.get("order"))):
            pid = E.ref_id(x.get("athlete"), "athletes")
            if pid:
                out.append((pid, str(x.get("type") or "").lower()))
        return out

    plays = sorted(plays, key=lambda p: (E.to_int((p.get("period") or {}).get("number")),
                                         -float((p.get("clock") or {}).get("value") or 0), E.to_int(p.get("sequenceNumber"))))
    by_period = {}
    for p in plays:
        by_period.setdefault(E.to_int((p.get("period") or {}).get("number")) or 1, []).append(p)
    score = (0, 0)
    for period in sorted(by_period):
        acts = by_period[period]
        length = 720.0 if period <= 4 else 300.0
        if period > 1:
            seen, first = set(), {t: [] for t in tris}
            for p in acts:
                kind = str((p.get("type") or {}).get("text", "")).lower()
                ppl = people(p)
                if kind == "substitution" and ppl:
                    ins, outs = E.sub_in_out(p, ppl, nickname)
                    for pid in outs:
                        t = tri_of.get(pid)
                        if t and pid not in seen:
                            first[t].append(pid)
                        seen.add(pid)
                    seen.update(ins)
                    continue
                for pid, _ in ppl:
                    t = tri_of.get(pid)
                    if t and pid not in seen:
                        seen.add(pid)
                        first[t].append(pid)
            for t in tris:
                five = first[t][:5]
                for pid in floor[t] + starters[t]:
                    if len(five) >= 5:
                        break
                    if pid not in five and pid not in seen:
                        five.append(pid)
                floor[t] = five
        flush()
        last_clock = length
        for p in acts:
            clock = float((p.get("clock") or {}).get("value") or 0)
            garbage = period >= 4 and abs(score[0] - score[1]) >= GARBAGE
            if clock < last_clock:
                if not garbage:
                    cur["sec"] += last_clock - clock
                last_clock = clock
            kind = str((p.get("type") or {}).get("text", "")).lower()
            text = str(p.get("text") or "")
            ppl = people(p)
            team = tri_of_team.get(E.ref_id(p.get("team"), "teams")) or (tri_of.get(ppl[0][0]) if ppl else None)
            if kind == "substitution":
                ins, outs = E.sub_in_out(p, ppl, nickname)
                t = team or tri_of.get((ins + outs + [None])[0])
                if t in floor:
                    new = [x for x in floor[t] if x not in outs]
                    for pid in ins:
                        if pid not in new:
                            new.append(pid)
                    if new != floor[t]:
                        floor[t] = new
                        flush()
                continue
            hs, as_ = E.to_int(p.get("homeScore")), E.to_int(p.get("awayScore"))
            if "foul" in kind or "charge" in kind:
                acc["fouls"][kind] = acc["fouls"].get(kind, 0) + 1
                if "charge" in kind or "charge" in text.lower():
                    drawer = next((pid for pid, ty in ppl[1:] if pid != (ppl[0][0] if ppl else None)), None)
                    if drawer:
                        acc["charges"][drawer] = acc["charges"].get(drawer, 0) + 1
            if (hs, as_) != score and hs >= score[0] and as_ >= score[1]:
                if not garbage:
                    cur["st"][H][0] += hs - score[0]
                    cur["st"][A][0] += as_ - score[1]
                score = (hs, as_)
            if garbage or team not in other or not ppl:
                continue
            st = cur["st"][team]
            shooting = bool(p.get("shootingPlay")) and "free throw" not in kind
            if shooting:
                st[6] += 1
                if p.get("scoringPlay") and (any("assist" in ty for _, ty in ppl[1:]) or "assist" in text.lower()):
                    st[1] += 1
                if not p.get("scoringPlay") and len(ppl) > 1 and (any("block" in ty for _, ty in ppl[1:]) or "block" in text.lower()):
                    cur["st"][other[team]][4] += 1
            elif "free throw" in kind:
                st[7] += 1
            elif "rebound" in kind:
                if tri_of.get(ppl[0][0]) == team:
                    st[2] += 1
                    if "offensive" in kind:
                        st[8] += 1
            elif "turnover" in kind:
                st[5] += 1
                if len(ppl) > 1 and "steal" in text.lower():
                    cur["st"][other[team]][3] += 1
        if last_clock > 0 and not (period >= 4 and abs(score[0] - score[1]) >= GARBAGE):
            cur["sec"] += last_clock
        flush()
    acc["segs"] += segs
    return True


def season_games(year, current):
    today = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=5)).date()
    if year == current:
        games = E.scoreboard(year, today)
    else:
        games = [g for g in E.scoreboard(year, dt.date(year, 10, 31), wide=True)
                 if g.get("sy") == year or (not g.get("sy") and g["date"][:10] <= f"{year}-08-31")]
    return [g for g in games if g["state"] == 3 and g["reg"]]


def hustle_check(status):
    """Can the update reach the NBA's hustle stats (deflections, contests)? Saved so we know."""
    url = "https://stats.nba.com/stats/leaguehustlestatsplayer?PerMode=Totals&Season=2025-26&SeasonType=Regular%20Season"
    try:
        from urllib.request import Request, urlopen
        req = Request(url, headers={"User-Agent": "Mozilla/5.0", "Referer": "https://www.nba.com/", "Origin": "https://www.nba.com",
                                    "Accept": "application/json", "x-nba-stats-origin": "stats", "x-nba-stats-token": "true"})
        with urlopen(req, timeout=30) as r:
            body = r.read()
        status["hustle"] = {"ok": True, "bytes": len(body)}
        os.makedirs(OUT_DIR, exist_ok=True)
        with open(os.path.join(OUT_DIR, "hustle-2025-26.json"), "wb") as f:
            f.write(body)
    except Exception as e:  # noqa: BLE001
        status["hustle"] = {"ok": False, "error": str(e)[:200]}


def run(current):
    os.makedirs(OUT_DIR, exist_ok=True)
    t0 = time.time()
    status = E.load(STATUS, {}) or {}
    if "hustle" not in status or not status["hustle"].get("ok"):
        hustle_check(status)
    for year in range(current - 1, current - SEASONS_BACK - 1, -1):
        if time.time() - t0 > BUDGET_SEC:
            break
        label = E.season_label(year)
        path = os.path.join(OUT_DIR, f"{label}.json")
        acc = E.load(path, None) or {"season": label, "done": [], "fail": {}, "segs": [], "charges": {}, "fouls": {}}
        games = season_games(year, current)
        done = set(acc["done"]) | {gid for gid, n in acc["fail"].items() if n >= 3}
        todo = [g for g in games if g["id"] not in done]
        print(f"Lineups {label}: {len(games)} games, {len(todo)} to go")
        n = 0
        for g in todo:
            if time.time() - t0 > BUDGET_SEC:
                break
            ok = False
            try:
                summary = E.get_json(f"{E.SITE}/summary?event={g['id']}")
                plays = E.plays_for(g["id"]) if summary else None
                ok = bool(summary and plays and study_game(acc, g, summary, plays))
            except Exception as e:  # noqa: BLE001
                print(f"Lineups: skipped {g['id']} ({e})")
            if ok:
                acc["done"].append(g["id"])
                n += 1
            else:
                acc["fail"][g["id"]] = acc["fail"].get(g["id"], 0) + 1
            if n and n % 200 == 0:
                E.save(path, acc)
        E.save(path, acc)
        left = len([g for g in games if g["id"] not in set(acc["done"]) and acc["fail"].get(g["id"], 0) < 3])
        status[label] = {"games": len(games), "done": len(acc["done"]), "left": left, "segs": len(acc["segs"]),
                         "at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")}
        print(f"Lineups {label}: +{n} games, {len(acc['done'])} saved, {left} left")
    status["left"] = sum(v["left"] for k, v in status.items() if isinstance(v, dict) and "left" in v)
    E.save(STATUS, status)
    return status["left"]


if __name__ == "__main__":
    n = dt.datetime.now(dt.timezone.utc)
    print(f"Lineups: {run(n.year + (1 if n.month >= 8 else 0))} games left")
    sys.exit(0)
