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
const logo = c => TEAMS[c] ? `https://cdn.nba.com/logos/nba/${TEAMS[c].id}/primary/L/logo.svg` : "";
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
      <div class="record">${r ? `${r.w}-${r.l}` : "0-0"}<small>${cr ? `${ord(cr)} in the ${CONF_OF[CODE]}` : (LEAGUE ? "season hasn't started" : "")}</small></div></div>
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
  const badge = k => rk[k] ? `<span class="rk ${rk[k] <= 10 ? "top" : rk[k] > 20 ? "bot" : ""}" title="${ord(rk[k])} of ${R.teams}">${ord(rk[k])}</span>` : `<span class="rk">—</span>`;
  const tile = (k, label, fmt, tip) => `<div class="card tile"${tip ? ` title="${esc(tip)}"` : ""}><div class="k">${label}</div><div class="v">${fmt(s[k])}</div><div class="r">${rk[k] ? `${ord(rk[k])} in the NBA` : ""}</div></div>`;
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

/* ---------- injuries ---------- */
async function drawInjuries(){
  const show = (list, src) => {
    $('injBody').innerHTML = list && list.length ? list.map(x => {
      const s = String(x.status || "").toLowerCase();
      const cls = s.includes("out") ? "out" : (s.includes("day") || s.includes("question") || s.includes("doubt") || s.includes("probable")) ? "dtd" : "oth";
      const what = [x.side, x.type, x.detail].filter(Boolean).join(" ");
      return `<div class="inj"><span class="who">${esc(x.name)}${x.pos ? ` <span class="note">${esc(x.pos)}</span>` : ""}</span><span class="st ${cls}">${esc(x.status || "")}</span>
        <span class="why">${what ? esc(what) + ". " : ""}${esc(x.note || "")}${x.ret ? ` Expected back around ${esc(new Date(x.ret + "T12:00:00Z").toLocaleDateString("en-US", {month:"short", day:"numeric"}))}.` : ""}</span></div>`;
    }).join("") + `<div class="note pad" style="margin:0">${src}</div>` : `<div class="empty">No injuries reported.<br><span class="note">${src}</span></div>`;
  };
  const saved = TEAM ? TEAM.injuries : null;
  show(saved, TEAM && TEAM.injuriesAt ? `As of ${new Date(TEAM.injuriesAt).toLocaleString("en-US", {month:"short", day:"numeric", hour:"numeric", minute:"2-digit"})} (ESPN). Checking for updates…` : "Checking ESPN…");
  try{
    const r = await fetch("https://site.api.espn.com/apis/site/v2/sports/basketball/nba/injuries");
    const d = await r.json();
    const nick = TEAMS[CODE].n.split(" ").pop().toLowerCase();
    const t = (d.injuries || []).find(x => String(x.displayName || "").toLowerCase().includes(nick === "blazers" ? "blazers" : nick));
    const list = ((t && t.injuries) || []).map(inj => { const a = inj.athlete || {}, det = inj.details || {};
      return {name:a.displayName, pos:(a.position || {}).abbreviation, status:inj.status, type:det.type, detail:det.detail, side:det.side, ret:(det.returnDate || "").slice(0,10), note:inj.shortComment}; });
    show(list, "Live from ESPN.");
  }catch(_){
    show(saved, TEAM && TEAM.injuriesAt ? `As of ${new Date(TEAM.injuriesAt).toLocaleString("en-US", {month:"short", day:"numeric", hour:"numeric", minute:"2-digit"})} (ESPN, saved during the morning update).` : "The injury report is saved during the morning update.");
  }
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
    <tbody>${p.rows.map(r => `<tr>${r.map((c, i) => i === 0 ? `<td class="l"><b>${esc(c)}</b></td>` : `<td class="pk ${pickClass(c)}">${pickHtml(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>
    <div class="note pad" style="margin:0;border-top:1px solid var(--line)"><span class="pkkey own">Own</span> keeps its pick · <span class="pkkey gone">To …</span> traded away · <span class="pkkey cond">Swap / protected</span> depends on where picks land · <span class="pkkey frz">Frozen / forfeited</span> can't be traded or was taken away. Team codes are RealGM's (GOS = Warriors, SAN = Spurs, UTH = Jazz, PHL = 76ers).</div>
    ${TEAM.picksAt ? `<div class="note pad" style="margin:0">As of ${new Date(TEAM.picksAt).toLocaleDateString("en-US", {month:"short", day:"numeric", year:"numeric"})}. "Own" means the team keeps its own pick; "To XXX" means it was traded away.</div>` : ""}`;
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
  drawHero(); drawFilters(); drawData(); drawShooting(); drawSchedule(); drawInjuries(); drawCap(); drawPicks(); drawHistory();
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
