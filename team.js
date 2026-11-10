/* Team page (team.html#OKC): stats with league ranks and filters, lineup combinations, roster,
   schedule, injuries, cap sheet and draft picks. Data comes from data/teams/*.json (built every morning
   by build_teams.py), data/schedule.json, data/contracts.json and data/bios.json. */
(function(){
"use strict";

const RULES = window.CAP_RULES;
const TEAMS = (window.PlayerPage && PlayerPage.TEAMS) || {};
const CODES = Object.keys(TEAMS).sort((a,b) => TEAMS[a].n.localeCompare(TEAMS[b].n));
const NBA_TO_BBR = {BKN:"BRK", CHA:"CHO", PHX:"PHO"};
const BBR_TO_NBA = {BRK:"BKN", CHO:"CHA", PHO:"PHX"};
const DIV = {
  Atlantic:["BOS","BKN","NYK","PHI","TOR"], Central:["CHI","CLE","DET","IND","MIL"], Southeast:["ATL","CHA","MIA","ORL","WAS"],
  Northwest:["DEN","MIN","OKC","POR","UTA"], Pacific:["GSW","LAC","LAL","PHX","SAC"], Southwest:["DAL","HOU","MEM","NOP","SAS"],
};
const DIV_OF = {}, CONF_OF = {};
Object.entries(DIV).forEach(([d, list]) => list.forEach(t => { DIV_OF[t] = d; CONF_OF[t] = ["Atlantic","Central","Southeast"].includes(d) ? "East" : "West"; }));
const COLS = ["pts","fgm","fga","fg3m","fg3a","ftm","fta","oreb","dreb","ast","stl","blk","tov","pf","paint","fast","second","offTov","bench"];
const I = Object.fromEntries(COLS.map((c,i) => [c, i]));

const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fold = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, "").replace(/[^a-z]/g, "");
const num = s => +String(s || "").replace(/[^\d]/g, "") || 0;
const M = n => (n < 0 ? "−" : "") + "$" + (Math.abs(n)/1e6).toFixed(Math.abs(n) >= 1e8 ? 1 : 2) + "M";
const f3n = n => n == null || !isFinite(n) ? "—" : n.toFixed(3);
const f1 = n => n == null || !isFinite(n) ? "—" : n.toFixed(1);
const pct = n => n == null || !isFinite(n) ? "—" : (n*100).toFixed(1) + "%";
const sgn = n => n == null || !isFinite(n) ? "—" : (n > 0 ? "+" : "") + n.toFixed(1);
const logo = c => TEAMS[c] ? `${teamBadge(TEAMS[c].id)}` : "";
const ord = n => n + (["th","st","nd","rd"][(n % 100 - 20) % 10] || ["th","st","nd","rd"][n % 100] || "th");
async function getJSON(path){ try{ const r = await fetch(path + "?t=" + Date.now()); return r.ok ? await r.json() : null; }catch(_){ return null; } }

let CODE = null, LEAGUE = null, TEAM = null, SCHED = null, CT = null, BIOS = null, STATS = null;
const F = {games:"all", loc:"all", opp:"all", res:"all", conf:"all", rest:"all", month:"all", close:"all"};
let pick = [], comboSize = 2, comboMin = 20, rosterSort = {k:"mp", d:-1};

/* ---------- games & filters ---------- */
function teamGames(code){
  /* every final game for a team: {gid, date, opp, home, me:[...], them:[...], min} */
  return (LEAGUE ? LEAGUE.games : []).filter(g => g[2] === code || g[3] === code).map(g => {
    const home = g[2] === code;
    return {gid:g[0], date:g[1], opp: home ? g[3] : g[2], home, me: home ? g[4] : g[5], them: home ? g[5] : g[4], min:g[6] || 48};
  });
}
let RECORDS = {};
function records(){
  RECORDS = {};
  (LEAGUE ? LEAGUE.games : []).forEach(g => {
    const hw = g[4][0] > g[5][0];
    [[g[2], hw], [g[3], !hw]].forEach(([t, w]) => { const r = RECORDS[t] = RECORDS[t] || {w:0, l:0}; w ? r.w++ : r.l++; });
  });
}
const winPct = t => { const r = RECORDS[t]; return r && (r.w + r.l) ? r.w / (r.w + r.l) : 0; };
function filtered(code){
  let list = teamGames(code);
  const days = d => new Date(d + "T00:00:00Z").getTime() / 864e5;
  list.forEach((g, i) => g.rest = i ? Math.round(days(g.date) - days(list[i-1].date)) - 1 : 9);
  list = list.filter(g =>
    (F.loc === "all" || (F.loc === "home") === g.home) &&
    (F.opp === "all" || (F.opp === "above" ? winPct(g.opp) > .5 : winPct(g.opp) <= .5)) &&
    (F.res === "all" || (F.res === "w") === (g.me[0] > g.them[0])) &&
    (F.conf === "all" || (F.conf === "div" ? DIV_OF[g.opp] === DIV_OF[code] : CONF_OF[g.opp] === F.conf)) &&
    (F.rest === "all" || (F.rest === "b2b" ? g.rest === 0 : F.rest === "1" ? g.rest === 1 : g.rest >= 2 && g.rest < 9)) &&
    (F.month === "all" || g.date.slice(0, 7) === F.month) &&
    (F.close === "all" || (F.close === "close" ? Math.abs(g.me[0] - g.them[0]) <= 5 : Math.abs(g.me[0] - g.them[0]) >= 15)));
  if(F.games !== "all") list = list.slice(-(+F.games));
  return list;
}
const poss = s => s[I.fga] - s[I.oreb] + s[I.tov] + 0.44 * s[I.fta];
function summarize(games){
  const t = COLS.map(() => 0), o = COLS.map(() => 0);
  let w = 0, min = 0;
  games.forEach(g => { g.me.forEach((v,i) => t[i] += v); g.them.forEach((v,i) => o[i] += v); if(g.me[0] > g.them[0]) w++; min += g.min; });
  const n = games.length;
  if(!n) return null;
  const P = (poss(t) + poss(o)) / 2;
  const efg = s => (s[I.fgm] + 0.5 * s[I.fg3m]) / s[I.fga];
  return {n, w, l: n - w, winp: w / n,
    pts: t[I.pts]/n, opp: o[I.pts]/n, diff: (t[I.pts]-o[I.pts])/n,
    pe: (t[I.pts] + 2*t[I.ast] + 2*(t[I.oreb] + t[I.dreb]) + 4*t[I.stl] + t[I.blk] - 4*t[I.tov]) / (48*n),
    ortg: 100*t[I.pts]/P, drtg: 100*o[I.pts]/P, net: 100*(t[I.pts]-o[I.pts])/P, pace: 48*P/(min/1 || 1)*1,
    fgp: t[I.fgm]/t[I.fga], fg3p: t[I.fg3m]/t[I.fg3a], ftp: t[I.ftm]/t[I.fta], efg: efg(t),
    ts: t[I.pts]/(2*(t[I.fga] + 0.44*t[I.fta])), tpar: t[I.fg3a]/t[I.fga], ftr: t[I.fta]/t[I.fga],
    fg3a: t[I.fg3a]/n, ast: t[I.ast]/n, astr: t[I.ast]/t[I.fgm], reb: (t[I.oreb]+t[I.dreb])/n,
    orbp: t[I.oreb]/(t[I.oreb] + o[I.dreb]), drbp: t[I.dreb]/(t[I.dreb] + o[I.oreb]),
    tovp: 100*t[I.tov]/poss(t), stl: t[I.stl]/n, blk: t[I.blk]/n,
    oefg: efg(o), otovp: 100*o[I.tov]/poss(o), ofg3p: o[I.fg3m]/o[I.fg3a], oftr: o[I.fta]/o[I.fga],
    paint: t[I.paint]/n, fast: t[I.fast]/n, second: t[I.second]/n, offTov: t[I.offTov]/n, bench: t[I.bench]/n,
    opaint: o[I.paint]/n};
}
/* stat, label, format, higher is better? */
const GROUPS = [
  ["Overall", [["winp","Win %",pct,1],["diff","Point margin",sgn,1],["net","Net rating",sgn,1],["pace","Pace",f1,null],["pe","Team Pulse",f3n,1]]],
  ["Offense", [["ortg","Offensive rating",f1,1],["pts","Points",f1,1],["efg","Effective FG%",pct,1],["ts","True shooting %",pct,1],["ast","Assists",f1,1],["tovp","Turnover %",f1,0],["orbp","Off. rebound %",pct,1]]],
  ["Defense", [["drtg","Defensive rating",f1,0],["opp","Points allowed",f1,0],["oefg","Opp. effective FG%",pct,0],["otovp","Opp. turnover %",f1,1],["drbp","Def. rebound %",pct,1],["stl","Steals",f1,1],["blk","Blocks",f1,1]]],
  ["Shooting", [["fgp","FG%",pct,1],["fg3p","3P%",pct,1],["fg3a","3PA",f1,null],["tpar","3PA rate",pct,null],["ftp","FT%",pct,1],["ftr","FT rate",pct,1],["ofg3p","Opp. 3P%",pct,0]]],
  ["Scoring", [["paint","Paint points",f1,1],["fast","Fast-break points",f1,1],["second","Second-chance points",f1,1],["offTov","Points off turnovers",f1,1],["bench","Bench points",f1,1],["opaint","Opp. paint points",f1,0],["reb","Rebounds",f1,1]]],
];
function ranks(){
  const all = {};
  CODES.forEach(c => { const s = summarize(filtered(c)); if(s) all[c] = s; });
  const out = {};
  GROUPS.forEach(([, rows]) => rows.forEach(([k, , , hi]) => {
    if(hi === null) hi = 1;
    const vals = Object.entries(all).filter(([,s]) => isFinite(s[k])).sort((a,b) => hi ? b[1][k] - a[1][k] : a[1][k] - b[1][k]);
    vals.forEach(([c], i) => { (out[c] = out[c] || {})[k] = i + 1; });
  }));
  return {all, out, teams: Object.keys(all).length};
}

/* ---------- drawing: header ---------- */
function drawPicker(){
  $('picker').innerHTML = CODES.map(c => `<a href="#${c}" data-c="${c}" class="${c === CODE ? "on" : ""}" title="${esc(TEAMS[c].n)}"><img src="${logo(c)}" alt="${c}" loading="lazy" onerror="this.replaceWith('${c}')"></a>`).join("");
}
function confRank(code){
  const conf = CONF_OF[code];
  const list = CODES.filter(c => CONF_OF[c] === conf && RECORDS[c]).sort((a,b) => winPct(b) - winPct(a) || (RECORDS[b].w - RECORDS[a].w));
  const i = list.indexOf(code);
  return i < 0 ? null : i + 1;
}
function drawHero(){
  const T = TEAMS[CODE], r = RECORDS[CODE];
  document.documentElement.style.setProperty("--c1", T.c1);
  document.documentElement.style.setProperty("--c2", T.c2);
  document.title = `${T.n} · Franchise Files · Full Court Geek Press`;
  const cr = confRank(CODE);
  const fact = (k, v) => `<div><span>${k}</span><b>${v ? esc(v) : "—"}</b></div>`;
  const H = TEAM && TEAM.history;
  const titles = (H && H.titles) || [];
  const trophies = titles.length
    ? `<div class="trophies" title="${titles.length} championship${titles.length === 1 ? "" : "s"}">${titles.map(([y, name, lg]) => `<span class="trophy" title="${esc(name)}, ${y - 1}-${String(y).slice(2)}${lg === "BAA" ? " (BAA)" : ""}">${TROPHY}${y}${name !== T.n ? `<small>${esc(nameThen(name))}</small>` : ""}</span>`).join("")}</div>`
    : (H ? `<div class="titles-none">No championships yet</div>` : "");
  $('hero').innerHTML = `
    <div class="logo"><img src="${logo(CODE)}" alt="" onerror="this.style.visibility='hidden'"></div>
    <div>${trophies}<h1>${esc(T.n)}</h1>
      <div class="sub">${CONF_OF[CODE]}ern Conference · ${DIV_OF[CODE]} Division${TEAM && TEAM.arena ? " · " + esc(TEAM.arena) : ""}</div>
      <div class="record">${r ? `${r.w}-${r.l}` : "0-0"}<small>${cr ? `${ordN(cr)} in the ${CONF_OF[CODE]}` : (LEAGUE ? "season hasn't started" : "")}</small></div></div>
    <div class="facts">
      ${fact("Head coach", TEAM && TEAM.coach)}${fact("Owner", TEAM && TEAM.owner)}
      ${fact("Executive", TEAM && TEAM.executive)}${fact("Season", (LEAGUE && LEAGUE.season) || RULES.season)}
    </div>`;
}

/* ---------- team stats ---------- */
function drawFilters(){
  const months = [...new Set(teamGames(CODE).map(g => g.date.slice(0,7)))];
  const mName = m => new Date(m + "-15T12:00:00Z").toLocaleString("en-US", {month:"long", year:"numeric"});
  const sel = (id, label, opts) => `<div><label for="f-${id}">${label}</label><select id="f-${id}" data-f="${id}">${opts.map(([v,t]) => `<option value="${v}" ${F[id] === v ? "selected" : ""}>${t}</option>`).join("")}</select></div>`;
  $('filters').innerHTML = [
    sel("games", "Games", [["all","Whole season"],["5","Last 5"],["10","Last 10"],["15","Last 15"],["20","Last 20"],["30","Last 30"]]),
    sel("loc", "Home / away", [["all","All"],["home","Home"],["away","Away"]]),
    sel("opp", "Opponent", [["all","All"],["above","Above .500"],["below",".500 or below"]]),
    sel("res", "Result", [["all","All"],["w","Wins"],["l","Losses"]]),
    sel("conf", "Opp. conference", [["all","All"],["East","East"],["West","West"],["div","Own division"]]),
    sel("rest", "Rest", [["all","All"],["b2b","Back-to-backs"],["1","1 day of rest"],["2","2+ days of rest"]]),
    sel("month", "Month", [["all","All"]].concat(months.map(m => [m, mName(m)]))),
    sel("close", "Game type", [["all","All"],["close","Close (≤5 pts)"],["blowout","Blowouts (15+)"]]),
  ].join("");
  $('filters').querySelectorAll('select').forEach(s => s.onchange = () => { F[s.dataset.f] = s.value; drawData(); });
}
function drawStats(){
  const games = filtered(CODE);
  const any = Object.entries(F).filter(([,v]) => v !== "all").length;
  $('fsum').innerHTML = `<span><b>${games.length}</b> game${games.length === 1 ? "" : "s"} match${games.length ? ` · ${games.filter(g => g.me[0] > g.them[0]).length}-${games.filter(g => g.me[0] <= g.them[0]).length}` : ""}</span>${any ? `<button id="fClear">Clear filters</button>` : ""}`;
  if($('fClear')) $('fClear').onclick = () => { Object.keys(F).forEach(k => F[k] = "all"); drawFilters(); drawData(); };
  if(!LEAGUE || !LEAGUE.games.length){ $('statsBody').innerHTML = `<div class="card empty" style="margin-top:12px">No games have been played yet this season. Team stats and ranks appear after the first games (the update runs every morning).</div>`; return; }
  if(!games.length){ $('statsBody').innerHTML = `<div class="card empty" style="margin-top:12px">No games match these filters.</div>`; return; }
  const s = summarize(games), R = ranks(), rk = R.out[CODE] || {};
  const badge = k => rk[k] ? `<span class="rk ${rk[k] <= 10 ? "top" : rk[k] > 20 ? "bot" : ""}" title="${ordN(rk[k])} of ${R.teams}">${ordN(rk[k])}</span>` : `<span class="rk">—</span>`;
  const tile = (k, label, fmt, tip) => `<div class="card tile"${tip ? ` title="${esc(tip)}"` : ""}><div class="k">${label}</div><div class="v">${fmt(s[k])}</div><div class="r">${rk[k] ? `${ordN(rk[k])} in the NBA` : ""}</div></div>`;
  $('statsBody').innerHTML = `
    <div class="big4" style="margin-top:12px">${tile("ortg","Offensive rating",f1)}${tile("drtg","Defensive rating",f1)}${tile("net","Net rating",sgn)}${tile("pace","Pace",f1)}${tile("pe","Team Pulse",f3n,"Points, assists×2, rebounds×2, steals×4, blocks, minus turnovers×4, per 48 minutes")}</div>
    <div class="groups">${GROUPS.map(([name, rows]) => `<div class="card grp"><h3>${name}</h3>${rows.map(([k, label, fmt]) => `<div class="srow"><span class="k">${label}</span><span class="v">${fmt(s[k])}</span>${badge(k)}</div>`).join("")}</div>`).join("")}</div>
    <div class="card" style="margin-top:12px"><div class="tw"><table>
      <thead><tr><th class="l">Date</th><th class="l">Opponent</th><th class="l">Result</th><th>Pts</th><th>Opp</th><th>Off rtg</th><th>Def rtg</th><th>eFG%</th><th>3P</th><th>TOV</th><th>Reb</th><th>Ast</th></tr></thead>
      <tbody>${games.slice().reverse().map(g => {
        const P = (poss(g.me) + poss(g.them)) / 2, w = g.me[0] > g.them[0];
        return `<tr class="game" data-gid="${esc(g.gid)}" title="Click for the box score"><td class="l">${new Date(g.date + "T12:00:00Z").toLocaleDateString("en-US", {month:"short", day:"numeric"})}</td>
          <td class="l">${g.home ? "vs" : "@"} <img class="mini" src="${logo(g.opp)}" alt="" onerror="this.remove()">${esc(g.opp)}</td>
          <td class="l"><span class="${w ? "W" : "L"}">${w ? "W" : "L"}</span> ${g.me[0]}-${g.them[0]}</td>
          <td>${g.me[0]}</td><td>${g.them[0]}</td><td>${f1(100*g.me[0]/P)}</td><td>${f1(100*g.them[0]/P)}</td>
          <td>${pct((g.me[I.fgm] + .5*g.me[I.fg3m]) / g.me[I.fga])}</td><td>${g.me[I.fg3m]}-${g.me[I.fg3a]}</td><td>${g.me[I.tov]}</td><td>${g.me[I.oreb] + g.me[I.dreb]}</td><td>${g.me[I.ast]}</td></tr>`;
      }).join("")}</tbody></table></div><div class="note pad" style="margin:0">Click a game for the box score.</div></div>`;
  wireGames($('statsBody'));
}
function wireGames(el){
  el.querySelectorAll('[data-gid]').forEach(tr => tr.onclick = () => openBox(tr.dataset.gid));
}

/* ---------- box score pop-up (box.js) ---------- */
const openBox = gid => window.BoxScore && BoxScore.open(gid);

/* ---------- lineups ---------- */
function stintsFor(games){
  const ok = new Set(games.map(g => g.gid));
  return ((TEAM && TEAM.stints) || []).filter(s => ok.has(s[0]));
}
function agg(rows){
  const a = {secs:0, pf:0, pa:0, posf:0, posa:0, games:new Set()};
  rows.forEach(s => { a.secs += s[2]; a.pf += s[3]; a.pa += s[4]; a.posf += s[5]; a.posa += s[6]; a.games.add(s[0]); });
  const P = (a.posf + a.posa) / 2;
  return Object.assign(a, {min: a.secs/60, ortg: P ? 100*a.pf/P : null, drtg: P ? 100*a.pa/P : null, net: P ? 100*(a.pf - a.pa)/P : null, poss: P});
}
function combos(arr, k, start = 0, cur = [], out = []){
  if(cur.length === k){ out.push(cur.slice()); return out; }
  for(let i = start; i < arr.length; i++){ cur.push(arr[i]); combos(arr, k, i + 1, cur, out); cur.pop(); }
  return out;
}
function drawLineups(){
  const games = filtered(CODE);
  const st = stintsFor(games);
  if(!TEAM || !(TEAM.stints || []).length){ $('lineBody').innerHTML = `<div class="card empty">Lineup data shows up after the first games are played (it's built from each game's play-by-play every morning).</div>`; return; }
  const names = TEAM.names || {};
  const mins = {};
  st.forEach(s => s[1].split(",").forEach(p => mins[p] = (mins[p] || 0) + s[2]));
  const ids = Object.keys(names).sort((a,b) => (mins[b] || 0) - (mins[a] || 0));
  pick = pick.filter(p => ids.includes(p));
  const nm = id => names[id] || id;
  const short = id => { const n = nm(id).split(" "); return n.length > 1 ? n.slice(1).join(" ") : n[0]; };
  let cmp = "";
  if(pick.length >= 2){
    const on = st.filter(s => pick.every(p => s[1].split(",").includes(p)));
    const off = st.filter(s => !pick.every(p => s[1].split(",").includes(p)));
    const A = agg(on), B = agg(off);
    const box = (title, a) => `<div class="card"><h4>${title}</h4>${a.secs ? `<div class="nums">
      <div><span>Minutes</span><b>${f1(a.min)}</b></div><div><span>Off rtg</span><b>${f1(a.ortg)}</b></div>
      <div><span>Def rtg</span><b>${f1(a.drtg)}</b></div><div><span>Net</span><b class="${a.net >= 0 ? "pos" : "neg"}">${sgn(a.net)}</b></div></div>
      <div class="note" style="margin:8px 0 0">${a.games.size} game${a.games.size === 1 ? "" : "s"} · ${Math.round(a.poss)} possessions · ${a.pf}-${a.pa} points</div>` : `<div class="note" style="margin:0">No minutes.</div>`}</div>`;
    cmp = `<div class="cmp">${box(`${pick.map(short).join(" + ")} together`, A)}${box("Rest of the team's minutes", B)}</div>
      ${A.secs && A.min < 30 ? `<p class="note" style="margin-top:8px">Small sample: under 30 minutes together, so these numbers can swing a lot.</p>` : ""}`;
  }
  /* best combinations of N players */
  const by = new Map();
  st.forEach(s => {
    const five = s[1].split(",").sort();
    combos(five, comboSize).forEach(c => { const k = c.join(","); if(!by.has(k)) by.set(k, []); by.get(k).push(s); });
  });
  const list = [...by.entries()].map(([k, rows]) => Object.assign(agg(rows), {k})).filter(a => a.min >= comboMin).sort((a,b) => b.net - a.net);
  $('lineBody').innerHTML = `
    <div class="card pad">
      <div class="note" style="margin:0 0 8px">Players (by minutes played) · ${pick.length} picked${pick.length ? ` · <a href="#" id="lnClear">clear</a>` : ""}</div>
      <div class="chips">${ids.map(id => `<button class="chip ${pick.includes(id) ? "on" : ""}" data-p="${id}">${esc(nm(id))}<small>${Math.round((mins[id] || 0)/60)} min</small></button>`).join("")}</div>
      ${pick.length < 2 ? `<p class="note" style="margin:12px 0 0">Pick at least 2 players.</p>` : ""}
    </div>
    ${cmp}
    <div class="row2"><b>Best combinations</b>
      <select id="lnSize">${[2,3,4,5].map(n => `<option value="${n}" ${n === comboSize ? "selected" : ""}>${n} players</option>`).join("")}</select>
      <label class="note" style="margin:0">at least <input id="lnMin" type="number" min="0" step="5" value="${comboMin}" style="width:70px"> minutes together</label></div>
    <div class="card"><div class="tw"><table>
      <thead><tr><th class="l">Players</th><th>Min</th><th>GP</th><th>Off rtg</th><th>Def rtg</th><th>Net</th><th></th></tr></thead>
      <tbody>${list.length ? list.slice(0, 25).map(a => `<tr><td class="l nm">${a.k.split(",").map(nm).map(esc).join(" · ")}</td><td>${f1(a.min)}</td><td>${a.games.size}</td>
        <td>${f1(a.ortg)}</td><td>${f1(a.drtg)}</td><td class="${a.net >= 0 ? "pos" : "neg"}"><b>${sgn(a.net)}</b></td><td><button data-use="${a.k}" style="padding:3px 8px;font-size:12px">Compare</button></td></tr>`).join("")
        : `<tr><td colspan="7" class="empty">No ${comboSize}-player group has ${comboMin}+ minutes together with these filters.</td></tr>`}</tbody></table></div></div>`;
  $('lineBody').querySelectorAll('[data-p]').forEach(b => b.onclick = () => {
    const id = b.dataset.p;
    if(pick.includes(id)) pick = pick.filter(x => x !== id); else if(pick.length < 5) pick.push(id);
    drawLineups();
  });
  $('lineBody').querySelectorAll('[data-use]').forEach(b => b.onclick = () => { pick = b.dataset.use.split(","); drawLineups(); $('lineups').scrollIntoView({behavior:"smooth"}); });
  if($('lnClear')) $('lnClear').onclick = e => { e.preventDefault(); pick = []; drawLineups(); };
  $('lnSize').onchange = e => { comboSize = +e.target.value; drawLineups(); };
  $('lnMin').onchange = e => { comboMin = Math.max(0, +e.target.value || 0); drawLineups(); };
}

/* ---------- roster ---------- */
function contractsFor(code){
  const bbr = NBA_TO_BBR[code] || code;
  return Object.entries((CT && CT.players) || {}).filter(([, c]) => c.team === bbr).map(([id, c]) => {
    const b = (BIOS && BIOS[id]) || {};
    const now = (c.years || []).find(y => y[0] === RULES.season);
    return {id, name: c.name || b.name || id, pos: b.pos, born: b.born, ht: b.ht, years: (c.years || []).filter(y => y[0] >= RULES.season), salary: now ? num(now[1]) : 0, opt: now ? now[2] : ""};
  });
}
function age(born){
  if(!born) return "";
  const b = new Date(born + "T00:00:00"), n = new Date();
  let a = n.getFullYear() - b.getFullYear();
  if(n.getMonth() < b.getMonth() || (n.getMonth() === b.getMonth() && n.getDate() < b.getDate())) a--;
  return a;
}
function drawRoster(){
  const ok = new Set(filtered(CODE).map(g => g.gid));
  const cts = contractsFor(CODE);
  const byName = new Map(cts.map(c => [fold(c.name), c]));
  const statsByName = new Map(((STATS && STATS.players) || []).map(p => [fold(p.name), p.id]));
  const rows = [];
  Object.entries((TEAM && TEAM.players) || {}).forEach(([nid, p]) => {
    const g = p.g.filter(x => ok.has(x[0]));
    const t = Array(17).fill(0);
    g.forEach(x => x.forEach((v, i) => { if(i) t[i] += +v || 0; }));
    const c = byName.get(fold(p.n));
    if(c) byName.delete(fold(p.n));
    const n = g.length, reb = t[4] + t[5];
    rows.push({name:p.n, id: c ? c.id : statsByName.get(fold(p.n)), c, gp:n, gs:t[16], mp: n ? t[1]/n : 0, pts: n ? t[2]/n : 0, reb: n ? reb/n : 0,
      ast: n ? t[3]/n : 0, stl: n ? t[6]/n : 0, blk: n ? t[7]/n : 0, tov: n ? t[8]/n : 0,
      fgp: t[10] ? t[9]/t[10] : null, fg3p: t[12] ? t[11]/t[12] : null, ftp: t[14] ? t[13]/t[14] : null, pm: n ? t[15]/n : 0,
      ev: t[1] ? (t[2] + 2*t[3] + 2*reb + 4*t[6] + t[7] - 4*t[8]) / t[1] : null});
  });
  byName.forEach(c => rows.push({name:c.name, id:c.id, c, gp:0, gs:0, mp:0, pts:0, reb:0, ast:0, stl:0, blk:0, tov:0, fgp:null, fg3p:null, ftp:null, pm:0, ev:null}));
  rows.forEach(r => { r.sal = r.c ? r.c.salary : 0; r.age = r.c ? age(r.c.born) : ""; r.pos = r.c ? r.c.pos || "" : ""; });
  const k = rosterSort.k, d = rosterSort.d;
  rows.sort((a,b) => (k === "name" ? a.name.localeCompare(b.name) : ((a[k] ?? -1e9) - (b[k] ?? -1e9))) * d);
  const H = [["name","Player","l"],["pos","Pos",""],["age","Age",""],["sal","Salary",""],["gp","GP",""],["gs","GS",""],["mp","MIN",""],["pts","PTS",""],["reb","REB",""],["ast","AST",""],["stl","STL",""],["blk","BLK",""],["tov","TOV",""],["fgp","FG%",""],["fg3p","3P%",""],["ftp","FT%",""],["pm","+/-",""],["ev","Pulse",""]];
  if(!rows.length){ $('rosterBody').innerHTML = `<div class="empty">No roster found yet.</div>`; return; }
  $('rosterBody').innerHTML = `<table><thead><tr>${H.map(([k2, t, cls]) => `<th class="s ${cls} ${k2 === k ? "on" : ""}" data-k="${k2}">${t}${k2 === k ? (d < 0 ? " ▾" : " ▴") : ""}</th>`).join("")}</tr></thead>
    <tbody>${rows.map(r => `<tr><td class="l nm">${r.id ? `<a href="pe.html#/player/${encodeURIComponent(r.id)}">${esc(r.name)}</a>` : esc(r.name)}${r.c && r.c.opt ? `<span class="tag">${r.c.opt === "player option" ? "PO" : r.c.opt === "team option" ? "TO" : "ETO"}</span>` : ""}${!r.c ? `<span class="tag" title="No contract listed for this season: waived, traded away, two-way or 10-day">no contract</span>` : ""}</td>
      <td>${esc(r.pos)}</td><td>${r.age}</td><td>${r.sal ? M(r.sal) : "—"}</td><td>${r.gp}</td><td>${r.gs}</td><td>${f1(r.mp)}</td><td>${f1(r.pts)}</td><td>${f1(r.reb)}</td><td>${f1(r.ast)}</td>
      <td>${f1(r.stl)}</td><td>${f1(r.blk)}</td><td>${f1(r.tov)}</td><td>${pct(r.fgp)}</td><td>${pct(r.fg3p)}</td><td>${pct(r.ftp)}</td>
      <td class="${r.pm >= 0 ? "pos" : "neg"}">${r.gp ? sgn(r.pm) : "—"}</td><td><b style="color:var(--accent)">${r.ev != null ? r.ev.toFixed(3) : "—"}</b></td></tr>`).join("")}</tbody></table>`;
  $('rosterBody').querySelectorAll('th[data-k]').forEach(th => th.onclick = () => {
    const k2 = th.dataset.k; rosterSort = {k:k2, d: rosterSort.k === k2 ? -rosterSort.d : (k2 === "name" || k2 === "pos" ? 1 : -1)}; drawRoster();
  });
}

/* ---------- schedule ---------- */
function drawSchedule(){
  const games = ((SCHED && SCHED.games) || []).filter(g => g[2] === CODE || g[3] === CODE).sort((a,b) => a[1].localeCompare(b[1]));
  if(!games.length){ $('schedBody').innerHTML = `<div class="card empty">The schedule is saved during the morning update.</div>`; return; }
  const when = iso => new Date(iso);
  const fmtD = iso => when(iso).toLocaleDateString("en-US", {weekday:"short", month:"short", day:"numeric"});
  const fmtT = iso => when(iso).toLocaleTimeString("en-US", {hour:"numeric", minute:"2-digit"});
  const kinds = {}; games.forEach(g => kinds[g[0]] = g[9] || ({"004":"Playoffs","005":"Play-in","006":"NBA Cup"})[String(g[0]).slice(0,3)] || "");
  const kind = gid => kinds[gid] || "";
  const upcoming = games.filter(g => g[4] !== 3);
  const card = g => { const home = g[2] === CODE, opp = home ? g[3] : g[2];
    return `<div class="card gcard"><div class="d">${fmtD(g[1])}${kind(g[0]) ? " · " + kind(g[0]) : ""}</div>
      <div class="o">${home ? "vs" : "@"} <img src="${logo(opp)}" alt="" onerror="this.remove()">${esc(TEAMS[opp] ? TEAMS[opp].n : opp)}</div>
      <div class="t">${g[4] === 2 ? "Live now" : fmtT(g[1])}${g[8] ? " · " + esc(g[8]) : ""}${RECORDS[opp] ? ` · ${RECORDS[opp].w}-${RECORDS[opp].l}` : ""}</div></div>`; };
  let month = "";
  const rows = games.map(g => {
    const home = g[2] === CODE, opp = home ? g[3] : g[2], m = when(g[1]).toLocaleString("en-US", {month:"long", year:"numeric"});
    const head = m !== month ? `<tr><td colspan="5" class="l" style="background:var(--row);font-weight:700">${m}</td></tr>` : "";
    month = m;
    const my = home ? g[5] : g[6], th = home ? g[6] : g[5], w = my > th;
    return head + `<tr${g[4] === 3 ? ` class="game" data-gid="${esc(g[0])}" title="Click for the box score"` : ""}><td class="l">${fmtD(g[1])}</td><td class="l">${home ? "vs" : "@"} <img class="mini" src="${logo(opp)}" alt="" onerror="this.remove()">${esc(TEAMS[opp] ? TEAMS[opp].n : opp)}${kind(g[0]) ? `<span class="tag">${kind(g[0])}</span>` : ""}</td>
      <td class="l">${g[4] === 3 ? `<span class="${w ? "W" : "L"}">${w ? "W" : "L"}</span> ${my}-${th}` : g[4] === 2 ? "Live" : fmtT(g[1])}</td>
      <td class="l">${esc(g[8] || "")}</td><td class="l">${esc(g[7] || "")}</td></tr>`;
  }).join("");
  $('schedBody').innerHTML = `${upcoming.length ? `<p class="note">Next up (times in your time zone)</p><div class="next">${upcoming.slice(0, 4).map(card).join("")}</div>` : ""}
    <div class="card"><div class="tw" style="max-height:520px;overflow:auto"><table><thead><tr><th class="l">Date</th><th class="l">Opponent</th><th class="l">Result / time</th><th class="l">TV</th><th class="l">Arena</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
  wireGames($('schedBody'));
  const firstOpen = $('schedBody').querySelector('.tw');
  if(firstOpen && upcoming.length){ const i = games.indexOf(upcoming[0]); const tr = firstOpen.querySelectorAll('tbody tr')[i]; if(tr) firstOpen.scrollTop = Math.max(0, tr.offsetTop - 80); }
}

/* ---------- injuries (data/injuries.json: ESPN's report with timetables and links, refreshed hourly) ---------- */
async function drawInjuries(){
  const md = iso => new Date(iso + "T12:00:00").toLocaleDateString("en-US", {month:"short", day:"numeric"});
  const show = (list, src) => {
    $('injBody').innerHTML = list && list.length ? list.map(x => {
      const s = String(x.status || "").toLowerCase();
      const cls = s.includes("out") ? "out" : (s.includes("day") || s.includes("question") || s.includes("doubt") || s.includes("probable")) ? "dtd" : "oth";
      const what = [x.side, x.type, x.detail].filter(Boolean).join(" ");
      const wh = window.Injuries && x.tl ? Injuries.when(x) : "";
      const note = x.long && x.long.length > (x.note || "").length ? x.long : x.note;
      return `<div class="inj injc" role="button" tabindex="0" data-inj="${esc(CODE)}|${esc(x.name)}" title="Tap for the full injury details"><span class="who">${window.playerLink ? window.playerLink(x.name, CODE) : esc(x.name)}${x.pos ? ` <span class="note">${esc(x.pos)}</span>` : ""}</span><span class="st ${cls}">${esc(x.status || "")}</span>
        ${wh ? `<span class="tl"><span>⏱ ${esc(wh)}</span></span>` : ""}
        <span class="why">${what ? esc(what) + ". " : ""}${esc(note || "")}${x.date ? ` <span class="note">(${esc(md(x.date))})</span>` : ""}${x.link ? ` <a class="more" href="${esc(x.link)}" target="_blank" rel="noopener">${x.story ? "Read the story →" : "More on ESPN →"}</a>` : ""} <span class="more">Details →</span></span></div>`;
    }).join("") + `<div class="note pad" style="margin:0">${src}</div>` : `<div class="empty">No injuries reported.<br><span class="note">${src}</span></div>`;
  };
  const saved = TEAM ? TEAM.injuries : null;
  show(saved, "Loading the latest report…");
  const d = window.Injuries ? await Injuries.ready : null;
  if(window.PlayerIndex) await PlayerIndex.ready;
  if(d && d.teams){
    drawInjHistory();
    show(d.teams[CODE] || [], `ESPN injury report as of ${new Date(d.at).toLocaleString("en-US", {month:"short", day:"numeric", hour:"numeric", minute:"2-digit"})}, refreshed hourly. Timetables come from the latest team and beat-writer news (e.g. "out 2–3 weeks", "re-evaluated in a week"); tap a player for the full details (updates, games he'll miss, who steps in), or his name for his page.`);
  } else {
    show(saved, TEAM && TEAM.injuriesAt ? `As of ${new Date(TEAM.injuriesAt).toLocaleString("en-US", {month:"short", day:"numeric", hour:"numeric", minute:"2-digit"})} (ESPN, saved during the morning update).` : "The injury report is saved during the morning update.");
  }
}

/* this season's injury history for the team (data/injury_log.json): who's been out, for how long, and who's back */
async function drawInjHistory(){
  if(!window.Injuries || !$('injHist')) return;
  const L = await Injuries.logReady(); const all = ((L && L.stints) || []).filter(s => s.team === CODE);
  if(!all.length){ $('injHist').innerHTML = ""; return; }
  const today = new Date().toISOString().slice(0, 10), dd = (a, b) => Math.max(0, Math.round((new Date(b + "T12:00:00") - new Date(a + "T12:00:00")) / 864e5));
  const back = all.filter(s => s.cleared).sort((a, b) => b.cleared.localeCompare(a.cleared));
  const byP = {}; all.forEach(s => { const k = s.name; (byP[k] = byP[k] || {name: k, days: 0, n: 0, open: false}); byP[k].days += dd(s.first, s.cleared || today); byP[k].n++; if(!s.cleared) byP[k].open = true; });
  const top = Object.values(byP).sort((a, b) => b.days - a.days);
  const lost = top.reduce((a, p) => a + p.days, 0);
  const what = s => [s.side, s.type, s.detail].filter(Boolean).join(" ") || "Injury";
  $('injHist').innerHTML = `<h3 class="injh">This season</h3>
    <div class="note pad" style="margin:0 0 6px">${top.length} player${top.length === 1 ? "" : "s"} on the report so far, ${lost} player-days in all. Days count from when he went on the report to when he came off it.</div>
    <div class="tw"><table><thead><tr><th class="l">Player</th><th>Days on the report</th><th>Times</th><th class="l">Now</th></tr></thead><tbody>
    ${top.slice(0, 12).map(p => `<tr class="injc" role="button" tabindex="0" data-inj="${esc(CODE)}|${esc(p.name)}"><td class="l">${window.playerLink ? window.playerLink(p.name, CODE) : esc(p.name)}</td><td>${p.days}</td><td>${p.n}</td><td class="l">${p.open ? `<span class="st out" style="font-size:11px">On the report</span>` : "Back"}</td></tr>`).join("")}</tbody></table></div>
    ${back.length ? `<h3 class="injh">Back from injury</h3>${back.slice(0, 6).map(s => `<div class="inj injc" role="button" tabindex="0" data-inj="${esc(CODE)}|${esc(s.name)}"><span class="who">${window.playerLink ? window.playerLink(s.name, CODE) : esc(s.name)}</span><span class="st oth" style="background:rgba(22,163,74,.14);color:#15803d">Back</span><span class="why">${esc(what(s))}. Out ${esc(Injuries.md(s.first))} to ${esc(Injuries.md(s.cleared))} (${dd(s.first, s.cleared)} days). <span class="more">Details →</span></span></div>`).join("")}` : ""}`;
}

/* ---------- cap sheet ---------- */
function zone(p){
  return p > RULES.apron2 ? ["Above the 2nd apron","var(--z-a2)"] : p > RULES.apron1 ? ["Above the 1st apron","var(--z-a1)"] : p > RULES.tax ? ["Over the tax","var(--z-tax)"] : p > RULES.cap ? ["Over the cap","var(--court)"] : ["Under the cap","var(--z-cap)"];
}
function drawCap(){
  const cts = contractsFor(CODE).sort((a,b) => b.salary - a.salary);
  if(!cts.length){ $('capBody').innerHTML = `<div class="card empty">No contracts found.</div>`; return; }
  const y0 = +RULES.season.slice(0,4);
  const seasons = [0,1,2,3,4].map(i => `${y0+i}-${String(y0+i+1).slice(2)}`);
  const pay = cts.reduce((t,c) => t + c.salary, 0);
  const [zl, zc] = zone(pay);
  const lo = 100e6, hi = Math.max(250e6, pay * 1.05), x = v => Math.max(0, Math.min(100, (v - lo) / (hi - lo) * 100));
  const zones = [[lo, RULES.cap, "var(--z-cap)"], [RULES.cap, RULES.tax, "var(--court)"], [RULES.tax, RULES.apron1, "var(--z-tax)"], [RULES.apron1, RULES.apron2, "var(--z-a1)"], [RULES.apron2, hi, "var(--z-a2)"]];
  const ticks = [[RULES.cap,"Cap","var(--z-cap)"],[RULES.tax,"Tax","var(--z-tax)"],[RULES.apron1,"1st apron","var(--z-a1)"],[RULES.apron2,"2nd apron","var(--z-a2)"]];
  const mle = pay <= RULES.cap ? `Room exception (${M(RULES.roomMle)}) once cap space is used`
    : pay <= RULES.apron1 ? `Non-taxpayer mid-level (${M(RULES.ntmle)}) and bi-annual (${M(RULES.bae)}), if not used yet`
    : pay <= RULES.apron2 ? `Taxpayer mid-level (${M(RULES.tmle)}) only` : "No mid-level exception";
  const tradeRule = pay > RULES.apron2 ? "Can't take back more salary than it sends, combine salaries, or send cash in trades."
    : pay > RULES.apron1 ? "Can't take back more salary than it sends out in a trade."
    : pay > RULES.cap ? "Can take back up to 125% (+$250K) or more of outgoing salary in trades." : "Can absorb salary into cap space.";
  const totals = seasons.map(s => cts.reduce((t,c) => { const y = c.years.find(v => v[0] === s); return t + (y ? num(y[1]) : 0); }, 0));
  const cell = (c, s) => { const y = c.years.find(v => v[0] === s); if(!y) return `<td></td>`;
    const o = y[2] ? `<i>${y[2] === "player option" ? "PO" : y[2] === "team option" ? "TO" : "ETO"}</i>` : "";
    return `<td class="${y[2] ? "opt" : ""}">${M(num(y[1]))}${o}</td>`; };
  $('capBody').innerHTML = `<div class="card pad">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap"><div><span class="note" style="margin:0">${RULES.season} payroll</span><div style="font:700 34px/1.1 'Barlow Condensed'">${M(pay)}</div></div><span class="pill" style="--c:${zc}">${zl}</span></div>
      <div class="meter"><div class="track">${zones.map(([a,b,c]) => `<div class="zone" style="left:${x(a)}%;width:${x(b)-x(a)}%;background:${c}"></div>`).join("")}</div>
        <div class="fill" style="width:${x(pay)}%;background:${zc}"></div>
        ${ticks.map(([v,l,c]) => `<div class="tick" style="left:calc(${x(v)}% - 1px);--c:${c}"><span>${l}</span></div>`).join("")}</div>
      <div class="capnums">
        <div><span>${pay <= RULES.cap ? "Cap space" : "Over the cap by"}</span><b>${M(Math.abs(RULES.cap - pay))}</b></div>
        <div><span>${pay <= RULES.tax ? "Under the tax by" : "Over the tax by"}</span><b>${M(Math.abs(RULES.tax - pay))}</b></div>
        <div><span>Room under 1st apron</span><b class="${pay > RULES.apron1 ? "neg" : ""}">${M(RULES.apron1 - pay)}</b></div>
        <div><span>Room under 2nd apron</span><b class="${pay > RULES.apron2 ? "neg" : ""}">${M(RULES.apron2 - pay)}</b></div>
      </div>
      <p class="note" style="margin:14px 0 0"><b>Exceptions:</b> ${mle}. <b>Trades:</b> ${tradeRule} <b>Roster:</b> ${cts.length} contracts (max ${RULES.rosterMax} standard). Dead money and cap holds aren't included. <a href="trade.html#${CODE}">Open in the Trade Machine →</a></p>
    </div>
    <div class="card" style="margin-top:12px"><div class="tw"><table>
      <thead><tr><th class="l">Player</th>${seasons.map(s => `<th>${s}</th>`).join("")}</tr></thead>
      <tbody>${cts.map(c => `<tr><td class="l nm"><a href="pe.html#/player/${encodeURIComponent(c.id)}">${esc(c.name)}</a></td>${seasons.map(s => cell(c, s)).join("")}</tr>`).join("")}
      <tr class="tot"><td class="l">Total</td>${totals.map(t => `<td>${t ? M(t) : ""}</td>`).join("")}</tr></tbody></table></div>
      <div class="note pad" style="margin:0">PO = player option, TO = team option, ETO = early termination option (shaded). Future years count only signed contracts, so they'll grow as the team re-signs or adds players.</div></div>`;
}

/* ---------- draft picks ---------- */
function drawPicks(){
  const p = TEAM && TEAM.picks;
  if(!p || !p.rows || !p.rows.length){ $('picksBody').innerHTML = `<div class="empty">Draft pick details are saved during the morning update.</div>`; return; }
  const heads = p.headers && p.headers.length === p.rows[0].length ? p.headers : ["Year"].concat(p.rows[0].slice(1).map((_, i) => i ? "" : "Picks"));
  $('picksBody').innerHTML = `<table><thead><tr>${heads.map((h, i) => `<th class="l">${esc(h)}</th>`).join("")}</tr></thead>
    <tbody>${p.rows.map(r => `<tr>${r.map((c, i) => i === 0 ? `<td class="l"><b>${esc(c)}</b></td>` : `<td class="pk ${pickClass(c)}">${pickGrades(c, +r[0], i)}${pickHtml(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>
    <div class="note pad" style="margin:0;border-top:1px solid var(--line)"><b>Pick grades</b> (A+ best, F worst), like 2K's prospect grades: where the original team is projected to finish (its record so far plus Pulse's odds for the rest of the season), how many years out the pick is (the further out, the closer to an average pick), protections that keep it from conveying, and swaps. A projected No. 1 pick is an A+, mid-first-rounders are B/C, late firsts C-/D+, second-rounders D or lower. Hover a grade for the details.</div>
    <div class="note pad" style="margin:0;border-top:1px solid var(--line)"><span class="pkkey own">Own</span> keeps its pick · <span class="pkkey gone">To …</span> traded away · <span class="pkkey cond">Swap / protected</span> depends on where picks land · <span class="pkkey frz">Frozen / forfeited</span> can't be traded or was taken away. Team codes are RealGM's (GOS = Warriors, SAN = Spurs, UTH = Jazz, PHL = 76ers).</div>
    ${TEAM.picksAt ? `<div class="note pad" style="margin:0">As of ${new Date(TEAM.picksAt).toLocaleDateString("en-US", {month:"short", day:"numeric", year:"numeric"})}. "Own" means the team keeps its own pick; "To XXX" means it was traded away.</div>` : ""}`;
}

/* one 2K-style grade badge per pick in a RealGM cell (picks.js: PickRights + PickGrade) */
function pickGrades(c, year, col){
  if(!window.PickRights || !window.PickGrade || !year) return "";
  const round = col === 2 ? 2 : 1;
  const cell = PickRights.cell(CODE, c);
  if(!cell.assets.length) return "";
  return `<div class="pk-grades">${cell.assets.map(a => {
    const g = PickGrade.gradeAsset(a, year, round);
    const who = a.orig === CODE ? "own" : a.orig;
    return `<span class="pk-g">${PickGrade.badge(g, a.text)}<small>${esc(who)}${a.range ? " " + esc(a.range) : ""}${a.swapWith ? " ⇄" + esc(a.swapWith) : ""}</small></span>`;
  }).join("")}</div>`;
}
function pickClass(c){
  const t = String(c).trim();
  if(/^(Frozen|Forfeited)/i.test(t)) return "frz";
  if(/^To [A-Z]{3}$/.test(t) || /^To [A-Z]{3}( \(via [^)]*\))?$/.test(t)) return "gone";
  if(/^Own$/i.test(t) || /^Own( \(via [^)]*\))?$/.test(t)) return "own";
  if(/^Own; /.test(t) && !/favorable|swap|if /i.test(t)) return "own";
  return "cond";
}
/* put each pick on its own line and make team codes easy to spot */
function pickHtml(c){
  return String(c).split(/;\s+(?![^()]*\))/).map(part => esc(part).replace(/\b(Own)\b/g, "<b>$1</b>")).join("<br>");
}

