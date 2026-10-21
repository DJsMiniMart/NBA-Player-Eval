"""Franchise history for the team pages, from Basketball-Reference. Writes data/franchise.json:

  titles    every NBA (and BAA) championship, with the team's name that season   (/leagues/)
  leaders   franchise career leaders in points, rebounds, assists, steals, blocks, games
                                                                    (/teams/<code>/leaders_career.html)
  coaches   every head coach with regular-season and playoff wins   (/teams/<code>/coaches.html)
  draft     every pick the franchise made: year, round, overall pick, player, college
                                                                    (/teams/<code>/draft.html)
  awards    MVP, Finals MVP, Defensive Player, Rookie, Sixth Man, Most Improved, Clutch Player and
            Coach of the Year, All-NBA, All-Defensive and All-Rookie teams, credited to the team the
            player was on                                           (/awards/awards_<year>.html, plus
            /awards/all_league.html etc. for older seasons, with the player's team that season)

Teams that moved count toward today's franchise (Seattle -> Thunder, Minneapolis Lakers -> Lakers...).
Finished seasons never change, so each season's award page is read once; team pages are refreshed
weekly, and everything about the season that just ended is re-checked until the awards are all in.
Pages are read slowly (one every 5 seconds) to stay under the site's rate limit; anything left over
is picked up on the next run.
"""
import datetime as dt
import json
import os
import re
import time

from bs4 import BeautifulSoup, Comment

from update_stats import DATA_DIR, fetch, load_json

OUT_PATH = os.path.join(DATA_DIR, "franchise.json")
CACHE_PATH = os.path.join(DATA_DIR, "franchise_cache.json")
BBR = "https://www.basketball-reference.com"
PAUSE = 5
TIME_BUDGET_SEC = 30 * 60
TEAM_REFRESH_DAYS = 7
PAGE_VERSION = 2             # bump when the award-page reader changes, so affected seasons are read again
FIRST_YEAR = 1947            # 1946-47, the BAA's first season (the NBA counts it as its own)

# today's 30 teams: NBA code -> Basketball-Reference franchise code
FRANCHISE_PAGE = {"ATL": "ATL", "BOS": "BOS", "BKN": "NJN", "CHA": "CHA", "CHI": "CHI", "CLE": "CLE", "DAL": "DAL",
                  "DEN": "DEN", "DET": "DET", "GSW": "GSW", "HOU": "HOU", "IND": "IND", "LAC": "LAC", "LAL": "LAL",
                  "MEM": "MEM", "MIA": "MIA", "MIL": "MIL", "MIN": "MIN", "NOP": "NOH", "NYK": "NYK", "OKC": "OKC",
                  "ORL": "ORL", "PHI": "PHI", "PHX": "PHO", "POR": "POR", "SAC": "SAC", "SAS": "SAS", "TOR": "TOR",
                  "UTA": "UTA", "WAS": "WAS"}
# every Basketball-Reference NBA/BAA season code -> today's NBA franchise (defunct teams are left out, and so are
# ABA codes, so ABA awards aren't counted as NBA ones)
HIST = {
    "ATL": "ATL", "STL": "ATL", "MLH": "ATL", "TRI": "ATL",
    "BOS": "BOS", "BRK": "BKN", "NJN": "BKN", "NYN": "BKN",
    "CHO": "CHA", "CHA": "CHA", "CHH": "CHA",
    "CHI": "CHI", "CLE": "CLE", "DAL": "DAL", "DEN": "DEN",
    "DET": "DET", "FTW": "DET", "GSW": "GSW", "SFW": "GSW", "PHW": "GSW",
    "HOU": "HOU", "SDR": "HOU", "IND": "IND",
    "LAC": "LAC", "SDC": "LAC", "BUF": "LAC", "LAL": "LAL", "MNL": "LAL",
    "MEM": "MEM", "VAN": "MEM", "MIA": "MIA", "MIL": "MIL", "MIN": "MIN",
    "NOP": "NOP", "NOH": "NOP", "NOK": "NOP", "NYK": "NYK", "OKC": "OKC", "SEA": "OKC",
    "ORL": "ORL", "PHI": "PHI", "SYR": "PHI", "PHO": "PHX", "POR": "POR",
    "SAC": "SAC", "KCK": "SAC", "KCO": "SAC", "CIN": "SAC", "ROC": "SAC",
    "SAS": "SAS", "TOR": "TOR", "UTA": "UTA", "NOJ": "UTA",
    "WAS": "WAS", "WSB": "WAS", "CAP": "WAS", "BAL": "WAS", "CHZ": "WAS", "CHP": "WAS",
}
# award table on a season page -> (key, label)
SINGLE = [("mvp", "MVP"), ("dpoy", "Defensive Player of the Year"), ("roy", "Rookie of the Year"),
          ("smoy", "Sixth Man of the Year"), ("mip", "Most Improved Player"), ("clutch_poy", "Clutch Player of the Year"),
          ("coy", "Coach of the Year")]
