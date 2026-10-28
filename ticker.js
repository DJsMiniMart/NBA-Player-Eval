/* Team news ticker: a bar frozen to the bottom of the screen, like a TV broadcast, that scrolls one team's news.
   Used on Franchise Files (team.html) and player pages. Everything comes from files the site already builds:
   ESPN headlines tagged with the team (data/morning.json), transactions, injuries for the next game, last result,
   next game with the Pulse pick and line (data/schedule.json, data/predictions.json), and hot-start badges.
   Ticker.show(code, {player: "Name"}) puts that player's own items first; Ticker.hide() removes it. */
(function(){
"use strict";
const T = () => (window.PlayerPage && PlayerPage.TEAMS) || {};
let FILES = null, BAR = null, KEY = "";
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const get = p => fetch(p + "?t=" + Math.floor(Date.now() / 3e5)).then(r => r.ok ? r.json() : null).catch(() => null);
function files(){
  if(!FILES) FILES = Promise.all([get("data/morning.json"), get("data/schedule.json"), get("data/predictions.json"), get("data/hotstart.json"), get("data/players/index.json")])
    .then(([m, s, p, h, idx]) => ({m: m || {}, s: s || {}, p: p || {}, h: h || {}, idx: idx || []}));
  return FILES;
}
const fold = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z ]/g, "");
const when = iso => { const d = new Date(iso); return isNaN(d) ? "" : d.toLocaleDateString("en-US", {month:"short", day:"numeric"}); };
const time = iso => new Date(iso).toLocaleString("en-US", {weekday:"short", hour:"numeric", minute:"2-digit"});
const sgn = n => n == null ? "" : (n > 0 ? "+" : "") + n;

