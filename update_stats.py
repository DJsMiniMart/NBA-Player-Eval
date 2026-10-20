"""Daily updater for the NBA stat leaderboard.

Downloads this season's player totals from Basketball-Reference, runs every player
through the stat formula, and writes:
  data/stats.json    -- the current leaderboard the site shows
  data/history.json  -- one value per player per day, for the trend chart

It also saves finished seasons listed in PAST_SEASONS once (data/season-YYYY.json) as a
baseline, and writes data/seasons.json so the page can offer a season picker.

Formula (season totals):
  (PTS + 2*AST + DRB + 2*ORB + 4*STL + BLK) / MP

Run by GitHub Actions once a day (.github/workflows/update-stats.yml).
"""
import datetime as dt
import json
import os
import re
import sys
import time
from urllib.request import Request, urlopen

from bs4 import BeautifulSoup, Comment

HERE = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(HERE, "data")
STATS_PATH = os.path.join(DATA_DIR, "stats.json")
HISTORY_PATH = os.path.join(DATA_DIR, "history.json")
SEASONS_PATH = os.path.join(DATA_DIR, "seasons.json")
# finished seasons to keep as a baseline, by the year they ended (2025-26 -> 2026)
PAST_SEASONS = [2026]

# column header text on Basketball-Reference -> our field name
COLS = {"Player": "name", "Team": "team", "Tm": "team", "Pos": "pos", "Age": "age",
        "G": "g", "GS": "gs", "MP": "mp", "PTS": "pts", "AST": "ast",
        "DRB": "drb", "ORB": "orb", "STL": "stl", "BLK": "blk", "TOV": "tov", "TRB": "trb"}
NUMERIC = {"age", "g", "gs", "mp", "pts", "ast", "drb", "orb", "stl", "blk", "tov", "trb"}
MULTI_TEAM = re.compile(r"^(TOT|\dTM)$")


def stat_value(p):
    """The stat: (PTS + AST*2 + DRB + ORB*2 + STL*4 + BLK) / minutes played."""
    if not p["mp"]:
        return None
    total = p["pts"] + p["ast"] * 2 + p["drb"] + p["orb"] * 2 + p["stl"] * 4 + p["blk"]
    return total / p["mp"]


def season_end_year(today):
    # The NBA season that starts in October is named for the year it ends (2026-27 -> 2027).
    return today.year + 1 if today.month >= 8 else today.year


def fetch(url, tries=3):
    req = Request(url, headers={"User-Agent": "Mozilla/5.0 (stat leaderboard; daily update)"})
    for i in range(tries):
        try:
            with urlopen(req, timeout=60) as r:
                return r.status, r.read().decode("utf-8", "replace")
        except Exception as e:  # noqa: BLE001
            code = getattr(e, "code", None)
            if code == 404:
                return 404, ""
            if i == tries - 1:
                raise
            time.sleep(20 * (i + 1))
    return None, ""


def find_totals_table(html):
    soup = BeautifulSoup(html, "html.parser")
    candidates = soup.find_all("table")
    # Basketball-Reference sometimes ships tables inside HTML comments
    for c in soup.find_all(string=lambda s: isinstance(s, Comment)):
        if "<table" in c:
            candidates += BeautifulSoup(c, "html.parser").find_all("table")
    for t in candidates:
        heads = [th.get_text(strip=True) for th in (t.find("thead") or t).find_all("th")]
        if {"Player", "MP", "PTS", "ORB", "DRB", "STL"} <= set(heads):
            return t
    return None


def parse_players(html):
    table = find_totals_table(html)
    if table is None:
        return []
    head_row = table.find("thead").find_all("tr")[-1]
    headers = [th.get_text(strip=True) for th in head_row.find_all(["th", "td"])]
    players, order = {}, []
    for tr in table.find("tbody").find_all("tr"):
        if "thead" in (tr.get("class") or []):
            continue  # repeated header rows
        cells = tr.find_all(["th", "td"])
        if len(cells) != len(headers):
            continue
        row, pid = {}, None
        for h, cell in zip(headers, cells):
            key = COLS.get(h)
            if not key:
                continue
            txt = cell.get_text(strip=True)
            if key == "name":
                a = cell.find("a")
                if a and a.get("href"):
                    m = re.search(r"/players/\w/([\w.]+)\.html", a["href"])
                    pid = m.group(1) if m else None
                pid = pid or cell.get("data-append-csv")
                row["name"] = txt.rstrip("*")
            elif key in NUMERIC:
                try:
                    row[key] = float(txt) if txt else 0.0
                except ValueError:
                    row[key] = 0.0
            else:
                row[key] = txt
        if not row.get("name") or row["name"] in ("Player", "League Average"):
            continue
        pid = pid or row["name"]
        team = row.get("team", "")
        if pid not in players:
            # first row for a traded player is their combined season (TOT / 2TM / 3TM)
            row["teams"] = [] if MULTI_TEAM.match(team) else [team]
            players[pid] = row
            order.append(pid)
        elif not MULTI_TEAM.match(team):
            players[pid]["teams"].append(team)  # their individual team rows, in order
    out = []
    for pid in order:
        p = players[pid]
        for k in NUMERIC:
            p.setdefault(k, 0.0)
        teams = p.pop("teams")
        p["team"] = teams[-1] if teams else p.get("team", "")
        if len(teams) > 1:
            p["teams"] = teams
        p["id"] = pid
        v = stat_value(p)
        if v is None:
            continue
        p["value"] = round(v, 4)
        for k in NUMERIC:
            p[k] = int(p[k]) if float(p[k]).is_integer() else p[k]
        out.append(p)
    out.sort(key=lambda p: p["value"], reverse=True)
    return out


