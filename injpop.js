/* Injury pop-up: tap an injury anywhere on the site (the home page report, Franchise Files, a player's Storylines,
   his page header, game previews) for the whole picture, the way trade details open from the Transaction tracker.
   What's in it: the injury and its timetable, every update since he went on the report (data/injury_log.json),
   the games he's expected to miss (data/schedule.json), his season so far with the team's record with and without
   him, who has picked up his minutes (box scores in data/games/), and the news links.
   InjuryPop.open(team, name) */
(function(){
"use strict";
const css = `
.ip-modal{position:fixed;inset:0;z-index:100;background:rgba(5,10,25,.6);display:none;align-items:flex-start;justify-content:center;padding:40px 12px;overflow:auto;}
.ip-modal.open{display:flex;}
.ip-card{position:relative;background:var(--panel,#fff);color:var(--ink,#0f172a);border-radius:14px;max-width:760px;width:100%;padding:20px 20px 16px;box-shadow:0 20px 60px rgba(0,0,0,.35);font:14px/1.5 Inter,system-ui,sans-serif;}
.ip-x{position:absolute;top:10px;right:10px;border:0;background:var(--row,#f6f8fb);color:var(--ink,#0f172a);width:32px;height:32px;border-radius:50%;padding:0;font-size:14px;cursor:pointer;}
.ip-head{display:flex;align-items:center;gap:12px;padding-right:36px;}
.ip-head img{width:44px;height:44px;flex:none;}
.ip-head h3{margin:0;font:700 26px/1.05 "Barlow Condensed",sans-serif;text-transform:uppercase;letter-spacing:.4px;}
.ip-head h3 a{color:inherit;text-decoration:none;} .ip-head h3 a:hover{text-decoration:underline;}
.ip-head small{display:block;color:var(--dim,#5b6475);font-size:12.5px;}
.ip-st{display:inline-block;font:700 11.5px Inter,sans-serif;text-transform:uppercase;letter-spacing:.4px;padding:2px 8px;border-radius:999px;vertical-align:2px;}
.ip-st.out{background:rgba(200,16,46,.13);color:#c8102e;} .ip-st.dtd{background:rgba(217,119,6,.15);color:#b45309;} .ip-st.oth{background:var(--row,#f6f8fb);color:var(--dim,#5b6475);} .ip-st.back{background:rgba(22,163,74,.14);color:#15803d;}
.ip-jump{display:flex;gap:6px;flex-wrap:wrap;margin:14px 0 4px;}
.ip-jump a{font:600 12.5px Inter,sans-serif;padding:5px 11px;border-radius:999px;border:1px solid var(--line,#dde2ea);color:var(--ink,#0f172a);text-decoration:none;}
.ip-jump a:hover{border-color:var(--accent,#C8102E);}
.ip-sec{margin-top:18px;scroll-margin-top:10px;}
.ip-sec h4{margin:0 0 8px;font:700 17px "Barlow Condensed",sans-serif;text-transform:uppercase;letter-spacing:.5px;}
.ip-box{background:var(--row,#f6f8fb);border-radius:10px;padding:10px 12px;font-size:13.5px;}
.ip-box p{margin:0 0 6px;} .ip-box p:last-child{margin:0;}
.ip-kv{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin-bottom:10px;}
.ip-kv div{border:1px solid var(--line,#dde2ea);border-radius:10px;padding:8px 10px;}
.ip-kv span{display:block;font-size:11px;color:var(--dim,#5b6475);text-transform:uppercase;letter-spacing:.5px;font-weight:700;}
.ip-kv b{font-size:15px;}
.ip-tl{list-style:none;margin:0;padding:0;border-left:2px solid var(--line,#dde2ea);}
.ip-tl li{position:relative;padding:0 0 10px 14px;font-size:13.5px;}
.ip-tl li::before{content:"";position:absolute;left:-6px;top:6px;width:10px;height:10px;border-radius:50%;background:var(--accent,#C8102E);}
.ip-tl li.done::before{background:#16a34a;}
.ip-tl b{font-size:12.5px;color:var(--dim,#5b6475);margin-right:6px;}
.ip-games{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;}
.ip-g{display:block;border:1px solid var(--line,#dde2ea);border-radius:10px;padding:8px 10px;color:inherit;text-decoration:none;font-size:13px;}
.ip-g:hover{border-color:var(--accent,#C8102E);}
.ip-g .d{color:var(--dim,#5b6475);font-size:12px;} .ip-g .o{display:flex;align-items:center;gap:6px;font-weight:700;margin:2px 0 4px;} .ip-g .o img{width:20px;height:20px;}
.ip-tbl{width:100%;border-collapse:collapse;font-size:13px;}
.ip-tbl th,.ip-tbl td{padding:6px 8px;border-bottom:1px solid var(--line,#dde2ea);text-align:right;white-space:nowrap;}
.ip-tbl th{font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:var(--dim,#5b6475);}
.ip-tbl .l{text-align:left;} .ip-up{color:#15803d;font-weight:700;} .ip-down{color:#c8102e;font-weight:700;}
.ip-wrap{overflow-x:auto;}
.ip-links{display:flex;gap:8px;flex-wrap:wrap;}
.ip-links a{font:600 13px Inter,sans-serif;padding:6px 12px;border-radius:8px;background:var(--row,#f6f8fb);color:var(--ink,#0f172a);text-decoration:none;}
.ip-links a:hover{background:var(--line,#dde2ea);}
.ip-note{color:var(--dim,#5b6475);font-size:12.5px;margin:8px 0 0;}
@media (max-width:560px){.ip-card{padding:16px 14px 14px;} .ip-head h3{font-size:22px;}}`;
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const get = u => fetch(u + (u.includes("?") ? "&" : "?") + "t=" + Math.floor(Date.now() / 6e5)).then(r => r.ok ? r.json() : null).catch(() => null);
const fold = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, "").replace(/[^a-z]/g, "");
const TEAMS = () => (window.PlayerPage && PlayerPage.TEAMS) || {};
const tname = c => (TEAMS()[c] && TEAMS()[c].n) || c;
const logo = c => window.teamBadge ? `<img src="${teamBadge(c)}" alt="">` : "";
const md = iso => { const d = new Date(String(iso).slice(0, 10) + "T12:00:00"); return isNaN(d) ? "" : d.toLocaleDateString("en-US", {month: "short", day: "numeric"}); };
const wd = iso => new Date(iso).toLocaleDateString("en-US", {weekday: "short", month: "short", day: "numeric"});
const tm = iso => new Date(iso).toLocaleTimeString("en-US", {hour: "numeric", minute: "2-digit"});
const localISO = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
const days = (a, b) => Math.round((new Date(b + "T12:00:00") - new Date(a + "T12:00:00")) / 864e5);
const BBR = {BKN: "BRK", CHA: "CHO", PHX: "PHO"};
let styled = false, SCHED = null, STATS = null;
const boxCache = {};

function what(x){ return [x.side, x.type, x.detail].filter(Boolean).join(" ") || "Injury"; }
/* how each upcoming game looks for him, from the timetable */
function outlook(e, gameISO, i){
  const t = e && e.tl, d = gameISO.slice(0, 10), st = String((e && e.status) || "");
  if(!e) return ["Back", "back"];
  if(!t) return i === 0 ? [st || "Out", Injuries.cls(st)] : ["To be decided", "oth"];
  if(t.kind === "season") return ["Out for the season", "out"];
  if(t.kind === "indef") return ["Out", "out"];
  if(t.kind === "wtw") return days(localISO(), d) <= 7 ? ["Out", "out"] : ["Could return", "dtd"];
  if(t.kind === "range") return d < t.from ? ["Out", "out"] : d <= t.to ? ["Could return", "dtd"] : ["Expected back", "back"];
  if(t.kind === "about" || t.kind === "est") return d < t.from ? ["Out", "out"] : ["Could return", "dtd"];
  if(t.kind === "reeval") return d < t.reeval ? ["Out", "out"] : ["After re-evaluation", "dtd"];
  if(t.kind === "game" || t.kind === "dtd") return i === 0 ? [t.kind === "dtd" ? st || "Day-to-day" : t.label.replace(/ for \w+day$/, ""), Injuries.cls(st)] : ["Likely available", "back"];
  return ["To be decided", "oth"];
}
function teamGames(team){ return ((SCHED && SCHED.games) || []).filter(g => g[2] === team || g[3] === team); }
const won = (g, team) => g[2] === team ? g[5] > g[6] : g[6] > g[5];
async function season(team, P){
  const lab = SCHED && SCHED.season, S = P && P.games && P.games[lab];
  const logs = (S && S.logs) || [], played = new Set(logs.map(l => String(l[0])));
  const all = teamGames(team).filter(g => g[4] === 3).sort((a, b) => a[1].localeCompare(b[1]));
  const firstHere = all.findIndex(g => played.has(String(g[0])));
  const traded = S && S.teams && S.teams.length > 1;
  const mine = traded && firstHere > 0 ? all.slice(firstHere) : all;
  const withG = mine.filter(g => played.has(String(g[0]))), without = mine.filter(g => !played.has(String(g[0])));
  const rec = list => [list.filter(g => won(g, team)).length, list.filter(g => !won(g, team)).length];
  const avg = i => logs.length ? logs.reduce((a, l) => a + (+l[i] || 0), 0) / logs.length : 0;
  // stretches of games in a row that he missed
  const runs = []; let cur = null;
  mine.forEach(g => { if(!played.has(String(g[0]))){ if(!cur){ cur = []; runs.push(cur); } cur.push(g); } else cur = null; });
  return {logs, withG, without, rec, runs, mine, avg: {min: avg(4), pts: avg(5), ast: avg(6), reb: avg(7) + avg(8)}};
}
/* minutes and points of each teammate in the games he missed vs the games he played (box scores) */
async function stepIn(team, name, info){
  const ids = info.mine.slice(-30).map(g => String(g[0]));
  const boxes = await Promise.all(ids.map(id => boxCache[id] || (boxCache[id] = get(`data/games/${id}.json`))));
  const me = fold(name), miss = new Set(info.without.map(g => String(g[0]))), agg = {};
  boxes.forEach((b, i) => { const T = b && b.teams && b.teams[team]; if(!T) return; const out = miss.has(ids[i]);
    T.players.forEach(p => { if(fold(p[1]) === me) return; const a = agg[p[1]] || (agg[p[1]] = {name: p[1], w: [0, 0, 0, 0], o: [0, 0, 0, 0]}); const s = out ? a.o : a.w; s[0]++; s[1] += +p[3] || 0; s[2] += +p[4] || 0; s[3] += p[2] ? 1 : 0; }); });
  const nW = info.withG.length, nO = info.without.length;
  return Object.values(agg).filter(a => a.w[0] > 0).map(a => ({name: a.name, minW: nW ? a.w[1] / nW : 0, minO: nO ? a.o[1] / nO : 0, ptsW: nW ? a.w[2] / nW : 0, ptsO: nO ? a.o[2] / nO : 0, stO: a.o[3]}))
    .map(a => Object.assign(a, {d: a.minO - a.minW})).filter(a => a.minO >= 8).sort((a, b) => b.d - a.d).slice(0, 5);
}
function depth(team, name, pos){
  const code = BBR[team] || team, me = fold(name), grp = p => /C/.test(p || "") ? "big" : /G/.test(p || "") ? "guard" : "wing";
  const mate = [...(STATS || new Map()).values()].filter(p => p.team === code && fold(p.name) !== me && p.g);
  const want = pos ? grp(pos) : null;
  return mate.filter(p => !want || grp(p.pos) === want).sort((a, b) => b.mp / b.g - a.mp / a.g).slice(0, 4);
}
function body(team, name, e, stints, P, info, steps){
  const T = team, pid = window.PlayerIndex ? PlayerIndex.id(name, T) : null;
  const st = stints[0], open = st && !st.cleared ? st : null, back = !e && st && st.cleared ? st : null;
  const status = e ? e.status : back ? "Back" : "Not on the report";
  const sCls = e ? Injuries.cls(e.status) : back ? "back" : "oth";
  const plink = pid && window.PlayerIndex ? `<a href="${esc(PlayerIndex.url(pid))}">${esc(name)}</a>` : esc(name);
  const since = open ? open.first : e && e.date;
  const out = since ? days(since, localISO()) : null;
  let h = `<div class="ip-head">${logo(T)}<div><h3>${plink}</h3><small>${esc(tname(T))}${e && e.pos ? " · " + esc(e.pos) : ""} · <span class="ip-st ${sCls}">${esc(status)}</span></small></div></div>`;
  h += `<div class="ip-jump"><a href="#ipNow">The injury</a><a href="#ipUp">Updates</a><a href="#ipNext">Next games</a>${info ? `<a href="#ipSeason">His season</a>` : ""}<a href="#ipSub">Who steps in</a><a href="#ipNews">News</a></div>`;
  // the injury
  const x = e || back || st;
  h += `<div class="ip-sec" id="ipNow"><h4>The injury</h4><div class="ip-kv">
    <div><span>Injury</span><b>${esc(x ? what(x) : "—")}</b></div>
    <div><span>Status</span><b>${esc(status)}</b></div>
    <div><span>Timetable</span><b>${e && e.tl ? esc(Injuries.when(e)) : back ? `Came off ${esc(md(back.cleared))}` : "None given yet"}</b></div>
    <div><span>${back ? "Was out" : "On the report"}</span><b>${since ? `${back ? md(back.first) + "–" + md(back.cleared) : "Since " + md(since)}${out != null && !back ? ` · ${out} day${out === 1 ? "" : "s"}` : ""}` : "—"}</b></div>
    ${e && e.ret ? `<div><span>ESPN return date</span><b>${esc(md(e.ret))}</b></div>` : ""}
    ${info && info.runs.length && open ? `<div><span>Games missed (this stretch)</span><b>${info.runs[info.runs.length - 1].length}</b></div>` : ""}</div>
    ${e && (e.long || e.note) ? `<div class="ip-box">${e.long ? `<p>${esc(e.long)}</p>` : ""}${e.note && e.note !== e.long ? `<p>${esc(e.note)}</p>` : ""}</div>` : ""}
    ${e && e.tl && /range|about|est/.test(e.tl.kind) ? `<p class="ip-note">Timetables come from the latest team and beat-writer news, counted from the day of the report (${esc(md(e.date))}). Setbacks happen; this is the expected window, not a promise.</p>` : ""}</div>`;
  // updates
  const ups = (open || back || st) ? (open || back || st).updates || [] : [];
  h += `<div class="ip-sec" id="ipUp"><h4>Updates</h4>${ups.length ? `<ul class="ip-tl">${ups.slice().reverse().filter(u => u[2]).map(u => `<li><b>${esc(md(u[0]))} · ${esc(u[1] || "")}</b>${esc(u[2])}</li>`).join("")}${back ? `<li class="done"><b>${esc(md(back.cleared))}</b>Off the injury report.</li>` : ""}<li class="${back ? "done" : ""}"><b>${esc(md((open || back || st).first))}</b>Went on the injury report (${esc(what(open || back || st))}).</li></ul>`
    : `<p class="ip-note">No updates logged yet. Each new note on the injury report is added here as it comes in (checked hourly).</p>`}
    ${stints.length > 1 ? `<p class="ip-note"><b>Earlier this season:</b> ${stints.slice(open || back ? 1 : 0).filter(s => s.cleared).map(s => `${esc(what(s))} (${esc(md(s.first))}–${esc(md(s.cleared))})`).join("; ") || "none"}</p>` : ""}</div>`;
  // next games
  const now = new Date().toISOString(), next = teamGames(T).filter(g => g[4] !== 3 && g[1] >= now.slice(0, 13)).sort((a, b) => a[1].localeCompare(b[1])).slice(0, 8);
  h += `<div class="ip-sec" id="ipNext"><h4>Next games</h4>${next.length ? `<div class="ip-games">${next.map((g, i) => { const home = g[2] === T, opp = home ? g[3] : g[2], [lab, c] = outlook(e, g[1], i);
      return `<a class="ip-g" href="matchup.html#${encodeURIComponent(g[0])}"><div class="d">${esc(wd(g[1]))} · ${esc(tm(g[1]))}</div><div class="o">${home ? "vs" : "@"} ${logo(opp)} ${esc(opp)}</div><span class="ip-st ${c}">${esc(lab)}</span></a>`; }).join("")}</div>
      <p class="ip-note">${e && e.tl ? "Read from his timetable: “Out” before the earliest return date, “Could return” inside the window." : "No timetable yet: only the next game is known, from his status."} Tap a game for the full preview.</p>` : `<p class="ip-note">No games on the schedule.</p>`}</div>`;
  // his season
  if(info){
    const [w1, l1] = info.rec(info.withG), [w2, l2] = info.rec(info.without), p = STATS && STATS.get(pid);
    h += `<div class="ip-sec" id="ipSeason"><h4>His season</h4><div class="ip-kv">
      <div><span>Games played</span><b>${info.withG.length} of ${info.mine.length}</b></div>
      <div><span>Per game</span><b>${info.logs.length ? `${info.avg.pts.toFixed(1)} pts · ${info.avg.reb.toFixed(1)} reb · ${info.avg.ast.toFixed(1)} ast` : "—"}</b></div>
      <div><span>Minutes</span><b>${info.logs.length ? info.avg.min.toFixed(1) + " a game" : "—"}</b></div>
      ${p && p.value != null ? `<div><span>Pulse</span><b>${(+p.value).toFixed(2)}</b></div>` : ""}
      <div><span>Team with him</span><b>${w1}–${l1}</b></div>
      <div><span>Team without him</span><b>${info.without.length ? `${w2}–${l2}` : "Hasn't missed a game"}</b></div></div>
      ${info.runs.length ? `<p class="ip-note"><b>Games missed:</b> ${info.runs.map(r => `${esc(md(r[0][1].slice(0, 10)))}${r.length > 1 ? "–" + esc(md(r[r.length - 1][1].slice(0, 10))) : ""} (${r.length})`).join(", ")}. Counts every team game he didn't play, whatever the reason (injury, rest or coach's decision).</p>` : ""}</div>`;
  }
  // who steps in
  if(steps && steps.length) h += `<div class="ip-sec" id="ipSub"><h4>Who steps in</h4><div class="ip-wrap"><table class="ip-tbl"><thead><tr><th class="l">Teammate</th><th>Min with him</th><th>Min without</th><th>Change</th><th>Pts without</th><th>Starts without</th></tr></thead><tbody>
      ${steps.map(s => `<tr><td class="l">${window.playerLink ? playerLink(s.name, T) : esc(s.name)}</td><td>${s.minW.toFixed(1)}</td><td>${s.minO.toFixed(1)}</td><td class="${s.d >= 2 ? "ip-up" : s.d <= -2 ? "ip-down" : ""}">${s.d >= 0 ? "+" : "−"}${Math.abs(s.d).toFixed(1)}</td><td>${s.ptsO.toFixed(1)}</td><td>${s.stO}</td></tr>`).join("")}</tbody></table></div>
      <p class="ip-note">From the box scores: each teammate's minutes in the ${info.without.length} game${info.without.length === 1 ? "" : "s"} he missed vs the ${info.withG.length} he played. Biggest jump first.</p></div>`;
  else { const dp = depth(T, name, e && e.pos);
    h += `<div class="ip-sec" id="ipSub"><h4>Who steps in</h4>${dp.length ? `<div class="ip-wrap"><table class="ip-tbl"><thead><tr><th class="l">${e && e.pos ? "Same position" : "Teammate"}</th><th>Pos</th><th>Min</th><th>Pts</th><th>Pulse</th></tr></thead><tbody>
      ${dp.map(p => `<tr><td class="l">${window.playerLink ? playerLink(p.name, T, null, p.id) : esc(p.name)}</td><td>${esc(p.pos || "")}</td><td>${(p.mp / p.g).toFixed(1)}</td><td>${(p.pts / p.g).toFixed(1)}</td><td>${p.value != null ? (+p.value).toFixed(2) : "—"}</td></tr>`).join("")}</tbody></table></div>
      <p class="ip-note">He hasn't missed a game yet this season, so these are the teammates at his position by minutes a game, the likeliest to pick up his time.</p>` : `<p class="ip-note">No teammates with games this season yet.</p>`}</div>`; }
  // news
  const q = encodeURIComponent(`${name} injury`);
  h += `<div class="ip-sec" id="ipNews"><h4>News</h4><div class="ip-links">
      ${e && e.link ? `<a href="${esc(e.link)}" target="_blank" rel="noopener">${e.story ? "📰 " + esc(e.story) : "ESPN news on him"}</a>` : ""}
      <a href="https://news.google.com/search?q=${q}" target="_blank" rel="noopener">Google News</a>
      <a href="https://www.rotowire.com/basketball/news.php?search=${encodeURIComponent(name)}" target="_blank" rel="noopener">RotoWire</a>
      ${pid && window.PlayerIndex ? `<a href="${esc(PlayerIndex.url(pid))}">${esc(name.split(" ").slice(-1)[0])}'s page →</a>` : ""}
      <a href="team.html#${esc(T)}">${esc(tname(T))} page →</a></div>
      <p class="ip-note">Injury report from ESPN, refreshed hourly.${Injuries.data() && Injuries.data().at ? ` Last check: ${esc(new Date(Injuries.data().at).toLocaleString("en-US", {month: "short", day: "numeric", hour: "numeric", minute: "2-digit"}))}.` : ""}</p></div>`;
  return h;
}
async function open(team, name){
  if(!styled){ const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st); styled = true; }
  let box = document.getElementById("ipModal");
  if(!box){
    box = document.createElement("div");
    box.id = "ipModal"; box.className = "ip-modal"; box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true"); box.setAttribute("aria-label", "Injury details");
    box.innerHTML = `<div class="ip-card"><button class="ip-x" aria-label="Close">✕</button><div id="ipBody"></div></div>`;
    document.body.appendChild(box);
    box.onclick = e => {
      if(e.target === box || e.target.classList.contains("ip-x")) return close();
      const a = e.target.closest(".ip-jump a");
      if(a){ e.preventDefault(); const el = box.querySelector(a.getAttribute("href")); if(el) el.scrollIntoView({behavior: "smooth", block: "start"}); }
    };
    document.addEventListener("keydown", e => { if(e.key === "Escape") close(); });
  }
  box.classList.add("open"); document.body.style.overflow = "hidden";
  const el = document.getElementById("ipBody");
  el.innerHTML = `<p class="ip-note">Loading ${esc(name)}'s injury…</p>`;
  await Promise.all([Injuries.ready, Injuries.logReady(), window.PlayerIndex ? PlayerIndex.ready : null]);
  if(!SCHED || !STATS){ const [s, t] = await Promise.all([get("data/schedule.json"), get("data/stats.json")]); SCHED = s; STATS = new Map(((t && t.players) || []).map(p => [p.id, p])); }
  const e = Injuries.find(team, name), active = e && /^active$/i.test(e.status || "") ? null : e;
  const stints = Injuries.stints(name, e && e.id);
  const pid = window.PlayerIndex ? PlayerIndex.id(name, team) : null;
  const P = pid ? await get(`data/players/${encodeURIComponent(pid)}.json`) : null;
  const info = P ? await season(team, P) : null;
  el.innerHTML = body(team, name, active, stints, P, info, null);
  box.scrollTop = 0;
  if(info && info.without.length){ const steps = await stepIn(team, name, info); if(steps.length && box.classList.contains("open")){ const keep = box.scrollTop; el.innerHTML = body(team, name, active, stints, P, info, steps); box.scrollTop = keep; } }
}
function close(){ const box = document.getElementById("ipModal"); if(box){ box.classList.remove("open"); document.body.style.overflow = ""; } }
/* any element with data-inj="TEAM|Name" opens the pop-up */
document.addEventListener("click", ev => {
  const t = ev.target.closest && ev.target.closest("[data-inj]"); if(!t || ev.target.closest("a.plink, a[target=_blank]")) return;
  ev.preventDefault(); const [team, ...rest] = t.dataset.inj.split("|"); open(team, rest.join("|"));
});
document.addEventListener("keydown", ev => { if(ev.key !== "Enter") return; const t = ev.target.closest && ev.target.closest("[data-inj]"); if(t){ ev.preventDefault(); const [team, ...rest] = t.dataset.inj.split("|"); open(team, rest.join("|")); } });
window.InjuryPop = {open, close};
})();
