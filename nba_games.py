"""Game-by-game data for the player pages, from the NBA's public stats feed (cdn.nba.com).

For every regular-season game it reads the box score and the play-by-play and adds, per player:
  - a game-log line (minutes, points, rebounds, ... and the result)
  - every shot: its zone ("Restricted Area", "Mid-Range", "Left Corner 3", ...) and a 2-ft court cell
  - who they assisted (from each made shot's assist), who assisted them, and how many of their
    makes were assisted vs. unassisted, by zone
  - their team's margin and the game's length, for on/off (plus-minus on vs. off the floor)
  - steals, split by the kind of turnover they caused (bad pass -> off-ball, lost ball -> on-ball)
  - blocks, split by where the blocked shot was taken (rim, paint, mid-range, three)
and, per game, for the team pages:
  - each team's box score totals ("tgames")
  - every five-man lineup each team used: seconds, points for/against, possessions for/against ("stints")
The league schedule is saved to data/schedule.json.

Results live in data/pbp/<season>.json (one file per season). Each run:
  1. finishes this season's games so far (from the league schedule), then
  2. backfills older seasons, newest first, until a season the feed doesn't have.
A time budget keeps each run short; anything left over is picked up the next morning.
"""
import gzip
import json
import os
import re
import time
from urllib.request import Request, urlopen

HERE = os.path.dirname(os.path.abspath(__file__))
PBP_DIR = os.path.join(HERE, "data", "pbp")
STATUS_PATH = os.path.join(PBP_DIR, "status.json")

CDN = "https://cdn.nba.com/static/json"
SCHEDULE_URL = CDN + "/staticData/scheduleLeagueV2.json"
BOX_URL = CDN + "/liveData/boxscore/boxscore_{gid}.json"
PBP_URL = CDN + "/liveData/playbyplay/playbyplay_{gid}.json"

TIME_BUDGET_SEC = 150 * 60     # stop starting new games after this long (the workflow allows 330 min)
PAUSE_SEC = 0.35               # between requests
SAVE_EVERY = 75                # write progress to disk this often
MAX_GAME_NUMBER = 1320         # regular-season game numbers run 00001..01230 (fewer in short seasons)
ACC_SCHEMA = 3                 # bump when new fields are collected: older season files are rebuilt
                               # (3: team box scores + five-man lineup stints, for the team pages)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Encoding": "gzip",
    "Referer": "https://www.nba.com/",
    "Origin": "https://www.nba.com",
}

THREE_ZONES = {"Left Corner 3", "Right Corner 3", "Above the Break 3", "Backcourt"}


def season_label(end_year):
    return f"{end_year - 1}-{str(end_year)[2:]}"


def season_path(end_year):
    return os.path.join(PBP_DIR, f"{season_label(end_year)}.json")


def game_id(end_year, n):
    return f"002{str(end_year - 1)[2:]}{n:05d}"


def get_json(url, tries=3):
    """(status, data). 403/404 mean the feed doesn't have it."""
    for i in range(tries):
        try:
            with urlopen(Request(url, headers=HEADERS), timeout=40) as r:
                raw = r.read()
                if r.headers.get("Content-Encoding") == "gzip" or raw[:2] == b"\x1f\x8b":
                    raw = gzip.decompress(raw)
                return r.status, json.loads(raw.decode("utf-8"))
        except Exception as e:  # noqa: BLE001
            code = getattr(e, "code", None)
            if code in (403, 404):
                return code, None
            if i == tries - 1:
                return code or 0, None
            time.sleep(5 * (i + 1))
    return 0, None


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


def minutes(iso):
    """'PT34M12.00S' -> 34.2"""
    m = re.match(r"PT(?:(\d+)M)?(?:([\d.]+)S)?", str(iso or ""))
    if not m:
        return 0.0
    return round(int(m.group(1) or 0) + float(m.group(2) or 0) / 60, 2)