TEAMS3 = [("leading_all_nba", "all_nba_team", "All-NBA", "all_league"),
          ("leading_all_defense", "all_defense_team", "All-Defensive", "all_defense"),
          ("leading_all_rookie", "all_rookie_team", "All-Rookie", "all_rookie")]
ORDER = ["mvp", "fmvp", "dpoy", "roy", "smoy", "mip", "clutch_poy", "coy", "all_nba", "all_defense", "all_rookie"]
LEADER_STATS = [("pts", "Points"), ("trb", "Rebounds"), ("ast", "Assists"), ("stl", "Steals"), ("blk", "Blocks"),
                ("g", "Games"), ("fg3", "3-pointers")]


def save(path, data):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, separators=(",", ":"))
    os.replace(tmp, path)


def season_label(end_year):
    return f"{end_year - 1}-{str(end_year)[2:]}"


def soup_all(html):
    """The page plus every table Basketball-Reference hides inside HTML comments."""
    soup = BeautifulSoup(html, "html.parser")
    for c in soup.find_all(string=lambda s: isinstance(s, Comment)):
        if "<table" in c or "<div" in c:
            c.replace_with(BeautifulSoup(c, "html.parser"))
    return soup


def body_rows(soup, table_id):
    """A table's rows. Some pages leave out <tbody>, so fall back to every row in the table."""
    t = soup.find("table", id=table_id)
    if not t:
        return []
    return (t.find("tbody") or t).find_all("tr")


def cell(tr, stat):
    td = tr.find(attrs={"data-stat": stat})
    return td.get_text(" ", strip=True) if td else ""


def link_id(td, kind="players"):
    a = td.find("a", href=re.compile(rf"/{kind}/")) if td else None
    m = re.search(rf"/{kind}/(?:\w/)?([\w.]+)\.html", a["href"]) if a else None
    return m.group(1) if m else None


def team_of(tr):
    td = tr.find(attrs={"data-stat": "team_id"})
    if not td:
        return None
    code = td.get_text(strip=True)
    a = td.find("a")
    m = re.search(r"/teams/(\w+)/", a["href"]) if a and a.get("href") else None
    return (m.group(1) if m else code) or None


def get(url):
    time.sleep(PAUSE)
    status, html = fetch(url)
    return html if status == 200 else ""


def to_int(s):
    try:
        return int(re.sub(r"[^\d-]", "", str(s)) or 0)
    except ValueError:
        return 0


# ---------- league-wide pages ----------
def champions(html):
    """[[end year, league, BBR code, team name], ...]"""
    out = []
    soup = soup_all(html)
    for tr in body_rows(soup, "stats"):
        td = tr.find(attrs={"data-stat": "champion"})
        lg = cell(tr, "lg_id")
        if not td or lg not in ("NBA", "BAA"):
            continue
        a = td.find("a")
        m = re.search(r"/teams/(\w+)/(\d{4})\.html", a["href"]) if a and a.get("href") else None
        if m:
            out.append([int(m.group(2)), lg, m.group(1), td.get_text(strip=True)])
    return out