/* ---------- franchise history ---------- */
const TROPHY = `<svg viewBox="0 0 16 18" aria-hidden="true"><path fill="#f5c542" d="M4 1h8v5.2c0 2.3-1.6 4.2-3.3 4.6V13h2.3l.8 2H4.2l.8-2h2.3v-2.2C5.6 10.4 4 8.5 4 6.2z"/><path fill="none" stroke="#f5c542" stroke-width="1.2" d="M4 2.5H1.8v1.6c0 1.6 1 2.8 2.4 3M12 2.5h2.2v1.6c0 1.6-1 2.8-2.4 3"/><rect x="3.2" y="15.6" width="9.6" height="1.6" rx=".4" fill="#d9a72e"/></svg>`;
const nameThen = n => n.replace(/^(Minneapolis|Seattle|Philadelphia|Syracuse|Rochester|St\. Louis|Baltimore|Washington|New Jersey|Fort Wayne|Cincinnati|Kansas City|Vancouver|Buffalo|San Diego|New Orleans|Charlotte|Capital|San Francisco)\b.*$/, m => m);
const playerLink = (id, name) => id ? `<a href="pe.html#/player/${encodeURIComponent(id)}">${esc(name)}</a>` : esc(name);
const REC = [["pts","Points"],["trb","Rebounds"],["ast","Assists"],["stl","Steals"],["blk","Blocks"],["g","Games played"],["fg3","3-pointers made"]];
const recOpen = {};
function drawRecords(){
  const H = TEAM && TEAM.history;
  if(!H || !H.leaders || !Object.keys(H.leaders).length){ $('recBody').innerHTML = `<div class="card empty">Franchise records are added during the morning update (they take a run or two to collect the first time).</div>`; return; }
  const list = (rows, fmt, key) => {
    const n = recOpen[key] ? 25 : 10;
    return `<ol>${rows.slice(0, n).map((r, i) => `<li><span class="n">${i + 1}</span><span>${playerLink(r[0], r[1])}</span><span class="v">${fmt(r)}</span></li>`).join("")}</ol>${rows.length > 10 ? `<button class="more" data-more="${key}">${recOpen[key] ? "Show top 10" : `Show top ${Math.min(25, rows.length)}`}</button>` : ""}`;
  };
  const cards = REC.filter(([k]) => (H.leaders[k] || []).length).map(([k, label]) =>
    `<div class="card rec"><h3><span>${label}</span></h3>${list(H.leaders[k], r => r[2].toLocaleString(), k)}</div>`);
  const co = (H.coaches || []).filter(c => c[5] > 0);
  if(co.length){
    const rows = co.map(c => [null, `${c[1]} (${c[2] === c[3] ? c[2] - 1 + "-" + String(c[2]).slice(2) : `${c[2] - 1}-${String(c[3]).slice(2)}`})`, c[5], c]);
    cards.unshift(`<div class="card rec"><h3><span>Coach wins</span><span style="font-family:Inter;font-weight:500;text-transform:none;letter-spacing:0;font-size:11.5px">W-L · playoffs · titles</span></h3>${list(rows, r => `${r[3][5]}-${r[3][6]}<span class="then">${r[3][7] || r[3][8] ? ` ${r[3][7]}-${r[3][8]}` : ""}${r[3][9] ? ` · ${r[3][9]}🏆` : ""}</span>`, "coach")}</div>`);
  }
  $('recBody').innerHTML = `<div class="recs">${cards.join("")}</div>`;
  $('recBody').querySelectorAll('[data-more]').forEach(b => b.onclick = () => { recOpen[b.dataset.more] = !recOpen[b.dataset.more]; drawRecords(); });
}
const AW_ORDER = ["mvp","fmvp","dpoy","roy","smoy","mip","clutch_poy","coy","all_nba","all_defense","all_rookie","all_star","all_star_mvp",
  "ecf_mvp","wcf_mvp","ist_mvp","cpoy","player_of_the_seeding_games","hustle","sportsmanship","tmoy","citizenship","social_justice"];
