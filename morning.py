"""Morning page extras (data/morning.json), from ESPN:
  - recaps:        the headline and summary ESPN wrote for each recent game
  - news:          the latest NBA headlines
  - transactions:  signings, trades, waivers and other moves this season
Run from update_stats.py each update. Each part is optional: if ESPN doesn't answer, the old copy is kept."""
import datetime as dt
import os
import re

from espn_games import SITE, get_json, load, save, tri, SCHEDULE_PATH

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "data", "morning.json")
RECAP_DAYS = 3        # look for a recap of games from the last few days
KEEP_RECAPS = 400


def web_link(obj):
    links = (obj or {}).get("links") or {}
    web = links.get("web") or {}
    return web.get("href") if isinstance(web, dict) else None


def article_of(summary, scoreboard_event):
    """ESPN puts the recap in different places depending on the endpoint and the day."""
    a = summary.get("article") if summary else None
    if isinstance(a, dict) and a.get("headline"):
        return {"h": a.get("headline"), "d": a.get("description") or "", "u": web_link(a), "k": a.get("type") or ""}
    comp = ((scoreboard_event or {}).get("competitions") or [{}])[0]
    hs = comp.get("headlines") or ((((summary or {}).get("header") or {}).get("competitions") or [{}])[0].get("headlines") or [])
    for h in hs:
        if h.get("description") or h.get("shortLinkText"):
            return {"h": h.get("shortLinkText") or h.get("description"), "d": h.get("description") or "",
                    "u": web_link(h), "k": h.get("type") or ""}
    for n in ((summary or {}).get("news") or {}).get("articles") or []:
        if (n.get("type") or "").lower() == "recap" and n.get("headline"):
            return {"h": n.get("headline"), "d": n.get("description") or "", "u": web_link(n), "k": "Recap"}
    return None


def recaps(old, now):
    sched = (load(SCHEDULE_PATH, {}) or {}).get("games") or []
    cutoff = (now - dt.timedelta(days=RECAP_DAYS)).isoformat()
    recent = [g for g in sched if g[4] == 3 and g[1] >= cutoff[:16]]
    out = dict(old)
    boards = {}
    for g in recent:
        if g[0] in out and out[g[0]].get("u"):
            continue
        day = (dt.datetime.fromisoformat(g[1].replace("Z", "+00:00")) - dt.timedelta(hours=5)).strftime("%Y%m%d")
        if day not in boards:
            sb = get_json(f"{SITE}/scoreboard?dates={day}") or {}
            boards[day] = {e.get("id"): e for e in sb.get("events", [])}
        a = article_of(get_json(f"{SITE}/summary?event={g[0]}"), boards[day].get(g[0]))
        if a:
            out[g[0]] = a
    keep = sorted(out, key=lambda k: k)[-KEEP_RECAPS:]
    print(f"Morning: recaps for {sum(1 for g in recent if g[0] in out)} of {len(recent)} recent games")
    return {k: out[k] for k in keep}


def news():
    d = get_json(f"{SITE}/news?limit=40")
    if not d:
        return None
    rows = []
    for a in d.get("articles", []):
        if not a.get("headline"):
            continue
        teams = [c.get("description") for c in a.get("categories", []) if c.get("type") == "team" and c.get("description")]
        img = (a.get("images") or [{}])[0].get("url")
        rows.append({"h": a["headline"], "d": a.get("description") or "", "t": a.get("published"), "u": web_link(a),
                     "img": img, "k": a.get("type") or "", "teams": teams[:4]})
    print(f"Morning: {len(rows)} headlines")
    return rows


KINDS = [("trade", r"\btrad|\bacquired\b"), ("sign", r"\bsigned\b|\bre-signed\b|\bagreed\b"),
         ("extend", r"\bextension\b|\bexercised\b|\bdeclined\b.*option|\boption\b"),
         ("waive", r"\bwaived\b|\breleased\b|\bclaimed\b"), ("gleague", r"\bassigned\b|\brecalled\b|g league"),
         ("staff", r"\bhired\b|\bfired\b|\bnamed\b|\bpromoted\b|\bcoach|\bmanager\b|\bpresident\b"),
         ("suspend", r"\bsuspend|\bfined\b|\breinstat")]


def kind(text):
    t = (text or "").lower()
    for k, rx in KINDS:
        if re.search(rx, t):
            return k
    return "other"


def transactions():
    rows, page, pages = [], 1, 1
    while page <= pages and page <= 40:
        d = get_json(f"{SITE}/transactions?page={page}")
        if not d:
            break
        pages = d.get("pageCount") or 1
        for t in d.get("transactions", []):
            team = t.get("team") or {}
            rows.append([t.get("date", "")[:10], tri(team.get("abbreviation")), t.get("description") or "",
                         kind(t.get("description"))])
        page += 1
    if not rows:
        return None
    rows.sort(key=lambda r: r[0], reverse=True)
    print(f"Morning: {len(rows)} transactions ({page - 1} pages)")
    return rows


def update(now, current_year):
    old = load(OUT, {}) or {}
    out = {"at": now.isoformat(timespec="seconds")}
    try:
        out["recaps"] = recaps(old.get("recaps") or {}, now)
    except Exception as e:  # noqa: BLE001
        print(f"Morning: recaps failed ({e})")
        out["recaps"] = old.get("recaps") or {}
    out["news"] = news() or old.get("news") or []
    out["newsAt"] = out["at"] if out["news"] is not old.get("news") else old.get("newsAt")
    tx = transactions()
    out["transactions"] = tx or old.get("transactions") or []
    out["txCols"] = ["date", "team", "description", "kind"]
    out["txAt"] = out["at"] if tx else old.get("txAt")
    save(OUT, out)


if __name__ == "__main__":
    n = dt.datetime.now(dt.timezone.utc)
    update(n, n.year + (1 if n.month >= 8 else 0))