def finals_mvps(html):
    out = []
    for tr in body_rows(soup_all(html), "finals_mvp_NBA"):
        season, pid, team = cell(tr, "season"), link_id(tr.find(attrs={"data-stat": "player"})), team_of(tr)
        if re.match(r"^\d{4}-\d{2}$", season) and pid and team:
            out.append([to_int(season[:4]) + 1, "fmvp", "Finals MVP", pid, clean_name(cell(tr, "player")), team, ""])
    return out


def clean_name(s):
    return re.sub(r"\s*\((Tie)\)\s*$", "", re.sub(r"\s+[CFG](-[CFG])?$", "", s.replace("*", ""))).strip()


def season_awards(html, year):
    """Every award on /awards/awards_<year>.html: [year, key, label, player/coach id, name, team, tier]"""
    soup = soup_all(html)
    out, have = [], set()
    for key, label in SINGLE:
        t = soup.find("table", id=key) or soup.find("table", id=f"nba_{key}")   # "nba_mvp" while the ABA existed
        if not t:
            continue
        for tr in (t.find("tbody") or t).find_all("tr"):
            if not re.match(r"^1T?$", cell(tr, "rank")):
                continue
            who = "coaches" if key == "coy" else "players"
            td = tr.find(attrs={"data-stat": "coach" if key == "coy" else "player"})
            pid = link_id(td, who)
            if pid:
                out.append([year, key, label, pid, clean_name(td.get_text(" ", strip=True)), team_of(tr), ""])
    for tid, col, label, _ in TEAMS3:
        t = soup.find("table", id=tid)
        if not t:
            continue
        found = False
        for tr in (t.find("tbody") or t).find_all("tr"):
            tier = cell(tr, col)
            m = re.match(r"^(\d)", tier)
            td = tr.find(attrs={"data-stat": "player"})
            pid = link_id(td)
            if m and pid:
                found = True
                n = int(m.group(1))
                out.append([year, tid.replace("leading_", ""), label, pid, clean_name(td.get_text(" ", strip=True)),
                            team_of(tr), ["", "1st", "2nd", "3rd"][n] if n <= 3 else f"{n}th"])
        if found:
            have.add(tid)
    return out, have


def team_lists(html, page):
    """/awards/all_league.html etc.: {end year: [[tier, player id, name], ...]} (NBA/BAA only, no team)."""
    out = {}
    for tr in body_rows(soup_all(html), f"awards_{page}"):
        season, lg, tier = cell(tr, "season"), cell(tr, "lg_id"), cell(tr, "all_team")
        if lg not in ("NBA", "BAA") or not re.match(r"^\d{4}-\d{2}$", season):
            continue
        y = to_int(season[:4]) + 1
        for td in tr.find_all(attrs={"data-stat": re.compile(r"^\d+$")}):
            pid = link_id(td)
            if pid:
                out.setdefault(y, []).append([tier, pid, clean_name(td.get_text(" ", strip=True))])
    return out


def rosters(html):
    """{player id: the last team he played for} from a season's totals page (any era's columns)."""
    out = {}
    for t in soup_all(html).find_all("table"):
        if not t.find("a", href=re.compile(r"/players/")):
            continue
        for tr in (t.find("tbody") or t).find_all("tr"):
            pid = link_id(tr)
            a = tr.find("a", href=re.compile(r"/teams/\w+/\d{4}\.html"))
            if pid and a:   # combined "TOT" rows have no team link; later rows are his teams in order
                out[pid] = re.search(r"/teams/(\w+)/", a["href"]).group(1)
        if out:
            break
    return out


# ---------- one franchise ----------
def leaders(html):
    soup = soup_all(html)
    out = {}
    for stat, _ in LEADER_STATS:
        box = soup.find(id=f"leaders_{stat}")
        if not box:
            continue
        rows = []
        for row in box.find_all("div", recursive=True):
            r, w, v = row.find(class_="rank", recursive=False), row.find(class_="who", recursive=False), row.find(class_="value", recursive=False)
            if r and w and v:
                rows.append([link_id(w), w.get_text(" ", strip=True).replace("*", "").strip(), to_int(v.get_text())])
        out[stat] = rows[:25]
    return out


