"""This season's games from ESPN's public feeds, for the player and team pages.

The NBA's own feed (cdn.nba.com, used by nba_games.py) refuses GitHub's servers, so the daily update
reads ESPN instead and writes the same file the rest of the site uses, data/pbp/<season>.json:

  - every player's game log (minutes, points, rebounds, ... and the result)
  - every shot (zone + 2-ft court cell), who assisted whom, steal and block types
  - each team's box score per game ("tgames"), for the team pages' stats, filters and ranks
  - every five-man lineup each team used: seconds, points for/against, possessions ("stints")

It also saves the season schedule to data/schedule.json.

Feeds used (no key needed):
  scoreboard  site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=YYYYMMDD
  box score   site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=<id>
  plays       sports.core.api.espn.com/v2/sports/basketball/leagues/nba/events/<id>/competitions/<id>/plays
"""
import datetime as dt
import gzip
import json
import os
import re
import time
from urllib.request import Request, urlopen

HERE = os.path.dirname(os.path.abspath(__file__))
PBP_DIR = os.path.join(HERE, "data", "pbp")
SCHEDULE_PATH = os.path.join(HERE, "data", "schedule.json")
SITE = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba"
CORE = "https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba"
PAUSE = 0.4
TIME_BUDGET_SEC = 90 * 60
SCHEMA = "espn-2"   # 2: crunch-time (clutch) stats per player per game
HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
                         "Chrome/124.0 Safari/537.36", "Accept": "application/json", "Accept-Encoding": "gzip"}
# ESPN abbreviation -> NBA's
ABBR = {"GS": "GSW", "NY": "NYK", "NO": "NOP", "SA": "SAS", "UTAH": "UTA", "WSH": "WAS", "BRK": "BKN", "PHO": "PHX"}
THREES = {"Left Corner 3", "Right Corner 3", "Above the Break 3", "Backcourt"}


def tri(a):
    a = str(a or "").upper()
    return ABBR.get(a, a)


def season_label(end_year):
    return f"{end_year - 1}-{str(end_year)[2:]}"


def get_json(url, tries=3):
    for i in range(tries):
        try:
            with urlopen(Request(url, headers=HEADERS), timeout=40) as r:
                raw = r.read()
                if r.headers.get("Content-Encoding") == "gzip" or raw[:2] == b"\x1f\x8b":
                    raw = gzip.decompress(raw)
                time.sleep(PAUSE)
                return json.loads(raw.decode("utf-8"))
        except Exception as e:  # noqa: BLE001
            if getattr(e, "code", None) == 404 or i == tries - 1:
                print(f"ESPN: couldn't read {url} ({e})")
                return None
            time.sleep(4 * (i + 1))
    return None


