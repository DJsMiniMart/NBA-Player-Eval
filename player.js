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
  CHO:{f:"CHA",same:true}, CHA:{f:"CHA",n:"Charlotte Bobcats"}, CHH:{f:"NOP",n:"Charlotte Hornets (1988-2002)"},
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
const evalOf = s => s.mp ? (s.pts + 2*s.ast + s.drb + 2*s.orb + 2*s.stl + s.blk) / s.mp : null;

let REC = null, SEL = null, EL = null, LOGS_ALL = false;

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
  const out = {logs:[], zones:{}, cells:{}, assists:[], steals:{on:0,off:0,oth:0}, blocks:{rim:0,paint:0,mid:0,three:0}};
  const at = new Map();
  for(const s of Object.keys(g).sort()){
    const x = g[s];
    x.logs.forEach(l => out.logs.push(l));
    for(const [z,[a,m]] of Object.entries(x.zones||{})){ const t = out.zones[z] || (out.zones[z] = [0,0]); t[0]+=a; t[1]+=m; }
    for(const [c,[a,m]] of Object.entries(x.cells||{})){ const t = out.cells[c] || (out.cells[c] = [0,0]); t[0]+=a; t[1]+=m; }
    (x.assists||[]).forEach(([id,name,n]) => { const t = at.get(id) || {id,name,n:0}; t.n += n; t.name = name; at.set(id, t); });
    for(const k in out.steals) out.steals[k] += (x.steals||{})[k] || 0;
    for(const k in out.blocks) out.blocks[k] += (x.blocks||{})[k] || 0;
  }
  out.assists = [...at.values()].sort((a,b)=>b.n-a.n).slice(0,8).map(t=>[t.id,t.name,t.n]);
  return out;
}
function leagueFor(sel){
  const L = REC.league || {};
  if(sel !== "career") return L[sel] || {};
  const out = {};
  for(const s of Object.values(L)) for(const [z,[a,m]] of Object.entries(s)){ const t = out[z] || (out[z]=[0,0]); t[0]+=a; t[1]+=m; }
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
  const totals = seasons.reduce((t,s)=>{ ["mp","pts","ast","drb","orb","stl","blk"].forEach(k=>t[k]+=(s[k]||0)); return t; }, {mp:0,pts:0,ast:0,drb:0,orb:0,stl:0,blk:0});
  const career = evalOf(totals);
  const facts = [b.pos || (last && last.pos), b.ht ? height(b.ht) : null, b.wt ? b.wt + " lb" : null, age != null ? `Age ${age}` : null].filter(Boolean).join(" · ");
  return `
  <div class="pp-hero"><div class="pp-hero-in">
    <button class="pp-back" id="ppBack">← Back to leaderboard</button>
    <div class="pp-top">
      <div class="pp-logo">${team.league ? `<img src="${NBA_LOGO}" alt="NBA logo" onerror="this.replaceWith(Object.assign(document.createElement('b'),{textContent:'NBA',style:'color:#1D428A;font-size:26px'}))">`
        : team.id ? `<img src="https://cdn.nba.com/logos/nba/${team.id}/primary/L/logo.svg" alt="${esc(team.n)} logo" onerror="this.style.display='none'">` : ""}</div>
      <div>
        <h1 class="pp-name">${esc(REC.name)}</h1>
        <div class="pp-teamline">${retired ? `Retired · played ${esc(seasons[0].season)} to ${esc(last.season)} · ${careerTeams().length} team${careerTeams().length===1?"":"s"}` : esc(team.n || "")}${facts ? " · " + esc(facts) : ""}</div>
      </div>
      <div class="pp-eval">
        <div class="k">Play Eval · ${esc(last ? last.season : "")}</div>
        <div class="v">${f3(last ? last.value : null)}</div>
        <div class="s">Career ${f3(career)}</div>
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
  return `<div class="pp-card c4"><h3>Player bio</h3><dl class="pp-kv">${rows.map(([k,v])=>`<dt>${k}</dt><dd>${esc(v)}</dd>`).join("")}</dl></div>`;
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

function contractCard(){
  const c = REC.contract;
  let body;
  if(!c || !c.years || !c.years.length){
    body = `<div class="pp-empty">${isRetired() ? `Not on an NBA contract — last played in ${esc(lastSeason().season)}.` : "No contract listed right now (free agent, two-way, or not yet posted)."}</div>`;
  } else {
    body = `<table class="pp-tbl"><thead><tr><th class="l">Season</th><th>Salary</th><th class="l">Note</th></tr></thead><tbody>
      ${c.years.map(([s,amt,opt],i)=>`<tr${i===0?' class="cur"':""}><td class="l">${esc(s)}</td><td>${esc(amt)}</td><td class="l">${esc(opt ? opt[0].toUpperCase()+opt.slice(1) : "")}</td></tr>`).join("")}
      </tbody></table>
      ${c.guaranteed ? `<div class="pp-note">Guaranteed money remaining: <b>${esc(c.guaranteed)}</b>${c.team ? " · " + esc(c.team) : ""}</div>` : ""}`;
  }
  return `<div class="pp-card c4"><h3>Contract <small>from Basketball-Reference</small></h3>${body}</div>`;
}

function statLineCard(){
  const seasons = REC.seasons || [];
  const s = seasons.find(x=>x.current) || seasons[seasons.length-1];
  if(!s) return `<div class="pp-card c4"><h3>Season stat line</h3><div class="pp-empty">No stats yet.</div></div>`;
  const g = s.g || 0, trb = s.trb != null ? s.trb : (s.drb||0)+(s.orb||0);
  const items = [["G", g], ["MIN", f1(per(s.mp,g))], ["PTS", f1(per(s.pts,g))], ["REB", f1(per(trb,g))], ["AST", f1(per(s.ast,g))],
    ["STL", f1(per(s.stl,g))], ["BLK", f1(per(s.blk,g))], ["TOV", f1(per(s.tov,g))], ["FG%", pct(s.fg, s.fga)], ["3P%", pct(s.fg3, s.fg3a)], ["FT%", pct(s.ft, s.fta)]];
  return `<div class="pp-card c4"><h3>${esc(s.season)} stat line <small>${s.current ? "this season, per game" : "per game"}</small></h3>
    <div class="pp-line">${items.map(([k,v])=>`<div class="pp-stat"><div class="k">${k}</div><div class="v">${v}</div></div>`).join("")}
    <div class="pp-stat hl"><div class="k">Play Eval</div><div class="v">${f3(s.value)}</div></div></div></div>`;
}

function careerCard(){
  const seasons = (REC.seasons || []).slice().reverse();
  if(!seasons.length) return "";
  const T = {g:0,mp:0,pts:0,ast:0,drb:0,orb:0,trb:0,stl:0,blk:0,tov:0,fg:0,fga:0,fg3:0,fg3a:0,ft:0,fta:0}, have = {};
  seasons.forEach(s => { for(const k in T){ if(s[k] != null){ T[k] += s[k]; have[k] = (have[k]||0) + 1; } } if(s.trb == null) T.trb += (s.drb||0)+(s.orb||0); });
  const full = k => have[k] === seasons.length;   // only show career % when every season has the numbers
  const row = (s, cls, label) => { const g = s.g || 0, trb = s.trb != null ? s.trb : (s.drb||0)+(s.orb||0); return `<tr class="${cls||""}">
    <td class="l">${esc(label || s.season)}</td><td class="l">${esc(s.team || "")}</td><td>${g}</td><td>${f1(per(s.mp,g))}</td><td>${f1(per(s.pts,g))}</td><td>${f1(per(trb,g))}</td>
    <td>${f1(per(s.ast,g))}</td><td>${f1(per(s.stl,g))}</td><td>${f1(per(s.blk,g))}</td><td>${s.tov!=null?f1(per(s.tov,g)):"—"}</td>
    <td>${s.fga!=null?pct(s.fg,s.fga):"—"}</td><td>${s.fg3a!=null?pct(s.fg3,s.fg3a):"—"}</td><td>${s.fta!=null?pct(s.ft,s.fta):"—"}</td><td class="ev">${f3(s.value)}</td></tr>`; };
  const career = Object.assign({}, T, {team:"", value: evalOf(T)});
  ["tov","fga","fg3a","fta"].forEach(k => { if(!full(k)) career[k] = null; });
  return `<div class="pp-card c12"><h3>Career stat lines <small>per game · regular season</small></h3>
    <div class="tablewrap"><table class="pp-tbl"><thead><tr><th class="l">Season</th><th class="l">Team</th><th>G</th><th>MIN</th><th>PTS</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th><th>TOV</th><th>FG%</th><th>3P%</th><th>FT%</th><th>Play Eval</th></tr></thead>
    <tbody>${seasons.map(s => row(s, s.current ? "cur" : "")).join("")}${row(career, "career", "Career")}</tbody></table></div>
    <div class="pp-note">Play Eval on the career row is worked out from career totals, not an average of seasons.</div></div>`;
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

function shootingCard(G, L){
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
function stealsCard(G, team){
  const s = (G && G.steals) || {on:0,off:0,oth:0};
  const parts = [{label:"On-ball (strips, poke-aways)", n:s.on, c:team.c1}, {label:"Off-ball (passing lanes)", n:s.off, c:team.c2}, {label:"Other / unclear", n:s.oth, c:"#9ca3af"}];
  const total = s.on + s.off + s.oth;
  return `<div class="pp-card c6"><h3>Where the steals come from <small>${total} steals</small></h3>
    ${total ? splitBar(parts) + legendRows(parts) : `<div class="pp-empty">No steals recorded for this selection.</div>`}
    <div class="pp-note">Estimate: the NBA doesn't log on-ball vs. off-ball. A steal off a <i>bad pass</i> is counted off-ball (jumping a lane); off a <i>lost ball</i>, on-ball (taking it from the handler).</div></div>`;
}
function blocksCard(G, team){
  const b = (G && G.blocks) || {rim:0,paint:0,mid:0,three:0};
  const total = b.rim + b.paint + b.mid + b.three;
  const parts = [{label:"At the rim", n:b.rim, c:team.c1}, {label:"Paint floaters & hooks", n:b.paint, c:"#8b5cf6"}, {label:"Mid-range jumpers", n:b.mid, c:team.c2}, {label:"Three-point jumpers", n:b.three, c:"#9ca3af"}];
  return `<div class="pp-card c6"><h3>Where the blocks happen <small>${total} blocks</small></h3>
    ${total ? `<div class="sub" style="margin:0 0 4px"><b>${pct(b.rim + b.paint, total)}</b> at the rim or in the paint · <b>${pct(b.mid + b.three, total)}</b> on jump shots</div>` + splitBar(parts) + legendRows(parts) : `<div class="pp-empty">No blocks recorded for this selection.</div>`}
    <div class="pp-note">Based on where the blocked shot was taken. Whether it was their own man or a help-side rotation isn't in the NBA's public data.</div></div>`;
}

