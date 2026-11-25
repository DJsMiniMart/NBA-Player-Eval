"""Every NBA (and BAA) regular season, one row per player, for "Ask the Geek" stat questions
("how many players averaged 25 points, 10 rebounds and 8 assists in a season?").

Writes data/qseasons.json: {"cols": ["p", "s", "team", ...], "players": [[id, name], ...], "seasons": [...], "rows": [...]}
  (p = index into players, s = index into seasons)
  - 1946-47 to 1972-73 come from Basketball-Reference's season totals pages, downloaded once each and kept in
    data/oldseason-YYYY.json (they never change). Older seasons didn't track everything: minutes start in
    1951-52, steals/blocks/turnovers/offensive rebounds in 1973-74 (turnovers 1977-78), 3-pointers in 1979-80.
    Anything a season didn't track is null.
  - 1973-74 on come from the season files update_stats.py already saves (data/season-YYYY.json).
  - The current season comes from data/stats.json.
A traded player has one row for his whole season (all teams), with every team he played for.

Run after update_stats.py (GitHub Actions). Safe to re-run: it only downloads old seasons it doesn't have yet.
"""
import datetime as dt
import json
import os
import re
import sys
import time

from bs4 import BeautifulSoup, Comment

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")
OUT = os.path.join(DATA, "qseasons.json")
FIRST_YEAR, OLD_LAST = 1947, 1973          # 1946-47 ... 1972-73 from the old pages
COLS = ["id", "name", "season", "team", "age", "g", "mp", "pts", "trb", "ast", "stl", "blk", "tov",
        "fg", "fga", "fg3", "fg3a", "ft", "fta", "orb", "drb"]
NUM = COLS[4:]
# Basketball-Reference data-stat names (old and new table styles) -> our names
ALIAS = {"player": "name", "name_display": "name", "team_id": "team", "team_name_abbr": "team", "age": "age",
         "g": "g", "games": "g", "mp": "mp", "pts": "pts", "trb": "trb", "ast": "ast", "stl": "stl", "blk": "blk",
         "tov": "tov", "fg": "fg", "fga": "fga", "fg3": "fg3", "fg3a": "fg3a", "ft": "ft", "fta": "fta",
         "orb": "orb", "drb": "drb"}
MULTI = re.compile(r"^(TOT|\dTM)$")


def label(year):
    return f"{year - 1}-{str(year)[2:]}"


def load(path, default=None):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def fetch(url):
    from urllib.request import Request, urlopen
    req = Request(url, headers={"User-Agent": "Mozilla/5.0 (Full Court Geek Press; season totals)"})
    for i in range(3):
        try:
            with urlopen(req, timeout=60) as r:
                return r.status, r.read().decode("utf-8", "replace")
        except Exception as e:  # noqa: BLE001
            if getattr(e, "code", None) == 404:
                return 404, ""
            if i == 2:
                raise
            time.sleep(20 * (i + 1))
    return None, ""


def tables(html):
    soup = BeautifulSoup(html, "html.parser")
    out = soup.find_all("table")
    for c in soup.find_all(string=lambda s: isinstance(s, Comment)):
        if "<table" in c:
            out += BeautifulSoup(c, "html.parser").find_all("table")
    return out


def parse_old(html):
    """A season totals page -> one dict per player (the combined row for traded players, with all his teams)."""
    table = None
    for t in tables(html):
        stats = {c.get("data-stat") for c in t.find_all(["th", "td"], limit=400)}
        if {"pts", "ast", "fg"} <= stats and ({"player", "name_display"} & stats):
            table = t
            break
    if table is None:
        return []
    players, order = {}, []
    for tr in (table.find("tbody") or table).find_all("tr"):
        if "thead" in (tr.get("class") or []):
            continue
        row, pid = {}, None
        for cell in tr.find_all(["th", "td"]):
            key = ALIAS.get(cell.get("data-stat"))
            if not key:
                continue
            txt = cell.get_text(strip=True)
            if key == "name":
                a = cell.find("a")
                m = a and a.get("href") and re.search(r"/players/\w/([\w.]+)\.html", a["href"])
                pid = (m.group(1) if m else None) or cell.get("data-append-csv")
                row["name"] = txt.rstrip("*")
            elif key == "team":
                row["team"] = txt
            else:
                try:
                    row[key] = float(txt) if txt != "" else None
                except ValueError:
                    row[key] = None
        if not row.get("name") or row["name"] in ("Player", "League Average") or not pid:
            continue
        team = row.get("team", "")
        if pid not in players:
            row["teams"] = [] if MULTI.match(team) else [team]
            players[pid] = row
            order.append(pid)
        elif not MULTI.match(team):
            players[pid]["teams"].append(team)
    out = []
    for pid in order:
        p = players[pid]
        teams = p.pop("teams")
        p["team"] = "/".join(teams) if teams else p.get("team", "")
        p["id"] = pid
        for k in NUM:
            v = p.get(k)
            p[k] = None if v is None else (int(v) if float(v).is_integer() else v)
        out.append(p)
    return out