def load(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def save(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, separators=(",", ":"))
    os.replace(tmp, path)


def ref_id(obj, kind):
    """{'$ref': '.../athletes/4251?...'} or {'id': '4251'} -> '4251'"""
    if not isinstance(obj, dict):
        return None
    if obj.get("id"):
        return str(obj["id"])
    m = re.search(rf"/{kind}/(\d+)", str(obj.get("$ref", "")))
    return m.group(1) if m else None


def to_int(v):
    try:
        return int(str(v).replace("+", "").strip())
    except (TypeError, ValueError):
        return 0


def made_att(v):
    m = re.match(r"^\s*(\d+)\s*-\s*(\d+)", str(v or ""))
    return (int(m.group(1)), int(m.group(2))) if m else (0, 0)


# ---------- schedule ----------
def season_days(end_year, today, wide=False):
    # wide: past seasons, covering the bubble season (to October 2020) and the late-starting 2020-21 one
    d = dt.date(end_year - 1, 9, 1) if wide else dt.date(end_year - 1, 10, 1)
    last = dt.date(end_year, 10, 31) if wide else min(dt.date(end_year, 6, 30), today + dt.timedelta(days=200))
    while d <= last:
        yield d
        d += dt.timedelta(days=1)


def scoreboard(end_year, today, wide=False):
    """Every game this season: [{id, date, home, away, state, hs, as, arena, tv, kind, reg, sy}]"""
    games = {}
    # one request per month; fall back to one per day if a month comes back short
    months = sorted({(d.year, d.month) for d in season_days(end_year, today, wide)})
    for y, m in months:
        start = dt.date(y, m, 1)
        end = (dt.date(y + (m == 12), m % 12 + 1, 1) - dt.timedelta(days=1))
        data = get_json(f"{SITE}/scoreboard?dates={start:%Y%m%d}-{end:%Y%m%d}&limit=1000")
        events = (data or {}).get("events") or []
        lo, hi = f"{start - dt.timedelta(days=1):%Y-%m-%d}", f"{end + dt.timedelta(days=2):%Y-%m-%d}"
        in_month = events and all(lo <= str(e.get("date", ""))[:10] <= hi for e in events)
        if not in_month:
            # the month request didn't work: ask one day at a time (the whole season, for the schedule)
            events = []
            for d in (start + dt.timedelta(days=i) for i in range((end - start).days + 1)):
                day = get_json(f"{SITE}/scoreboard?dates={d:%Y%m%d}")
                events += (day or {}).get("events") or []
        for e in events:
            g = parse_event(e)
            if g:
                games[g["id"]] = g
    return sorted(games.values(), key=lambda g: (g["date"], g["id"]))


def parse_event(e):
    try:
        comp = (e.get("competitions") or [{}])[0]
        stype = to_int((e.get("season") or {}).get("type") or (comp.get("type") or {}).get("id"))
        if stype == 1:
            return None   # preseason
        teams = {c.get("homeAway"): c for c in comp.get("competitors", [])}
        h, a = teams.get("home"), teams.get("away")
        if not h or not a:
            return None
        st = (comp.get("status") or e.get("status") or {}).get("type") or {}
        state = {"pre": 1, "in": 2, "post": 3}.get(st.get("state"), 1)
        if st.get("completed"):
            state = 3
        notes = " ".join(n.get("headline", "") for n in comp.get("notes") or [])
        kind = "Playoffs" if stype == 3 else "Play-in" if stype == 5 else "NBA Cup" if "cup" in notes.lower() else ""
        tv = []
        for b in comp.get("broadcasts") or []:
            tv += b.get("names") or []
        score = lambda c: to_int(c.get("score") if not isinstance(c.get("score"), dict) else c["score"].get("value"))  # noqa: E731
        return {"id": str(e["id"]), "date": e.get("date") or comp.get("date") or "", "home": tri(h["team"].get("abbreviation")),
                "away": tri(a["team"].get("abbreviation")), "state": state, "hs": score(h), "as": score(a),
                "arena": (comp.get("venue") or {}).get("fullName", ""), "tv": ", ".join(dict.fromkeys(tv)),
                "kind": kind, "reg": stype == 2, "sy": to_int((e.get("season") or {}).get("year"))}
    except Exception as ex:  # noqa: BLE001
        print(f"ESPN: skipped an event ({ex})")
        return None


def save_schedule(games, label):
    rows = [[g["id"], g["date"], g["home"], g["away"], g["state"], g["hs"], g["as"], g["arena"], g["tv"], g["kind"]]
            for g in games]
    if rows:
        save(SCHEDULE_PATH, {"season": label, "source": "espn", "games": rows})
        print(f"Schedule: {len(rows)} games")


# ---------- one game ----------
def blank_player(name):
    return {"n": name, "t": [], "logs": [], "z": {}, "b": {}, "at": {}, "af": {}, "ua": {},
            "st": {"on": 0, "off": 0, "oth": 0}, "bk": {"rim": 0, "paint": 0, "mid": 0, "three": 0}}


def box_score(summary):
    """-> {espn team id: {"tri", "stats": {name: displayValue}, "players": [{id, name, starter, dnp, s: {key: value}}]}}"""
    box = summary.get("boxscore") or {}
    out = {}
    for t in box.get("teams", []):
        team = t.get("team") or {}
        out[str(team.get("id"))] = {"tri": tri(team.get("abbreviation")),
                                    "stats": {s.get("name"): s.get("displayValue") for s in t.get("statistics", [])},
                                    "players": []}
    for t in box.get("players", []):
        team = t.get("team") or {}
        tid = str(team.get("id"))
        if tid not in out:
            out[tid] = {"tri": tri(team.get("abbreviation")), "stats": {}, "players": []}
        for block in t.get("statistics", [])[:1]:
            keys = block.get("keys") or []
            for ath in block.get("athletes", []):
                a = ath.get("athlete") or {}
                stats = ath.get("stats") or []
                out[tid]["players"].append({"id": str(a.get("id")), "name": a.get("displayName") or a.get("shortName") or "",
                                            "starter": bool(ath.get("starter")), "dnp": bool(ath.get("didNotPlay")) or not stats,
                                            "s": dict(zip(keys, stats))})
    return out


def plays_for(gid):
    out, page = [], 1
    while True:
        data = get_json(f"{CORE}/events/{gid}/competitions/{gid}/plays?limit=1000&page={page}")
        if not data:
            break
        out += data.get("items") or []
        if page >= to_int(data.get("pageCount") or 1):
            break
        page += 1
    return out


def shot_zone(p, text, pts):
    """(zone, court cell 'x,y' or None) for a shot."""
    c = p.get("coordinate") or {}
    x, y = c.get("x"), c.get("y")
    ok = isinstance(x, (int, float)) and isinstance(y, (int, float)) and -5 <= x <= 55 and -5 <= y <= 95
    if ok and y > 47:            # far end: mirror so every shot faces the same basket
        x, y = 50 - x, 94 - y
    m = re.search(r"(\d+)-foot", text)
    dist = int(m.group(1)) if m else None
    if dist is None:
        if ok:
            dist = ((x - 25) ** 2 + (y - 5.25) ** 2) ** 0.5
        elif re.search(r"layup|dunk|tip|alley|putback|hook", text, re.I):
            dist = 2
        else:
            dist = 12
    if pts == 3 or "three point" in text.lower():
        if dist >= 40:
            zone = "Backcourt"
        elif ok and y <= 9 and abs(x - 25) >= 18:
            zone = "Left Corner 3" if x < 25 else "Right Corner 3"
        else:
            zone = "Above the Break 3"
    elif dist <= 4:
        zone = "Restricted Area"
    elif (ok and 17 <= x <= 33 and y < 19) or (not ok and dist <= 9):
        zone = "In The Paint (Non-RA)"
    else:
        zone = "Mid-Range"
    cell = None
    if ok:
        cx, cy = min(max(x, 0), 49.99), min(max(y, 0), 46.99)
        cell = f"{int(cx // 2)},{int(cy // 2)}"
    return zone, cell


def add_game(acc, g, summary, plays):
    """Fold one finished game into the season file."""
    gid, date = g["id"], g["date"][:10]
    try:   # ESPN dates are UTC; a 9:30 PM Eastern tip is the next day in UTC
        date = (dt.datetime.fromisoformat(g["date"].replace("Z", "+00:00")) - dt.timedelta(hours=5)).date().isoformat()
    except ValueError:
        pass
    box = box_score(summary)
    by_tri = {v["tri"]: (tid, v) for tid, v in box.items()}
    if g["home"] not in by_tri or g["away"] not in by_tri:
        print(f"ESPN: no box score for {gid} yet")
        return False
    tri_of_team = {tid: v["tri"] for tid, v in box.items()}
    periods = max([to_int((p.get("period") or {}).get("number")) for p in plays] + [4])
    game_min = 48 + 5 * (periods - 4)
    score = {g["home"]: g["hs"], g["away"]: g["as"]}
    other = {g["home"]: g["away"], g["away"]: g["home"]}
    tri_of = {}
    names = {}
    for t, (tid, v) in by_tri.items():
        for pl in v["players"]:
            tri_of[pl["id"]] = t
            names[pl["id"]] = pl["name"]
    acc["names"].update(names)

    # player game logs
    for t, (tid, v) in by_tri.items():
        o = other[t]
        margin = score[t] - score[o]
        for pl in v["players"]:
            s = pl["s"]
            mins = to_int(s.get("minutes"))
            if pl["dnp"] or (mins == 0 and not to_int(s.get("points"))):
                continue
            p = acc["players"].setdefault(pl["id"], blank_player(pl["name"]))
            p["n"] = pl["name"]
            if t not in p["t"]:
                p["t"].append(t)
            if any(l[0] == gid for l in p["logs"]):
                continue
            fgm, fga = made_att(s.get("fieldGoalsMade-fieldGoalsAttempted"))
            tpm, tpa = made_att(s.get("threePointFieldGoalsMade-threePointFieldGoalsAttempted"))
            ftm, fta = made_att(s.get("freeThrowsMade-freeThrowsAttempted"))
            p["logs"].append([gid, date, o, 1 if t == g["home"] else 0, mins, to_int(s.get("points")),
                              to_int(s.get("assists")), to_int(s.get("defensiveRebounds")), to_int(s.get("offensiveRebounds")),
                              to_int(s.get("steals")), to_int(s.get("blocks")), to_int(s.get("turnovers")),
                              fgm, fga, tpm, tpa, ftm, fta, to_int(s.get("plusMinus")), "W" if margin > 0 else "L",
                              1 if pl["starter"] else 0, margin, game_min])

    second = shots_and_lineups(acc, g, by_tri, tri_of_team, tri_of, names, plays, other)

    # team box score: [pts, fgm, fga, 3pm, 3pa, ftm, fta, oreb, dreb, ast, stl, blk, tov, pf,
    #                  paint, fast break, second chance, points off turnovers, bench]
    def line(t):
        tid, v = by_tri[t]
        s = v["stats"]
        fgm, fga = made_att(s.get("fieldGoalsMade-fieldGoalsAttempted"))
        tpm, tpa = made_att(s.get("threePointFieldGoalsMade-threePointFieldGoalsAttempted"))
        ftm, fta = made_att(s.get("freeThrowsMade-freeThrowsAttempted"))
        if not fga:   # no team totals: add up the players
            for pl in v["players"]:
                a, b = made_att(pl["s"].get("fieldGoalsMade-fieldGoalsAttempted")); fgm += a; fga += b
                a, b = made_att(pl["s"].get("threePointFieldGoalsMade-threePointFieldGoalsAttempted")); tpm += a; tpa += b
                a, b = made_att(pl["s"].get("freeThrowsMade-freeThrowsAttempted")); ftm += a; fta += b
        tot = lambda k: sum(to_int(pl["s"].get(k)) for pl in v["players"])  # noqa: E731
        pick = lambda name, k: to_int(s.get(name)) if s.get(name) not in (None, "") else tot(k)  # noqa: E731
        opp_s = by_tri[other[t]][1]["stats"]
        return [score[t], fgm, fga, tpm, tpa, ftm, fta, pick("offensiveRebounds", "offensiveRebounds"),
                pick("defensiveRebounds", "defensiveRebounds"), pick("assists", "assists"), pick("steals", "steals"),
                pick("blocks", "blocks"), to_int(s.get("totalTurnovers") or s.get("turnovers")) or tot("turnovers"),
                pick("fouls", "fouls"), to_int(s.get("pointsInPaint")), to_int(s.get("fastBreakPoints")), second.get(t, 0),
                to_int(opp_s.get("turnoverPoints")),   # ESPN lists these as points the *other* team gave up
                sum(to_int(pl["s"].get("points")) for pl in v["players"] if not pl["starter"])]
    acc["tgames"][gid] = [date, g["home"], g["away"], line(g["home"]), line(g["away"]), game_min]
    acc["done"].append(gid)
    acc["teams"].update({tid: v["tri"] for tid, v in box.items()})
    return True


def shots_and_lineups(acc, g, by_tri, tri_of_team, tri_of, names, plays, other):
    """Shots, assists, steals and blocks per player; five-man lineup stints per team. Returns second-chance points."""
    def P(pid):
        return acc["players"].setdefault(pid, blank_player(names.get(pid, pid)))

    tris = [g["home"], g["away"]]
    starters = {t: [pl["id"] for pl in by_tri[t][1]["players"] if pl["starter"]] for t in tris}
    floor = {t: list(starters[t]) for t in tris}
    stints = {t: {} for t in tris}
    second = {t: 0 for t in tris}
    putback = {t: False for t in tris}   # possession that started with an offensive rebound
    last_clock, last_period, last_score = 720.0, 1, (0, 0)
    nickname = {pid: n.lower() for pid, n in names.items()}
    # crunch time = the last 5 minutes of the 4th quarter or overtime with the score within 5 (the NBA's "clutch")
    # per player: [seconds, pts, ast, reb, stl, blk, tov, fgm, fga, 3pm, 3pa, ftm, fta, +/-]
    CL = {}
    moments = []
    home_t = g["home"]

    def cl(pid):
        return CL.setdefault(pid, [0.0] + [0] * 13)

    def close(period, score):
        return period >= 4 and abs(score[0] - score[1]) <= 5

    def row(t):
        if len(floor[t]) != 5:
            return None
        return stints[t].setdefault(",".join(sorted(floor[t])), [0.0, 0, 0, 0.0, 0.0])

    def people(p):
        out = []
        for x in sorted(p.get("participants") or [], key=lambda x: to_int(x.get("order"))):
            pid = ref_id(x.get("athlete"), "athletes")
            if pid:
                out.append((pid, str(x.get("type") or "").lower()))
        return out

    plays = sorted(plays, key=lambda p: (to_int((p.get("period") or {}).get("number")), -float((p.get("clock") or {}).get("value") or 0),
                                         to_int(p.get("sequenceNumber"))))
    by_period = {}
    for p in plays:
        by_period.setdefault(to_int((p.get("period") or {}).get("number")) or 1, []).append(p)

    for period in sorted(by_period):
        acts = by_period[period]
        length = 720.0 if period <= 4 else 300.0
        if period > 1:   # work out who started the period: players who show up before being subbed in
            seen, first = set(), {t: [] for t in tris}
            for p in acts:
                kind = str((p.get("type") or {}).get("text", "")).lower()
                ppl = people(p)
                if kind == "substitution" and ppl:
                    ins, outs = sub_in_out(p, ppl, nickname)
                    for pid in outs:
                        t = tri_of.get(pid)
                        if t and pid not in seen:
                            first[t].append(pid)
                        seen.add(pid)
                    for pid in ins:
                        seen.add(pid)
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
        last_clock = length
        putback = {t: False for t in tris}
        for p in acts:
            clock = float((p.get("clock") or {}).get("value") or 0)
            if clock < last_clock:
                for t in tris:
                    r = row(t)
                    if r:
                        r[0] += last_clock - clock
                if close(period, last_score):
                    secs = max(0.0, min(last_clock, 300.0) - clock)
                    if secs:
                        for t in tris:
                            for pid in floor[t]:
                                cl(pid)[0] += secs
                last_clock = clock
            kind = str((p.get("type") or {}).get("text", "")).lower()
            text = str(p.get("text") or "")
            ppl = people(p)
            team = tri_of_team.get(ref_id(p.get("team"), "teams")) or (tri_of.get(ppl[0][0]) if ppl else None)
            if kind == "substitution":
                ins, outs = sub_in_out(p, ppl, nickname)
                t = team or tri_of.get((ins + outs + [None])[0])
                if t in floor:
                    floor[t] = [x for x in floor[t] if x not in outs]
                    for pid in ins:
                        if pid not in floor[t]:
                            floor[t].append(pid)
                continue
            # points
            hs, as_ = to_int(p.get("homeScore")), to_int(p.get("awayScore"))
            clutch = clock <= 300 and close(period, last_score)   # judged on the score before this play
            if clutch and (hs, as_) != last_score and hs >= last_score[0] and as_ >= last_score[1]:
                for t, pts in ((g["home"], hs - last_score[0]), (g["away"], as_ - last_score[1])):
                    if pts <= 0:
                        continue
                    for pid in floor[t]:
                        cl(pid)[13] += pts
                    for pid in floor[other[t]]:
                        cl(pid)[13] -= pts
                    if ppl and tri_of.get(ppl[0][0]) == t:
                        cl(ppl[0][0])[1] += pts
                        mine = (last_score[0] - last_score[1]) * (1 if t == home_t else -1)
                        after = mine + pts
                        if (mine <= 0 < after) or (mine < 0 == after):
                            me_after = hs if t == home_t else as_
                            them_after = as_ if t == home_t else hs
                            moments.append([ppl[0][0], period, round(clock), "go-ahead" if after > 0 else "tying", text, me_after, them_after])
            if (hs, as_) != last_score and hs >= last_score[0] and as_ >= last_score[1]:
                for t, pts in ((g["home"], hs - last_score[0]), (g["away"], as_ - last_score[1])):
                    if pts > 0:
                        r, ro = row(t), row(other[t])
                        if r:
                            r[1] += pts
                        if ro:
                            ro[2] += pts
                        if putback[t]:
                            second[t] += pts
                last_score = (hs, as_)
            if team not in other:
                continue
            shooting = bool(p.get("shootingPlay")) and "free throw" not in kind
            poss = 0.0
            if shooting:
                poss = 1.0
            elif "free throw" in kind:
                poss = 0.44
            elif "turnover" in kind:
                poss = 1.0
            elif "offensive rebound" in kind:
                poss = -1.0
            if poss:
                r, ro = row(team), row(other[team])
                if r:
                    r[3] += poss
                if ro:
                    ro[4] += poss
            # second-chance possessions: from an offensive rebound until the other team has the ball
            if "offensive rebound" in kind:
                putback[team] = True
            elif "defensive rebound" in kind or (shooting or "turnover" in kind):
                putback[other[team]] = False       # the other team got the ball back
                if "turnover" in kind or (shooting and p.get("scoringPlay")):
                    putback[team] = False
            # crunch-time box score
            if clutch and ppl:
                who = ppl[0][0]
                if shooting:
                    a3 = (to_int(p.get("pointsAttempted")) or (3 if "three point" in text.lower() else 2)) == 3
                    c = cl(who); c[8] += 1; c[7] += bool(p.get("scoringPlay"))
                    if a3:
                        c[10] += 1; c[9] += bool(p.get("scoringPlay"))
                    helper = next((pid for pid, ty in ppl[1:] if "assist" in ty), None) or (ppl[1][0] if p.get("scoringPlay") and len(ppl) > 1 and "assist" in text.lower() else None)
                    blocker = next((pid for pid, ty in ppl[1:] if "block" in ty), None) or (ppl[1][0] if not p.get("scoringPlay") and len(ppl) > 1 and "block" in text.lower() else None)
                    if helper and helper != who:
                        cl(helper)[2] += 1
                    if blocker:
                        cl(blocker)[5] += 1
                elif "free throw" in kind:
                    c = cl(who); c[12] += 1; c[11] += bool(p.get("scoringPlay"))
                elif "rebound" in kind:
                    cl(who)[3] += 1
                elif "turnover" in kind:
                    cl(who)[6] += 1
                    if len(ppl) > 1 and "steal" in text.lower():
                        cl(next((pid for pid, ty in ppl[1:] if "steal" in ty), ppl[1][0]))[4] += 1
            # shots, assists, blocks
            if shooting and ppl:
                pts = to_int(p.get("pointsAttempted")) or (3 if "three point" in text.lower() else 2)
                made = bool(p.get("scoringPlay"))
                shooter = ppl[0][0]
                zone, cell = shot_zone(p, text, pts)
                sp = P(shooter)
                z = sp["z"].setdefault(zone, [0, 0]); z[0] += 1; z[1] += made
                if cell:
                    b = sp["b"].setdefault(cell, [0, 0]); b[0] += 1; b[1] += made
                helper = next((pid for pid, ty in ppl[1:] if "assist" in ty), None) or (ppl[1][0] if made and len(ppl) > 1 and "assist" in text.lower() else None)
                blocker = next((pid for pid, ty in ppl[1:] if "block" in ty), None) or (ppl[1][0] if not made and len(ppl) > 1 and "block" in text.lower() else None)
                if made:
                    u = sp["ua"].setdefault(zone, [0, 0])
                    if helper and helper != shooter:
                        u[0] += 1
                        gp = P(helper)
                        gp["at"][shooter] = gp["at"].get(shooter, 0) + 1
                        sp["af"][helper] = sp["af"].get(helper, 0) + 1
                    else:
                        u[1] += 1
                if blocker:
                    bk = P(blocker)["bk"]
                    key = "rim" if zone == "Restricted Area" else "paint" if zone.startswith("In The Paint") else "three" if zone in THREES else "mid"
                    bk[key] += 1
            elif "turnover" in kind and len(ppl) > 1 and "steal" in text.lower():
                thief = next((pid for pid, ty in ppl[1:] if "steal" in ty), ppl[1][0])
                st = P(thief)["st"]
                low = (kind + " " + text).lower()
                if "bad pass" in low:
                    st["off"] += 1
                elif "lost ball" in low:
                    st["on"] += 1
                else:
                    st["oth"] += 1
        if last_clock > 0:
            for t in tris:
                r = row(t)
                if r:
                    r[0] += last_clock
            if close(period, last_score):
                secs = min(last_clock, 300.0)
                for t in tris:
                    for pid in floor[t]:
                        cl(pid)[0] += secs
    acc["stints"][g["id"]] = {t: [[k, round(v[0]), v[1], v[2], round(v[3], 2), round(v[4], 2)] for k, v in stints[t].items() if v[0] > 0]
                              for t in tris}
    acc.setdefault("clutch", {})[g["id"]] = {pid: [round(v[0])] + v[1:] for pid, v in CL.items() if v[0] or any(v[1:])}
    for m in moments:
        acc.setdefault("moments", {}).setdefault(m[0], []).append([g["id"]] + m[1:])
    return second


def sub_in_out(p, ppl, nickname):
    """ESPN writes 'A enters the game for B'. Returns ([who came in], [who went out])."""
    ids = [pid for pid, _ in ppl]
    if len(ids) < 2:
        return ids, []
    ins = [pid for pid, ty in ppl if "enter" in ty or ty == "in"]
    outs = [pid for pid, ty in ppl if "exit" in ty or "leav" in ty or ty == "out"]
    if ins or outs:
        return ins or [i for i in ids if i not in outs][:1], outs or [i for i in ids if i not in ins][:1]
    m = re.match(r"^(.*?)\s+enters the game for\s+(.*?)\s*$", str(p.get("text") or ""), re.I)
    if m:
        a, b = m.group(1).lower(), m.group(2).lower()
        if nickname.get(ids[1], "") == a or nickname.get(ids[0], "") == b:
            return [ids[1]], [ids[0]]
    return [ids[0]], [ids[1]]


# ---------- the season ----------
def new_acc(label):
    return {"season": label, "source": "espn", "schema": SCHEMA, "done": [], "missing": [], "players": {}, "names": {},
            "teams": {}, "tgames": {}, "stints": {}, "clutch": {}, "moments": {}, "complete": False}


def update(now, current_year):
    started = time.time()
    label = season_label(current_year)
    path = os.path.join(PBP_DIR, f"{label}.json")
    acc = load(path, None)
    if not acc or acc.get("schema") != SCHEMA:
        acc = new_acc(label)   # older NBA-feed file (empty from GitHub): start over from ESPN
    today = (now - dt.timedelta(hours=5)).date()
    games = scoreboard(current_year, today)
    print(f"ESPN: {len(games)} games on the {label} schedule, {sum(g['state'] == 3 for g in games)} final")
    save_schedule(games, label)
    done = set(acc["done"])
    todo = [g for g in games if g["state"] == 3 and g["reg"] and g["id"] not in done]
    added = 0
    for g in todo:
        if time.time() - started > TIME_BUDGET_SEC:
            print("ESPN: out of time; the rest is picked up next run")
            break
        summary = get_json(f"{SITE}/summary?event={g['id']}")
        if not summary:
            continue
        plays = plays_for(g["id"])
        try:
            if add_game(acc, g, summary, plays):
                added += 1
        except Exception as e:  # noqa: BLE001 -- one odd game shouldn't stop the rest
            print(f"ESPN: skipped game {g['id']} ({e})")
        if added % 25 == 0:
            save(path, acc)
    save(path, acc)
    print(f"ESPN: added {added} games ({len(acc['done'])} so far this season) in {int(time.time() - started)}s")
    backfill(now, current_year, started)


# ---------- earlier seasons, for careers ----------
STATUS_PATH = os.path.join(PBP_DIR, "espn_status.json")
BACKFILL_BUDGET_SEC = 75 * 60    # per run, on top of this season; the whole history takes a few days of runs
OLDEST_TRY = 2002                # ESPN's play-by-play starts around 2002-03; stop at the first season it doesn't have


def backfill(now, current_year, started):
    """Fill in past seasons from ESPN, newest first, a little each run, so player pages cover whole careers."""
    status = load(STATUS_PATH, {"complete": [], "noPlays": None})
    t0 = time.time()
    out_of_time = lambda: time.time() - t0 > BACKFILL_BUDGET_SEC  # noqa: E731
    if not status.get("retried"):   # seasons finished before retries existed: look at their failed games again
        status["complete"], status["retried"] = [], True
    for year in range(current_year - 1, OLDEST_TRY, -1):
        if out_of_time():
            break
        if status.get("noPlays") and year <= status["noPlays"]:
            break
        if year in status["complete"]:
            continue
        label = season_label(year)
        path = os.path.join(PBP_DIR, f"{label}.json")
        acc = load(path, None)
        if not acc or acc.get("schema") != SCHEMA or acc.get("source") != "espn":
            acc = new_acc(label)
        games = [g for g in scoreboard(year, dt.date(year, 10, 31), wide=True)
                 if g["state"] == 3 and g["reg"] and (g["sy"] == year if g.get("sy") else g["date"][:10] <= f"{year}-08-31")]
        tries = acc.setdefault("tries", {})
        for gid in acc.pop("missing", []):          # older files: a game that failed once counts as one try
            tries[gid] = max(tries.get(gid, 0), 1)
        acc["missing"] = []
        gave_up = {gid for gid, n in tries.items() if n >= 3}   # ESPN doesn't have it: stop asking after 3 tries
        done = set(acc["done"]) | gave_up
        todo = [g for g in games if g["id"] not in done]
        print(f"ESPN backfill {label}: {len(games)} games, {len(todo)} to go")
        added = no_plays = 0
        for g in todo:
            if out_of_time():
                break
            summary = get_json(f"{SITE}/summary?event={g['id']}")
            if not summary:
                tries[g["id"]] = tries.get(g["id"], 0) + 1
                continue
            plays = plays_for(g["id"])
            no_plays += not plays
            try:
                if add_game(acc, g, summary, plays):
                    added += 1
                    tries.pop(g["id"], None)
                else:
                    tries[g["id"]] = tries.get(g["id"], 0) + 1
            except Exception as e:  # noqa: BLE001
                print(f"ESPN: skipped game {g['id']} ({e})")
                tries[g["id"]] = tries.get(g["id"], 0) + 1
            if added % 50 == 0:
                save(path, acc)
            if added + no_plays >= 30 and no_plays > 0.8 * (added + no_plays):
                print(f"ESPN has no play-by-play for {label}; the backfill stops here")
                status["noPlays"] = year
                break
        acc["stints"] = {}   # lineups are only used for this season's team pages; leaving them out keeps the file small
        left = [g for g in games if g["id"] not in set(acc["done"]) and tries.get(g["id"], 0) < 3]
        finished = not out_of_time() and not left and len(games) > 0
        if finished:
            acc["complete"] = True
            status["complete"] = sorted(set(status["complete"]) | {year})
        save(path, acc)
        save(STATUS_PATH, status)
        print(f"ESPN backfill {label}: {len(acc['done'])} games saved{' (complete)' if finished else ''}")
        if status.get("noPlays") == year:
            break


if __name__ == "__main__":
    n = dt.datetime.now(dt.timezone.utc)
    update(n, n.year + (1 if n.month >= 8 else 0))