def court_cell(a):
    """Shot location -> (feet from the left sideline 0-50, feet from the baseline 0-47), from the
    feed's x/y (percent of court length/width). Checked against the listed shot distance."""
    try:
        x, y = float(a.get("x")), float(a.get("y"))
    except (TypeError, ValueError):
        return None
    dist = a.get("shotDistance")
    best = None
    # x = percent of the 94-ft length, y = percent of the 50-ft width (the usual layout) -- and,
    # in case the feed flips them, the other way round; keep whichever matches the shot distance.
    for length_pct, width_pct in ((x, y), (y, x)):
        lx = length_pct / 100 * 94
        wy = width_pct / 100 * 50
        far = lx > 47
        from_base = 94 - lx if far else lx
        across = 50 - wy if far else wy          # mirror the far end so every shot faces the same basket
        d = ((from_base - 5.25) ** 2 + (across - 25) ** 2) ** 0.5
        err = abs(d - float(dist)) if dist not in (None, "") else 0
        if best is None or err < best[0]:
            best = (err, across, from_base)
    _, across, from_base = best
    across = min(max(across, 0), 49.99)
    from_base = min(max(from_base, 0), 46.99)
    return across, from_base


def blank_player(name):
    return {"n": name, "t": [], "logs": [], "z": {}, "b": {}, "at": {}, "af": {}, "ua": {},
            "st": {"on": 0, "off": 0, "oth": 0}, "bk": {"rim": 0, "paint": 0, "mid": 0, "three": 0}}


def add_game(acc, box, pbp):
    """Fold one game's box score + play-by-play into the season accumulator."""
    g = box["game"]
    gid = g["gameId"]
    date = str(g.get("gameEt") or g.get("gameTimeLocal") or g.get("gameTimeUTC") or "")[:10]
    teams = {}
    team_min = sum(minutes((pl.get("statistics") or {}).get("minutes")) for pl in g["homeTeam"].get("players", []))
    game_min = round(team_min / 5) if team_min else 48   # 48, or 53/58/... with overtime
    for side, other in (("homeTeam", "awayTeam"), ("awayTeam", "homeTeam")):
        t, o = g[side], g[other]
        teams[t["teamId"]] = t["teamTricode"]
        margin = int(t.get("score") or 0) - int(o.get("score") or 0)
        won = margin > 0
        for pl in t.get("players", []):
            st = pl.get("statistics") or {}
            mins = minutes(st.get("minutes"))
            if str(pl.get("played", "1")) != "1" and mins == 0:
                continue
            pid = str(pl["personId"])
            name = pl.get("name") or f"{pl.get('firstName', '')} {pl.get('familyName', '')}".strip()
            p = acc["players"].setdefault(pid, blank_player(name))
            p["n"] = name
            if t["teamTricode"] not in p["t"]:
                p["t"].append(t["teamTricode"])
            if any(l[0] == gid for l in p["logs"]):
                continue
            p["logs"].append([gid, date, o["teamTricode"], 1 if side == "homeTeam" else 0, mins,
                              st.get("points", 0), st.get("assists", 0), st.get("reboundsDefensive", 0),
                              st.get("reboundsOffensive", 0), st.get("steals", 0), st.get("blocks", 0),
                              st.get("turnovers", 0), st.get("fieldGoalsMade", 0), st.get("fieldGoalsAttempted", 0),
                              st.get("threePointersMade", 0), st.get("threePointersAttempted", 0),
                              st.get("freeThrowsMade", 0), st.get("freeThrowsAttempted", 0),
                              st.get("plusMinusPoints", 0), "W" if won else "L",
                              1 if str(pl.get("starter", "0")) == "1" else 0, margin, game_min])
            acc["names"][pid] = name

    def P(pid):
        pid = str(pid)
        return acc["players"].setdefault(pid, blank_player(acc["names"].get(pid, pid)))

    for a in (pbp or {}).get("game", {}).get("actions", []):
        kind = str(a.get("actionType", "")).lower()
        if kind in ("2pt", "3pt") and a.get("personId"):
            shooter = P(a["personId"])
            made = str(a.get("shotResult", "")).lower() == "made"
            zone = a.get("area") or ("Above the Break 3" if kind == "3pt" else "Mid-Range")
            z = shooter["z"].setdefault(zone, [0, 0])
            z[0] += 1
            z[1] += 1 if made else 0
            cell = court_cell(a)
            if cell:
                key = f"{int(cell[0] // 2)},{int(cell[1] // 2)}"
                b = shooter["b"].setdefault(key, [0, 0])
                b[0] += 1
                b[1] += 1 if made else 0
            if made:
                u = shooter["ua"].setdefault(zone, [0, 0])   # [assisted, unassisted] makes
                if a.get("assistPersonId"):
                    u[0] += 1
                    giver = P(a["assistPersonId"])
                    k, gk = str(a["personId"]), str(a["assistPersonId"])
                    giver["at"][k] = giver["at"].get(k, 0) + 1
                    shooter["af"][gk] = shooter["af"].get(gk, 0) + 1
                else:
                    u[1] += 1
            if a.get("blockPersonId"):
                blocker = P(a["blockPersonId"])
                if zone == "Restricted Area":
                    blocker["bk"]["rim"] += 1
                elif zone.startswith("In The Paint"):
                    blocker["bk"]["paint"] += 1
                elif zone in THREE_ZONES or kind == "3pt":
                    blocker["bk"]["three"] += 1
                else:
                    blocker["bk"]["mid"] += 1
        elif kind == "turnover" and a.get("stealPersonId"):
            thief = P(a["stealPersonId"])
            sub = str(a.get("subType", "")).lower()
            if "bad pass" in sub:
                thief["st"]["off"] += 1      # jumped a passing lane
            elif "lost ball" in sub and "out" not in sub:
                thief["st"]["on"] += 1       # stripped / poked it from the ball handler
            else:
                thief["st"]["oth"] += 1
    acc.setdefault("tgames", {})[gid] = [date, g["homeTeam"]["teamTricode"], g["awayTeam"]["teamTricode"],
                                         team_line(g["homeTeam"]), team_line(g["awayTeam"]), game_min]
    try:
        acc.setdefault("stints", {})[gid] = lineup_stints(g, pbp)
    except Exception as e:  # noqa: BLE001 -- odd play-by-play shouldn't lose the game
        print(f"Lineups skipped for {gid}: {e}")
    acc["done"].append(gid)
    acc["teams"].update({str(k): v for k, v in teams.items()})


