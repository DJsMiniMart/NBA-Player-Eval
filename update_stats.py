"""Daily updater for the NBA stat leaderboard.

Downloads this season's player totals from Basketball-Reference, runs every player
through the stat formula, and writes:
  data/stats.json    -- the current leaderboard the site shows
  data/history.json  -- one value per player per day, for the trend chart

It also saves every finished season from 1973-74 on, once each (data/season-YYYY.json),
builds data/alltime.json (every player-season, for the all-time list and career charts),
and writes data/seasons.json so the page can offer a season picker.

1973-74 is the first NBA season that tracked steals, blocks, and offensive/defensive
rebounds separately, so it's the earliest season the formula can be run on.

Formula (season totals):
  ((PTS + 2*AST + 2*REB + 4*STL + BLK) - 4*TOV) / MP
  (the same as using per-game numbers divided by minutes per game)
  The NBA didn't record turnovers before 1977-78, so nothing is subtracted for 1973-74 to 1976-77.

Playoff totals for every season are saved the same way (data/playoffs-YYYY.json).

After that it runs the player-page steps (each one can fail without stopping the others):
  bbr_extra.py     -- bios, draft picks, contracts (Basketball-Reference)
  nba_games.py     -- every game's box score + play-by-play from the NBA's public feed
  build_players.py -- one file per player for the player page (data/players/<id>.json)

Run by GitHub Actions once a day (.github/workflows/update-stats.yml).
"""
import datetime as dt
import json
import os
import re
import sys
import time
import traceback
from urllib.request import Request, urlopen

from bs4 import BeautifulSoup, Comment

HERE = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(HERE, "data")
STATS_PATH = os.path.join(DATA_DIR, "stats.json")
HISTORY_PATH = os.path.join(DATA_DIR, "history.json")
SEASONS_PATH = os.path.join(DATA_DIR, "seasons.json")
ALLTIME_PATH = os.path.join(DATA_DIR, "alltime.json")
# Saved seasons are re-scored with this whenever it changes, so edit stat_value() and this together.
FORMULA = "((PTS + AST*2 + REB*2 + STL*4 + BLK) - TOV*4) / MP"
FIRST_TOV_SEASON = 1978   # 1977-78: first season with turnovers
# first season with steals, blocks and offensive/defensive rebounds (1973-74 -> 1974)
FIRST_SEASON = 1974
MAX_NEW_SEASONS_PER_RUN = 60   # the first run downloads them all; later runs have nothing to do
ALLTIME_MIN_MINUTES = 100      # leave out tiny cameo seasons from the all-time file
SEASON_SCHEMA = 3              # bump when new columns are saved, so old season files get re-downloaded
                               # (3: per-team splits for players who changed teams mid-season)
PLAYOFF_SCHEMA = 2             # playoff files never need splits (no trades during the playoffs)
SPLIT_KEYS = ["g", "mp", "pts", "ast", "drb", "orb", "stl", "blk", "tov"]

# column header text on Basketball-Reference -> our field name
COLS = {"Player": "name", "Team": "team", "Tm": "team", "Pos": "pos", "Age": "age",
        "G": "g", "GS": "gs", "MP": "mp", "PTS": "pts", "AST": "ast",
        "DRB": "drb", "ORB": "orb", "STL": "stl", "BLK": "blk", "TOV": "tov", "TRB": "trb",
        "FG": "fg", "FGA": "fga", "3P": "fg3", "3PA": "fg3a", "FT": "ft", "FTA": "fta", "PF": "pf"}
NUMERIC = {"age", "g", "gs", "mp", "pts", "ast", "drb", "orb", "stl", "blk", "tov", "trb",
           "fg", "fga", "fg3", "fg3a", "ft", "fta", "pf"}
MULTI_TEAM = re.compile(r"^(TOT|\dTM)$")


