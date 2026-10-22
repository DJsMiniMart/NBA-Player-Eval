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

    had_clutch = {gid for gid, by in (acc.get("clutch") or {}).items() if any(v[0] > 0 for v in by.values())}
    games = sorted(([gid] + row + [1 if gid in had_clutch else 0] for gid, row in tgames.items()), key=lambda r: (r[1], r[0]))
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

    # 2K-style hot zones (espn_games.hot_zone), once every saved game has them
    hz_ok = set(acc.get("done", [])) <= set(acc.get("hzDone", []))
    tz, oz = (acc.get("tz") or {}, acc.get("oz") or {}) if hz_ok else ({}, {})
    league_z = {}
    for zones in tz.values():
        for z, (att, made) in zones.items():
            t = league_z.setdefault(z, [0, 0])
            t[0] += att
            t[1] += made
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
            "names": names, "stints": st, "players": plogs[code], "history": history.get(code),
            "zones": tz.get(code, {}), "oppZones": oz.get(code, {}), "leagueZones": league_z,
            "zoneRanks": zone_ranks(tz, oz, code)})
    write_box_scores(acc, tgames)
    write_player_totals(acc, tgames, season, now)
    print(f"Team pages: {len(games)} games, {sum(len(v) for v in stints.values())} games with lineups")


def zone_ranks(tz, oz, code):
    """Rank (1 = best of 30) in FG% and in attempts per zone, for the team's shots and its opponents' (1 = lowest %)."""
    out = {}
    for key, src, best_high in (("off", tz, True), ("def", oz, False)):
        r = {}
        zones = {z for t in src.values() for z in t}
        for z in zones:
            pcts = sorted(((t[z][1] / t[z][0]) if t.get(z) and t[z][0] else 0, c) for c, t in src.items())
            if best_high:
                pcts.reverse()
            order = [c for _, c in pcts]
            vols = [c for _, c in sorted(((t.get(z, [0])[0], c) for c, t in src.items()), reverse=True)]
            if code in order:
                r[z] = [order.index(code) + 1, vols.index(code) + 1]
        out[key] = r
    return out


def write_player_totals(acc, tgames, season, now):
    """data/teams/players.json: every player's season so far (from the game logs), for the Stats page's leaders.
    Row: [id, name, team, g, gs, min, pts, ast, dreb, oreb, stl, blk, tov, fgm, fga, 3pm, 3pa, ftm, fta, +/-,
          double-doubles, triple-doubles, best game points]"""
    rows = []
    for pid, pl in acc.get("players", {}).items():
        logs = [lg for lg in pl.get("logs", []) if lg[0] in tgames]
        if not logs:
            continue
        logs.sort(key=lambda lg: (lg[1], lg[0]))
        last = logs[-1]
        home, away = tgames[last[0]][1], tgames[last[0]][2]
        team = home if last[2] == away else away
        t = [0] * 16
        dd = td = 0
        for lg in logs:
            for i, k in enumerate(range(4, 20)):
                if k != 19:
                    t[i] += lg[k] if isinstance(lg[k], (int, float)) else 0
            cats = sum(1 for v in (lg[5], lg[7] + lg[8], lg[6], lg[9], lg[10]) if v >= 10)
            dd += cats >= 2
            td += cats >= 3
        mins, pts, ast, dreb, oreb, stl, blk, tov, fgm, fga, tpm, tpa, ftm, fta, pm = t[:15]
        c = [0] * 14
        for lg in logs:
            for i, v in enumerate((acc.get("clutch", {}).get(lg[0], {}) or {}).get(pid, [])):
                c[i] += v
        rows.append([pid, pl.get("n", pid), team, len(logs), sum(1 for lg in logs if lg[20]), round(mins, 1), pts, ast,
                     dreb, oreb, stl, blk, tov, fgm, fga, tpm, tpa, ftm, fta, pm, dd, td, max(lg[5] for lg in logs)] + c)
    save(os.path.join(TEAMS_DIR, "players.json"), {
        "season": season, "at": now.isoformat(timespec="seconds"),
        "cols": ["id", "name", "team", "g", "gs", "min", "pts", "ast", "dreb", "oreb", "stl", "blk", "tov", "fgm", "fga",
                 "fg3m", "fg3a", "ftm", "fta", "pm", "dd", "td", "high",
                 # crunch time: last 5 minutes of the 4th/OT with the score within 5
                 "c_sec", "c_pts", "c_ast", "c_reb", "c_stl", "c_blk", "c_tov", "c_fgm", "c_fga", "c_fg3m", "c_fg3a",
                 "c_ftm", "c_fta", "c_pm"],
        "players": rows,
        # go-ahead and tying baskets in crunch time: [game id, date, opponent, period, seconds left, kind, play, score, opp score]
        "moments": moments_by_player(acc, tgames)})


def moments_by_player(acc, tgames):
    out = {}
    for pid, ms in (acc.get("moments") or {}).items():
        rows = []
        for gid, period, clock, kind, text, me, them in ms:
            if gid not in tgames:
                continue
            date, home, away = tgames[gid][0], tgames[gid][1], tgames[gid][2]
            logs = [lg for lg in acc["players"].get(pid, {}).get("logs", []) if lg[0] == gid]
            opp = logs[0][2] if logs else ""
            rows.append([gid, date, opp, period, clock, kind, text, me, them])
        if rows:
            out[pid] = sorted(rows, key=lambda r: (r[1], r[3], -r[4]))
    return out


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
                                     lg[11], lg[12], lg[13], lg[14], lg[15], lg[16], lg[17], lg[18],
                                     (acc.get("clutch", {}).get(gid, {}) or {}).get(pid)])
    for gid, row in tgames.items():
        date, home, away, hl, al, mins = row
        for t in (home, away):
            lines[gid][t].sort(key=lambda r: (-r[2], -r[3]))   # starters first, then by minutes
        save(os.path.join(DATA_DIR, "games", f"{gid}.json"), {
            "id": gid, "date": date, "min": mins, "home": home, "away": away,
            "cols": ["id", "name", "starter", "min", "pts", "ast", "dreb", "oreb", "stl", "blk", "tov",
                     "fgm", "fga", "fg3m", "fg3a", "ftm", "fta", "pm", "clutch"],
            "clutchCols": ["sec", "pts", "ast", "reb", "stl", "blk", "tov", "fgm", "fga", "fg3m", "fg3a", "ftm", "fta", "pm"],
            "teams": {home: {"line": hl, "players": lines[gid][home]}, away: {"line": al, "players": lines[gid][away]}}})


if __name__ == "__main__":
    build()
