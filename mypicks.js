/* My Picks: your own bets on upcoming games, saved in this browser, graded when games end, and compared with
   Pulse and the Vegas favorites on the same games.
   A pick = one bet type per game: moneyline (a team at its odds), spread (a team at the line) or total (over/under).
   The line and odds are locked in when you pick. Spread and total bets are graded at -110 (the usual price);
   moneyline bets at the moneyline shown. Everything is in units: each bet risks 1 unit. */
(function(){
"use strict";
const KEY = "fcgp-mypicks-v1";
const SPREAD_ODDS = -110;
const ESPN = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba";

function load(){
  try{ const d = JSON.parse(localStorage.getItem(KEY) || "{}"); const o = d && typeof d === "object" && d.picks ? d : {picks:{}}; o.props = o.props || {}; o.parlays = o.parlays || {}; o.locks = o.locks || {}; return o; }
  catch(_){ return {picks:{}, props:{}, parlays:{}, locks:{}}; }
}
function save(d){ try{ localStorage.setItem(KEY, JSON.stringify(d)); return true; }catch(_){ return false; } }
let DB = load();
window.addEventListener("storage", e => { if(e.key === KEY){ DB = load(); listeners.forEach(f => f()); } });
const listeners = [];

const pid = (gid, type) => gid + ":" + type;
const started = t => Date.now() >= new Date(t).getTime();
const profit = (odds, res) => res === "W" ? (odds > 0 ? odds / 100 : 100 / -odds) : res === "L" ? -1 : 0;
const implied = ml => ml == null ? null : ml < 0 ? -ml / (-ml + 100) : 100 / (ml + 100);

/* the bets offered for a game: [{type, side, label, line, odds}] */
function options(u, o){
  if(!o) return [];
  const out = [];
  if(o.mlAway != null && o.mlHome != null){
    out.push({type:"ml", side:u.away, line:null, odds:o.mlAway});
    out.push({type:"ml", side:u.home, line:null, odds:o.mlHome});
  }
  if(o.spread != null){
    out.push({type:"spread", side:u.away, line:-o.spread, odds:SPREAD_ODDS});
    out.push({type:"spread", side:u.home, line:o.spread, odds:SPREAD_ODDS});
  }
  if(o.total != null){
    out.push({type:"total", side:"over", line:o.total, odds:SPREAD_ODDS});
    out.push({type:"total", side:"under", line:o.total, odds:SPREAD_ODDS});
  }
  return out;
}

/* what Pulse and the Vegas favorite would take on this same bet type (saved with your pick) */
function rivals(u, o, type){
  const r = {pulse:null, vegas:null};
  if(type === "ml"){
    if(u.pick) r.pulse = {side:u.pick, line:null, odds:u.pick === u.home ? o.mlHome : o.mlAway};
    const ih = implied(o.mlHome), ia = implied(o.mlAway);
    if(ih != null && ia != null){ const fav = ih >= ia ? u.home : u.away; r.vegas = {side:fav, line:null, odds:fav === u.home ? o.mlHome : o.mlAway}; }
  } else if(type === "spread"){
    if(u.margin != null && o.spread != null){
      const side = u.margin + o.spread > 0 ? u.home : u.away;
      r.pulse = {side, line:side === u.home ? o.spread : -o.spread, odds:SPREAD_ODDS};
    }
    if(o.spread != null && o.spread !== 0){ const fav = o.spread < 0 ? u.home : u.away; r.vegas = {side:fav, line:fav === u.home ? o.spread : -o.spread, odds:SPREAD_ODDS}; }
  }
  return r;
}

function make(u, o, type, side){
  const opt = options(u, o).find(x => x.type === type && x.side === side);
  if(!opt) return null;
  const rv = rivals(u, o, type);
  return {gid:u.id, t:u.t, home:u.home, away:u.away, type, side, line:opt.line, odds:opt.odds,
          at:new Date().toISOString(), book:o.book || "", pulse:rv.pulse, vegas:rv.vegas};
}
/* tap a bet: pick it, switch to the other side, or (tapping your pick again) take it back */
function toggle(u, o, type, side){
  if(started(u.t)) return {ok:false, why:"This game has started, so picks are locked."};
  const k = pid(u.id, type), cur = DB.picks[k], night = nightOf(u.t);
  if(!cur && used(night) >= limitFor(night)) return {ok:false, why:`You've used all ${limitFor(night)} picks for that night. Take one back to make another.`};
  if(cur && cur.side === side){ delete DB.picks[k]; if(DB.locks[night] === k) delete DB.locks[night]; Object.keys(DB.parlays).forEach(x => { if(DB.parlays[x].legs.includes(k)) delete DB.parlays[x]; }); }
  else { const p = make(u, o, type, side); if(!p) return {ok:false, why:"That line isn't available."}; DB.picks[k] = p; }
  const ok = save(DB);
  listeners.forEach(f => f());
  return ok ? {ok:true} : {ok:false, why:"This browser won't let the site save (private mode?)."};
}
const pickOf = (gid, type) => DB.picks[pid(gid, type)] || null;

/* ---------- nightly limit, counting game lines, player props and parlay tickets. It depends on how many games are on:
   1-2 games: 8 picks · 3-4: 12 · 5-7: 15 · 8-11: 18 · 12+: 22. Picks already made stay if the count changes. ---------- */
const LIMIT = 10;   // used until the schedule loads
const LIMITS = [[2, 8], [4, 12], [7, 15], [11, 18], [Infinity, 22]];
let SLATE = null;   // night -> number of games
fetch("data/schedule.json?t=" + Math.floor(Date.now() / 36e5)).then(r => r.ok ? r.json() : null).then(d => {
  if(!d || !d.games) return; SLATE = {}; d.games.forEach(g => { const n = nightOf(g[1]); SLATE[n] = (SLATE[n] || 0) + 1; }); listeners.forEach(f => f());
}).catch(() => {});
const gamesOn = night => (SLATE && SLATE[night]) || 0;
const limitFor = night => { const n = gamesOn(night); return n ? LIMITS.find(([m]) => n <= m)[1] : LIMIT; };
const pad = n => String(n).padStart(2, "0");
const nightOf = t => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const used = night => Object.values(DB.picks).filter(p => nightOf(p.t) === night).length + Object.values(DB.props).filter(p => nightOf(p.t) === night).length + Object.values(DB.parlays).filter(p => p.night === night).length;
const done = () => { const ok = save(DB); listeners.forEach(f => f()); return ok ? {ok:true} : {ok:false, why:"This browser won't let the site save (private mode?)."}; };

/* ---------- Lock of the Day: one pick a night counts double if it wins and costs 25 if it loses ---------- */
function setLock(k){
  const p = DB.picks[k]; if(!p) return {ok:false, why:"Pick that bet first."};
  if(started(p.t)) return {ok:false, why:"That game has started."};
  const night = nightOf(p.t), cur = DB.locks[night];
  if(cur && cur !== k && DB.picks[cur] && started(DB.picks[cur].t)) return {ok:false, why:"Your lock for that night is already in a game that started."};
  if(cur === k) delete DB.locks[night]; else DB.locks[night] = k;
  return done();
}
const lockOf = night => DB.locks[night] || null;

/* ---------- Pulse props: over/under a player's points, rebounds or assists; the line is his season average (to the half point) ---------- */
function propsFor(u, P){
  if(!P || !P.players) return [];
  const C = P.cols, ix = k => C.indexOf(k), out = [];
  [u.away, u.home].forEach(team => {
    const L = P.players.filter(r => r[ix("team")] === team && r[ix("g")] >= 3 && r[ix("min")] / r[ix("g")] >= 20).map(r => ({id: String(r[ix("id")]), name: r[ix("name")], team, g: r[ix("g")],
      pts: r[ix("pts")] / r[ix("g")], reb: (r[ix("dreb")] + r[ix("oreb")]) / r[ix("g")], ast: r[ix("ast")] / r[ix("g")]}));
    const seen = new Set(), add = (x, stat) => { if(!x || seen.has(x.id + stat)) return; seen.add(x.id + stat); out.push({key: `${u.id}:${x.id}:${stat}`, gid: u.id, t: u.t, pid: x.id, name: x.name, team, stat, line: Math.floor(x[stat]) + 0.5}); };
    L.slice().sort((a, b) => b.pts - a.pts).slice(0, 2).forEach(x => add(x, "pts"));
    add(L.slice().sort((a, b) => b.reb - a.reb)[0], "reb");
    add(L.slice().sort((a, b) => b.ast - a.ast)[0], "ast");
  });
  return out;
}
function toggleProp(pr, side){
  if(started(pr.t)) return {ok:false, why:"This game has started, so props are locked."};
  const cur = DB.props[pr.key];
  if(cur && cur.side === side){ delete DB.props[pr.key]; Object.keys(DB.parlays).forEach(x => { if(DB.parlays[x].legs.includes(pr.key)) delete DB.parlays[x]; }); return done(); }
  if(!cur && used(nightOf(pr.t)) >= limitFor(nightOf(pr.t))) return {ok:false, why:`You've used all ${limitFor(nightOf(pr.t))} picks for that night.`};
  DB.props[pr.key] = Object.assign({}, pr, {side, at: new Date().toISOString()});
  return done();
}
const propOf = key => DB.props[key] || null;
async function gradeProps(boxOf){
  const out = [];
  for(const p of Object.values(DB.props)){
    if(Date.now() - new Date(p.t) < 2.5 * 36e5){ out.push(Object.assign({}, p, {res: null})); continue; }
    const b = await boxOf(p.gid); if(!b){ out.push(Object.assign({}, p, {res: null})); continue; }
    let row = null; Object.values(b.teams || {}).forEach(T => (T.players || []).forEach(r => { if(String(r[0]) === p.pid) row = r; }));
    if(!row || !(+row[3] > 0)){ out.push(Object.assign({}, p, {res: "V", val: null})); continue; }   // didn't play: void
    const val = p.stat === "pts" ? +row[4] : p.stat === "ast" ? +row[5] : (+row[6]) + (+row[7]);
    out.push(Object.assign({}, p, {val, res: val === p.line ? "P" : ((val > p.line) === (p.side === "over") ? "W" : "L")}));
  }
  return out;
}

/* ---------- parlays: 2-4 of your picks (game lines or player props) from different games on the same night; all must win ---------- */
const PARLAY_MULT = {2: 2.5, 3: 6, 4: 12};
const legOf = k => DB.picks[k] || DB.props[k] || null;
function makeParlay(keys){
  const legs = [...new Set(keys)].filter(k => legOf(k));
  if(legs.length < 2 || legs.length > 4) return {ok:false, why:"A parlay needs 2 to 4 picks."};
  const P = legs.map(legOf), night = nightOf(P[0].t);
  if(P.some(p => nightOf(p.t) !== night)) return {ok:false, why:"Parlay legs must all be on the same night."};
  if(new Set(P.map(p => p.gid)).size !== legs.length) return {ok:false, why:"Each leg has to be from a different game."};
  if(P.some(p => started(p.t))) return {ok:false, why:"One of those games has started."};
  if(used(night) >= limitFor(night)) return {ok:false, why:`You've used all ${limitFor(night)} picks for that night.`};
  const id = "x" + Date.now().toString(36);
  DB.parlays[id] = {id, night, legs, t: P.map(p => p.t).sort()[0], at: new Date().toISOString()};
  return done();
}
function updateParlay(id, keys){
  const old = DB.parlays[id]; if(!old) return {ok:false, why:"That parlay is gone."};
  if(started(old.t)) return {ok:false, why:"That parlay's first game has started."};
  delete DB.parlays[id];
  const r = makeParlay(keys);
  if(!r.ok){ DB.parlays[id] = old; save(DB); return r; }
  const nid = Object.keys(DB.parlays).find(k => !(k in {}) && DB.parlays[k].at && k !== id && JSON.stringify(DB.parlays[k].legs) === JSON.stringify([...new Set(keys)].filter(k2 => legOf(k2))));
  return {ok:true, id: nid};
}
function removeParlay(id){ const x = DB.parlays[id]; if(x && started(x.t)) return {ok:false, why:"That parlay's first game has started."}; delete DB.parlays[id]; return done(); }

/* grade one side of a bet from the final score */
function gradeBet(b, type, home, away, hs, as){
  if(!b) return null;
  if(type === "ml") return hs === as ? "P" : ((b.side === home) === (hs > as) ? "W" : "L");
  if(type === "spread"){ const mine = b.side === home ? hs - as : as - hs, v = mine + b.line; return v > 0 ? "W" : v < 0 ? "L" : "P"; }
  if(type === "total"){ const v = hs + as - b.line; return v === 0 ? "P" : ((v > 0) === (b.side === "over") ? "W" : "L"); }
  return null;
}

/* final scores: data/schedule.json first, then ESPN for anything that ended since the last site update */
async function finals(sched){
  const out = {};
  ((sched && sched.games) || []).forEach(g => { if(g[4] === 3) out[g[0]] = [g[5], g[6]]; });
  const need = [...new Set(Object.values(DB.picks).filter(p => !out[p.gid] && Date.now() - new Date(p.t) > 2 * 36e5).map(p => p.gid))].slice(0, 25);
  await Promise.all(need.map(async gid => {
    try{
      const j = await fetch(`${ESPN}/summary?event=${gid}`).then(r => r.json());
      const c = j && j.header && j.header.competitions && j.header.competitions[0];
      if(!c || !c.status || !c.status.type || !c.status.type.completed) return;
      const h = c.competitors.find(x => x.homeAway === "home"), a = c.competitors.find(x => x.homeAway === "away");
      out[gid] = [+h.score, +a.score];
    }catch(_){}
  }));
  return out;
}
function graded(F){
  return Object.values(DB.picks).map(p => {
    const f = F[p.gid];
    const g = f ? {you:gradeBet(p, p.type, p.home, p.away, f[0], f[1]), pulse:gradeBet(p.pulse, p.type, p.home, p.away, f[0], f[1]), vegas:gradeBet(p.vegas, p.type, p.home, p.away, f[0], f[1])} : null;
    return Object.assign({}, p, {score:f || null, res:g});
  }).sort((a, b) => String(b.t).localeCompare(String(a.t)));
}
function record(list, who){
  const r = {w:0, l:0, p:0, units:0, n:0};
  list.forEach(x => {
    if(!x.res || !x.res[who]) return;
    const b = who === "you" ? x : x[who];
    r.n++; r[x.res[who] === "W" ? "w" : x.res[who] === "L" ? "l" : "p"]++;
    r.units += profit(b.odds, x.res[who]);
  });
  return r;
}
function betText(p, b){
  b = b || p;
  if(p.type === "total") return `${b.side === "over" ? "Over" : "Under"} ${b.line}`;
  if(p.type === "spread") return `${b.side} ${b.line === 0 ? "PK" : (b.line > 0 ? "+" : "") + b.line}`;
  return `${b.side} ML ${b.odds > 0 ? "+" : ""}${b.odds}`;
}
/* a parlay leg (game line or player prop) as short text */
function legText(k){ const p = DB.picks[k]; if(p) return betText(p); const r = DB.props[k]; return r ? `${String(r.name).split(" ").slice(-1)[0]} ${r.side} ${r.line} ${r.stat}` : "?"; }
function exportData(){ return JSON.stringify(DB, null, 1); }
function importData(text){
  const d = JSON.parse(text);
  if(!d || typeof d.picks !== "object") throw new Error("That file isn't a My Picks backup.");
  Object.assign(DB.picks, d.picks); Object.assign(DB.props, d.props || {}); Object.assign(DB.parlays, d.parlays || {}); Object.assign(DB.locks, d.locks || {}); save(DB); listeners.forEach(f => f());
  return Object.keys(d.picks).length;
}
function remove(k){ const p = DB.picks[k]; delete DB.picks[k]; if(p && DB.locks[nightOf(p.t)] === k) delete DB.locks[nightOf(p.t)]; Object.keys(DB.parlays).forEach(x => { if(DB.parlays[x].legs.includes(k)) delete DB.parlays[x]; }); save(DB); listeners.forEach(f => f()); }

window.MyPicks = {options, toggle, pickOf, started, finals, graded, record, betText, profit, exportData, importData, remove,
  all: () => DB.picks, count: () => Object.keys(DB.picks).length, onChange: f => listeners.push(f), SPREAD_ODDS,
  LIMIT, LIMITS, limitFor, gamesOn, nightOf, used, setLock, lockOf, locks: () => DB.locks, propsFor, toggleProp, propOf, props: () => DB.props, gradeProps,
  PARLAY_MULT, legOf, legText, isProp: k => !!DB.props[k], makeParlay, updateParlay, removeParlay, parlays: () => DB.parlays, key: pid};
})();
