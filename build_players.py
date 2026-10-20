"""Writes one file per player for the player page: data/players/<id>.json

Pulls together, for every player who has played since 1973-74:
  - season-by-season stat lines and Play Eval (Basketball-Reference season files)
  - bio, draft pick, contract (bbr_extra.py)
  - for seasons the NBA's play-by-play feed covers (nba_games.py): game logs, shot zones and
    court cells, top assist partners, steal types and block locations

The NBA feed and Basketball-Reference use different player ids, so players are matched by
name within each season (with team as the tie-breaker). Ids use Basketball-Reference's
(e.g. "jokicni01"); anyone the matcher can't place gets "nba-<NBA id>".
"""
import glob
import json
import os
import re
import unicodedata

from update_stats import DATA_DIR, load_json, stat_value

PLAYERS_DIR = os.path.join(DATA_DIR, "players")
PBP_DIR = os.path.join(DATA_DIR, "pbp")

# Basketball-Reference team codes -> today's NBA franchise code (for colors and logos)
BBR_TO_NBA = {"BRK": "BKN", "NJN": "BKN", "NYN": "BKN", "CHO": "CHA", "CHA": "CHA", "CHH": "NOP", "NOH": "NOP",
              "NOK": "NOP", "PHO": "PHX", "SEA": "OKC", "VAN": "MEM", "WSB": "WAS", "CAP": "WAS", "KCK": "SAC",
              "KCO": "SAC", "SDC": "LAC", "BUF": "LAC", "NOJ": "UTA", "SDR": "HOU", "NYK": "NYK", "GSW": "GSW",
              "SAS": "SAS", "UTA": "UTA", "NOP": "NOP", "WAS": "WAS"}
STAT_KEYS = ["g", "gs", "mp", "pts", "ast", "drb", "orb", "trb", "stl", "blk", "tov", "fg", "fga", "fg3", "fg3a",
             "ft", "fta", "pf"]
LOG_COLS = ["gid", "date", "opp", "home", "min", "pts", "ast", "drb", "orb", "stl", "blk", "tov", "fgm", "fga",
            "f3m", "f3a", "ftm", "fta", "pm", "res", "start"]


def nba_team(code):
    code = str(code or "")
    return BBR_TO_NBA.get(code, code)


def norm(name):
    s = unicodedata.normalize("NFKD", str(name)).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"[.'`]", "", s).replace("-", " ")
    s = re.sub(r"\b(jr|sr|ii|iii|iv|v)\b", "", s)
    return re.sub(r"\s+", " ", s).strip()


def end_year_of(label):
    return int(label[:4]) + 1


def load_bbr_seasons():
    """{ "2025-26": [player dicts] } including the current season (stats.json)."""
    out = {}
    for path in glob.glob(os.path.join(DATA_DIR, "season-*.json")):
        d = load_json(path, {})
        if d.get("players"):
            out[d["season"]] = d["players"]
    cur = load_json(os.path.join(DATA_DIR, "stats.json"), {})
    if cur.get("players") and cur.get("season"):
        out[cur["season"]] = cur["players"]
    return out


def match_season(acc, bbr_players):
    """NBA person id -> Basketball-Reference id for one season."""
    by_name = {}
    for p in bbr_players:
        by_name.setdefault(norm(p["name"]), []).append(p)
    out = {}
    for pid, pl in acc["players"].items():
        if not pl.get("logs"):
            continue
        n = norm(pl["n"])
        teams = {nba_team(t) for t in pl.get("t", [])}
        cands = by_name.get(n, [])
        if len(cands) > 1:
            cands = [c for c in cands if teams & {nba_team(t) for t in (c.get("teams") or [c.get("team")])}] or cands
        if len(cands) != 1:
            # nickname differences ("Nic" vs "Nicolas"): same last name + first initial + same team
            last, first = n.split(" ")[-1] if n else "", n[:1]
            cands = [c for c in bbr_players
                     if norm(c["name"]).split(" ")[-1] == last and norm(c["name"])[:1] == first
                     and teams & {nba_team(t) for t in (c.get("teams") or [c.get("team")])}]
        if len(cands) == 1:
            out[pid] = cands[0]["id"]
    return out


def earnings(seasons, sal):
    """Career NBA salary on record: one amount per season (a traded player's year is counted once)."""
    if not sal:
        return None
    rows = sorted(([label, team, amt] for label, (team, amt) in sal.items()), key=lambda r: r[0])
    played = [s["season"] for s in seasons if not s.get("current")]
    missing = [label for label in played if label not in sal]
    return {"total": sum(r[2] for r in rows), "seasons": rows, "missing": missing}


