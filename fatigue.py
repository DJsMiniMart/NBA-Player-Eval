"""Fatigue study: does a player produce less per minute the longer he's been on the floor?

Box scores can't answer that (coaches leave a player in when he's playing well), so this goes play by play
through ESPN's play-by-play and, for every player, files each second on the floor and each stat under
  "g": how many minutes he had already played in that game (0-6, 6-12, ... 42-48, 48+), and
  "s": how long he'd been on the floor in his current stint (0-2, 2-4, ... 10-12, 12+; a new quarter starts a new stint).
Possessions while he's on the floor are counted too, so the rates can be per possession (pace slows late in games).
Garbage time is left out: 4th quarter or overtime with the margin 20+ before the play.

Output: data/fatigue/<season>.json
  {"season", "done": [game ids], "fail": {gid: tries}, "players": {espn id: {"n": name, "g": [[...]], "s": [[...]]}},
   "check": [seconds counted, box-score seconds]}   # check: the on-floor tracking should add up to the box scores
  each bucket = [seconds, team possessions, pts, ast, reb, stl, blk, tov, fga, fgm, fta, ftm]
Run by .github/workflows/fatigue.yml, newest seasons first, a time budget per run."""
import datetime as dt
import json
import os
import sys
import time

import espn_games as E

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(HERE, "data", "fatigue")
STATUS = os.path.join(OUT_DIR, "status.json")
SEASONS_BACK = 5            # this season plus the last 5
BUDGET_SEC = float(os.environ.get("FATIGUE_BUDGET_MIN", "100")) * 60
G_EDGES = [6, 12, 18, 24, 30, 36, 42, 48]          # minutes already played in the game
S_EDGES = [2, 4, 6, 8, 10, 12]                       # minutes into the current stint
GARBAGE = 20
FIELDS = 12


def bucket(edges, minutes):
    for i, e in enumerate(edges):
        if minutes < e:
            return i
    return len(edges)


def blank(name):
    return {"n": name, "g": [[0] * FIELDS for _ in range(len(G_EDGES) + 1)],
            "s": [[0] * FIELDS for _ in range(len(S_EDGES) + 1)]}


def study_game(acc, g, summary, plays):
    box = E.box_score(summary)
    by_tri = {v["tri"]: v for v in box.values()}
    if g["home"] not in by_tri or g["away"] not in by_tri or not plays:
        return False
    tris = [g["home"], g["away"]]
    other = {g["home"]: g["away"], g["away"]: g["home"]}
    tri_of_team = {tid: v["tri"] for tid, v in box.items()}
    tri_of, names, box_sec = {}, {}, 0
    for t in tris:
        for pl in by_tri[t]["players"]:
            tri_of[pl["id"]] = t
            names[pl["id"]] = pl["name"]
            box_sec += 60 * E.to_int(pl["s"].get("minutes"))
    nickname = {pid: n.lower() for pid, n in names.items()}
    starters = {t: [pl["id"] for pl in by_tri[t]["players"] if pl["starter"]] for t in tris}
    floor = {t: list(starters[t]) for t in tris}
    played = {}     # seconds played so far this game
    stint = {}      # seconds into the current stint
    tally = {}      # pid -> blank()

    def T(pid):
        return tally.setdefault(pid, blank(names.get(pid, pid)))

    def add(pid, idx, amount):
        rec = T(pid)
        m = played.get(pid, 0) / 60
        rec["g"][bucket(G_EDGES, m)][idx] += amount
        rec["s"][bucket(S_EDGES, stint.get(pid, 0) / 60)][idx] += amount

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
    counted = 0.0

    def garbage(period):
        return period >= 4 and abs(score[0] - score[1]) >= GARBAGE

    def run_clock(seconds, period):
        nonlocal counted
        if seconds <= 0:
            return
        g_bad = garbage(period)
        for t in tris:
            for pid in floor[t]:
                left = seconds
                while left > 1e-9:   # split the time where either bucket changes
                    pm, sm = played.get(pid, 0), stint.get(pid, 0)
                    to_g = next((e * 60 - pm for e in G_EDGES if e * 60 > pm + 1e-9), float("inf"))
                    to_s = next((e * 60 - sm for e in S_EDGES if e * 60 > sm + 1e-9), float("inf"))
                    piece = min(left, to_g, to_s)
                    if not g_bad:
                        add(pid, 0, piece)
                    played[pid] = pm + piece
                    stint[pid] = sm + piece
                    left -= piece
                counted += seconds

    for period in sorted(by_period):
        acts = by_period[period]
        length = 720.0 if period <= 4 else 300.0
        if period > 1:   # who started the period: players who show up before being subbed in (same as espn_games)
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
        for t in tris:              # the break between quarters is rest: everyone starts a new stint
            for pid in floor[t]:
                stint[pid] = 0
        last_clock = length
        for p in acts:
            clock = float((p.get("clock") or {}).get("value") or 0)
            if clock < last_clock:
                run_clock(last_clock - clock, period)
                last_clock = clock
            kind = str((p.get("type") or {}).get("text", "")).lower()
            text = str(p.get("text") or "")
            ppl = people(p)
            team = tri_of_team.get(E.ref_id(p.get("team"), "teams")) or (tri_of.get(ppl[0][0]) if ppl else None)
            if kind == "substitution":
                ins, outs = E.sub_in_out(p, ppl, nickname)
                t = team or tri_of.get((ins + outs + [None])[0])
                if t in floor:
                    floor[t] = [x for x in floor[t] if x not in outs]
                    for pid in ins:
                        if pid not in floor[t]:
                            floor[t].append(pid)
                            stint[pid] = 0
                continue
            skip = garbage(period)
            hs, as_ = E.to_int(p.get("homeScore")), E.to_int(p.get("awayScore"))
            if (hs, as_) != score and hs >= score[0] and as_ >= score[1]:
                score = (hs, as_)
            if skip or team not in other or not ppl:
                continue
            who = ppl[0][0]
            shooting = bool(p.get("shootingPlay")) and "free throw" not in kind
            made = bool(p.get("scoringPlay"))
            poss = 1.0 if shooting or "turnover" in kind else .44 if "free throw" in kind else -1.0 if "offensive rebound" in kind else 0.0
            if poss:
                for pid in floor[team] + floor[other[team]]:
                    add(pid, 1, poss / 2)     # possessions played (both ends), split evenly
            if shooting:
                pts = E.to_int(p.get("pointsAttempted")) or (3 if "three point" in text.lower() else 2)
                add(who, 8, 1)
                if made:
                    add(who, 9, 1)
                    add(who, 2, pts)
                    helper = next((pid for pid, ty in ppl[1:] if "assist" in ty), None) or (ppl[1][0] if len(ppl) > 1 and "assist" in text.lower() else None)
                    if helper and helper != who:
                        add(helper, 3, 1)
                else:
                    blocker = next((pid for pid, ty in ppl[1:] if "block" in ty), None) or (ppl[1][0] if len(ppl) > 1 and "block" in text.lower() else None)
                    if blocker:
                        add(blocker, 6, 1)
            elif "free throw" in kind:
                add(who, 10, 1)
                if made:
                    add(who, 11, 1)
                    add(who, 2, 1)
            elif "rebound" in kind:
                if tri_of.get(who):
                    add(who, 4, 1)
            elif "turnover" in kind:
                add(who, 7, 1)
                if len(ppl) > 1 and "steal" in text.lower():
                    add(next((pid for pid, ty in ppl[1:] if "steal" in ty), ppl[1][0]), 5, 1)
        run_clock(last_clock, period)
    for pid, rec in tally.items():
        cur = acc["players"].setdefault(pid, blank(rec["n"]))
        cur["n"] = rec["n"]
        for k in ("g", "s"):
            for i, row in enumerate(rec[k]):
                for j, v in enumerate(row):
                    cur[k][i][j] = round(cur[k][i][j] + v, 2)
    chk = acc.setdefault("check", [0, 0])
    chk[0] += round(counted)
    chk[1] += box_sec
    return True


