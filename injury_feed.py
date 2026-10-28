"""League injury report with timetables and links -> data/injuries.json. Run hourly with the betting lines and in
the full updates.

ESPN's public injury feed gives each injury a status, a short and a long note (the latest news, e.g. "expected to
miss 2-3 weeks", "will be re-evaluated in a week") and a return date. ESPN's return date is often just the next
game, so the timetable comes from the notes first:
  "N-M weeks/days/months"            -> out N-M weeks, with the dates that works out to from the report date
  "miss/out/sidelined N weeks"       -> out about N weeks
  "re-evaluated in N weeks/days"     -> re-evaluated around that date
  "rest of the season"/"season-ending"/"for the season" -> out for the season
  "indefinitely"                     -> out indefinitely
  "questionable/doubtful/probable for <day>'s game" -> that game-time call
and only then ESPN's return date, when it's more than 3 days after the report.
Link: an ESPN story from today's headlines that names the player, else his ESPN news page."""
import datetime as dt
import json
import os
import re
from urllib.request import Request, urlopen

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "data", "injuries.json")
MORNING = os.path.join(HERE, "data", "morning.json")
URL = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/injuries"
NAMES = {"Atlanta Hawks": "ATL", "Boston Celtics": "BOS", "Brooklyn Nets": "BKN", "Charlotte Hornets": "CHA", "Chicago Bulls": "CHI",
         "Cleveland Cavaliers": "CLE", "Dallas Mavericks": "DAL", "Denver Nuggets": "DEN", "Detroit Pistons": "DET",
         "Golden State Warriors": "GSW", "Houston Rockets": "HOU", "Indiana Pacers": "IND", "LA Clippers": "LAC",
         "Los Angeles Clippers": "LAC", "Los Angeles Lakers": "LAL", "Memphis Grizzlies": "MEM", "Miami Heat": "MIA",
         "Milwaukee Bucks": "MIL", "Minnesota Timberwolves": "MIN", "New Orleans Pelicans": "NOP", "New York Knicks": "NYK",
         "Oklahoma City Thunder": "OKC", "Orlando Magic": "ORL", "Philadelphia 76ers": "PHI", "Phoenix Suns": "PHX",
         "Portland Trail Blazers": "POR", "Sacramento Kings": "SAC", "San Antonio Spurs": "SAS", "Toronto Raptors": "TOR",
         "Utah Jazz": "UTA", "Washington Wizards": "WAS"}
WORDS = {"a": 1, "an": 1, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8, "nine": 9,
         "ten": 10, "eleven": 11, "twelve": 12, "several": 3, "a couple of": 2, "a few": 3, "couple": 2, "few": 3}
UNIT_DAYS = {"day": 1, "week": 7, "month": 30}
NUM = r"(\d+|a couple of|a few|an|a|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|several|couple|few)"
UNIT = r"(day|week|month)s?"


def num(s):
    s = s.lower().strip()
    return int(s) if s.isdigit() else WORDS.get(s)


def fmt(d):
    return d.strftime("%b %-d") if hasattr(d, "strftime") else ""


def timeline(text, status, date, ret):
    """-> {"kind", "label", "from", "to", "reeval"} or None. date: report date (date object)."""
    t = " ".join(str(text or "").split())
    low = t.lower()
    base = date or dt.date.today()
    if re.search(r"rest of the (?:20\d\d-\d\d )?(?:regular )?season|season-ending|out for the (?:20\d\d-\d\d )?season|miss the (?:entire |remainder of the )?(?:20\d\d-\d\d )?season", low):
        return {"kind": "season", "label": "Out for the season"}
    m = re.search(NUM + r"\s*(?:-to-|-|–|to|or)\s*" + NUM + r"[\s-]+" + UNIT, low)
    if m and num(m.group(1)) and num(m.group(2)):
        a, b, u = num(m.group(1)), num(m.group(2)), m.group(3)
        out = {"kind": "range", "label": f"Out {a}–{b} {u}s", "from": (base + dt.timedelta(days=a * UNIT_DAYS[u])).isoformat(),
               "to": (base + dt.timedelta(days=b * UNIT_DAYS[u])).isoformat()}
    else:
        out = None
        m = re.search(r"(?:miss|sidelined?(?: for)?|out(?: for)?|absent for|shelved for)\s+(?:at least\s+|about\s+|roughly\s+|around\s+|approximately\s+|another\s+|an additional\s+|the next\s+)?" + NUM + r"\s+(?:more\s+|additional\s+)?" + UNIT, low)
        if m and num(m.group(1)):
            n, u = num(m.group(1)), m.group(2)
            least = "at least" in m.group(0)
            out = {"kind": "about", "label": f"Out {'at least ' if least else 'about '}{n} {u}{'s' if n != 1 else ''}",
                   "from": (base + dt.timedelta(days=n * UNIT_DAYS[u])).isoformat()}
    m = re.search(r"re-?evaluat\w*(?:\s+\w+){0,4}?\s+in\s+(?:about\s+|roughly\s+|another\s+|the next\s+)?" + NUM + r"(?:\s*(?:-to-|-|–|to|or)\s*" + NUM + r")?[\s-]+" + UNIT, low)
    if m and num(m.group(1)):
        n, u = num(m.group(1)), m.group(3)
        if m.group(2) and num(m.group(2)):   # "re-evaluated in 3-to-4 months": that's the timetable
            hi = num(m.group(2))
            out = {"kind": "range", "label": f"Re-evaluated in {n}–{hi} {u}s", "from": (base + dt.timedelta(days=n * UNIT_DAYS[u])).isoformat(),
                   "to": (base + dt.timedelta(days=hi * UNIT_DAYS[u])).isoformat()}
            return out
        when = base + dt.timedelta(days=n * UNIT_DAYS[u])
        r = {"reeval": when.isoformat(), "reevalLabel": f"Re-evaluated in {n} {u}{'s' if n != 1 else ''} (~{fmt(when)})"}
        if out:
            out.update(r)
        else:
            out = {"kind": "reeval", "label": r["reevalLabel"], **r}
    if out:
        return out
    if "indefinitely" in low:
        return {"kind": "indef", "label": "Out indefinitely"}
    if "week-to-week" in low or "week to week" in low:
        return {"kind": "wtw", "label": "Week-to-week"}
    m = re.search(r"(questionable|doubtful|probable|ruled out|available)\s+(?:to play\s+)?(?:for|in)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)'?s?", low)
    if m and (dt.date.today() - base).days <= 2:   # "questionable for Wednesday" goes stale fast
        word = {"ruled out": "Out", "available": "Available"}.get(m.group(1), m.group(1).capitalize())
        return {"kind": "game", "label": f"{word} for {m.group(2).capitalize()}"}
    fresh = (dt.date.today() - base).days <= 2
    m = re.search(r"next (?:chance|opportunity)\b[^.]*?\b(?:comes|come|arrives|arrive|will come|will arrive|is|would be)\s+(?:on\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)", low)
    if m and fresh:
        return {"kind": "game", "label": f"Next chance to play: {m.group(1).capitalize()}"}
    if re.search(r"\bday-to-day\b", low):
        return {"kind": "dtd", "label": "Day-to-day"}
    if ret and date and (ret - date).days > 3:
        return {"kind": "est", "label": f"ESPN expects him back ~{fmt(ret)}", "from": ret.isoformat()}
    if "day-to-day" in str(status).lower():
        return {"kind": "dtd", "label": "Day-to-day"}
    return None