def coaches(html):
    out = []
    for tr in body_rows(soup_all(html), "coaches"):
        name = cell(tr, "coach")
        if not name or name == "Coach":
            continue
        out.append([link_id(tr.find(attrs={"data-stat": "coach"}), "coaches"), name.replace("*", "").strip(),
                    to_int(cell(tr, "year_min")), to_int(cell(tr, "year_max")), to_int(cell(tr, "g")), to_int(cell(tr, "wins")),
                    to_int(cell(tr, "losses")), to_int(cell(tr, "wins_playoffs")), to_int(cell(tr, "losses_playoffs")),
                    to_int(cell(tr, "years_league_champion"))])
    out.sort(key=lambda c: -c[5])
    return out


def draft(html):
    out = []
    for tr in body_rows(soup_all(html), "draft"):
        year, lg = to_int(cell(tr, "year_id")), cell(tr, "lg_id")
        if not year or lg not in ("NBA", "BAA", ""):
            continue
        td = tr.find(attrs={"data-stat": "player"})
        text = td.get_text(" ", strip=True).replace("\xa0", " ").replace("*", "").strip() if td else ""
        if not text:
            continue
        # "Ebuka Okorie (↳MEM ↳DET)": his rights were traded on draft night (to MEM, then DET)
        m = re.match(r"^(.*?)\s*\(([^)]*↳[^)]*)\)\s*$", text)
        name, moved = (m.group(1), re.findall(r"↳\s*(\w+)", m.group(2))) if m else (text, [])
        out.append([year, to_int(cell(tr, "round")), to_int(cell(tr, "pick_overall")), link_id(td), name,
                    cell(tr, "college_name"), to_int(cell(tr, "g")), to_int(cell(tr, "pts")), moved])
    return out


# ---------- putting it together ----------
def team_for(pid, year, cache):
    """Which team a player was on (his last team) in a season, for awards listed without a team."""
    path = os.path.join(DATA_DIR, f"season-{year}.json")
    if os.path.exists(path):
        for p in load_json(path, {}).get("players", []):
            if p.get("id") == pid:
                return (p.get("teams") or [p.get("team")])[-1]
    return cache.get("rosters", {}).get(str(year), {}).get(pid)


