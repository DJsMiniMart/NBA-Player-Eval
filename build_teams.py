"""Team pages: writes data/teams/league.json (every game's team box score, for team stats, filters and
league ranks) and data/teams/<code>.json (lineups, player game logs and front-office facts for one team).

Reads the game file that nba_games.py builds (data/pbp/<season>.json), plus data/team_extra.json
(coach, draft picks, injuries) and data/owners.json.
"""
import datetime as dt
import json
import os

from update_stats import DATA_DIR, load_json

TEAMS_DIR = os.path.join(DATA_DIR, "teams")
PBP_DIR = os.path.join(DATA_DIR, "pbp")
CODES = ["ATL", "BOS", "BKN", "CHA", "CHI", "CLE", "DAL", "DEN", "DET", "GSW", "HOU", "IND", "LAC", "LAL", "MEM",
         "MIA", "MIL", "MIN", "NOP", "NYK", "OKC", "ORL", "PHI", "PHX", "POR", "SAC", "SAS", "TOR", "UTA", "WAS"]


def season_label(end_year):
    return f"{end_year - 1}-{str(end_year)[2:]}"


def save(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, separators=(",", ":"))


def build(now=None, current_year=None):
    now = now or dt.datetime.now(dt.timezone.utc)
    current_year = current_year or (now.year + (1 if now.month >= 8 else 0))
    season = season_label(current_year)
    acc = load_json(os.path.join(PBP_DIR, f"{season}.json"), {}) or {}
    tgames = acc.get("tgames", {})
    stints = acc.get("stints", {})
    extra = load_json(os.path.join(DATA_DIR, "team_extra.json"), {})
    owners = (load_json(os.path.join(DATA_DIR, "owners.json"), {})          # data/owners.json, or
              or load_json(os.path.join(DATA_DIR, "..", "owners.json"), {})   # the main folder
              or {}).get("owners", {})

    games = sorted(([gid] + row for gid, row in tgames.items()), key=lambda r: (r[1], r[0]))
    save(os.path.join(TEAMS_DIR, "league.json"), {
        "season": season, "at": now.isoformat(timespec="seconds"),
        "cols": ["pts", "fgm", "fga", "fg3m", "fg3a", "ftm", "fta", "oreb", "dreb", "ast", "stl", "blk", "tov", "pf",
                 "paint", "fast", "second", "offTov", "bench"],
        "games": games})

    # each player's games, by the team he played them for
    side = {gid: (row[1], row[2]) for gid, row in tgames.items()}   # gid -> (home, away)
    plogs = {c: {} for c in CODES}
    for pid, pl in acc.get("players", {}).items():
        for lg in pl.get("logs", []):
            gid, opp = lg[0], lg[2]
            if gid not in side:
                continue
            home, away = side[gid]
            team = home if opp == away else away
            if team not in plogs:
                continue
            # [gid, min, pts, ast, dreb, oreb, stl, blk, tov, fgm, fga, 3pm, 3pa, ftm, fta, +/-, started]
            plogs[team].setdefault(pid, {"n": pl.get("n", pid), "g": []})["g"].append(
                [gid, lg[4], lg[5], lg[6], lg[7], lg[8], lg[9], lg[10], lg[11], lg[12], lg[13], lg[14], lg[15],
                 lg[16], lg[17], lg[18], lg[20]])

    fo = extra.get("frontOffice", {})
    snap = (load_json(os.path.join(DATA_DIR, "picks.json"), {})            # fallback when RealGM can't be reached:
            or load_json(os.path.join(DATA_DIR, "..", "picks.json"), {}) or {})   # data/picks.json or the main folder
    history = (load_json(os.path.join(DATA_DIR, "franchise.json"), {}) or {}).get("teams", {})   # franchise_history.py
    for code in CODES:
        st = []
        names = {}
        for gid, by_team in stints.items():
            for k, secs, pf, pa, posf, posa in by_team.get(code, []):
                st.append([gid, k, secs, pf, pa, posf, posa])
                for pid in k.split(","):
                    names[pid] = acc.get("names", {}).get(pid, pid)
        save(os.path.join(TEAMS_DIR, f"{code}.json"), {
            "code": code, "season": season, "at": now.isoformat(timespec="seconds"),
            "coach": fo.get(code, {}).get("coach"), "executive": fo.get(code, {}).get("executive"),
            "arena": fo.get(code, {}).get("arena"), "owner": owners.get(code),
            "picks": extra.get("picks", {}).get(code) or (snap.get("teams") or {}).get(code),
            "picksAt": extra.get("at", {}).get("picks") if extra.get("picks", {}).get(code) else snap.get("asOf"),
            "injuries": extra.get("injuries", {}).get(code, []), "injuriesAt": extra.get("at", {}).get("injuries"),
            "names": names, "stints": st, "players": plogs[code], "history": history.get(code)})
    write_box_scores(acc, tgames)
    print(f"Team pages: {len(games)} games, {sum(len(v) for v in stints.values())} games with lineups")


def write_box_scores(acc, tgames):
    """data/games/<game id>.json: both teams' box scores, for the pop-up on the team pages.
    Player line: [id, name, starter, min, pts, ast, dreb, oreb, stl, blk, tov, fgm, fga, 3pm, 3pa, ftm, fta, +/-]"""
    lines = {gid: {row[1]: [], row[2]: []} for gid, row in tgames.items()}
    for pid, pl in acc.get("players", {}).items():
        for lg in pl.get("logs", []):
            gid, opp = lg[0], lg[2]
            if gid not in lines:
                continue
            home, away = tgames[gid][1], tgames[gid][2]
            team = home if opp == away else away
            lines[gid][team].append([pid, pl.get("n", pid), lg[20], lg[4], lg[5], lg[6], lg[7], lg[8], lg[9], lg[10],
                                     lg[11], lg[12], lg[13], lg[14], lg[15], lg[16], lg[17], lg[18]])
    for gid, row in tgames.items():
        date, home, away, hl, al, mins = row
        for t in (home, away):
            lines[gid][t].sort(key=lambda r: (-r[2], -r[3]))   # starters first, then by minutes
        save(os.path.join(DATA_DIR, "games", f"{gid}.json"), {
            "id": gid, "date": date, "min": mins, "home": home, "away": away,
            "cols": ["id", "name", "starter", "min", "pts", "ast", "dreb", "oreb", "stl", "blk", "tov",
                     "fgm", "fga", "fg3m", "fg3a", "ftm", "fta", "pm"],
            "teams": {home: {"line": hl, "players": lines[gid][home]}, away: {"line": al, "players": lines[gid][away]}}})


if __name__ == "__main__":
    build()