function items(code, F, player){
  const team = T()[code] || {}, full = team.n || code, nick = full.split(" ").slice(-1)[0];
  const out = [];   // [kind, html, link, mine (about the player)]
  const pf = player ? fold(player) : null, pLast = player ? fold(player.split(" ").slice(-1)[0]) : null;
  const aboutPlayer = txt => pf && (fold(txt).includes(pf) || (pLast && pLast.length > 3 && fold(txt).split(" ").includes(pLast)));
  const games = (F.s.games || []).slice().sort((a, b) => String(a[1]).localeCompare(String(b[1])));
  const mine = games.filter(g => g[2] === code || g[3] === code);
  const last = mine.filter(g => g[4] === 3).pop();
  const next = mine.find(g => g[4] !== 3);
  // record + last game
  const fin = mine.filter(g => g[4] === 3);
  const w = fin.filter(g => (g[2] === code ? g[5] > g[6] : g[6] > g[5])).length;
  if(fin.length){
    let streak = 0, sw = null;
    for(let i = fin.length - 1; i >= 0; i--){ const g = fin[i], won = g[2] === code ? g[5] > g[6] : g[6] > g[5]; if(sw === null) sw = won; if(won !== sw) break; streak++; }
    out.push(["rec", `<b>${esc(nick)}</b> ${w}-${fin.length - w}${streak >= 2 ? ` · ${streak} straight ${sw ? "wins" : "losses"}` : ""}`]);
  }
  if(last){
    const home = last[2] === code, us = home ? last[5] : last[6], them = home ? last[6] : last[5], opp = home ? last[3] : last[2];
    out.push(["final", `<b>FINAL</b> ${us > them ? "W" : "L"} ${us}-${them} ${home ? "vs" : "@"} ${esc(opp)} · ${when(last[1])}`]);
  }
  if(next){
    const home = next[2] === code, opp = home ? next[3] : next[2];
    const u = (F.p.upcoming || []).find(x => x.id === next[0]);
    const o = F.m.odds && F.m.odds[next[0]];
    const line = o && o.spread != null ? ` · line ${esc(o.spread <= 0 ? next[2] : next[3])} ${o.spread === 0 ? "PK" : sgn(-Math.abs(o.spread))}` : "";
    out.push(["next", `<b>NEXT</b> ${home ? "vs" : "@"} ${esc(opp)} · ${esc(time(next[1]))}${next[8] ? " · " + esc(String(next[8]).split(",")[0]) : ""}${u ? ` · Pulse picks <b>${esc(u.pick)}</b> (${Math.round(u.p * 100)}%)` : ""}${line}`]);
  }
  const feed = window.Injuries && Injuries.data() && Injuries.data().teams && Injuries.data().teams[code];
  const inj = feed ? feed.map(x => [x.name, x.status, [x.side, x.type].filter(Boolean).join(" "), x])
    : ((next && F.m.inj && F.m.inj[next[0]] && F.m.inj[next[0]][code]) || []).map(r => [r[0], r[1], r[2], null]);
  inj.filter(r => r[0] && !/^active$/i.test(r[1])).slice(0, 8).forEach(([name, st, what, x]) => {
    const wh = x && window.Injuries ? Injuries.when(x) : "";
    const nm = window.playerLink ? playerLink(name, code) : esc(name);
    const rest = `${esc(st)}${what ? " (" + esc(what) + ")" : ""}${wh ? " · " + esc(wh) : ""}`;
    out.push(["inj", `<b>INJURY</b> ${nm} · ${x && x.link ? `<a href="${esc(x.link)}" target="_blank" rel="noopener">${rest} 📰</a>` : rest}`, null, aboutPlayer(name)]);
  });
  // headlines tagged with the team
  (F.m.news || []).filter(n => (n.teams || []).includes(full) || fold(n.h).includes(fold(nick)))
    .slice(0, 8).forEach(n => out.push(["news", `<b>${esc(/headline/i.test(n.k || "") ? "NEWS" : String(n.k || "News").toUpperCase())}</b> ${esc(n.h)}`, n.u, aboutPlayer(n.h + " " + (n.d || ""))]));
  // transactions, last 30 days
  const cut = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  (F.m.transactions || []).filter(t => t[1] === code && t[0] >= cut).slice(0, 6)
    .forEach(t => out.push(["tx", `<b>MOVE</b> ${esc(t[2])} · ${when(t[0] + "T12:00:00")}`, null, aboutPlayer(t[2])]));
  // hot-start badges for this team's players
  const HS = window.HotStart, byId = new Map((F.idx || []).map(r => [r[0], r]));
  Object.entries((F.h && F.h.players) || {}).forEach(([id, h]) => {
    const r = byId.get(id); if(!r || r[4] !== code || !HS) return;
    const b = HS.info(id); if(!b) return;
    out.push(["hot", `${b.icon} <b>${window.playerLink ? playerLink(r[1], code, null, id) : esc(r[1])}</b> ${esc(b.label.toLowerCase())}: ${b.raw >= 0 ? "up" : "down"} ${Math.abs(Math.round(b.raw * 100))}% on last season`, null, player && fold(r[1]) === pf]);
  });
  // the player's own items first
  if(player) out.sort((a, b) => (b[3] ? 1 : 0) - (a[3] ? 1 : 0));
  return out;
}