def update(now, current_year):
    started = time.time()
    out_of_time = lambda: time.time() - started > TIME_BUDGET_SEC  # noqa: E731
    cache = load_json(CACHE_PATH, {}) or {}
    cache.setdefault("seasons", {})
    cache.setdefault("teams", {})
    cache.setdefault("rosters", {})
    last_done = current_year - 1           # the season that has finished
    fresh = lambda key, days: key in cache.get("at", {}) and (now - dt.datetime.fromisoformat(cache["at"][key])).days < days  # noqa: E731

    def stamp(key):
        cache.setdefault("at", {})[key] = now.isoformat(timespec="seconds")

    try:
        # champions, Finals MVPs and the award-team lists (one page each, refreshed weekly)
        for key, url in (("champions", f"{BBR}/leagues/"), ("fmvp", f"{BBR}/awards/finals_mvp.html")):
            if not fresh(key, 7):
                html = get(url)
                got = champions(html) if key == "champions" else finals_mvps(html)
                if got:
                    cache[key] = got
                    stamp(key)
        for _, _, _, page in TEAMS3:
            if not fresh(page, 7):
                got = team_lists(get(f"{BBR}/awards/{page}.html"), page)
                if got:
                    cache[page] = {str(k): v for k, v in got.items()}
                    stamp(page)
        # each season's award page, once (the season that just ended: until it has every award)
        for year in range(last_done, FIRST_YEAR - 1, -1):
            if out_of_time():
                break
            done = cache["seasons"].get(str(year))
            stale = done and done.get("v", 1) < PAGE_VERSION and 1968 <= year <= 1976   # re-read: ABA-era table names
            if done and not stale and (year < last_done or done.get("complete")):
                continue
            html = get(f"{BBR}/awards/awards_{year}.html")
            if not html:
                continue
            awards, have = season_awards(html, year)
            keys = {a[1] for a in awards}
            complete = year < last_done or (now.month >= 7 and {"mvp", "roy", "dpoy"} <= keys and len(have) == 3)
            cache["seasons"][str(year)] = {"awards": awards, "have": sorted(have), "complete": complete, "v": PAGE_VERSION}
            save(CACHE_PATH, cache)
        # rosters for old seasons whose award teams have no team listed (before our season files start)
        for year in range(FIRST_YEAR, 1974):
            if out_of_time():
                break
            if str(year) in cache["rosters"]:
                continue
            lg = "BAA" if year <= 1949 else "NBA"
            got = rosters(get(f"{BBR}/leagues/{lg}_{year}_totals.html"))
            if got:
                cache["rosters"][str(year)] = got
                save(CACHE_PATH, cache)
        # each franchise's leaders, coaches and draft picks (weekly)
        for code, page in FRANCHISE_PAGE.items():
            if out_of_time():
                break
            if fresh(f"team-{code}", TEAM_REFRESH_DAYS):
                continue
            t = {}
            t["leaders"] = leaders(get(f"{BBR}/teams/{page}/leaders_career.html"))
            t["coaches"] = coaches(get(f"{BBR}/teams/{page}/coaches.html"))
            t["draft"] = draft(get(f"{BBR}/teams/{page}/draft.html"))
            if t["leaders"] or t["coaches"] or t["draft"]:
                old = cache["teams"].get(code, {})
                cache["teams"][code] = {k: v or old.get(k) for k, v in t.items()}
                stamp(f"team-{code}")
                save(CACHE_PATH, cache)
    except Exception as e:  # noqa: BLE001 -- probably rate limited: keep what we have, resume next run
        print(f"Franchise history paused: {e}")
    save(CACHE_PATH, cache)
    build(now, cache)
    print(f"Franchise history: {len(cache['seasons'])} award seasons, {len(cache['teams'])} teams, "
          f"{int(time.time() - started)}s")


def build(now, cache):
    teams = {code: {"titles": [], "awards": [], "leaders": {}, "coaches": [], "draft": []} for code in FRANCHISE_PAGE}
    for year, lg, bbr, name in cache.get("champions", []):
        code = HIST.get(bbr)
        if code:
            teams[code]["titles"].append([year, name, lg])
    awards = []
    for year, s in cache.get("seasons", {}).items():
        awards += s["awards"]
        y = int(year)
        for tid, _, label, page in TEAMS3:
            if tid in s.get("have", []):
                continue
            for tier, pid, name in cache.get(page, {}).get(year, []):
                awards.append([y, tid.replace("leading_", ""), label, pid, name, team_for(pid, y, cache), tier])
    awards += cache.get("fmvp", [])
    seen = set()
    for a in awards:
        code = HIST.get(a[5] or "")
        key = (a[0], a[1], a[3])
        if code and key not in seen:
            seen.add(key)
            teams[code]["awards"].append([a[0], season_label(a[0]), a[1], a[2], a[3], a[4], a[6], a[5]])
    for code, t in cache.get("teams", {}).items():
        if code in teams:
            teams[code].update({k: v for k, v in t.items() if v})
    for t in teams.values():
        t["titles"].sort()
        t["awards"].sort(key=lambda a: (-a[0], ORDER.index(a[2]) if a[2] in ORDER else 99, a[6], a[5]))
    save(OUT_PATH, {"at": now.isoformat(timespec="seconds"), "source": "basketball-reference.com",
                    "awardCols": ["year", "season", "key", "award", "id", "name", "tier", "team then"],
                    "coachCols": ["id", "name", "from", "to", "g", "w", "l", "playoff w", "playoff l", "titles"],
                    "draftCols": ["year", "round", "pick", "id", "name", "college", "g", "pts", "rights traded to"],
                    "teams": teams})


if __name__ == "__main__":
    n = dt.datetime.now(dt.timezone.utc)
    update(n, n.year + (1 if n.month >= 8 else 0))