def season_games(year, current):
    today = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=5)).date()
    if year == current:
        games = E.scoreboard(year, today)
    else:
        games = [g for g in E.scoreboard(year, dt.date(year, 10, 31), wide=True)
                 if g.get("sy") == year or (not g.get("sy") and g["date"][:10] <= f"{year}-08-31")]
    return [g for g in games if g["state"] == 3 and g["reg"]]


def run(current):
    os.makedirs(OUT_DIR, exist_ok=True)
    t0 = time.time()
    status = E.load(STATUS, {}) or {}
    for year in range(current, current - SEASONS_BACK - 1, -1):
        if time.time() - t0 > BUDGET_SEC:
            break
        label = E.season_label(year)
        path = os.path.join(OUT_DIR, f"{label}.json")
        acc = E.load(path, None) or {"season": label, "done": [], "fail": {}, "players": {}, "check": [0, 0]}
        games = season_games(year, current)
        done = set(acc["done"]) | {gid for gid, n in acc["fail"].items() if n >= 3}
        todo = [g for g in games if g["id"] not in done]
        print(f"Fatigue {label}: {len(games)} games, {len(todo)} to go")
        n = 0
        for g in todo:
            if time.time() - t0 > BUDGET_SEC:
                break
            ok = False
            try:
                summary = E.get_json(f"{E.SITE}/summary?event={g['id']}")
                plays = E.plays_for(g["id"]) if summary else None
                ok = bool(summary and plays and study_game(acc, g, summary, plays))
            except Exception as e:  # noqa: BLE001 -- one odd game shouldn't stop the rest
                print(f"Fatigue: skipped {g['id']} ({e})")
            if ok:
                acc["done"].append(g["id"])
                n += 1
            else:
                acc["fail"][g["id"]] = acc["fail"].get(g["id"], 0) + 1
            if n and n % 100 == 0:
                E.save(path, acc)
        E.save(path, acc)
        left = len([g for g in games if g["id"] not in set(acc["done"]) and acc["fail"].get(g["id"], 0) < 3])
        status[label] = {"games": len(games), "done": len(acc["done"]), "left": left,
                         "check": acc["check"], "at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")}
        print(f"Fatigue {label}: +{n} games, {len(acc['done'])} saved, {left} left; on-floor seconds {acc['check'][0]} vs box {acc['check'][1]}")
    status["left"] = sum(v["left"] for k, v in status.items() if isinstance(v, dict))
    E.save(STATUS, status)
    return status["left"]


if __name__ == "__main__":
    n = dt.datetime.now(dt.timezone.utc)
    left = run(n.year + (1 if n.month >= 8 else 0))
    print(f"Fatigue: {left} games left across the study seasons")
    sys.exit(0)
