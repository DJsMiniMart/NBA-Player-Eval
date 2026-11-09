"""Trades this season (data/trades.json), for the trade pop-up on The Morning Press.

ESPN's transaction log lists a trade once per team, often only from one side, so this:
  - groups each trade's lines (both teams' sides when ESPN has them)
  - adds Basketball-Reference's write-up of the whole deal once it's posted there (a few days later)
  - finds the players in it (matched against the player index)
  - keeps every ESPN story about it as it comes out (stories drop out of ESPN's feed within days, so they're saved
    here), plus the opening paragraphs of the main one, which spell out the terms

Run hourly with the lines update and again every morning. Each part is optional: what can't be fetched is kept."""
import datetime as dt
import html as htmlmod
import json
import os
import re
import time

from espn_games import SITE, get_json, load, save, tri

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "data", "trades.json")
MORNING = os.path.join(HERE, "data", "morning.json")
INDEX = os.path.join(HERE, "data", "players", "index.json")
BBR = "https://www.basketball-reference.com"
STORY = "https://content.core.api.espn.com/v1/sports/news/{}"
NEWS_PER_TRADE = 10

TEAM_WORDS = {   # code -> phrases ESPN and Basketball-Reference use for the team
    "ATL": ["Atlanta", "Hawks"], "BOS": ["Boston", "Celtics"], "BKN": ["Brooklyn", "Nets"], "CHA": ["Charlotte", "Hornets"],
    "CHI": ["Chicago", "Bulls"], "CLE": ["Cleveland", "Cavaliers", "Cavs"], "DAL": ["Dallas", "Mavericks", "Mavs"],
    "DEN": ["Denver", "Nuggets"], "DET": ["Detroit", "Pistons"], "GSW": ["Golden State", "Warriors"],
    "HOU": ["Houston", "Rockets"], "IND": ["Indiana", "Pacers"], "LAC": ["LA Clippers", "L.A. Clippers", "Clippers"],
    "LAL": ["Los Angeles Lakers", "L.A. Lakers", "Lakers"], "MEM": ["Memphis", "Grizzlies"], "MIA": ["Miami", "Heat"],
    "MIL": ["Milwaukee", "Bucks"], "MIN": ["Minnesota", "Timberwolves", "Wolves"], "NOP": ["New Orleans", "Pelicans"],
    "NYK": ["New York", "Knicks"], "OKC": ["Oklahoma City", "Thunder"], "ORL": ["Orlando", "Magic"],
    "PHI": ["Philadelphia", "76ers", "Sixers"], "PHX": ["Phoenix", "Suns"], "POR": ["Portland", "Trail Blazers", "Blazers"],
    "SAC": ["Sacramento", "Kings"], "SAS": ["San Antonio", "Spurs"], "TOR": ["Toronto", "Raptors"], "UTA": ["Utah", "Jazz"],
    "WAS": ["Washington", "Wizards"],
}
TEAM_RE = {c: re.compile(r"\b(" + "|".join(re.escape(w) for w in ws) + r")\b") for c, ws in TEAM_WORDS.items()}
TRADE_WORDS = re.compile(r"\b(trade[sd]?|trading|acquir\w+|deal|sends?|sent|swap\w*|land\w*|ship\w*)\b", re.I)


def teams_in(text):
    t = text or ""
    found = [c for c, rx in TEAM_RE.items() if rx.search(t)]
    if "LAL" in found and "LAC" in found and not re.search(r"Lakers", t):
        found.remove("LAL")
    return found


def fold(s):
    import unicodedata
    s = unicodedata.normalize("NFD", s or "")
    return re.sub(r"[^a-z ]", "", "".join(ch for ch in s if unicodedata.category(ch) != "Mn").lower().replace("’", "'").replace("-", " "))


def name_index():
    """Folded full name -> (player id, name), for players active in the last few seasons."""
    idx = load(INDEX, []) or []
    out = {}
    for row in idx:
        pid, name, _, last = row[0], row[1], row[2], row[3]
        if last and last >= "2023-24":
            out[fold(name)] = (pid, name)
    return out


def players_in(text, names):
    t = " " + fold(text) + " "
    hits = [(pid, nm) for key, (pid, nm) in names.items() if len(key) > 5 and f" {key} " in t]
    hits.sort(key=lambda h: t.find(" " + fold(h[1]) + " "))
    return hits


