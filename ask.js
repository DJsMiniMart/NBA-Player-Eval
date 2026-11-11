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
  return /\?\s*$/.test(raw) || QWORDS.test(q) || /\b(leads?|leading|most|fewest|record|next game|play next|injur|hurt|mvp|champion|standings|averag|stats|race|rings?)\b/.test(q);
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
    o.pulse = o.min ? (o.pts + 2 * o.ast + 2 * o.reb + 4 * o.stl + o.blk - 4 * o.tov) / o.min : 0; return o; });
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
/* ---------- the router ---------- */
async function answer(raw){
  if(!looksLikeQuestion(raw)) return null;
  let q = fold(String(raw).replace(/%/g, " percent ").replace(/-/g, " ")).replace(/\bthe\b/g, " ").replace(/\s+/g, " ").trim();
  Object.entries(PALIAS).forEach(([k, v]) => { q = q.replace(new RegExp(`\\b${k}\\b`, "g"), v); });
  const teams = teamIn(q);
  if(/\b(draft|prospect|mock|big board|number one pick|no 1 pick|first pick)\b/.test(q) && !/drafted|draft pick history/.test(q)) return draftAnswer();
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
.ask .ask-go{display:inline-block;margin-top:8px;font-weight:600;font-size:13px;}
.ask.none{color:var(--dim,#5b6475);font-size:13px;}`;
function css(){ if(document.getElementById("askCss")) return; const s = document.createElement("style"); s.id = "askCss"; s.textContent = CSS; document.head.appendChild(s); }
const EXAMPLES = ["Who has won the most MVPs?", "Who leads the league in 3-pointers?", "When do the Lakers play next?", "What's the best record in the East?", "Is Haliburton hurt?", "How is Wembanyama doing?", "Who won the 2016 title?", "Most career assists"];
window.Ask = {looksLikeQuestion, answer, css, EXAMPLES};
})();