/* the whole league, for The Morning Press */
function leagueItems(F){
  const out = [], now = Date.now();
  const games = (F.s.games || []).slice().sort((a, b) => String(a[1]).localeCompare(String(b[1])));
  const recent = games.filter(g => g[4] === 3 && now - new Date(g[1]) < 36 * 36e5);
  recent.forEach(g => { const hw = g[5] > g[6];
    out.push(["final", `<b>FINAL</b> ${esc(g[3])} ${hw ? g[6] : `<u>${g[6]}</u>`} · ${esc(g[2])} ${hw ? `<u>${g[5]}</u>` : g[5]}`]); });
  games.filter(g => g[4] !== 3 && new Date(g[1]) - now < 30 * 36e5 && new Date(g[1]) - now > -4 * 36e5).forEach(g => {
    const u = (F.p.upcoming || []).find(x => x.id === g[0]), o = F.m.odds && F.m.odds[g[0]];
    const line = o && o.spread != null ? ` · ${esc(o.spread <= 0 ? g[2] : g[3])} ${o.spread === 0 ? "PK" : sgn(-Math.abs(o.spread))}` : "";
    out.push(["next", `<b>${esc(new Date(g[1]).toLocaleTimeString("en-US", {hour:"numeric", minute:"2-digit"}))}</b> ${esc(g[3])} @ ${esc(g[2])}${u ? ` · Pulse: <b>${esc(u.pick)}</b> ${Math.round(u.p * 100)}%` : ""}${line}`, `matchup.html#${encodeURIComponent(g[0])}`]);
  });
  (F.m.news || []).slice(0, 8).forEach(n => out.push(["news", `<b>${esc(/headline/i.test(n.k || "") ? "NEWS" : String(n.k || "News").toUpperCase())}</b> ${esc(n.h)}`, n.u]));
  const cut = new Date(now - 3 * 864e5).toISOString().slice(0, 10);
  (F.m.transactions || []).filter(t => t[0] >= cut).slice(0, 8).forEach(t => out.push(["tx", `<b>MOVE</b> ${esc(t[1])}: ${esc(t[2])}`]));
  const inj = window.Injuries && Injuries.data() && Injuries.data().teams;
  if(inj){
    Object.entries(inj).flatMap(([c, l]) => l.map(x => [c, x])).filter(([c, x]) => x.tl && ["range", "about", "season", "reeval", "indef", "wtw"].includes(x.tl.kind))
      .sort((a, b) => String(b[1].date).localeCompare(String(a[1].date))).slice(0, 8)
      .forEach(([c, x]) => out.push(["inj", `<b>INJURY</b> ${window.playerLink ? playerLink(x.name, c) : esc(x.name)} (${esc(c)}) · ${x.link ? `<a href="${esc(x.link)}" target="_blank" rel="noopener">${esc(Injuries.when(x))} 📰</a>` : esc(Injuries.when(x))}`]));
  }
  const HS = window.HotStart, byId = new Map((F.idx || []).map(r => [r[0], r]));
  Object.entries((F.h && F.h.players) || {}).filter(([, h]) => h[0] === "jump" || h[0] === "drop").sort((a, b) => Math.abs(b[1][2]) - Math.abs(a[1][2])).slice(0, 6)
    .forEach(([id, h]) => { const r = byId.get(id), b = HS && HS.info(id); if(!r || !b) return;
      out.push(["hot", `${b.icon} <b>${window.playerLink ? playerLink(r[1], r[4], null, id) : esc(r[1])}</b> (${esc(r[4])}) ${esc(b.label.toLowerCase())}: ${h[1] >= 0 ? "up" : "down"} ${Math.abs(Math.round(h[1] * 100))}%`]); });
  // mix them so one kind doesn't run on for a minute
  const kinds = ["final", "next", "news", "inj", "hot", "tx"], buckets = kinds.map(k => out.filter(x => x[0] === k)), mixed = [];
  while(buckets.some(b => b.length)) buckets.forEach(b => { if(b.length) mixed.push(b.shift()); });
  return mixed;
}

