/* Trade Machine: build a trade between 2-5 teams and check it against the NBA's trade rules,
   including the first and second apron limits. Salaries come from data/contracts.json. */
(function(){
"use strict";

/* League numbers for the season live in cap.js (shared with the team pages). */
const RULES = window.CAP_RULES;
const LAST_DRAFT = RULES.firstDraft + RULES.yearsOut - 1;   // 2033: also the pick a 2nd-apron team can't trade
/* ========================================================================================== */

const BBR_TO_NBA = {BRK:"BKN", CHO:"CHA", PHO:"PHX"};
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const num = s => +String(s || "").replace(/[^\d]/g, "") || 0;
const M = n => (n < 0 ? "−" : "") + "$" + (Math.abs(n)/1e6).toFixed(Math.abs(n) >= 1e8 ? 1 : 2) + "M";
const Mfull = n => (n < 0 ? "−$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
const TEAMS = (window.PlayerPage && PlayerPage.TEAMS) || {};
const CODES = Object.keys(TEAMS).sort((a,b) => TEAMS[a].n.localeCompare(TEAMS[b].n));
const logo = c => TEAMS[c] ? `https://cdn.nba.com/logos/nba/${TEAMS[c].id}/primary/L/logo.svg` : "";
const short = c => TEAMS[c] ? TEAMS[c].n.split(" ").slice(-1)[0] : c;
const ZONES = [
  {k:"under", label:"Under the cap", c:"var(--z-cap)"},
  {k:"over",  label:"Over the cap",  c:"var(--court)"},
  {k:"tax",   label:"Over the tax",  c:"var(--z-tax)"},
  {k:"a1",    label:"Above 1st apron", c:"var(--z-a1)"},
  {k:"a2",    label:"Above 2nd apron", c:"var(--z-a2)"},
];
function zone(p){
  return p > RULES.apron2 ? ZONES[4] : p > RULES.apron1 ? ZONES[3] : p > RULES.tax ? ZONES[2] : p > RULES.cap ? ZONES[1] : ZONES[0];
}
/* Most salary an over-the-cap team below the first apron can take back for `out` dollars going out */
function maxBack(out){
  if(out <= 0) return 0;
  return Math.max(Math.min(2*out + RULES.buffer, out + RULES.bracket), 1.25*out + RULES.buffer);
}
function maxBackRule(out){
  if(2*out + RULES.buffer <= out + RULES.bracket) return `200% of outgoing + $250K`;
  if(out + RULES.bracket >= 1.25*out + RULES.buffer) return `outgoing + ${M(RULES.bracket)}`;
  return `125% of outgoing + $250K`;
}

/* ---------- data ---------- */
let RIGHTS = null, RIGHTS_AT = "";   // team -> year -> round -> {assets, ownOwed, frozen} (picks.js)
let P = new Map();          // id -> player
let ROSTER = {};            // team -> [ids]
let DATA_AT = null;
async function getJSON(path){
  try{ const r = await fetch(path + "?t=" + Date.now()); return r.ok ? await r.json() : null; }catch(_){ return null; }
}
async function load(){
  const [ct, bios, cur, seasons, drafts] = await Promise.all(["contracts","bios","stats","seasons","drafts"].map(f => getJSON(`data/${f}.json`)));
  const past = (seasons || []).filter(s => !s.current)[0];
  const last = past ? await getJSON("data/" + past.file) : null;
  const B = (bios && bios.players) || {}, D = (drafts && drafts.players) || {};
  const curMap = new Map(((cur && cur.players) || []).map(p => [p.id, p]));
  const lastMap = new Map(((last && last.players) || []).map(p => [p.id, p]));
  DATA_AT = ct && ct.at;
  /* who owns which picks: RealGM via the morning update, or the saved copy */
  const ex = await getJSON("data/team_extra.json");
  let pk = ex && ex.picks && Object.keys(ex.picks).length >= 30 ? {teams: ex.picks, asOf: (ex.at || {}).picks} : null;
  if(!pk) pk = await getJSON("picks.json") || await getJSON("data/picks.json");
  if(pk && pk.teams && window.PickRights){ RIGHTS = PickRights.parseAll(pk.teams); RIGHTS_AT = pk.asOf || ""; }
  Object.entries((ct && ct.players) || {}).forEach(([id, c]) => {
    const team = BBR_TO_NBA[c.team] || c.team;
    if(!TEAMS[team]) return;
    const years = (c.years || []).filter(y => y[0] >= RULES.season);
    const now = years.find(y => y[0] === RULES.season);
    if(!now) return;                                   // no salary on the books this season
    const sc = curMap.get(id), sl = lastMap.get(id), b = B[id] || {}, d = D[id];
    const s = sc && sc.g >= 5 ? sc : sl;               // Pulse: this season once he's played 5 games, else last season
    const name = c.name || b.name || (sc && sc.name) || (sl && sl.name) || (d ? `${d.year} #${d.pick} pick` : id);
    P.set(id, {id, team, name, salary:num(now[1]), opt:now[2], years,
      left: years.length, total: years.reduce((t,y)=>t+num(y[1]),0),
      pos: b.pos || (s && s.pos) || "", eval: s ? s.value : null, mpg: s && s.g ? s.mp/s.g : 0, evalSeason: s ? (s === sc ? cur.season : last.season) : ""});
    (ROSTER[team] = ROSTER[team] || []).push(id);
  });
  Object.values(ROSTER).forEach(list => list.sort((a,b) => P.get(b).salary - P.get(a).salary));
}
const payroll = t => (ROSTER[t] || []).reduce((s,id) => s + P.get(id).salary, 0) + (+(S.extra[t] || 0));

/* ---------- trade state ---------- */
/* teams: codes in the trade; move: player id -> team he's going to; picks: [{from,to,year,round,orig,prot}];
   cash: team -> {amt,to}; extra: team -> other cap charges (dead money etc.) */
let S = blank();
function blank(){ return {teams:[], move:{}, picks:[], cash:{}, extra:{}}; }
let pickFormOpen = null;

function save(){
  try{ sessionStorage.setItem("trade", JSON.stringify(S)); }catch(_){}
  const enc = btoa(unescape(encodeURIComponent(JSON.stringify(S)))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
  history.replaceState(null, "", "#t=" + enc);
}
function restore(){
  const h = location.hash.slice(1);
  if(h.startsWith("t=")){
    try{ return clean(JSON.parse(decodeURIComponent(escape(atob(h.slice(2).replace(/-/g,"+").replace(/_/g,"/")))))); }catch(_){}
  }
  const pre = h.split(",").map(x => x.toUpperCase()).map(x => BBR_TO_NBA[x] || x).filter(x => TEAMS[x]);
  if(pre.length) return Object.assign(blank(), {teams: pre.slice(0, 5)});
  try{ const s = JSON.parse(sessionStorage.getItem("trade")); if(s) return clean(s); }catch(_){}
  return null;
}
function clean(s){
  const o = Object.assign(blank(), s);
  o.teams = (o.teams || []).filter(t => TEAMS[t]).slice(0, 5);
  Object.keys(o.move).forEach(id => { const p = P.get(id); if(!p || !o.teams.includes(p.team) || !o.teams.includes(o.move[id]) || o.move[id] === p.team) delete o.move[id]; });
  o.picks = (o.picks || []).filter(k => o.teams.includes(k.from) && o.teams.includes(k.to) && k.from !== k.to);
  return o;
}
function defaultTeams(){
  const busy = CODES.filter(c => ROSTER[c]);
  return busy.length >= 2 ? [busy.includes("LAL") ? "LAL" : busy[0], busy.includes("BOS") ? "BOS" : busy[1]] : busy.slice(0, 2);
}
function otherTeams(t){ return S.teams.filter(x => x !== t); }
function fixTargets(){
  Object.keys(S.move).forEach(id => {
    const p = P.get(id);
    if(!S.teams.includes(p.team)) delete S.move[id];
    else if(!S.teams.includes(S.move[id]) || S.move[id] === p.team) S.move[id] = otherTeams(p.team)[0];
  });
  S.picks = S.picks.filter(k => S.teams.includes(k.from));
  S.picks.forEach(k => { if(!S.teams.includes(k.to) || k.to === k.from) k.to = otherTeams(k.from)[0]; });
  Object.keys(S.cash).forEach(t => {
    if(!S.teams.includes(t)) delete S.cash[t];
    else if(!S.teams.includes(S.cash[t].to) || S.cash[t].to === t) S.cash[t].to = otherTeams(t)[0];
  });
}

/* ---------- the rules ---------- */
function evaluate(){
  const res = {};
  S.teams.forEach(t => res[t] = {t, outP:[], inP:[], outPicks:[], inPicks:[], out:0, in:0, cashOut:0, cashIn:0, checks:[]});
  Object.entries(S.move).forEach(([id, to]) => {
    const p = P.get(id); if(!res[p.team] || !res[to]) return;
    res[p.team].outP.push(p); res[p.team].out += p.salary;
    res[to].inP.push(p); res[to].in += p.salary;
  });
  S.picks.forEach(k => { if(res[k.from]) res[k.from].outPicks.push(k); if(res[k.to]) res[k.to].inPicks.push(k); });
  Object.entries(S.cash).forEach(([t, c]) => { const a = +c.amt || 0; if(a > 0 && res[t] && res[c.to]){ res[t].cashOut += a; res[c.to].cashIn += a; } });

  const seen = new Set(), dupes = new Set();
  S.picks.forEach(k => { const key = `${k.orig}|${k.year}|${k.round}`; if(seen.has(key)) dupes.add(key); seen.add(key); });

  let anything = false;
  Object.values(res).forEach(r => {
    const t = r.t, ck = r.checks;
    const before = payroll(t), after = before - r.out + r.in;
    Object.assign(r, {before, after, zb: zone(before), za: zone(after)});
    const gives = r.outP.length + r.outPicks.length + (r.cashOut > 0 ? 1 : 0);
    const gets = r.inP.length + r.inPicks.length + (r.cashIn > 0 ? 1 : 0);
    if(gives || gets) anything = true;
    if(!gives && !gets){ ck.push({lvl:"bad", msg:`${short(t)} aren't sending or getting anything. Add an asset or remove the team.`}); return; }

    /* 1. salary matching */
    if(r.in <= r.out){
      ck.push({lvl:"ok", msg: r.in === r.out ? `Salary in equals salary out.` : `Takes back less salary than it sends out (${M(r.out - r.in)} less), which is always allowed.`});
    } else if(after <= RULES.cap){
      ck.push({lvl:"ok", msg:`Has the cap room to absorb the extra ${M(r.in - r.out)}: ends ${M(RULES.cap - after)} under the cap.`});
    } else if(after > RULES.apron1){
      ck.push({lvl:"bad", msg:`Would end above the ${after > RULES.apron2 ? "second" : "first"} apron (${M(after)}), so it can't take back more salary than it sends out. It's taking back ${M(r.in - r.out)} more.`});
    } else {
      const cap = maxBack(r.out);
      if(r.out === 0) ck.push({lvl:"bad", msg:`Takes in ${M(r.in)} without sending any salary back and would be ${M(after - RULES.cap)} over the cap. A team over the cap has to send salary out (or use a traded player exception, which this tool doesn't track).`});
      else if(r.in <= cap){
        ck.push({lvl:"ok", msg:`Salaries match: can take back up to ${M(cap)} (${maxBackRule(r.out)}) and takes back ${M(r.in)}.`});
        ck.push({lvl:"warn", msg:`Taking back more salary than it sends out hard-caps ${short(t)} at the first apron (${M(RULES.apron1)}) for the rest of the season.`});
      } else ck.push({lvl:"bad", msg:`Salaries don't match: sending out ${M(r.out)} lets them take back at most ${M(cap)} (${maxBackRule(r.out)}), but they'd take back ${M(r.in)}. Send out ${M(minOutFor(r.in) - r.out)} more or take back less.`});
    }

    /* 2. second apron: no aggregating salaries */
    const biggest = Math.max(0, ...r.outP.map(p => p.salary));
    if(r.outP.length >= 2 && r.in > biggest){
      if(after > RULES.apron2) ck.push({lvl:"bad", msg:`Second apron: a team above the second apron can't combine (aggregate) salaries to take back a bigger contract. ${short(t)} send ${r.outP.length} players and take back ${M(r.in)}, more than any one of them makes.`});
      else ck.push({lvl:"warn", msg:`Combining ${r.outP.length} salaries hard-caps ${short(t)} at the second apron (${M(RULES.apron2)}) for the rest of the season.`});
    }

    /* 3. cash */
    if(r.cashOut > 0){
      if(after > RULES.apron2) ck.push({lvl:"bad", msg:`Second apron: a team above the second apron can't send cash in a trade.`});
      if(r.cashOut > RULES.cashLimit) ck.push({lvl:"bad", msg:`Sends ${M(r.cashOut)} in cash; the limit this season is ${M(RULES.cashLimit)}.`});
      else ck.push({lvl:"info", msg:`Sends ${M(r.cashOut)} cash (season limit ${M(RULES.cashLimit)}, counting all of this season's trades).`});
    }
    if(r.cashIn > RULES.cashLimit) ck.push({lvl:"bad", msg:`Receives ${M(r.cashIn)} in cash; the limit this season is ${M(RULES.cashLimit)}.`});

    /* 4. draft picks */
    r.outPicks.forEach(k => {
      if(dupes.has(`${k.orig}|${k.year}|${k.round}`)) ck.push({lvl:"bad", msg:`The ${pickName(k)} is in the trade twice.`});
      if(k.round === 1 && k.year === LAST_DRAFT && after > RULES.apron2)
        ck.push({lvl:"bad", msg:`Second apron: the ${k.year} first-round pick (seven drafts out) is frozen for teams above the second apron and can't be traded.`});
    });
    const own1 = r.outPicks.filter(k => k.round === 1 && k.orig === t && k.prot !== "swap").map(k => k.year);
    const get1 = new Set(r.inPicks.filter(k => k.round === 1 && k.prot !== "swap").map(k => k.year));
    if(RIGHTS && RIGHTS[t]){
      /* firsts the team would hold each year after the trade (frozen picks still count as held) */
      const held = y => { const c = RIGHTS[t][y] && RIGHTS[t][y][1]; if(!c) return 1;
        return c.assets.length + (c.frozen ? 1 : 0) - r.outPicks.filter(k => k.round === 1 && k.year === y && k.prot !== "swap").length + r.inPicks.filter(k => k.round === 1 && k.year === y && k.prot !== "swap").length; };
      const bad = [];
      for(let y = RULES.firstDraft; y < LAST_DRAFT; y++) if(held(y) <= 0 && held(y + 1) <= 0 && (own1.includes(y) || own1.includes(y + 1) || r.outPicks.some(k => k.round === 1 && (k.year === y || k.year === y + 1)))) bad.push(y);
      if(bad.length) ck.push({lvl:"bad", msg:`Stepien rule: a team can't be left without a first-round pick in back-to-back future drafts. After this trade ${short(t)} would have no first in ${bad.map(y => `${y} and ${y + 1}`).join(", ")}.`});
      else if(r.outPicks.some(k => k.round === 1)) ck.push({lvl:"ok", msg:`Stepien rule: ${short(t)} still have a first-round pick in at least every other draft.`});
    } else {
      const bad = own1.filter(y => own1.includes(y + 1) && !get1.has(y) && !get1.has(y + 1));
      if(bad.length) ck.push({lvl:"bad", msg:`Stepien rule: a team can't be left without a first-round pick in back-to-back future drafts. ${short(t)} trade their own ${bad.map(y => `${y} and ${y+1}`).join(", ")} firsts.`});
      else if(own1.length) ck.push({lvl:"info", msg:`Trades its own ${own1.sort().join(", ")} first${own1.length > 1 ? "s" : ""}. Check it doesn't already owe the first in the year before or after (Stepien rule).`});
    }
    if(r.outPicks.some(k => k.kind === "complex")) ck.push({lvl:"info", msg:`Includes swap or combined pick rights. Those depend on where several teams' picks land; see the RealGM wording on the pick.`});
    if(after > RULES.apron2 && !r.outPicks.some(k => k.year === LAST_DRAFT && k.round === 1))
      ck.push({lvl:"warn", msg:`Ends above the second apron. If ${short(t)} finish the season there, their ${LAST_DRAFT} first becomes frozen, and finishing above it in 3 of 5 seasons drops that pick to No. 30.`});

    /* 5. roster size */
    const size = (ROSTER[t] || []).length - r.outP.length + r.inP.length;
    r.size = size;
    if(size > RULES.rosterMax) ck.push({lvl:"warn", msg:`Ends with ${size} contracts on the books (max ${RULES.rosterMax} standard players). They'd have to waive ${size - RULES.rosterMax}. (Basketball-Reference's list can include players already waived.)`});
    else if(size < RULES.rosterMin) ck.push({lvl:"warn", msg:`Ends with ${size} players; teams must get back to ${RULES.rosterMin} within two weeks.`});
    else ck.push({lvl:"ok", msg:`Roster after the trade: ${size} players.`});

    /* 6. where they end up */
    if(r.za.k !== r.zb.k) ck.push({lvl:"info", msg:`Moves from "${r.zb.label}" to "${r.za.label}".`});
    if(after > RULES.tax) ck.push({lvl:"info", msg:`${M(after - RULES.tax)} over the luxury tax line after the trade.`});
    else if(after < RULES.minPayroll) ck.push({lvl:"info", msg:`${M(RULES.minPayroll - after)} under the salary floor; they'd owe the gap to their players at season's end.`});
  });
  const fails = Object.values(res).reduce((n,r) => n + r.checks.filter(c => c.lvl === "bad").length, 0);
  return {res, fails, anything};
}
/* Least salary a team below the first apron must send out to take back `inc` */
function minOutFor(inc){
  let lo = 0, hi = inc;
  while(hi - lo > 1000){ const mid = (lo + hi) / 2; if(maxBack(mid) >= inc) hi = mid; else lo = mid; }
  return Math.ceil(hi / 1000) * 1000;
}
const PROT1 = [["none","Unprotected"],["top3","Top-3 protected"],["top5","Top-5 protected"],["top8","Top-8 protected"],["top10","Top-10 protected"],["top14","Lottery protected (top 14)"],["top20","Top-20 protected"],["swap","Pick swap (rights only)"]];
const PROT2 = [["none","Unprotected"],["top40","Top-40 protected"],["top45","Top-45 protected"],["top50","Top-50 protected"],["top55","Top-55 protected"],["swap","Pick swap (rights only)"]];
function pickName(k){
  const prot = (k.round === 1 ? PROT1 : PROT2).find(x => x[0] === k.prot);
  const rd = `${k.year} ${k.round === 1 ? "1st" : "2nd"}`;
  if(k.kind === "complex") return `${rd} · ${k.prot === "swap" ? "swap of " : ""}rights: ${clip(k.note || "", 70)}`;
  const via = k.orig !== k.from ? ` (via ${short(k.orig)})` : "";
  const range = k.range ? ` · conveys only if ${k.range}` : "";
  return `${rd}${via}${range}${prot && k.prot !== "none" ? ` · ${prot[1].toLowerCase()}` : ""}`;
}
const clip = (s, n) => s.length > n ? s.slice(0, n - 1) + "…" : s;
/* every pick a team can trade right now: [{year, round, asset, label, ok, why}] */
function pickOptions(t){
  const out = [];
  const R = RIGHTS && RIGHTS[t];
  if(!R) return null;
  for(let y = RULES.firstDraft; y <= LAST_DRAFT; y++){
    [1, 2].forEach(rd => {
      const c = R[y] && R[y][rd];
      const tag = `${y} ${rd === 1 ? "1st" : "2nd"}`;
      if(!c) return;
      if(c.frozen) out.push({year:y, round:rd, label:`${tag} · own pick frozen (second apron), can't be traded`, ok:false});
      if(c.forfeited) out.push({year:y, round:rd, label:`${tag} · own pick forfeited by the league`, ok:false});
      if((c.ownOwed || c.outgoing) && !c.assets.some(a => a.kind === "own")) out.push({year:y, round:rd, label:`${tag} · own pick already traded away (${clip(c.raw, 60)})`, ok:false});
      c.assets.forEach((a, i) => {
        const inUse = S.picks.some(k => k.from === t && k.year === y && k.round === rd && k.idx === i);
        let label;
        if(a.kind === "own") label = `${tag} · own pick${a.range ? ` (only if it lands ${a.range})` : ""}${a.cond ? ` (${a.cond})` : ""}${a.swapWith ? ` · already has a swap with ${short(a.swapWith)}` : ""}`;
        else if(a.kind === "acquired") label = `${tag} · ${TEAMS[a.orig] ? TEAMS[a.orig].n : a.orig} pick${a.range ? ` (conveys if ${a.range})` : ""}${a.cond ? ` (${clip(a.cond, 60)})` : ""}`;
        else label = `${tag} · swap/combined rights: ${clip(a.text, 80)}`;
        out.push({year:y, round:rd, idx:i, asset:a, label: inUse ? label + " · already in this trade" : label, ok: !inUse});
      });
    });
  }
  return out;
}

/* ---------- drawing ---------- */
function meter(before, after){
  const lo = 100e6, hi = Math.max(250e6, before * 1.05, after * 1.05);
  const x = v => Math.max(0, Math.min(100, (v - lo) / (hi - lo) * 100));
  const z = [[lo, RULES.cap, "var(--z-cap)"], [RULES.cap, RULES.tax, "var(--court)"], [RULES.tax, RULES.apron1, "var(--z-tax)"], [RULES.apron1, RULES.apron2, "var(--z-a1)"], [RULES.apron2, hi, "var(--z-a2)"]];
  const ticks = [[RULES.cap,"Cap","var(--z-cap)"],[RULES.tax,"Tax","var(--z-tax)"],[RULES.apron1,"1st","var(--z-a1)"],[RULES.apron2,"2nd","var(--z-a2)"]];
  return `<div class="meter" title="Before ${M(before)} → after ${M(after)}">
    <div class="track">${z.map(([a,b,c]) => `<div class="zone" style="left:${x(a)}%;width:${x(b)-x(a)}%;background:${c}"></div>`).join("")}</div>
    <div class="fill before" style="width:${x(before)}%"></div>
    <div class="fill after" style="width:${x(after)}%;background:${zone(after).c}"></div>
    ${ticks.map(([v,l,c]) => `<div class="tick" style="left:calc(${x(v)}% - 1px);--c:${c}"><span>${l}</span></div>`).join("")}
  </div>`;
}

function drawTeams(){
  const ev = evaluate();
  $('teams').innerHTML = S.teams.map(t => teamCard(t, ev.res[t])).join("");
  wire();
  drawResults(ev);
  save();
}
function teamCard(t, r){
  const T = TEAMS[t], ids = ROSTER[t] || [];
  const others = otherTeams(t);
  const choose = (sel) => others.map(o => `<option value="${o}" ${o===sel?"selected":""}>to ${esc(TEAMS[o].n)}</option>`).join("");
  const picks = S.picks.map((k,i) => [k,i]).filter(([k]) => k.from === t);
  const cash = S.cash[t];
  const zb = r.zb, za = r.za;
  return `<div class="tcard" style="--c1:${T.c1}" data-team="${t}">
    <div class="thead">
      <img src="${logo(t)}" alt="" onerror="this.style.visibility='hidden'">
      <select data-swap="${t}" aria-label="Team">${CODES.map(c => `<option value="${c}" ${c===t?"selected":""} ${c!==t && S.teams.includes(c)?"disabled":""}>${esc(TEAMS[c].n)}</option>`).join("")}</select>
      ${S.teams.length > 2 ? `<button class="ghost" data-drop="${t}" title="Remove team">✕</button>` : ""}
    </div>
    <div class="tstat">
      <div class="chips"><span class="chip" style="--c:${zb.c}">${zb.label}</span>${za.k !== zb.k ? `<span class="arrow">→</span><span class="chip" style="--c:${za.c}">${za.label}</span>` : ""}</div>
      <div class="pay">Payroll <b>${M(r.before)}</b>${r.after !== r.before ? ` → <b>${M(r.after)}</b>` : ""} · ${ids.length} contracts</div>
      ${meter(r.before, r.after)}
    </div>
    <div class="sec">
      <h4><span>Players</span><span class="muted" style="text-transform:none;letter-spacing:0;font-family:Inter">Salary · Pulse</span></h4>
      <div class="roster">${ids.length ? ids.map(id => {
        const p = P.get(id), on = S.move[id];
        const yrs = p.left > 1 ? `${p.left} yrs, ${M(p.total)} total` : "expiring";
        const tag = p.opt ? `<span class="tag" title="${esc(p.opt)} this season">${p.opt === "player option" ? "PO" : p.opt === "team option" ? "TO" : "ETO"}</span>` : "";
        const nextOpt = p.years.slice(1).find(y => y[2]);
        return `<div class="prow ${on ? "on" : ""}" data-p="${id}" role="checkbox" aria-checked="${on ? "true" : "false"}" tabindex="0">
          <span class="box">${on ? "✓" : ""}</span>
          <span class="nm">${esc(p.name)}${tag}<small>${esc(p.pos)}${p.pos ? " · " : ""}${yrs}${nextOpt ? ` · ${nextOpt[2] === "player option" ? "PO" : nextOpt[2] === "team option" ? "TO" : "ETO"} ${nextOpt[0]}` : ""}</small></span>
          <span class="sal">${M(p.salary)}</span>
          <span class="ev" title="${p.eval != null ? "Pulse, " + esc(p.evalSeason) : "No Pulse yet"}">${p.eval != null ? p.eval.toFixed(3) : "—"}</span>
          ${on && others.length > 1 ? `<select data-to="${id}" onclick="event.stopPropagation()">${choose(on)}</select>` : ""}
        </div>`;
      }).join("") : `<div class="empty" style="padding:16px">No contracts found for this team.</div>`}</div>
    </div>
    <div class="sec">
      <h4><span>Draft picks</span>${pickFormOpen === t ? "" : `<button class="ghost" data-addpick="${t}" style="font-family:Inter;text-transform:none;letter-spacing:0">+ Add pick</button>`}</h4>
      ${picks.map(([k,i]) => `<div class="asset"><span class="what">🏀 ${esc(pickName(k))}</span>${others.length > 1 ? `<select data-pickto="${i}">${choose(k.to)}</select>` : `<span class="muted">to ${esc(short(k.to))}</span>`}<button class="ghost" data-delpick="${i}" title="Remove">✕</button></div>`).join("")}
      ${pickFormOpen === t ? pickForm(t) : (picks.length ? "" : `<div class="muted">No picks in this trade.</div>`)}
    </div>
    <div class="sec">
      <h4><span>Cash &amp; cap</span></h4>
      <div class="inline"><label class="muted" for="cash-${t}">Cash</label><input id="cash-${t}" data-cash="${t}" type="number" min="0" step="100000" placeholder="0" value="${cash && cash.amt ? cash.amt : ""}">
        ${others.length > 1 ? `<select data-cashto="${t}">${choose(cash ? cash.to : others[0])}</select>` : `<span class="muted">to ${esc(short(others[0] || ""))}</span>`}</div>
      <details style="margin-top:8px"><summary class="muted" style="cursor:pointer">Other cap charges (dead money, cap holds)</summary>
        <div class="inline" style="margin-top:6px"><input data-extra="${t}" type="number" step="100000" placeholder="0" value="${S.extra[t] || ""}"><span class="muted">added to payroll</span></div>
      </details>
    </div>
  </div>`;
}
function pickForm(t){
  const years = []; for(let y = RULES.firstDraft; y <= LAST_DRAFT; y++) years.push(y);
  const others = otherTeams(t);
  const opts = pickOptions(t);
  if(opts) return `<div class="pickform" data-form="${t}" data-rights="1">
    <div class="full"><label class="k">Pick ${esc(short(t))} can trade</label><select id="pkWhich">${opts.map((o, i) => `<option value="${i}" ${o.ok ? "" : "disabled"}>${esc(o.label)}</option>`).join("")}</select></div>
    <div class="full"><label class="k">Deal</label><select id="pkType"><option value="pick">Trade the pick</option><option value="swap">Give a pick swap (the other team may swap picks with ${esc(short(t))} that year)</option></select></div>
    <div class="full"><label class="k">Add protection</label><select id="pkProt"></select></div>
    ${others.length > 1 ? `<div class="full"><label class="k">Goes to</label><select id="pkTo">${others.map(o => `<option value="${o}">${esc(TEAMS[o].n)}</option>`).join("")}</select></div>` : ""}
    <div class="full muted" id="pkNote"></div>
    <div class="full" style="display:flex;gap:8px"><button class="primary" id="pkAdd">Add pick</button><button id="pkCancel">Cancel</button></div>
  </div>`;
  return `<div class="pickform" data-form="${t}">
    <div><label class="k">Draft</label><select id="pkYear">${years.map(y => `<option>${y}</option>`).join("")}</select></div>
    <div><label class="k">Round</label><select id="pkRound"><option value="1">1st round</option><option value="2">2nd round</option></select></div>
    <div class="full"><label class="k">Whose pick</label><select id="pkOrig">${CODES.map(c => `<option value="${c}" ${c===t?"selected":""}>${c===t ? "Their own" : "Via " + esc(TEAMS[c].n)}</option>`).join("")}</select></div>
    <div class="full"><label class="k">Protection</label><select id="pkProt">${PROT1.map(([v,l]) => `<option value="${v}">${l}</option>`).join("")}</select></div>
    ${others.length > 1 ? `<div class="full"><label class="k">Goes to</label><select id="pkTo">${others.map(o => `<option value="${o}">${esc(TEAMS[o].n)}</option>`).join("")}</select></div>` : ""}
    <div class="full" style="display:flex;gap:8px"><button class="primary" id="pkAdd">Add pick</button><button id="pkCancel">Cancel</button></div>
  </div>`;
}

function wire(){
  const box = $('teams');
  box.querySelectorAll('.prow').forEach(el => {
    const tog = () => {
      const id = el.dataset.p, p = P.get(id);
      if(S.move[id]) delete S.move[id]; else S.move[id] = otherTeams(p.team)[0];
      drawTeams();
    };
    el.onclick = tog;
    el.onkeydown = e => { if(e.key === " " || e.key === "Enter"){ e.preventDefault(); tog(); } };
  });
  box.querySelectorAll('[data-to]').forEach(s => s.onchange = () => { S.move[s.dataset.to] = s.value; drawTeams(); });
  box.querySelectorAll('[data-swap]').forEach(s => s.onchange = () => {
    const i = S.teams.indexOf(s.dataset.swap); S.teams[i] = s.value; fixTargets(); drawTeams();
  });
  box.querySelectorAll('[data-drop]').forEach(b => b.onclick = () => { S.teams = S.teams.filter(t => t !== b.dataset.drop); fixTargets(); drawTeams(); });
  box.querySelectorAll('[data-addpick]').forEach(b => b.onclick = () => { pickFormOpen = b.dataset.addpick; drawTeams(); });
  box.querySelectorAll('[data-delpick]').forEach(b => b.onclick = () => { S.picks.splice(+b.dataset.delpick, 1); drawTeams(); });
  box.querySelectorAll('[data-pickto]').forEach(s => s.onchange = () => { S.picks[+s.dataset.pickto].to = s.value; drawTeams(); });
  box.querySelectorAll('[data-cash]').forEach(inp => inp.onchange = () => {
    const t = inp.dataset.cash, a = Math.max(0, +inp.value || 0);
    if(a) S.cash[t] = {amt:a, to:(S.cash[t] && S.cash[t].to) || otherTeams(t)[0]}; else delete S.cash[t];
    drawTeams();
  });
  box.querySelectorAll('[data-cashto]').forEach(s => s.onchange = () => { const t = s.dataset.cashto; S.cash[t] = {amt:(S.cash[t] && S.cash[t].amt) || 0, to:s.value}; drawTeams(); });
  box.querySelectorAll('[data-extra]').forEach(inp => inp.onchange = () => { const v = +inp.value || 0; if(v) S.extra[inp.dataset.extra] = v; else delete S.extra[inp.dataset.extra]; drawTeams(); });
  const form = box.querySelector('[data-form]');
  if(form && form.dataset.rights){
    const t = form.dataset.form, opts = pickOptions(t);
    const which = $('pkWhich'), type = $('pkType'), prot = $('pkProt');
    const first = opts.findIndex(o => o.ok);
    if(first >= 0) which.value = String(first);
    const sync = () => {
      const o = opts[+which.value];
      if(!o || !o.ok){ $('pkAdd').disabled = true; $('pkNote').textContent = "Pick a pick this team still owns."; return; }
      $('pkAdd').disabled = false;
      const complex = o.asset.kind === "complex";
      const list = (o.round === 1 ? PROT1 : PROT2).filter(([v]) => v !== "swap");
      prot.innerHTML = list.map(([v, l]) => `<option value="${v}">${v === "none" ? (o.asset.range || complex ? "No extra protection (keeps its current terms)" : "Unprotected") : l}</option>`).join("");
      prot.disabled = complex;
      $('pkNote').textContent = complex ? `RealGM: ${o.asset.text}` : o.asset.kind === "acquired" ? `RealGM: ${o.asset.text}` : "";
    };
    which.onchange = sync; type.onchange = sync; sync();
    $('pkCancel').onclick = () => { pickFormOpen = null; drawTeams(); };
    $('pkAdd').onclick = () => {
      const o = opts[+which.value]; if(!o || !o.ok) return;
      S.picks.push({from:t, to: $('pkTo') ? $('pkTo').value : otherTeams(t)[0], year:o.year, round:o.round, orig:o.asset.orig, idx:o.idx,
        kind:o.asset.kind, range:o.asset.range || "", note:o.asset.kind === "complex" ? o.asset.text : "", prot: type.value === "swap" ? "swap" : prot.value});
      pickFormOpen = null; drawTeams();
    };
  } else if(form){
    const t = form.dataset.form;
    const round = $('pkRound'), prot = $('pkProt');
    round.onchange = () => { prot.innerHTML = (round.value === "1" ? PROT1 : PROT2).map(([v,l]) => `<option value="${v}">${l}</option>`).join(""); };
    $('pkCancel').onclick = () => { pickFormOpen = null; drawTeams(); };
    $('pkAdd').onclick = () => {
      S.picks.push({from:t, to: $('pkTo') ? $('pkTo').value : otherTeams(t)[0], year:+$('pkYear').value, round:+round.value, orig:$('pkOrig').value, prot:prot.value});
      pickFormOpen = null; drawTeams();
    };
  }
}

function drawResults(ev){
  const {res, fails, anything} = ev;
  if(!anything){
    $('out').innerHTML = `<div class="verdict"><div class="icon">?</div><div><div class="big">Build a trade</div><div class="muted">Pick at least one player, pick or cash from a team and the Trade Machine will check it.</div></div></div>`;
    return;
  }
  const warns = Object.values(res).reduce((n,r) => n + r.checks.filter(c => c.lvl === "warn").length, 0);
  const prod = r => ({out: r.outP.reduce((s,p) => s + (p.eval || 0) * p.mpg, 0), in: r.inP.reduce((s,p) => s + (p.eval || 0) * p.mpg, 0)});
  $('out').innerHTML = `
    <div class="verdict ${fails ? "bad" : "ok"}">
      <div class="icon">${fails ? "✕" : "✓"}</div>
      <div><div class="big">${fails ? "Trade doesn't work" : "Trade works"}</div>
      <div class="muted">${fails ? `${fails} rule${fails===1?"":"s"} broken. See the red lines below.` : `Salaries match and no apron rule is broken.`}${warns ? ` ${warns} thing${warns===1?"":"s"} to keep in mind.` : ""}</div></div>
    </div>
    <div class="results">${Object.values(res).map(r => {
      const T = TEAMS[r.t], pr = prod(r);
      const list = (ps, picks, cash) => {
        const items = ps.map(p => `${esc(p.name)} <span class="muted">${M(p.salary)}${p.eval != null ? " · " + p.eval.toFixed(3) : ""}</span>`)
          .concat(picks.map(k => `${esc(pickName(k))}`)).concat(cash ? [`${M(cash)} cash`] : []);
        return items.length ? `<ul>${items.map(i => `<li>${i}</li>`).join("")}</ul>` : `<span class="muted">Nothing</span>`;
      };
      const from = t => S.teams.length > 2 ? ` <span class="muted">(${esc(short(t))})</span>` : "";
      return `<div class="rcard" style="--c1:${T.c1}">
        <h3><img src="${logo(r.t)}" alt="" onerror="this.style.visibility='hidden'">${esc(T.n)}</h3>
        <div class="moves">
          <div><b>Receive</b>${r.inP.length || r.inPicks.length || r.cashIn ? `<ul>${r.inP.map(p => `<li>${esc(p.name)}${from(p.team)} <span class="muted">${M(p.salary)}</span></li>`).join("")}${r.inPicks.map(k => `<li>${esc(pickName(k))}${from(k.from)}</li>`).join("")}${r.cashIn ? `<li>${M(r.cashIn)} cash</li>` : ""}</ul>` : `<span class="muted">Nothing</span>`}</div>
          <div><b>Send</b>${list(r.outP, r.outPicks, r.cashOut)}</div>
        </div>
        <div class="nums">
          <span>Salary out</span><span>${Mfull(r.out)}</span>
          <span>Salary in</span><span>${Mfull(r.in)}</span>
          <span>Payroll</span><span>${M(r.before)} → ${M(r.after)}</span>
          <span>Room under 1st apron after</span><span style="color:${r.after > RULES.apron1 ? "var(--bad)" : "inherit"}">${M(RULES.apron1 - r.after)}</span>
          <span>Room under 2nd apron after</span><span style="color:${r.after > RULES.apron2 ? "var(--bad)" : "inherit"}">${M(RULES.apron2 - r.after)}</span>
          ${pr.in || pr.out ? `<span title="Pulse × minutes per game, added up for the players moving">Pulse production per game</span><span>${pr.out.toFixed(1)} out → ${pr.in.toFixed(1)} in</span>` : ""}
        </div>
        <ul class="checks">${r.checks.map(c => `<li class="${c.lvl}"><span>${esc(c.msg)}</span></li>`).join("")}</ul>
      </div>`;
    }).join("")}</div>`;
}

function rulesHtml(){
  return `
  <h5>Salary matching (every team, after the trade)</h5>
  <p><b>Ends under the cap (${M(RULES.cap)}):</b> can take in any salary that fits under the cap.</p>
  <p><b>Ends over the cap but at or below the first apron (${M(RULES.apron1)}):</b> can take back the most of these:
    200% of outgoing salary + $250K (small salaries), outgoing salary + ${M(RULES.bracket)} (middle), or 125% of outgoing salary + $250K (big salaries).
    Taking back more than it sends hard-caps the team at the first apron for the season.</p>
  <p><b>Ends above the first apron:</b> can't take back more salary than it sends out (100%).</p>
  <h5>Second apron (${M(RULES.apron2)}) — extra limits for teams that end above it</h5>
  <ul>
    <li>Can't combine two or more players' salaries to take back a bigger contract. Teams below it that do combine salaries are hard-capped at the second apron.</li>
    <li>Can't send cash in a trade.</li>
    <li>Can't trade its first-round pick seven drafts out (${LAST_DRAFT}). Finishing above the second apron in 3 of 5 seasons moves that pick to No. 30.</li>
  </ul>
  <h5>Draft picks</h5>
  <ul>
    <li>Picks can be traded up to seven drafts out (${RULES.firstDraft}–${LAST_DRAFT}).</li>
    <li>Only picks a team actually holds can be added (own picks it hasn't traded, and picks it got from other teams), from RealGM's list of every team's future picks${RIGHTS_AT ? ` (as of ${esc(String(RIGHTS_AT).slice(0, 10))})` : ""}. Frozen picks can't be traded. A team can also give a pick swap on any pick it holds.</li>
    <li>Stepien rule: a team can't be left without a first-round pick in two back-to-back future drafts, counting the picks it already owes.</li>
  </ul>
  <h5>Cash and rosters</h5>
  <ul>
    <li>Each team can send up to ${M(RULES.cashLimit)} and receive up to ${M(RULES.cashLimit)} in cash across all of its trades this season.</li>
    <li>Teams can carry at most ${RULES.rosterMax} standard contracts and must get back to ${RULES.rosterMin} within two weeks.</li>
  </ul>
  <h5>What this tool can't see</h5>
  <ul>
    <li>Traded player exceptions, trade kickers, and hard caps a team already triggered earlier this season.</li>
    <li>Players who can't be traded yet: free agents who just signed (usually until Dec. 15 or three months after signing), players who re-signed with a big raise, and newly signed draft picks (30 days).</li>
    <li>Picks a team has already traded away, and pick protections that carry over from earlier deals.</li>
    <li>Dead money and cap holds, unless you add them under "Other cap charges".</li>
  </ul>
  <p class="muted">${RULES.season} figures: cap ${Mfull(RULES.cap)}, tax ${Mfull(RULES.tax)}, first apron ${Mfull(RULES.apron1)}, second apron ${Mfull(RULES.apron2)}, cash limit ${Mfull(RULES.cashLimit)}. Change them in cap.js each July.</p>`;
}

function toast(msg){ const t = $('toast'); t.textContent = msg; t.classList.add("show"); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove("show"), 1800); }

async function init(){
  $('lines').innerHTML = [["Salary cap",RULES.cap,"var(--z-cap)"],["Tax line",RULES.tax,"var(--z-tax)"],["1st apron",RULES.apron1,"var(--z-a1)"],["2nd apron",RULES.apron2,"var(--z-a2)"]]
    .map(([l,v,c]) => `<div><i style="--c:${c}">${l}</i><b>${M(v)}</b></div>`).join("");
  await load();
  $('rulesBody').innerHTML = rulesHtml();
  if(!P.size){ $('teams').innerHTML = `<div class="empty">Couldn't load contracts. They're added by the morning update (data/contracts.json).</div>`; $('meta').textContent = ""; return; }
  $('meta').textContent = `${RULES.season} salaries · ${P.size} players under contract` + (DATA_AT ? ` · updated ${new Date(DATA_AT).toLocaleDateString([], {month:"short", day:"numeric"})}` : "");
  S = restore() || Object.assign(blank(), {teams: defaultTeams()});
  if(S.teams.length < 2) S.teams = S.teams.concat(defaultTeams().filter(t => !S.teams.includes(t))).slice(0, 2);
  fixTargets();
  $('addTeam').onclick = () => {
    if(S.teams.length >= 5) return toast("Five teams is the most this tool handles.");
    const next = CODES.find(c => ROSTER[c] && !S.teams.includes(c)); if(next){ S.teams.push(next); drawTeams(); }
  };
  $('reset').onclick = () => { S = Object.assign(blank(), {teams: S.teams.slice(0, 2)}); pickFormOpen = null; drawTeams(); };
  $('share').onclick = async () => {
    save();
    try{ await navigator.clipboard.writeText(location.href); toast("Link copied"); }catch(_){ toast("Copy the address bar to share this trade"); }
  };
  drawTeams();
}
window.TradeMachine = {RULES, maxBack, evaluate: () => evaluate(), state: () => S};
init();
})();
