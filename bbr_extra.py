"""Player bios, draft picks and contracts from Basketball-Reference, for the player pages.

  data/bios.json       position, height, weight, birth date, college, first/last season
                       (from the A-Z player index pages; refreshed weekly)
  data/drafts.json     year, round, pick and team for every drafted player (one page per draft,
                       downloaded once; the newest draft is re-checked weekly)
  data/contracts.json  salary by season, with player/team options (refreshed daily)

Pages are fetched slowly (one every 5 seconds) to stay under the site's rate limit.
"""
import datetime as dt
import json
import os
import re
import string
import time

from bs4 import BeautifulSoup, Comment

from update_stats import DATA_DIR, FIRST_SEASON, fetch, load_json

BIOS_PATH = os.path.join(DATA_DIR, "bios.json")
DRAFTS_PATH = os.path.join(DATA_DIR, "drafts.json")
CONTRACTS_PATH = os.path.join(DATA_DIR, "contracts.json")
BASE = "https://www.basketball-reference.com"
PAUSE = 5
FIRST_DRAFT = 1960   # early enough to cover anyone who played in 1973-74


def save(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, separators=(",", ":"))


def tables(html):
    soup = BeautifulSoup(html, "html.parser")
    found = soup.find_all("table")
    for c in soup.find_all(string=lambda s: isinstance(s, Comment)):
        if "<table" in c:
            found += BeautifulSoup(c, "html.parser").find_all("table")
    return found


def rows(table):
    """Yield (headers, cells, tr) for each body row, matching cells to the last header row."""
    head = table.find("thead")
    if not head:
        return
    headers = [th.get_text(strip=True) for th in head.find_all("tr")[-1].find_all(["th", "td"])]
    for tr in (table.find("tbody") or table).find_all("tr"):
        cells = tr.find_all(["th", "td"])
        yield headers, cells, tr


def player_id(cell):
    a = cell.find("a") if cell else None
    m = re.search(r"/players/\w/([\w.]+)\.html", a["href"]) if a and a.get("href") else None
    return m.group(1) if m else (cell.get("data-append-csv") if cell else None)


def get(url):
    time.sleep(PAUSE)
    status, html = fetch(url)
    return html if status == 200 else ""


# ---------- bios ----------
def update_bios(now):
    bios = load_json(BIOS_PATH, {})
    meta = bios.get("_meta", {})
    if meta.get("at") and (now - dt.datetime.fromisoformat(meta["at"])).days < 7 and bios.get("players"):
        return
    players = bios.get("players", {})
    for letter in string.ascii_lowercase:
        html = get(f"{BASE}/players/{letter}/")
        for t in tables(html):
            for headers, cells, tr in rows(t):
                if "Player" not in headers or len(cells) != len(headers):
                    continue
                c = dict(zip(headers, cells))
                pid = player_id(c["Player"])
                if not pid:
                    continue
                txt = {h: cell.get_text(" ", strip=True) for h, cell in c.items()}
                try:
                    last = int(txt.get("To") or 0)
                except ValueError:
                    last = 0
                if last and last < FIRST_SEASON:
                    continue
                born = c.get("Birth Date")
                born_iso = (born.get("csk") if born is not None else "") or ""
                if born_iso and len(born_iso) == 8:
                    born_iso = f"{born_iso[:4]}-{born_iso[4:6]}-{born_iso[6:]}"
                players[pid] = {"name": txt["Player"].rstrip("*").strip(), "from": txt.get("From"), "to": txt.get("To"),
                                "pos": txt.get("Pos"), "ht": txt.get("Ht"), "wt": txt.get("Wt"),
                                "born": born_iso or txt.get("Birth Date"), "college": txt.get("Colleges")}
    if players:
        save(BIOS_PATH, {"_meta": {"at": now.isoformat(timespec="seconds")}, "players": players})
        print(f"Bios: {len(players)} players")