# ---------- grouping ESPN's lines into trades ----------
def group(rows):
    """rows: [date, team, description, kind] (kind == 'trade'). Returns [{date, teams, rows}] newest first."""
    items = []
    for r in rows:
        if r[3] != "trade":
            continue
        mentioned = [c for c in teams_in(r[2]) if c != r[1]]
        items.append({"date": r[0], "team": r[1], "desc": r[2], "teams": [r[1]] + mentioned})
    parent = list(range(len(items)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i
    day = lambda s: dt.date.fromisoformat(s)  # noqa: E731
    for i, a in enumerate(items):
        for j in range(i + 1, len(items)):
            b = items[j]
            if abs((day(a["date"]) - day(b["date"])).days) > 2:
                continue
            # the same deal: each side names the other (or they name the same third team in a 3-team deal)
            if a["team"] in b["teams"] and b["team"] in a["teams"]:
                parent[find(j)] = find(i)
    groups = {}
    for i, it in enumerate(items):
        groups.setdefault(find(i), []).append(it)
    out = []
    for g in groups.values():
        teams = []
        for it in g:
            for c in it["teams"]:
                if c not in teams:
                    teams.append(c)
        date = min(it["date"] for it in g)
        out.append({"id": f"{date}-{'-'.join(sorted(teams))}", "date": date, "teams": teams,
                    "rows": [[it["date"], it["team"], it["desc"]] for it in g]})
    out.sort(key=lambda t: t["date"], reverse=True)
    return out


# ---------- Basketball-Reference's write-up of the whole deal ----------
def bbr_trades(end_year):
    from update_stats import fetch
    status, page = fetch(f"{BBR}/leagues/NBA_{end_year}_transactions.html")
    if status != 200 or not page:
        print(f"Trades: Basketball-Reference answered {status}")
        return None
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(page, "html.parser")
    out = []
    for li in soup.select("ul.page_index > li"):
        span = li.find("span")
        try:
            date = dt.datetime.strptime(span.get_text(strip=True), "%B %d, %Y").date().isoformat()
        except (AttributeError, ValueError):
            continue
        for p in li.find_all("p"):
            text = re.sub(r"\s+", " ", p.get_text(" ", strip=True)).replace(" .", ".").replace(" ,", ",")
            if re.search(r"\btraded\b", text):
                out.append([date, text])
    print(f"Trades: {len(out)} trades on Basketball-Reference")
    return out


def match_bbr(trade, bbr):
    d0 = dt.date.fromisoformat(trade["date"])
    hits = []
    for date, text in bbr or []:
        if abs((dt.date.fromisoformat(date) - d0).days) > 3:
            continue
        if all(TEAM_RE[c].search(text) for c in trade["teams"][:2]):
            hits.append(text)
    return hits


def merge_by_bbr(trades, bbr):
    """ESPN logs a 3- or 4-team deal as separate moves; Basketball-Reference's one write-up joins them back up."""
    if not bbr:
        return trades
    for date, text in bbr:
        named = set(teams_in(text))
        d0 = dt.date.fromisoformat(date)
        parts = [t for t in trades if abs((dt.date.fromisoformat(t["date"]) - d0).days) <= 3 and len(t["teams"]) >= 1
                 and set(t["teams"]) <= named and len(named) >= 2]
        if len(parts) < 2:
            continue
        keep = parts[0]
        for p in parts[1:]:
            keep["rows"] += p["rows"]
            keep["teams"] += [c for c in p["teams"] if c not in keep["teams"]]
            keep["date"] = min(keep["date"], p["date"])
            trades.remove(p)
        keep["id"] = f"{keep['date']}-{'-'.join(sorted(keep['teams']))}"
    return trades


# ---------- ESPN stories ----------
def latest_news():
    d = get_json(f"{SITE}/news?limit=100")
    out = []
    for a in (d or {}).get("articles") or []:
        link = (((a.get("links") or {}).get("web") or {}).get("href"))
        if not link or not a.get("headline"):
            continue
        img = next((i.get("url") for i in a.get("images") or [] if i.get("url")), None)
        out.append({"h": a.get("headline"), "d": a.get("description") or "", "u": link, "t": a.get("published") or "",
                    "img": img, "k": a.get("type") or ""})
    return out


def about(article, trade, names):
    text = f"{article.get('h', '')} {article.get('d', '')}"
    if not TRADE_WORDS.search(text) and "trade" not in (article.get("u") or ""):
        return False
    who = [fold(n) for _, n in names]
    ft = " " + fold(text) + " "
    if any(f" {w} " in ft for w in who):
        return True
    return len(trade["teams"]) >= 2 and all(TEAM_RE[c].search(text) for c in trade["teams"][:2])


def story_excerpt(url):
    m = re.search(r"/id/(\d+)", url or "")
    if not m:
        return None
    d = get_json(STORY.format(m.group(1)))
    h = ((d or {}).get("headlines") or [{}])[0]
    body = h.get("story") or ""
    if not body:
        return None
    paras = []
    for p in re.findall(r"<p>(.*?)</p>", body, re.S):
        t = htmlmod.unescape(re.sub(r"<[^>]+>", "", p)).strip()
        if len(t) > 40 and not t.lower().startswith(("watch", "listen", "read more", "related")):
            paras.append(t)
        if len(paras) >= 4:
            break
    return {"u": url, "h": h.get("headline") or "", "p": paras} if paras else None


# ---------- putting it together ----------
def update(now=None):
    now = now or dt.datetime.now(dt.timezone.utc)
    end_year = now.year + (1 if now.month >= 8 else 0)
    old = load(OUT, {}) or {}
    old_by = {t["id"]: t for t in old.get("trades", [])}
    morning = load(MORNING, {}) or {}
    rows = morning.get("transactions") or []
    trades = group(rows)
    names = name_index()

    # Basketball-Reference: only when a recent trade still lacks its write-up, and not more than every 3 hours
    recent = [t for t in trades if (now.date() - dt.date.fromisoformat(t["date"])).days <= 21]
    need = any(not (old_by.get(t["id"]) or {}).get("bbr") for t in recent)
    bbr = None
    last_try = old.get("bbrTry")
    if need and (not last_try or (now - dt.datetime.fromisoformat(last_try)).total_seconds() > 3 * 3600):
        try:
            bbr = bbr_trades(end_year)
        except Exception as e:  # noqa: BLE001
            print(f"Trades: Basketball-Reference failed ({e})")
        old["bbrTry"] = now.isoformat(timespec="seconds")

    if bbr is None:
        bbr = old.get("bbrAll")          # last copy fetched
    else:
        old["bbrAll"] = bbr
    trades = merge_by_bbr(trades, bbr)

    try:
        fresh = latest_news() + (morning.get("news") or [])
    except Exception as e:  # noqa: BLE001
        print(f"Trades: news failed ({e})")
        fresh = morning.get("news") or []

    out = []
    for t in trades:
        prev = old_by.get(t["id"]) or {}
        t["bbr"] = match_bbr(t, bbr) if bbr is not None else prev.get("bbr") or []
        if not t["bbr"] and prev.get("bbr"):
            t["bbr"] = prev["bbr"]
        text = " ".join(r[2] for r in t["rows"]) + " " + " ".join(t["bbr"])
        found = players_in(text, names)
        t["players"] = [[pid, nm] for pid, nm in found]
        news = list(prev.get("news") or [])
        seen = {a["u"] for a in news}
        if (now.date() - dt.date.fromisoformat(t["date"])).days <= 45:   # stories about old trades aren't in today's feed
            for a in fresh:
                if a["u"] not in seen and a.get("t", "")[:10] >= t["date"] and about(a, t, found):
                    news.append({k: a.get(k) for k in ("h", "d", "u", "t", "img")})
                    seen.add(a["u"])
        news.sort(key=lambda a: a.get("t") or "", reverse=True)
        t["news"] = news[:NEWS_PER_TRADE]
        t["story"] = prev.get("story")
        if not t["story"]:
            main = next((a for a in sorted(t["news"], key=lambda a: a.get("t") or "") if "/story/" in (a.get("u") or "")), None)
            if main:
                try:
                    t["story"] = story_excerpt(main["u"])
                    time.sleep(0.4)
                except Exception as e:  # noqa: BLE001
                    print(f"Trades: story failed ({e})")
        out.append(t)
    save(OUT, {"at": now.isoformat(timespec="seconds"), "bbrTry": old.get("bbrTry"), "bbrAll": old.get("bbrAll"), "trades": out})
    print(f"Trades: {len(out)} this season, {sum(bool(t['bbr']) for t in out)} with the full deal from Basketball-Reference, "
          f"{sum(len(t['news']) for t in out)} stories saved")


if __name__ == "__main__":
    update()
