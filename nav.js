/* Site menu: a bar across the top of every page with a drop-down to the other pages.
   To add a page, add a line to PAGES. "match" decides which item is highlighted. */
(function(){
"use strict";

/* Team badges: an original round badge in each team's colors (no NBA logos). window.teamBadge(code or NBA team id)
   returns an image address, so it drops in anywhere an <img src> is used. */
const BADGE_COLORS = {ATL:["#C8102E","#FDB927",1610612737], BOS:["#007A33","#BA9653",1610612738], BKN:["#000000","#A1A1A4",1610612751], CHA:["#1D1160","#00788C",1610612766], CHI:["#CE1141","#000000",1610612741], CLE:["#860038","#FDBB30",1610612739], DAL:["#00538C","#B8C4CA",1610612742], DEN:["#0E2240","#FEC524",1610612743], DET:["#C8102E","#1D42BA",1610612765], GSW:["#1D428A","#FFC72C",1610612744], HOU:["#CE1141","#C4CED4",1610612745], IND:["#002D62","#FDBB30",1610612754], LAC:["#C8102E","#1D428A",1610612746], LAL:["#552583","#FDB927",1610612747], MEM:["#12173F","#5D76A9",1610612763], MIA:["#98002E","#F9A01B",1610612748], MIL:["#00471B","#EEE1C6",1610612749], MIN:["#0C2340","#78BE20",1610612750], NOP:["#0C2340","#C8102E",1610612740], NYK:["#006BB6","#F58426",1610612752], OKC:["#007AC1","#EF3B24",1610612760], ORL:["#0077C0","#C4CED4",1610612753], PHI:["#006BB6","#ED174C",1610612755], PHX:["#1D1160","#E56020",1610612756], POR:["#E03A3E","#000000",1610612757], SAC:["#5A2D81","#63727A",1610612758], SAS:["#000000","#C4CED4",1610612759], TOR:["#CE1141","#000000",1610612761], UTA:["#3E2680","#000000",1610612762], WAS:["#002B5C","#E31837",1610612764]};
const BADGE_BY_ID = {}; Object.entries(BADGE_COLORS).forEach(([c, v]) => BADGE_BY_ID[v[2]] = c);
const badgeCache = {};
/* Player links: window.PlayerIndex.ready loads data/players/index.json ([id, name, first, last, team]);
   window.playerLink(name, team, label, id) returns a link to his page (or plain text if he has no page). */
(function(){
  const fold = s => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, "").replace(/[^a-z]/g, "");
  const byName = new Map(), byNameTeam = new Map();
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const base = /pe\.html$/.test(location.pathname) ? "" : "pe.html";
  const ready = fetch("data/players/index.json?t=" + Math.floor(Date.now() / 36e5)).then(r => r.ok ? r.json() : []).catch(() => []).then(rows => {
    (rows || []).forEach(r => { const k = fold(r[1]); byNameTeam.set(k + "|" + r[4], r[0]); const cur = byName.get(k); if(!cur || String(r[3]) > String(cur[1])) byName.set(k, [r[0], r[3]]); });
    return true;
  });
  const id = (name, team) => { const k = fold(name); return byNameTeam.get(k + "|" + team) || (byName.get(k) || [])[0] || null; };
  window.PlayerIndex = {ready, id, url: pid => `${base}#/player/${encodeURIComponent(pid)}`};
  /* a player link inside a clickable row, card or button goes to his page instead of opening the row */
  document.addEventListener("click", e => {
    const a = e.target.closest && e.target.closest("a.plink"); if(!a) return;
    e.stopPropagation(); e.preventDefault();
    if(e.metaKey || e.ctrlKey || a.target === "_blank") window.open(a.href, "_blank"); else location.href = a.href;
  }, true);
  window.playerLink = (name, team, label, pid, attrs) => { pid = pid || id(name, team);
    return pid ? `<a class="plink" href="${base}#/player/${encodeURIComponent(pid)}"${attrs || ""}>${esc(label || name)}</a>` : esc(label || name); };
})();
window.teamBadge = function(key){
  const code = BADGE_COLORS[key] ? key : BADGE_BY_ID[key] || ({BRK:"BKN", CHO:"CHA", PHO:"PHX"})[key] || String(key || "");
  if(badgeCache[code]) return badgeCache[code];
  const [c1, c2] = BADGE_COLORS[code] || ["#1D428A", "#C8102E"];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="18.2" fill="${c1}" stroke="${c2}" stroke-width="3.2"/>` +
    `<text x="20" y="24.3" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="800" font-size="11.6" letter-spacing=".2" fill="#fff">${code.slice(0, 3)}</text></svg>`;
  return badgeCache[code] = "data:image/svg+xml," + encodeURIComponent(svg);
};
const PAGES = [
  {label:"The Morning Press", sub:"Last night in the NBA, every morning",          href:"index.html",          match:p => /index\.html$|\/$|matchup\.html$/.test(p.path)},
  {label:"The Pulse Board", sub:"Leaderboard, Pulse$, rookie report",          href:"pe.html#/",           match:p => /pe\.html$/.test(p.path) && !/^#\/(players|player|compare)/.test(p.hash)},
  {label:"The Locker Room", sub:"Every player, by team",          href:"pe.html#/players",    match:p => /pe\.html$/.test(p.path) && /^#\/(players|player|compare)/.test(p.hash)},
  {label:"The Stat Lab", sub:"Team stats and league leaders",  href:"stats.html",          match:p => /stats\.html$/.test(p.path)},
  {label:"Franchise Files", sub:"Every team: stats, lineups, cap, picks, history",     href:"team.html",           match:p => /team\.html$/.test(p.path)},
  {label:"Trade Machine", sub:"Test a trade against the CBA",   href:"trade.html",          match:p => /trade\.html$/.test(p.path)},
  {label:"Draft Board",     sub:"2027 big board, mock drafts, lottery order", href:"draft.html", match:p => /draft\.html$/.test(p.path)},
  {label:"Playoff Picture", sub:"Bracket, play-in and the 2027 lottery", href:"playoffs.html", match:p => /playoffs\.html$/.test(p.path)},
  {label:"NBA History",     sub:"Champions, MVPs, Coach of the Year, All-NBA", href:"history.html", match:p => /history\.html$/.test(p.path)},
  {label:"My Picks",        sub:"Make your own picks, track your record vs Pulse and Vegas", href:"picks.html", match:p => /picks\.html$/.test(p.path)},
  {label:"About Pulse",     sub:"What Pulse measures and how it's tested", href:"about.html",  match:p => /about\.html$/.test(p.path)},
];
/* [code, NBA logo id, name] for the team grid in the menu */
const TEAM_LIST = [["ATL",1610612737,"Hawks"],["BOS",1610612738,"Celtics"],["BKN",1610612751,"Nets"],["CHA",1610612766,"Hornets"],
  ["CHI",1610612741,"Bulls"],["CLE",1610612739,"Cavaliers"],["DAL",1610612742,"Mavericks"],["DEN",1610612743,"Nuggets"],
  ["DET",1610612765,"Pistons"],["GSW",1610612744,"Warriors"],["HOU",1610612745,"Rockets"],["IND",1610612754,"Pacers"],
  ["LAC",1610612746,"Clippers"],["LAL",1610612747,"Lakers"],["MEM",1610612763,"Grizzlies"],["MIA",1610612748,"Heat"],
  ["MIL",1610612749,"Bucks"],["MIN",1610612750,"Timberwolves"],["NOP",1610612740,"Pelicans"],["NYK",1610612752,"Knicks"],
  ["OKC",1610612760,"Thunder"],["ORL",1610612753,"Magic"],["PHI",1610612755,"76ers"],["PHX",1610612756,"Suns"],
  ["POR",1610612757,"Trail Blazers"],["SAC",1610612758,"Kings"],["SAS",1610612759,"Spurs"],["TOR",1610612761,"Raptors"],
  ["UTA",1610612762,"Jazz"],["WAS",1610612764,"Wizards"]];

const css = `
.sitenav{position:sticky;top:0;z-index:50;background:#0b0b0d;color:#fff;font:14px/1.4 Inter,system-ui,sans-serif;box-shadow:0 2px 0 0 transparent;}
.sitenav::after{content:"";position:absolute;left:0;right:0;bottom:-3px;height:3px;background:linear-gradient(90deg,#1D428A 0 50%,#C8102E 50% 100%);}
.sitenav-in{max-width:1100px;margin:0 auto;padding:0 16px;height:54px;display:flex;align-items:center;justify-content:space-between;gap:12px;}
.sitenav-brand{display:flex;align-items:center;gap:10px;color:#fff;text-decoration:none;white-space:nowrap;}
.sitenav-brand img{height:40px;width:auto;display:block;}
.sitenav-word{display:flex;flex-direction:column;line-height:1;text-transform:uppercase;font-family:"Barlow Condensed",sans-serif;}
.sitenav-word b{font-weight:700;font-size:21px;letter-spacing:.6px;}
.sitenav-word i{font-style:normal;font-weight:600;font-size:11.5px;letter-spacing:4.2px;margin-top:2px;opacity:.92;}
/* page banners: black with the logo's blue/red split underneath */
.nba-band,header.hero{background:radial-gradient(120% 140% at 0% 0%,rgba(29,66,138,.55) 0%,rgba(29,66,138,0) 55%),radial-gradient(120% 140% at 100% 0%,rgba(200,16,46,.45) 0%,rgba(200,16,46,0) 55%),#0b0b0d !important;border-bottom:0 !important;position:relative;}
.nba-band::after,header.hero::after{content:"";position:absolute;left:0;right:0;bottom:0;height:5px;background:linear-gradient(90deg,#1D428A 0 50%,#C8102E 50% 100%);}
.nba-band .logo-strip{background:rgba(255,255,255,.04) !important;}
.sitenav-cur{color:rgba(255,255,255,.65);font-size:12.5px;margin-left:10px;font-family:Inter,system-ui,sans-serif;text-transform:none;letter-spacing:0;font-weight:500;}
.sitenav-menu{position:relative;}
.sitenav-btn{display:flex;align-items:center;gap:8px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.25);color:#fff;border-radius:8px;padding:7px 12px;font:600 13px Inter,system-ui,sans-serif;cursor:pointer;}
.sitenav-btn:hover,.sitenav-btn[aria-expanded="true"]{background:rgba(255,255,255,.18);}
.sitenav-btn svg{width:14px;height:14px;transition:transform .15s;}
.sitenav-btn[aria-expanded="true"] svg{transform:rotate(180deg);}
.sitenav-list{position:absolute;right:0;top:calc(100% + 6px);min-width:240px;background:#fff;color:#0f172a;border-radius:10px;box-shadow:0 12px 32px rgba(0,0,0,.25);padding:6px;display:none;}
.sitenav-list.open{display:block;}
.sitenav-list a{display:block;padding:9px 12px;border-radius:7px;text-decoration:none;color:inherit;border-left:3px solid transparent;}
.sitenav-list a:hover,.sitenav-list a:focus{background:#f2f4f8;outline:none;}
.sitenav-list a.on{border-left-color:#C8102E;background:#fbe7ea;}
.sitenav-list b{display:block;font-weight:600;font-size:14px;}
.sitenav-list small{color:#5b6475;font-size:12px;}
@media (prefers-color-scheme: dark){
  .sitenav-list{background:#121b2e;color:#e8edf6;}
  .sitenav-list a:hover,.sitenav-list a:focus{background:#16213a;}
  .sitenav-list a.on{background:#3a1720;}
  .sitenav-list small{color:#93a0b8;}
}
.sitenav-list{max-height:calc(100vh - 70px);overflow:auto;}
.sitenav-teams{border-top:1px solid #dde2ea;margin-top:6px;padding:8px 4px 2px;}
.sitenav-teams > small{display:block;padding:0 8px 6px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;font-size:10.5px;}
.sitenav-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:2px;}
.sitenav-list .sitenav-grid a{border:0;padding:6px;display:flex;align-items:center;justify-content:center;border-radius:8px;}
.sitenav-grid img{width:30px;height:30px;object-fit:contain;}
.sitenav-grid a.on{background:#fbe7ea;box-shadow:inset 0 0 0 2px #C8102E;}
@media (prefers-color-scheme: dark){ .sitenav-teams{border-top-color:#22304a;} .sitenav-grid a{background:rgba(255,255,255,.92);} }
html.nobet .bet{display:none !important;}
.sitenav-tools{display:flex;align-items:center;gap:6px;}
.sitenav-ic{display:grid;place-items:center;width:36px;height:34px;border-radius:8px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.25);color:#fff;cursor:pointer;padding:0;}
.sitenav-ic:hover{background:rgba(255,255,255,.18);} .sitenav-ic svg{width:17px;height:17px;}
.sitenav-set{border-top:1px solid #dde2ea;margin-top:6px;padding:10px 10px 4px;display:grid;gap:8px;font-size:13.5px;}
.sitenav-set > small{font-weight:600;text-transform:uppercase;letter-spacing:.5px;font-size:10.5px;color:#5b6475;}
.sitenav-set label{display:flex;align-items:center;justify-content:space-between;gap:10px;cursor:pointer;}
.sitenav-set select{font:500 13.5px Inter,system-ui,sans-serif;padding:5px 8px;border-radius:8px;border:1px solid #dde2ea;background:#fff;color:#0f172a;max-width:170px;}
.sitenav-set input[type=checkbox]{width:18px;height:18px;accent-color:#C8102E;}
.sitenav-list a.myteam{display:flex;align-items:center;gap:10px;} .sitenav-list a.myteam img{width:28px;height:28px;}
.sitenav-grid a.mine{box-shadow:inset 0 0 0 2px #f5b700;}
.fc-pop{position:fixed;z-index:120;inset:0;background:rgba(5,10,25,.55);display:flex;align-items:flex-start;justify-content:center;padding:70px 12px 12px;}
.fc-pop[hidden]{display:none;}
.fc-pop-in{background:#0b0b0d;border-radius:14px;padding:14px;width:100%;max-width:640px;box-shadow:0 20px 60px rgba(0,0,0,.4);}
.fc-pop-in .x{float:right;margin:-4px -4px 6px 8px;background:none;border:0;color:#fff;font-size:18px;cursor:pointer;}
.fc-pop-in h3{margin:0 0 10px;color:#fff;font:700 18px "Barlow Condensed",sans-serif;text-transform:uppercase;letter-spacing:.5px;}
.fc-share{position:fixed;z-index:120;right:12px;top:62px;background:#fff;color:#0f172a;border-radius:12px;box-shadow:0 12px 32px rgba(0,0,0,.3);padding:8px;min-width:220px;font:14px Inter,system-ui,sans-serif;}
.fc-share a,.fc-share button{display:flex;align-items:center;gap:8px;width:100%;padding:9px 10px;border-radius:8px;border:0;background:none;color:inherit;text-decoration:none;font:inherit;cursor:pointer;text-align:left;}
.fc-share a:hover,.fc-share button:hover{background:#f2f4f8;}
.fc-toast{position:fixed;left:50%;bottom:70px;transform:translateX(-50%);z-index:130;background:#0b0b0d;color:#fff;padding:9px 16px;border-radius:999px;font:600 13.5px Inter,system-ui,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.3);}
@media (prefers-color-scheme: dark){ .sitenav-set{border-top-color:#22304a;} .sitenav-set select{background:#16213a;color:#e8edf6;border-color:#22304a;} .fc-share{background:#121b2e;color:#e8edf6;} .fc-share a:hover,.fc-share button:hover{background:#16213a;} }
@media (max-width:520px){ .sitenav-cur{display:none;} .sitenav-list{min-width:280px;} .sitenav-brand img{height:34px;} .sitenav-word b{font-size:18px;} .sitenav-word i{font-size:10px;letter-spacing:3.4px;} }
`;

function where(){ return {path: location.pathname, hash: location.hash || ""}; }
/* ---------- site settings, kept in this browser: My team and Hide betting ---------- */
const PREF = {get(k){ try{ return localStorage.getItem("fcgp." + k); }catch(_){ return null; } }, set(k, v){ try{ v ? localStorage.setItem("fcgp." + k, v) : localStorage.removeItem("fcgp." + k); }catch(_){} }};
window.Prefs = {
  myTeam: () => PREF.get("myteam") || "",
  setMyTeam(c){ PREF.set("myteam", c || ""); document.dispatchEvent(new CustomEvent("prefs", {detail: {myTeam: c}})); },
  noBet: () => PREF.get("nobet") === "1",
  setNoBet(on){ PREF.set("nobet", on ? "1" : ""); document.documentElement.classList.toggle("nobet", !!on); document.dispatchEvent(new CustomEvent("prefs", {detail: {noBet: on}})); }
};
document.documentElement.classList.toggle("nobet", Prefs.noBet());
/* load a helper script once (search + Ask, glossary) */
const loaded = {};
function need(src){ return loaded[src] || (loaded[src] = new Promise(res => { if(document.querySelector(`script[src="${src}"]`)) return res(); const sc = document.createElement("script"); sc.src = src; sc.onload = res; sc.onerror = res; document.body.appendChild(sc); })); }

function build(){
  const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
  if(!document.querySelector('link[rel="icon"]')){
    [["icon", "img/icon-64.png"], ["apple-touch-icon", "img/apple-touch-icon.png"], ["manifest", "manifest.webmanifest"]].forEach(([rel, href]) => {
      const l = document.createElement("link"); l.rel = rel; l.href = href; document.head.appendChild(l); });
    [["theme-color", "#0b0b0d"], ["apple-mobile-web-app-capable", "yes"], ["mobile-web-app-capable", "yes"],
     ["apple-mobile-web-app-status-bar-style", "black-translucent"], ["apple-mobile-web-app-title", "Geek Press"]].forEach(([name, content]) => {
      const m = document.createElement("meta"); m.name = name; m.content = content; document.head.appendChild(m); });
  }
  if("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
  const nav = document.createElement("nav");
  nav.className = "sitenav"; nav.setAttribute("aria-label", "Site");
  nav.innerHTML = `<div class="sitenav-in">
    <a class="sitenav-brand" href="index.html" aria-label="Full Court Geek Press home"><img src="img/emblem-sm.png" alt=""><span class="sitenav-word"><b>Full Court</b><i>Geek Press</i></span><span class="sitenav-cur" id="sitenavCur"></span></a>
    <div class="sitenav-tools">
      <button class="sitenav-ic" id="sitenavSearch" title="Search or ask a question ( / )" aria-label="Search or ask a question"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/></svg></button>
      <button class="sitenav-ic" id="sitenavShare" title="Share this page" aria-label="Share this page"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7.5 7.5 12 3l4.5 4.5"/><path d="M5 12v8h14v-8"/></svg></button>
    <div class="sitenav-menu">
      <button class="sitenav-btn" id="sitenavBtn" aria-haspopup="true" aria-expanded="false" aria-controls="sitenavList">
        Menu <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6l4 4 4-4"/></svg>
      </button>
      <div class="sitenav-list" id="sitenavList" role="menu">
        <a role="menuitem" href="#" id="sitenavMine" class="myteam" hidden></a>
        ${PAGES.map((p,i) => `<a role="menuitem" href="${p.href}" data-i="${i}"${p.href === "picks.html" ? ' class="bet"' : ""}><b>${p.label}</b><small>${p.sub}</small></a>`).join("")}
        <a role="menuitem" href="#" id="sitenavApp" hidden><b>📲 Get the app</b><small>Add Full Court Geek Press to your home screen</small></a>
        <div class="sitenav-teams"><small>Franchise Files</small><div class="sitenav-grid">
          ${TEAM_LIST.map(([c,id,n]) => `<a role="menuitem" href="team.html#${c}" data-team="${c}" title="${n}" aria-label="${n}"><img src="${teamBadge(c)}" alt="" loading="lazy" onerror="this.replaceWith('${c}')"></a>`).join("")}
        </div></div>
        <div class="sitenav-set"><small>Settings</small>
          <label>My team <select id="sitenavMyTeam" aria-label="My team"><option value="">Pick a team</option>${TEAM_LIST.slice().sort((a, b) => a[2].localeCompare(b[2])).map(([c, , n]) => `<option value="${c}">${n}</option>`).join("")}</select></label>
          <label>Hide betting lines &amp; picks <input type="checkbox" id="sitenavNoBet"></label>
        </div>
      </div>
    </div></div></div>`;
  document.body.insertBefore(nav, document.body.firstChild);
  const btn = nav.querySelector("#sitenavBtn"), list = nav.querySelector("#sitenavList");
  const close = () => { list.classList.remove("open"); btn.setAttribute("aria-expanded", "false"); };
  btn.onclick = e => { e.stopPropagation(); const o = !list.classList.contains("open"); list.classList.toggle("open", o); btn.setAttribute("aria-expanded", String(o)); if(o) (list.querySelector("a.on") || list.querySelector("a")).focus(); };
  document.addEventListener("click", e => { if(!nav.contains(e.target)) close(); });
  document.addEventListener("keydown", e => {
    if(e.key === "Escape"){ close(); btn.focus(); }
    if(list.classList.contains("open") && (e.key === "ArrowDown" || e.key === "ArrowUp")){
      e.preventDefault();
      const items = [...list.querySelectorAll("a")], i = items.indexOf(document.activeElement);
      items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length].focus();
    }
  });
  list.querySelectorAll("a").forEach(a => a.addEventListener("click", close));
  // settings
  const sel = nav.querySelector("#sitenavMyTeam"), nb = nav.querySelector("#sitenavNoBet");
  sel.value = Prefs.myTeam(); nb.checked = Prefs.noBet();
  sel.onchange = () => { Prefs.setMyTeam(sel.value); paintMine(); toast(sel.value ? `My team: ${sel.options[sel.selectedIndex].text}` : "My team cleared"); };
  nb.onchange = () => { Prefs.setNoBet(nb.checked); toast(nb.checked ? "Betting lines and picks hidden" : "Betting lines and picks shown"); };
  paintMine();
  document.addEventListener("prefs", () => { sel.value = Prefs.myTeam(); nb.checked = Prefs.noBet(); paintMine(); });
  // search / ask from any page
  nav.querySelector("#sitenavSearch").onclick = openSearch;
  document.addEventListener("keydown", e => { if(e.key === "/" && !document.getElementById("siteSearch") && document.activeElement && !/input|textarea|select/i.test(document.activeElement.tagName)){ e.preventDefault(); openSearch(); } });
  nav.querySelector("#sitenavShare").onclick = e => { e.stopPropagation(); share(); };
  need("glossary.js");
  setupApp();
  mark();
  window.addEventListener("hashchange", mark);
}
function paintMine(){
  const c = Prefs.myTeam(), a = document.getElementById("sitenavMine"); if(!a) return;
  const t = TEAM_LIST.find(x => x[0] === c);
  a.hidden = !t;
  if(t){ a.href = `team.html#${c}`; a.innerHTML = `<img src="${teamBadge(c)}" alt=""><span><b>My team: ${t[2]}</b><small>Franchise Files for your team</small></span>`; }
  document.querySelectorAll("#sitenavList .sitenav-grid a").forEach(x => x.classList.toggle("mine", x.dataset.team === c));
}
function toast(msg){
  const t = document.createElement("div"); t.className = "fc-toast"; t.setAttribute("role", "status"); t.textContent = msg; document.body.appendChild(t);
  setTimeout(() => t.remove(), 2200);
}
window.fcToast = toast;
async function openSearch(){
  const own = document.getElementById("siteSearch");
  if(own && !own.closest("#fcSearchPop")){ own.scrollIntoView({block: "center"}); own.focus(); return; }   // the home page has its own box
  let d = document.getElementById("fcSearchPop");
  if(!d){
    d = document.createElement("div"); d.id = "fcSearchPop"; d.className = "fc-pop";
    d.innerHTML = `<div class="fc-pop-in" role="dialog" aria-label="Search or ask"><button class="x" aria-label="Close">✕</button><h3>Search or ask</h3><div id="fcSearchBox"></div></div>`;
    d.onclick = e => { if(e.target === d || e.target.classList.contains("x")) d.hidden = true; };
    document.addEventListener("keydown", e => { if(e.key === "Escape") d.hidden = true; });
    document.body.appendChild(d);
    await need("ask.js"); await need("search.js");
    if(window.Search) Search.mount(d.querySelector("#fcSearchBox"), {placeholder: "Search or ask: “who has the most titles?”"});
  }
  d.hidden = false;
  const i = d.querySelector("input"); if(i){ i.focus(); i.select(); }
}
/* share the page you're on: the phone's share sheet when there is one, otherwise copy the link or post it */
async function share(){
  const url = location.href, title = document.title;
  if(navigator.share && matchMedia("(pointer: coarse)").matches){ try{ await navigator.share({title, url}); return; }catch(_){ return; } }
  let m = document.getElementById("fcShare");
  if(m){ m.remove(); return; }
  m = document.createElement("div"); m.id = "fcShare"; m.className = "fc-share"; m.setAttribute("role", "menu");
  const u = encodeURIComponent(url), t = encodeURIComponent(title);
  m.innerHTML = `<button data-copy>🔗 Copy link</button>
    <a href="https://twitter.com/intent/tweet?url=${u}&text=${t}" target="_blank" rel="noopener">𝕏 Post on X</a>
    <a href="https://www.facebook.com/sharer/sharer.php?u=${u}" target="_blank" rel="noopener">📘 Share on Facebook</a>
    <a href="https://www.reddit.com/submit?url=${u}&title=${t}" target="_blank" rel="noopener">👽 Post to Reddit</a>
    <a href="mailto:?subject=${t}&body=${u}">✉️ Email</a>`;
  document.body.appendChild(m);
  m.querySelector("[data-copy]").onclick = async () => { try{ await navigator.clipboard.writeText(url); toast("Link copied"); }catch(_){ prompt("Copy this link:", url); } m.remove(); };
  m.querySelectorAll("a").forEach(a => a.addEventListener("click", () => m.remove()));
  setTimeout(() => document.addEventListener("click", function off(e){ if(!m.contains(e.target)){ m.remove(); document.removeEventListener("click", off); } }), 0);
}
/* ---------- install as an app ---------- */
let installEvt = null;
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); installEvt = e; const a = document.getElementById("sitenavApp"); if(a) a.hidden = false; });
function setupApp(){
  const a = document.getElementById("sitenavApp");
  if(!a) return;
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if(standalone) return;                     // already running as the app
  if(ios || installEvt) a.hidden = false;
  a.onclick = async e => {
    e.preventDefault();
    if(installEvt){ installEvt.prompt(); await installEvt.userChoice.catch(() => {}); installEvt = null; a.hidden = true; return; }
    appHelp(ios);
  };
}
function appHelp(ios){
  let d = document.getElementById("sitenavHelp");
  if(!d){
    d = document.createElement("div"); d.id = "sitenavHelp";
    d.style.cssText = "position:fixed;inset:0;z-index:200;background:rgba(5,10,25,.6);display:flex;align-items:flex-end;justify-content:center;padding:16px;";
    d.onclick = e => { if(e.target === d || e.target.dataset.x) d.remove(); };
    document.body.appendChild(d);
  }
  const steps = ios
    ? `<li>Tap the <b>Share</b> button <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="#1D428A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px"><path d="M12 3v12M8 7l4-4 4 4"/><path d="M6 11v9h12v-9"/></svg> at the bottom of Safari (top right on iPad).</li><li>Scroll down and tap <b>Add to Home Screen</b>.</li><li>Tap <b>Add</b>. The Geek Press icon shows up with your other apps.</li>`
    : `<li>Open the browser menu (<b>⋮</b> in Chrome, <b>…</b> in Edge).</li><li>Tap <b>Install app</b> or <b>Add to Home screen</b>.</li><li>Confirm. The Geek Press icon shows up with your other apps.</li>`;
  d.innerHTML = `<div style="background:#fff;color:#0f172a;border-radius:16px;max-width:420px;width:100%;padding:18px 18px 14px;font:14px/1.45 Inter,system-ui,sans-serif;box-shadow:0 20px 60px rgba(0,0,0,.35)">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px"><img src="img/app-192.png" alt="" style="width:48px;height:48px;border-radius:12px"><div><b style="font-size:16px">Get the Full Court Geek Press app</b><div style="color:#5b6475;font-size:12.5px">Free · no app store needed</div></div></div>
    <ol style="margin:8px 0 12px;padding-left:20px;display:grid;gap:6px">${steps}</ol>
    <button data-x="1" style="width:100%;padding:10px;border-radius:10px;border:0;background:#0b0b0d;color:#fff;font:600 14px Inter,system-ui,sans-serif;cursor:pointer">Got it</button></div>`;
}
function mark(){
  const w = where();
  let cur = null;
  document.querySelectorAll("#sitenavList a[data-team]").forEach(a => a.classList.toggle("on", /team\.html$/.test(w.path) && w.hash.replace("#", "").toUpperCase() === a.dataset.team));
  document.querySelectorAll("#sitenavList a[data-i]").forEach(a => {
    const on = PAGES[+a.dataset.i].match(w);
    a.classList.toggle("on", on);
    if(on && !cur) cur = PAGES[+a.dataset.i].label;
  });
  const c = document.getElementById("sitenavCur"); if(c) c.textContent = cur && cur !== "The Morning Press" ? "· " + cur : "";
}
if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", build); else build();
})();

/* Traded this season: a small ⇄ next to every player who's been traded since the draft, and next to the code or
   name of every team that has made a trade (data/traded.json, built by trades.py). Window.Traded has the lookups. */
(function(){
"use strict";
let T = null;
const ready = fetch("data/traded.json?t=" + Math.floor(Date.now() / 6e5)).then(r => r.ok ? r.json() : null).then(d => { T = d; return d; }).catch(() => null);
const md = d => new Date(d + "T12:00:00Z").toLocaleDateString("en-US", {month: "short", day: "numeric", timeZone: "UTC"});
const NBA = {BRK: "BKN", CHO: "CHA", PHO: "PHX"};
function player(pid){ return T && T.players ? T.players[pid] || null : null; }
function team(code){ code = NBA[code] || code; return T && T.teams ? T.teams[code] || null : null; }
function pTitle(list){ return "Traded this season: " + list.map(e => `${e[1] || "?"} → ${e[2] || "?"} (${md(e[0])})`).join("; "); }
function tTitle(code, list){ return `${code} made ${list.length} trade${list.length === 1 ? "" : "s"} this season: ` + list.map(e => `with ${e[2].join(", ") || "?"} (${md(e[0])})`).join("; "); }
function chip(pid){ const l = player(pid); return l ? `<span class="trd" title="${pTitle(l).replace(/"/g, "&quot;")}">⇄</span>` : ""; }
function teamChip(code){ const l = team(code); return l ? `<span class="trd trd-t" title="${tTitle(NBA[code] || code, l).replace(/"/g, "&quot;")}">⇄</span>` : ""; }
const css = document.createElement("style");
css.textContent = `.trd{display:inline-flex;align-items:center;justify-content:center;width:15px;height:15px;margin-left:4px;border-radius:50%;background:#e7efff;color:#1D428A;font:700 10px/1 Inter,system-ui,sans-serif;vertical-align:1px;cursor:help;flex:none;text-decoration:none;}
.trd-t{width:13px;height:13px;font-size:9px;margin-left:3px;}
.trd-logo{position:relative;top:-7px;margin:0 -2px 0 -11px;width:12px;height:12px;font-size:8.5px;box-shadow:0 0 0 1.5px var(--panel,#fff);vertical-align:top;}
.sitenav .trd-logo{box-shadow:0 0 0 1.5px #0b0b0d;}
@media (prefers-color-scheme: dark){.trd{background:#1d2c4d;color:#9cb8ff;}}`;
document.head.appendChild(css);
const pidOf = el => { const h = el.getAttribute("href") || ""; const m = h.match(/#\/player\/([^/?#]+)/); return m ? decodeURIComponent(m[1]) : el.dataset.id || el.dataset.open || el.dataset.pid || null; };
function paint(){
  if(!T) return;
  document.querySelectorAll('a.plink:not([data-trd]), a[href*="#/player/"]:not([data-trd]), td.nm[data-id]:not([data-trd]), [data-open]:not([data-trd]), [data-pid]:not([data-trd])').forEach(el => {
    el.setAttribute("data-trd", "");
    if(el.closest(".trd, .sitenav, .pp-hero, .jt")) return;
    const pid = pidOf(el), c = pid && chip(pid);
    if(!c) return;
    const spot = el.querySelector(".pl-name") || el;
    if(spot.tagName === "A") spot.insertAdjacentHTML("afterend", c); else spot.insertAdjacentHTML("beforeend", c);
  });
  document.querySelectorAll('a[href*="team.html#"]:not([data-trd]), [data-team]:not([data-trd])').forEach(el => {
    el.setAttribute("data-trd", "");
    if(el.closest(".trd, .jt") || el.querySelector("img.tp-big")) return;
    const m = (el.getAttribute("href") || "").match(/team\.html#([A-Za-z]{3})\b/);
    const code = (m ? m[1] : el.dataset.team || "").toUpperCase();
    const txt = (el.textContent || "").trim();
    if(!code || txt.length > 40 || /→|page|Trade Machine/i.test(txt)) return;   // only team names and codes, not "Team page →" links
    const c = teamChip(code);
    if(!c) return;
    const prev = el.previousElementSibling;
    const logo = el.querySelector("img") || (prev && prev.tagName === "IMG" ? prev : null);
    if(logo){ logo.insertAdjacentHTML("afterend", c.replace('class="trd trd-t"', 'class="trd trd-t trd-logo"')); return; }   // on the logo's corner: takes no room
    if(txt) el.insertAdjacentHTML("beforeend", c);
  });
}
let raf = 0;
const soon = () => { if(!raf) raf = requestAnimationFrame(() => { raf = 0; paint(); }); };
ready.then(() => { paint(); new MutationObserver(soon).observe(document.documentElement, {childList: true, subtree: true}); });
window.Traded = {ready, player, team, chip, teamChip, title: pTitle, _all: () => (T && T.players) || {}};
})();
