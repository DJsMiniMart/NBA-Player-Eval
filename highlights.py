"""Game highlight clips from ESPN's game data (the "videos" ESPN attaches to each finished game).

  data/highlights_season.json  every clip this season, by game (used to find each player's clips for his page)
  data/highlights.json         the last 14 days, for The Morning Press, box scores and matchup pages
Each clip: [id, headline, link to the clip on ESPN, thumbnail, seconds]. Clips open on ESPN (ESPN doesn't allow its
video to be played inside other sites). Clips are added for a day or two after a game, so a game is checked again
on later runs until it has clips or has been tried 4 times. Runs in the full updates and hourly with the lines."""
import datetime as dt
import json
import os
from urllib.request import Request, urlopen

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")
SEASON = os.path.join(DATA, "highlights_season.json")
RECENT = os.path.join(DATA, "highlights.json")
SCHEDULE = os.path.join(DATA, "schedule.json")
SITE = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba"
LOOKBACK_DAYS, RECENT_DAYS, MAX_TRIES, PER_RUN = 4, 14, 4, 40


def load(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def get_json(url):
    try:
        with urlopen(Request(url, headers={"User-Agent": "Mozilla/5.0"}), timeout=30) as r:
            return json.loads(r.read().decode("utf-8", "replace"))
    except Exception:  # noqa: BLE001
        return None


def clips_of(summary):
    out = []
    for v in (summary or {}).get("videos") or []:
        links = v.get("links") or {}
        web = (links.get("web") or {}).get("href") or ((links.get("web") or {}).get("self") or {}).get("href") \
            or (links.get("mobile") or {}).get("href") or ""
        if not web and v.get("id"):
            web = f"https://www.espn.com/video/clip?id={v['id']}"
        thumb = v.get("thumbnail") or next((i.get("url") or i.get("href") for i in v.get("images") or [] if i.get("url") or i.get("href")), "")
        head = (v.get("headline") or v.get("title") or "").strip()
        if head and web:
            out.append([str(v.get("id") or web), head, web, thumb or "", int(v.get("duration") or 0)])
    return out


def update(now=None):
    now = now or dt.datetime.now(dt.timezone.utc)
    sched = (load(SCHEDULE, {}) or {}).get("games") or []
    store = load(SEASON, {}) or {}
    season = (load(SCHEDULE, {}) or {}).get("season")
    if store.get("season") != season:
        store = {"season": season, "games": {}}
    games = store.setdefault("games", {})
    first = not games   # first run of the season: pick up everything played so far
    cut = (now - dt.timedelta(days=60 if first else LOOKBACK_DAYS)).isoformat()[:16]
    todo = [g for g in sched if g[4] == 3 and g[1] >= cut and (g[0] not in games or (not games[g[0]]["clips"] and games[g[0]]["tries"] < MAX_TRIES)
                                                              or (games[g[0]]["tries"] < 2 and len(games[g[0]]["clips"]) < 3))]
    added = 0
    for g in todo[:(150 if first else PER_RUN)]:
        s = get_json(f"{SITE}/summary?event={g[0]}")
        rec = games.setdefault(g[0], {"d": g[1][:10], "h": g[2], "a": g[3], "hs": g[5], "as": g[6], "clips": [], "tries": 0})
        rec["tries"] += 1
        if s is None:
            continue
        new = clips_of(s)
        seen = {c[0] for c in rec["clips"]}
        for c in new:
            if c[0] not in seen:
                rec["clips"].append(c)
                added += 1
    with open(SEASON, "w", encoding="utf-8") as f:
        json.dump(store, f, separators=(",", ":"))
    rcut = (now - dt.timedelta(days=RECENT_DAYS)).isoformat()[:10]
    recent = {gid: v for gid, v in games.items() if v["d"] >= rcut and v["clips"]}
    with open(RECENT, "w", encoding="utf-8") as f:
        json.dump({"at": now.isoformat(timespec="seconds"), "cols": ["id", "headline", "url", "thumb", "sec"], "games": recent}, f, separators=(",", ":"))
    print(f"Highlights: checked {min(len(todo), 150 if first else PER_RUN)} games, {added} new clips; {sum(len(v['clips']) for v in games.values())} this season")


if __name__ == "__main__":
    update()
