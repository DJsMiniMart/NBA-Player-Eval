/* Trade pop-up for The Morning Press: click a trade under Transactions to see the whole deal, the players in it,
   the stories about it and where to go next. Data: data/trades.json (trades.py), data/stats.json, data/contracts.json.
   TradePop.find(row) -> the trade for a transaction row [date, team, description, kind]; TradePop.open(row). */
(function(){
"use strict";
const css = `
.tp-modal{position:fixed;inset:0;z-index:100;background:rgba(5,10,25,.6);display:none;align-items:flex-start;justify-content:center;padding:40px 12px;overflow:auto;}
.tp-modal.open{display:flex;}
.tp-card{position:relative;background:var(--panel,#fff);color:var(--ink,#0f172a);border-radius:14px;max-width:760px;width:100%;padding:20px 20px 16px;box-shadow:0 20px 60px rgba(0,0,0,.35);font:14px/1.5 Inter,system-ui,sans-serif;}
.tp-x{position:absolute;top:10px;right:10px;border:0;background:var(--row,#f6f8fb);color:var(--ink,#0f172a);width:32px;height:32px;border-radius:50%;padding:0;font-size:14px;cursor:pointer;}
.tp-head{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding-right:36px;}
.tp-head .tms{display:flex;align-items:center;gap:6px;}
.tp-head .tms img{width:40px;height:40px;object-fit:contain;}
.tp-head .tms span{font-size:20px;color:var(--dim,#5b6475);}
.tp-head h3{margin:0;font:700 26px/1.05 "Barlow Condensed",sans-serif;text-transform:uppercase;letter-spacing:.4px;}
.tp-head small{display:block;color:var(--dim,#5b6475);font-size:12.5px;}
.tp-jump{display:flex;gap:6px;flex-wrap:wrap;margin:14px 0 4px;}
.tp-jump a{font:600 12.5px Inter,sans-serif;padding:5px 11px;border-radius:999px;border:1px solid var(--line,#dde2ea);color:var(--ink,#0f172a);text-decoration:none;}
.tp-jump a:hover{border-color:var(--accent,#C8102E);}
.tp-sec{margin-top:18px;}
.tp-sec h4{margin:0 0 8px;font:700 17px "Barlow Condensed",sans-serif;text-transform:uppercase;letter-spacing:.5px;}
.tp-deal{background:var(--row,#f6f8fb);border-radius:10px;padding:10px 12px;font-size:13.5px;}
.tp-deal p{margin:0 0 6px;} .tp-deal p:last-child{margin:0;}
.tp-src{font-size:11px;color:var(--dim,#5b6475);text-transform:uppercase;letter-spacing:.5px;font-weight:700;margin:10px 0 4px;}
.tp-side{display:flex;gap:8px;align-items:flex-start;margin:4px 0;}
.tp-side img{width:22px;height:22px;object-fit:contain;flex:none;margin-top:1px;}
.tp-note{color:var(--dim,#5b6475);font-size:12.5px;margin:8px 0 0;}
.tp-pl{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:8px;}
.tp-p{border:1px solid var(--line,#dde2ea);border-radius:10px;padding:10px 12px;}
.tp-p .nm{font-weight:700;} .tp-p .nm a{color:inherit;}
.tp-p .sub{color:var(--dim,#5b6475);font-size:12px;}
.tp-p .ln{display:flex;gap:10px;margin-top:6px;font-variant-numeric:tabular-nums;font-size:12.5px;}
.tp-p .ln b{display:block;font:700 18px/1 "Barlow Condensed",sans-serif;}
.tp-p .ln span{color:var(--dim,#5b6475);font-size:10.5px;text-transform:uppercase;letter-spacing:.4px;}
.tp-news{list-style:none;margin:0;padding:0;}
.tp-news li{display:flex;gap:10px;padding:8px 0;border-bottom:1px solid var(--line,#dde2ea);}
.tp-news li:last-child{border-bottom:0;}
.tp-news img{width:96px;height:54px;object-fit:cover;border-radius:6px;flex:none;background:var(--row,#f6f8fb);}
.tp-news a{font-weight:600;color:var(--ink,#0f172a);}
.tp-news small{display:block;color:var(--dim,#5b6475);font-size:12px;}
.tp-links{display:flex;gap:8px;flex-wrap:wrap;}
.tp-links a{font:600 12.5px Inter,sans-serif;padding:6px 12px;border-radius:8px;background:var(--row,#f6f8fb);color:var(--ink,#0f172a);text-decoration:none;}
.tp-links a:hover{background:var(--accent,#C8102E);color:#fff;}
.tp-cap{border:1px solid var(--line,#dde2ea);border-radius:10px;padding:10px 12px;margin-bottom:8px;}
.tp-cap-h{display:flex;align-items:center;gap:8px;margin-bottom:8px;} .tp-cap-h img{width:24px;height:24px;object-fit:contain;}
.tp-tag{margin-left:auto;font-size:11px;font-weight:700;padding:2px 8px;border-radius:999px;background:var(--row,#f6f8fb);color:var(--dim,#5b6475);}
.tp-tag.good{background:rgba(47,158,68,.14);color:#2b8a3e;} .tp-tag.warn{background:rgba(224,161,0,.16);color:#a87400;} .tp-tag.bad{background:rgba(201,42,42,.13);color:#c92a2a;}
.tp-cap-n{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;}
.tp-cap-n span{display:block;font-size:10.5px;text-transform:uppercase;letter-spacing:.4px;color:var(--dim,#5b6475);font-weight:600;}
.tp-cap-n b{font:700 19px/1.1 "Barlow Condensed",sans-serif;} .tp-cap-n b.up{color:#c92a2a;} .tp-cap-n b.dn{color:#2b8a3e;}
.tp-cap-n small{display:block;color:var(--dim,#5b6475);font-size:11.5px;}
.tp-bar{position:relative;height:10px;border-radius:5px;background:var(--row,#f6f8fb);margin:16px 0 6px;}
.tp-bar i{position:absolute;left:0;top:0;bottom:0;border-radius:5px;background:var(--court,#1D428A);}
.tp-bar b{position:absolute;top:-4px;bottom:-4px;width:2px;background:var(--ink,#0f172a);opacity:.5;}
.tp-bar em{position:absolute;top:-15px;left:-8px;font:600 9.5px Inter,sans-serif;font-style:normal;color:var(--dim,#5b6475);}
.tp-pick{display:flex;gap:8px;align-items:flex-start;padding:6px 0;border-bottom:1px solid var(--line,#dde2ea);} .tp-pick:last-of-type{border-bottom:0;}
.tp-pick small{display:block;color:var(--dim,#5b6475);font-size:12px;} .tp-dim{color:var(--dim,#5b6475);font-weight:400;}
@media (max-width:560px){.tp-cap-n{grid-template-columns:repeat(2,minmax(0,1fr));}}
@media (max-width:560px){.tp-news img{display:none;} .tp-card{padding:16px 14px 14px;}}`;
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const get = u => fetch(u + (u.includes("?") ? "&" : "?") + "t=" + Math.floor(Date.now() / 6e5)).then(r => r.ok ? r.json() : null).catch(() => null);
let DATA = null, STATS = null, CT = null, styled = false;
const ready = get("data/trades.json").then(d => { DATA = d; return d; });
const TEAMS = () => (window.PlayerPage && PlayerPage.TEAMS) || {};
const tname = c => (TEAMS()[c] && TEAMS()[c].n) || c;
const logo = c => { const T = TEAMS()[c]; return T && window.teamBadge ? `<img src="${teamBadge(T.id)}" alt="">` : ""; };
const nice = d => new Date(d + "T12:00:00Z").toLocaleDateString("en-US", {month: "long", day: "numeric", year: "numeric", timeZone: "UTC"});

function find(row){
  if(!DATA || !row || row[3] !== "trade") return null;
  return (DATA.trades || []).find(t => t.rows.some(r => r[0] === row[0] && r[1] === row[1] && r[2] === row[2])) || null;
}
function playerCard(pid, name){
  const p = STATS && STATS.get(pid), c = CT && CT[pid];
  const link = window.playerLink ? playerLink(name, p && p.team, null, pid) : esc(name);
  const g = p && p.g ? p.g : 0;
  const per = k => g ? (p[k] / g).toFixed(1) : "—";
  const yrs = c && c.years ? c.years : [];
  const now = yrs[0], left = yrs.length;
  const opt = yrs.find(y => y[2]);
  return `<div class="tp-p"><div class="nm">${link}${window.HotStart ? HotStart.chip(pid, {small: true}) : ""}</div>
    <div class="sub">${p ? `${esc(p.pos || "")}${p.age ? " · age " + p.age : ""} · last played for ${esc(tname(p.team === "BRK" ? "BKN" : p.team === "CHO" ? "CHA" : p.team === "PHO" ? "PHX" : p.team))}` : "No NBA games this season yet"}</div>
    ${p ? `<div class="ln"><div><span>G</span><b>${g}</b></div><div><span>PTS</span><b>${per("pts")}</b></div><div><span>REB</span><b>${per("trb")}</b></div><div><span>AST</span><b>${per("ast")}</b></div><div><span>Pulse</span><b>${p.value != null ? (+p.value).toFixed(2) : "—"}</b></div></div>` : ""}
    <div class="sub" style="margin-top:6px">${now ? `Salary ${esc(now[0])}: ${esc(now[1])} · ${left} season${left === 1 ? "" : "s"} on the deal${opt ? ` (${esc(opt[0])} ${esc(opt[2])})` : ""}` : "Contract: not listed"}</div></div>`;
}
/* ---------- salary & cap: salary in and out of each team, and where its payroll sits today (cap.js lines) ---------- */
const money = n => (n < 0 ? "−" : "") + "$" + (Math.abs(n) / 1e6).toFixed(Math.abs(n) >= 1e7 ? 1 : 2) + "M";
const sal = pid => { const c = CT && CT[pid]; const y = c && c.years && c.years[0]; return y ? +String(y[1]).replace(/[^\d]/g, "") || 0 : 0; };
const NBA = {BRK: "BKN", CHO: "CHA", PHO: "PHX"};
function capHtml(t){
  const R = window.CAP_RULES;
  if(!R || !CT) return "";
  const moves = t.players.map(([pid, nm]) => { const e = window.Traded && (Traded.player(pid) || []).find(x => x[3] === t.id); return {pid, nm, from: e && e[1], to: e && e[2], s: sal(pid)}; });
  const payroll = c => Object.values(CT).filter(p => (NBA[p.team] || p.team) === c).reduce((a, p) => a + (+String((p.years && p.years[0] && p.years[0][1]) || "").replace(/[^\d]/g, "") || 0), 0);
  const line = v => v >= R.apron2 ? ["Over the 2nd apron", "bad"] : v >= R.apron1 ? ["Over the 1st apron", "bad"] : v >= R.tax ? ["Over the tax", "warn"] : v >= R.cap ? ["Over the cap", ""] : ["Under the cap", "good"];
  const rows = t.teams.map(c => {
    const out = moves.filter(m => m.from === c), inn = moves.filter(m => m.to === c);
    const so = out.reduce((a, m) => a + m.s, 0), si = inn.reduce((a, m) => a + m.s, 0), pay = payroll(c);
    const [lbl, cls] = line(pay);
    const room = pay < R.tax ? `${money(R.tax - pay)} under the tax` : pay < R.apron1 ? `${money(R.apron1 - pay)} under the 1st apron` : pay < R.apron2 ? `${money(R.apron2 - pay)} under the 2nd apron` : `${money(pay - R.apron2)} over the 2nd apron`;
    const pct = v => Math.min(100, v / (R.apron2 * 1.08) * 100).toFixed(1);
    return `<div class="tp-cap"><div class="tp-cap-h">${logo(c)}<b>${esc(tname(c))}</b><span class="tp-tag ${cls}">${lbl}</span></div>
      <div class="tp-cap-n"><div><span>Salary out</span><b>${so ? money(so) : "$0"}</b><small>${out.map(m => esc(m.nm.split(" ").slice(-1)[0]) + " " + money(m.s)).join(", ") || "—"}</small></div>
        <div><span>Salary in</span><b>${si ? money(si) : "$0"}</b><small>${inn.map(m => esc(m.nm.split(" ").slice(-1)[0]) + " " + money(m.s)).join(", ") || "—"}</small></div>
        <div><span>Net</span><b class="${si - so > 0 ? "up" : si - so < 0 ? "dn" : ""}">${si - so > 0 ? "+" : ""}${money(si - so)}</b><small>${si - so > 0 ? "adds payroll" : si - so < 0 ? "saves payroll" : "even"}</small></div>
        <div><span>Payroll today</span><b>${money(pay)}</b><small>${room}</small></div></div>
      <div class="tp-bar"><i style="width:${pct(pay)}%"></i>${[["cap", R.cap], ["tax", R.tax], ["1st", R.apron1], ["2nd", R.apron2]].map(([n, v]) => `<b style="left:${pct(v)}%" title="${n === "cap" ? "Salary cap" : n === "tax" ? "Tax line" : n + " apron"} ${money(v)}"><em>${n}</em></b>`).join("")}</div></div>`;
  }).join("");
  return `<div class="tp-sec" id="tpCap"><h4>Salary &amp; cap impact</h4>${rows}
    <p class="tp-note">${R.season} salaries (Basketball-Reference). "Payroll today" adds up every player on the team's books now, so it includes moves made since the trade; the bar marks the cap, tax line and both aprons. Draft picks and cash don't count against the cap.</p></div>`;
}
/* ---------- picks in the deal, graded 2K-style (picks.js PickGrade) ---------- */
const ROUND = {first: 1, "1st": 1, second: 2, "2nd": 2};
function picksIn(t){
  // the story's background sentences ("The Kings initially acquired him in the 2025 draft...") describe older deals: skip them
  const story = ((t.story && t.story.p) || []).join(" ").split(/(?<=[a-z]{3}[.!?])\s+/).filter(x => !/\b(initially|originally|previously|last (season|year|summer)|in the \d{4} draft|was later|had acquired)\b/i.test(x));
  const text = [...(t.bbr || []), ...story, ...t.rows.map(r => r[2])].join(" ");
  const out = [], seen = new Set();
  const add = (year, orig, round, src) => { const k = `${year}|${orig || "?"}|${round}`; if(seen.has(k)) return; seen.add(k); out.push({year: +year, orig, round, src}); };
  const teamIn = s => { const T = TEAMS(); for(const [c, v] of Object.entries(T)){ const nick = v.n.split(" ").slice(-1)[0], city = v.n.replace(/ [^ ]+$/, ""); if(new RegExp(`\\b(${nick}|${city.replace(/\./g, "\\.")})\\b`).test(s)) return c; } return null; };
  // "2028 Utah Jazz second-rounder", "a 2030 Minnesota Timberwolves second-round pick"
  for(const m of text.matchAll(/\b(20\d\d) ([A-Z][A-Za-z.']+(?: [A-Z][A-Za-z.']+){0,3}) (first|second|1st|2nd)[- ]round(?:er|\s+(?:draft\s+)?pick)?/g)) add(m[1], teamIn(m[2]), ROUND[m[3]], m[0]);
  // "a 2027 2nd round draft pick", "2029 first-round pick" (no team named: the pick is the sending team's own)
  for(const m of text.matchAll(/\b(20\d\d) (first|second|1st|2nd)[- ]round(?:er|\s+(?:draft\s+)?pick)?/g)) if(![...seen].some(k => k.startsWith(m[1] + "|") && k.endsWith("|" + ROUND[m[2]]))) add(m[1], null, ROUND[m[2]], m[0]);
  return out;
}
function picksHtml(t){
  const P = picksIn(t);
  const vague = /\b(two|three|four|five|multiple|future) (?:future )?(first|second)[- ]round/i.test([...((t.story && t.story.p) || []), ...t.rows.map(r => r[2])].join(" "));
  if(!P.length && !vague) return "";
  const rows = P.map(p => {
    const g = window.PickGrade ? PickGrade.grade(p.orig || t.teams[0], p.year, p.round) : null;
    const who = p.orig ? tname(p.orig) : "original team not named";
    return `<div class="tp-pick">${window.PickGrade ? PickGrade.badge(p.orig ? g : null) : ""}<div><b>${p.year} ${p.round === 1 ? "first" : "second"}-round pick</b> <span class="tp-dim">(${esc(who)})</span>
      <small>${p.orig && g ? `${esc(tname(p.orig).split(" ").slice(-1)[0])} projected to pick around No. ${p.round === 2 ? g.slot + 30 : g.slot}${p.year > PickGrade.firstDraft() ? `; ${p.year - PickGrade.firstDraft()} year${p.year - PickGrade.firstDraft() === 1 ? "" : "s"} out, so it's graded closer to an average pick` : ""}` : "Can't grade it without knowing whose pick it is."}</small></div></div>`;
  }).join("");
  return `<div class="tp-sec" id="tpPicks"><h4>Draft picks in the deal</h4>${rows || ""}${vague && !P.length ? `<p class="tp-note" style="margin-top:0">The reports mention picks without saying whose or which year; they're graded here once the details are posted.</p>` : ""}
    <p class="tp-note">Grades work like 2K's prospect grades (A+ to F): where the original team is projected to finish (record so far plus Pulse's odds for the rest of the season) and how far out the pick is. Hover a grade for the details.</p></div>`;
}
function body(t){
  const teams = t.teams;
  const title = teams.length > 2 ? `${teams.length}-team trade` : `${teams.map(c => tname(c).split(" ").slice(-1)[0]).join(" – ")} trade`;
  const names = t.players.map(p => p[1]);
  const q = encodeURIComponent(`${names.slice(0, 2).join(" ")} trade ${teams.slice(0, 2).map(c => tname(c).split(" ").slice(-1)[0]).join(" ")}`);
  const posted = new Set(t.rows.map(r => r[1]));
  const missing = teams.filter(c => !posted.has(c));
  /* the deal */
  let deal = "";
  if(t.bbr && t.bbr.length) deal += `<div class="tp-src" style="margin-top:0">The full trade (Basketball-Reference)</div><div class="tp-deal">${t.bbr.map(x => `<p>${esc(x)}</p>`).join("")}</div>`;
  if(t.story && t.story.p && t.story.p.length) deal += `<div class="tp-src"${deal ? "" : ` style="margin-top:0"`}>How ESPN reported it</div><div class="tp-deal">${t.story.p.map(x => `<p>${esc(x)}</p>`).join("")}<p><a href="${esc(t.story.u)}" target="_blank" rel="noopener">Read the full story on ESPN →</a></p></div>`;
  deal += `<div class="tp-src">Each team's transaction log (ESPN)</div>${t.rows.map(r => `<div class="tp-side">${logo(r[1])}<div><b>${esc(tname(r[1]))}:</b> ${esc(r[2])}</div></div>`).join("")}`;
  if(missing.length && !(t.bbr && t.bbr.length)) deal += `<p class="tp-note">${missing.map(tname).map(esc).join(" and ")} ${missing.length === 1 ? "hasn't" : "haven't"} posted ${missing.length === 1 ? "its" : "their"} side yet, so picks or cash going the other way may not be listed. Basketball-Reference's write-up of the whole deal shows up here once it's posted, usually within a few days.</p>`;
  /* news */
  const news = (t.news || []).map(a => `<li>${a.img ? `<img src="${esc(a.img)}" alt="" loading="lazy" onerror="this.remove()">` : ""}<div><a href="${esc(a.u)}" target="_blank" rel="noopener">${esc(a.h)}</a>
      <small>${a.t ? new Date(a.t).toLocaleDateString("en-US", {month: "short", day: "numeric"}) + " · " : ""}${esc(a.d || "")}</small></div></li>`).join("");
  return `<div class="tp-head"><div class="tms">${teams.map(logo).join(`<span>⇄</span>`)}</div>
      <div><h3>${esc(title)}</h3><small>${nice(t.date)}${names.length ? " · " + names.map(esc).join(", ") : ""}</small></div></div>
    <div class="tp-jump"><a href="#tpDeal">The full trade</a>${t.players.length ? `<a href="#tpPlayers">Players</a>` : ""}${picksIn(t).length ? `<a href="#tpPicks">Picks</a>` : ""}<a href="#tpCap">Salary &amp; cap</a><a href="#tpNews">News</a><a href="#tpMore">More</a></div>
    <div class="tp-sec" id="tpDeal"><h4>The full trade</h4>${deal}</div>
    ${t.players.length ? `<div class="tp-sec" id="tpPlayers"><h4>Players in the deal</h4><div class="tp-pl">${t.players.map(([pid, n]) => playerCard(pid, n)).join("")}</div>
      <p class="tp-note">This season's numbers, all teams combined. Pulse = (PTS + AST×2 + REB×2 + STL×4 + BLK − TOV×4) ÷ MIN.</p></div>` : ""}
    ${picksHtml(t)}${capHtml(t)}
    <div class="tp-sec" id="tpNews"><h4>News about the trade</h4>${news ? `<ul class="tp-news">${news}</ul>` : `<p class="tp-note" style="margin:0 0 8px">No ESPN stories saved for this one${(Date.now() - Date.parse(t.date)) / 864e5 > 45 ? " (it's from before stories were collected)" : " yet"}.</p>`}
      <div class="tp-links" style="margin-top:8px"><a href="https://www.espn.com/search/_/q/${q}" target="_blank" rel="noopener">Search ESPN</a>
        <a href="https://news.google.com/search?q=${q}" target="_blank" rel="noopener">Google News</a>
        <a href="https://www.hoopsrumors.com/?s=${encodeURIComponent(names[0] || tname(teams[0]))}" target="_blank" rel="noopener">Hoops Rumors</a></div></div>
    <div class="tp-sec" id="tpMore"><h4>More</h4><div class="tp-links">
      ${teams.map(c => `<a href="team.html#${esc(c)}">${esc(tname(c))} page →</a>`).join("")}
      <a href="trade.html#${teams.map(esc).join(",")}">Trade Machine with these teams →</a></div></div>`;
}
async function open(row){
  if(!styled){ const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st); styled = true; }
  let box = document.getElementById("tpModal");
  if(!box){
    box = document.createElement("div");
    box.id = "tpModal"; box.className = "tp-modal"; box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true");
    box.innerHTML = `<div class="tp-card"><button class="tp-x" aria-label="Close">✕</button><div id="tpBody"></div></div>`;
    document.body.appendChild(box);
    box.onclick = e => {
      if(e.target === box || e.target.classList.contains("tp-x")) return close();
      const a = e.target.closest(".tp-jump a");
      if(a){ e.preventDefault(); const el = box.querySelector(a.getAttribute("href")); if(el) el.scrollIntoView({behavior: "smooth", block: "start"}); }
    };
    document.addEventListener("keydown", e => { if(e.key === "Escape") close(); });
  }
  box.classList.add("open"); document.body.style.overflow = "hidden";
  const el = document.getElementById("tpBody");
  el.innerHTML = `<p class="tp-note">Loading the trade…</p>`;
  await ready;
  if(!STATS || !CT){
    const [s, c] = await Promise.all([get("data/stats.json"), get("data/contracts.json")]);
    STATS = new Map(((s && s.players) || []).map(p => [p.id, p])); CT = (c && c.players) || {};
  }
  if(window.HotStart) await HotStart.ready;
  await Promise.all([window.PickGrade ? PickGrade.ready : null, window.Traded ? Traded.ready : null]);
  const t = find(row);
  el.innerHTML = t ? body(t) : `<div class="tp-side" style="margin-top:4px">${logo(row[1])}<div><b>${esc(tname(row[1]))}</b> · ${nice(row[0])}<br>${esc(row[2])}</div></div>
    <p class="tp-note">The full trade details are added during the next update (within the hour).</p>`;
  box.scrollTop = 0;
}
function close(){ const box = document.getElementById("tpModal"); if(box){ box.classList.remove("open"); document.body.style.overflow = ""; } }
window.TradePop = {ready, find, open, close, byId: id => DATA && (DATA.trades || []).find(t => t.id === id) || null};
})();
