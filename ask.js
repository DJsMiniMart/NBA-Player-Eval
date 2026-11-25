/* Ask the Geek Press: answers plain-English NBA questions in the search box from the site's own data files.
   "Who won the most MVPs?", "Who leads the league in 3-pointers?", "When do the Lakers play next?", "Is Haliburton hurt?"
   Ask.looksLikeQuestion(text) -> bool; Ask.answer(text) -> Promise<{html, href}|null>. No server: every answer is worked
   out in the browser from data/ (league_history.json, teams/players.json, teams/league.json, schedule.json, injuries.json,
   alltime.json, awards_race.json, predictions.json). */
(function(){
"use strict";
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fold = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[’']/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const cache = {};
const get = p => cache[p] || (cache[p] = fetch(`data/${p}?t=${Math.floor(Date.now() / 6e5)}`).then(r => r.ok ? r.json() : null).catch(() => null));
const TEAMS = {ATL:"Atlanta Hawks", BOS:"Boston Celtics", BKN:"Brooklyn Nets", CHA:"Charlotte Hornets", CHI:"Chicago Bulls", CLE:"Cleveland Cavaliers",
  DAL:"Dallas Mavericks", DEN:"Denver Nuggets", DET:"Detroit Pistons", GSW:"Golden State Warriors", HOU:"Houston Rockets", IND:"Indiana Pacers",
  LAC:"LA Clippers", LAL:"Los Angeles Lakers", MEM:"Memphis Grizzlies", MIA:"Miami Heat", MIL:"Milwaukee Bucks", MIN:"Minnesota Timberwolves",
  NOP:"New Orleans Pelicans", NYK:"New York Knicks", OKC:"Oklahoma City Thunder", ORL:"Orlando Magic", PHI:"Philadelphia 76ers", PHX:"Phoenix Suns",
  POR:"Portland Trail Blazers", SAC:"Sacramento Kings", SAS:"San Antonio Spurs", TOR:"Toronto Raptors", UTA:"Utah Jazz", WAS:"Washington Wizards"};
const NICK = {sixers:"PHI", "76ers":"PHI", blazers:"POR", "trail blazers":"POR", cavs:"CLE", wolves:"MIN", "t wolves":"MIN", mavs:"DAL", dubs:"GSW", knicks:"NYK", nets:"BKN", clips:"LAC", pels:"NOP", grizz:"MEM", okc:"OKC"};
const EAST = ["ATL","BOS","BKN","CHA","CHI","CLE","DET","IND","MIA","MIL","NYK","ORL","PHI","TOR","WAS"];
const tlink = c => `<a href="team.html#${c}">${esc(TEAMS[c] || c)}</a>`;
const plink = (name, id, team) => window.playerLink ? playerLink(name, team, null, id) : esc(name);
const ord = n => n + (n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th","st","nd","rd"][n % 10] || "th");
const f1 = v => (Math.round(v * 10) / 10).toFixed(1);

/* ---------- what's being asked about ---------- */
const QWORDS = /^(who|what|whats|which|when|where|how|is|are|does|did|do|has|have|most|best|worst|top|leader|leaders|leading|list|show|tell)\b/;
function looksLikeQuestion(raw){
  const q = fold(raw);
  if(!q || q.split(" ").length < 2) return false;
  return /\?\s*$/.test(raw) || QWORDS.test(q) || /\baverag|\d+ ?(points|rebounds|assists|steals|blocks|threes|ppg|rpg|apg)\b|\b50 40 90\b/.test(q) || /\b(leads?|leading|most|fewest|record|next game|play next|injur|hurt|mvp|champion|standings|averag|stats|race|rings?)\b/.test(q);
}
function teamIn(q){
  const hits = [];
  Object.entries(TEAMS).forEach(([c, n]) => { const f = fold(n), nick = fold(n.replace(/^(LA|Los Angeles|New York|New Orleans|Oklahoma City|Golden State|San Antonio|Portland) /, "").split(" ").slice(-1)[0]);
    const city = fold(n.split(" ").slice(0, -1).join(" "));
    if(new RegExp(`\\b(${f}|${nick})\\b`).test(q)) hits.push(c);
    else if(city && city.length > 3 && !["los angeles", "new york"].includes(city) && new RegExp(`\\b${city}\\b`).test(q)) hits.push(c); });
  Object.entries(NICK).forEach(([k, c]) => { if(new RegExp(`\\b${k}\\b`).test(q) && !hits.includes(c)) hits.push(c); });
  return hits;
}
let IDX = null;
async function players(){
  if(IDX) return IDX;
  const rows = await get("players/index.json") || [];
  const latest = rows.reduce((m, r) => String(r[3]) > m ? String(r[3]) : m, "");
  IDX = rows.map(r => ({id: r[0], name: r[1], k: fold(r[1]), last: fold(r[1]).replace(/ (jr|sr|ii|iii|iv)$/, "").split(" ").slice(-1)[0], team: r[4], active: String(r[3]) === latest, span: [r[2], r[3]]}));
  return IDX;
}
const PALIAS = {"steph": "stephen curry", "wemby": "victor wembanyama", "sga": "shai gilgeous alexander", "kd": "kevin durant", "bron": "lebron james", "king james": "lebron james",
  "the joker": "nikola jokic", "joker": "nikola jokic", "the greek freak": "giannis antetokounmpo", "greek freak": "giannis antetokounmpo", "dame": "damian lillard", "ant man": "anthony edwards", "mj": "michael jordan", "kobe": "kobe bryant", "shaq": "shaquille oneal", "magic johnson": "magic johnson"};
/* the player named in the question: full name first, then a unique active last name or first name */
async function playerIn(q){
  const P = await players();
  let best = null;
  P.forEach(p => { if(p.k.length > 4 && new RegExp(`\\b${p.k}\\b`).test(q) && (!best || p.k.length > best.k.length || (p.k.length === best.k.length && p.active && !best.active))) best = p; });
  if(best) return best;
  const words = q.split(" ");
  const cands = P.filter(p => p.active && p.last.length > 3 && words.includes(p.last));
  if(cands.length === 1) return cands[0];
  const firsts = P.filter(p => p.active && p.k.split(" ")[0].length > 4 && words.includes(p.k.split(" ")[0]));
  if(firsts.length === 1) return firsts[0];
  const legends = P.filter(p => p.last.length > 4 && words.includes(p.last)).sort((a, b) => (+b.span[1].slice(0, 4) - +b.span[0].slice(0, 4)) - (+a.span[1].slice(0, 4) - +a.span[0].slice(0, 4)));
  return /mvp|champion|award|all star|all nba|career/.test(q) && legends.length ? legends[0] : null;
}

/* ---------- stats this season (data/teams/players.json) ---------- */
const STAT = [
  {re: /\b(3|three) ?(pt|point|pointers?)? ?(percent|percentage|pct)|3p percent|from three percent/, key: "fg3p", label: "3-point %", pct: ["fg3m", "fg3a", 1.5]},
  {re: /free throw (percent|percentage|pct)|\bft percent/, key: "ftp", label: "Free throw %", pct: ["ftm", "fta", 1.5]},
  {re: /field goal (percent|percentage|pct)|\bfg percent|shooting percentage|most efficient/, key: "fgp", label: "Field goal %", pct: ["fgm", "fga", 4]},
  {re: /\b(3|three)s?\b|three pointers?|3 pointers?|3pt|threes|triples|from deep|from three|3 point/, key: "fg3m", label: "3-pointers made", per: true},
  {re: /free throws?/, key: "ftm", label: "Free throws made", per: true},
  {re: /double doubles?|double double/, key: "dd", label: "Double-doubles"},
  {re: /triple doubles?|triple double/, key: "td", label: "Triple-doubles"},
  {re: /rebound|boards/, key: "reb", label: "Rebounds", per: true},
  {re: /assist|dimes|passer|playmaker/, key: "ast", label: "Assists", per: true},
  {re: /steal/, key: "stl", label: "Steals", per: true},
  {re: /block|swat|rim protector/, key: "blk", label: "Blocks", per: true},
  {re: /turnover/, key: "tov", label: "Turnovers", per: true},
  {re: /minute/, key: "min", label: "Minutes", per: true},
  {re: /plus minus|\+\/-|plus\/minus/, key: "pm", label: "Plus-minus", per: true},
  {re: /pulse/, key: "pulse", label: "Pulse"},
  {re: /point|scor|bucket/, key: "pts", label: "Points", per: true},
];
async function seasonRows(){
  const d = await get("teams/players.json"); if(!d) return null;
  const C = d.cols, ix = k => C.indexOf(k);
  const rows = d.players.map(r => { const o = {}; C.forEach((k, i) => o[k] = r[i]); o.reb = (o.dreb || 0) + (o.oreb || 0);
    o.pulse = o.min ? (o.pts + 2 * o.ast + o.reb + 2 * o.stl + 2 * o.blk - 2 * o.tov) / o.min : 0; return o; });
  const most = Math.max(...rows.map(r => r.g || 0));
  return {rows, season: d.season, minG: Math.max(1, Math.ceil(most / 2)), most, ix};
}
async function leaders(q, stat){
  const S = await seasonRows(); if(!S) return null;
  const low = /fewest|least|lowest|worst/.test(q);
  const qual = r => r.g >= S.minG && r.min / r.g >= 15;
  let list, fmt, title, note = "";
  if(stat.pct){ const [m, a, per] = stat.pct;
    list = S.rows.filter(r => qual(r) && r[a] / r.g >= per).map(r => ({r, v: r[m] / r[a]}));
    fmt = v => (v * 100).toFixed(1) + "%"; title = `${stat.label} leaders`; note = `At least ${per} attempts a game and ${S.minG}+ games.`;
  } else if(stat.key === "pulse"){
    list = S.rows.filter(qual).map(r => ({r, v: r.pulse})); fmt = v => v.toFixed(3); title = "Pulse leaders";
  } else if(!stat.per){
    list = S.rows.map(r => ({r, v: r[stat.key] || 0})).filter(x => x.v > 0); fmt = v => String(v); title = `Most ${stat.label.toLowerCase()}`;
  } else {
    const totals = /\b(total|made|most)\b/.test(q) && !/per game|a game|average/.test(q);
    list = S.rows.filter(r => totals || qual(r)).map(r => ({r, v: totals ? r[stat.key] : r[stat.key] / r.g, tot: r[stat.key], pg: r[stat.key] / r.g}));
    fmt = v => totals ? String(Math.round(v)) : f1(v);
    title = `${stat.label} ${totals ? "(total)" : "per game"}`;
    note = totals ? "Season totals." : `Per game, ${S.minG}+ games and 15+ minutes a game.`;
    list.forEach(x => x.extra = totals ? `${f1(x.pg)} a game` : `${x.tot} total`);
  }
  list.sort((a, b) => low ? a.v - b.v : b.v - a.v);
  const top = list.slice(0, 5); if(!top.length) return null;
  const lead = top[0];
  return {html: `<p class="ask-a"><b>${plink(lead.r.name, null, lead.r.team)}</b> ${low ? "has the fewest" : "leads the league"}${stat.per || stat.pct || stat.key === "pulse" ? ` in ${esc(stat.label.toLowerCase())}` : ` with ${esc(fmt(lead.v))} ${esc(stat.label.toLowerCase())}`}${stat.per || stat.pct || stat.key === "pulse" ? `: <b>${esc(fmt(lead.v))}</b>` : ""} (${esc(lead.r.team)}).</p>
    ${table(title, top.map((x, i) => [i + 1, plink(x.r.name, null, x.r.team), esc(x.r.team), `<b>${esc(fmt(x.v))}</b>`, x.extra ? `<small>${esc(x.extra)}</small>` : ""]))}
    <p class="ask-n">${esc(S.season)} season. ${esc(note)}</p>`, href: "stats.html", more: "More leaders in The Stat Lab"};
}
function table(title, rows){
  return `<div class="ask-t"><div class="ask-th">${esc(title)}</div>${rows.map(r => `<div class="ask-r">${r.map((c, i) => `<span class="c${i}">${c}</span>`).join("")}</div>`).join("")}</div>`;
}
async function highGame(q){
  const S = await seasonRows(); if(!S || S.ix("high") < 0) return null;
  const top = S.rows.filter(r => r.high).sort((a, b) => b.high - a.high).slice(0, 5);
  return {html: `<p class="ask-a">Most points in a game this season: <b>${plink(top[0].name, null, top[0].team)}</b> with <b>${top[0].high}</b>.</p>${table("Season-high points", top.map((r, i) => [i + 1, plink(r.name, null, r.team), esc(r.team), `<b>${r.high}</b>`]))}`, href: "stats.html", more: "The Stat Lab"};
}
async function playerLine(p){
  const S = await seasonRows(); if(!S) return null;
  const r = S.rows.find(x => fold(x.name) === p.k);
  const href = `pe.html#/player/${encodeURIComponent(p.id)}`;
  if(!r || !r.g) return {html: `<p class="ask-a"><b>${esc(p.name)}</b> hasn't played this season${p.active ? "" : ` (played ${esc(p.span[0])} to ${esc(p.span[1])})`}.</p>`, href, more: `${p.name}'s page`};
  const g = r.g, pct = (a, b) => b ? (a / b * 100).toFixed(1) + "%" : "—";
  return {html: `<p class="ask-a"><b>${plink(p.name, p.id, r.team)}</b> (${esc(r.team)}) is averaging <b>${f1(r.pts / g)} points, ${f1(r.reb / g)} rebounds and ${f1(r.ast / g)} assists</b> in ${g} game${g === 1 ? "" : "s"} this season.</p>
    <div class="ask-chips"><span>${f1(r.min / g)} min</span><span>${f1(r.stl / g)} stl</span><span>${f1(r.blk / g)} blk</span><span>FG ${pct(r.fgm, r.fga)}</span><span>3P ${pct(r.fg3m, r.fg3a)} (${f1(r.fg3m / g)} made)</span><span>FT ${pct(r.ftm, r.fta)}</span><span>Pulse ${r.pulse.toFixed(3)}</span>${r.high ? `<span>High ${r.high} pts</span>` : ""}</div>`, href, more: `${p.name}'s full page`};
}

/* ---------- history (data/league_history.json) ---------- */
const AWARD = [[/finals mvp|fmvp/, "fmvp"], [/all star mvp/, "all_star_mvp"], [/defensive player|dpoy/, "dpoy"], [/rookie of (the )?year|\broy\b/, "roy"], [/sixth man|6th man|smoy/, "smoy"],
  [/most improved|mip\b/, "mip"], [/coach of (the )?year|\bcoy\b/, "coy"], [/clutch player/, "clutch_poy"], [/comeback/, "cpoy"], [/all defensive|all defense/, "all_defense"],
  [/all rookie/, "all_rookie"], [/all nba/, "all_nba"], [/all star/, "all_star"], [/nba cup mvp|in season tournament mvp/, "ist_mvp"], [/\bmvps?\b|most valuable/, "mvp"]];
async function history(){ return get("league_history.json"); }
async function awardAnswer(q, key, p){
  const H = await history(); if(!H) return null;
  const label = H.labels[key] || key;
  const rows = H.rows.filter(r => r[1] === key);
  const yr = (q.match(/\b(19[4-9]\d|20[0-4]\d)\b/) || [])[1];
  if(yr){ const w = rows.filter(r => String(r[0]) === yr);
    if(!w.length) return {html: `<p class="ask-a">No ${esc(label)} on record for ${yr}.</p>`, href: "history.html", more: "NBA History"};
    return {html: `<p class="ask-a">${yr} ${esc(label)}: ${w.map(r => `<b>${plink(r[4], r[3], r[5])}</b>${r[2] ? ` (${esc(r[2])})` : ""} · ${esc(r[5])}`).join(", ")}.</p><p class="ask-n">Seasons are listed by the year they ended (${yr} = ${yr - 1}-${String(yr).slice(2)}).</p>`, href: "history.html", more: "NBA History"}; }
  if(p){ const mine = rows.filter(r => r[3] === p.id || fold(r[4]) === p.k);
    return {html: `<p class="ask-a"><b>${plink(p.name, p.id)}</b> has <b>${mine.length}</b> ${esc(label)}${key.startsWith("all_") ? (mine.length === 1 ? " selection" : " selections") : (mine.length === 1 ? " award" : " awards")}${mine.length ? `: ${mine.map(r => r[0]).sort().join(", ")}` : ""}.</p>`, href: "history.html", more: "NBA History"}; }
  const by = {}; rows.forEach(r => { const k = r[3] || r[4]; (by[k] = by[k] || {name: r[4], id: r[3], n: 0, yrs: []}); by[k].n++; by[k].yrs.push(r[0]); });
  const top = Object.values(by).sort((a, b) => b.n - a.n || Math.min(...a.yrs) - Math.min(...b.yrs)).slice(0, 6);
  const tie = top.filter(x => x.n === top[0].n);
  const lastW = rows.slice().sort((a, b) => b[0] - a[0])[0];
  const names = tie.map(x => `<b>${plink(x.name, x.id)}</b>`), list = names.length > 2 ? names.slice(0, -1).join(", ") + " and " + names[names.length - 1] : names.join(" and ");
  return {html: `<p class="ask-a">Most ${esc(label)}${key.startsWith("all_") ? " selections" : " awards"} in NBA history: ${list} with <b>${top[0].n}</b>${tie.length > 1 ? " each" : ""}.</p>
    ${table(`Most ${label}`, top.map((x, i) => [i + 1, plink(x.name, x.id), `<b>${x.n}</b>`, `<small>${x.yrs.sort().slice(0, 6).join(", ")}${x.yrs.length > 6 ? "…" : ""}</small>`]))}
    ${lastW ? `<p class="ask-n">Most recent: ${esc(lastW[4])} (${lastW[0]}).</p>` : ""}`, href: "history.html", more: "NBA History"};
}
async function champAnswer(q, team){
  const H = await history(); if(!H) return null;
  const C = H.champions.filter(c => c[1] === "NBA" || c[1] === "BAA");
  const yr = (q.match(/\b(19[4-9]\d|20[0-4]\d)\b/) || [])[1];
  if(yr){ const c = C.find(x => String(x[0]) === yr);
    return c ? {html: `<p class="ask-a">The <b>${tlink(c[4] || c[2])}</b> won the ${yr} title, beating the ${esc(c[6])} ${c[8]}-${c[9]}.</p><p class="ask-n">${esc(c[10] || "")}</p>`, href: "history.html", more: "NBA History"} : null; }
  if(team){ const w = C.filter(c => (c[4] || c[2]) === team);
    return {html: `<p class="ask-a">The <b>${tlink(team)}</b> have <b>${w.length}</b> championship${w.length === 1 ? "" : "s"}${w.length ? ` (${w.map(c => c[0]).sort().join(", ")})` : ""}.</p><p class="ask-n">Counts titles won by the franchise under earlier names too.</p>`, href: `team.html#${team}`, more: "Franchise Files"}; }
  if(/last|recent|reigning|defending|who won/.test(q) && !/most/.test(q)){ const c = C[0];
    return {html: `<p class="ask-a">The reigning champions are the <b>${tlink(c[4] || c[2])}</b> (${c[0]}), who beat the ${esc(c[6])} ${c[8]}-${c[9]}.</p>`, href: "history.html", more: "NBA History"}; }
  const by = {}; C.forEach(c => { const k = c[4] || c[2]; (by[k] = by[k] || {k, n: 0, yrs: []}); by[k].n++; by[k].yrs.push(c[0]); });
  const top = Object.values(by).sort((a, b) => b.n - a.n).slice(0, 6);
  return {html: `<p class="ask-a">Most championships: the <b>${tlink(top[0].k)}</b> with <b>${top[0].n}</b>${top[1] && top[1].n === top[0].n ? ` (tied with the ${tlink(top[1].k)})` : ""}.</p>
    ${table("Most titles", top.map((x, i) => [i + 1, tlink(x.k), `<b>${x.n}</b>`, `<small>last in ${Math.max(...x.yrs)}</small>`]))}`, href: "history.html", more: "NBA History"};
}

/* ---------- all-time (data/alltime.json, every season since 1979-80) ---------- */
const CAREER = [[/point|scor/, "pts", "points"], [/assist/, "ast", "assists"], [/rebound/, "reb", "rebounds"], [/steal/, "stl", "steals"], [/block/, "blk", "blocks"], [/games/, "g", "games"], [/minute/, "mp", "minutes"]];
async function careerAnswer(q, key, label){
  const A = await get("alltime.json"); if(!A) return null;
  const C = A.cols, ix = k => C.indexOf(k), single = /\b(a|one|single) season\b|in a season/.test(q);
  const val = r => key === "reb" ? (r[ix("drb")] || 0) + (r[ix("orb")] || 0) : r[ix(key)] || 0;
  let top;
  if(single){ top = A.rows.map(r => ({name: r[1], id: r[0], v: val(r), s: r[2]})).sort((a, b) => b.v - a.v).slice(0, 5); }
  else { const by = {}; A.rows.forEach(r => { const k = r[0]; (by[k] = by[k] || {name: r[1], id: k, v: 0}); by[k].v += val(r); }); top = Object.values(by).sort((a, b) => b.v - a.v).slice(0, 5); }
  return {html: `<p class="ask-a">Most ${esc(label)} ${single ? "in a season" : "in a career"} (regular season, since 1979-80): <b>${plink(top[0].name, top[0].id)}</b> with <b>${top[0].v.toLocaleString()}</b>.</p>
    ${table(single ? `Most ${label} in a season` : `Career ${label}`, top.map((x, i) => [i + 1, plink(x.name, x.id), `<b>${x.v.toLocaleString()}</b>`, x.s ? `<small>${esc(x.s)}</small>` : ""]))}
    <p class="ask-n">The site's season files start in 1979-80, so earlier careers (like Kareem's first 10 seasons) are only partly counted.</p>`, href: "history.html", more: "NBA History"};
}

/* ---------- teams: records, standings, schedule, injuries ---------- */
async function records(){
  const L = await get("teams/league.json"); if(!L) return null;
  const R = {}; Object.keys(TEAMS).forEach(t => R[t] = {t, w: 0, l: 0, pf: 0, pa: 0, res: []});
  (L.games || []).slice().sort((a, b) => a[1] < b[1] ? -1 : 1).forEach(g => { const [, , h, a, hl, al] = g; if(!R[h] || !R[a]) return; const hw = hl[0] > al[0];
    R[h].w += hw; R[h].l += !hw; R[a].w += !hw; R[a].l += hw; R[h].pf += hl[0]; R[h].pa += al[0]; R[a].pf += al[0]; R[a].pa += hl[0]; R[h].res.push(hw ? "W" : "L"); R[a].res.push(hw ? "L" : "W"); });
  Object.values(R).forEach(r => { r.g = r.w + r.l; r.pct = r.g ? r.w / r.g : 0; const last = r.res[r.res.length - 1]; let s = 0; for(let i = r.res.length - 1; i >= 0 && r.res[i] === last; i--) s++; r.strk = last ? last + s : ""; });
  return R;
}
async function standingsAnswer(q){
  const R = await records(); if(!R) return null;
  const conf = /\beast/.test(q) ? "East" : /\bwest/.test(q) ? "West" : null;
  let list = Object.values(R).filter(r => !conf || (conf === "East") === EAST.includes(r.t));
  const worst = /worst|bottom|last place/.test(q);
  list.sort((a, b) => worst ? a.pct - b.pct || b.l - a.l : b.pct - a.pct || b.w - a.w);
  const top = list.slice(0, 6);
  return {html: `<p class="ask-a">${worst ? "Worst" : "Best"} record${conf ? " in the " + conf : " in the NBA"}: the <b>${tlink(top[0].t)}</b> at <b>${top[0].w}-${top[0].l}</b>.</p>${table(conf ? `${conf} standings` : "League standings", top.map((r, i) => [i + 1, tlink(r.t), `<b>${r.w}-${r.l}</b>`, `<small>${r.strk}</small>`]))}`, href: "playoffs.html", more: "Playoff Picture"};
}
async function teamStatAnswer(q){
  const R = await records(); if(!R) return null;
  const def = /defen|allow|fewest points/.test(q);
  const list = Object.values(R).filter(r => r.g).map(r => ({t: r.t, v: def ? r.pa / r.g : r.pf / r.g})).sort((a, b) => def ? a.v - b.v : b.v - a.v).slice(0, 5);
  return {html: `<p class="ask-a">${def ? "Fewest points allowed" : "Most points scored"} per game: the <b>${tlink(list[0].t)}</b> (${f1(list[0].v)}).</p>${table(def ? "Points allowed" : "Points scored", list.map((x, i) => [i + 1, tlink(x.t), `<b>${f1(x.v)}</b>`]))}`, href: "stats.html", more: "Team stats in The Stat Lab"};
}
async function teamAnswer(q, t){
  const [R, S, I] = await Promise.all([records(), get("schedule.json"), get("injuries.json")]);
  const r = R && R[t];
  const next = ((S && S.games) || []).filter(g => g[4] !== 3 && (g[2] === t || g[3] === t) && new Date(g[1]) > new Date(Date.now() - 3 * 36e5)).sort((a, b) => a[1] < b[1] ? -1 : 1)[0];
  const nextTxt = next ? `${next[2] === t ? "vs" : "@"} ${esc(TEAMS[next[2] === t ? next[3] : next[2]])}, ${esc(new Date(next[1]).toLocaleString("en-US", {weekday: "long", month: "short", day: "numeric", hour: "numeric", minute: "2-digit"}))}${next[8] ? ` on ${esc(String(next[8]).split(",")[0])}` : ""}` : "";
  const inj = ((I && I.teams && I.teams[t]) || []).filter(x => !/^active$/i.test(x.status || ""));
  if(/next|play|schedule|game tonight|when/.test(q) && next)
    return {html: `<p class="ask-a">The <b>${tlink(t)}</b> play next ${nextTxt}.</p>`, href: `matchup.html#${encodeURIComponent(next[0])}`, more: "Game preview"};
  if(/injur|hurt|out|missing/.test(q))
    return {html: `<p class="ask-a">${inj.length ? `The <b>${tlink(t)}</b> have ${inj.length} player${inj.length === 1 ? "" : "s"} on the injury report:` : `The <b>${tlink(t)}</b> have nobody on the injury report.`}</p>${inj.length ? table("Injury report", inj.slice(0, 8).map(x => [`<a href="#" data-inj="${esc(t)}|${esc(x.name)}">${esc(x.name)}</a>`, `<b>${esc(x.status)}</b>`, `<small>${esc([x.side, x.type].filter(Boolean).join(" "))}${x.tl ? " · " + esc(x.tl.label) : ""}</small>`])) : ""}`, href: `team.html#${t}`, more: "Franchise Files"};
  if(!r) return null;
  const all = Object.values(R).filter(x => (EAST.includes(x.t)) === EAST.includes(t)).sort((a, b) => b.pct - a.pct || b.w - a.w);
  const seed = all.findIndex(x => x.t === t) + 1;
  return {html: `<p class="ask-a">The <b>${tlink(t)}</b> are <b>${r.w}-${r.l}</b>, ${ord(seed)} in the ${EAST.includes(t) ? "East" : "West"}${r.strk ? ` (${r.strk.startsWith("W") ? "won" : "lost"} ${r.strk.slice(1)} straight)` : ""}.</p>
    <div class="ask-chips"><span>${f1(r.pf / Math.max(1, r.g))} scored</span><span>${f1(r.pa / Math.max(1, r.g))} allowed</span>${next ? `<span>Next: ${nextTxt}</span>` : ""}${inj.length ? `<span>${inj.length} on the injury report</span>` : ""}</div>`, href: `team.html#${t}`, more: "Franchise Files"};
}
async function injuryAnswer(p){
  const I = await get("injuries.json"); const e = I && Object.entries(I.teams || {}).flatMap(([t, l]) => l.map(x => ({t, x}))).find(o => fold(o.x.name) === p.k);
  if(!e || /^active$/i.test(e.x.status || "")) return {html: `<p class="ask-a"><b>${plink(p.name, p.id)}</b> isn't on the injury report.</p>`, href: `pe.html#/player/${encodeURIComponent(p.id)}`, more: `${p.name}'s page`};
  const x = e.x;
  return {html: `<p class="ask-a"><b>${plink(p.name, p.id, e.t)}</b> is <b>${esc(x.status)}</b>${[x.side, x.type].filter(Boolean).length ? ` (${esc([x.side, x.type, x.detail].filter(Boolean).join(" "))})` : ""}${x.tl ? `: ${esc(x.tl.label)}` : ""}.</p>${x.note ? `<p class="ask-n">${esc(x.note)}</p>` : ""}<p><a href="#" data-inj="${esc(e.t)}|${esc(x.name)}">Full injury details →</a></p>`, href: `pe.html#/player/${encodeURIComponent(p.id)}`, more: `${p.name}'s page`};
}
async function raceAnswer(q){
  const A = await get("awards_race.json"); if(!A) return null;
  const k = /rookie/.test(q) ? "roy" : /sixth|6th|bench/.test(q) ? "smoy" : "mvp", lab = {mvp: "MVP", roy: "Rookie of the Year", smoy: "Sixth Man"}[k];
  const L = (A[k] || []).slice(0, 5), C = A.cols, ix = c => C.indexOf(c);
  if(!L.length) return null;
  return {html: `<p class="ask-a">Pulse's ${lab} race is led by <b>${plink(L[0][ix("name")], L[0][ix("id")], L[0][ix("team")])}</b> (${esc(L[0][ix("team")])}).</p>${table(`${lab} race`, L.map((r, i) => [i + 1, plink(r[ix("name")], r[ix("id")], r[ix("team")]), esc(r[ix("team")]), `<small>${r[ix("ppg")]} ppg · ${Math.round(r[ix("winPct")] * 100)}% team wins</small>`]))}<p class="ask-n">The Pulse Board's award model, updated every morning. Not a poll of voters.</p>`, href: "pe.html#races", more: "Award races on the Pulse Board"};
}

async function draftAnswer(){
  const D = await get("draft2027.json"); if(!D) return null;
  const top = D.prospects.slice(0, 5);
  return {html: `<p class="ask-a">The consensus No. 1 prospect for the 2027 draft is <b>${esc(top[0].name)}</b> (${esc(top[0].pos)}, ${esc(top[0].school)}).</p>${table("2027 consensus big board", top.map(p => [p.rank, `<b>${esc(p.name)}</b>`, `<small>${esc(p.pos)} · ${esc(p.school)}</small>`]))}`, href: "draft.html", more: "Draft Board"};
}
/* ---------- every season since 1946-47 (data/qseasons.json): "how many players averaged 25, 10 and 8 in a season?" ---------- */
let QS = null;
async function qseasons(){
  if(QS) return QS;
  const d = await get("qseasons.json"); if(!d) return null;
  const C = d.cols, ix = {}; C.forEach((k, i) => ix[k] = i);
  const rows = d.rows.map(r => { const P = d.players[r[0]], o = {id: P[0], name: P[1], season: d.seasons[r[1]], y: +d.seasons[r[1]].slice(0, 4)};
    C.slice(2).forEach(k => o[k] = r[ix[k]]);
    // every position he's listed at: that season's (PG, SG-SF...) plus his career listing (G, F-C...)
    o.pos = String(o.pos || ""); o.cpos = String(P[2] || ""); o.ps = new Set(o.pos.split("-").concat(String(P[2] || "").split("-")).filter(Boolean)); return o; });
  const maxG = {}; rows.forEach(r => { maxG[r.season] = Math.max(maxG[r.season] || 0, r.g || 0); });
  const first = {}; rows.forEach(r => { if(!first[r.id] || r.y < first[r.id]) first[r.id] = r.y; });
  QS = {rows, maxG, first, seasons: d.seasons, current: d.current};
  return QS;
}
// stats people ask about, per game unless the number is only possible as a season total
const QSTAT = [
  {k: "fg3", re: "threes?|3s|3 ?pointers?|three ?pointers?|3pm|triples|3 ?pt makes", lab: "3PM", name: "3-pointers", cap: 10, since: 1980},
  {k: "pts", re: "points?|pts|ppg|pt", lab: "PTS", name: "points", cap: 60},
  {k: "trb", re: "rebounds?|rebs?|rpg|boards", lab: "REB", name: "rebounds", cap: 30, since: 1951},
  {k: "ast", re: "assists?|asts?|apg|dimes", lab: "AST", name: "assists", cap: 25},
  {k: "stl", re: "steals?|stls?|spg", lab: "STL", name: "steals", cap: 8, since: 1974},
  {k: "blk", re: "blocks?|blks?|bpg|blocked shots", lab: "BLK", name: "blocks", cap: 10, since: 1974},
  {k: "tov", re: "turnovers?|tovs?", lab: "TOV", name: "turnovers", cap: 10, since: 1978},
  {k: "mp", re: "minutes|mins?|mpg", lab: "MIN", name: "minutes", cap: 48, since: 1952},
  {k: "g", re: "games(?! a season)", lab: "G", name: "games", cap: 0}];
const QPCT = [
  {k: "fgp", m: "fg", a: "fga", re: "from the field|field goal|fg", lab: "FG%", name: "field goal %", min: 300},
  {k: "fg3p", m: "fg3", a: "fg3a", re: "from three|from 3|from deep|three point|3 point|3pt|3p|from beyond the arc", lab: "3P%", name: "3-point %", min: 82, since: 1980},
  {k: "ftp", m: "ft", a: "fta", re: "from the line|free throws?|ft", lab: "FT%", name: "free throw %", min: 125}];
/* positions: a player listed at more than one counts at each (a "G-F" is a guard and a forward) */
const QPOS = [
  {re: /\bpoint guards?\b|\bpgs?\b/, lab: "point guards", has: s => s.has("PG")},
  {re: /\bshooting guards?\b|\bsgs?\b|\boff guards?\b/, lab: "shooting guards", has: s => s.has("SG")},
  {re: /\bsmall forwards?\b|\bsfs?\b/, lab: "small forwards", has: s => s.has("SF")},
  {re: /\bpower forwards?\b|\bpfs?\b/, lab: "power forwards", has: s => s.has("PF")},
  {re: /\bcent(?:er|re)s?\b|\b5s\b/, lab: "centers", has: s => s.has("C")},
  {re: /\bwings?\b/, lab: "wings", has: s => s.has("SG") || s.has("SF") || (s.has("G") && s.has("F"))},
  {re: /\bbig ?men\b|\bbigs\b|\bbig man\b/, lab: "big men", has: s => s.has("PF") || s.has("C")},
  {re: /\bguards?\b/, lab: "guards", has: s => s.has("PG") || s.has("SG") || s.has("G")},
  {re: /\bforwards?\b/, lab: "forwards", has: s => s.has("SF") || s.has("PF") || s.has("F")}];
const posIn = q => { const m = QPOS.find(P => P.re.test(q)); return m || null; };
const FRANCH = {ATL: "ATL STL MLH TRI", BKN: "BRK NJN NYN NYA NJA", CHA: "CHO CHA CHH", DEN: "DEN DNA DNR", DET: "DET FTW", GSW: "GSW SFW PHW", HOU: "HOU SDR",
  LAC: "LAC SDC BUF", LAL: "LAL MNL", MEM: "MEM VAN", NOP: "NOP NOH NOK", OKC: "OKC SEA", PHI: "PHI SYR", PHX: "PHO PHX", SAC: "SAC KCK KCO CIN ROC", SAS: "SAS SAA DLC TEX",
  UTA: "UTA NOJ", WAS: "WAS WSB CAP BAL CHZ CHP", NYK: "NYK", BOS: "BOS", CHI: "CHI", CLE: "CLE", DAL: "DAL", IND: "IND INA", MIA: "MIA", MIL: "MIL", MIN: "MIN", ORL: "ORL", POR: "POR", TOR: "TOR"};
const qnorm = raw => String(raw).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[’']/g, "").replace(/%/g, " percent ")
  .replace(/(\d)\.(\d)/g, "$1D$2").replace(/(\d)-(\d\d)\b/g, "$1 $2").replace(/[^a-z0-9+/D ]/g, " ").replace(/D/g, ".").replace(/\s+/g, " ").trim();
function thresholds(q){
  const out = [], seen = new Set();
  const cmp = pre => /(under|less than|fewer than|below|at most|no more than)\s*$/.test(pre) ? "<" : ">=";
  // 50/40/90 club
  if(/\b50 ?\/? ?40 ?\/? ?90\b/.test(q)){ out.push({p: QPCT[0], v: 50, c: ">="}, {p: QPCT[1], v: 40, c: ">="}, {p: QPCT[2], v: 90, c: ">="}); return out; }
  // shooting: "50 percent from three", "shot 45 percent from the field", "40 percent 3 point"
  QPCT.forEach(P => { const m = q.match(new RegExp(`((?:\\w+ ){0,3})(\\d+(?:\\.\\d+)?) percent (?:or (?:better|more|higher) )?(?:shooting )?(?:${P.re})`)) || q.match(new RegExp(`((?:\\w+ ){0,3})(?:${P.re}) (?:percent|percentage|pct) (?:of |over |above |at least |under |below )?(\\d+(?:\\.\\d+)?)`));
    if(m && !seen.has(P.k)){ seen.add(P.k); out.push({p: P, v: +m[2], c: cmp(m[1] || "")}); } });
  const words = QSTAT.map(s => s.re).join("|");
  const re = new RegExp(`((?:[a-z]+ ){0,3})(\\d+(?:\\.\\d+)?)\\s*(\\+|plus)?\\s*(?:or more |or better |per game |a game )?(?:${words})\\b(?! ?(?:percent|percentage|pct|shoot))`, "g");
  let m; while((m = re.exec(q))){ const word = m[0].slice(m[0].lastIndexOf(m[2]) + m[2].length).replace(/^\s*(\+|plus)?\s*(or more |or better |per game |a game )?/, "").trim();
    const S = QSTAT.find(s => new RegExp(`^(?:${s.re})\\b`).test(word)); if(!S || seen.has(S.k)) continue;
    if(/percent\s*$/.test(m[1])) continue;
    seen.add(S.k); const v = +m[2];
    out.push({s: S, v, c: cmp(m[1] || ""), tot: S.k === "g" || v > S.cap || /\btotal\b/.test(q) && !/averag|per game|a game/.test(q)}); }
  // "25, 7 and 7" / "20 and 10": points, rebounds (and assists) by default
  if(!out.length){ const m3 = q.match(/\b(?:averag\w*|put up|a|with|of|did) (\d+(?:\.\d+)?) (?:(\d+(?:\.\d+)?) )?and (\d+(?:\.\d+)?)\b(?! (?:percent|games|seasons|years|times))/);
    if(m3){ const nums = [m3[1], m3[2], m3[3]].filter(x => x != null).map(Number), keys = nums.length === 3 ? ["pts", "trb", "ast"] : ["pts", "trb"];
      nums.forEach((v, i) => out.push({s: QSTAT.find(s => s.k === keys[i]), v, c: ">=", tot: false})); return out; } }
  // "a triple-double average"
  if(/averag\w* a triple double/.test(q) && !out.length) ["pts", "trb", "ast"].forEach(k => out.push({s: QSTAT.find(s => s.k === k), v: 10, c: ">=", tot: false}));
  return out;
}
function seasonFilter(q, Q){
  let lo = -1e9, hi = 1e9, label = "", m;
  if(/this (season|year)|so far this/.test(q)){ const y = +Q.current.slice(0, 4); return {lo: y, hi: y, label: `this season (${Q.current})`}; }
  if((m = q.match(/\b(19[4-9]\d|20[0-4]\d) (\d\d)\b/))){ const y = +m[1]; return {lo: y, hi: y, label: `in ${y}-${m[2]}`}; }
  if((m = q.match(/between (19[4-9]\d|20[0-4]\d) and (19[4-9]\d|20[0-4]\d)/))) return {lo: +m[1] - 1, hi: +m[2] - 1, label: `from ${m[1]} to ${m[2]}`};
  if((m = q.match(/since (?:the )?(19[4-9]\d|20[0-4]\d)/))){ lo = +m[1]; label = `since ${m[1]}`; }
  if((m = q.match(/(?:before|prior to) (?:the )?(19[4-9]\d|20[0-4]\d)/))){ hi = +m[1] - 2; label = (label ? label + " and " : "") + `before ${m[1]}`; }
  if((m = q.match(/in the (?:19|20)?(\d0)s\b/))){ const d = +m[1], y = d >= 40 ? 1900 + d : 2000 + d; lo = y - 1; hi = y + 8; label = `in the ${y}s`; }
  if((m = q.match(/(?:last|past) (\d+) (?:seasons|years)/))){ const cy = +Q.current.slice(0, 4); lo = cy - +m[1]; hi = cy - 1; label = `in the last ${m[1]} seasons`; }
  if(lo === -1e9 && hi === 1e9 && (m = q.match(/\bin (19[4-9]\d|20[0-4]\d)\b/))){ const y = +m[1]; return {lo: y - 1, hi: y - 1, label: `in ${y - 1}-${String(y).slice(2)}`}; }
  return {lo, hi, label};
}
function ageFilter(q){
  let m;
  if((m = q.match(/(?:age|aged) (\d\d) or (younger|under)|(\d\d) (?:years old )?or younger|younger than (\d\d)|under (?:the age of )?(\d\d) years|under age (\d\d)/))){ const n = +(m[1] || m[3] || m[4] || m[5] || m[6]); const strict = !!(m[4] || m[5] || m[6]); return {f: a => a != null && (strict ? a < n : a <= n), label: strict ? `younger than ${n}` : `age ${n} or younger`}; }
  if((m = q.match(/(?:age|aged) (\d\d) or older|(\d\d) (?:years old )?or older|older than (\d\d)|over (?:the age of )?(\d\d) years/))){ const n = +(m[1] || m[2] || m[3] || m[4]); const strict = !!(m[3] || m[4]); return {f: a => a != null && (strict ? a > n : a >= n), label: strict ? `older than ${n}` : `age ${n} or older`}; }
  if((m = q.match(/(?:before|by|until) (?:the )?age (?:of )?(\d\d)|before (?:he|they) (?:was|were|turned) (\d\d)/))){ const n = +(m[1] || m[2]); return {f: a => a != null && a < n, label: `before age ${n}`}; }
  if((m = q.match(/\b(?:at|aged?) (\d\d)\b(?! (?:points|rebounds|assists))/))){ const n = +m[1]; return {f: a => a === n, label: `at age ${n}`}; }
  return null;
}
const per = (r, k) => r[k] == null || !r.g ? null : r[k] / r.g;
const f1s = v => v == null ? "—" : (Math.round(v * 10) / 10).toFixed(1);
const pctOf = (r, P) => r[P.a] ? r[P.m] / r[P.a] * 100 : null;
async function statQuery(raw, p, teams){
  const q = qnorm(raw);
  const T = thresholds(q);
  const stat1 = (/percent|percentage|pct|shoot/.test(q) && QPCT.find(P => new RegExp(`\\b(?:${P.re})\\b`).test(q))) || QSTAT.find(s => s.k !== "g" && new RegExp(`\\b(?:${s.re})\\b`).test(q));
  const leaderMode = !T.length && stat1 && /(in a|single|one|any) season|season (record|high)|career|all time|ever|history/.test(q) && /most|highest|best|top|lead|record|who averaged|fewest|lowest/.test(q);
  if(!T.length && !leaderMode) return null;
  const Q = await qseasons(); if(!Q) return null;
  const known = new Set((await players()).map(x => x.id));
  if(!p){ // older players who aren't in the site's player files (before 1973-74)
    if(!Q.names){ Q.names = new Map(); Q.rows.forEach(r => { if(!Q.names.has(r.id)) Q.names.set(r.id, {id: r.id, name: r.name, k: fold(r.name)}); }); }
    const fq = fold(raw); let best = null; Q.names.forEach(x => { if(x.k.length > 6 && new RegExp(`\\b${x.k}\\b`).test(fq) && (!best || x.k.length > best.k.length)) best = x; });
    if(best) p = best;
  }
  const career = /career/.test(q), rookie = /rookie/.test(q), SF = seasonFilter(q, Q), AF = ageFilter(q);
  const fr = teams && teams.length === 1 && !p ? teams[0] : null, codes = fr ? (FRANCH[fr] || fr).split(" ") : null;
  const notes = [];
  const withCur = SF.label.startsWith("this season") || /including this|this season|so far|currently|right now/.test(q);
  let rows = Q.rows.filter(r => r.y >= SF.lo && r.y <= SF.hi && (withCur || r.season !== Q.current));
  if(p) rows = rows.filter(r => r.id === p.id);
  if(rookie) rows = rows.filter(r => Q.first[r.id] === r.y && r.y > 1946);
  if(codes) rows = rows.filter(r => String(r.team).split("/").some(t => codes.includes(t)));
  if(AF) rows = rows.filter(r => AF.f(r.age));
  const POS = posIn(q); if(POS) rows = rows.filter(r => POS.has(r.ps));
  // which stats are tracked: drop seasons that didn't count what's asked
  const asked = T.map(t => t.s || t.p).concat(leaderMode ? [stat1] : []);
  const since = Math.max(0, ...asked.map(s => s.since || 0));
  if(since && +Q.seasons[0].slice(0, 4) + 1 < since){ rows = rows.filter(r => r.y + 1 >= since); notes.push(`${asked.filter(s => s.since).map(s => s.name[0].toUpperCase() + s.name.slice(1)).join(" and ")} ${asked.filter(s => s.since).length > 1 ? "have" : "has"} only been counted since ${since - 1}-${String(since).slice(2)}.`); }
  // career: add each player's seasons together
  if(career){ const by = {}; rows.forEach(r => { const o = by[r.id] = by[r.id] || {id: r.id, name: r.name, season: "", y: r.y, y2: r.y, g: 0, team: "", seasons: 0}; o.seasons++; o.y = Math.min(o.y, r.y); o.y2 = Math.max(o.y2, r.y);
      ["g", "mp", "pts", "trb", "ast", "stl", "blk", "tov", "fg", "fga", "fg3", "fg3a", "ft", "fta"].forEach(k => { if(r[k] != null) o[k] = (o[k] || 0) + r[k]; }); });
    rows = Object.values(by).map(o => Object.assign(o, {season: `${o.y}-${String(o.y2 + 1).slice(2)}`})); }
  const minG = r => career ? (p ? 1 : 400) : Math.max(1, Math.ceil(0.7 * (Q.maxG[r.season] || 0)));
  const scale = r => career ? 1 : (Q.maxG[r.season] || 82) / 82;
  const okPct = (r, P) => career ? (r[P.a] || 0) >= P.min * 3 : (r[P.m] || 0) >= P.min * scale(r);
  const val = (r, t) => t.p ? pctOf(r, t.p) : t.tot ? r[t.s.k] : per(r, t.s.k);
  const pass = (r, t) => { const v = val(r, t); if(v == null) return false; if(t.p && !okPct(r, t.p)) return false; if(!t.tot && !t.p && (r.g || 0) < minG(r)) return false;
    return t.c === "<" ? v < t.v : v >= t.v - 1e-9; };
  const cols = []; const addCol = c => { if(!cols.some(x => x.k === c.k)) cols.push(c); };
  T.forEach(t => addCol(t.p ? {k: t.p.k, lab: t.p.lab, f: r => f1s(pctOf(r, t.p))} : {k: t.s.k + (t.tot ? "T" : ""), lab: t.tot ? t.s.lab + " total" : t.s.lab, f: r => t.tot ? String(r[t.s.k] ?? "—") : f1s(per(r, t.s.k))}));
  if(leaderMode) addCol(stat1.m ? {k: stat1.k, lab: stat1.lab, f: r => f1s(pctOf(r, stat1))} : {k: stat1.k, lab: stat1.lab, f: r => f1s(per(r, stat1.k))});
  ["pts", "trb", "ast"].forEach(k => { if(cols.length < 4){ const S = QSTAT.find(s => s.k === k); addCol({k, lab: S.lab, f: r => f1s(per(r, k))}); } });
  const scope = [POS ? `by ${POS.lab}` : "", SF.label, codes ? `for the ${TEAMS[fr]}` : "", rookie ? "as a rookie" : "", AF ? AF.label : "", p ? "" : ""].filter(Boolean).join(", ");
  const desc = T.map(t => t.p ? `${t.c === "<" ? "under " : ""}${t.v}% ${t.p.name.replace(" %", "")}` : `${t.c === "<" ? "under " : ""}${t.v}${t.c === "<" ? "" : "+"} ${t.s.name}${t.tot ? (career ? "" : " in a season") : (career ? " a game" : " a game")}`);
  const descTxt = desc.length > 1 ? desc.slice(0, -1).join(", ") + " and " + desc[desc.length - 1] : desc[0];
  const link = r => known.has(r.id) ? plink(r.name, r.id) : esc(r.name);
  const pName = x => known.has(x.id) ? plink(x.name, x.id) : esc(x.name);
  const lineOf = r => cols.map(c => `<b>${esc(c.f(r))}</b> <small>${esc(c.lab)}</small>`).join(" · ");
  const rowHtml = (r, i) => [i + 1, `${link(r)}<br><small>${esc(career ? `${r.season} · ${r.g} games` : `${r.season} · ${String(r.team).replace(/\//g, ", ")}${r.pos ? " · " + r.pos : ""}${r.cpos && r.cpos !== r.pos ? ` (career ${r.cpos})` : ""}`)}</small>`, `<span class="ask-line">${lineOf(r)}</span>`];
  const tbl = (title, list) => table(title, list.slice(0, 15).map(rowHtml)) + (list.length > 15 ? `<details class="ask-more"><summary>Show all ${list.length}</summary>${table(title, list.slice(15).map((r, i) => rowHtml(r, i + 15)))}</details>` : "");
  if(!career) notes.push(`Per-game numbers count seasons with at least 70% of that season's games.`);
  else if(!p) notes.push("Career numbers include players with 400+ games.");
  if(!withCur) notes.push(`This season (${Q.current}) isn't counted until it's over; add "this season" to ask about it.`);
  if(POS) notes.push(`Positions are as listed for each season, plus each player's career listing, so a player listed at more than one position counts at each.${/point|shooting|small|power/.test(POS.lab) ? " Before 1973-74 many players are listed only as a guard or forward, so those seasons may not count." : ""}`);
  if(rookie) notes.push("A rookie season is a player's first NBA season (ABA years aren't included).");
  notes.push(`Regular season only, ${Q.seasons[0]} to ${Q.current}.`);
  // leaders: "most points per game in a season", "career assists leader"
  if(leaderMode){
    const low = /fewest|lowest|worst/.test(q), tot = (career && !/averag|per game|a game|ppg|rpg|apg/.test(q)) || /\btotal|most (points|rebounds|assists|steals|blocks|threes|3s|3 pointers|three pointers|minutes|turnovers)\b(?! (per|a) game)/.test(q) && !/averag|per game|a game|ppg|rpg|apg/.test(q);
    const v = r => stat1.m ? (okPct(r, stat1) ? pctOf(r, stat1) : null) : tot ? r[stat1.k] : ((r.g || 0) >= minG(r) ? per(r, stat1.k) : null);
    const list = rows.filter(r => v(r) != null).sort((a, b) => low ? v(a) - v(b) : v(b) - v(a));
    if(!list.length) return {html: `<p class="ask-a">I couldn't find any seasons that match.</p>`};
    if(tot && !stat1.m){ cols.splice(0, 1, {k: stat1.k + "T", lab: stat1.lab + " total", f: r => (r[stat1.k] ?? 0).toLocaleString()}); }
    const top = list[0], what = `${stat1.name}${tot || stat1.m ? "" : " per game"}`;
    return {html: `<p class="ask-a">${low ? "Fewest" : stat1.m ? "Best" : "Most"} ${esc(what)} ${career ? "in a career" : "in a season"}${scope ? " " + esc(scope) : ""}: <b>${link(top)}</b> with <b>${esc(cols[0].f(top))}</b>${career ? "" : ` in ${esc(top.season)}`}.</p>${tbl(career ? "Career leaders" : "Best seasons", list.slice(0, 50))}<p class="ask-n">${esc(notes.join(" "))}</p>`, href: "history.html", more: "NBA History"};
  }
  const hits = rows.filter(r => T.every(t => pass(r, t)));
  const sortT = T.find(t => !t.p && t.c !== "<") || T[0];
  hits.sort((a, b) => /most recent|latest|last/.test(q) ? b.y - a.y : (val(b, sortT) || 0) - (val(a, sortT) || 0));
  const byP = new Map(); hits.forEach(r => { const o = byP.get(r.id) || {id: r.id, name: r.name, n: 0, yrs: []}; o.n++; o.yrs.push(r.season); byP.set(r.id, o); });
  if(p){
    const what = career ? (hits.length ? "has" : "hasn't") : "";
    return {html: `<p class="ask-a">${career ? `<b>${pName(p)}</b> ${what} averaged ${esc(descTxt)} for his career${hits.length ? ` (${esc(cols.map(c => `${c.f(hits[0])} ${c.lab}`).join(", "))})` : ""}.` : `<b>${pName(p)}</b> ${hits.length ? `did it in <b>${hits.length}</b> season${hits.length === 1 ? "" : "s"}` : "never did it"}: ${esc(descTxt)}${scope ? ", " + esc(scope) : ""}.`}</p>
      ${hits.length && !career ? tbl(`${p.name}'s seasons`, hits) : ""}<p class="ask-n">${esc(notes.join(" "))}</p>`, href: known.has(p.id) ? `pe.html#/player/${encodeURIComponent(p.id)}` : "history.html", more: known.has(p.id) ? `${p.name}'s page` : "NBA History"};
  }
  if(!hits.length) return {html: `<p class="ask-a">Nobody has ${career ? "averaged" : "had a season with"} ${esc(descTxt)}${scope ? ", " + esc(scope) : ""}.</p><p class="ask-n">${esc(notes.join(" "))}</p>`, href: "history.html", more: "NBA History"};
  const most = /most (seasons|times|years)|how many (seasons|times) has|who has done it the most/.test(q);
  const P = [...byP.values()].sort((a, b) => b.n - a.n || a.yrs[0].localeCompare(b.yrs[0]));
  const head = career ? `<b>${P.length}</b> player${P.length === 1 ? " has" : "s have"} averaged ${esc(descTxt)} for a career${scope ? ", " + esc(scope) : ""}.`
    : `<b>${P.length}</b> player${P.length === 1 ? " has" : "s have"} done it in <b>${hits.length}</b> season${hits.length === 1 ? "" : "s"}: ${esc(descTxt)}${scope ? ", " + esc(scope) : ""}.${P[0].n > 1 ? ` <b>${link(P[0])}</b> has the most (${P[0].n}).` : ""}`;
  const byPlayer = table("Most seasons", P.slice(0, 10).map((x, i) => [i + 1, link(x), `<b>${x.n}</b>`, `<small>${esc(x.yrs.slice().sort().slice(0, 4).join(", "))}${x.n > 4 ? "…" : ""}</small>`]));
  return {html: `<p class="ask-a">${head}</p>${most && !career ? byPlayer + tbl("Every season", hits) : tbl(career ? "Careers" : "Every season", hits) + (!career && P.length > 1 && P[0].n > 1 && P.length < hits.length ? `<details class="ask-more"><summary>By player</summary>${byPlayer}</details>` : "")}<p class="ask-n">${esc(notes.join(" "))}</p>`, href: "history.html", more: "NBA History"};
}
/* ---------- the router ---------- */
async function answer(raw){
  if(!looksLikeQuestion(raw)) return null;
  let q = fold(String(raw).replace(/%/g, " percent ").replace(/-/g, " ")).replace(/\bthe\b/g, " ").replace(/\s+/g, " ").trim();
  Object.entries(PALIAS).forEach(([k, v]) => { q = q.replace(new RegExp(`\\b${k}\\b`, "g"), v); });
  const teams = teamIn(q);
  if(/\b(draft|prospect|mock|big board|number one pick|no 1 pick|first pick)\b/.test(q) && !/drafted|draft pick history/.test(q)) return draftAnswer();
  { const pp = await playerIn(q), sq = await statQuery(raw, pp, teams); if(sq) return sq; }
  const thisSeason = /this (season|year)|right now|currently|so far|leading|leads?|leader/.test(q);
  // history: championships
  if(/champion|title|ring|won it all|finals winner|won the finals/.test(q) && !/finals mvp/.test(q)) return champAnswer(q, teams[0]);
  // awards: races this season, else history
  const aw = AWARD.find(([re]) => re.test(q));
  if(aw && /race|favorite|leading|frontrunner|front runner|who will win|odds|this season|this year/.test(q) && ["mvp", "roy", "smoy"].includes(aw[1])) return raceAnswer(q);
  const p = await playerIn(q);
  if(aw) return awardAnswer(q, aw[1], /most|who has|who won|which player/.test(q) && !p ? null : p);
  // injuries
  if(/injur|hurt|out tonight|status|questionable|playing tonight/.test(q)){ if(p) return injuryAnswer(p); if(teams[0]) return teamAnswer(q, teams[0]); }
  // career / single-season all-time
  if(/career|all time|ever|history|in a season|single season|of all time/.test(q) && /most|leader|leading|who has/.test(q)){
    const c = CAREER.find(([re]) => re.test(q)); if(c) return careerAnswer(q, c[1], c[2]); }
  // most points in a game
  if(/(in a|single) game|career high|season high/.test(q) && /point/.test(q) && !p) return highGame(q);
  // team scoring / defense
  if(!p && /team/.test(q) && /(most|best|fewest|scor|offense|defen|allow)/.test(q) && !teams.length) return teamStatAnswer(q);
  // standings / best record
  if(/record|standings|first place|1st place|best team|worst team|seed/.test(q) && !p){ if(teams[0] && !/best|worst/.test(q)) return teamAnswer(q, teams[0]); return standingsAnswer(q); }
  // a player's numbers
  if(p && /averag|stats|doing|playing|numbers|how many|how is|how s|season/.test(q)){
    const st = STAT.find(s => s.re.test(q)); if(st && /how many/.test(q)) return playerLine(p);
    return playerLine(p); }
  // league leaders this season
  const st = STAT.find(s => s.re.test(q));
  if(st && (/most|lead|leader|top|best|fewest|highest|who has/.test(q) || thisSeason) && !teams.length) return leaders(q, st);
  // team: next game, record, injuries
  if(teams[0]) return teamAnswer(q, teams[0]);
  if(p) return playerLine(p);
  return null;
}
const CSS = `.ask{padding:10px 12px 12px;border-bottom:1px solid var(--line,#dde2ea);font:14px/1.45 Inter,system-ui,sans-serif;}
.ask .ask-k{font:700 10.5px Inter,sans-serif;text-transform:uppercase;letter-spacing:.6px;color:var(--accent,#C8102E);margin-bottom:4px;}
.ask .ask-a{margin:0 0 8px;} .ask .ask-a a,.ask .ask-t a{color:inherit;}
.ask .ask-n{margin:6px 0 0;color:var(--dim,#5b6475);font-size:12px;}
.ask .ask-t{border:1px solid var(--line,#dde2ea);border-radius:10px;overflow:hidden;font-size:13px;}
.ask .ask-th{font:700 11px Inter,sans-serif;text-transform:uppercase;letter-spacing:.5px;color:var(--dim,#5b6475);padding:6px 10px;background:var(--row,#f6f8fb);}
.ask .ask-r{display:flex;gap:8px;align-items:baseline;padding:5px 10px;border-top:1px solid var(--line,#dde2ea);} .ask .ask-r .c0{width:18px;color:var(--dim,#5b6475);flex:none;} .ask .ask-r .c1{flex:1;min-width:0;}
.ask .ask-r small{color:var(--dim,#5b6475);}
.ask .ask-chips{display:flex;flex-wrap:wrap;gap:6px;} .ask .ask-chips span{font-size:12px;padding:3px 8px;border-radius:999px;background:var(--row,#f2f4f8);}
.ask .ask-line{display:inline-block;text-align:right;white-space:normal;} .ask .ask-r .c2:has(.ask-line){text-align:right;max-width:58%;}
.ask .ask-more{margin-top:6px;} .ask .ask-more summary{cursor:pointer;font-weight:600;font-size:13px;margin-bottom:6px;}
.ask .ask-go{display:inline-block;margin-top:8px;font-weight:600;font-size:13px;}
.ask.none{color:var(--dim,#5b6475);font-size:13px;}`;
function css(){ if(document.getElementById("askCss")) return; const s = document.createElement("style"); s.id = "askCss"; s.textContent = CSS; document.head.appendChild(s); }
const EXAMPLES = ["How many players averaged 25, 10 and 8 in a season?", "Who has won the most MVPs?", "Who leads the league in 3-pointers?", "When do the Lakers play next?", "What's the best record in the East?", "Is Haliburton hurt?", "How is Wembanyama doing?", "Who won the 2016 title?", "Most career assists"];
window.Ask = {looksLikeQuestion, answer, css, EXAMPLES};
})();
