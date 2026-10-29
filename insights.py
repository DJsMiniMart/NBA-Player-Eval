"""Extra player insights built from Pulse, added to every player file by build_players.py (rec["insights"]).

Every number here was tested on past seasons first (see the notes by each constant):
  hot    -- is a hot or cold start real? This season's Pulse blended with last season's: weight = minutes / (minutes + 600).
            600 minutes predicted the rest of the season best in every early window tested (3 to 25 games, 2004-05 on).
  proj   -- next seasons' Pulse from aging curves (one fit for each of 1, 2 and 3 seasons ahead, on every season since
            1979-80 with 300+ minutes), and what that level of play earns on today's market vs what his contract pays.
            Tested on 2016-17 on, it beats "same as this year" at all three horizons.
  wins   -- Pulse Wins: wins added above a replacement-level player. Credit = his Pulse production above the league
            rate for his minutes + his share (by minutes) of the team's defense (opponents' production vs league
            average), scaled so a team's credit predicts its wins (2003-04 to 2024-25, r = 0.67), with replacement
            level at a 20-win team.
  races  -- MVP (Pulse Wins x (0.3 + team win %)^2: picked 18 of 23 MVPs since 2003-04), Rookie of the Year
            (Pulse Wins + points per game / 4: 17 of 23), Sixth Man (points per game off the bench: 13 of 23;
            voters pick scorers).
  cons   -- consistency: game-to-game swing in Pulse (games with 15+ minutes). It's a real trait: year to year r = 0.60.
  vs     -- Pulse against the 10 best and 10 worst defenses. Every player drops about 9% against good defenses, and
            the rest doesn't carry over year to year (r = -0.01), so the page shows it as what happened, not a trait.
  mates  -- his Pulse in games a teammate played vs sat, this season and last.
Also writes data/hotstart.json (badges for lists) and data/awards_race.json."""
import json
import math
import os
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")
HOT_M = 600
HOT_REAL, HOT_BIG = 0.08, 0.15
# one fit per horizon (1, 2, 3 seasons ahead): [w*v, 1-w, wp*prev, wp] then one term per age 19..38
AGE_FITS = {1: [1.0082, 0.8648, 0.3062, -0.2406, 0.0524, 0.0484, 0.036, 0.0197, 0.0016, -0.0066, -0.0176, -0.0289, -0.0262, -0.0372, -0.0404, -0.0486, -0.0459, -0.0555, -0.0638, -0.0545, -0.065, -0.0661, -0.062, -0.0732], 2: [0.97, 0.8161, 0.3052, -0.2499, 0.1455, 0.1395, 0.1073, 0.0803, 0.0609, 0.0414, 0.023, 0.0163, 0.0089, -0.003, -0.014, -0.0196, -0.0245, -0.0372, -0.0358, -0.041, -0.0463, -0.0379, -0.0195, -0.0862], 3: [0.9407, 0.7999, 0.3118, -0.2591, 0.2213, 0.1897, 0.1458, 0.1202, 0.0849, 0.0617, 0.0488, 0.0315, 0.0237, 0.0024, -0.0057, -0.0182, -0.0262, -0.0255, -0.0362, -0.0434, -0.0336, -0.0126, -0.0563, -0.1058]}
AGE_M = 800
PROJ_ERR = [0.086, 0.099, 0.108]   # average miss 1, 2, 3 seasons ahead (tested on 2016-17 on; "same as this year" missed by 0.090, 0.110, 0.122)
PW_B, PW_A, PW_REPL = 0.005035, 39.77, 20
CONS_MIN = 15
MATE_MIN_GAMES, MATE_SHRINK = 4, 8
RACE_K = 15   # games of last season blended into the MVP pace (about 600 minutes, as with hot starts)   # need 4+ games without him; pulled toward no change by 8 games' worth


def pp(l):
    return l[5] + 2 * l[6] + 2 * (l[7] + l[8]) + 4 * l[9] + l[10] - 4 * l[11]


def tprod(line):
    return line[0] + 2 * line[9] + 2 * (line[7] + line[8]) + 4 * line[10] + line[11] - 4 * line[12]