let awPick = "all";
function drawAwards(){
  const H = TEAM && TEAM.history, list = (H && H.awards) || [];
  if(!H){ $('awBody').innerHTML = `<div class="card empty">Awards are added during the morning update (they take a run or two to collect the first time).</div>`; return; }
  if(!list.length){ $('awBody').innerHTML = `<div class="card empty">No season awards on record for this franchise yet.</div>`; return; }
  const label = a => a[2] === "all_nba" || a[2] === "all_defense" || a[2] === "all_rookie" ? `${a[3]} ${a[6] ? a[6] + " Team" : ""}` : a[3];
  const counts = {};
  list.forEach(a => counts[a[2]] = (counts[a[2]] || 0) + 1);
  const keys = AW_ORDER.filter(k => counts[k]);
  if(awPick !== "all" && !counts[awPick]) awPick = "all";
  const nameOf = k => (list.find(a => a[2] === k) || [])[3] || k;
  const rows = list.filter(a => awPick === "all" || a[2] === awPick);
  const T = TEAMS[CODE];
  $('awBody').innerHTML = `<div class="counts"><button class="count ${awPick === "all" ? "on" : ""}" data-aw="all">All<b>${list.length}</b></button>${keys.map(k => `<button class="count ${awPick === k ? "on" : ""}" data-aw="${k}">${esc(nameOf(k))}<b>${counts[k]}</b></button>`).join("")}</div>
    <div class="card"><div class="tw" style="max-height:560px;overflow:auto"><table><thead><tr><th class="l">Season</th><th class="l">Award</th><th class="l">Winner</th></tr></thead>
    <tbody>${rows.map(a => `<tr><td class="l">${esc(a[1])}</td><td class="l">${esc(label(a))}</td><td class="l nm">${a[2] === "coy" ? esc(a[5]) : playerLink(a[4], a[5])}${a[7] && a[7] !== (NBA_TO_BBR[CODE] || CODE) ? `<span class="then">${esc(a[7])}</span>` : ""}</td></tr>`).join("")}</tbody></table></div></div>`;
  $('awBody').querySelectorAll('[data-aw]').forEach(b => b.onclick = () => { awPick = b.dataset.aw; drawAwards(); });
}
const DH = {round:"all", decade:"all", q:""};
function drawDraftHistory(){
  const H = TEAM && TEAM.history, list = (H && H.draft) || [];
  if(!H || !list.length){ $('dhBody').innerHTML = `<div class="card empty">Draft history is added during the morning update (it takes a run or two to collect the first time).</div>`; return; }
  const decades = [...new Set(list.map(d => Math.floor(d[0] / 10) * 10))].sort((a,b) => b - a);
  const q = fold(DH.q);
  const rows = list.filter(d => (DH.round === "all" || (DH.round === "3" ? d[1] >= 3 : d[1] === +DH.round)) &&
    (DH.decade === "all" || Math.floor(d[0] / 10) * 10 === +DH.decade) && (!q || fold(d[4]).includes(q) || fold(d[5]).includes(q)));
  const top = list.filter(d => d[2] && d[2] <= 3).length, firsts = list.filter(d => d[1] === 1).length;
  if(!$('dhCtl')){
    $('dhBody').innerHTML = `<div class="ctl" id="dhCtl">
      <select id="dhRound"><option value="all">All rounds</option><option value="1">1st round</option><option value="2">2nd round</option><option value="3">3rd round or later</option></select>
      <select id="dhDecade"><option value="all">All years</option>${decades.map(d => `<option value="${d}">${d}s</option>`).join("")}</select>
      <input id="dhQ" type="search" placeholder="Search player or school"><span class="note" id="dhSum" style="margin:0"></span></div>
      <div class="card"><div class="tw" style="max-height:620px;overflow:auto" id="dhTable"></div></div>`;
    $('dhRound').onchange = e => { DH.round = e.target.value; drawDraftHistory(); };
    $('dhDecade').onchange = e => { DH.decade = e.target.value; drawDraftHistory(); };
    $('dhQ').oninput = e => { DH.q = e.target.value; drawDraftHistory(); };
  }
  $('dhSum').textContent = `${rows.length} of ${list.length} picks · ${firsts} first-rounders · ${top} top-3 picks`;
  $('dhTable').innerHTML = `<table><thead><tr><th class="l">Year</th><th>Round</th><th>Pick</th><th class="l">Player</th><th class="l">Drafted from</th><th>NBA games</th><th>NBA points</th></tr></thead>
    <tbody>${rows.map(d => `<tr><td class="l">${d[0]}</td><td>${d[1] || "—"}</td><td>${d[2] ? "#" + d[2] : "—"}</td>
      <td class="l nm">${playerLink(d[3], d[4])}${d[8] && d[8].length ? `<span class="then" title="Draft rights traded on draft night">→ ${esc(d[8].join(" → "))}</span>` : ""}</td>
      <td class="l">${esc(d[5] || "—")}</td><td>${d[6] ? d[6].toLocaleString() : "—"}</td><td>${d[7] ? d[7].toLocaleString() : "—"}</td></tr>`).join("") || `<tr><td colspan="7" class="empty">No picks match.</td></tr>`}</tbody></table>`;
}
function drawHistory(){ $('dhBody').innerHTML = ""; drawRecords(); drawAwards(); drawDraftHistory(); }