# ---------- team pages ----------
# team box score line: [pts, fgm, fga, 3pm, 3pa, ftm, fta, oreb, dreb, ast, stl, blk, tov, pf,
#                       paint pts, fast-break pts, second-chance pts, pts off turnovers, bench pts]
TEAM_KEYS = [("points",), ("fieldGoalsMade",), ("fieldGoalsAttempted",), ("threePointersMade",),
             ("threePointersAttempted",), ("freeThrowsMade",), ("freeThrowsAttempted",), ("reboundsOffensive",),
             ("reboundsDefensive",), ("assists",), ("steals",), ("blocks",), ("turnoversTotal", "turnovers"),
             ("foulsPersonal",), ("pointsInThePaint",), ("pointsFastBreak",), ("pointsSecondChance",),
             ("pointsFromTurnovers",), ("benchPoints",)]


def team_line(t):
    st = t.get("statistics") or {}
    out = []
    for keys in TEAM_KEYS:
        v = next((st[k] for k in keys if st.get(k) is not None), None)
        if v is None:   # no team totals in the feed: add up the players
            v = sum(int((pl.get("statistics") or {}).get(keys[-1]) or 0) for pl in t.get("players", []))
        out.append(int(v or 0))
    if not out[0]:
        out[0] = int(t.get("score") or 0)
    return out


def clock_sec(iso):
    m = re.match(r"PT(?:(\d+)M)?(?:([\d.]+)S)?", str(iso or ""))
    return (int(m.group(1) or 0) * 60 + float(m.group(2) or 0)) if m else 0.0