def load_json(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def season_label(year):
    return f"{year - 1}-{str(year)[2:]}"


def season_url(year):
    return f"https://www.basketball-reference.com/leagues/NBA_{year}_totals.html"


def save_past_seasons(now, current_year):
    """Download each finished baseline season once; they don't change after the season ends."""
    for year in PAST_SEASONS:
        if year >= current_year:
            continue
        path = os.path.join(DATA_DIR, f"season-{year}.json")
        if load_json(path, {}).get("players"):
            continue
        time.sleep(4)  # be polite to the stats site between page loads
        url = season_url(year)
        status, html = fetch(url)
        players = parse_players(html) if status == 200 else []
        if not players:
            print(f"Couldn't load the {season_label(year)} baseline (HTTP {status}); will try again next run")
            continue
        with open(path, "w", encoding="utf-8") as f:
            json.dump({"season": season_label(year), "final": True, "updatedAt": now.isoformat(timespec="seconds"),
                       "source": url, "formula": "(PTS + AST*2 + DRB + ORB*2 + STL*4 + BLK) / MP",
                       "players": players}, f, separators=(",", ":"))
        print(f"Saved {season_label(year)} baseline: {len(players)} players; top: {players[0]['name']} {players[0]['value']:.3f}")


def write_season_index(current_year):
    seasons = [{"label": season_label(current_year), "file": "stats.json", "current": True}]
    for year in sorted(PAST_SEASONS, reverse=True):
        path = os.path.join(DATA_DIR, f"season-{year}.json")
        if year < current_year and load_json(path, {}).get("players"):
            seasons.append({"label": season_label(year), "file": f"season-{year}.json", "current": False})
    with open(SEASONS_PATH, "w", encoding="utf-8") as f:
        json.dump(seasons, f, separators=(",", ":"))


def main():
    now = dt.datetime.now(dt.timezone.utc)
    year = season_end_year(now)
    os.makedirs(DATA_DIR, exist_ok=True)
    try:
        save_past_seasons(now, year)
    except Exception as e:  # noqa: BLE001 -- a baseline hiccup shouldn't stop today's update
        print(f"Baseline season download failed: {e}")
    write_season_index(year)
    url = season_url(year)
    status, html = fetch(url)
    players = parse_players(html) if status == 200 else []
    season = season_label(year)

    if not players:
        old = load_json(STATS_PATH, {})
        old.update({"season": season, "checkedAt": now.isoformat(timespec="seconds"),
                    "note": "No stats posted for this season yet. The board fills in after the first games."})
        old.setdefault("players", [])
        with open(STATS_PATH, "w", encoding="utf-8") as f:
            json.dump(old, f, separators=(",", ":"))
        print(f"No player rows found (HTTP {status}) at {url}")
        return 0

    stats = {"season": season, "updatedAt": now.isoformat(timespec="seconds"),
             "checkedAt": now.isoformat(timespec="seconds"), "source": url,
             "formula": "(PTS + AST*2 + DRB + ORB*2 + STL*4 + BLK) / MP",
             "players": players}
    with open(STATS_PATH, "w", encoding="utf-8") as f:
        json.dump(stats, f, separators=(",", ":"))

    # history: {"season": "2026-27", "days": {"2026-11-01": {"playerId": value, ...}}, "names": {...}}
    hist = load_json(HISTORY_PATH, {})
    if hist.get("season") != season:
        hist = {"season": season, "days": {}, "names": {}}
    day = now.astimezone(dt.timezone(dt.timedelta(hours=-5))).date().isoformat()
    hist["days"][day] = {p["id"]: p["value"] for p in players if p["mp"] >= 1}
    for p in players:
        hist["names"][p["id"]] = p["name"]
    with open(HISTORY_PATH, "w", encoding="utf-8") as f:
        json.dump(hist, f, separators=(",", ":"))
    print(f"Saved {len(players)} players for {season}; top: {players[0]['name']} {players[0]['value']:.3f}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