/* ---------- shot zones (zones.js) ---------- */
let shotSide = "off";
function drawShooting(){
  const el = $('shotBody');
  if(!el) return;
  const Z = TEAM && TEAM.zones, O = TEAM && TEAM.oppZones, L = TEAM && TEAM.leagueZones;
  if(!window.ZoneChart || !ZoneChart.has(Z) || !ZoneChart.has(L)){
    el.innerHTML = `<div class="empty">Shot zones show up after the next morning update (they're built from each game's play-by-play).</div>`; return;
  }
  const T = TEAMS[CODE] || {n: CODE};
  const off = shotSide === "off";
  const ranks = TEAM.zoneRanks && TEAM.zoneRanks[off ? "off" : "def"];
  el.innerHTML = `<div class="chips" style="justify-content:center;margin-bottom:10px">
      <button class="chip ${off ? "on" : ""}" data-side="off">${esc(T.n)} shots</button><button class="chip ${off ? "" : "on"}" data-side="def">Opponents' shots</button></div>
    ${ZoneChart.html(off ? Z : O, L, {label: off ? `${T.n} shot zones` : `Opponents' shot zones against ${T.n}`, who: off ? "the team's" : "opponents'", ranks, defense: !off})}
    <p class="note" style="margin:10px 0 0">${off ? "How well this team shoots from each zone." : `How well opponents shoot against ${esc(T.n)} from each zone. Red here means opponents are shooting well (bad for the defense); blue means the defense holds them under the league average.`} Rank = FG% rank / attempts rank among the 30 teams.</p>`;
  el.querySelectorAll("[data-side]").forEach(b => b.onclick = () => { shotSide = b.dataset.side; drawShooting(); });
}

/* ---------- team trades: every trade this season as a collapsible card (window.Traded from nav.js, data/trades.json via TradePop).
   Closed: the basics (date, who came and went). Open: the full deal, salary & cap (did anyone cross the tax or an apron),
   the team's results before and after, and the ripple effect: any stat for every player before and after the trade,
   including the players who left (their numbers with the new team). ---------- */
let PREVSEASON = null;
const RIP = {}, TF = {};
async function loadPrevSeason(){
  if(PREVSEASON) return PREVSEASON;
  const y = +String((LEAGUE && LEAGUE.season) || "").slice(0, 4);
  PREVSEASON = (y && await getJSON(`data/season-${y}.json`)) || {players: []};
  return PREVSEASON;
}
const teamFile = c => c === CODE ? Promise.resolve(TEAM) : (TF[c] || (TF[c] = getJSON(`data/teams/${c}.json`)));
const tmd = d => new Date(d + "T12:00:00Z").toLocaleDateString("en-US", {month: "short", day: "numeric", year: "numeric", timeZone: "UTC"});
const tbadge = c => window.teamBadge ? `<img class="trd-lg" src="${teamBadge(c)}" alt="${esc(c)}">` : "";
const tnm = c => (TEAMS[c] && TEAMS[c].n) || c;
const RSTATS = [["min", "Minutes"], ["pts", "Points"], ["reb", "Rebounds"], ["ast", "Assists"], ["stl", "Steals"], ["blk", "Blocks"], ["tov", "Turnovers"],
  ["fg", "FG%"], ["fg3", "3P%"], ["ft", "FT%"], ["pm", "Plus-minus"], ["pulse", "Pulse"], ["gp", "Games"]];
const RPCT = {fg: [9, 10], fg3: [11, 12], ft: [13, 14]};
function tot(games){ const t = Array(17).fill(0); games.forEach(x => x.forEach((v, i) => { if(i) t[i] += +v || 0; })); return t; }
function statOf(k, t, n, N){
  if(k === "gp") return n;
  if(!n) return null;
  if(RPCT[k]){ const [a, b] = RPCT[k]; return t[b] >= Math.max(3, n) ? t[a] / t[b] * 100 : null; }
  if(k === "pulse") return t[1] >= 20 ? (t[2] + 2 * t[3] + 2 * (t[4] + t[5]) + 4 * t[6] + t[7] - 4 * t[8]) / t[1] : null;
  if(k === "pm" && t.noPm) return null;
  const v = {min: t[1], pts: t[2], reb: t[4] + t[5], ast: t[3], stl: t[6], blk: t[7], tov: t[8], pm: t[15]}[k];
  return v / (N || n);
}
const fmtStat = (k, v) => v == null ? "—" : k === "gp" ? String(v) : k === "pulse" ? v.toFixed(3) : RPCT[k] ? v.toFixed(1) + "%" : k === "pm" ? (v > 0 ? "+" : "") + v.toFixed(1) : v.toFixed(1);
const gamesOf = c => ((LEAGUE && LEAGUE.games) || []).filter(g => g[2] === c || g[3] === c);
function seasonRow(name, code){   // last season's line from season-YYYY.json, as a totals array like tot()
  const bbr = NBA_TO_BBR[code] || code, k = fold(name), rows = ((PREVSEASON && PREVSEASON.players) || []).filter(p => fold(p.name) === k);
  const p = rows.find(r => r.team === bbr) || rows.find(r => r.team === "TOT") || rows[0];
  if(!p) return null;
  const t = [0, p.mp || 0, p.pts || 0, p.ast || 0, p.drb || 0, p.orb || 0, p.stl || 0, p.blk || 0, p.tov || 0, p.fg || 0, p.fga || 0, p.fg3 || 0, p.fg3a || 0, p.ft || 0, p.fta || 0, 0, p.gs || 0];
  t.noPm = true; return {t, n: p.g || 0, team: p.team};
}
function tradeMoves(id){
  const out = [];
  Object.entries(TRADED_ALL()).forEach(([pid, l]) => l.forEach(x => { if(x[3] === id) out.push({pid, name: x[4], from: x[1], to: x[2]}); }));
  return out;
}
/* cap: payroll today from contracts.json, and before the trade = today − salary that came in + salary that went out */
const salOfPid = pid => { const c = CT && CT.players && CT.players[pid]; const y = c && (c.years || []).find(r => r[0] === RULES.season); return y ? num(y[1]) : 0; };
const payrollOf = c => { const bbr = NBA_TO_BBR[c] || c; return Object.values((CT && CT.players) || {}).filter(p => p.team === bbr).reduce((a, p) => { const y = (p.years || []).find(r => r[0] === RULES.season); return a + (y ? num(y[1]) : 0); }, 0); };
const LINES = () => [["Under the cap", 0], ["Over the cap", RULES.cap], ["Over the tax", RULES.tax], ["Over the 1st apron", RULES.apron1], ["Over the 2nd apron", RULES.apron2]];
const lineIx = v => { const L = LINES(); let i = 0; L.forEach((l, k) => { if(v >= l[1]) i = k; }); return i; };
const mny = n => (n < 0 ? "−" : "") + "$" + (Math.abs(n) / 1e6).toFixed(1) + "M";
function capHtml(t, moves){
  if(!RULES || !CT) return `<p class="note">Cap numbers load with the contracts file.</p>`;
  const rows = t.teams.map(c => {
    const out = moves.filter(m => m.from === c), inn = moves.filter(m => m.to === c);
    const so = out.reduce((a, m) => a + salOfPid(m.pid), 0), si = inn.reduce((a, m) => a + salOfPid(m.pid), 0);
    const now = payrollOf(c), before = now - si + so, i0 = lineIx(before), i1 = lineIx(now), L = LINES();
    const moved = i1 > i0 ? `<b class="neg">Went over: ${esc(L[i1][0].replace(/^Over the /, "the "))}</b>` : i1 < i0 ? `<b class="pos">Got under ${esc(L[i0][0].replace(/^Over the /, "the "))}</b>` : `Stayed ${esc(L[i1][0].toLowerCase())}`;
    const room = now < RULES.tax ? `${mny(RULES.tax - now)} under the tax` : now < RULES.apron1 ? `${mny(RULES.apron1 - now)} under the 1st apron` : now < RULES.apron2 ? `${mny(RULES.apron2 - now)} under the 2nd apron` : `${mny(now - RULES.apron2)} over the 2nd apron`;
    const net = si - so;
    return `<div class="tt-cap${c === CODE ? " me" : ""}"><div class="h">${tbadge(c)} <b>${esc(tnm(c))}</b></div>
      <div class="kv"><span>Salary out</span><b>${mny(so)}</b></div><div class="kv"><span>Salary in</span><b>${mny(si)}</b></div>
      <div class="kv"><span>Net</span><b class="${net > 0 ? "neg" : net < 0 ? "pos" : ""}">${net >= 0 ? "+" : "−"}${mny(Math.abs(net))}</b></div>
      <div class="kv"><span>Payroll</span><b>${mny(before)} → ${mny(now)}</b></div>
      <div class="ln">${moved}</div><div class="note" style="margin:2px 0 0">${room}</div></div>`;
  }).join("");
  return `<div class="tt-caps">${rows}</div>
    <p class="note" style="margin:8px 0 0">This season's salaries (${esc(RULES.season)}): cap ${mny(RULES.cap)}, tax ${mny(RULES.tax)}, 1st apron ${mny(RULES.apron1)}, 2nd apron ${mny(RULES.apron2)}. "Payroll now" is every contract on the books today; "before" takes this trade back out, so later signings and trades count in both. Cash and draft picks aren't salary.</p>`;
}
function resultsHtml(date){
  const g = gamesOf(CODE).filter(x => x[7] === 1 || (x[4] && x[5])), side = (x, a) => (x[2] === CODE) === a ? x[4][0] : x[5][0];
  const sum = list => { const w = list.filter(x => side(x, true) > side(x, false)).length, pf = list.reduce((a, x) => a + side(x, true), 0), pa = list.reduce((a, x) => a + side(x, false), 0);
    return {n: list.length, w, l: list.length - w, pf: list.length ? pf / list.length : 0, pa: list.length ? pa / list.length : 0}; };
  const b = sum(g.filter(x => x[1] < date)), a = sum(g.filter(x => x[1] >= date));
  const cell = (lab, r) => r.n ? `<div><span>${lab}</span><b>${r.w}–${r.l}</b><small>${r.pf.toFixed(1)} scored · ${r.pa.toFixed(1)} allowed · ${(r.pf - r.pa) >= 0 ? "+" : "−"}${Math.abs(r.pf - r.pa).toFixed(1)} a game</small></div>` : `<div><span>${lab}</span><b>—</b><small>${lab === "Before" ? "the trade came before the season" : "no games yet"}</small></div>`;
  return `<div class="rip-sum">${cell("Before", b)}${cell("Since", a)}</div>`;
}
async function rippleRows(t, moves, date){
  const ins = new Map(moves.filter(m => m.to === CODE).map(m => [fold(m.name), m])), outs = new Map(moves.filter(m => m.from === CODE).map(m => [fold(m.name), m]));
  const inSeason = gamesOf(CODE).some(g => g[1] < date);
  if(!inSeason) await loadPrevSeason();
  const files = {}; await Promise.all(t.teams.map(async c => { files[c] = await teamFile(c); }));
  const dateOf = new Map(((LEAGUE && LEAGUE.games) || []).map(g => [g[0], g[1]]));
  const nGames = (c, before) => gamesOf(c).filter(g => before ? g[1] < date : g[1] >= date).length;
  const split = (file, name, before) => { const p = Object.values((file && file.players) || {}).find(x => fold(x.n) === fold(name)); const gs = p ? p.g.filter(x => { const d = dateOf.get(x[0]); return d && (before ? d < date : d >= date); }) : []; return {t: tot(gs), n: gs.length}; };
  const rows = [];
  const names = new Set(Object.values((TEAM && TEAM.players) || {}).map(p => p.n)); ins.forEach(m => names.add(m.name)); outs.forEach(m => names.add(m.name));
  names.forEach(name => {
    const k = fold(name), mi = ins.get(k), mo = outs.get(k);
    const beforeTeam = mi ? mi.from : CODE, afterTeam = mo ? mo.to : CODE;
    let B, NB;
    if(inSeason){ B = files[beforeTeam] ? split(files[beforeTeam], name, true) : {t: tot([]), n: 0}; NB = nGames(beforeTeam, true); }
    else { const r = seasonRow(name, beforeTeam); B = r || {t: tot([]), n: 0}; NB = 82; }
    const A = files[afterTeam] ? split(files[afterTeam], name, false) : {t: tot([]), n: 0}, NA = nGames(afterTeam, false);
    if(!B.n && !A.n) return;
    rows.push({name, tag: mi ? "in" : mo ? "out" : null, beforeTeam, afterTeam, B, A, NB, NA});
  });
  return {rows, inSeason};
}
function rippleTable(id, R){
  const st = RIP[id] || (RIP[id] = {stat: "min", mode: "game"}), k = st.stat;
  const perTeam = st.mode === "team" && !RPCT[k] && !["pulse", "gp"].includes(k);
  const list = R.rows.map(r => { const b = statOf(k, r.B.t, r.B.n, perTeam ? r.NB : 0), a = statOf(k, r.A.t, r.A.n, perTeam ? r.NA : 0); return Object.assign({b, a, d: a != null && b != null ? a - b : null}, r); })
    .filter(r => (r.b != null || r.a != null) && (r.tag || (r.B.n && r.A.n) || k === "gp" || k === "min"));
  const lowBad = k === "tov";
  list.sort((x, y) => (y.tag ? 1 : 0) - (x.tag ? 1 : 0) || Math.abs(y.d || 0) - Math.abs(x.d || 0));
  const max = Math.max(1e-9, ...list.map(r => Math.abs(r.d || 0)));
  const where = (r, bef) => { const c = bef ? r.beforeTeam : r.afterTeam, n = bef ? r.B.n : r.A.n; return c !== CODE ? ` <small class="note">${n ? "with" : "no games yet with"} ${esc(c)}</small>` : n ? "" : ` <small class="note">no games yet</small>`; };
  return `<div class="rip-ctl"><label>Stat <select data-ripstat="${esc(id)}">${RSTATS.map(([v, l]) => `<option value="${v}"${v === k ? " selected" : ""}>${l}</option>`).join("")}</select></label>
      ${RPCT[k] || k === "pulse" || k === "gp" ? "" : `<div class="chips"><button class="chip ${st.mode === "game" ? "on" : ""}" data-ripmode="${esc(id)}|game">Per game played</button><button class="chip ${st.mode === "team" ? "on" : ""}" data-ripmode="${esc(id)}|team">Per team game</button></div>`}</div>
    <div class="tw"><table><thead><tr><th class="l">Player</th><th>${R.inSeason ? "Before" : "Last season"}</th><th>G</th><th>${R.inSeason ? "After" : "This season"}</th><th>G</th><th>Change</th><th class="l" style="width:30%"></th></tr></thead><tbody>
    ${list.slice(0, 22).map(r => { const good = r.d == null ? 0 : (lowBad ? -r.d : r.d);
      return `<tr><td class="l nm">${window.playerLink ? window.playerLink(r.name, r.afterTeam) : esc(r.name)}${r.tag === "in" ? ` <span class="tag" style="color:var(--good)">ACQUIRED</span>` : r.tag === "out" ? ` <span class="tag" style="color:var(--bad)">TRADED AWAY</span>` : ""}</td>
        <td>${r.B.n || !r.tag ? fmtStat(k, r.b) : ""}${r.tag ? where(r, true) : ""}</td><td class="note">${r.B.n || ""}</td><td>${r.A.n || !r.tag ? fmtStat(k, r.a) : ""}${r.tag ? where(r, false) : ""}</td><td class="note">${r.A.n || ""}</td>
        <td class="${good > 0 ? "pos" : good < 0 ? "neg" : ""}"><b>${r.d == null ? "—" : (r.d > 0 ? "+" : r.d < 0 ? "−" : "") + fmtStat(k === "pm" ? "pts" : k, Math.abs(r.d))}</b></td>
        <td class="l">${r.d == null ? "" : `<div class="rip-bar"><i class="${good >= 0 ? "up" : "dn"}" style="${r.d >= 0 ? "left:50%" : "right:50%"};width:${(Math.abs(r.d) / max * 50).toFixed(1)}%"></i></div>`}</td></tr>`; }).join("")}</tbody></table></div>
    <p class="note" style="margin:8px 0 0">${R.inSeason ? "Before = his games this season before the trade (with his old team if he came over in it); after = since the trade (with his new team if he left)." : "The trade was in the offseason, so “last season” is his full 2025-26 line (with his old team) and “this season” is since."} ${perTeam ? "Per team game: games he missed count as zero, so injuries and lost rotation spots show up." : "Per game he played."} Players in the deal first, then the biggest changes. ${RPCT[k] ? "Shooting needs a few attempts on each side." : ""}</p>`;
}
async function openTrade(det){
  const id = det.dataset.trade, body = det.querySelector(".ttb");
  if(body.dataset.done) return;
  body.dataset.done = "1";
  body.innerHTML = `<p class="note">Loading the trade…</p>`;
  if(window.TradePop) await TradePop.ready;
  const t = (window.TradePop && TradePop.byId(id)) || null, e = ((window.Traded && Traded.team(CODE)) || []).find(x => x[1] === id);
  const date = (t && t.date) || (e && e[0]), teams = (t && t.teams) || [CODE, ...((e && e[2]) || [])];
  const tt = {id, date, teams: [CODE, ...teams.filter(c => c !== CODE)], rows: (t && t.rows) || []};
  const moves = tradeMoves(id);
  const R = await rippleRows(tt, moves, date);
  det._R = R;
  const deal = tt.rows.length ? tt.rows.map(r => `<div class="tt-row">${tbadge(r[1])}<div><b>${esc(tnm(r[1]))}:</b> ${esc(r[2])}</div></div>`).join("") : `<p class="note">The full deal text is added during the next update.</p>`;
  const news = ((t && t.news) || []).slice(0, 3);
  body.innerHTML = `<div class="tt-jump"><a href="#" data-ttgo="deal">The deal</a><a href="#" data-ttgo="cap">Salary &amp; cap</a><a href="#" data-ttgo="res">Results</a><a href="#" data-ttgo="rip">Ripple effect</a></div>
    <div class="tt-sec" data-tts="deal"><h3>The deal</h3>${deal}
      ${t ? `<div class="row" style="margin-top:8px"><button class="chip" data-ttpop="${esc(id)}">Open the full trade card (players, pick grades, news) →</button></div>` : ""}
      ${news.length ? `<ul class="tt-news">${news.map(n => `<li><a href="${esc(n.u)}" target="_blank" rel="noopener">${esc(n.h)}</a></li>`).join("")}</ul>` : ""}</div>
    <div class="tt-sec" data-tts="cap"><h3>Salary &amp; cap</h3>${capHtml(tt, moves)}</div>
    <div class="tt-sec" data-tts="res"><h3>${esc(tnm(CODE))} before and after</h3>${resultsHtml(date)}</div>
    <div class="tt-sec" data-tts="rip"><h3>Ripple effect</h3><div class="ttrip">${rippleTable(id, R)}</div></div>`;
}
async function drawRipple(){
  const el = $('rippleBody');
  if(window.TradePop && el) await TradePop.ready;
  if(!el) return;
  const list = (window.Traded && Traded.team(CODE)) || [];
  const T = TEAMS[CODE] || {n: CODE};
  if(!list.length){ el.innerHTML = `<div class="card empty">${esc(T.n)} haven't made a trade this season.</div>`; return; }
  const trades = list.slice().sort((x, y) => x[0] < y[0] ? 1 : x[0] > y[0] ? -1 : 0);
  el.innerHTML = trades.map((e, i) => {
    const moves = tradeMoves(e[1]), got = moves.filter(m => m.to === CODE), sent = moves.filter(m => m.from === CODE);
    const names = l => l.map(m => esc(m.name)).join(", ");
    return `<details class="card tt" data-trade="${esc(e[1])}"${i === 0 && trades.length === 1 ? " open" : ""}>
      <summary><span class="tt-d">${esc(tmd(e[0]))}</span><span class="tt-w">with ${(e[2] || []).map(c => `${tbadge(c)}${esc(c)}`).join(" ") || "?"}</span>
        <span class="tt-m">${(() => { const t = window.TradePop && TradePop.byId(e[1]), r = t && (t.rows || []).find(x => x[1] === CODE); const txt = r ? (String(r[2]).match(/[^.]+(?:\.(?!\s*[A-Z][a-z]+\s)|$)[^.]*\.?/g) || [r[2]]).map(x => x.trim()).filter(x => /acquir|traded|exchange/i.test(x)).join(" ") : ""; return txt ? `<span class="tt-txt">${esc(txt)}</span>` : ""; })()}${got.length ? `<span><b class="pos">Got</b> ${names(got)}</span>` : ""}${sent.length ? `<span><b class="neg">Sent</b> ${names(sent)}</span>` : ""}${(() => { const t = window.TradePop && TradePop.byId(e[1]); if(t && (t.rows || []).some(x => x[1] === CODE)) return ""; return !got.length && !sent.length ? `<span class="note">Picks, rights or cash only</span>` : !got.length || !sent.length ? `<span class="note">for picks or cash</span>` : ""; })()}</span>
        <span class="tt-chev" aria-hidden="true">▾</span></summary>
      <div class="ttb"></div></details>`; }).join("");
  el.querySelectorAll("details.tt").forEach(d => { d.addEventListener("toggle", () => { if(d.open) openTrade(d); }); if(d.open) openTrade(d); });
}
document.addEventListener("change", ev => {
  const s = ev.target.closest && ev.target.closest("[data-ripstat]"); if(!s) return;
  const id = s.dataset.ripstat, det = s.closest("details.tt"); (RIP[id] = RIP[id] || {mode: "game"}).stat = s.value;
  det.querySelector(".ttrip").innerHTML = rippleTable(id, det._R);
});
document.addEventListener("click", ev => {
  const m = ev.target.closest && ev.target.closest("[data-ripmode]");
  if(m){ const [id, mode] = m.dataset.ripmode.split("|"), det = m.closest("details.tt"); (RIP[id] = RIP[id] || {stat: "min"}).mode = mode; det.querySelector(".ttrip").innerHTML = rippleTable(id, det._R); return; }
  const g = ev.target.closest && ev.target.closest("[data-ttgo]");
  if(g){ ev.preventDefault(); const sec = g.closest(".ttb").querySelector(`[data-tts="${g.dataset.ttgo}"]`); if(sec) sec.scrollIntoView({behavior: "smooth", block: "start"}); return; }
  const p = ev.target.closest && ev.target.closest("[data-ttpop]");
  if(p && window.TradePop){ const t = TradePop.byId(p.dataset.ttpop); if(t) TradePop.open(t.rows[0] ? [t.rows[0][0], t.rows[0][1], t.rows[0][2], "trade"] : null); }
});
const TRADED_ALL = () => { try{ return window.Traded && Traded._all ? Traded._all() : {}; }catch(_){ return {}; } };

