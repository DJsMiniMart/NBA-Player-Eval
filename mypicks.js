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
  try{ const d = JSON.parse(localStorage.getItem(KEY) || "{}"); return d && typeof d === "object" && d.picks ? d : {picks:{}}; }
  catch(_){ return {picks:{}}; }
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
  const k = pid(u.id, type), cur = DB.picks[k];
  if(cur && cur.side === side){ delete DB.picks[k]; }
  else { const p = make(u, o, type, side); if(!p) return {ok:false, why:"That line isn't available."}; DB.picks[k] = p; }
  const ok = save(DB);
  listeners.forEach(f => f());
  return ok ? {ok:true} : {ok:false, why:"This browser won't let the site save (private mode?)."};
}
const pickOf = (gid, type) => DB.picks[pid(gid, type)] || null;

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
function exportData(){ return JSON.stringify(DB, null, 1); }
function importData(text){
  const d = JSON.parse(text);
  if(!d || typeof d.picks !== "object") throw new Error("That file isn't a My Picks backup.");
  Object.assign(DB.picks, d.picks); save(DB); listeners.forEach(f => f());
  return Object.keys(d.picks).length;
}
function remove(k){ delete DB.picks[k]; save(DB); listeners.forEach(f => f()); }

window.MyPicks = {options, toggle, pickOf, started, finals, graded, record, betText, profit, exportData, importData, remove,
  all: () => DB.picks, count: () => Object.keys(DB.picks).length, onChange: f => listeners.push(f), SPREAD_ODDS};
})();
