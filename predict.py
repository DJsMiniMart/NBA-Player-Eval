"""Pulse game picks and storylines for the home page (data/predictions.json).

Team rating = average Pulse production margin per game: (PTS + AST*2 + REB*2 + STL*4 + BLK - TOV*4) for the team
minus the same for its opponents. Early in the season each team's rating leans on half of last season's
(PRIOR_GAMES games' worth). Win chance for the home team = 1 / (1 + e^(-SCALE * (home - away + HOME_EDGE))).
Fit on every 2025-26 game, using only what was known before each game: it picked 68.0% of winners.

Every pick is made from the games before it, so the season record is honest (no hindsight).
Storylines are worked out from the data: rivalries, division games, earlier meetings, streaks, the playoff race,
players facing their old team, star match-ups, top rookies, back-to-backs, plus ESPN's preview when there is one
and anything in data/storylines.json (hand-written: {"BOS-NYK": ["..."], "<game id>": ["..."]})."""
import datetime as dt
import json
import math
import os

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")
PRIOR_GAMES, PRIOR_SHRINK, SCALE, HOME_EDGE = 3, 0.5, 0.03, 8.0
# Pulse's projected home margin in points (fit on every 2025-26 game, pre-game ratings only; misses by 11.5 pts on average)
SPREAD_K, SPREAD_B = 0.2414, -0.39


def pulse_margin(rh, ra):
    return SPREAD_K * (rh - ra + HOME_EDGE) + SPREAD_B
DAYS_AHEAD = 7
BBR2NBA = {"BRK": "BKN", "CHO": "CHA", "PHO": "PHX"}
NAMES = {"ATL": "Hawks", "BOS": "Celtics", "BKN": "Nets", "CHA": "Hornets", "CHI": "Bulls", "CLE": "Cavaliers",
         "DAL": "Mavericks", "DEN": "Nuggets", "DET": "Pistons", "GSW": "Warriors", "HOU": "Rockets", "IND": "Pacers",
         "LAC": "Clippers", "LAL": "Lakers", "MEM": "Grizzlies", "MIA": "Heat", "MIL": "Bucks", "MIN": "Timberwolves",
         "NOP": "Pelicans", "NYK": "Knicks", "OKC": "Thunder", "ORL": "Magic", "PHI": "76ers", "PHX": "Suns",
         "POR": "Trail Blazers", "SAC": "Kings", "SAS": "Spurs", "TOR": "Raptors", "UTA": "Jazz", "WAS": "Wizards"}
DIV = {"Atlantic": ["BOS", "BKN", "NYK", "PHI", "TOR"], "Central": ["CHI", "CLE", "DET", "IND", "MIL"],
       "Southeast": ["ATL", "CHA", "MIA", "ORL", "WAS"], "Northwest": ["DEN", "MIN", "OKC", "POR", "UTA"],
       "Pacific": ["GSW", "LAC", "LAL", "PHX", "SAC"], "Southwest": ["DAL", "HOU", "MEM", "NOP", "SAS"]}
DIV_OF = {t: d for d, ts in DIV.items() for t in ts}
CONF_OF = {t: ("East" if d in ("Atlantic", "Central", "Southeast") else "West") for t, d in DIV_OF.items()}
RIVALS = {
    frozenset(("BOS", "LAL")): "The NBA's greatest rivalry: 12 Finals meetings between the league's two winningest franchises.",
    frozenset(("BOS", "PHI")): "Celtics–76ers is one of the oldest rivalries in the league, with 20+ playoff series.",
    frozenset(("BOS", "NYK")): "Celtics vs. Knicks: the original Atlantic Division grudge match.",
    frozenset(("NYK", "BKN")): "Battle for New York.",
    frozenset(("LAL", "LAC")): "Battle of L.A.: they share the city, and a rivalry.",
    frozenset(("CHI", "DET")): "Bulls–Pistons: the Bad Boys vs. Jordan rivalry still carries weight.",
    frozenset(("NYK", "MIA")): "Knicks–Heat: four straight playoff series in the late '90s, and more since.",
    frozenset(("NYK", "IND")): "Knicks–Pacers: Reggie Miller, Spike Lee and a long playoff history.",
    frozenset(("GSW", "CLE")): "Warriors–Cavaliers met in four straight Finals (2015–18).",
    frozenset(("SAS", "DAL")): "I-35 rivalry: Spurs vs. Mavericks.",
    frozenset(("HOU", "SAS")): "Texas rivalry: Rockets vs. Spurs.",
    frozenset(("HOU", "DAL")): "Texas rivalry: Rockets vs. Mavericks.",
    frozenset(("LAL", "SAS")): "Lakers–Spurs ruled the West for a decade, meeting in five playoff series from 1999 to 2008.",
    frozenset(("PHX", "LAL")): "Suns–Lakers: a long-running Pacific Division rivalry with plenty of playoff history.",
    frozenset(("SAC", "LAL")): "Kings–Lakers: the 2002 Western Conference Finals still stings in Sacramento.",
    frozenset(("BOS", "MIA")): "Celtics–Heat have met in seven playoff series since 2010.",
    frozenset(("BOS", "DET")): "Celtics–Pistons: Bird vs. the Bad Boys in the '80s.",
    frozenset(("MIL", "BOS")): "Bucks–Celtics: frequent playoff opponents in the East.",
    frozenset(("OKC", "SAS")): "Thunder vs. Spurs: two young Western powers.",
    frozenset(("DEN", "LAL")): "Nuggets–Lakers: recent playoff battles, all with Jokić in the middle.",
    frozenset(("UTA", "CHI")): "Jazz–Bulls: the 1997 and 1998 Finals.",
    frozenset(("POR", "LAL")): "Blazers–Lakers: the 2000 Western Conference Finals Game 7.",
    frozenset(("MEM", "GSW")): "Grizzlies–Warriors: a heated recent playoff rivalry.",
    frozenset(("PHI", "TOR")): "76ers–Raptors: Kawhi's four-bounce Game 7 buzzer-beater in 2019.",
    frozenset(("ATL", "NYK")): "Hawks–Knicks: Trae Young's villain run in the 2021 playoffs.",
}