function statText(g){
  return [`${g.pts} PTS`, `${g.drb + g.orb} REB`, `${g.ast} AST`, g.stl ? `${g.stl} STL` : "", g.blk ? `${g.blk} BLK` : "", `${g.fgm}-${g.fga} FG`].filter(Boolean).join(" · ");
}
function top5Card(G){
  const logs = logObjs((G && G.logs) || []).filter(g => g.min >= MIN_TOP_GAME_MINUTES && g.eval != null).sort((a,b)=>b.eval-a.eval).slice(0,5);
  return `<div class="pp-card"><h3>Top 5 Play Eval games <small>${MIN_TOP_GAME_MINUTES}+ minutes</small></h3>
    ${logs.length ? `<div class="pp-top5">${logs.map((g,i)=>`<div class="pp-game"><div class="r">${i+1}</div>
      <div><div class="l">${g.home ? "vs" : "@"} ${esc(g.opp)} · ${esc(g.res)} · ${Math.round(g.min)} min</div><div class="d">${esc(shortDate(g.date))} · ${statText(g)}</div></div>
      <div class="e">${f3(g.eval)}</div></div>`).join("")}</div>` : `<div class="pp-empty">No games with ${MIN_TOP_GAME_MINUTES}+ minutes in this selection.</div>`}</div>`;
}