def story_for(name, news):
    full = name.lower()
    last = full.split(" ")[-1] if " " in full else full
    hurt = re.compile(r"injur|out|miss|surgery|sprain|strain|return|status|questionable|knee|ankle|hamstring|back|foot|calf|torn|fracture|concussion|illness|sidelin")
    for n in news or []:
        txt = f"{n.get('h', '')} {n.get('d', '')}".lower()
        if (full in txt or (len(last) > 4 and re.search(rf"\b{re.escape(last)}\b", txt))) and hurt.search(txt) and n.get("u"):
            return n["u"], n.get("h")
    return None, None


def parse_date(s):
    try:
        return dt.date.fromisoformat(str(s)[:10])
    except ValueError:
        return None


def build(raw, news):
    teams = {}
    for team in raw.get("injuries", []):
        code = NAMES.get(team.get("displayName"))
        if not code:
            continue
        rows = []
        for inj in team.get("injuries", []):
            a = inj.get("athlete") or {}
            det = inj.get("details") or {}
            name = a.get("displayName") or ""
            date, ret = parse_date(inj.get("date")), parse_date(det.get("returnDate"))
            long_ = inj.get("longComment") or ""
            short = inj.get("shortComment") or ""
            tl = timeline(long_ + " " + short, inj.get("status"), date, ret)
            aid = str(a.get("id") or "") or next((m.group(1) for l in a.get("links") or [] for m in [re.search(r"/id/(\d+)", str(l.get("href", "")))] if m), "")
            url, headline = story_for(name, news)
            if not url:
                url = f"https://www.espn.com/nba/player/news/_/id/{aid}" if aid else f"https://www.espn.com/search/_/q/{name.replace(' ', '%20')}%20injury"
            rows.append({"id": aid, "name": name, "pos": (a.get("position") or {}).get("abbreviation"), "status": inj.get("status"),
                         "date": (inj.get("date") or "")[:10], "type": det.get("type") or "", "detail": det.get("detail") or "",
                         "side": det.get("side") or "", "ret": (det.get("returnDate") or "")[:10], "note": short, "long": long_,
                         "tl": tl, "link": url, "story": headline})
        teams[code] = rows
    return teams


def update():
    try:
        with urlopen(Request(URL, headers={"User-Agent": "Mozilla/5.0"}), timeout=60) as r:
            raw = json.loads(r.read().decode("utf-8", "replace"))
    except Exception as e:  # noqa: BLE001
        print(f"Injuries: ESPN feed failed ({e}); kept the last copy")
        return
    try:
        with open(MORNING, encoding="utf-8") as f:
            news = (json.load(f) or {}).get("news") or []
    except (OSError, ValueError):
        news = []
    teams = build(raw, news)
    if not teams:
        print("Injuries: empty feed; kept the last copy")
        return
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump({"at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"), "teams": teams}, f, separators=(",", ":"))
    n = sum(len(v) for v in teams.values())
    print(f"Injuries: {n} players, {sum(1 for v in teams.values() for x in v if x['tl'])} with a timetable")


if __name__ == "__main__":
    update()