def team_of(log, tg):
    g = tg.get(log[0])
    return (g[1] if log[3] == 1 else g[2]) if g else None


def rate(logs):
    m = sum(l[4] for l in logs)
    return (sum(pp(l) for l in logs) / m) if m else None


def pct(sorted_vals, v):
    if not sorted_vals:
        return None
    lo = sum(1 for x in sorted_vals if x < v)
    return round(100 * lo / len(sorted_vals))


def age_proj(v, m, pv, pm, age, k):
    """Pulse k seasons after a season with Pulse v in m minutes at this age (pv, pm: the season before)."""
    a = min(38, max(19, int(age)))
    w = m / (m + AGE_M)
    wp = pm / (pm + AGE_M) if pv is not None else 0.0
    pv = pv if pv is not None else v
    c = AGE_FITS[k]
    return c[0] * w * v + c[1] * (1 - w) + c[2] * wp * pv + c[3] * wp + c[4 + a - 19]


def salary(s):
    try:
        return int("".join(ch for ch in str(s) if ch.isdigit())) or 0
    except ValueError:
        return 0


def enrich(players, accs, current_label, contracts):
    """players: {bbr id: rec}; accs: {season label: ESPN season file}."""
    labels = sorted(accs)
    cur = current_label if current_label in accs else (labels[-1] if labels else None)
    prev = labels[labels.index(cur) - 1] if cur in labels and labels.index(cur) > 0 else None
    tg = {lab: {g: v for g, v in (accs[lab].get("tgames") or {}).items() if v[3][0] > 0 and v[4][0] > 0} for lab in labels}

    def season_bbr(rec, label):
        return next((s for s in rec.get("seasons", []) if s.get("season") == label), None)

    def logs_of(rec, label):
        x = (rec.get("games") or {}).get(label)
        return [l for l in (x or {}).get("logs", []) if l[0] in tg.get(label, {}) and l[4] > 0]

    # ---------- team context per season: wins, games, defense ----------
    ctx = {}
    for lab in (x for x in (prev, cur) if x):
        T = tg[lab]
        lg = sum(tprod(v[3]) * 48 / v[5] + tprod(v[4]) * 48 / v[5] for v in T.values()) / max(1, 2 * len(T))
        wins, games, allowed = Counter(), Counter(), defaultdict(list)
        opp = {}
        for gid, (date, h, a, hl, al, gm) in T.items():
            games[h] += 1
            games[a] += 1
            wins[h if hl[0] > al[0] else a] += 1
            allowed[h].append(tprod(al) * 48 / gm)
            allowed[a].append(tprod(hl) * 48 / gm)
            opp[(gid, h)] = (tprod(al), gm)
            opp[(gid, a)] = (tprod(hl), gm)
        order = sorted(allowed, key=lambda t: sum(allowed[t]) / len(allowed[t]))
        ctx[lab] = {"lg": lg, "wins": wins, "games": games, "opp": opp, "top": set(order[:10]), "bot": set(order[-10:])}

    def pulse_wins(rec, lab):
        c = ctx.get(lab)
        if not c:
            return None
        credit, mins, team = 0.0, 0, Counter()
        for l in logs_of(rec, lab):
            t = team_of(l, tg[lab])
            op, gm = c["opp"].get((l[0], t), (None, None))
            if op is None:
                continue
            credit += pp(l) - c["lg"] * l[4] / 240 + (c["lg"] * gm / 48 - op) * l[4] / (5 * gm)
            mins += l[4]
            team[t] += 1
        if not team:
            return None
        return PW_B * credit + (PW_A - PW_REPL) * mins / 19680, team.most_common(1)[0][0], sum(team.values()), mins

    out = {pid: {} for pid in players}

    # ---------- 1. hot start ----------
    hot = {}
    if cur:
        for pid, rec in players.items():
            L = logs_of(rec, cur)
            last = season_bbr(rec, prev) if prev else None
            if len(L) < 3 or not last or (last.get("mp") or 0) < 500 or not last.get("value"):
                continue
            early, mins = rate(L), sum(l[4] for l in L)
            prior = last["value"]
            w = mins / (mins + HOT_M)
            raw, proj = early / prior - 1, w * (early - prior) / prior
            badge = ("jump" if proj >= HOT_REAL else "drop" if proj <= -HOT_REAL else
                     "cool" if raw >= HOT_BIG else "bounce" if raw <= -HOT_BIG else "steady")
            h = {"badge": badge, "early": round(early, 3), "prior": round(prior, 3), "proj": round(prior * (1 + proj), 3),
                 "raw": round(raw, 3), "projPct": round(proj, 3), "games": len(L), "mins": mins, "weight": round(w, 2)}
            out[pid]["hot"] = h
            if badge != "steady":
                hot[pid] = [badge, round(raw, 3), round(proj, 3), len(L)]

    # ---------- 2. projection + contract value ----------
    market = []   # (production per game last season, this season's salary) for the "plays like" market
    for pid, rec in players.items():
        last = season_bbr(rec, prev) if prev else None
        c = contracts.get(pid) or rec.get("contract")
        sal = next((salary(y[1]) for y in (c or {}).get("years", []) if y[0] == cur), 0) if c else 0
        if last and sal and (last.get("g") or 0) >= 20 and (last.get("mp") or 0) >= 500 and last.get("value"):
            market.append((last["value"] * last["mp"] / last["g"], sal))
    market.sort()

    def plays_like(prod_pg):
        if len(market) < 30:
            return None
        near = sorted(market, key=lambda x: abs(x[0] - prod_pg))[:15]
        s = sorted(x[1] for x in near)
        return s[len(s) // 2]

    for pid, rec in players.items():
        done = [s for s in sorted(rec.get("seasons", []), key=lambda s: s["season"]) if not s.get("current") and s.get("value") is not None and (s.get("mp") or 0) >= 300 and s.get("age")]
        if not done or (cur and done[-1]["season"] != prev):
            continue   # only players who played last season
        s = done[-1]
        p = done[-2] if len(done) > 1 and int(done[-2]["season"][:4]) == int(s["season"][:4]) - 1 else None
        v, m, pv, pm = s["value"], s["mp"], (p["value"] if p else None), (p["mp"] if p else 0)
        mpg = s["mp"] / max(1, s["g"])
        rows = []
        y0 = int(s["season"][:4])
        for k in range(1, 4):
            nv = age_proj(v, m, pv, pm, s["age"], k)
            lab = f"{y0 + k}-{str(y0 + k + 1)[2:]}"
            rows.append([lab, s["age"] + k, round(nv, 3), PROJ_ERR[k - 1]])
        c = contracts.get(pid) or rec.get("contract") or {}
        money = []
        for lab, age, val, err in rows:
            yr = next((y for y in c.get("years", []) if y[0] == lab), None)
            if yr:
                money.append([lab, salary(yr[1]), plays_like(val * mpg), yr[2] or ""])
        out[pid]["proj"] = {"from": [s["season"], s["age"], round(s["value"], 3)], "mpg": round(mpg, 1), "rows": rows, "money": money}

    # ---------- 3. Pulse Wins + award races ----------
    races = {"season": cur, "cols": ["id", "name", "team", "pw", "winPct", "ppg", "g", "gs", "score", "pace"], "mvp": [], "roy": [], "smoy": []}
    if cur:
        first = {pid: min((s["season"] for s in rec.get("seasons") or []), default=None) for pid, rec in players.items()}
        cand = []
        for pid, rec in players.items():
            r = pulse_wins(rec, cur)
            if not r:
                continue
            pw, team, g, mins = r
            L = logs_of(rec, cur)
            gs = sum(l[20] for l in L)
            ppg = sum(l[5] for l in L) / g
            wp = ctx[cur]["wins"][team] / max(1, ctx[cur]["games"][team])
            tg_n = ctx[cur]["games"][team]
            lw = pulse_wins(rec, prev) if prev else None
            # full-season pace: this season's Pulse Wins per game blended with last season's (RACE_K games' worth),
            # and the team's win % pulled toward .500 by 10 games, so a hot week doesn't crown anyone
            per_g = (pw + (lw[0] / lw[2]) * RACE_K) / (g + RACE_K) if lw and lw[2] >= 20 else pw / g
            wpp = (ctx[cur]["wins"][team] + 5) / (ctx[cur]["games"][team] + 10)
            pace = per_g * 82 * min(1.0, g / max(1, tg_n))
            cand.append({"id": pid, "name": rec["name"], "team": team, "pw": pw, "g": g, "gs": gs, "ppg": ppg, "wp": wp,
                         "tg": tg_n, "rook": first.get(pid) == cur, "pace": pace, "wpp": wpp})
            out[pid]["wins"] = {"season": cur, "pw": round(pw, 2), "games": g, "team": team, "teamGames": tg_n,
                                "per82": round(pw / g * 82, 1) if g else None,
                                "last": [prev, round(lw[0], 1), lw[2]] if lw else None}
        most = max([c["tg"] for c in cand] + [1])
        rk = sorted(cand, key=lambda c: -c["pw"])
        for i, c in enumerate(rk):
            out[c["id"]]["wins"]["rank"] = i + 1
        for key, score, filt in (("mvp", lambda c: c["pace"] * (0.3 + c["wpp"]) ** 2, lambda c: c["g"] >= max(1, c["tg"] * 0.6)),
                                 ("roy", lambda c: c["pw"] / c["g"] * 82 + c["ppg"] / 4, lambda c: c["rook"]),
                                 ("smoy", lambda c: c["ppg"], lambda c: c["gs"] < c["g"] / 2 and c["g"] >= max(1, c["tg"] * 0.5))):
            pool = sorted((c for c in cand if filt(c)), key=lambda c: -score(c))
            for i, c in enumerate(pool[:10]):
                races[key].append([c["id"], c["name"], c["team"], round(c["pw"], 2), round(c["wp"], 3), round(c["ppg"], 1), c["g"],
                                   c["gs"], round(score(c), 3), round(c["pace"], 1)])
                out[c["id"]].setdefault("races", {})[key] = i + 1
        races["teamGames"] = most

    # ---------- 4. consistency ----------
    for lab in (x for x in (cur, prev) if x):
        vals = {}
        for pid, rec in players.items():
            L = [l for l in logs_of(rec, lab) if l[4] >= CONS_MIN]
            if len(L) < 5:
                continue
            v = sorted(pp(l) / l[4] for l in L)
            mean = sum(v) / len(v)
            sd = math.sqrt(sum((x - mean) ** 2 for x in v) / len(v))
            vals[pid] = (v, mean, sd)
        qual = sorted(sd / mean for v, mean, sd in vals.values() if len(v) >= 20 and mean > 0)
        for pid, (v, mean, sd) in vals.items():
            q = lambda f: v[min(len(v) - 1, int(f * len(v)))]  # noqa: E731
            swing = sd / mean if mean > 0 else None
            out[pid].setdefault("cons", {})[lab] = {"games": len(v), "floor": round(q(.25), 3), "typical": round(q(.5), 3),
                                                     "ceiling": round(q(.9), 3), "swing": round(swing, 3) if swing else None,
                                                     "steadier": (100 - pct(qual, swing)) if swing and len(v) >= 20 and qual else None}

    # ---------- 5. vs good / bad defenses (this season + last) ----------
    allL = []
    for pid, rec in players.items():
        T, B = [], []
        for lab in (x for x in (cur, prev) if x):
            for l in logs_of(rec, lab):
                if l[2] in ctx[lab]["top"]:
                    T.append(l)
                elif l[2] in ctx[lab]["bot"]:
                    B.append(l)
        if len(T) >= 5 and len(B) >= 5:
            rt, rb = rate(T), rate(B)
            if rt and rb and rb > 0:
                out[pid]["vs"] = {"top": round(rt, 3), "bot": round(rb, 3), "gTop": len(T), "gBot": len(B), "ratio": round(rt / rb, 3)}
                if len(T) >= 15 and len(B) >= 15:
                    allL.append(rt / rb)
    lg_ratio = sorted(allL)[len(allL) // 2] if allL else None
    for pid in out:
        if "vs" in out[pid]:
            out[pid]["vs"]["league"] = round(lg_ratio, 3) if lg_ratio else None

    # ---------- 6. teammates: his Pulse with and without each teammate ----------
    for lab in (x for x in (cur, prev) if x):
        by_team = defaultdict(lambda: defaultdict(set))   # team -> pid -> games played
        mins = defaultdict(lambda: defaultdict(int))
        for pid, rec in players.items():
            for l in logs_of(rec, lab):
                t = team_of(l, tg[lab])
                by_team[t][pid].add(l[0])
                mins[t][pid] += l[4]
        for t, roster in by_team.items():
            team_games = {g for gs in roster.values() for g in gs}
            regulars = [q for q, gs in roster.items() if mins[t][q] / max(1, len(gs)) >= 15 and len(gs) >= 5]
            for pid in roster:
                L = [l for l in logs_of(players[pid], lab) if team_of(l, tg[lab]) == t and l[4] >= 10]
                if len(L) < 10:
                    continue
                res = []
                for q in regulars:
                    if q == pid:
                        continue
                    with_ = [l for l in L if l[0] in roster[q]]
                    without = [l for l in L if l[0] not in roster[q] and l[0] in team_games]
                    if len(without) < MATE_MIN_GAMES or len(with_) < 5:
                        continue
                    rw, ro = rate(with_), rate(without)
                    if not rw or not ro:
                        continue
                    k = len(without) / (len(without) + MATE_SHRINK)
                    res.append([q, players[q]["name"], len(with_), len(without), round(rw, 3), round(ro, 3), round(k * (ro / rw - 1), 3)])
                if res:
                    res.sort(key=lambda r: -abs(r[6]))
                    out[pid].setdefault("mates", {})[lab] = {"team": t, "rows": res[:8]}

    # ---------- 7. storylines about the player ----------
    if cur:
        sched = []
        try:
            with open(os.path.join(DATA, "schedule.json"), encoding="utf-8") as f:
                sched = (json.load(f) or {}).get("games") or []
        except (OSError, ValueError):
            pass
        for pid, rec in players.items():
            try:
                st = player_stories(rec, out[pid], cur, prev, logs_of, season_bbr, tg, contracts.get(pid) or rec.get("contract"), sched)
            except Exception as e:  # noqa: BLE001 -- one odd record shouldn't stop the rest
                st = []
                print(f"Storylines skipped for {pid}: {e}")
            if st:
                out[pid]["stories"] = st

    for pid, ins in out.items():
        if ins:
            players[pid]["insights"] = ins
    with open(os.path.join(DATA, "hotstart.json"), "w", encoding="utf-8") as f:
        json.dump({"season": cur, "m": HOT_M, "players": hot}, f, separators=(",", ":"))
    with open(os.path.join(DATA, "awards_race.json"), "w", encoding="utf-8") as f:
        json.dump(races, f, separators=(",", ":"))
    print(f"Insights: {sum(1 for x in out.values() if x)} players, {len(hot)} hot-start badges")

MILESTONES = {"pts": [1000, 5000, 10000, 15000, 20000, 25000, 30000, 35000, 40000, 45000, 50000],
              "trb": [1000, 2500, 5000, 7500, 10000, 12500, 15000], "ast": [1000, 2500, 5000, 7500, 10000, 12500, 15000],
              "stl": [500, 1000, 1500, 2000], "blk": [500, 1000, 1500, 2000, 2500, 3000]}
MILE_WORD = {"pts": "points", "trb": "rebounds", "ast": "assists", "stl": "steals", "blk": "blocks"}


def player_stories(rec, ins, cur, prev, logs_of, season_bbr, tg, contract, sched):
    """[[kind, icon, text]] about this player right now: contract, role and minutes, streaks, career highs, new team,
    milestones, returning from injury, award races. Only for players who've played this season."""
    L = sorted(logs_of(rec, cur), key=lambda l: (l[1], l[0]))
    if not L:
        return []
    out = []
    name = rec["name"].split(" ")[-1] if " " in rec["name"] else rec["name"]
    team_now = None
    g0 = tg[cur].get(L[-1][0])
    if g0:
        team_now = g0[1] if L[-1][3] == 1 else g0[2]
    last = season_bbr(rec, prev) if prev else None
    gp = len(L)
    mpg = sum(l[4] for l in L) / gp
    # contract
    yrs = (contract or {}).get("years") or []
    after = [y for y in yrs if y[0] > cur]
    if yrs and any(y[0] == cur for y in yrs):
        nxt = after[0] if after else None
        opt = (nxt[2] or "").lower() if nxt else ""
        if not after:
            out.append(["contract", "📝", f"Contract year: his deal ends after this season, so he's playing for his next contract."])
        elif "player" in opt:
            out.append(["contract", "📝", f"Player option next summer ({nxt[1]}): a big season could mean he opts out to chase a bigger deal."])
        elif "team" in opt:
            nseasons = len({s_["season"] for s_ in rec.get("seasons") or []})
            if nseasons <= 4:   # rookie-scale deals: the options are usually picked up for players who are producing
                out.append(["contract", "📝", f"On his rookie deal: team option for {nxt[0]} ({nxt[1]}), usually picked up for players who are producing."])
            else:
                out.append(["contract", "📝", f"Team option next summer ({nxt[1]}): his team decides whether to keep him, so he's playing for his spot."])
        elif "early" in opt or "etoe" in opt:
            out.append(["contract", "📝", f"Early termination option next summer: he can leave his deal and hit free agency."])
    # role and minutes
    if last and (last.get("g") or 0) >= 20 and gp >= 3:
        lmpg = last["mp"] / last["g"]
        lgs = (last.get("gs") or 0) / last["g"]
        gs = sum(l[20] for l in L) / gp
        if lgs >= 0.7 and gs <= 0.3:
            out.append(["role", "🪑", f"Moved to the bench: started {round(lgs * 100)}% of his games last season, {sum(l[20] for l in L)} of {gp} this season."])
        elif lgs <= 0.3 and gs >= 0.7:
            out.append(["role", "⬆️", f"New starter: he's started {sum(l[20] for l in L)} of {gp} games after coming off the bench most of last season."])
        if mpg <= lmpg - 5:
            out.append(["role", "⏱️", f"Fighting for minutes: {mpg:.1f} a game, down from {lmpg:.1f} last season."])
        elif mpg >= lmpg + 5:
            out.append(["role", "⏱️", f"Bigger role: {mpg:.1f} minutes a game, up from {lmpg:.1f} last season."])
    if gp >= 6:
        r3 = sum(l[4] for l in L[-3:]) / 3
        if r3 <= mpg - 6:
            out.append(["role", "📉", f"Minutes slipping lately: {r3:.0f} a game over his last 3, vs {mpg:.0f} for the season."])
        elif r3 >= mpg + 6:
            out.append(["role", "📈", f"Minutes climbing: {r3:.0f} a game over his last 3, vs {mpg:.0f} for the season."])
    # streaks against his usual level (the hot-start blend when there is one, else last season)
    base = (ins.get("hot") or {}).get("proj") or (last.get("value") if last else None)
    if base and base > 0:
        ev = [pp(l) / l[4] for l in L if l[4] >= 12]
        up = 0
        for v in reversed(ev):
            if v >= base * 1.1:
                up += 1
            else:
                break
        dn = 0
        for v in reversed(ev):
            if v <= base * 0.9:
                dn += 1
            else:
                break
        if up >= 3:
            out.append(["hot", "🔥", f"Hot streak: {up} straight games well above his usual Pulse ({base:.3f})."])
        elif dn >= 3:
            out.append(["cold", "🧊", f"Cold streak: {dn} straight games well below his usual Pulse ({base:.3f})."])
    for cut in (40, 30, 25, 20):
        n = 0
        for l in reversed(L):
            if l[5] >= cut:
                n += 1
            else:
                break
        if n >= (2 if cut >= 30 else 3):
            out.append(["hot", "🎯", f"{n} straight games with {cut}+ points."])
            break
    # career high this season
    before = [l for lab, x in (rec.get("games") or {}).items() if lab < cur for l in (x or {}).get("logs", [])]
    if len(before) >= 40:
        for key, i, word in (("pts", 5, "points"), ("ast", 6, "assists")):
            best_before = max(l[i] for l in before)
            top = max(L, key=lambda l: l[i])
            if top[i] > best_before and top[i] >= (25 if key == "pts" else 10):
                out.append(["high", "⭐", f"Career high this season: {top[i]} {word} {'vs' if top[3] == 1 else 'at'} {top[2]} ({top[1]}), topping his old best of {best_before}."])
        tr = lambda l: l[7] + l[8]  # noqa: E731
        bb, tt = max(tr(l) for l in before), max(L, key=tr)
        if tr(tt) > bb and tr(tt) >= 12:
            out.append(["high", "⭐", f"Career high this season: {tr(tt)} rebounds {'vs' if tt[3] == 1 else 'at'} {tt[2]} ({tt[1]})."])
    # new team, and facing an old one
    seasons = sorted(rec.get("seasons") or [], key=lambda s: s["season"])
    olds = []
    for s_ in seasons:
        if s_["season"] >= cur:
            continue
        for t in str(s_.get("team") or "").replace("→", ",").split(","):
            t = {"BRK": "BKN", "CHO": "CHA", "PHO": "PHX"}.get(t.strip(), t.strip())
            if t and t != "TOT" and t not in olds:
                olds.append(t)
    if team_now and last:
        lt = {"BRK": "BKN", "CHO": "CHA", "PHO": "PHX"}.get(last.get("lastTeam") or "", last.get("lastTeam") or "")
        if lt and lt != team_now and lt != "TOT":
            out.append(["team", "🆕", f"First season with {team_now} after playing for {lt} last season."])
    if team_now:
        nxt = sorted((g for g in sched if g[4] != 3 and team_now in (g[2], g[3])), key=lambda g: g[1])
        if nxt:
            g = nxt[0]
            opp = g[3] if g[2] == team_now else g[2]
            if opp in olds and opp != team_now:
                out.append(["revenge", "🔄", f"Next up: {'vs' if g[2] == team_now else 'at'} {opp}, one of his former teams ({g[1][:10]})."])
    # milestones (career totals from every season, including this one)
    for k, marks in MILESTONES.items():
        tot = sum((s_.get(k) or 0) for s_ in seasons if s_.get(k) is not None)
        if k == "trb" and not tot:
            tot = sum((s_.get("drb") or 0) + (s_.get("orb") or 0) for s_ in seasons)
        cur_s = next((s_ for s_ in seasons if s_["season"] == cur), None)
        rate = None
        if cur_s and cur_s.get("g"):
            rate = (cur_s.get(k) if k != "trb" else (cur_s.get("trb") or (cur_s.get("drb") or 0) + (cur_s.get("orb") or 0))) / cur_s["g"]
        if not rate and last and last.get("g"):
            rate = (last.get(k) or 0) / last["g"]
        nxt_m = next((m for m in marks if m > tot), None)
        if nxt_m and rate and rate > 0:
            games = (nxt_m - tot) / rate
            if games <= 15:
                out.append(["milestone", "🏁", f"Milestone watch: {nxt_m - tot:,} {MILE_WORD[k]} from {nxt_m:,} for his career, about {max(1, round(games))} game{'s' if round(games) != 1 else ''} at his pace."])
    # back from missing games
    if gp >= 2 and team_now:
        team_games = sorted(gid for gid, v in tg[cur].items() if team_now in (v[1], v[2]))
        dates = {gid: tg[cur][gid][0] for gid in team_games}
        mine = {l[0] for l in L}
        order = sorted(team_games, key=lambda gid: dates[gid])
        if order and order[-1] in mine:
            i = len(order) - 2
            missed = 0
            while i >= 0 and order[i] not in mine:
                missed += 1
                i -= 1
            if missed >= 3 and i >= 0:
                out.append(["back", "🩹", f"Back in the lineup after missing {missed} games."])
    # award races
    names = {"mvp": "MVP", "roy": "Rookie of the Year", "smoy": "Sixth Man"}
    for k, r in (ins.get("races") or {}).items():
        if r <= 5:
            out.append(["race", "🏆", f"#{r} in the {names.get(k, k)} race on the Pulse Board."])
    return out[:8]