function gameLogCard(G){
  const logs = logObjs((G && G.logs) || []).sort((a,b)=>String(b.date).localeCompare(String(a.date)) || String(b.gid).localeCompare(String(a.gid)));
  const shown = LOGS_ALL ? logs : logs.slice(0, 20);
  return `<div class="pp-card c12"><h3>Game log <small>${logs.length} games · newest first</small></h3>
    ${logs.length ? `<div class="tablewrap"><table class="pp-tbl"><thead><tr><th class="l">Date</th><th class="l">Opp</th><th class="l">Result</th><th>MIN</th><th>PTS</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th><th>TOV</th><th>FG</th><th>3P</th><th>FT</th><th>+/-</th><th>Play Eval</th></tr></thead><tbody>
      ${shown.map(g => `<tr><td class="l">${esc(shortDate(g.date))}</td><td class="l">${g.home ? "vs" : "@"} ${esc(g.opp)}</td><td class="l ${g.res === "W" ? "w" : "lo"}">${esc(g.res)}</td>
        <td>${Math.round(g.min)}</td><td>${g.pts}</td><td>${g.drb + g.orb}</td><td>${g.ast}</td><td>${g.stl}</td><td>${g.blk}</td><td>${g.tov}</td>
        <td>${g.fgm}-${g.fga}</td><td>${g.f3m}-${g.f3a}</td><td>${g.ftm}-${g.fta}</td><td>${g.pm > 0 ? "+" : ""}${g.pm}</td><td class="ev">${f3(g.eval)}</td></tr>`).join("")}
      </tbody></table></div>${logs.length > 20 ? `<div class="pp-more"><button id="ppLogMore">${LOGS_ALL ? "Show the last 20" : `Show all ${logs.length} games`}</button></div>` : ""}`
      : `<div class="pp-empty">No games for this selection.</div>`}</div>`;
}

