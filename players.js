/* Players page (address: #/players): every player under contract this season, grouped by team,
   plus a search of every player since 1973-74. Each row opens that player's page. */
(function(){
"use strict";
const BBR_TO_NBA = {BRK:"BKN", CHO:"CHA", PHO:"PHX"};
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fold = s => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const money = n => n == null ? "—" : "$" + (n >= 1e6 ? (n/1e6).toFixed(1) + "M" : Math.round(n/1e3) + "K");
const num = s => +String(s || "").replace(/[^\d]/g, "") || 0;

let DB = null, sortBy = "salary", team = "", q = "";

async function getJSON(path){
  try{ const r = await fetch(path + "?t=" + Date.now()); return r.ok ? await r.json() : null; }catch(_){ return null; }
}
function age(born){
  if(!born) return null;
  const b = new Date(born + "T00:00:00"), n = new Date();
  let a = n.getFullYear() - b.getFullYear();
  if(n.getMonth() < b.getMonth() || (n.getMonth() === b.getMonth() && n.getDate() < b.getDate())) a--;
  return a;
}

async function load(){
  if(DB) return DB;
  const [ct, bios, cur, seasons, drafts] = await Promise.all(["contracts","bios","stats","seasons","drafts"].map(f => getJSON(`data/${f}.json`)));
  const D = (drafts && drafts.players) || {};
  const past = (seasons || []).filter(s => !s.current)[0];
  const last = past ? await getJSON("data/" + past.file) : null;
  const B = (bios && bios.players) || {};
  const curMap = new Map(((cur && cur.players) || []).map(p => [p.id, p]));
  const lastMap = new Map(((last && last.players) || []).map(p => [p.id, p]));
  const season = (cur && cur.season) || "";
  const active = new Map();
  Object.entries((ct && ct.players) || {}).forEach(([id, c]) => {
    const yr = (c.years || []).find(y => y[0] === season) || (c.years || [])[0];
    const code = BBR_TO_NBA[c.team] || c.team;
    if(!code) return;
    active.set(id, {id, team: code, salary: yr ? num(yr[1]) : null, opt: yr ? yr[2] : "",
      yearsLeft: (c.years || []).filter(y => y[0] >= season).length, name: c.name});
  });
  curMap.forEach((p, id) => { if(!active.has(id)) active.set(id, {id, team: BBR_TO_NBA[p.team] || p.team, salary:null, name:p.name}); });
  const rows = [...active.values()].map(r => {
    const b = B[r.id] || {}, c = curMap.get(r.id), l = lastMap.get(r.id);
    const useCur = c && c.g >= 5;
    return Object.assign(r, {
      name: r.name || b.name || (c && c.name) || (l && l.name) || (D[r.id] ? `${D[r.id].year} #${D[r.id].pick} pick` : r.id),
      pos: b.pos || (c && c.pos) || (l && l.pos) || "", age: age(b.born),
      eval: useCur ? c.value : (l ? l.value : (c ? c.value : null)),
      evalWhen: useCur ? season : (l ? last.season : (c ? season + " (few games)" : "")),
    });
  });
  const everyone = Object.entries(B).filter(([id]) => !active.has(id)).map(([id, b]) => ({id, name:b.name || id, from:b.from, to:b.to, pos:b.pos}));
  DB = {rows, everyone, season, lastSeason: last && last.season};
  return DB;
}

function render(el){
  const T = (window.PlayerPage && PlayerPage.TEAMS) || {};
  const codes = Object.keys(T).sort((a,b) => T[a].n.localeCompare(T[b].n));
  const fq = fold(q.trim());
  let rows = DB.rows.filter(r => (!team || r.team === team) && (!fq || fold(r.name).includes(fq)));
  const cmp = {salary:(a,b)=>(b.salary||0)-(a.salary||0), eval:(a,b)=>(b.eval??-99)-(a.eval??-99), name:(a,b)=>a.name.localeCompare(b.name), age:(a,b)=>(a.age||99)-(b.age||99)}[sortBy];
  rows.sort(cmp);
  const groups = codes.map(c => ({c, t:T[c], list: rows.filter(r => r.team === c)})).filter(g => g.list.length);
  const others = fq.length >= 2 ? DB.everyone.filter(p => fold(p.name).includes(fq)).sort((a,b)=>(b.to||"").localeCompare(a.to||"")).slice(0, 40) : [];

  el.querySelector("#plBody").innerHTML = (groups.length ? groups.map(g => {
    const pay = g.list.reduce((t,r)=>t+(r.salary||0),0);
    return `<section class="pl-team" style="--c1:${g.t.c1};--c2:${g.t.c2}">
      <header><img src="https://cdn.nba.com/logos/nba/${g.t.id}/primary/L/logo.svg" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
        <div><h3>${esc(g.t.n)}</h3><small>${g.list.length} player${g.list.length===1?"":"s"}${pay ? " · " + money(pay) + " this season" : ""}</small></div>
        <a class="pl-trade" href="team.html#${esc(g.c)}">Team page →</a><a class="pl-trade" style="margin-left:12px" href="trade.html#${esc(g.c)}">Trade machine →</a></header>
      <div class="pl-rows">${g.list.map(row).join("")}</div></section>`;
  }).join("") : `<div class="empty">No current players match.</div>`)
  + (others.length ? `<section class="pl-team pl-past"><header><div><h3>Other players since 1973-74</h3><small>Matching "${esc(q.trim())}"</small></div></header>
      <div class="pl-rows">${others.map(p => `<button class="pl-row" data-open="${esc(p.id)}"><span class="pl-name">${esc(p.name)}</span><span class="pl-meta">${esc(p.pos || "")}</span><span class="pl-meta">${p.from ? esc(p.from) + "–" + esc(p.to) : ""}</span><span class="pl-go">Page →</span></button>`).join("")}</div></section>` : "");
  el.querySelectorAll("[data-open]").forEach(b => b.onclick = () => { location.hash = "#/player/" + encodeURIComponent(b.dataset.open); });
  el.querySelector("#plCount").textContent = `${rows.length} current player${rows.length===1?"":"s"}`;
}
function row(r){
  return `<button class="pl-row" data-open="${esc(r.id)}">
    <span class="pl-name">${esc(r.name)}</span>
    <span class="pl-meta">${esc(r.pos)}${r.age ? " · " + r.age : ""}</span>
    <span class="pl-sal" title="${esc(DB.season)} salary${r.opt ? " (" + esc(r.opt) + ")" : ""}">${money(r.salary)}${r.opt ? `<i>${r.opt === "player option" ? "PO" : r.opt === "team option" ? "TO" : "ET"}</i>` : ""}</span>
    <span class="pl-eval" title="${esc(r.evalWhen)}">${r.eval != null ? r.eval.toFixed(3) : "—"}</span>
    <span class="pl-go">Page →</span></button>`;
}

async function show(el){
  document.title = "The Locker Room · Full Court Geek Press";
  el.innerHTML = `<div class="nba-band"><div class="wrap band-in"><header>
      <div><h1>The Locker <span>Room</span></h1><div class="meta" id="plCount">Loading…</div></div>
      <div class="formula"><b>Every player under contract</b>, grouped by team. Salary is this season's; the number on the right is their latest Pulse. Search also finds past players.</div>
    </header></div></div>
    <div class="wrap" style="padding-top:16px">
      <div class="controls pl-controls">
        <div class="search"><label for="plQ">Search player</label><input id="plQ" type="search" placeholder="e.g. Wembanyama" value="${esc(q)}"></div>
        <div><label for="plTeam">Team</label><select id="plTeam"><option value="">All teams</option></select></div>
        <div><label for="plSort">Sort by</label><select id="plSort">
          <option value="salary">Salary</option><option value="eval">Pulse</option><option value="name">Name</option><option value="age">Age (youngest)</option></select></div>
      </div>
      <div id="plBody"><div class="empty">Loading players…</div></div>
    </div>`;
  await load();
  const T = (window.PlayerPage && PlayerPage.TEAMS) || {};
  const sel = el.querySelector("#plTeam");
  sel.innerHTML += Object.keys(T).sort((a,b)=>T[a].n.localeCompare(T[b].n)).map(c => `<option value="${c}">${esc(T[c].n)}</option>`).join("");
  sel.value = team; el.querySelector("#plSort").value = sortBy;
  el.querySelector("#plQ").oninput = e => { q = e.target.value; render(el); };
  sel.onchange = e => { team = e.target.value; render(el); };
  el.querySelector("#plSort").onchange = e => { sortBy = e.target.value; render(el); };
  render(el);
}

const style = document.createElement("style");
style.textContent = `
.pl-controls{grid-template-columns:2fr 1fr 1fr !important;}
.pl-team{background:var(--panel);border:1px solid var(--line);border-radius:12px;margin-bottom:14px;overflow:hidden;}
.pl-team header{display:flex;align-items:center;gap:12px;padding:12px 14px;border-bottom:3px solid var(--c1,var(--nba-blue));background:linear-gradient(90deg,color-mix(in srgb,var(--c1,#1D428A) 12%,transparent),transparent 60%);}
.pl-team header img{width:38px;height:38px;object-fit:contain;}
.pl-team h3{margin:0;font:700 20px/1.1 "Barlow Condensed",sans-serif;text-transform:uppercase;letter-spacing:.3px;}
.pl-team header small{color:var(--dim);font-size:12px;}
.pl-trade{margin-left:auto;font-size:12px;font-weight:600;color:var(--court);text-decoration:none;white-space:nowrap;}
.pl-trade:hover{text-decoration:underline;}
.pl-rows{display:grid;grid-template-columns:repeat(auto-fill,minmax(440px,1fr));}
.pl-row{display:grid;grid-template-columns:1fr auto auto auto auto;gap:10px;align-items:center;text-align:left;border:0;border-bottom:1px solid var(--line);border-radius:0;background:none;padding:9px 14px;width:100%;}
.pl-row:hover{background:var(--row);}
.pl-name{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.pl-meta{color:var(--dim);font-size:12px;white-space:nowrap;}
.pl-sal{font-variant-numeric:tabular-nums;font-size:13px;white-space:nowrap;}
.pl-sal i{font-style:normal;font-size:10px;font-weight:700;color:var(--dim);border:1px solid var(--line);border-radius:4px;padding:0 3px;margin-left:4px;}
.pl-eval{font-weight:700;color:var(--accent);font-variant-numeric:tabular-nums;min-width:44px;text-align:right;}
.pl-go{color:var(--court);font-size:12px;font-weight:600;}
.pl-past .pl-row{grid-template-columns:1fr auto auto auto;}
@media (max-width:720px){ .pl-controls{grid-template-columns:1fr 1fr !important;} .pl-rows{grid-template-columns:1fr;} .pl-go{display:none;} .pl-row{grid-template-columns:1fr auto auto auto;} .pl-past .pl-row{grid-template-columns:1fr auto auto;} }
`;
document.head.appendChild(style);
window.PlayersPage = {show};
})();