def lineup_stints(g, pbp):
    """{tricode: [["id,id,id,id,id", seconds, pts for, pts against, poss for, poss against], ...]} for one game.
    Who is on the floor comes from the box score starters and the substitutions; at the start of each
    overtime/quarter the five are worked out from who shows up in the play-by-play before being subbed in."""
    actions = (pbp or {}).get("game", {}).get("actions", [])
    if not actions:
        return {}
    home, away = g["homeTeam"], g["awayTeam"]
    tri_of = {}
    for t in (home, away):
        for pl in t.get("players", []):
            tri_of[str(pl["personId"])] = t["teamTricode"]
    tris = [home["teamTricode"], away["teamTricode"]]
    other = {tris[0]: tris[1], tris[1]: tris[0]}
    starters = {t["teamTricode"]: [str(pl["personId"]) for pl in t.get("players", []) if str(pl.get("starter", "0")) == "1"]
                for t in (home, away)}
    by_period = {}
    for a in actions:
        by_period.setdefault(int(a.get("period") or 1), []).append(a)

    def involved(a):
        """(player, is a sub-in) for everyone an action names."""
        kind = str(a.get("actionType", "")).lower()
        out = []
        if a.get("personId") and str(a["personId"]) != "0":
            out.append((str(a["personId"]), kind == "substitution" and str(a.get("subType", "")).lower() == "in"))
        for k in ("assistPersonId", "stealPersonId", "blockPersonId", "foulDrawnPersonId"):
            if a.get(k):
                out.append((str(a[k]), False))
        return out

    floor = {t: list(starters[t]) for t in tris}
    acc = {t: {} for t in tris}
    score = None
    for period in sorted(by_period):
        acts = by_period[period]
        if period > 1:   # who started this period
            seen, first = set(), {t: [] for t in tris}
            for a in acts:
                for pid, sub_in in involved(a):
                    team = tri_of.get(pid)
                    if not team or pid in seen:
                        continue
                    seen.add(pid)
                    if not sub_in:
                        first[team].append(pid)
            for t in tris:
                five = first[t][:5]
                for pid in floor[t] + starters[t]:
                    if len(five) >= 5:
                        break
                    if pid not in five and pid not in seen:
                        five.append(pid)
                floor[t] = five
        length = 720 if period <= 4 else 300
        last = float(length)
        key = {t: ",".join(sorted(floor[t])) if len(floor[t]) == 5 else None for t in tris}

        def row(t):
            k = key[t]
            if not k:
                return None
            return acc[t].setdefault(k, [0.0, 0, 0, 0.0, 0.0])

        for a in acts:
            now = clock_sec(a.get("clock"))
            if now < last:
                for t in tris:
                    r = row(t)
                    if r:
                        r[0] += last - now
                last = now
            kind = str(a.get("actionType", "")).lower()
            team = a.get("teamTricode") or tri_of.get(str(a.get("personId")))
            if kind == "substitution" and team in floor:
                pid = str(a.get("personId"))
                if str(a.get("subType", "")).lower() == "out":
                    floor[team] = [x for x in floor[team] if x != pid]
                elif pid not in floor[team]:
                    floor[team].append(pid)
                if len(floor[team]) == 5:
                    key[team] = ",".join(sorted(floor[team]))
                continue
            try:
                sh, sa = int(a.get("scoreHome") or 0), int(a.get("scoreAway") or 0)
            except ValueError:
                sh, sa = score or (0, 0)
            if score is not None and (sh, sa) != score:
                for t, pts in ((tris[0], sh - score[0]), (tris[1], sa - score[1])):
                    if pts > 0:
                        r, ro = row(t), row(other[t])
                        if r:
                            r[1] += pts
                        if ro:
                            ro[2] += pts
            score = (sh, sa)
            if team not in other:
                continue
            poss = 0.0
            if kind in ("2pt", "3pt"):
                poss = 1.0
            elif kind == "freethrow":
                poss = 0.44
            elif kind == "turnover":
                poss = 1.0
            elif kind == "rebound" and str(a.get("subType", "")).lower() == "offensive":
                poss = -1.0
            if poss:
                r, ro = row(team), row(other[team])
                if r:
                    r[3] += poss
                if ro:
                    ro[4] += poss
        if last > 0:
            for t in tris:
                r = row(t)
                if r:
                    r[0] += last
    return {t: [[k, round(v[0]), v[1], v[2], round(v[3], 2), round(v[4], 2)] for k, v in acc[t].items() if v[0] > 0]
            for t in tris}


def new_acc(end_year):
    return {"season": season_label(end_year), "done": [], "missing": [], "players": {}, "names": {}, "teams": {},
            "complete": False, "schema": ACC_SCHEMA}


def load_acc(end_year):
    acc = load(season_path(end_year), None)
    if acc and acc.get("schema") != ACC_SCHEMA:
        print(f"{season_label(end_year)}: collecting new fields, so this season's games are re-read")
        return None
    return acc


def process(gid, acc):
    """True if the game was added, False if the feed doesn't have it."""
    s1, box = get_json(BOX_URL.format(gid=gid))
    time.sleep(PAUSE_SEC)
    if not box or "game" not in box:
        return False, s1
    if str(box["game"].get("gameStatus", 3)) not in ("3",):
        return False, "not final"
    s2, pbp = get_json(PBP_URL.format(gid=gid))
    time.sleep(PAUSE_SEC)
    add_game(acc, box, pbp)
    if not pbp:
        acc.setdefault("noPbp", []).append(gid)
    return True, s1