/* ---------- defense: ball pressure + opponents' shot profile ---------- */
const PRESS = [
  ["tovPct", "Turnovers forced", "per 100 opponent possessions", v => v.toFixed(1)],
  ["stlPct", "Steals", "per 100 opponent possessions", v => v.toFixed(1)],
  ["live", "Live-ball share", "forced turnovers that are steals", v => Math.round(v * 100) + "%"],
  ["pass", "Steals jumping passes", "share of steals off bad passes (the rest are strips)", v => Math.round(v * 100) + "%"],
  ["strip", "Strips", "lost-ball steals per game", v => v.toFixed(1)],
  ["stealPts", "Points off steals", "scored within 7 seconds of a steal, per game", v => v.toFixed(1)],
  ["press", "Press violations forced", "backcourt, 8-second, 5-second, inbound, per game", v => v.toFixed(2)],
  ["shotClock", "Shot-clock violations forced", "per game", v => v.toFixed(2)],
  ["charges", "Charges drawn", "per game", v => v.toFixed(2)],
  ["fouls", "Fouls committed", "per 100 opponent possessions: the cost of gambling", v => v.toFixed(1)],
  ["shootFouls", "Shooting fouls", "per 100 opponent possessions", v => v.toFixed(1)],
];
const PROF = [["rim", "At the rim"], ["paint", "Rest of the paint"], ["mid", "Mid-range"], ["c3", "Corner 3"], ["ab3", "Above-the-break 3"]];
const rkCls = r => r <= 5 ? "top" : r >= 26 ? "bot" : "";
const ordN = n => n + (n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th","st","nd","rd"][n % 10] || "th");
function drawDefense(){
  const el = $('defBody');
  if(!el) return;
  const P = TEAM && TEAM.pressure, O = TEAM && TEAM.oppProfile;
  const T = TEAMS[CODE] || {n: CODE};
  const press = P && P.stats ? `<div class="card grp"><h3>Ball pressure &amp; gambling</h3>
      ${PRESS.map(([k, label, how, f]) => { const s = P.stats[k]; if(!s) return "";
        return `<div class="srow"><div class="k">${label}<small>${how}</small></div>
          <div class="v">${f(s[0])}<span class="lg">avg ${f(s[2])}</span></div>
          <div class="rk ${rkCls(s[1])}" title="${ordN(s[1])} of 30${k === "fouls" || k === "shootFouls" ? " (1st = fewest)" : ""}">${ordN(s[1])}</div></div>`; }).join("")}
      <div class="srow" style="grid-template-columns:1fr"><div class="k" style="font-size:12px">${P.games} games. Green = top 5 in the league, red = bottom 5. A team that ranks high on steals and high on fouls is gambling; high on steals and low on fouls is pressure that pays.</div></div>
    </div>` : `<div class="card grp"><h3>Ball pressure &amp; gambling</h3><div class="empty">Ball-pressure numbers show up after the next morning update (they're counted from each game's play-by-play).</div></div>`;
  let prof;
  if(O && O.rim){
    const max = Math.max(...PROF.map(([k]) => Math.max(O[k][2], O[k][6])));
    prof = `<div class="card grp"><h3>Where opponents shoot against ${esc(T.n)}</h3>
      <div class="prof h"><div>Area</div><div>Share of shots</div><div class="n">Share</div><div class="n">FG%</div></div>
      ${PROF.map(([k, label]) => { const r = O[k];
        const sh = (r[2] * 100).toFixed(1), lsh = (r[6] * 100).toFixed(1);
        const d = (r[3] - r[7]) * 100;
        return `<div class="prof"><div>${label}<small style="display:block;font-size:10.5px;color:var(--dim)">${r[1]}/${r[0]} made</small></div>
          <div class="bar" title="Black tick = league average ${lsh}%"><i style="width:${(r[2] / max * 100).toFixed(1)}%"></i><b style="left:${(r[6] / max * 100).toFixed(1)}%"></b></div>
          <div class="n">${sh}%<small>${ordN(r[4])} fewest</small></div>
          <div class="n"><span class="${d < -1 ? "pos" : d > 1 ? "neg" : ""}">${(r[3] * 100).toFixed(1)}%</span><small>lg ${(r[7] * 100).toFixed(1)}% · ${ordN(r[5])}</small></div></div>`; }).join("")}
      <div class="srow" style="grid-template-columns:1fr"><div class="k" style="font-size:12px">Share = the part of opponents' shots taken from that area (bar; the tick is the league average). Rank "1st fewest" means no defense gives up a smaller share from there. FG% in green is below the league average (good for the defense), red above; its rank is 1st = lowest allowed.</div></div>
    </div>`;
  } else prof = `<div class="card grp"><h3>Where opponents shoot</h3><div class="empty">Shows up after the next morning update.</div></div>`;
  el.innerHTML = press + prof;
}

/* ---------- page ---------- */
function drawData(){ drawStats(); drawLineups(); drawRoster(); }
async function show(code){
  CODE = code;
  drawPicker();
  TEAM = null;
  drawHero();
  const [t] = await Promise.all([getJSON(`data/teams/${code}.json`)]);
  if(CODE !== code) return;
  TEAM = t;
  pick = [];
  if(window.PickGrade) PickGrade.ready.then(() => { if(CODE === code) drawPicks(); });
  if(window.Traded) Traded.ready.then(() => { if(CODE === code) drawRipple(); });
  drawHero(); drawFilters(); drawData(); drawShooting(); drawDefense(); drawRipple(); drawSchedule(); drawInjuries(); drawCap(); drawPicks(); drawHistory();
  if(window.Ticker) Ticker.show(code);
  $('asof').textContent = TEAM && TEAM.at ? `Team data updated ${new Date(TEAM.at).toLocaleString("en-US", {month:"short", day:"numeric", hour:"numeric", minute:"2-digit"})}.` : "";
}
function codeFromHash(){
  const h = location.hash.replace("#", "").toUpperCase();
  const c = BBR_TO_NBA[h] || h;
  return TEAMS[c] ? c : null;
}
function tabs(){
  const links = [...document.querySelectorAll('#tabs a')];
  links.forEach(a => a.onclick = e => { e.preventDefault(); document.querySelector(a.getAttribute("href")).scrollIntoView({behavior:"smooth"}); });
  const secs = [...document.querySelectorAll("section")];
  const mark = () => {
    let cur = secs[0];
    secs.forEach(s => { if(s.getBoundingClientRect().top < 140) cur = s; });
    if(window.innerHeight + window.scrollY >= document.body.scrollHeight - 4) cur = secs[secs.length - 1];
    links.forEach(a => a.classList.toggle("on", a.getAttribute("href") === "#" + cur.id));
  };
  window.addEventListener("scroll", mark, {passive:true});
  mark();
}
async function init(){
  tabs();
  [LEAGUE, SCHED, CT, BIOS, STATS] = await Promise.all([getJSON("data/teams/league.json"), getJSON("data/schedule.json"), getJSON("data/contracts.json"), getJSON("data/bios.json").then(b => b && b.players), getJSON("data/stats.json")]);
  records();
  window.addEventListener("hashchange", () => { const c = codeFromHash(); if(c && c !== CODE){ window.scrollTo(0, 0); show(c); } });
  let start = codeFromHash();
  if(!start){ try{ start = localStorage.getItem("team"); }catch(_){} }
  if(!TEAMS[start]) start = "OKC";
  history.replaceState(null, "", "#" + start);
  show(start);
  window.addEventListener("hashchange", () => { try{ localStorage.setItem("team", codeFromHash()); }catch(_){} });
}
window.TeamPage = {filtered: c => filtered(c), summarize, F};
init();
})();
