/* Site search: players (every player page, data/players/index.json), teams and pages, with suggestions as you type.
   Search.mount(container) puts a search box in it. Arrow keys move through the list, Enter opens, Esc closes. */
(function(){
"use strict";
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fold = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
const TEAMS = {ATL:"Atlanta Hawks", BOS:"Boston Celtics", BKN:"Brooklyn Nets", CHA:"Charlotte Hornets", CHI:"Chicago Bulls", CLE:"Cleveland Cavaliers",
  DAL:"Dallas Mavericks", DEN:"Denver Nuggets", DET:"Detroit Pistons", GSW:"Golden State Warriors", HOU:"Houston Rockets", IND:"Indiana Pacers",
  LAC:"LA Clippers", LAL:"Los Angeles Lakers", MEM:"Memphis Grizzlies", MIA:"Miami Heat", MIL:"Milwaukee Bucks", MIN:"Minnesota Timberwolves",
  NOP:"New Orleans Pelicans", NYK:"New York Knicks", OKC:"Oklahoma City Thunder", ORL:"Orlando Magic", PHI:"Philadelphia 76ers", PHX:"Phoenix Suns",
  POR:"Portland Trail Blazers", SAC:"Sacramento Kings", SAS:"San Antonio Spurs", TOR:"Toronto Raptors", UTA:"Utah Jazz", WAS:"Washington Wizards"};
const ALIAS = {sixers:"PHI", blazers:"POR", cavs:"CLE", wolves:"MIN", mavs:"DAL", dubs:"GSW", knickerbockers:"NYK", nola:"NOP", okc:"OKC", la:"LAL", lac:"LAC"};
const PAGES = [["The Morning Press", "index.html", "scores headlines standings home"], ["The Pulse Board", "pe.html#/", "leaderboard pulse rankings award races mvp rookie"],
  ["The Locker Room", "pe.html#/players", "players rosters contracts salaries"], ["The Stat Lab", "stats.html", "team stats league leaders"],
  ["Franchise Files", "team.html", "teams cap sheet draft picks lineups"], ["Trade Machine", "trade.html", "trades cba salary"],
  ["Playoff Picture", "playoffs.html", "bracket play-in lottery standings"], ["NBA History", "history.html", "champions mvp awards all-nba all-star"],
  ["My Picks", "picks.html", "bets record spread moneyline over under"], ["About Pulse", "about.html", "formula how it works"]];
const onPE = /pe\.html$/.test(location.pathname);
let ROWS = null, CUR = null;
const load = () => ROWS || (ROWS = fetch("data/players/index.json?t=" + Math.floor(Date.now() / 36e5)).then(r => r.ok ? r.json() : []).catch(() => []).then(rows => {
  const latest = rows.reduce((m, r) => String(r[3]) > m ? String(r[3]) : m, "");
  CUR = latest;
  return rows.map(r => ({id: r[0], name: r[1], from: r[2], to: r[3], team: r[4], k: fold(r[1]), active: String(r[3]) === latest}));
}));
function score(p, q, words){
  if(p.k === q) return 100;
  let s = 0;
  if(p.k.startsWith(q)) s = 80;
  else if(words.every(w => p.k.split(" ").some(x => x.startsWith(w)))) s = 60;
  else if(p.k.includes(q)) s = 40;
  else return 0;
  return s + (p.active ? 15 : 0) + Math.min(5, (parseInt(p.to) - parseInt(p.from)) / 4);
}
async function find(raw){
  const q = fold(raw); if(!q) return [];
  const words = q.split(" ");
  const out = [];
  Object.entries(TEAMS).forEach(([c, n]) => { const k = fold(n), nick = fold(n.split(" ").slice(-1)[0]);
    if(fold(c) === q || ALIAS[q] === c || k.startsWith(q) || nick.startsWith(q) || words.every(w => k.split(" ").some(x => x.startsWith(w))))
      out.push({kind: "team", s: fold(c) === q || nick === q ? 95 : 70, label: n, sub: "Franchise Files", href: `team.html#${c}`, code: c}); });
  PAGES.forEach(([n, href, kw]) => { const k = fold(n + " " + kw); if(words.every(w => k.split(" ").some(x => x.startsWith(w)))) out.push({kind: "page", s: 50, label: n, sub: "Page", href}); });
  const rows = await load();
  rows.forEach(p => { const s = score(p, q, words); if(s) out.push({kind: "player", s, label: p.name, sub: `${p.active ? `${p.team} · active` : p.team ? "last with " + p.team : "player"} · ${p.from}${p.to !== p.from ? " to " + p.to : ""}`, href: `${onPE ? "" : "pe.html"}#/player/${encodeURIComponent(p.id)}`, code: p.team}); });
  return out.sort((a, b) => b.s - a.s || a.label.localeCompare(b.label)).slice(0, 8);
}
function css(){
  if(document.getElementById("searchCss")) return;
  const s = document.createElement("style"); s.id = "searchCss";
  s.textContent = `
.srch{position:relative;max-width:560px;width:100%;}
.srch input{width:100%;box-sizing:border-box;font:500 15px Inter,system-ui,sans-serif;padding:11px 14px 11px 40px;border-radius:12px;border:1px solid rgba(255,255,255,.35);background:rgba(255,255,255,.14);color:#fff;outline:none;}
.srch input::placeholder{color:rgba(255,255,255,.75);}
.srch input:focus{background:#fff;color:#0f172a;border-color:#fff;box-shadow:0 4px 18px rgba(0,0,0,.25);}
.srch input:focus::placeholder{color:#7a8497;}
.srch .ic{position:absolute;left:13px;top:50%;transform:translateY(-50%);font-size:16px;pointer-events:none;opacity:.9;}
.srch ul{position:absolute;left:0;right:0;top:calc(100% + 6px);z-index:70;list-style:none;margin:0;padding:6px;background:var(--panel,#fff);color:var(--ink,#0f172a);border:1px solid var(--line,#dde2ea);border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.25);max-height:70vh;overflow:auto;}
.srch li a{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:8px;text-decoration:none;color:inherit;}
.srch li a.on,.srch li a:hover{background:var(--row,#f2f4f8);}
.srch li img{width:26px;height:26px;flex:none;}
.srch li .ph{width:26px;height:26px;flex:none;display:grid;place-items:center;font-size:15px;}
.srch li b{font-weight:600;font-size:14px;} .srch li small{display:block;color:var(--dim,#5b6475);font-size:12px;}
.srch li .kind{margin-left:auto;font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--dim,#5b6475);}
.srch .none{padding:10px;color:var(--dim,#5b6475);font-size:13px;}`;
  document.head.appendChild(s);
}
function mount(el, opts){
  css(); opts = opts || {};
  el.innerHTML = `<div class="srch" role="search"><span class="ic">🔍</span><input type="search" id="siteSearch" autocomplete="off" placeholder="${esc(opts.placeholder || "Search players, teams and pages")}" aria-label="Search players, teams and pages" aria-autocomplete="list" aria-controls="siteSearchList"><ul id="siteSearchList" role="listbox" hidden></ul></div>`;
  const input = el.querySelector("input"), list = el.querySelector("ul");
  let items = [], sel = 0, seq = 0;
  const paint = () => {
    if(!input.value.trim()){ list.hidden = true; return; }
    list.hidden = false;
    list.innerHTML = items.length ? items.map((x, i) => `<li role="option"><a href="${esc(x.href)}" class="${i === sel ? "on" : ""}" data-i="${i}">${x.code && window.teamBadge ? `<img src="${teamBadge(x.code)}" alt="">` : `<span class="ph">${x.kind === "page" ? "📄" : "👤"}</span>`}<span><b>${esc(x.label)}</b><small>${esc(x.sub)}</small></span><span class="kind">${x.kind}</span></a></li>`).join("")
      : `<li class="none">No player, team or page matches "${esc(input.value)}".</li>`;
  };
  input.addEventListener("input", async () => { const my = ++seq; const r = await find(input.value); if(my !== seq) return; items = r; sel = 0; paint(); });
  input.addEventListener("focus", () => { load(); if(input.value.trim()) paint(); });
  input.addEventListener("keydown", e => {
    if(e.key === "ArrowDown"){ e.preventDefault(); sel = Math.min(items.length - 1, sel + 1); paint(); }
    else if(e.key === "ArrowUp"){ e.preventDefault(); sel = Math.max(0, sel - 1); paint(); }
    else if(e.key === "Enter"){ e.preventDefault(); if(items[sel]) location.href = items[sel].href; }
    else if(e.key === "Escape"){ list.hidden = true; input.blur(); }
  });
  document.addEventListener("click", e => { if(!el.contains(e.target)) list.hidden = true; });
  document.addEventListener("keydown", e => { if(e.key === "/" && document.activeElement && !/input|textarea|select/i.test(document.activeElement.tagName)){ e.preventDefault(); input.focus(); } });
}
window.Search = {mount, find};
})();