function css(){
  if(document.getElementById("tickerCss")) return;
  const s = document.createElement("style"); s.id = "tickerCss";
  s.textContent = `
.tk{position:fixed;left:0;right:0;bottom:0;z-index:60;display:flex;align-items:stretch;height:38px;background:#0b0b0d;color:#fff;font:500 13px/38px Inter,system-ui,sans-serif;box-shadow:0 -2px 10px rgba(0,0,0,.25);border-top:3px solid var(--tk1,#C8102E);padding-bottom:env(safe-area-inset-bottom);}
.tk-lab{flex:none;display:flex;align-items:center;gap:7px;padding:0 12px 0 10px;background:var(--tk1,#C8102E);font:700 14px/1 "Barlow Condensed",sans-serif;letter-spacing:.8px;text-transform:uppercase;white-space:nowrap;}
.tk-lab img{width:22px;height:22px;border-radius:50%;background:#fff;}
.tk-view{flex:1;overflow:hidden;position:relative;mask-image:linear-gradient(90deg,transparent,#000 24px,#000 calc(100% - 24px),transparent);}
.tk-run{display:inline-flex;white-space:nowrap;will-change:transform;animation:tkmove var(--tkdur,60s) linear infinite;}
.tk:hover .tk-run,.tk.paused .tk-run{animation-play-state:paused;}
.tk-run span{padding:0 18px;position:relative;}
.tk-run span::after{content:"◆";position:absolute;right:-5px;font-size:8px;color:var(--tk1,#C8102E);}
.tk-run span b{color:#ffd166;font-weight:700;margin-right:3px;}
.tk-run span u{text-decoration:none;font-weight:700;color:#fff;}
.tk-run span.mine b{color:#7ee2a8;}
.tk-run a{color:#fff;text-decoration:none;} .tk-run a:hover{text-decoration:underline;}
.tk-btn{flex:none;width:38px;border:0;background:#1b1b20;color:#fff;font-size:14px;cursor:pointer;}
@keyframes tkmove{from{transform:translateX(0)}to{transform:translateX(-50%)}}
@media (prefers-reduced-motion: reduce){ .tk-run{animation:none;} .tk-view{overflow-x:auto;mask-image:none;} }
body.has-tk{padding-bottom:44px;}
@media (max-width:560px){ .tk{font-size:12.5px;} .tk-lab .tk-word{display:none;} }`;
  document.head.appendChild(s);
}

async function show(code, opts){
  opts = opts || {};
  const key = code + "|" + (opts.player || "");
  if(!code){ hide(); return; }
  if(BAR && KEY === key) return;
  KEY = key;
  const F = await files();
  if(KEY !== key) return;
  if(window.HotStart) await HotStart.ready;
  if(window.Injuries) await Injuries.ready;
  if(window.PlayerIndex) await PlayerIndex.ready;
  const list = code === "NBA" ? leagueItems(F) : items(code, F, opts.player);
  css();
  if(!BAR){
    BAR = document.createElement("div"); BAR.className = "tk"; BAR.setAttribute("role", "region"); BAR.setAttribute("aria-label", "Team news ticker");
    document.body.appendChild(BAR); document.body.classList.add("has-tk");
  }
  const team = T()[code] || {};
  BAR.style.setProperty("--tk1", code === "NBA" ? "#1D428A" : (team.c1 || "#C8102E"));
  if(!list.length){ BAR.innerHTML = `<div class="tk-lab">${esc(code)} news</div><div class="tk-view" style="padding:0 14px;color:#aab">No team news right now.</div>`; return; }
  const one = list.map(([k, h, u, m]) => `<span class="${m ? "mine" : ""}">${u ? `<a href="${esc(u)}" target="_blank" rel="noopener">${h}</a>` : h}</span>`).join("");
  const logo = code === "NBA" ? `<img src="img/emblem-sm.png" alt="" style="border-radius:4px;background:none">` : team.id && window.teamBadge ? `<img src="${teamBadge(code)}" alt="" onerror="this.remove()">` : "";
  BAR.innerHTML = `<div class="tk-lab">${logo}${esc(code)}<span class="tk-word">&nbsp;news</span></div><div class="tk-view"><div class="tk-run">${one}${one}</div></div><button class="tk-btn" title="Pause or play the ticker" aria-label="Pause or play the ticker">❚❚</button>`;
  const run = BAR.querySelector(".tk-run");
  requestAnimationFrame(() => { const w = run.scrollWidth / 2; run.style.setProperty("--tkdur", Math.max(25, w / 70) + "s"); });   // about 70 px a second
  const btn = BAR.querySelector(".tk-btn");
  btn.onclick = () => { BAR.classList.toggle("paused"); btn.textContent = BAR.classList.contains("paused") ? "▶" : "❚❚"; };
}
function hide(){ if(BAR){ BAR.remove(); BAR = null; KEY = ""; document.body.classList.remove("has-tk"); } }
window.Ticker = {show, hide};
})();