def stat_value(p):
    """The stat: ((PTS + AST*2 + REB*2 + STL*4 + BLK) - TOV*4) / minutes played."""
    if not p["mp"]:
        return None
    reb = p.get("trb") if p.get("trb") is not None else (p.get("drb") or 0) + (p.get("orb") or 0)
    total = p["pts"] + p["ast"] * 2 + reb * 2 + p["stl"] * 4 + p["blk"] - (p.get("tov") or 0) * 4
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
            # ...and what they did with each team, for the team-only all-time lists
            players[pid].setdefault("splits", []).append(
                {"team": team, **{k: int(row.get(k) or 0) for k in SPLIT_KEYS}})
    out = []
    for pid in order:
        p = players[pid]
        for k in NUMERIC:
            p.setdefault(k, 0.0)
        teams = p.pop("teams")
        p["team"] = teams[-1] if teams else p.get("team", "")
        if len(teams) > 1:
            p["teams"] = teams
        else:
            p.pop("splits", None)
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
    added = 0
    for year in range(current_year - 1, FIRST_SEASON - 1, -1):  # newest first
        path = os.path.join(DATA_DIR, f"season-{year}.json")
        saved = load_json(path, {})
        if saved.get("players") and saved.get("schema") == SEASON_SCHEMA:
            continue
        if added >= MAX_NEW_SEASONS_PER_RUN:
            break
        time.sleep(5)  # be polite to the stats site between page loads (stays under its rate limit)
        url = season_url(year)
        try:
            status, html = fetch(url)
        except Exception as e:  # noqa: BLE001 -- likely rate limited; pick up where we left off next run
            print(f"Stopped downloading old seasons at {season_label(year)}: {e}")
            break
        added += 1
        players = parse_players(html) if status == 200 else []
        if not players:
            print(f"Couldn't load the {season_label(year)} baseline (HTTP {status}); will try again next run")
            continue
        with open(path, "w", encoding="utf-8") as f:
            json.dump({"season": season_label(year), "final": True, "updatedAt": now.isoformat(timespec="seconds"),
                       "source": url, "formula": FORMULA, "schema": SEASON_SCHEMA,
                       "players": players}, f, separators=(",", ":"))
        print(f"Saved {season_label(year)} baseline: {len(players)} players; top: {players[0]['name']} {players[0]['value']:.3f}")


def rescore(path, data):
    """Formula changed since this file was saved: re-score it from the saved totals."""
    if data.get("formula") == FORMULA or not data.get("players"):
        return
    for p in data["players"]:
        p["value"] = round(stat_value(p), 4)
    data["players"].sort(key=lambda p: p["value"], reverse=True)
    data["formula"] = FORMULA
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, separators=(",", ":"))
    print(f"Re-scored {data.get('season')} {'playoffs' if 'playoffs' in path else ''} with the current formula")


def playoffs_url(year):
    return f"https://www.basketball-reference.com/playoffs/NBA_{year}_totals.html"


def save_playoffs(now, current_year):
    """Every season's playoff totals, once; the current season's while the playoffs are on (April-July)."""
    for year in range(current_year, FIRST_SEASON - 1, -1):
        path = os.path.join(DATA_DIR, f"playoffs-{year}.json")
        saved = load_json(path, {})
        if year == current_year:
            if now.month not in (4, 5, 6, 7):
                continue
        elif saved.get("complete") and (saved.get("schema") or 0) >= PLAYOFF_SCHEMA:
            rescore(path, saved)
            continue
        time.sleep(5)
        try:
            status, html = fetch(playoffs_url(year))
        except Exception as e:  # noqa: BLE001 -- rate limited: carry on tomorrow
            print(f"Stopped downloading playoffs at {season_label(year)}: {e}")
            break
        players = parse_players(html) if status == 200 else []
        if not players:
            if year != current_year:
                print(f"No playoff totals for {season_label(year)} (HTTP {status})")
            continue
        with open(path, "w", encoding="utf-8") as f:
            json.dump({"season": season_label(year), "playoffs": True, "complete": year < current_year,
                       "updatedAt": now.isoformat(timespec="seconds"), "source": playoffs_url(year),
                       "formula": FORMULA, "schema": PLAYOFF_SCHEMA, "players": players}, f, separators=(",", ":"))
        print(f"Saved {season_label(year)} playoffs: {len(players)} players")


def write_season_index(current_year):
    """seasons.json (the picker) + alltime.json (every finished player-season, compact)."""
    seasons = [{"label": season_label(current_year), "file": "stats.json", "current": True}]
    rows, done = [], []
    for year in range(current_year - 1, FIRST_SEASON - 1, -1):
        path = os.path.join(DATA_DIR, f"season-{year}.json")
        data = load_json(path, {})
        if not data.get("players"):
            continue
        rescore(path, data)
        label = season_label(year)
        seasons.append({"label": label, "file": f"season-{year}.json", "current": False})
        done.append(label)
        for p in data["players"]:
            if p["mp"] < ALLTIME_MIN_MINUTES:
                continue
            team = " \u2192 ".join(p["teams"]) if p.get("teams") else p.get("team", "")
            splits = [[s["team"]] + [s[k] for k in SPLIT_KEYS] for s in p.get("splits", [])] or 0
            rows.append([p["id"], p["name"], label, team, p["g"], p["mp"], p["pts"], p["ast"],
                         p["drb"], p["orb"], p["stl"], p["blk"], p.get("tov", 0), p["value"], splits])
    with open(SEASONS_PATH, "w", encoding="utf-8") as f:
        json.dump(seasons, f, separators=(",", ":"))
    with open(ALLTIME_PATH, "w", encoding="utf-8") as f:
        json.dump({"seasons": done, "cols": ["id", "name", "season", "team", "g", "mp", "pts", "ast",
                                             "drb", "orb", "stl", "blk", "tov", "value", "splits"], "rows": rows},
                  f, separators=(",", ":"))