/* ---------- page ---------- */
function render(){
  const team = isRetired() ? NBA_SCHEME : teamOf(REC.team);
  const panel = dark() ? "#1a1d23" : "#ffffff";
  EL.style.setProperty("--tc1", team.c1);
  EL.style.setProperty("--tc2", team.c2);
  EL.style.setProperty("--tcbar", contrast(team.c1, panel) >= 1.8 ? team.c1 : team.c2);
  const gs = Object.keys(REC.games || {}).sort().reverse();
  if(SEL == null || (SEL !== "career" && !gs.includes(SEL))) SEL = gs[0] || null;
  const G = SEL ? gamesFor(SEL) : null, L = SEL ? leagueFor(SEL) : {};
  const pick = gs.length ? `<div class="pp-seasonpick"><label class="sub" for="ppSeason" style="font-weight:600">Game-by-game boxes:</label>
      <select id="ppSeason">${gs.map(s=>`<option value="${esc(s)}"${s===SEL?" selected":""}>${esc(s)}</option>`).join("")}${gs.length > 1 ? `<option value="career"${SEL==="career"?" selected":""}>All seasons (${esc(gs[gs.length-1])} on)</option>` : ""}</select>
      <span class="sub">Shooting, assists, steals, blocks, top games and game log</span></div>`
    : `<div class="final-note" style="margin-bottom:14px">Shot-by-shot and game-by-game data isn't available for this player's seasons. The NBA's public game feed only goes back so far.</div>`;
  EL.innerHTML = heroHtml(team) + `<div class="pp-body">
    <div class="pp-grid">${bioCard()}${statLineCard()}${contractCard()}${teamsCard()}</div>
    <div style="height:14px"></div>${pick}
    ${gs.length ? `<div class="pp-grid">${shootingCard(G, L)}<div class="c5 pp-col">${assistsCard(G)}${top5Card(G)}</div>${stealsCard(G, team)}${blocksCard(G, team)}${gameLogCard(G)}</div><div style="height:14px"></div>` : ""}
    <div class="pp-grid">${careerCard()}</div>
  </div>`;
  document.title = `${REC.name} · ${typeof STAT_NAME === "string" ? STAT_NAME : "Play Eval"}`;
  EL.querySelector("#ppBack").onclick = () => { location.hash = ""; };
  const sel = EL.querySelector("#ppSeason"); if(sel) sel.onchange = () => { SEL = sel.value; LOGS_ALL = false; render(); };
  const more = EL.querySelector("#ppLogMore"); if(more) more.onclick = () => { LOGS_ALL = !LOGS_ALL; render(); };
}

async function show(id, el){
  EL = el;
  if(!REC || REC.id !== id){
    el.innerHTML = `<div class="pp-loading">Loading player…</div>`;
    const rec = await getJSON("data/players/" + encodeURIComponent(id) + ".json");
    if(!rec){
      el.innerHTML = `<div class="pp-body"><button id="ppBack2">← Back to leaderboard</button><div class="pp-loading">There's no page for this player yet. Player pages are built during the morning update.</div></div>`;
      el.querySelector("#ppBack2").onclick = () => { location.hash = ""; };
      return;
    }
    REC = rec; SEL = null; LOGS_ALL = false;
  }
  render();
}

window.PlayerPage = {show, TEAMS};
})();