# ---------- drafts ----------
def first_round_size(year):
    if year >= 2005:
        return 30
    if year >= 1995:
        return 29
    if year >= 1989:
        return 27
    if year >= 1988:
        return 25
    if year >= 1981:
        return 23
    if year >= 1976:
        return 22
    return 18


def parse_draft(html, year):
    out = {}
    for t in tables(html):
        rnd, pick_seen = 1, False
        for headers, cells, tr in rows(t):
            text = tr.get_text(" ", strip=True)
            if ("thead" in (tr.get("class") or []) or len(cells) != len(headers)) and re.search(r"Round\s*\d", text):
                if pick_seen:
                    rnd += 1
                continue
            if "Player" not in headers or "Pk" not in headers or len(cells) != len(headers):
                continue
            c = dict(zip(headers, cells))
            pid = player_id(c["Player"])
            try:
                pk = int(c["Pk"].get_text(strip=True))
            except ValueError:
                continue
            pick_seen = True
            team = c.get("Tm").get_text(strip=True) if c.get("Tm") else ""
            out[pid or c["Player"].get_text(strip=True)] = {"year": year, "pick": pk, "round": rnd, "team": team}
        if out:
            # pages without "Round 2" divider rows: work the round out from the pick number
            if all(v["round"] == 1 for v in out.values()):
                size = first_round_size(year)
                for v in out.values():
                    v["round"] = 1 + (v["pick"] - 1) // size
            break
    return out


def update_drafts(now, current_year):
    drafts = load_json(DRAFTS_PATH, {"_years": {}, "players": {}})
    years = drafts.setdefault("_years", {})
    newest = current_year - 1           # the June draft before this season
    changed = False
    for year in range(newest, FIRST_DRAFT - 1, -1):
        seen = years.get(str(year))
        recheck = year == newest and seen and (now - dt.datetime.fromisoformat(seen)).days >= 7
        if seen and not recheck:
            continue
        html = get(f"{BASE}/draft/NBA_{year}.html")
        if not html:
            print(f"Draft {year}: page didn't load; will try again next run")
            continue
        picks = parse_draft(html, year)
        drafts["players"].update(picks)
        years[str(year)] = now.isoformat(timespec="seconds")
        changed = True
    if changed:
        save(DRAFTS_PATH, drafts)
        print(f"Drafts: {len(drafts['players'])} picks")


# ---------- contracts ----------
def update_contracts(now):
    html = get(f"{BASE}/contracts/players.html")
    out = {}
    for t in tables(html):
        for headers, cells, tr in rows(t):
            if "Player" not in headers or len(cells) != len(headers):
                continue
            c = dict(zip(headers, cells))
            pid = player_id(c["Player"])
            if not pid:
                continue
            years = []
            for h, cell in c.items():
                if re.match(r"^\d{4}-\d{2}$", h):
                    amt = cell.get_text(strip=True)
                    if not amt:
                        continue
                    cls = " ".join(cell.get("class") or [])
                    opt = "player option" if "salary-pl" in cls else "team option" if "salary-tm" in cls else \
                        "early termination" if "salary-et" in cls else ""
                    years.append([h, amt, opt])
            gtd = c.get("Guaranteed").get_text(strip=True) if c.get("Guaranteed") else ""
            team = c.get("Tm").get_text(strip=True) if c.get("Tm") else ""
            if pid in out:   # listed twice (e.g. waived and re-signed): keep both teams' money
                out[pid]["years"] += years
                continue
            out[pid] = {"team": team, "years": years, "guaranteed": gtd}
        if out:
            break
    if out:
        save(CONTRACTS_PATH, {"at": now.isoformat(timespec="seconds"), "players": out})
        print(f"Contracts: {len(out)} players")


def update(now, current_year):
    for name, fn in (("bios", lambda: update_bios(now)), ("drafts", lambda: update_drafts(now, current_year)),
                     ("contracts", lambda: update_contracts(now))):
        try:
            fn()
        except Exception as e:  # noqa: BLE001
            print(f"{name} failed: {e}")