def main():
    now = dt.datetime.now(dt.timezone.utc)
    year = season_end_year(now)
    if "--backfill" in sys.argv:   # earlier seasons for career stats; slow, so it runs after today's numbers are saved
        run_step("earlier seasons (careers, from ESPN)", lambda: __import__("espn_games").backfill(now, year, time.time()))
        run_step("player pages", lambda: __import__("build_players").build(now, year))
        return 0
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

    if players:
        save_current(now, season, url, players)
    else:
        old = load_json(STATS_PATH, {})
        old.update({"season": season, "checkedAt": now.isoformat(timespec="seconds"),
                    "note": "No stats posted for this season yet. The board fills in after the first games."})
        old.setdefault("players", [])
        with open(STATS_PATH, "w", encoding="utf-8") as f:
            json.dump(old, f, separators=(",", ":"))
        print(f"No player rows found (HTTP {status}) at {url}")

    run_step("rookies", lambda: write_rookies(year))
    run_step("playoffs", lambda: save_playoffs(now, year))
    run_step("bios, drafts, contracts", lambda: __import__("bbr_extra").update(now, year))
    # The NBA's own feed (nba_games.py) turns away GitHub's servers, so games come from ESPN
    run_step("games (box scores + play-by-play, from ESPN)", lambda: __import__("espn_games").update(now, year))
    run_step("morning page (recaps, headlines, transactions)", lambda: __import__("morning").update(now, year))
    run_step("player pages", lambda: __import__("build_players").build(now, year))
    run_step("team extras (coach, picks, injuries)", lambda: __import__("teams_extra").update(now, year))
    run_step("franchise history (records, titles, awards, draft picks)", lambda: __import__("franchise_history").update(now, year))
    run_step("team pages", lambda: __import__("build_teams").build(now, year))
    run_step("MVR picks and storylines", lambda: __import__("predict").update(now, year))
    return 0


def write_rookies(year):
    """data/rookies.json: this season's players who never appeared in an earlier season (any minutes), with draft info."""
    import glob
    cur = (load_json(STATS_PATH, {}) or {}).get("players") or []
    seen = set()
    for fn in glob.glob(os.path.join(DATA_DIR, "season-*.json")):
        if fn.endswith(f"season-{year}.json"):
            continue
        seen |= {p.get("id") for p in (load_json(fn, {}) or {}).get("players", [])}
    if len(seen) < 1000:   # past seasons missing: don't call everyone a rookie
        print("Rookies: past seasons not available; skipped")
        return
    drafts = (load_json(os.path.join(DATA_DIR, "drafts.json"), {}) or {}).get("players", {})
    ids = sorted({p["id"] for p in cur if p.get("id") and p["id"] not in seen})
    with open(os.path.join(DATA_DIR, "rookies.json"), "w", encoding="utf-8") as f:
        json.dump({"season": season_label(year), "ids": ids, "draft": {i: drafts[i] for i in ids if i in drafts}}, f, separators=(",", ":"))
    print(f"Rookies: {len(ids)}")


def run_step(name, fn):
    print(f"--- {name} ---", flush=True)
    try:
        fn()
    except Exception:  # noqa: BLE001 -- one step failing shouldn't stop the rest
        print(f"{name} failed:")
        traceback.print_exc()


def save_current(now, season, url, players):
    stats = {"season": season, "updatedAt": now.isoformat(timespec="seconds"),
             "checkedAt": now.isoformat(timespec="seconds"), "source": url,
             "formula": FORMULA, "schema": SEASON_SCHEMA,
             "players": players}
    with open(STATS_PATH, "w", encoding="utf-8") as f:
        json.dump(stats, f, separators=(",", ":"))

    # history: {"season": "2026-27", "days": {"2026-11-01": {"playerId": value, ...}}, "names": {...}}
    hist = load_json(HISTORY_PATH, {})
    if hist.get("season") != season or hist.get("formula") != FORMULA:
        # new season, or the formula changed (old daily numbers can't be re-scored) -> start the trend over
        hist = {"season": season, "formula": FORMULA, "days": {}, "names": {}}
    day = now.astimezone(dt.timezone(dt.timedelta(hours=-5))).date().isoformat()
    hist["days"][day] = {p["id"]: p["value"] for p in players if p["mp"] >= 1}
    for p in players:
        hist["names"][p["id"]] = p["name"]
    with open(HISTORY_PATH, "w", encoding="utf-8") as f:
        json.dump(hist, f, separators=(",", ":"))
    print(f"Saved {len(players)} players for {season}; top: {players[0]['name']} {players[0]['value']:.3f}")


if __name__ == "__main__":
    sys.exit(main())
