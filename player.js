/* Player page: opened by double-clicking a player on the leaderboard (address: #/player/<id>).
   Reads data/players/<id>.json, built every morning by build_players.py. */
(function(){
"use strict";

/* NBA team code -> logo id, name, primary + secondary color. Edit colors here if you like. */
const TEAMS = {
  ATL:{id:1610612737,n:"Atlanta Hawks",c1:"#C8102E",c2:"#FDB927"},
  BOS:{id:1610612738,n:"Boston Celtics",c1:"#007A33",c2:"#BA9653"},
  BKN:{id:1610612751,n:"Brooklyn Nets",c1:"#000000",c2:"#A1A1A4"},
  CHA:{id:1610612766,n:"Charlotte Hornets",c1:"#1D1160",c2:"#00788C"},
  CHI:{id:1610612741,n:"Chicago Bulls",c1:"#CE1141",c2:"#000000"},
  CLE:{id:1610612739,n:"Cleveland Cavaliers",c1:"#860038",c2:"#FDBB30"},
  DAL:{id:1610612742,n:"Dallas Mavericks",c1:"#00538C",c2:"#B8C4CA"},
  DEN:{id:1610612743,n:"Denver Nuggets",c1:"#0E2240",c2:"#FEC524"},
  DET:{id:1610612765,n:"Detroit Pistons",c1:"#C8102E",c2:"#1D42BA"},
  GSW:{id:1610612744,n:"Golden State Warriors",c1:"#1D428A",c2:"#FFC72C"},
  HOU:{id:1610612745,n:"Houston Rockets",c1:"#CE1141",c2:"#C4CED4"},
  IND:{id:1610612754,n:"Indiana Pacers",c1:"#002D62",c2:"#FDBB30"},
  LAC:{id:1610612746,n:"LA Clippers",c1:"#C8102E",c2:"#1D428A"},
  LAL:{id:1610612747,n:"Los Angeles Lakers",c1:"#552583",c2:"#FDB927"},
  MEM:{id:1610612763,n:"Memphis Grizzlies",c1:"#12173F",c2:"#5D76A9"},
  MIA:{id:1610612748,n:"Miami Heat",c1:"#98002E",c2:"#F9A01B"},
  MIL:{id:1610612749,n:"Milwaukee Bucks",c1:"#00471B",c2:"#EEE1C6"},
  MIN:{id:1610612750,n:"Minnesota Timberwolves",c1:"#0C2340",c2:"#78BE20"},
  NOP:{id:1610612740,n:"New Orleans Pelicans",c1:"#0C2340",c2:"#C8102E"},
  NYK:{id:1610612752,n:"New York Knicks",c1:"#006BB6",c2:"#F58426"},
  OKC:{id:1610612760,n:"Oklahoma City Thunder",c1:"#007AC1",c2:"#EF3B24"},
  ORL:{id:1610612753,n:"Orlando Magic",c1:"#0077C0",c2:"#C4CED4"},
  PHI:{id:1610612755,n:"Philadelphia 76ers",c1:"#006BB6",c2:"#ED174C"},
  PHX:{id:1610612756,n:"Phoenix Suns",c1:"#1D1160",c2:"#E56020"},
  POR:{id:1610612757,n:"Portland Trail Blazers",c1:"#E03A3E",c2:"#000000"},
  SAC:{id:1610612758,n:"Sacramento Kings",c1:"#5A2D81",c2:"#63727A"},
  SAS:{id:1610612759,n:"San Antonio Spurs",c1:"#000000",c2:"#C4CED4"},
  TOR:{id:1610612761,n:"Toronto Raptors",c1:"#CE1141",c2:"#000000"},
  UTA:{id:1610612762,n:"Utah Jazz",c1:"#3E2680",c2:"#000000"},
  WAS:{id:1610612764,n:"Washington Wizards",c1:"#002B5C",c2:"#E31837"},
};
const DEFAULT_TEAM = {id:null, n:"", c1:"#1D428A", c2:"#C8102E"};
/* Retired players get the league's own colors */
const NBA_SCHEME = {id:null, n:"NBA", c1:"#1D428A", c2:"#C8102E", league:true};
const NBA_LOGO = "https://cdn.nba.com/logos/leagues/logo-nba.svg";
/* Basketball-Reference team codes. f = today's franchise (for colors); same = still the same team
   name, so today's logo is right for it. Older names get a colored badge instead of a logo. */
const BBR_TEAMS = {
  BRK:{f:"BKN",same:true}, NJN:{f:"BKN",n:"New Jersey Nets"}, NYN:{f:"BKN",n:"New York Nets"},
  CHO:{f:"CHA",same:true}, CHA:{f:"CHA",n:"Charlotte Bobcats"}, CHH:{f:"CHA",n:"Charlotte Hornets (1988-2002)"},
  NOH:{f:"NOP",n:"New Orleans Hornets"}, NOK:{f:"NOP",n:"New Orleans/Oklahoma City Hornets"},
  PHO:{f:"PHX",same:true}, SEA:{f:"OKC",n:"Seattle SuperSonics"}, VAN:{f:"MEM",n:"Vancouver Grizzlies"},
  WSB:{f:"WAS",n:"Washington Bullets"}, CAP:{f:"WAS",n:"Capital Bullets"}, KCK:{f:"SAC",n:"Kansas City Kings"},
  KCO:{f:"SAC",n:"Kansas City-Omaha Kings"}, SDC:{f:"LAC",n:"San Diego Clippers"}, BUF:{f:"LAC",n:"Buffalo Braves"},
  NOJ:{f:"UTA",n:"New Orleans Jazz"}, SDR:{f:"HOU",n:"San Diego Rockets"},
};
function teamInfo(code){
  const b = BBR_TEAMS[code];
  const f = b ? b.f : code, t = TEAMS[f];
  if(!t) return {code, n:code, c1:"#1D428A", c2:"#C8102E", logo:null};
  const same = !b || b.same;
  return {code, n: same ? t.n : b.n, c1:t.c1, c2:t.c2, logo: same ? `https://cdn.nba.com/logos/nba/${t.id}/primary/L/logo.svg` : null, franchise:t.n};
}
/* Every team in the player's career, in order, with the seasons they were there */
function careerTeams(){
  const out = [];
  for(const s of (REC.seasons || [])){
    for(const code of String(s.team || "").split(/\s*\u2192\s*|\s*→\s*/).filter(c => c && !/^(TOT|\dTM)$/.test(c))){
      const last = out[out.length-1];
      if(last && last.code === code){ last.to = s.season; continue; }
      out.push({code, from:s.season, to:s.season});
    }
  }
  return out;
}
const ZONE_ORDER = ["Restricted Area","In The Paint (Non-RA)","Mid-Range","Left Corner 3","Right Corner 3","Above the Break 3","Backcourt"];
const ZONE_SHORT = {"Restricted Area":"At the rim","In The Paint (Non-RA)":"Paint (non-rim)","Mid-Range":"Mid-range",
  "Left Corner 3":"Left corner 3","Right Corner 3":"Right corner 3","Above the Break 3":"Above-the-break 3","Backcourt":"Backcourt"};
const MIN_TOP_GAME_MINUTES = 20;

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const num = v => (typeof v === "number" && isFinite(v)) ? v : null;
const f1 = v => v == null ? "—" : (Math.round(v*10)/10).toFixed(1);
const f3 = v => v == null ? "—" : v.toFixed(3);
const pct = (m, a) => a ? (100*m/a).toFixed(1) + "%" : "—";
const per = (t, g) => (num(t) != null && g) ? t/g : null;
/* Pulse: ((PTS + AST*2 + REB*2 + STL*4 + BLK) - TOV*4) / minutes */
const rebOf = s => s.trb != null ? s.trb : (s.drb || 0) + (s.orb || 0);
const evalOf = s => s.mp ? (s.pts + 2*s.ast + 2*rebOf(s) + 4*s.stl + s.blk - 4*(s.tov || 0)) / s.mp : null;
const PARTS = [["pts","Points",1],["ast","Assists ×2",2],["trb","Rebounds ×2",2],["stl","Steals ×4",4],["blk","Blocks",1],["tov","Turnovers (×4, subtracted)",-4]];
const POS_NAMES = {PG:"point guards",SG:"shooting guards",SF:"small forwards",PF:"power forwards",C:"centers",G:"guards",F:"forwards"};

let REC = null, SEL = null, EL = null, LOGS_ALL = {}, SPLIT = {};

function lum(hex){
  const c = hex.replace("#","").match(/../g).map(h => parseInt(h,16)/255).map(v => v <= .03928 ? v/12.92 : Math.pow((v+.055)/1.055, 2.4));
  return .2126*c[0] + .7152*c[1] + .0722*c[2];
}
function contrast(a, b){ const x = lum(a), y = lum(b); return (Math.max(x,y)+.05)/(Math.min(x,y)+.05); }
function dark(){ return window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches; }

function teamOf(code){ return TEAMS[code] || DEFAULT_TEAM; }
function ageFrom(born){
  if(!born || !/^\d{4}-\d{2}-\d{2}$/.test(born)) return null;
  const b = new Date(born + "T00:00:00"), n = new Date();
  let a = n.getFullYear() - b.getFullYear();
  if(n.getMonth() < b.getMonth() || (n.getMonth() === b.getMonth() && n.getDate() < b.getDate())) a--;
  return a;
}
function height(h){ const m = String(h||"").match(/^(\d+)-(\d+)$/); return m ? `${m[1]}'${m[2]}"` : (h || "—"); }
function ordinal(n){ const s = ["th","st","nd","rd"], v = n % 100; return n + (s[(v-20)%10] || s[v] || s[0]); }
function curEndYear(){ const n = new Date(); return n.getMonth() >= 7 ? n.getFullYear() + 1 : n.getFullYear(); }
function lastSeason(){ const s = REC.seasons || []; return s[s.length-1]; }
function isRetired(){
  const last = lastSeason(); if(!last || last.current) return false;
  return +last.season.slice(0,4) + 1 < curEndYear() - 1;   // hasn't played this season or last
}
function shortDate(d){ const t = new Date(d + "T12:00:00"); return isNaN(t) ? d : t.toLocaleDateString([], {month:"short", day:"numeric", year:"numeric"}); }

async function getJSON(path){
  try{ const r = await fetch(path + "?t=" + Date.now()); if(!r.ok) return null; return await r.json(); }catch(_){ return null; }
}

/* ---------- game-by-game data for the chosen season (or every season combined) ---------- */
function gamesFor(sel){
  const g = REC.games || {};
  if(sel !== "career") return g[sel] || null;
  const out = {logs:[], zones:{}, cells:{}, hz:{}, hzSeasons:0, assists:[], assistedBy:[], assisted:{}, steals:{on:0,off:0,oth:0}, blocks:{rim:0,paint:0,mid:0,three:0}};
  const at = new Map(), af = new Map();
  for(const s of Object.keys(g).sort()){
    const x = g[s];
    x.logs.forEach(l => out.logs.push(l));
    for(const [z,[a,m]] of Object.entries(x.zones||{})){ const t = out.zones[z] || (out.zones[z] = [0,0]); t[0]+=a; t[1]+=m; }
    if((REC.leagueHz||{})[s] && x.hz && Object.keys(x.hz).length){ out.hzSeasons++; for(const [z,[a,m]] of Object.entries(x.hz)){ const t = out.hz[z] || (out.hz[z] = [0,0]); t[0]+=a; t[1]+=m; } }
    for(const [c,[a,m]] of Object.entries(x.cells||{})){ const t = out.cells[c] || (out.cells[c] = [0,0]); t[0]+=a; t[1]+=m; }
    (x.assists||[]).forEach(([id,name,n]) => { const t = at.get(id) || {id,name,n:0}; t.n += n; t.name = name; at.set(id, t); });
    (x.assistedBy||[]).forEach(([id,name,n]) => { const t = af.get(id) || {id,name,n:0}; t.n += n; t.name = name; af.set(id, t); });
    for(const [z,[a,u]] of Object.entries(x.assisted||{})){ const t = out.assisted[z] || (out.assisted[z] = [0,0]); t[0]+=a; t[1]+=u; }
    for(const k in out.steals) out.steals[k] += (x.steals||{})[k] || 0;
    for(const k in out.blocks) out.blocks[k] += (x.blocks||{})[k] || 0;
  }
  out.assists = [...at.values()].sort((a,b)=>b.n-a.n).slice(0,8).map(t=>[t.id,t.name,t.n]);
  out.assistedBy = [...af.values()].sort((a,b)=>b.n-a.n).slice(0,8).map(t=>[t.id,t.name,t.n]);
  return out;
}
function leagueFor(sel){
  const L = REC.league || {};
  if(sel !== "career") return L[sel] || {};
  const out = {};
  for(const s of Object.values(L)) for(const [z,[a,m]] of Object.entries(s)){ const t = out[z] || (out[z]=[0,0]); t[0]+=a; t[1]+=m; }
  return out;
}
/* league hot-zone totals for the same seasons the player's zones cover */
function leagueHzFor(sel){
  const L = REC.leagueHz || {};
  if(sel !== "career") return L[sel] || {};
  const out = {};
  for(const [s, zones] of Object.entries(L)){
    const x = (REC.games || {})[s];
    if(!x || !x.hz || !Object.keys(x.hz).length) continue;
    for(const [z,[a,m]] of Object.entries(zones)){ const t = out[z] || (out[z]=[0,0]); t[0]+=a; t[1]+=m; }
  }
  return out;
}
function logObjs(logs){
  const cols = REC.logCols || [];
  return logs.map(r => Object.fromEntries(cols.map((c,i)=>[c, r[i]])));
}

/* ---------- pieces ---------- */
function heroHtml(team){
  const b = REC.bio || {}, seasons = REC.seasons || [];
  const last = seasons[seasons.length-1];
  const age = ageFrom(b.born);
  const retired = isRetired();
  const career = careerTotals().value;
  const facts = [b.pos || (last && last.pos), b.ht ? height(b.ht) : null, b.wt ? b.wt + " lb" : null, age != null ? `Age ${age}` : null].filter(Boolean).join(" · ");
  return `
  <div class="pp-hero"><div class="pp-hero-in">
    <button class="pp-back" id="ppBack">← ${window.PE_BACK === "#/players" ? "Back to players" : "Back to leaderboard"}</button>
    <div class="pp-top">
      <div class="pp-logo">${team.league ? `<img src="${NBA_LOGO}" alt="NBA logo" onerror="this.replaceWith(Object.assign(document.createElement('b'),{textContent:'NBA',style:'color:#1D428A;font-size:26px'}))">`
        : team.id ? `<img src="https://cdn.nba.com/logos/nba/${team.id}/primary/L/logo.svg" alt="${esc(team.n)} logo" onerror="this.style.display='none'">` : ""}</div>
      <div>
        <div id="ppAwards">${awardsHtml(REC.id)}</div>
        <h1 class="pp-name">${esc(REC.name)}</h1>
        <div class="pp-teamline">${retired ? `Retired · played ${esc(seasons[0].season)} to ${esc(last.season)} · ${careerTeams().length} team${careerTeams().length===1?"":"s"}` : esc(team.n || "")}${facts ? " · " + esc(facts) : ""}</div>
      </div>
      <div class="pp-eval">
        <div class="k">Pulse · ${esc(last ? last.season : "")}</div>
        <div class="v">${f3(last ? last.value : null)}</div>
        <div class="s">Career ${f3(career)}</div>
        <button class="pp-back" id="ppCompare" style="margin-top:8px">Compare with another player</button>
      </div>
    </div>
  </div></div>`;
}

function bioCard(){
  const b = REC.bio || {}, d = REC.draft;
  const age = ageFrom(b.born);
  const born = b.born && /^\d{4}-\d{2}-\d{2}$/.test(b.born) ? new Date(b.born+"T12:00:00").toLocaleDateString([], {month:"long", day:"numeric", year:"numeric"}) : (b.born || null);
  const draft = d ? `${d.year} · ${ordinal(d.round)} round · ${ordinal(d.pick)} pick${d.team ? " (" + esc(d.team) + ")" : ""}` : (b.from ? "Undrafted" : "—");
  const rows = [["Age", age != null ? `${age}${born ? ` (born ${born})` : ""}` : "—"], ["Height", height(b.ht)], ["Weight", b.wt ? b.wt + " lb" : "—"],
    ["Position", b.pos || "—"], ["College", b.college || "—"], ["Draft", draft], ["NBA seasons", b.from ? `${b.from - 1}-${String(b.from).slice(2)} to ${b.to - 1}-${String(b.to).slice(2)}` : "—"]];
  return `<div class="pp-card c6"><h3>Player bio</h3><dl class="pp-kv">${rows.map(([k,v])=>`<dt>${k}</dt><dd>${esc(v)}</dd>`).join("")}</dl></div>`;
}

function teamsCard(){
  const list = careerTeams();
  if(!list.length) return "";
  const yrs = t => t.from === t.to ? t.from : `${t.from} to ${t.to}`;
  return `<div class="pp-card c12"><h3>${isRetired() ? "Teams played for" : "Career teams"} <small>${list.length} stop${list.length===1?"":"s"}, in order</small></h3>
    <div class="pp-teams">${list.map(t => { const i = teamInfo(t.code); return `<div class="pp-team" style="--c1:${i.c1};--c2:${i.c2}">
      <div class="pp-team-logo">${i.logo ? `<img src="${i.logo}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{textContent:'${esc(t.code)}'}))">` : `<span>${esc(t.code)}</span>`}</div>
      <div><div class="pp-team-n">${esc(i.n)}</div><div class="pp-team-y">${esc(yrs(t))}${i.franchise && i.franchise !== i.n ? ` · now the ${esc(i.franchise)}` : ""}</div></div></div>`; }).join("")}</div></div>`;
}

function earningsCard(){
  const e = REC.earnings;
  let body;
  if(!e || !e.seasons || !e.seasons.length){
    body = `<div class="pp-empty">No salary records found for this player yet. Past salaries are filled in over the first few morning updates; Basketball-Reference's records are thin before the mid-1980s.</div>`;
  } else {
    const rows = e.seasons.slice().reverse();
    body = `<div class="pp-earn">${money(e.total)}</div>
      <div class="sub" style="margin:0 0 10px">NBA salary over ${e.seasons.length} season${e.seasons.length===1?"":"s"} on record</div>
      <div class="tablewrap" style="max-height:260px;overflow-y:auto"><div class="tablewrap"><table class="pp-tbl"><thead><tr><th class="l">Season</th><th class="l">Team</th><th>Salary</th></tr></thead><tbody>
      ${rows.map(([s,t,a])=>`<tr><td class="l">${esc(s)}</td><td class="l">${esc(t)}</td><td>${money(a)}</td></tr>`).join("")}</tbody></table></div></div>
      ${e.missing && e.missing.length ? `<div class="pp-note">No salary on record for ${e.missing.length} season${e.missing.length===1?"":"s"} (${esc(e.missing.slice(0,6).join(", "))}${e.missing.length>6?", …":""}), so the real total is higher.</div>` : ""}`;
  }
  return `<div class="pp-card c6"><h3>Total career earnings <small>playing salary, not adjusted for inflation</small></h3>${body}</div>`;
}

function contractCard(){
  const c = REC.contract;
  let body;
  if(!c || !c.years || !c.years.length){
    body = `<div class="pp-empty">${isRetired() ? `Not on an NBA contract — last played in ${esc(lastSeason().season)}.` : "No contract listed right now (free agent, two-way, or not yet posted)."}</div>`;
  } else {
    body = `<div class="tablewrap"><table class="pp-tbl"><thead><tr><th class="l">Season</th><th>Salary</th><th class="l">Note</th></tr></thead><tbody>
      ${c.years.map(([s,amt,opt],i)=>`<tr${i===0?' class="cur"':""}><td class="l">${esc(s)}</td><td>${esc(amt)}</td><td class="l">${esc(opt ? opt[0].toUpperCase()+opt.slice(1) : "")}</td></tr>`).join("")}
      </tbody></table></div>
      ${c.guaranteed ? `<div class="pp-note">Guaranteed money remaining: <b>${esc(c.guaranteed)}</b>${c.team ? " · " + esc(c.team) : ""}</div>` : ""}`;
  }
  const e = REC.earnings;
  const sofar = e && e.total ? `<div class="pp-note">Career earnings through last season: <b>${money(e.total)}</b>${e.missing && e.missing.length ? " (some seasons missing)" : ""}</div>` : "";
  return `<div class="pp-card c6"><h3>Contract <small>from Basketball-Reference</small></h3>${body}${sofar}</div>`;
}

function statLineCard(s, title, sub, extra){
  if(!s) return `<div class="pp-card c12"><h3>${esc(title)}</h3><div class="pp-empty">No games played yet.</div></div>`;
  const g = s.g || 0, trb = s.trb != null ? s.trb : (s.drb||0)+(s.orb||0);
  const items = [["G", g], ["MIN", f1(per(s.mp,g))], ["PTS", f1(per(s.pts,g))], ["REB", f1(per(trb,g))], ["AST", f1(per(s.ast,g))],
    ["STL", f1(per(s.stl,g))], ["BLK", f1(per(s.blk,g))], ["TOV", s.tov != null ? f1(per(s.tov,g)) : "—"],
    ["FG%", s.fga != null ? pct(s.fg, s.fga) : "—"], ["3P%", s.fg3a != null ? pct(s.fg3, s.fg3a) : "—"], ["FT%", s.fta != null ? pct(s.ft, s.fta) : "—"]];
  return `<div class="pp-card c12"><h3>${esc(title)} <small>${esc(sub || "per game")}</small></h3>
    <div class="pp-line">${items.map(([k,v])=>`<div class="pp-stat"><div class="k">${k}</div><div class="v">${v}</div></div>`).join("")}
    <div class="pp-stat hl"><div class="k">Pulse</div><div class="v">${f3(s.value)}</div></div></div>${extra || ""}</div>`;
}
/* Career totals across every season (percentages only when every season has the shooting numbers) */
function careerTotals(list){
  const seasons = list || REC.seasons || [];
  const T = {g:0,mp:0,pts:0,ast:0,drb:0,orb:0,trb:0,stl:0,blk:0,tov:0,fg:0,fga:0,fg3:0,fg3a:0,ft:0,fta:0}, have = {};
  seasons.forEach(s => { for(const k in T){ if(s[k] != null){ T[k] += s[k]; have[k] = (have[k]||0) + 1; } } if(s.trb == null) T.trb += (s.drb||0)+(s.orb||0); });
  const out = Object.assign({}, T, {team:"", value: evalOf(T), seasons: seasons.length});
  out.tovSum = T.tov;
  ["tov","fga","fg3a","fta"].forEach(k => { if(have[k] !== seasons.length) out[k] = null; });
  if(seasons.some(x => x.noTov)) out.tov = null;   // no turnover records before 1977-78
  return out;
}
const money = n => "$" + Math.round(n).toLocaleString();

/* Pulse+: Pulse that also charges missed shots (−1 per missed field goal, −0.5 per missed free throw) */
function mvrPlus(s){
  if(!s || !s.mp || s.fga == null) return null;
  const trb = s.trb != null ? s.trb : (s.drb||0) + (s.orb||0);
  return ((s.pts||0) + 2*(s.ast||0) + 2*trb + 4*(s.stl||0) + (s.blk||0) - 4*(s.noTov ? 0 : (s.tov||0)) - ((s.fga||0) - (s.fg||0)) - .5*((s.fta||0) - (s.ft||0))) / s.mp;
}
function careerCard(list, title, withRank, sub){
  const seasons = (list || []).slice().reverse();
  if(!seasons.length) return "";
  const row = (s, cls, label) => { const g = s.g || 0, trb = s.trb != null ? s.trb : (s.drb||0)+(s.orb||0); return `<tr class="${cls||""}">
    <td class="l">${esc(label || s.season)}</td><td class="l">${esc(s.team || "")}</td><td>${g}</td><td>${f1(per(s.mp,g))}</td><td>${f1(per(s.pts,g))}</td><td>${f1(per(trb,g))}</td>
    <td>${f1(per(s.ast,g))}</td><td>${f1(per(s.stl,g))}</td><td>${f1(per(s.blk,g))}</td><td>${s.tov!=null && !s.noTov?f1(per(s.tov,g)):"—"}</td>
    <td>${s.fga!=null?pct(s.fg,s.fga):"—"}</td><td>${s.fg3a!=null?pct(s.fg3,s.fg3a):"—"}</td><td>${s.fta!=null?pct(s.ft,s.fta):"—"}</td><td class="ev">${f3(s.value)}${s.noTov?"*":""}</td><td>${mvrPlus(s) != null ? f3(mvrPlus(s)) : "—"}</td>${withRank ? `<td>${s.rank ? ordinal(s.rank[0]) : "—"}</td>` : ""}</tr>`; };
  const career = careerTotals(list);
  const anyNoTov = seasons.some(x => x.noTov);
  return `<div class="pp-card c12"><h3>${esc(title)} <small>${esc(sub || "per game")}</small></h3>
    <div class="tablewrap"><table class="pp-tbl"><thead><tr><th class="l">Season</th><th class="l">Team</th><th>G</th><th>MIN</th><th>PTS</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th><th>TOV</th><th>FG%</th><th>3P%</th><th>FT%</th><th>Pulse</th><th title="Pulse+: Pulse that also charges missed shots (−1 per missed field goal, −0.5 per missed free throw)">Pulse+</th>${withRank ? "<th>Rank</th>" : ""}</tr></thead>
    <tbody>${seasons.map(s => row(s, s.current ? "cur" : "")).join("")}${row(career, "career", "Career")}</tbody></table></div>
    <div class="pp-note">Pulse on the career row is worked out from career totals, not an average of seasons.${withRank ? " Rank = where they finished in Pulse among qualified players that season." : ""}${anyNoTov ? " *The NBA didn't track turnovers before 1977-78, so nothing is subtracted for those seasons." : ""}</div></div>`;
}

function zoneOfCell(bx, by){
  const across = bx*2 + 1, fb = by*2 + 1, d = Math.hypot(fb - 5.25, across - 25);
  if((across < 3 || across > 47) && fb < 14) return "corner";
  if(d >= 23.75) return "Above the Break 3";
  if(d < 4) return "Restricted Area";
  if(across >= 17 && across <= 33 && fb < 19) return "In The Paint (Non-RA)";
  return "Mid-Range";
}
function leaguePct(L, z){
  if(z === "corner"){ const a = (L["Left Corner 3"]||[0,0]), b = (L["Right Corner 3"]||[0,0]); return (a[0]+b[0]) ? (a[1]+b[1])/(a[0]+b[0]) : null; }
  const t = L[z]; return t && t[0] ? t[1]/t[0] : null;
}
function heat(diff){
  const t = Math.max(-1, Math.min(1, (diff || 0) / 0.12));
  const lerp = (a,b,u) => Math.round(a + (b-a)*u);
  const grey = [163,163,163], hot = [220,38,38], cold = [37,99,235];
  const c = t >= 0 ? grey.map((v,i)=>lerp(v, hot[i], t)) : grey.map((v,i)=>lerp(v, cold[i], -t));
  return `rgb(${c.join(",")})`;
}
function courtSvg(cells, L){
  const entries = Object.entries(cells || {});
  const max = Math.max(1, ...entries.map(([,v])=>v[0]));
  const dots = entries.map(([k,[a,m]]) => {
    const [bx, by] = k.split(",").map(Number);
    if(by > 23) return "";
    const lp = leaguePct(L, zoneOfCell(bx, by));
    const r = Math.max(2.2, 9.5 * Math.sqrt(a / max));
    return `<circle cx="${bx*20+10}" cy="${by*20+10}" r="${r.toFixed(1)}" fill="${heat(lp != null && a ? m/a - lp : 0)}" opacity=".92"><title>${m}/${a} made (${pct(m,a)})${lp!=null?` · league ${(lp*100).toFixed(1)}%`:""}</title></circle>`;
  }).join("");
  return `<svg class="pp-court" viewBox="-6 -6 512 482" role="img" aria-label="Shot chart">
    <rect class="floor" x="0" y="0" width="500" height="470" rx="4"/>
    <g class="ln">
      <rect x="0" y="0" width="500" height="470"/>
      <rect x="170" y="0" width="160" height="190"/>
      <circle cx="250" cy="190" r="60"/>
      <path d="M210 52.5 A40 40 0 0 0 290 52.5"/>
      <line x1="220" y1="40" x2="280" y2="40"/>
      <circle cx="250" cy="52.5" r="7.5"/>
      <path d="M30 0 L30 142 A237.5 237.5 0 0 0 470 142 L470 0"/>
      <path d="M190 470 A60 60 0 0 1 310 470"/>
    </g>
    ${dots}
  </svg>`;
}

function shootingCard(G, L, sel){
  const LZ = leagueHzFor(sel);
  if(G && window.ZoneChart && ZoneChart.has(G.hz) && ZoneChart.has(LZ)){
    const n = Object.values(G.hz).reduce((t,[a])=>t+a, 0);
    const seasons = Object.keys(REC.games || {}).length;
    const partial = sel === "career" && G.hzSeasons < seasons;
    const estNote = "";
    return `<div class="pp-card c7"><h3>Shot zones <small>${n.toLocaleString()} shots · hot = above league average, cold = below</small></h3>
      ${ZoneChart.html(G.hz, LZ, {label: "Shot zones for " + (REC.name || "this player"), who: "his"})}
      <div class="pp-note">The corner three runs from the baseline up to the break in the three-point line. League averages are for the same season${sel === "career" ? "s" : ""}.${partial ? ` Covers ${G.hzSeasons} of ${seasons} seasons.` : ""}${estNote}</div></div>`;
  }
  if(!G || !Object.keys(G.zones||{}).length) return `<div class="pp-card c7"><h3>Shooting chart</h3><div class="pp-empty">No shot data for this selection.</div></div>`;
  const total = Object.values(G.zones).reduce((t,[a])=>t+a, 0);
  const zones = ZONE_ORDER.filter(z => G.zones[z]).concat(Object.keys(G.zones).filter(z => !ZONE_ORDER.includes(z)));
  const rows = zones.map(z => { const [a,m] = G.zones[z]; const lp = L[z] && L[z][0] ? L[z][1]/L[z][0] : null; const d = lp != null && a ? m/a - lp : null;
    return `<tr><td class="l"><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${heat(d)};margin-right:6px"></span>${esc(ZONE_SHORT[z] || z)}</td><td>${m}-${a}</td><td><b>${pct(m,a)}</b></td><td>${lp!=null?(lp*100).toFixed(1)+"%":"—"}</td><td>${pct(a,total)}</td></tr>`; }).join("");
  return `<div class="pp-card c7"><h3>Shooting chart <small>${total.toLocaleString()} shots · dot size = attempts</small></h3>
    ${courtSvg(G.cells, L)}
    <div class="pp-legend"><span>Colder than league</span><span class="grad"></span><span>Hotter</span></div>
    <div class="tablewrap" style="margin-top:12px"><table class="pp-zt"><thead><tr><th class="l">Zone</th><th>FGM-FGA</th><th>FG%</th><th>League</th><th>Of shots</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
}

function assistsCard(G){
  const list = (G && G.assists) || [];
  const max = Math.max(1, ...list.map(x=>x[2]));
  const total = list.reduce((t,x)=>t+x[2],0);
  return `<div class="pp-card"><h3>Assists to <small>made shots they set up</small></h3>
    ${list.length ? `<div class="pp-bars">${list.slice(0,6).map(([id,name,n]) => `<div class="pp-barrow"><a href="#/player/${encodeURIComponent(id)}">${esc(name)}</a>
      <div class="pp-track"><div class="pp-fill" style="width:${(100*n/max).toFixed(1)}%"></div></div><div class="n">${n}</div></div>`).join("")}</div>
      <div class="pp-note">Top teammate gets ${pct(list[0][2], total)} of these assists.</div>` : `<div class="pp-empty">No assists recorded for this selection.</div>`}</div>`;
}

function splitBar(parts){
  const total = parts.reduce((t,p)=>t+p.n, 0);
  if(!total) return "";
  return `<div class="pp-split">${parts.filter(p=>p.n).map(p => `<div style="flex:${p.n};background:${p.c}" title="${esc(p.label)}: ${p.n}">${p.n/total >= .12 ? Math.round(100*p.n/total) + "%" : ""}</div>`).join("")}</div>`;
}
function legendRows(parts){
  const total = parts.reduce((t,p)=>t+p.n, 0);
  return `<div class="pp-bars">${parts.map(p => `<div class="pp-barrow" style="grid-template-columns:minmax(120px,1fr) auto"><span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${p.c};margin-right:7px"></span>${esc(p.label)}</span><div class="n">${p.n} <span style="color:var(--dim);font-weight:500">(${pct(p.n,total)})</span></div></div>`).join("")}</div>`;
}
function stealsCard(G, team, cls){
  const s = (G && G.steals) || {on:0,off:0,oth:0};
  const parts = [{label:"On-ball (strips, poke-aways)", n:s.on, c:team.c1}, {label:"Off-ball (passing lanes)", n:s.off, c:team.c2}, {label:"Other / unclear", n:s.oth, c:"#9ca3af"}];
  const total = s.on + s.off + s.oth;
  return `<div class="pp-card ${cls||"c6"}"><h3>Where the steals come from <small>${total} steals</small></h3>
    ${total ? splitBar(parts) + legendRows(parts) : `<div class="pp-empty">No steals recorded for this selection.</div>`}
    <div class="pp-note">Estimate: the NBA doesn't log on-ball vs. off-ball. A steal off a <i>bad pass</i> is counted off-ball (jumping a lane); off a <i>lost ball</i>, on-ball (taking it from the handler).</div></div>`;
}
function blocksCard(G, team, cls){
  const b = (G && G.blocks) || {rim:0,paint:0,mid:0,three:0};
  const total = b.rim + b.paint + b.mid + b.three;
  const parts = [{label:"At the rim", n:b.rim, c:team.c1}, {label:"Paint floaters & hooks", n:b.paint, c:"#8b5cf6"}, {label:"Mid-range jumpers", n:b.mid, c:team.c2}, {label:"Three-point jumpers", n:b.three, c:"#9ca3af"}];
  return `<div class="pp-card ${cls||"c6"}"><h3>Where the blocks happen <small>${total} blocks</small></h3>
    ${total ? `<div class="sub" style="margin:0 0 4px"><b>${pct(b.rim + b.paint, total)}</b> at the rim or in the paint · <b>${pct(b.mid + b.three, total)}</b> on jump shots</div>` + splitBar(parts) + legendRows(parts) : `<div class="pp-empty">No blocks recorded for this selection.</div>`}
    <div class="pp-note">Based on where the blocked shot was taken. Whether it was their own man or a help-side rotation isn't in the NBA's public data.</div></div>`;
}

function statText(g){
  return [`${g.pts} PTS`, `${g.drb + g.orb} REB`, `${g.ast} AST`, g.stl ? `${g.stl} STL` : "", g.blk ? `${g.blk} BLK` : "", `${g.fgm}-${g.fga} FG`].filter(Boolean).join(" · ");
}
function top5Card(G){
  const logs = logObjs((G && G.logs) || []).filter(g => g.min >= MIN_TOP_GAME_MINUTES && g.eval != null).sort((a,b)=>b.eval-a.eval).slice(0,5);
  return `<div class="pp-card"><h3>Top 5 Pulse games <small>${MIN_TOP_GAME_MINUTES}+ minutes</small></h3>
    ${logs.length ? `<div class="pp-top5">${logs.map((g,i)=>`<div class="pp-game"><div class="r">${i+1}</div>
      <div><div class="l">${g.home ? "vs" : "@"} ${esc(g.opp)} · ${esc(g.res)} · ${Math.round(g.min)} min</div><div class="d">${esc(shortDate(g.date))} · ${statText(g)}</div></div>
      <div class="e">${f3(g.eval)}</div></div>`).join("")}</div>` : `<div class="pp-empty">No games with ${MIN_TOP_GAME_MINUTES}+ minutes in this selection.</div>`}</div>`;
}

function gameLogCard(G, key){
  const logs = logObjs((G && G.logs) || []).sort((a,b)=>String(b.date).localeCompare(String(a.date)) || String(b.gid).localeCompare(String(a.gid)));
  const all = !!LOGS_ALL[key];
  const shown = all ? logs : logs.slice(0, 20);
  return `<div class="pp-card c12"><h3>Game log <small>${logs.length} game${logs.length===1?"":"s"} · newest first</small></h3>
    ${logs.length ? `<div class="tablewrap"><table class="pp-tbl"><thead><tr><th class="l">Date</th><th class="l">Opp</th><th class="l">Result</th><th>MIN</th><th>PTS</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th><th>TOV</th><th>FG</th><th>3P</th><th>FT</th><th>+/-</th><th>Pulse</th></tr></thead><tbody>
      ${shown.map(g => `<tr><td class="l">${esc(shortDate(g.date))}</td><td class="l">${g.home ? "vs" : "@"} ${esc(g.opp)}</td><td class="l ${g.res === "W" ? "w" : "lo"}">${esc(g.res)}</td>
        <td>${Math.round(g.min)}</td><td>${g.pts}</td><td>${g.drb + g.orb}</td><td>${g.ast}</td><td>${g.stl}</td><td>${g.blk}</td><td>${g.tov}</td>
        <td>${g.fgm}-${g.fga}</td><td>${g.f3m}-${g.f3a}</td><td>${g.ftm}-${g.fta}</td><td>${g.pm > 0 ? "+" : ""}${g.pm}</td><td class="ev">${f3(g.eval)}</td></tr>`).join("")}
      </tbody></table></div>${logs.length > 20 ? `<div class="pp-more"><button data-logmore="${key}">${all ? "Show the last 20" : `Show all ${logs.length} games`}</button></div>` : ""}`
      : `<div class="pp-empty">No games for this selection.</div>`}</div>`;
}

/* ---------- rank, drivers, form, splits, highs, passing, on/off, similar ---------- */
function rankChips(line, isCareer){
  if(isCareer){
    const ranked = (REC.seasons || []).filter(x => x.rank);
    if(!ranked.length) return `<div class="pp-chips"><span class="pp-chip mute">Never qualified for a Pulse ranking</span></div>`;
    const best = ranked.slice().sort((a,b)=>a.rank[0]-b.rank[0] || b.value-a.value)[0];
    const top10 = ranked.filter(x => x.rank[0] <= 10).length;
    return `<div class="pp-chips"><span class="pp-chip hl">Best finish: ${ordinal(best.rank[0])} in ${esc(best.season)}</span>
      <span class="pp-chip">Top 10 in ${top10} season${top10===1?"":"s"}</span>
      <span class="pp-chip">Ranked in ${ranked.length} of ${(REC.seasons||[]).length} seasons</span></div>`;
  }
  if(!line) return "";
  if(!line.rank){
    const q = line.qual || [5, 15];
    return `<div class="pp-chips"><span class="pp-chip mute">Not ranked yet: needs ${q[0]}+ games and ${q[1]}+ minutes a game to qualify</span></div>`;
  }
  const [r, n, pr, pn, pos] = line.rank;
  const top = Math.max(1, Math.ceil(100 * r / n));
  return `<div class="pp-chips"><span class="pp-chip hl">${ordinal(r)} in Pulse ${line.current ? "this season" : "in " + esc(line.season)} <small>of ${n} qualified</small></span>
    <span class="pp-chip">${top <= 50 ? `Top ${top}% of qualified players` : `Better than ${Math.round(100 * (n - r) / n)}% of qualified players`}</span>
    <span class="pp-chip">${ordinal(pr)} among ${esc(POS_NAMES[pos] || pos)} <small>of ${pn}</small></span></div>`;
}

const sgn3 = v => { const t = v.toFixed(3); return t === "-0.000" ? "0.000" : (v > 0 && t !== "0.000" ? "+" + t : t); };
function driversCard(tot, lg, title, sub){
  if(!tot || !tot.mp || !lg) return `<div class="pp-card c6"><h3>${esc(title)}</h3><div class="pp-empty">Not enough minutes yet.</div></div>`;
  const rows = PARTS.map(([k,label,w]) => { const amt = k === "tov" ? (tot.tovSum ?? tot.tov ?? 0) : (tot[k] || 0);
    const me = w * amt / tot.mp, avg = w * (lg[k] || 0); return {k, label, me, avg, d: me - avg}; });
  const lgTotal = rows.reduce((t,r)=>t+r.avg,0), meTotal = rows.reduce((t,r)=>t+r.me,0);
  const max = Math.max(...rows.map(r => Math.max(Math.abs(r.me), Math.abs(r.avg))), .01);
  const best = rows.slice().sort((a,b)=>b.d-a.d)[0], worst = rows.slice().sort((a,b)=>a.d-b.d)[0];
  return `<div class="pp-card c6"><h3>${esc(title)} <small>${esc(sub)}</small></h3>
    <div class="sub" style="margin:0 0 10px">Biggest edge: <b>${esc(best.label.replace(/ ×\d| \(.*\)/,""))}</b> (${sgn3(best.d)} vs. average)${worst.d < 0 ? ` · Weakest: <b>${esc(worst.label.replace(/ ×\d| \(.*\)/,""))}</b> (${sgn3(worst.d)})` : ""}</div>
    <div class="tablewrap"><table class="pp-tbl pp-drv"><thead><tr><th class="l">Piece</th><th class="l"></th><th>Them</th><th>Avg</th><th>+/−</th></tr></thead><tbody>
    ${rows.map(r => `<tr><td class="l">${esc(r.label)}</td><td class="l" style="width:38%"><div class="pp-dbar"><div class="me" style="width:${(100*Math.abs(r.me)/max).toFixed(1)}%"></div><div class="avg" style="left:${(100*Math.abs(r.avg)/max).toFixed(1)}%"></div></div></td>
      <td>${r.me.toFixed(3)}</td><td>${r.avg.toFixed(3)}</td><td class="${+r.d.toFixed(3) > 0 ? "w" : +r.d.toFixed(3) < 0 ? "lo" : ""}">${sgn3(r.d)}</td></tr>`).join("")}
    <tr class="career"><td class="l">Pulse</td><td></td><td>${meTotal.toFixed(3)}</td><td>${lgTotal.toFixed(3)}</td><td class="${meTotal>=lgTotal?"w":"lo"}">${sgn3(meTotal-lgTotal)}</td></tr>
    </tbody></table></div>
    <div class="pp-note">Each piece of the formula per minute played, next to the league-wide average (the dark tick). They add up to Pulse.</div></div>`;
}
/* Pulse every season of the career, as bars; best season in gold, dashed line = career Pulse */
function peTrendCard(seasons, career){
  const list = (seasons || []).filter(x => x.value != null && (x.mp || 0) >= 100);
  if(list.length < 2) return `<div class="pp-card c6"><h3>Pulse by season</h3><div class="pp-empty">Needs at least two seasons.</div></div>`;
  const W = 560, H = 230, padL = 34, padB = 34, padT = 14, iw = W - padL - 8, ih = H - padT - padB;
  const vals = list.map(x => x.value).concat(career != null ? [career] : []);
  const hi = Math.max(...vals) * 1.08, lo = Math.min(0, Math.min(...vals));
  const y = v => padT + ih - (v - lo) / (hi - lo) * ih;
  const bw = iw / list.length, best = list.reduce((a, b) => b.value > a.value ? b : a);
  const step = hi > 1.6 ? .5 : hi > .8 ? .25 : .1, ticks = [];
  for(let v = 0; v < hi; v += step) ticks.push(+v.toFixed(2));
  const every = Math.ceil(list.length / 12);
  const bars = list.map((x, i) => {
    const h = Math.max(1, y(lo) - y(x.value)), cx = padL + i * bw;
    return `<g><title>${esc(x.season)} · ${esc(x.team || "")} · ${f3(x.value)} Pulse in ${x.g} games</title>
      <rect x="${(cx + bw * .14).toFixed(1)}" y="${y(x.value).toFixed(1)}" width="${(bw * .72).toFixed(1)}" height="${h.toFixed(1)}" rx="2" class="${x === best ? "best" : x.current ? "now" : ""}"></rect>
      ${i % every === 0 || x === best ? `<text x="${(cx + bw / 2).toFixed(1)}" y="${H - padB + 14}" text-anchor="middle">${esc("'" + x.season.slice(-2))}</text>` : ""}</g>`;
  }).join("");
  const line = career != null ? `<line x1="${padL}" x2="${W - 8}" y1="${y(career).toFixed(1)}" y2="${y(career).toFixed(1)}" class="avg"></line>` : "";
  return `<div class="pp-card c6"><h3>Pulse by season <small>${list.length} seasons · 100+ minutes</small></h3>
    <div class="sub" style="margin:0 0 6px">Best: <b>${f3(best.value)}</b> in ${esc(best.season)}${best.team ? ` (${esc(best.team)})` : ""}${career != null ? ` · Career: <b style="color:var(--nba-red,#C8102E)">${f3(career)}</b> (dashed line)` : ""}</div>
    <svg class="pp-trend" viewBox="0 0 ${W} ${H}" role="img" aria-label="Pulse by season">
      ${ticks.map(v => `<line x1="${padL}" x2="${W - 8}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" class="grid"></line><text x="${padL - 5}" y="${(y(v) + 3).toFixed(1)}" text-anchor="end">${v.toFixed(1)}</text>`).join("")}
      ${bars}${line}</svg>
    <div class="pp-note">Gold = best season. Hover a bar for the team and games. The dashed line is their whole-career Pulse.</div></div>`;
}
function careerLeague(list){
  let mp = 0; const out = {};
  (list || []).forEach(s => { if(!s.lg || !s.mp) return; mp += s.mp; PARTS.forEach(([k]) => out[k] = (out[k]||0) + s.lg[k] * s.mp); });
  if(!mp) return null;
  PARTS.forEach(([k]) => out[k] /= mp);
  return out;
}

function sumEval(games){
  const t = games.reduce((t,g)=>{ t.mp+=g.min; t.pts+=g.pts; t.ast+=g.ast; t.stl+=g.stl; t.drb+=g.drb; t.orb+=g.orb; t.blk+=g.blk; t.tov+=g.tov; return t; }, {mp:0,pts:0,ast:0,stl:0,drb:0,orb:0,blk:0,tov:0});
  return evalOf(t);
}
function sparkline(vals, ref){
  if(vals.length < 2) return "";
  const W = 300, H = 70, lo = Math.min(...vals, ref ?? Infinity) - .05, hi = Math.max(...vals, ref ?? -Infinity) + .05;
  const x = i => (i / (vals.length - 1)) * W, y = v => H - ((v - lo) / (hi - lo)) * H;
  return `<svg class="pp-spark" viewBox="-4 -4 ${W+8} ${H+8}" preserveAspectRatio="none">
    ${ref != null ? `<line x1="0" x2="${W}" y1="${y(ref).toFixed(1)}" y2="${y(ref).toFixed(1)}" class="ref"/>` : ""}
    <polyline points="${vals.map((v,i)=>`${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ")}" class="line"/>
    ${vals.map((v,i)=>`<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="3" class="dot"><title>${v.toFixed(3)}</title></circle>`).join("")}</svg>`;
}
function formCard(G, seasonValue){
  const logs = logObjs((G && G.logs) || []).sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  if(logs.length < 3) return `<div class="pp-card c6"><h3>Recent form</h3><div class="pp-empty">Needs a few more games.</div></div>`;
  const l5 = sumEval(logs.slice(-5)), l10 = sumEval(logs.slice(-10)), base = seasonValue ?? sumEval(logs);
  const tag = l10 >= base * 1.08 ? ["hot","Heating up"] : l10 <= base * 0.92 ? ["cold","Cooling off"] : ["even","Steady"];
  const last = logs.slice(-15).map(g => g.eval).filter(v => v != null);
  return `<div class="pp-card c6"><h3>Recent form <span class="pp-tag ${tag[0]}">${tag[1]}</span></h3>
    <div class="pp-line" style="grid-template-columns:repeat(3,1fr)">
      <div class="pp-stat"><div class="k">Last 5</div><div class="v">${f3(l5)}</div></div>
      <div class="pp-stat"><div class="k">Last 10</div><div class="v">${f3(l10)}</div></div>
      <div class="pp-stat hl"><div class="k">Season</div><div class="v">${f3(base)}</div></div></div>
    <div class="sub" style="margin:12px 0 4px">Pulse, last ${last.length} games (line = season)</div>${sparkline(last, base)}
    <div class="pp-note">"Heating up" = last 10 games at least 8% above the season number; "cooling off" = 8% below.</div></div>`;
}

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function splitsCard(G, key){
  const logs = logObjs((G && G.logs) || []);
  if(!logs.length) return "";
  const type = SPLIT[key] || "place";
  const groups = new Map();
  const add = (k, g) => { if(!groups.has(k)) groups.set(k, []); groups.get(k).push(g); };
  logs.forEach(g => {
    if(type === "place") add(g.home ? "Home" : "Away", g);
    else if(type === "result") add(g.res === "W" ? "Wins" : "Losses", g);
    else if(type === "role") add(g.start ? "Starter" : "Off the bench", g);
    else if(type === "month"){ const d = new Date(g.date + "T12:00:00"); add(isNaN(d) ? "?" : `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`, g); }
    else add(g.opp, g);
  });
  let keys = [...groups.keys()];
  if(type === "month") keys.sort();
  else if(type === "opp") keys.sort((a,b)=>groups.get(b).length - groups.get(a).length || a.localeCompare(b));
  const label = k => type === "month" && /^\d{4}-\d{2}$/.test(k) ? `${MONTHS[+k.slice(5)-1]} ${k.slice(0,4)}` : (type === "opp" ? "vs " + k : k);
  const row = k => { const gs = groups.get(k), n = gs.length, S = f => gs.reduce((t,g)=>t+(g[f]||0),0);
    return `<tr><td class="l">${esc(label(k))}</td><td>${n}</td><td>${f1(S("min")/n)}</td><td>${f1(S("pts")/n)}</td><td>${f1((S("drb")+S("orb"))/n)}</td><td>${f1(S("ast")/n)}</td><td>${f1(S("stl")/n)}</td><td>${f1(S("blk")/n)}</td><td>${f1(S("tov")/n)}</td><td>${pct(S("fgm"),S("fga"))}</td><td>${pct(S("f3m"),S("f3a"))}</td><td class="ev">${f3(sumEval(gs))}</td></tr>`; };
  const opts = [["place","Home / away"],["result","Wins / losses"],["role","Starter / bench"],["month","By month"],["opp","By opponent"]];
  return `<div class="pp-card c12"><h3>Splits <small>per game</small></h3>
    <div class="pp-tabs">${opts.map(([v,t])=>`<button data-split="${key}" data-v="${v}" class="${v===type?"on":""}">${t}</button>`).join("")}</div>
    <div class="tablewrap"${type==="opp"?' style="max-height:380px;overflow-y:auto"':""}><div class="tablewrap"><table class="pp-tbl"><thead><tr><th class="l">Split</th><th>G</th><th>MIN</th><th>PTS</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th><th>TOV</th><th>FG%</th><th>3P%</th><th>Pulse</th></tr></thead>
    <tbody>${keys.map(row).join("")}</tbody></table></div></div></div>`;
}

function highsCard(G, title, sub, cls){
  const logs = logObjs((G && G.logs) || []);
  if(!logs.length) return `<div class="pp-card ${cls||"c6"}"><h3>${esc(title)}</h3><div class="pp-empty">No games yet.</div></div>`;
  const items = [["Points", g => g.pts], ["Rebounds", g => g.drb + g.orb], ["Assists", g => g.ast], ["Steals", g => g.stl], ["Blocks", g => g.blk], ["3-pointers made", g => g.f3m]];
  const best = f => logs.reduce((b,g) => (f(g) > f(b) || (f(g) === f(b) && g.date > b.date)) ? g : b, logs[0]);
  const ten = g => [g.pts, g.drb + g.orb, g.ast, g.stl, g.blk].filter(v => v >= 10).length;
  const dd = logs.filter(g => ten(g) >= 2).length, td = logs.filter(g => ten(g) >= 3).length;
  const ev = logs.filter(g => g.min >= MIN_TOP_GAME_MINUTES && g.eval != null).sort((a,b)=>b.eval-a.eval)[0];
  const when = g => `${esc(shortDate(g.date))} ${g.home ? "vs" : "@"} ${esc(g.opp)}`;
  return `<div class="pp-card ${cls||"c6"}"><h3>${esc(title)} <small>${esc(sub)}</small></h3>
    <div class="tablewrap"><table class="pp-tbl"><tbody>${items.map(([k,f]) => { const g = best(f); return `<tr><td class="l">${k}</td><td><b>${f(g)}</b></td><td class="l" style="color:var(--dim)">${when(g)}</td></tr>`; }).join("")}
    ${ev ? `<tr><td class="l">Pulse (${MIN_TOP_GAME_MINUTES}+ min)</td><td class="ev">${f3(ev.eval)}</td><td class="l" style="color:var(--dim)">${when(ev)}</td></tr>` : ""}
    <tr class="career"><td class="l">Double-doubles / triple-doubles</td><td>${dd} / ${td}</td><td></td></tr></tbody></table></div></div>`;
}

function assistedCard(G){
  const ua = (G && G.assisted) || {};
  const zones = ZONE_ORDER.filter(z => ua[z]);
  const tot = zones.reduce((t,z)=>[t[0]+ua[z][0], t[1]+ua[z][1]], [0,0]);
  const made = tot[0] + tot[1];
  if(!made) return `<div class="pp-card"><h3>Assisted vs. unassisted</h3><div class="pp-empty">No made shots in this selection.</div></div>`;
  const two = zones.filter(z => !/3$/.test(z) && z !== "Backcourt").reduce((t,z)=>[t[0]+ua[z][0], t[1]+ua[z][1]], [0,0]);
  const three = zones.filter(z => /3$/.test(z) || z === "Backcourt").reduce((t,z)=>[t[0]+ua[z][0], t[1]+ua[z][1]], [0,0]);
  return `<div class="pp-card"><h3>Assisted vs. unassisted <small>${made} made shots</small></h3>
    <div class="pp-split"><div style="flex:${tot[0]};background:var(--tc1)">${tot[0]/made>=.15?`${Math.round(100*tot[0]/made)}% assisted`:""}</div><div style="flex:${tot[1]};background:var(--tc2);color:#111">${tot[1]/made>=.15?`${Math.round(100*tot[1]/made)}% on their own`:""}</div></div>
    <div class="tablewrap"><table class="pp-tbl"><thead><tr><th class="l">Makes</th><th>Assisted</th><th>Own</th><th>% assisted</th></tr></thead><tbody>
      <tr><td class="l">2-pointers</td><td>${two[0]}</td><td>${two[1]}</td><td>${pct(two[0], two[0]+two[1])}</td></tr>
      <tr><td class="l">3-pointers</td><td>${three[0]}</td><td>${three[1]}</td><td>${pct(three[0], three[0]+three[1])}</td></tr>
      ${zones.map(z => `<tr><td class="l" style="color:var(--dim)">· ${esc(ZONE_SHORT[z]||z)}</td><td>${ua[z][0]}</td><td>${ua[z][1]}</td><td>${pct(ua[z][0], ua[z][0]+ua[z][1])}</td></tr>`).join("")}
    </tbody></table></div></div>`;
}
function passList(list, title, sub, empty){
  const max = Math.max(1, ...list.map(x=>x[2])), total = list.reduce((t,x)=>t+x[2],0);
  return `<div class="pp-card"><h3>${title} <small>${sub}</small></h3>
    ${list.length ? `<div class="pp-bars">${list.slice(0,6).map(([id,name,n]) => `<div class="pp-barrow"><a href="#/player/${encodeURIComponent(id)}">${esc(name)}</a>
      <div class="pp-track"><div class="pp-fill" style="width:${(100*n/max).toFixed(1)}%"></div></div><div class="n">${n}</div></div>`).join("")}</div>
      <div class="pp-note">Top name accounts for ${pct(list[0][2], total)} of these.</div>` : `<div class="pp-empty">${empty}</div>`}</div>`;
}

function onOffCard(G, cls){
  const logs = logObjs((G && G.logs) || []).filter(g => g.tm != null && g.gm);
  if(!logs.length) return `<div class="pp-card ${cls||"c6"}"><h3>On/off impact</h3><div class="pp-empty">Not available for this selection yet.</div></div>`;
  const onMin = logs.reduce((t,g)=>t+g.min,0), onPm = logs.reduce((t,g)=>t+g.pm,0);
  const offMin = logs.reduce((t,g)=>t+Math.max(0, g.gm - g.min),0), offPm = logs.reduce((t,g)=>t+(g.tm - g.pm),0);
  const on = onMin ? 48*onPm/onMin : null, off = offMin >= 10 ? 48*offPm/offMin : null, sw = on != null && off != null ? on - off : null;
  const sign = v => v == null ? "—" : (v > 0 ? "+" : "") + v.toFixed(1);
  return `<div class="pp-card ${cls||"c6"}"><h3>On/off impact <small>${logs.length} games</small></h3>
    <div class="pp-line" style="grid-template-columns:repeat(3,1fr)">
      <div class="pp-stat"><div class="k">On the floor</div><div class="v ${on>=0?"pos":"neg"}">${sign(on)}</div></div>
      <div class="pp-stat"><div class="k">On the bench</div><div class="v ${off>=0?"pos":"neg"}">${sign(off)}</div></div>
      <div class="pp-stat hl"><div class="k">Swing</div><div class="v">${sign(sw)}</div></div></div>
    <div class="pp-note">Team point differential per 48 minutes with them on the floor vs. off it, from each game's plus-minus. A bigger swing means the team is much better with them out there.</div></div>`;
}

function similarCard(title, sub, list, kind){
  return `<div class="pp-card c6"><h3>${esc(title)} <small>${esc(sub)}</small></h3>
    ${list && list.length ? `<div class="pp-sims">${list.map(r => `<a class="pp-sim" href="#/player/${encodeURIComponent(r[0])}">
      <span class="nm">${esc(r[1])}</span><span class="tm">${esc(r[2] || "")}</span><span class="sc">${r[3]}% match</span>
      <span class="cmp" data-cmp="${esc(r[0])}" title="Compare side by side">Compare</span></a>`).join("")}</div>
      <div class="pp-note">${kind === "season" ? "Players this season whose mix of scoring, passing, rebounding, defense and turnovers per minute is closest." : "Careers with the closest mix of Pulse pieces, each season measured against its own league so eras compare fairly."}</div>`
      : `<div class="pp-empty">${kind === "season" ? "Shows up once they've played a couple hundred minutes this season." : "Needs at least 1,500 career minutes."}</div>`}</div>`;
}

function playoffsBlock(){
  const list = REC.playoffs || [];
  if(!list.length) return `<div class="pp-grid"><div class="pp-card c12"><h3>Playoffs</h3><div class="pp-empty">No playoff games on record.</div></div></div>`;
  const t = careerTotals(list);
  const series = list.length;
  return `<div class="pp-grid">${statLineCard(t, "Playoff career stat line", "per game, every playoff run",
      `<div class="pp-note">${series} playoff run${series===1?"":"s"} · ${t.g} games · ${Math.round(t.pts).toLocaleString()} points. Pulse worked out from playoff totals.</div>`)}</div>
    <div class="pp-gap"></div><div class="pp-grid">${careerCard(list, "Playoffs, season by season", false, "per game · playoffs")}</div>`;
}

/* ---------- page ---------- */
function gameBoxes(G, L, team, key, withOnOff, sel){
  const c = withOnOff ? "c6" : "c4";
  return `<div class="pp-grid">${shootingCard(G, L, sel)}<div class="c5 pp-col">${passList((G&&G.assists)||[], "Assists to", "made shots they set up", "No assists recorded for this selection.")}${passList((G&&G.assistedBy)||[], "Assisted by", "who sets them up", "No assisted makes recorded for this selection.")}</div>
    <div class="c6 pp-col">${assistedCard(G)}</div><div class="c6 pp-col">${top5Card(G)}</div>
    ${highsCard(G, key === "season" ? "Season highs" : "Career highs", key === "season" ? "single game, this season" : "single game, since " + ((Object.keys(REC.games||{}).sort()[0]) || ""), c)}${withOnOff ? onOffCard(G) : ""}
    ${stealsCard(G, team, c)}${blocksCard(G, team, c)}
    ${splitsCard(G, key)}${gameLogCard(G, key)}</div>`;
}
function sectionHead(title, sub){
  return `<div class="pp-section"><h2>${title}</h2>${sub ? `<div class="sub">${sub}</div>` : ""}</div>`;
}
function currentLabel(){
  const cur = (REC.seasons || []).find(x => x.current);
  if(cur) return cur.season;
  const y = curEndYear(); return `${y-1}-${String(y).slice(2)}`;
}

function render(){
  const retired = isRetired();
  const team = retired ? NBA_SCHEME : teamOf(REC.team);
  const panel = dark() ? "#121b2e" : "#ffffff";
  EL.style.setProperty("--tc1", team.c1);
  EL.style.setProperty("--tc2", team.c2);
  EL.style.setProperty("--tcbar", contrast(team.c1, panel) >= 1.8 ? team.c1 : team.c2);
  const gs = Object.keys(REC.games || {}).sort().reverse();

  // ---- this season (active players only)
  let seasonHtml = "";
  if(!retired){
    const label = currentLabel();
    const cur = (REC.seasons || []).find(x => x.current) || null;
    const G = (REC.games || {})[label] || null;
    const curPO = (REC.playoffs || []).find(x => x.season === label);
    const sim = REC.similarSeason;
    seasonHtml = sectionHead(`${esc(label)} season`, "This season only. Updated every morning.")
      + `<div class="pp-grid">${statLineCard(cur, `${label} stat line`, "this season, per game", rankChips(cur))}</div><div class="pp-gap"></div>`
      + `<div class="pp-grid">${driversCard(cur, cur && cur.lg, "What drives their Pulse", "this season, per minute")}${G ? formCard(G, cur && cur.value) : `<div class="pp-card c6"><h3>Recent form</h3><div class="pp-empty">Shows up after a few games.</div></div>`}
        ${similarCard("Most similar players this season", sim ? sim.season : "", sim && sim.list.map(r => [r[0], r[1], r[2] + " · " + f3(r[4]), r[3]]), "season")}${onOffCard(G)}${clutchCard()}</div><div class="pp-gap"></div>`
      + (curPO ? `<div class="pp-grid">${statLineCard(curPO, `${label} playoffs`, "per game, this postseason")}</div><div class="pp-gap"></div>` : "")
      + (G ? gameBoxes(G, leagueFor(label), team, "season", false, label) : `<div class="final-note">No games yet this season. The shooting chart, passing, steals, blocks, splits, highs and game log fill in once ${esc(REC.name.split(" ")[0])} plays.</div>`);
  }

  // ---- career
  if(SEL == null || (SEL !== "career" && !gs.includes(SEL))) SEL = gs.length ? "career" : null;
  const ct = careerTotals();
  const span = (REC.seasons || []).length ? `${REC.seasons[0].season} to ${REC.seasons[REC.seasons.length-1].season}` : "";
  const extra = rankChips(null, true) + `<div class="pp-note">${ct.seasons} season${ct.seasons===1?"":"s"}${span ? " (" + esc(span) + ")" : ""} · career totals: ${Math.round(ct.pts).toLocaleString()} points, ${Math.round(ct.trb).toLocaleString()} rebounds, ${Math.round(ct.ast).toLocaleString()} assists, ${Math.round(ct.stl).toLocaleString()} steals, ${Math.round(ct.blk).toLocaleString()} blocks. Pulse is worked out from career totals.</div>`;
  let gameCareer;
  if(gs.length){
    const G = gamesFor(SEL), L = leagueFor(SEL);
    const oldest = gs[gs.length-1];
    const pick = `<div class="pp-seasonpick"><label class="sub" for="ppSeason" style="font-weight:600">Show:</label>
      <select id="ppSeason"><option value="career"${SEL==="career"?" selected":""}>Whole career${gs.length > 1 ? ` (${esc(oldest)} on)` : ""}</option>${gs.map(s=>`<option value="${esc(s)}"${s===SEL?" selected":""}>${esc(s)} only</option>`).join("")}</select>
      <span class="sub">${(REC.seasons||[]).length && REC.seasons[0].season < oldest ? `Game-by-game records start in ${esc(oldest)}, the NBA feed's oldest season for this player.` : ""}</span></div>`;
    gameCareer = pick + gameBoxes(G, L, team, "career", true, SEL);
  } else {
    gameCareer = `<div class="final-note">Shot-by-shot and game-by-game data isn't available for this player's seasons, so there's no shooting chart, passing, splits, highs, on/off or game log. The NBA's public game feed only goes back so far.</div>`;
  }
  const careerHtml = sectionHead(retired ? "Career" : "Career to date", retired ? "Every season of their NBA career." : "Every season so far, including this one.")
    + `<div class="pp-grid">${statLineCard(ct, "Career stat line", "per game, whole career", extra)}</div><div class="pp-gap"></div>`
    + `<div class="pp-grid">${retired ? driversCard(ct, careerLeague(REC.seasons), "What drives their Pulse", "whole career, per minute") : peTrendCard(REC.seasons, ct.value)}${similarCard("Most similar careers", "all-time", REC.similarCareer && REC.similarCareer.map(r => [r[0], r[1], r[2], r[3]]), "career")}</div><div class="pp-gap"></div>`
    + gameCareer + `<div class="pp-gap"></div><div class="pp-grid">${careerCard(REC.seasons, "Season by season", true, "per game · regular season")}</div>`
    + sectionHead("Playoffs", "Every postseason run.") + playoffsBlock();

  EL.innerHTML = heroHtml(team) + `<div class="pp-body">
    <div class="pp-grid">${bioCard()}${retired ? earningsCard() : contractCard()}${teamsCard()}</div>
    ${seasonHtml}
    ${careerHtml}
  </div>`;
  document.title = `${REC.name} · Full Court Geek Press`;
  EL.querySelector("#ppBack").onclick = () => { location.hash = window.PE_BACK || ""; };
  EL.querySelector("#ppCompare").onclick = () => { location.hash = "#/compare/" + encodeURIComponent(REC.id); };
  EL.querySelectorAll("[data-cmp]").forEach(b => b.onclick = e => { e.preventDefault(); e.stopPropagation(); location.hash = `#/compare/${encodeURIComponent(REC.id)}/${encodeURIComponent(b.dataset.cmp)}`; });
  const sel = EL.querySelector("#ppSeason"); if(sel) sel.onchange = () => { SEL = sel.value; LOGS_ALL.career = false; render(); };
  EL.querySelectorAll("[data-logmore]").forEach(b => b.onclick = () => { LOGS_ALL[b.dataset.logmore] = !LOGS_ALL[b.dataset.logmore]; render(); });
  EL.querySelectorAll("[data-split]").forEach(b => b.onclick = () => { SPLIT[b.dataset.split] = b.dataset.v; const y = window.scrollY; render(); window.scrollTo(0, y); });
}

/* ---------- crunch time: last 5 minutes of the 4th quarter or overtime, score within 5 ---------- */
let SEASONP = null;
async function loadSeasonPlayers(){
  if(SEASONP) return SEASONP;
  const d = await getJSON("data/teams/players.json");
  SEASONP = {cols: (d && d.cols) || [], rows: (d && d.players) || [], moments: (d && d.moments) || {}};
  return SEASONP;
}
const foldName = s => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, "").replace(/[^a-z]/g, "");
function clutchCard(){
  const box = `<div class="pp-card c12" id="ppClutch">`;
  if(!SEASONP) return box + `<h3>Crunch time</h3><div class="pp-empty">Loading…</div></div>`;
  const C = Object.fromEntries(SEASONP.cols.map((c, i) => [c, i]));
  const r = SEASONP.rows.find(x => foldName(x[C.name]) === foldName(REC.name));
  if(!r) return box + `<h3>Crunch time <small>last 5 minutes of the 4th or OT, score within 5</small></h3><div class="pp-empty">No games yet this season.</div></div>`;
  const v = k => r[C[k]] || 0;
  const mins = v("min"), cmin = v("c_sec") / 60;
  const base = mins ? (v("pts") + 2*v("ast") + 2*(v("dreb") + v("oreb")) + 4*v("stl") + v("blk") - 4*v("tov")) / mins : null;
  /* Clutch Pulse: the Pulse formula on crunch-time stats only, per crunch-time minute (0 with no crunch-time minutes) */
  const cpe = cmin ? (v("c_pts") + 2*v("c_ast") + 2*v("c_reb") + 4*v("c_stl") + v("c_blk") - 4*v("c_tov")) / cmin : 0;
  const moments = (SEASONP.moments[r[C.id]] || []).slice().reverse();
  const clock = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  const per = (n, d) => d ? `${n}-${d}` : "—";
  const stat = (k, l) => `<div class="pp-cstat"><span>${l}</span><b>${k}</b></div>`;
  return box + `<h3>Crunch time <small>last 5 minutes of the 4th or overtime with the score within 5 · this season</small></h3>
    ${cmin ? `<div class="pp-cgrid">
      <div class="pp-cpe"><div><span>Pulse</span><b>${f3(base)}</b></div><div class="hot"><span>Clutch Pulse</span><b>${f3(cpe)}</b></div>
        <div class="pp-note" style="margin:6px 0 0">Pulse covers all his minutes; Clutch Pulse uses only his crunch-time stats and minutes. ${cpe > base ? "He's been better in crunch time." : cpe < base ? "He's been less productive in crunch time." : ""}</div></div>
      <div class="pp-cstats">${stat(cmin.toFixed(1), "Minutes")}${stat(v("c_pts"), "Points")}${stat(per(v("c_fgm"), v("c_fga")), "FG")}${stat(per(v("c_fg3m"), v("c_fg3a")), "3P")}${stat(per(v("c_ftm"), v("c_fta")), "FT")}
        ${stat(v("c_ast"), "Assists")}${stat(v("c_reb"), "Rebounds")}${stat(v("c_stl"), "Steals")}${stat(v("c_blk"), "Blocks")}${stat(v("c_tov"), "Turnovers")}${stat((v("c_pm") > 0 ? "+" : "") + v("c_pm"), "+/-")}</div>
    </div>
    ${moments.length ? `<h4 class="pp-subh">Go-ahead and tying baskets</h4><ul class="pp-moments">${moments.slice(0, 8).map(m => `<li><b class="${m[5] === "go-ahead" ? "w" : ""}">${m[5] === "go-ahead" ? "Go-ahead" : "Tying"}</b>
      <span>${esc(new Date(m[1] + "T12:00:00Z").toLocaleDateString("en-US", {month:"short", day:"numeric"}))} vs ${esc(m[2])} · ${m[3] > 4 ? "OT" + (m[3] > 5 ? m[3] - 4 : "") : "Q4"} ${clock(m[4])} left</span>
      <span class="t">${esc(m[6])}</span><span class="sc">${m[7]}-${m[8]}</span></li>`).join("")}</ul>` : ""}`
    : `<div class="pp-empty">No crunch-time minutes yet this season.</div>`}</div>`;
}

/* ---------- awards and championships next to the name ---------- */
let AWARDS = null;
async function loadAwards(){
  if(AWARDS) return AWARDS;
  const d = await getJSON("data/player_awards.json");
  return AWARDS = (d && d.players) || {};
}
const AWARD_ROWS = [["title","Champion"],["mvp","MVP"],["fmvp","Finals MVP"],["dpoy","Defensive Player of the Year"],["roy","Rookie of the Year"],
  ["smoy","Sixth Man of the Year"],["mip","Most Improved"],["clutch_poy","Clutch Player"],["all_nba|1st","All-NBA 1st"],["all_nba|2nd","All-NBA 2nd"],
  ["all_nba|3rd","All-NBA 3rd"],["all_defense|1st","All-Defensive 1st"],["all_defense|2nd","All-Defensive 2nd"],["all_rookie|1st","All-Rookie 1st"],["all_rookie|2nd","All-Rookie 2nd"],["all_star","All-Star"],["all_star_mvp","All-Star MVP"],
  ["ecf_mvp","East Finals MVP"],["wcf_mvp","West Finals MVP"],["ist_mvp","NBA Cup MVP"],["cpoy","Comeback Player"],["player_of_the_seeding_games","Player of the Seeding Games"],
  ["hustle","Hustle Award"],["sportsmanship","Sportsmanship Award"],["tmoy","Teammate of the Year"],["citizenship","Citizenship Award"],["social_justice","Social Justice Champion"]];
const ICON_TROPHY = `<svg viewBox="0 0 16 18" aria-hidden="true"><path fill="#f5c542" d="M4 1h8v5.2c0 2.3-1.6 4.2-3.3 4.6V13h2.3l.8 2H4.2l.8-2h2.3v-2.2C5.6 10.4 4 8.5 4 6.2z"/><path fill="none" stroke="#f5c542" stroke-width="1.2" d="M4 2.5H1.8v1.6c0 1.6 1 2.8 2.4 3M12 2.5h2.2v1.6c0 1.6-1 2.8-2.4 3"/><rect x="3.2" y="15.6" width="9.6" height="1.6" rx=".4" fill="#d9a72e"/></svg>`;
const ICON_STAR = `<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="#f5c542" d="M8 1l2.1 4.4 4.9.7-3.5 3.4.8 4.8L8 12l-4.3 2.3.8-4.8L1 6.1l4.9-.7z"/></svg>`;
const ICON_TEAM = `<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.2" fill="none" stroke="#f5c542" stroke-width="1.6"/><path fill="#f5c542" d="M8 4.2l1.1 2.3 2.5.4-1.8 1.8.4 2.5L8 10l-2.2 1.2.4-2.5-1.8-1.8 2.5-.4z"/></svg>`;
function awardsHtml(id){
  const a = AWARDS && AWARDS[id];
  if(!a) return "";
  const years = {};
  (a.titles || []).forEach(([y]) => (years.title = years.title || []).push(y));
  (a.awards || []).forEach(([y, key, tier]) => { const k = tier ? `${key}|${tier}` : key; (years[k] = years[k] || []).push(y); });
  const season = y => `${y - 1}-${String(y).slice(2)}`;
  const chips = AWARD_ROWS.filter(([k]) => years[k]).map(([k, label]) => {
    const ys = years[k].sort((x, y) => x - y), n = ys.length;
    const icon = k === "title" ? ICON_TROPHY : k.includes("|") || k === "all_star" ? ICON_TEAM : ICON_STAR;
    const shown = n <= 5 ? ys.join(", ") : `${ys[0]}–${ys[n - 1]}`;   // long runs: first and last year (all of them on hover)
    return `<span class="pp-award${k === "title" || k === "mvp" || k === "fmvp" ? " big" : ""}" title="${esc(label)}: ${ys.map(season).join(", ")}">${icon}<b>${n > 1 ? n + "× " : ""}${esc(label)}</b><small>${shown}</small></span>`;
  });
  return chips.length ? `<div class="pp-awards">${chips.join("")}</div>` : "";
}

async function show(id, el){
  EL = el;
  loadAwards().then(() => { const box = EL.querySelector("#ppAwards"); if(box && REC && REC.id === id) box.innerHTML = awardsHtml(id); });
  loadSeasonPlayers().then(() => { const box = EL.querySelector("#ppClutch"); if(box && REC && REC.id === id) box.outerHTML = clutchCard(); });
  if(!REC || REC.id !== id){
    el.innerHTML = `<div class="pp-loading">Loading player…</div>`;
    const rec = await getJSON("data/players/" + encodeURIComponent(id) + ".json");
    if(!rec){
      el.innerHTML = `<div class="pp-body"><button id="ppBack2">← ${window.PE_BACK === "#/players" ? "Back to players" : "Back to leaderboard"}</button><div class="pp-loading">There's no page for this player yet. Player pages are built during the morning update.</div></div>`;
      el.querySelector("#ppBack2").onclick = () => { location.hash = window.PE_BACK || ""; };
      return;
    }
    REC = rec; SEL = null; LOGS_ALL = {};
  }
  render();
}

/* ---------- side-by-side comparison: #/compare/<id>/<id> ---------- */
let INDEX = null;
const recCache = {};
async function loadRec(id){
  if(!id) return null;
  if(recCache[id]) return recCache[id];
  const r = await getJSON("data/players/" + encodeURIComponent(id) + ".json");
  if(r) recCache[id] = r;
  return r;
}
function withRec(rec, fn){ const keep = REC; REC = rec; try{ return fn(); } finally { REC = keep; } }
function summary(rec){
  return withRec(rec, () => {
    const retired = isRetired(), seasons = rec.seasons || [];
    const latest = seasons.find(x => x.current) || seasons[seasons.length-1] || {};
    const ct = careerTotals(), po = careerTotals(rec.playoffs || []);
    const ranked = seasons.filter(x => x.rank).sort((a,b)=>a.rank[0]-b.rank[0]);
    const bestSeason = seasons.filter(x => x.rank || (x.mp||0) >= 500).sort((a,b)=>b.value-a.value)[0];
    const G = Object.keys(rec.games || {}).length ? gamesFor("career") : null;
    const logs = logObjs((G && G.logs) || []);
    const hi = f => logs.length ? Math.max(...logs.map(f)) : null;
    const on = logs.filter(g => g.tm != null && g.gm);
    const onMin = on.reduce((t,g)=>t+g.min,0), offMin = on.reduce((t,g)=>t+Math.max(0,g.gm-g.min),0);
    const swing = onMin && offMin >= 10 ? 48*on.reduce((t,g)=>t+g.pm,0)/onMin - 48*on.reduce((t,g)=>t+(g.tm-g.pm),0)/offMin : null;
    const lg = careerLeague(seasons);
    const drv = {}; PARTS.forEach(([k,,w]) => { const amt = k === "tov" ? (ct.tovSum ?? 0) : (ct[k]||0); drv[k] = ct.mp ? w*amt/ct.mp : null; });
    const team = retired ? NBA_SCHEME : teamOf(rec.team);
    return {rec, retired, team, latest, ct, po, ranked, bestSeason, logs, hi, swing, drv, lg,
      span: seasons.length ? `${seasons[0].season} to ${seasons[seasons.length-1].season}` : ""};
  });
}
function cmpRows(A, B){
  const g = (t, k) => t.g ? (t[k] ?? null) / t.g : null;
  const reb = t => t.g ? ((t.trb ?? ((t.drb||0)+(t.orb||0))) / t.g) : null;
  const P = (m, a) => (a ? m/a : null);
  return [
    ["Pulse", null],
    [`Latest season`, s => s.latest.value, f3, 1, s => s.latest.season ? ` <small>${esc(s.latest.season)}</small>` : ""],
    ["Latest season rank", s => s.latest.rank ? s.latest.rank[0] : null, v => ordinal(v), -1],
    ["Career Pulse", s => s.ct.value, f3, 1],
    ["Best season", s => s.bestSeason ? s.bestSeason.value : null, f3, 1, s => s.bestSeason ? ` <small>${esc(s.bestSeason.season)}</small>` : ""],
    ["Best finish", s => s.ranked.length ? s.ranked[0].rank[0] : null, v => ordinal(v), -1],
    ["Top-10 seasons", s => s.ranked.filter(x => x.rank[0] <= 10).length, v => v, 1],
    ["Career, per game", null],
    ["Seasons", s => s.ct.seasons, v => v, 1],
    ["Games", s => s.ct.g, v => v.toLocaleString(), 1],
    ["Minutes", s => g(s.ct, "mp"), f1, 1],
    ["Points", s => g(s.ct, "pts"), f1, 1],
    ["Rebounds", s => reb(s.ct), f1, 1],
    ["Assists", s => g(s.ct, "ast"), f1, 1],
    ["Steals", s => g(s.ct, "stl"), f1, 1],
    ["Blocks", s => g(s.ct, "blk"), f1, 1],
    ["Turnovers", s => s.ct.tov != null ? g(s.ct, "tov") : null, f1, -1],
    ["FG%", s => s.ct.fga ? P(s.ct.fg, s.ct.fga) : null, v => (100*v).toFixed(1) + "%", 1],
    ["3P%", s => s.ct.fg3a ? P(s.ct.fg3, s.ct.fg3a) : null, v => (100*v).toFixed(1) + "%", 1],
    ["FT%", s => s.ct.fta ? P(s.ct.ft, s.ct.fta) : null, v => (100*v).toFixed(1) + "%", 1],
    ["What drives Pulse (per minute)", null],
    ...PARTS.map(([k,label,w]) => [label, s => s.drv[k], f3, 1]),
    ["Playoffs", null],
    ["Playoff games", s => s.po.g || 0, v => v, 1],
    ["Playoff Pulse", s => s.po.g ? s.po.value : null, f3, 1],
    ["Playoff points per game", s => g(s.po, "pts"), f1, 1],
    ["Game by game", null],
    ["Career-high points", s => s.hi(x => x.pts), v => v, 1],
    ["Career-high rebounds", s => s.hi(x => x.drb + x.orb), v => v, 1],
    ["Career-high assists", s => s.hi(x => x.ast), v => v, 1],
    ["On/off swing (per 48)", s => s.swing, v => (v > 0 ? "+" : "") + v.toFixed(1), 1],
    ["Money", null],
    ["Career earnings on record", s => s.rec.earnings ? s.rec.earnings.total : null, money, 1],
  ];
}
function cmpHead(S){
  if(!S) return `<div class="cmp-p" style="background:var(--row);color:var(--dim)">Pick a player above</div>`;
  const t = S.team;
  const logo = t.league ? NBA_LOGO : (t.id ? `https://cdn.nba.com/logos/nba/${t.id}/primary/L/logo.svg` : null);
  return `<a class="cmp-p" href="#/player/${encodeURIComponent(S.rec.id)}" style="background:${t.c1};text-decoration:none">
    <div class="lg">${logo ? `<img src="${logo}" alt="" onerror="this.style.display='none'">` : ""}</div>
    <div style="min-width:0"><div class="nm">${esc(S.rec.name)}</div><div class="tm">${S.retired ? "Retired" : esc(t.n)} · ${esc(S.span)}</div></div></a>`;
}
async function compare(idA, idB, el){
  EL = el;
  el.innerHTML = `<div class="pp-loading">Loading…</div>`;
  if(!INDEX) INDEX = await getJSON("data/players/index.json") || [];
  const [ra, rb] = await Promise.all([loadRec(idA), loadRec(idB)]);
  const A = ra ? summary(ra) : null, B = rb ? summary(rb) : null;
  const label = r => `${r[1]} (${r[2]} to ${r[3]})`;
  const nameOf = id => { const r = INDEX.find(x => x[0] === id); return r ? label(r) : ""; };
  el.style.setProperty("--tc1", "#1D428A"); el.style.setProperty("--tc2", "#C8102E"); el.style.setProperty("--tcbar", "#1D428A");
  let rows = "";
  if(A && B){
    rows = cmpRows(A, B).map(([lab, get, fmt, better, extra]) => {
      if(!get) return `<tr class="grp"><td colspan="3">${esc(lab)}</td></tr>`;
      const a = get(A), b = get(B);
      const has = v => v != null && isFinite(v);
      let wa = false, wb = false;
      if(has(a) && has(b) && fmt(a) !== fmt(b)){ if((a > b) === (better > 0)) wa = true; else wb = true; }
      return `<tr><td class="a ${wa?"win":""}">${has(a) ? fmt(a) : "—"}${extra ? extra(A) : ""}</td><td class="lab">${esc(lab)}</td><td class="b ${wb?"win":""}">${has(b) ? fmt(b) : "—"}${extra ? extra(B) : ""}</td></tr>`;
    }).join("");
  }
  el.innerHTML = `<div class="pp-hero"><div class="pp-hero-in"><button class="pp-back" id="ppBack">← ${window.PE_BACK === "#/players" ? "Back to players" : "Back to leaderboard"}</button>
      <h1 class="pp-name" style="margin-top:14px">Compare players</h1><div class="pp-teamline">Side by side. Green marks the better number in each row.</div></div></div>
    <div class="pp-body">
      <datalist id="cmpList">${INDEX.map(r => `<option value="${esc(label(r))}">`).join("")}</datalist>
      <div class="cmp-pick">
        <input id="cmpA" list="cmpList" placeholder="Type a player's name…" value="${esc(nameOf(idA))}">
        <input id="cmpB" list="cmpList" placeholder="Type a second player's name…" value="${esc(nameOf(idB))}">
      </div>
      <div class="cmp-head">${cmpHead(A)}${cmpHead(B)}</div>
      ${A && B ? `<div class="pp-card"><div class="tablewrap"><table class="cmp-tbl"><tbody>${rows}</tbody></table></div>
        <div class="pp-note">Career numbers are regular season. "Game by game" rows only cover the seasons the NBA's game feed has for each player.</div></div>`
        : `<div class="final-note">Pick ${A ? "a second" : "two"} player${A ? "" : "s"} to compare.</div>`}
    </div>`;
  document.title = "Compare players";
  el.querySelector("#ppBack").onclick = () => { location.hash = window.PE_BACK || ""; };
  const go = () => {
    const find = v => { const r = INDEX.find(x => label(x) === v) || INDEX.find(x => x[1].toLowerCase() === v.trim().toLowerCase()); return r ? r[0] : null; };
    const a = find(el.querySelector("#cmpA").value) || idA, b = find(el.querySelector("#cmpB").value) || idB;
    const h = "#/compare/" + [a, b].filter(Boolean).map(encodeURIComponent).join("/");
    if(location.hash !== h) location.hash = h;
  };
  el.querySelector("#cmpA").onchange = go;
  el.querySelector("#cmpB").onchange = go;
}

window.PlayerPage = {show, compare, TEAMS};
})();