def load(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def prod(line):
    return line[0] + 2 * line[9] + 2 * (line[7] + line[8]) + 4 * line[10] + line[11] - 4 * line[12]


def final_ratings(tgames):
    r = {}
    for date, h, a, hl, al, _ in tgames.values():
        for t, me, op in ((h, hl, al), (a, al, hl)):
            x = r.setdefault(t, [0.0, 0])
            x[0] += prod(me) - prod(op)
            x[1] += 1
    return {t: x[0] / x[1] for t, x in r.items() if x[1]}


def win_chance(rh, ra):
    return 1 / (1 + math.exp(-SCALE * (rh - ra + HOME_EDGE)))


def label(end_year):
    return f"{end_year - 1}-{str(end_year)[2:]}"


def update(now, year):
    cur = load(os.path.join(DATA, "pbp", f"{label(year)}.json"), {}) or {}
    prev = final_ratings((load(os.path.join(DATA, "pbp", f"{label(year - 1)}.json"), {}) or {}).get("tgames", {}))
    games = sorted(((gid,) + tuple(r) for gid, r in (cur.get("tgames") or {}).items()), key=lambda r: (r[1], r[0]))
    sums = {}

    def rating(t):
        s, c = sums.get(t, [0.0, 0])
        p = prev.get(t, 0.0) * PRIOR_SHRINK
        return (s + PRIOR_GAMES * p) / (c + PRIOR_GAMES)

    picks, w, l = {}, 0, 0
    lines = load(os.path.join(DATA, "lines_log.json"), {}) or {}
    ats, aw, al_, ap = {}, 0, 0, 0
    results = []   # [date, home, away, home pts, away pts]
    for gid, date, h, a, hl, al, _ in games:
        p = win_chance(rating(h), rating(a))
        pick = h if p >= .5 else a
        won = h if hl[0] > al[0] else a
        ok = pick == won
        w += ok
        l += not ok
        picks[gid] = [pick, round(max(p, 1 - p), 3), 1 if ok else 0]
        ln = lines.get(gid)
        if ln and ln.get("spread") is not None:      # against the spread: home spread, negative = home favored
            pm = pulse_margin(rating(h), rating(a))
            side = h if pm + ln["spread"] > 0 else a
            res = (hl[0] - al[0]) + ln["spread"]
            covered = h if res > 0 else a if res < 0 else None
            r = -1 if covered is None else (1 if covered == side else 0)
            aw += r == 1
            al_ += r == 0
            ap += r == -1
            ats[gid] = [side, round(pm, 1), ln["spread"], r]
        results.append([date, h, a, hl[0], al[0]])
        for t, me, op in ((h, hl, al), (a, al, hl)):
            x = sums.setdefault(t, [0.0, 0])
            x[0] += prod(me) - prod(op)
            x[1] += 1
    ratings = {t: round(rating(t), 2) for t in CONF_OF}

    # upcoming games
    sched = (load(os.path.join(DATA, "schedule.json"), {}) or {}).get("games", [])
    soon = now + dt.timedelta(days=DAYS_AHEAD)
    upcoming = []
    for g in sched:
        gid, when, h, a, state = g[0], g[1], g[2], g[3], g[4]
        try:
            t = dt.datetime.fromisoformat(when.replace("Z", "+00:00"))
        except ValueError:
            continue
        if state == 3 or t > soon or t < now - dt.timedelta(hours=6) or h not in CONF_OF or a not in CONF_OF:
            continue
        p = win_chance(ratings[h], ratings[a])
        upcoming.append({"id": gid, "t": when, "home": h, "away": a, "tv": g[8], "arena": g[7],
                         "pick": h if p >= .5 else a, "p": round(max(p, 1 - p), 3),
                         "margin": round(pulse_margin(ratings[h], ratings[a]), 1),
                         "stories": stories(gid, h, a, when, results, sched, now, year)})
    upcoming.sort(key=lambda u: u["t"])
    out = {"at": now.isoformat(timespec="seconds"), "season": label(year),
           "model": {"scale": SCALE, "homeEdge": HOME_EDGE, "priorGames": PRIOR_GAMES, "priorShrink": PRIOR_SHRINK,
                     "tested": "picked 68.0% of 2025-26 winners using only games played before each one"},
           "record": [w, l], "picks": picks, "ats": ats, "atsRecord": [aw, al_, ap], "ratings": ratings, "upcoming": upcoming}
    with open(os.path.join(DATA, "predictions.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, separators=(",", ":"))
    print(f"Predictions: against the spread {aw}-{al_}-{ap}; Pulse picks {w}-{l} this season, {len(upcoming)} games in the next {DAYS_AHEAD} days")


# ---------- storylines ----------
_cache = {}


def ctx(year):
    """Things the storylines need, loaded once."""
    if _cache.get("year") == year:
        return _cache
    stats = (load(os.path.join(DATA, "stats.json"), {}) or {}).get("players", [])
    last = (load(os.path.join(DATA, f"season-{year - 1}.json"), {}) or {}).get("players", [])
    rook = load(os.path.join(DATA, "rookies.json"), {}) or {}
    morning = load(os.path.join(DATA, "morning.json"), {}) or {}
    custom = load(os.path.join(DATA, "storylines.json"), {}) or {}
    mvr = lambda p: ((p.get("pts", 0) + 2 * p.get("ast", 0) + 2 * p.get("trb", 0) + 4 * p.get("stl", 0) + p.get("blk", 0)  # noqa: E731
                      - 4 * p.get("tov", 0)) / p["mp"]) if p.get("mp") else None
    now_team = {p["id"]: BBR2NBA.get(p.get("team"), p.get("team")) for p in stats if p.get("id")}
    last_team = {}
    for p in last:   # a player traded mid-season shows a "TOT" row first, then a row per team; keep the last team
        t = BBR2NBA.get(p.get("team"), p.get("team"))
        if t in CONF_OF and p.get("mp", 0) >= 500:
            last_team[p["id"]] = (t, p.get("name"), mvr(p), p.get("mp", 0) / max(1, p.get("g", 1)))
    most = max([p.get("g", 0) for p in stats] + [1])
    stars = {}
    early = most < 10   # too few games: one big night shouldn't make a star; use last season's best until then
    for p in ([] if early else stats):
        t = now_team.get(p.get("id"))
        if t in CONF_OF and p.get("g", 0) >= max(1, most // 2) and p.get("mp", 0) / max(1, p.get("g", 1)) >= 24:
            v = mvr(p)
            if v is not None and (t not in stars or v > stars[t][1]):
                stars[t] = (p["name"], v)
    for pid, (t, name, v, mpg) in last_team.items():   # early season: fall back to last season's best
        if v is not None and mpg >= 28 and now_team.get(pid) == t and (early or t not in stars):
            if t not in stars or v > stars[t][1]:
                stars[t] = (name, v)
    drafts = rook.get("draft", {})
    top_rooks = {}
    for pid in rook.get("ids", []):
        d = drafts.get(pid)
        t = now_team.get(pid)
        if d and d.get("round") == 1 and d.get("pick", 99) <= 5 and t:
            name = next((p["name"] for p in stats if p.get("id") == pid), pid)
            top_rooks.setdefault(t, []).append((d["pick"], name))
    _cache.clear()
    _cache.update({"year": year, "now_team": now_team, "last_team": last_team, "stars": stars, "rooks": top_rooks,
                   "previews": morning.get("previews") or {}, "custom": custom})
    return _cache


def stories(gid, h, a, when, results, sched, now, year):
    c = ctx(year)
    out = []
    add = lambda kind, text: out.append([kind, text])  # noqa: E731
    pair = frozenset((h, a))
    nh, na = NAMES[h], NAMES[a]
    for key in (gid, f"{a}-{h}", f"{h}-{a}"):
        for txt in c["custom"].get(key, []) if isinstance(c["custom"].get(key), list) else []:
            add("note", txt)
    pv = c["previews"].get(gid)
    if pv and pv.get("h"):
        out.append(["preview", pv["h"], pv.get("u") or ""])
    if pair in RIVALS:
        add("rivalry", RIVALS[pair])
    elif DIV_OF[h] == DIV_OF[a]:
        add("division", f"{DIV_OF[h]} Division game.")
    # earlier meetings this season
    met = [r for r in results if {r[1], r[2]} == {h, a}]
    if met:
        hw = sum(1 for r in met if (r[3] > r[4]) == (r[1] == h))
        lastm = met[-1]
        win = lastm[1] if lastm[3] > lastm[4] else lastm[2]
        hi, lo = max(lastm[3], lastm[4]), min(lastm[3], lastm[4])
        d = dt.date.fromisoformat(lastm[0]).strftime("%b %-d")
        series = f"{NAMES[h]} lead the season series {hw}-{len(met) - hw}" if hw > len(met) - hw else \
            f"{NAMES[a]} lead the season series {len(met) - hw}-{hw}" if hw < len(met) - hw else f"Season series tied {hw}-{hw}"
        add("rematch", f"Rematch: the {NAMES[win]} won {hi}-{lo} on {d}. {series}.")
    # streaks and standings
    rec = {}
    for r in results:
        for t, won in ((r[1], r[3] > r[4]), (r[2], r[4] > r[3])):
            rec.setdefault(t, []).append(won)
    for t in (a, h):
        res = rec.get(t, [])
        n = 0
        for x in reversed(res):
            if x != res[-1]:
                break
            n += 1
        if n >= 3:
            add("streak", f"The {NAMES[t]} have {'won' if res[-1] else 'lost'} {n} straight.")
    gp = min(len(rec.get(h, [])), len(rec.get(a, [])))
    if CONF_OF[h] == CONF_OF[a] and gp >= 15:
        conf = sorted((t for t in CONF_OF if CONF_OF[t] == CONF_OF[h]),
                      key=lambda t: -(sum(rec.get(t, [])) / max(1, len(rec.get(t, [])))))
        sh, sa = conf.index(h) + 1, conf.index(a) + 1
        wl = lambda t: f"{sum(rec.get(t, []))}-{len(rec.get(t, [])) - sum(rec.get(t, []))}"  # noqa: E731
        if abs(sh - sa) <= 3 and min(sh, sa) <= 12:
            zone = "for a top-6 spot" if max(sh, sa) <= 8 else "for a play-in spot" if min(sh, sa) >= 5 else "near the top of the conference"
            add("race", f"Playoff race: {NAMES[a]} ({sa}th, {wl(a)}) and {NAMES[h]} ({sh}th, {wl(h)}) are fighting {zone} in the {CONF_OF[h]}."
                .replace("1th", "1st").replace("2th", "2nd").replace("3th", "3rd").replace("11st", "11th").replace("12nd", "12th").replace("13rd", "13th"))
    # players facing a team they played for last season
    revenge = []
    for pid, (t, name, v, mpg) in c["last_team"].items():
        cur = c["now_team"].get(pid)
        if cur and cur != t and {cur, t} == {h, a} and mpg >= 20:
            revenge.append((mpg, name, t))
    for mpg, name, t in sorted(revenge, reverse=True)[:2]:
        add("revenge", f"Reunion: {name} faces the {NAMES[t]}, his team last season.")
    # stars
    sh_, sa_ = c["stars"].get(h), c["stars"].get(a)
    if sh_ and sa_ and sh_[1] >= 1.2 and sa_[1] >= 1.2:
        add("stars", f"Pulse match-up: {sa_[0]} ({sa_[1]:.3f}) vs. {sh_[0]} ({sh_[1]:.3f}).")
    # rookies
    ra, rh = c["rooks"].get(a, []), c["rooks"].get(h, [])
    if ra and rh:
        add("rookies", f"Top rookies meet: No. {ra[0][0]} pick {ra[0][1]} vs. No. {rh[0][0]} pick {rh[0][1]}.")
    elif ra or rh:
        pk, nm = (ra or rh)[0]
        add("rookies", f"No. {pk} overall pick {nm} is in the lineup.")
    # back-to-backs
    try:
        day = (dt.datetime.fromisoformat(when.replace("Z", "+00:00")) - dt.timedelta(hours=5)).date()
    except ValueError:
        day = None
    if day:
        for t in (a, h):
            for g in sched:
                if t in (g[2], g[3]):
                    try:
                        d2 = (dt.datetime.fromisoformat(g[1].replace("Z", "+00:00")) - dt.timedelta(hours=5)).date()
                    except ValueError:
                        continue
                    if d2 == day - dt.timedelta(days=1):
                        add("rest", f"The {NAMES[t]} are on the second night of a back-to-back.")
                        break
    return out


if __name__ == "__main__":
    n = dt.datetime.now(dt.timezone.utc)
    update(n, n.year + (1 if n.month >= 8 else 0))