def current_final_games(end_year):
    status, sched = get_json(SCHEDULE_URL)
    if not sched:
        print(f"Schedule not available (HTTP {status})")
        return []
    want = season_label(end_year)
    ls = sched.get("leagueSchedule", {})
    if ls.get("seasonYear") and ls["seasonYear"] != want:
        print(f"Schedule is for {ls.get('seasonYear')}, not {want}")
    save_schedule(ls)
    out = []
    for day in ls.get("gameDates", []):
        for g in day.get("games", []):
            gid = str(g.get("gameId", ""))
            if gid.startswith(f"002{str(end_year - 1)[2:]}") and int(g.get("gameStatus", 0)) == 3:
                out.append(gid)
    return out


SCHEDULE_PATH = os.path.join(HERE, "data", "schedule.json")


def save_schedule(ls):
    """data/schedule.json: every game this season (regular season, NBA Cup knockouts, play-in, playoffs):
    [gameId, start (UTC), home, away, status 1 upcoming / 2 live / 3 final, home score, away score, arena, TV]"""
    games = []
    for day in ls.get("gameDates", []):
        for g in day.get("games", []):
            gid = str(g.get("gameId", ""))
            if gid[:3] not in ("002", "004", "005", "006"):
                continue
            h, a = g.get("homeTeam") or {}, g.get("awayTeam") or {}
            tv = [b.get("broadcasterAbbreviation") or b.get("broadcasterDisplay")
                  for b in ((g.get("broadcasters") or {}).get("nationalBroadcasters") or [])]
            games.append([gid, g.get("gameDateTimeUTC") or g.get("gameDateUTC") or "", h.get("teamTricode"),
                          a.get("teamTricode"), int(g.get("gameStatus") or 1), int(h.get("score") or 0),
                          int(a.get("score") or 0), g.get("arenaName") or "", ", ".join(x for x in tv if x)])
    if games:
        save(SCHEDULE_PATH, {"season": ls.get("seasonYear"), "games": games})
        print(f"Schedule: {len(games)} games")


def update(now, current_year):
    started = time.time()
    os.makedirs(PBP_DIR, exist_ok=True)
    status = load(STATUS_PATH, {"oldestAvailable": None, "unavailableBefore": None})
    out_of_time = lambda: time.time() - started > TIME_BUDGET_SEC  # noqa: E731

    # 1) this season, from the schedule
    acc = load_acc(current_year) or new_acc(current_year)
    done = set(acc["done"])
    todo = [g for g in current_final_games(current_year) if g not in done]
    print(f"{season_label(current_year)}: {len(todo)} new games")
    for i, gid in enumerate(todo, 1):
        if out_of_time():
            break
        process(gid, acc)
        if i % SAVE_EVERY == 0:
            save(season_path(current_year), acc)
    save(season_path(current_year), acc)

    # 2) older seasons, newest first, until the feed runs out
    year = current_year - 1
    while not out_of_time():
        if status.get("unavailableBefore") and year < status["unavailableBefore"]:
            break
        path = season_path(year)
        acc = load_acc(year)
        if acc and acc.get("complete"):
            year -= 1
            continue
        if acc is None:
            acc = new_acc(year)
            ok, why = process(game_id(year, 1), acc)   # probe: does the feed have this season?
            if not ok:
                ok, why = process(game_id(year, 2), acc)
            if not ok:
                print(f"The NBA feed doesn't have {season_label(year)} (HTTP {why}); stopping the backfill there.")
                status["unavailableBefore"] = year + 1
                break
        done = set(acc["done"]) | set(acc["missing"])
        misses, added, transient = 0, 0, False
        for n in range(1, MAX_GAME_NUMBER + 1):
            gid = game_id(year, n)
            if gid in done:
                misses = 0 if gid in acc["done"] else misses + 1
                continue
            if out_of_time():
                break
            ok, why = process(gid, acc)
            if ok:
                misses, added = 0, added + 1
            elif why not in (403, 404, "not final"):
                print(f"Network trouble at {gid} (HTTP {why}); will retry next run")
                transient = True
                break
            else:
                acc["missing"].append(gid)   # postponed/cancelled game numbers, or past the season's last game
                misses += 1
            if (added + misses) % SAVE_EVERY == 0:
                save(path, acc)
        finished = not out_of_time() and not transient
        if finished:
            acc["complete"] = True
            status["oldestAvailable"] = year
        save(path, acc)
        print(f"{season_label(year)}: {len(acc['done'])} games{' (complete)' if acc['complete'] else ' so far'}")
        if not finished:
            break
        year -= 1
    save(STATUS_PATH, status)
    print(f"Games step took {int(time.time() - started)}s")
