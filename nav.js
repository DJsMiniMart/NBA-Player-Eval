/* Site menu: a bar across the top of every page with a drop-down to the other pages.
   To add a page, add a line to PAGES. "match" decides which item is highlighted. */
(function(){
"use strict";
const PAGES = [
  {label:"Home",          sub:"Last night in the NBA",          href:"index.html",          match:p => /index\.html$|\/$/.test(p.path)},
  {label:"PE",            sub:"Play Eval leaderboard",          href:"pe.html#/",           match:p => /pe\.html$/.test(p.path) && !/^#\/(players|player|compare)/.test(p.hash)},
  {label:"Players",       sub:"Every player, by team",          href:"pe.html#/players",    match:p => /pe\.html$/.test(p.path) && /^#\/(players|player|compare)/.test(p.hash)},
  {label:"Stats",         sub:"Team stats and league leaders",  href:"stats.html",          match:p => /stats\.html$/.test(p.path)},
  {label:"Teams",         sub:"Stats, lineups, cap, picks",     href:"team.html",           match:p => /team\.html$/.test(p.path)},
  {label:"Trade Machine", sub:"Test a trade against the CBA",   href:"trade.html",          match:p => /trade\.html$/.test(p.path)},
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
.sitenav{position:sticky;top:0;z-index:50;background:#0e2350;color:#fff;border-bottom:1px solid rgba(255,255,255,.12);font:14px/1.4 Inter,system-ui,sans-serif;}
.sitenav-in{max-width:1100px;margin:0 auto;padding:0 16px;height:48px;display:flex;align-items:center;justify-content:space-between;gap:12px;}
.sitenav-brand{font:700 22px/1 "Barlow Condensed",sans-serif;letter-spacing:.5px;text-transform:uppercase;color:#fff;text-decoration:none;white-space:nowrap;}
.sitenav-brand .red{background:#C8102E;padding:0 6px;border-radius:3px;margin-left:3px;}
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
@media (max-width:520px){ .sitenav-cur{display:none;} .sitenav-list{min-width:280px;} }
`;

function where(){ return {path: location.pathname, hash: location.hash || ""}; }

function build(){
  const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
  const nav = document.createElement("nav");
  nav.className = "sitenav"; nav.setAttribute("aria-label", "Site");
  nav.innerHTML = `<div class="sitenav-in">
    <a class="sitenav-brand" href="index.html">Play <span class="red">Eval</span><span class="sitenav-cur" id="sitenavCur"></span></a>
    <div class="sitenav-menu">
      <button class="sitenav-btn" id="sitenavBtn" aria-haspopup="true" aria-expanded="false" aria-controls="sitenavList">
        Team Pages <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6l4 4 4-4"/></svg>
      </button>
      <div class="sitenav-list" id="sitenavList" role="menu">
        ${PAGES.map((p,i) => `<a role="menuitem" href="${p.href}" data-i="${i}"><b>${p.label}</b><small>${p.sub}</small></a>`).join("")}
        <div class="sitenav-teams"><small>Team pages</small><div class="sitenav-grid">
          ${TEAM_LIST.map(([c,id,n]) => `<a role="menuitem" href="team.html#${c}" data-team="${c}" title="${n}" aria-label="${n}"><img src="https://cdn.nba.com/logos/nba/${id}/primary/L/logo.svg" alt="" loading="lazy" onerror="this.replaceWith('${c}')"></a>`).join("")}
        </div></div>
      </div>
    </div></div>`;
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
  mark();
  window.addEventListener("hashchange", mark);
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
  const c = document.getElementById("sitenavCur"); if(c) c.textContent = cur && cur !== "Home" ? "· " + cur : "";
}
if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", build); else build();
})();
