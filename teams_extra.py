"""Front-office facts for the team pages, saved to data/team_extra.json (refreshed every morning):

  coach, executive, arena   each team's Basketball-Reference season page (30 pages, one every 5 seconds)
  future draft picks        RealGM's "future draft picks by team" page: who owns each team's 1st and
                            2nd-round picks for the next seven drafts, with protections and swaps
  injury report             ESPN's public injury feed (the team page also checks it live when it opens)

Owners don't change often, so they're typed into data/owners.json by hand.
"""
import datetime as dt
import json
import os
import re
import time
from urllib.request import Request, urlopen

from bs4 import BeautifulSoup

from update_stats import DATA_DIR, fetch, load_json

EXTRA_PATH = os.path.join(DATA_DIR, "team_extra.json")
BBR = "https://www.basketball-reference.com"
PICKS_URL = "https://basketball.realgm.com/nba/draft/future_drafts/team"
INJURY_URL = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/injuries"
PAUSE = 5
BROWSER = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
                         "Chrome/124.0 Safari/537.36", "Accept-Language": "en-US,en;q=0.9"}

# NBA code -> (Basketball-Reference code, full name)
TEAMS = {
    "ATL": ("ATL", "Atlanta Hawks"), "BOS": ("BOS", "Boston Celtics"), "BKN": ("BRK", "Brooklyn Nets"),
    "CHA": ("CHO", "Charlotte Hornets"), "CHI": ("CHI", "Chicago Bulls"), "CLE": ("CLE", "Cleveland Cavaliers"),
    "DAL": ("DAL", "Dallas Mavericks"), "DEN": ("DEN", "Denver Nuggets"), "DET": ("DET", "Detroit Pistons"),
    "GSW": ("GSW", "Golden State Warriors"), "HOU": ("HOU", "Houston Rockets"), "IND": ("IND", "Indiana Pacers"),
    "LAC": ("LAC", "LA Clippers"), "LAL": ("LAL", "Los Angeles Lakers"), "MEM": ("MEM", "Memphis Grizzlies"),
    "MIA": ("MIA", "Miami Heat"), "MIL": ("MIL", "Milwaukee Bucks"), "MIN": ("MIN", "Minnesota Timberwolves"),
    "NOP": ("NOP", "New Orleans Pelicans"), "NYK": ("NYK", "New York Knicks"), "OKC": ("OKC", "Oklahoma City Thunder"),
    "ORL": ("ORL", "Orlando Magic"), "PHI": ("PHI", "Philadelphia 76ers"), "PHX": ("PHO", "Phoenix Suns"),
    "POR": ("POR", "Portland Trail Blazers"), "SAC": ("SAC", "Sacramento Kings"), "SAS": ("SAS", "San Antonio Spurs"),
    "TOR": ("TOR", "Toronto Raptors"), "UTA": ("UTA", "Utah Jazz"), "WAS": ("WAS", "Washington Wizards"),
}
NICK = {code: name.split()[-1].lower() for code, (_, name) in TEAMS.items()}
NICK["POR"] = "blazers"


def code_for(text):
    """'Oklahoma City Thunder' / 'Portland Trail Blazers' / 'LA Clippers' -> NBA code."""
    low = (text or "").lower()
    for code, nick in NICK.items():
        if nick in low:
            return code
    return None


def get_browser(url):
    with urlopen(Request(url, headers=BROWSER), timeout=60) as r:
        return r.read().decode("utf-8", "replace")


def save(data):
    with open(EXTRA_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, separators=(",", ":"))


# ---------- coach, executive, arena ----------
def front_office(current_year):
    out = {}
    for code, (bbr, _) in TEAMS.items():
        time.sleep(PAUSE)
        try:
            status, html = fetch(f"{BBR}/teams/{bbr}/{current_year}.html")
        except Exception as e:  # noqa: BLE001 -- rate limited: keep what we have
            print(f"Team pages stopped at {code}: {e}")
            break
        if status != 200:
            continue
        meta = BeautifulSoup(html, "html.parser").find(id="meta")
        if not meta:
            continue
        info = {}
        for p in meta.find_all("p"):
            txt = " ".join(p.get_text(" ", strip=True).split())
            m = re.match(r"^(Coach|Executive|Arena|Record)\s*:\s*(.+)$", txt)
            if m:
                key = m.group(1).lower()
                val = m.group(2)
                if key == "coach":
                    val = re.sub(r"\s*\(\s*\d+-\d+\s*\)\s*$", "", val)   # "Name (5-2)" -> "Name"
                    val = re.sub(r"\s*\(\s*\d+-\d+\s*\)\s*", ", ", val).strip(", ")
                if key == "arena":
                    val = re.split(r"\s+Attendance\s*:", val)[0]
                info[key] = val
        if info:
            out[code] = info
    return out


# ---------- future draft picks ----------
def future_picks():
    """{code: {"headers": [...], "rows": [[cell, ...], ...]}} -- one row per draft year."""
    html = get_browser(PICKS_URL)
    soup = BeautifulSoup(html, "html.parser")
    out = {}
    for table in soup.find_all("table"):
        heads = [th.get_text(" ", strip=True) for th in table.find_all("th")]
        if not any("First" in h for h in heads):
            continue
        team = None
        for tags, limit in ((["h1", "h2", "h3", "h4", "h5"], 2), (["a", "div", "span", "strong", "p"], 12)):
            for prev in table.find_all_previous(tags, limit=limit):
                txt = prev.get_text(" ", strip=True)
                team = code_for(txt) if len(txt) < 80 else None
                if team:
                    break
            if team:
                break
        cap = table.find("caption")
        if cap:
            team = code_for(cap.get_text(" ", strip=True)) or team
        if not team or team in out:
            continue
        body = []
        for tr in (table.find("tbody") or table).find_all("tr"):
            cells = [" ".join(td.get_text(" ", strip=True).split()) for td in tr.find_all(["td", "th"])]
            if cells and re.match(r"^\d{4}$", cells[0]):
                body.append(cells)
        if body:
            out[team] = {"headers": heads[:len(body[0])], "rows": body}
    return out


# ---------- injuries ----------
def injuries():
    data = json.loads(get_browser(INJURY_URL))
    out = {}
    for team in data.get("injuries", []):
        code = code_for(team.get("displayName"))
        if not code:
            continue
        rows = []
        for inj in team.get("injuries", []):
            ath = inj.get("athlete") or {}
            det = inj.get("details") or {}
            rows.append({"name": ath.get("displayName"), "pos": (ath.get("position") or {}).get("abbreviation"),
                         "status": inj.get("status"), "date": (inj.get("date") or "")[:10],
                         "type": det.get("type") or "", "detail": det.get("detail") or "",
                         "side": det.get("side") or "", "ret": (det.get("returnDate") or "")[:10],
                         "note": inj.get("shortComment") or ""})
        out[code] = rows
    return out


def update(now, current_year):
    data = load_json(EXTRA_PATH, {})
    for key, fn in (("injuries", injuries), ("picks", future_picks), ("frontOffice", lambda: front_office(current_year))):
        try:
            got = fn()
            if got:
                data[key] = got
                data.setdefault("at", {})[key] = now.isoformat(timespec="seconds")
                print(f"Team extras: {key} for {len(got)} teams")
            else:
                print(f"Team extras: no {key} found (kept the last saved copy)")
        except Exception as e:  # noqa: BLE001
            print(f"Team extras: {key} failed: {e}")
        save(data)


if __name__ == "__main__":
    now = dt.datetime.now(dt.timezone.utc)
    update(now, now.year + (1 if now.month >= 8 else 0))