def build(now=None, current_year=None):
    os.makedirs(PLAYERS_DIR, exist_ok=True)
    seasons = load_bbr_seasons()
    bios = load_json(os.path.join(DATA_DIR, "bios.json"), {}).get("players", {})
    drafts = load_json(os.path.join(DATA_DIR, "drafts.json"), {}).get("players", {})
    contracts = load_json(os.path.join(DATA_DIR, "contracts.json"), {}).get("players", {})
    salaries = load_json(os.path.join(DATA_DIR, "salaries.json"), {}).get("players", {})
    current_label = load_json(os.path.join(DATA_DIR, "stats.json"), {}).get("season")

    players = {}

    def P(pid, name):
        return players.setdefault(pid, {"id": pid, "name": name, "seasons": [], "games": {}})

    for label, plist in seasons.items():
        for p in plist:
            rec = P(p["id"], p["name"])
            line = {"season": label, "team": " → ".join(p["teams"]) if p.get("teams") else p.get("team", ""),
                    "lastTeam": p.get("team", ""), "pos": p.get("pos", ""), "age": p.get("age"),
                    "value": p.get("value")}
            for k in STAT_KEYS:
                if k in p:
                    line[k] = p[k]
            if label == current_label:
                line["current"] = True
            rec["seasons"].append(line)

    # game-by-game seasons
    idmap = {}
    league = {}
    accs = {}
    for path in sorted(glob.glob(os.path.join(PBP_DIR, "*.json"))):
        acc = load_json(path, {})
        if not acc.get("season") or "players" not in acc:
            continue
        accs[acc["season"]] = acc
        m = match_season(acc, seasons.get(acc["season"], []))
        for nid, bid in m.items():
            idmap[nid] = bid
        zones = {}
        for pl in acc["players"].values():
            for z, (a, made) in pl.get("z", {}).items():
                t = zones.setdefault(z, [0, 0])
                t[0] += a
                t[1] += made
        league[acc["season"]] = zones
        acc["_map"] = m

    names_all = {}
    for acc in accs.values():
        names_all.update(acc.get("names", {}))

    for label, acc in accs.items():
        m = acc["_map"]
        for nid, pl in acc["players"].items():
            if not pl.get("logs") and not pl.get("z"):
                continue
            key = m.get(nid) or idmap.get(nid) or f"nba-{nid}"
            rec = P(key, pl["n"])
            rec.setdefault("nbaId", nid)
            top_at = sorted(pl.get("at", {}).items(), key=lambda kv: -kv[1])[:8]
            logs = sorted(pl.get("logs", []), key=lambda r: (r[1], r[0]))
            for r in logs:
                g = dict(zip(LOG_COLS, r))
                v = stat_value({"mp": g["min"], "pts": g["pts"], "ast": g["ast"], "drb": g["drb"],
                                "orb": g["orb"], "stl": g["stl"], "blk": g["blk"]})
                r.append(round(v, 4) if v is not None else None)
            rec["games"][label] = {
                "teams": pl.get("t", []),
                "logs": logs,
                "zones": pl.get("z", {}),
                "cells": pl.get("b", {}),
                "assists": [[idmap.get(k) or f"nba-{k}", names_all.get(k, k), n] for k, n in top_at],
                "steals": pl.get("st", {}),
                "blocks": pl.get("bk", {}),
            }

    written = 0
    for pid, rec in players.items():
        rec["seasons"].sort(key=lambda s: s["season"])
        last = rec["seasons"][-1] if rec["seasons"] else None
        latest_games = sorted(rec["games"])[-1] if rec["games"] else None
        team = (last or {}).get("lastTeam") or ""
        if latest_games and (not last or latest_games > last["season"]):
            team = (rec["games"][latest_games]["teams"] or [team])[-1]
        rec["team"] = nba_team(team)
        rec["bio"] = bios.get(pid)
        rec["draft"] = drafts.get(pid)
        rec["contract"] = contracts.get(pid)
        rec["earnings"] = earnings(rec["seasons"], salaries.get(pid, {}))
        rec["logCols"] = LOG_COLS + ["eval"]
        rec["league"] = {s: league[s] for s in rec["games"] if s in league}
        if not rec["bio"] and last:
            rec["bio"] = {"pos": last.get("pos")}
        with open(os.path.join(PLAYERS_DIR, f"{pid}.json"), "w", encoding="utf-8") as f:
            json.dump(rec, f, separators=(",", ":"))
        written += 1

    # who-is-who for links between pages (NBA id -> page id, name)
    with open(os.path.join(DATA_DIR, "idmap.json"), "w", encoding="utf-8") as f:
        json.dump(idmap, f, separators=(",", ":"))
    unmatched = sum(1 for k in players if k.startswith("nba-"))
    print(f"Player pages: {written} written ({unmatched} only in the NBA feed, not matched to Basketball-Reference)")