def backfill_old(limit_new=40):
    """Download the 1946-47 to 1972-73 totals pages we don't have yet (once each)."""
    got = 0
    for year in range(OLD_LAST, FIRST_YEAR - 1, -1):
        path = os.path.join(DATA, f"oldseason-{year}.json")
        if load(path, {}).get("players"):
            continue
        if got >= limit_new:
            break
        league = "BAA" if year <= 1949 else "NBA"
        url = f"https://www.basketball-reference.com/leagues/{league}_{year}_totals.html"
        time.sleep(5)   # be polite (stays under the site's rate limit)
        try:
            status, html = fetch(url)
        except Exception as e:  # noqa: BLE001 -- rate limited: carry on next run
            print(f"Stopped at {label(year)}: {e}")
            break
        got += 1
        players = parse_old(html) if status == 200 else []
        if not players:
            print(f"No totals for {label(year)} (HTTP {status})")
            continue
        with open(path, "w", encoding="utf-8") as f:
            json.dump({"season": label(year), "league": league, "source": url, "players": players}, f, separators=(",", ":"))
        print(f"Saved {label(year)}: {len(players)} players")


def row_from(p, season):
    teams = p.get("teams")
    team = "/".join(teams) if teams else p.get("team", "")
    trb = p.get("trb")
    if trb is None and (p.get("drb") is not None or p.get("orb") is not None):
        trb = (p.get("drb") or 0) + (p.get("orb") or 0)
    vals = dict(p, trb=trb)
    return [p["id"], p["name"], season, team] + [vals.get(k) for k in NUM]


def build():
    rows, seasons = [], []
    for year in range(FIRST_YEAR, OLD_LAST + 1):
        d = load(os.path.join(DATA, f"oldseason-{year}.json"), {})
        if not d.get("players"):
            continue
        seasons.append(label(year))
        rows += [row_from(p, label(year)) for p in d["players"] if p.get("g")]
    year = OLD_LAST + 1
    while True:
        d = load(os.path.join(DATA, f"season-{year}.json"))
        if d is None:
            break
        if d.get("players"):
            seasons.append(label(year))
            # 1973-74 to 1976-77 didn't track turnovers; 3-pointers start in 1979-80
            for p in d["players"]:
                r = row_from(p, label(year))
                if year < 1978:
                    r[COLS.index("tov")] = None
                if year < 1980:
                    r[COLS.index("fg3")] = r[COLS.index("fg3a")] = None
                rows.append(r)
        year += 1
    cur = load(os.path.join(DATA, "stats.json"), {})
    if cur.get("players") and cur.get("season") not in seasons:
        seasons.append(cur["season"])
        rows += [row_from(p, cur["season"]) for p in cur["players"] if p.get("g")]
    # compact: each player's id and name once, each season once; rows point at them by number
    pix, players, sidx = {}, [], {x: i for i, x in enumerate(seasons)}
    out = []
    for r in rows:
        if r[0] not in pix:
            pix[r[0]] = len(players)
            players.append([r[0], r[1]])
        out.append([pix[r[0]], sidx[r[2]]] + r[3:])
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump({"updatedAt": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"), "current": cur.get("season"),
                   "cols": ["p", "s"] + COLS[3:], "players": players, "seasons": seasons, "rows": out}, f, separators=(",", ":"))
    print(f"qseasons.json: {len(rows)} player-seasons, {seasons[0] if seasons else '-'} to {seasons[-1] if seasons else '-'}")


if __name__ == "__main__":
    if "--no-fetch" not in sys.argv:
        try:
            backfill_old()
        except Exception as e:  # noqa: BLE001 -- the file still builds from what we have
            print(f"Old seasons skipped: {e}")
    build()
