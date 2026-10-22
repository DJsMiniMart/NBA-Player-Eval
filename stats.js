/* Stats page: every team's stats (sortable, with filters), league leaders and a sortable table of every player.
   Reads data/teams/league.json (team box score of every game) and data/teams/players.json (season totals per
   player), both built every morning by build_teams.py from the game feed. */
(function(){
"use strict";
const TEAMS = (window.PlayerPage && PlayerPage.TEAMS) || {};
const EAST = ["ATL","BOS","BKN","CHA","CHI","CLE","DET","IND","MIA","MIL","NYK","ORL","PHI","TOR","WAS"];
const COLS = ["pts","fgm","fga","fg3m","fg3a","ftm","fta","oreb","dreb","ast","stl","blk","tov","pf","paint","fast","second","offTov","bench"];
const I = Object.fromEntries(COLS.map((c,i) => [c, i]));
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fold = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, "").replace(/[^a-z]/g, "");
const logo = c => TEAMS[c] ? `https://cdn.nba.com/logos/nba/${TEAMS[c].id}/primary/L/logo.svg` : "";
const n0 = v => v == null || !isFinite(v) ? "—" : Math.round(v).toLocaleString();
const n1 = v => v == null || !isFinite(v) ? "—" : v.toFixed(1);
const n3 = v => v == null || !isFinite(v) ? "—" : v.toFixed(3);
const pc = v => v == null || !isFinite(v) ? "—" : (v * 100).toFixed(1);
const sg = v => v == null || !isFinite(v) ? "—" : (v > 0 ? "+" : "") + v.toFixed(1);
async function getJSON(p){ try{ const r = await fetch(p + "?t=" + Date.now()); return r.ok ? await r.json() : null; }catch(_){ return null; } }

let LEAGUE = null, PLAYERS = null, IDS = new Map();
const T = {games:"all", loc:"all", conf:"all", mode:"pg", sort:"pe", dir:-1};
const L = {mode:"pg"};
const P = {q:"", team:"", qual:true, mode:"pg", sort:"pe", dir:-1};

/* ---------- teams ---------- */
const poss = s => s[I.fga] - s[I.oreb] + s[I.tov] + 0.44 * s[I.fta];
function teamRows(){
  const by = {};
  Object.keys(TEAMS).forEach(c => by[c] = []);
  (LEAGUE ? LEAGUE.games : []).forEach(g => {
    [[g[2], g[4], g[5], true], [g[3], g[5], g[4], false]].forEach(([c, me, them, home]) => { if(by[c]) by[c].push({me, them, home, min:g[6] || 48, clutch: !!g[7]}); });
  });
  return Object.entries(by).filter(([c]) => T.conf === "all" || (T.conf === "East") === EAST.includes(c)).map(([c, list]) => {
    let games = list.filter(g => T.loc === "all" || (T.loc === "home") === g.home);
    if(T.games !== "all") games = games.slice(-(+T.games));
    const n = games.length;
    const t = COLS.map(() => 0), o = COLS.map(() => 0);
    let w = 0, min = 0;
    games.forEach(g => { g.me.forEach((v,i) => t[i] += v); g.them.forEach((v,i) => o[i] += v); if(g.me[0] > g.them[0]) w++; min += g.min; });
    const per = T.mode === "pg" && n ? 1 / n : 1;
    const P2 = (poss(t) + poss(o)) / 2;
    const reb = t[I.oreb] + t[I.dreb];
    const cg = games.filter(g => g.clutch), cw = cg.filter(g => g.me[0] > g.them[0]).length;
    return {c, n, w, l: n - w, winp: n ? w / n : null, cw, cl: cg.length - cw, cwp: cg.length ? cw / cg.length : null,
      pts: t[I.pts]*per, opp: o[I.pts]*per, diff: (t[I.pts] - o[I.pts])*per,
      ortg: P2 ? 100*t[I.pts]/P2 : null, drtg: P2 ? 100*o[I.pts]/P2 : null, net: P2 ? 100*(t[I.pts]-o[I.pts])/P2 : null,
      pace: min ? 48*P2/min : null,
      pe: n ? (t[I.pts] + 2*t[I.ast] + 2*reb + 4*t[I.stl] + t[I.blk] - 4*t[I.tov]) / (48*n) : null,
      fgm: t[I.fgm]*per, fga: t[I.fga]*per, fgp: t[I.fga] ? t[I.fgm]/t[I.fga] : null,
      fg3m: t[I.fg3m]*per, fg3a: t[I.fg3a]*per, fg3p: t[I.fg3a] ? t[I.fg3m]/t[I.fg3a] : null,
      ftm: t[I.ftm]*per, fta: t[I.fta]*per, ftp: t[I.fta] ? t[I.ftm]/t[I.fta] : null,
      efg: t[I.fga] ? (t[I.fgm] + .5*t[I.fg3m])/t[I.fga] : null, ts: t[I.fga] ? t[I.pts]/(2*(t[I.fga] + .44*t[I.fta])) : null,
      reb: reb*per, oreb: t[I.oreb]*per, dreb: t[I.dreb]*per,
      orbp: t[I.oreb] + o[I.dreb] ? t[I.oreb]/(t[I.oreb] + o[I.dreb]) : null, drbp: t[I.dreb] + o[I.oreb] ? t[I.dreb]/(t[I.dreb] + o[I.oreb]) : null,
      ast: t[I.ast]*per, stl: t[I.stl]*per, blk: t[I.blk]*per, tov: t[I.tov]*per, tovp: poss(t) ? 100*t[I.tov]/poss(t) : null,
      pf: t[I.pf]*per, oefg: o[I.fga] ? (o[I.fgm] + .5*o[I.fg3m])/o[I.fga] : null, ofg3p: o[I.fg3a] ? o[I.fg3m]/o[I.fg3a] : null,
      oreb_allowed: (o[I.oreb] + o[I.dreb])*per,
      paint: t[I.paint]*per, fast: t[I.fast]*per, second: t[I.second]*per, offTov: t[I.offTov]*per, bench: t[I.bench]*per};
  });
}
/* key, header, format, which way is better (1 higher, -1 lower, 0 neither), tooltip */
const TCOLS = [
  ["n","GP",n0,0,"Games played"],["w","W",n0,1],["l","L",n0,-1],["winp","Win%",pc,1],
  ["cw","Clutch W",n0,1,"Wins in games that were within 5 in the last 5 minutes"],["cl","Clutch L",n0,-1,"Losses in games that were within 5 in the last 5 minutes"],["cwp","Clutch Win%",pc,1,"Win % in close games (within 5 in the last 5 minutes)"],
  ["pts","PTS",n1,1,"Points"],["opp","OPP",n1,-1,"Points allowed"],["diff","+/-",sg,1,"Point margin"],
  ["pe","Team MVR",n3,1,"(PTS + AST×2 + REB×2 + STL×4 + BLK − TOV×4) ÷ 48, per game"],
  ["ortg","ORtg",n1,1,"Points scored per 100 possessions"],["drtg","DRtg",n1,-1,"Points allowed per 100 possessions"],["net","Net",sg,1,"Net rating"],["pace","Pace",n1,0,"Possessions per 48 minutes"],
  ["reb","REB",n1,1,"Rebounds"],["oreb","OREB",n1,1],["dreb","DREB",n1,1],["orbp","OREB%",pc,1,"Share of available offensive rebounds"],["drbp","DREB%",pc,1,"Share of available defensive rebounds"],
  ["ast","AST",n1,1],["stl","STL",n1,1],["blk","BLK",n1,1],["tov","TOV",n1,-1],["tovp","TOV%",n1,-1,"Turnovers per 100 plays"],["pf","PF",n1,-1,"Fouls"],
  ["fgm","FGM",n1,1],["fga","FGA",n1,0],["fgp","FG%",pc,1],["fg3m","3PM",n1,1],["fg3a","3PA",n1,0],["fg3p","3P%",pc,1],
  ["ftm","FTM",n1,1],["fta","FTA",n1,0],["ftp","FT%",pc,1],["efg","eFG%",pc,1,"Effective FG%"],["ts","TS%",pc,1,"True shooting %"],
  ["oefg","Opp eFG%",pc,-1],["ofg3p","Opp 3P%",pc,-1],
  ["paint","Paint",n1,1,"Points in the paint"],["fast","Fast break",n1,1],["second","2nd chance",n1,1],["offTov","Pts off TOV",n1,1],["bench","Bench",n1,1,"Bench points"],
];
const RATES = ["ortg","drtg","net","pace","tovp"];
function drawTeams(){
  if(!LEAGUE || !LEAGUE.games.length){ $('teamTable').innerHTML = `<div class="empty">No games yet this season.</div>`; return; }
  const rows = teamRows().filter(r => r.n);
  const col = TCOLS.find(c => c[0] === T.sort) || TCOLS[7];
  rows.sort((a,b) => ((a[T.sort] ?? -1e9) - (b[T.sort] ?? -1e9)) * T.dir || a.c.localeCompare(b.c));
  const ext = {};
  TCOLS.forEach(([k, , , better]) => {
    if(!better) return;
    const vals = rows.map(r => r[k]).filter(v => v != null && isFinite(v));
    if(vals.length > 1) ext[k] = better > 0 ? [Math.max(...vals), Math.min(...vals)] : [Math.min(...vals), Math.max(...vals)];
  });
  const cls = (k, v) => !ext[k] || v == null ? "" : v === ext[k][0] ? "best" : v === ext[k][1] ? "worst" : "";
  $('teamTable').innerHTML = `<table><thead><tr><th class="l">#</th><th class="l stick" data-k="team">Team</th>${TCOLS.map(([k, h, , , tip]) => `<th data-k="${k}" class="${k === T.sort ? "on" : ""}"${tip ? ` title="${esc(tip)}"` : ""}>${h}${k === T.sort ? (T.dir < 0 ? " ▾" : " ▴") : ""}</th>`).join("")}</tr></thead>
    <tbody>${rows.map((r, i) => `<tr><td class="l rk">${i + 1}</td><td class="l tm stick"><a href="team.html#${r.c}"><img src="${logo(r.c)}" alt="" onerror="this.remove()">${esc(TEAMS[r.c].n)}</a></td>
      ${TCOLS.map(([k, , f]) => `<td class="${k === T.sort ? "on " : ""}${cls(k, r[k])}">${(T.mode === "tot" && f === n1 && !RATES.includes(k) ? n0 : f)(r[k])}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  $('teamTable').querySelectorAll('th[data-k]').forEach(th => th.onclick = () => {
    const k = th.dataset.k;
    if(k === "team"){ T.sort = "team"; }
    if(T.sort === k) T.dir *= -1; else { T.sort = k; const c = TCOLS.find(x => x[0] === k); T.dir = c && c[3] < 0 ? 1 : -1; }
    drawTeams();
  });
}

/* ---------- players ---------- */
const PC = Object.fromEntries(["id","name","team","g","gs","min","pts","ast","dreb","oreb","stl","blk","tov","fgm","fga","fg3m","fg3a","ftm","fta","pm","dd","td","high",
  "c_sec","c_pts","c_ast","c_reb","c_stl","c_blk","c_tov","c_fgm","c_fga","c_fg3m","c_fg3a","c_ftm","c_fta","c_pm"].map((c,i) => [c, i]));
function players(){
  const most = Math.max(1, ...((PLAYERS && PLAYERS.players) || []).map(r => r[PC.g]));
  const minG = Math.max(1, Math.ceil(most * 0.5)), frac = Math.min(1, most / 82);
  const list = ((PLAYERS && PLAYERS.players) || []).map(r => {
    const g = r[PC.g], reb = r[PC.dreb] + r[PC.oreb], mins = r[PC.min];
    const o = {id: IDS.get(fold(r[PC.name])), name: r[PC.name], team: r[PC.team], g, gs: r[PC.gs], min: mins,
      pts: r[PC.pts], reb, oreb: r[PC.oreb], dreb: r[PC.dreb], ast: r[PC.ast], stl: r[PC.stl], blk: r[PC.blk], tov: r[PC.tov],
      fgm: r[PC.fgm], fga: r[PC.fga], fg3m: r[PC.fg3m], fg3a: r[PC.fg3a], ftm: r[PC.ftm], fta: r[PC.fta], pm: r[PC.pm],
      dd: r[PC.dd], td: r[PC.td], high: r[PC.high],
      pe: mins ? (r[PC.pts] + 2*r[PC.ast] + 2*reb + 4*r[PC.stl] + r[PC.blk] - 4*r[PC.tov]) / mins : null,
      fgp: r[PC.fga] ? r[PC.fgm]/r[PC.fga] : null, fg3p: r[PC.fg3a] ? r[PC.fg3m]/r[PC.fg3a] : null, ftp: r[PC.fta] ? r[PC.ftm]/r[PC.fta] : null,
      stocks: r[PC.stl] + r[PC.blk],
      cmin: (r[PC.c_sec] || 0) / 60, cpts: r[PC.c_pts] || 0, cfgm: r[PC.c_fgm] || 0, cfga: r[PC.c_fga] || 0, cpm: r[PC.c_pm] || 0,
      cfgp: r[PC.c_fga] ? r[PC.c_fgm] / r[PC.c_fga] : null};
    /* Clutch MVR: the MVR formula on crunch-time stats only (last 5 min of the 4th/OT, score within 5), per crunch-time minute; 0 if none */
    o.cpe = o.cmin ? ((r[PC.c_pts]||0) + 2*(r[PC.c_ast]||0) + 2*(r[PC.c_reb]||0) + 4*(r[PC.c_stl]||0) + (r[PC.c_blk]||0) - 4*(r[PC.c_tov]||0)) / o.cmin : 0;
    o.qcl = o.cmin >= CLUTCH_MIN;
    o.qual = g >= minG && mins / g >= 10;
    o.qfg = r[PC.fgm] >= Math.max(2, Math.ceil(300 * frac));
    o.q3 = r[PC.fg3m] >= Math.max(1, Math.ceil(82 * frac));
    o.qft = r[PC.ftm] >= Math.max(1, Math.ceil(125 * frac));
    return o;
  });
  return {list, minG, most, frac};
}
const CLUTCH_MIN = 3;   // crunch-time minutes needed for the Clutch MVR leaders
const NOPG = ["pe","cpe","fgp","fg3p","ftp","cfgp","dd","td","high","g"];
const per = (p, k, mode) => mode === "pg" && !NOPG.includes(k) ? p[k] / p.g : p[k];
/* key, title, format per game, format total, needs (qualifier), note */
const LEADS = [
  ["pts","Points",n1,n0],["reb","Rebounds",n1,n0],["ast","Assists",n1,n0],["stl","Steals",n1,n0],["blk","Blocks",n1,n0],
  ["pm","Plus / minus",sg,v => (v > 0 ? "+" : "") + Math.round(v)],["pe","Minute Value Rating (MVR)",n3,n3,"qual","per minute"],
  ["cpe","Clutch MVR",n3,n3,"qcl","crunch-time stats only"],["cpts","Crunch-time points",n1,n0],["cpm","Crunch-time +/-",sg,v => (v > 0 ? "+" : "") + Math.round(v)],
  ["fg3m","3-pointers made",n1,n0],["stocks","Steals + blocks",n1,n0],["oreb","Offensive rebounds",n1,n0],["min","Minutes",n1,n0],
  ["fgp","Field goal %",pc,pc,"qfg"],["fg3p","3-point %",pc,pc,"q3"],["ftp","Free throw %",pc,pc,"qft"],
  ["dd","Double-doubles",n0,n0],["td","Triple-doubles",n0,n0],["high","Most points in a game",n0,n0],["tov","Turnovers",n1,n0,null,"most"],
];
function nameCell(p){
  const nm = p.id ? `<a href="pe.html#/player/${encodeURIComponent(p.id)}">${esc(p.name)}</a>` : esc(p.name);
  return `${nm}<small>${esc(TEAMS[p.team] ? TEAMS[p.team].n : p.team)} · ${p.g} G</small>`;
}
function drawLeaders(){
  const {list, minG, most, frac} = players();
  if(!list.length){ $('leadBody').innerHTML = `<div class="empty">No games yet this season.</div>`; return; }
  $('qualNote').textContent = `Per-game leaders need at least ${minG} game${minG === 1 ? "" : "s"} (half the most anyone has played, ${most}) and 10 minutes a game. Shooting percentages need a minimum number of makes that grows through the season (field goals ${Math.max(2, Math.ceil(300 * frac))}, threes ${Math.max(1, Math.ceil(82 * frac))}, free throws ${Math.max(1, Math.ceil(125 * frac))}).`;
  const mode = L.mode;
  $('leadBody').innerHTML = LEADS.map(([k, title, fpg, ftot, need, note]) => {
    const totalsOnly = ["dd","td","high"].includes(k), rateOnly = ["pe","cpe","fgp","fg3p","ftp"].includes(k);
    const m = totalsOnly ? "tot" : rateOnly ? "pg" : mode;
    const pool = list.filter(p => (need ? p[need] : (m === "pg" ? p.qual : true)) && per(p, k, m) != null);
    const top = pool.sort((a,b) => per(b, k, m) - per(a, k, m) || b.g - a.g).slice(0, 10).filter(p => per(p, k, m) > 0 || k === "pm");
    const fmt = m === "pg" ? fpg : ftot;
    const sub = note || (rateOnly ? "" : m === "pg" ? "per game" : "total");
    return `<div class="card lead"><h3><span>${title}</span><small>${esc(sub)}</small></h3>
      ${top.length ? `<ol>${top.map((p, i) => `<li><span class="n">${i + 1}</span><span class="who">${nameCell(p)}</span><span class="v">${fmt(per(p, k, m))}</span></li>`).join("")}</ol>` : `<div class="empty" style="padding:16px">No qualified players yet.</div>`}</div>`;
  }).join("");
}
const PCOLS = [["g","GP",n0,0],["gs","GS",n0,0],["min","MIN",n1,1],["pts","PTS",n1,1],["reb","REB",n1,1],["oreb","OREB",n1,1],["dreb","DREB",n1,1],
  ["ast","AST",n1,1],["stl","STL",n1,1],["blk","BLK",n1,1],["tov","TOV",n1,-1],["fgm","FGM",n1,1],["fga","FGA",n1,0],["fgp","FG%",pc,1],
  ["fg3m","3PM",n1,1],["fg3a","3PA",n1,0],["fg3p","3P%",pc,1],["ftm","FTM",n1,1],["fta","FTA",n1,0],["ftp","FT%",pc,1],
  ["pm","+/-",sg,1],["dd","DD",n0,1],["td","TD",n0,1],["high","High",n0,1],["pe","MVR",n3,1],["cpe","Clutch MVR",n3,1],
  ["cmin","Clutch MIN",n1,1],["cpts","Clutch PTS",n1,1],["cfgp","Clutch FG%",pc,1],["cpm","Clutch +/-",sg,1]];
function drawPlayers(){
  const {list} = players();
  const q = fold(P.q);
  let rows = list.filter(p => (!P.qual || p.qual) && (!P.team || p.team === P.team) && (!q || fold(p.name).includes(q)));
  rows.sort((a,b) => P.sort === "name" ? a.name.localeCompare(b.name) * -P.dir : ((per(a, P.sort, P.mode) ?? -1e9) - (per(b, P.sort, P.mode) ?? -1e9)) * P.dir);
  const fmtTot = (k, f) => P.mode === "tot" && f === n1 && !["min"].includes(k) ? n0 : f;
  $('playerTable').innerHTML = rows.length ? `<table><thead><tr><th class="l">#</th><th class="l stick" data-k="name">Player</th><th class="l" data-k="team">Team</th>
    ${PCOLS.map(([k, h]) => `<th data-k="${k}" class="${k === P.sort ? "on" : ""}">${h}${k === P.sort ? (P.dir < 0 ? " ▾" : " ▴") : ""}</th>`).join("")}</tr></thead>
    <tbody>${rows.slice(0, 600).map((p, i) => `<tr><td class="l rk">${i + 1}</td><td class="l stick">${p.id ? `<a href="pe.html#/player/${encodeURIComponent(p.id)}">${esc(p.name)}</a>` : esc(p.name)}</td><td class="l"><a href="team.html#${p.team}">${esc(p.team)}</a></td>
      ${PCOLS.map(([k, , f]) => { const v = per(p, k, P.mode); return `<td class="${k === P.sort ? "on " : ""}${k === "pm" ? (v >= 0 ? "pos" : "neg") : ""}">${fmtTot(k, f)(v)}</td>`; }).join("")}</tr>`).join("")}</tbody></table>`
    : `<div class="empty">No players match.${P.qual ? " Try turning off “Only qualified players”." : ""}</div>`;
  $('playerTable').querySelectorAll('th[data-k]').forEach(th => th.onclick = () => {
    const k = th.dataset.k; if(k === "team") return;
    if(P.sort === k) P.dir *= -1; else { P.sort = k; const c = PCOLS.find(x => x[0] === k); P.dir = k === "name" ? -1 : c && c[3] < 0 ? 1 : -1; }
    drawPlayers();
  });
}

function seg(id, obj, draw){
  $(id).querySelectorAll('button').forEach(b => b.onclick = () => {
    obj.mode = b.dataset.m; $(id).querySelectorAll('button').forEach(x => x.classList.toggle("on", x === b)); draw();
  });
}
async function init(){
  const [lg, pl, st] = await Promise.all([getJSON("data/teams/league.json"), getJSON("data/teams/players.json"), getJSON("data/stats.json")]);
  LEAGUE = lg; PLAYERS = pl;
  ((st && st.players) || []).forEach(p => IDS.set(fold(p.name), p.id));
  const games = LEAGUE ? LEAGUE.games.length : 0;
  $('meta').textContent = `${(LEAGUE && LEAGUE.season) || ""} season · ${games} game${games === 1 ? "" : "s"} played` + (LEAGUE && LEAGUE.at ? ` · updated ${new Date(LEAGUE.at).toLocaleString("en-US", {month:"short", day:"numeric", hour:"numeric", minute:"2-digit"})}` : "");
  $('pTeam').innerHTML += Object.keys(TEAMS).sort((a,b) => TEAMS[a].n.localeCompare(TEAMS[b].n)).map(c => `<option value="${c}">${esc(TEAMS[c].n)}</option>`).join("");
  $('tGames').onchange = e => { T.games = e.target.value; drawTeams(); };
  $('tLoc').onchange = e => { T.loc = e.target.value; drawTeams(); };
  $('tConf').onchange = e => { T.conf = e.target.value; drawTeams(); };
  seg('tMode', T, drawTeams); seg('lMode', L, drawLeaders); seg('pMode', P, drawPlayers);
  $('pQ').oninput = e => { P.q = e.target.value; drawPlayers(); };
  $('pTeam').onchange = e => { P.team = e.target.value; drawPlayers(); };
  $('pQual').onchange = e => { P.qual = e.target.checked; drawPlayers(); };
  drawTeams(); drawLeaders(); drawPlayers();
}
init();
})();
