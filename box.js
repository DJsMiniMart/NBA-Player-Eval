/* Box score pop-up, shared by the home page and the team pages: BoxScore.open(gameId).
   Reads data/games/<id>.json (written every morning by build_teams.py). Needs player.js for team names/logos. */
(function(){
"use strict";
const TEAMS = (window.PlayerPage && PlayerPage.TEAMS) || {};
const COLS = ["pts","fgm","fga","fg3m","fg3a","ftm","fta","oreb","dreb","ast","stl","blk","tov","pf","paint","fast","second","offTov","bench"];
const I = Object.fromEntries(COLS.map((c,i) => [c, i]));
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fold = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, "").replace(/[^a-z]/g, "");
const logo = c => TEAMS[c] ? `${teamBadge(TEAMS[c].id)}` : "";
const $ = id => document.getElementById(id);
async function getJSON(path){ try{ const r = await fetch(path + "?t=" + Date.now()); return r.ok ? await r.json() : null; }catch(_){ return null; } }

const peOf = (pts, ast, reb, stl, blk, tov, min) => min ? (pts + 2*ast + 2*reb + 4*stl + blk - 4*tov) / min : null;
/* Pulse+: Pulse that also charges missed shots (−1 per missed field goal, −0.5 per missed free throw) */
const plusOf = (pts, ast, reb, stl, blk, tov, fgm, fga, ftm, fta, min) => min ? (pts + 2*ast + 2*reb + 4*stl + blk - 4*tov - (fga - fgm) - .5*(fta - ftm)) / min : null;
/* Clutch Pulse: the Pulse formula on crunch-time stats only (last 5 min of the 4th/OT, score within 5), per crunch-time minute.
   0 for a player with no crunch-time minutes. c = [sec, pts, ast, reb, stl, blk, tov, ...] */
const clutchPE = c => c && c[0] ? (c[1] + 2*c[2] + 2*c[3] + 4*c[4] + c[5] - 4*c[6]) / (c[0] / 60) : 0;

const css = `
.bx-modal{position:fixed;inset:0;z-index:100;background:rgba(5,10,25,.6);display:none;align-items:flex-start;justify-content:center;padding:40px 12px;overflow:auto;}
.bx-modal.open{display:flex;}
.bx-card{position:relative;background:var(--panel,#fff);color:var(--ink,#0f172a);border-radius:14px;max-width:1000px;width:100%;padding:18px 18px 16px;box-shadow:0 20px 60px rgba(0,0,0,.35);font:14px/1.45 Inter,system-ui,sans-serif;}
.bx-x{position:absolute;top:10px;right:10px;border:0;background:var(--row,#f6f8fb);color:var(--ink,#0f172a);width:32px;height:32px;border-radius:50%;padding:0;font-size:14px;cursor:pointer;}
.bx-empty{padding:28px 18px;text-align:center;color:var(--dim,#5b6475);}
.bx-head{padding-bottom:12px;border-bottom:1px solid var(--line,#dde2ea);}
.bx-score{display:flex;align-items:center;justify-content:center;gap:22px;}
.bx-score div{display:flex;align-items:center;gap:10px;opacity:.6;}
.bx-score div.win{opacity:1;}
.bx-score img{width:44px;height:44px;object-fit:contain;}
.bx-score b{font:700 40px/1 "Barlow Condensed",sans-serif;}
.bx-score span{font-weight:700;color:var(--dim,#5b6475);}
.bx-score i{font-style:normal;color:var(--dim,#5b6475);}
.bx-note{color:var(--dim,#5b6475);font-size:12.5px;margin:6px 0 0;}
.bx-recap{margin:12px 0 0;padding:10px 12px;border-radius:10px;background:var(--row,#f6f8fb);}
.bx-recap b{display:block;font-size:14.5px;}
.bx-recap p{margin:3px 0 0;color:var(--dim,#5b6475);font-size:13px;}
.bx-team{display:flex;align-items:center;gap:8px;margin:16px 0 6px;font:700 18px "Barlow Condensed",sans-serif;text-transform:uppercase;letter-spacing:.4px;}
.bx-team img{width:26px;height:26px;object-fit:contain;}
.bx-team span{margin-left:auto;font-size:22px;}
.bx-tw{overflow-x:auto;}
table.bx{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums;}
table.bx th{font-size:11px;text-transform:uppercase;letter-spacing:.4px;color:var(--dim,#5b6475);text-align:right;padding:6px 7px;border-bottom:1px solid var(--line,#dde2ea);white-space:nowrap;}
table.bx td{padding:6px 7px;font-size:12.5px;border-bottom:1px solid var(--line,#dde2ea);text-align:right;white-space:nowrap;}
table.bx .l{text-align:left;}
table.bx td.nm a{color:inherit;text-decoration:none;} table.bx td.nm a:hover{color:var(--court,#1D428A);text-decoration:underline;}
table.bx tr.bench td{border-top:2px solid var(--line,#dde2ea);}
table.bx td.pe{font-weight:700;color:var(--accent,#C8102E);}
table.bx td.plus{color:var(--court,#1D428A);}
table.bx td.cpe{color:var(--warn,#b7791f);}
table.bx td.cpe.hot::before{content:"🔥";font-size:10px;margin-right:3px;}
table.bx tr.tot td{background:var(--row,#f6f8fb);font-weight:700;border-top:2px solid var(--line,#dde2ea);}
table.bx .pos{color:var(--good,#2f9e44);} table.bx .neg{color:var(--bad,#d6336c);}
table.bx .tag{font-size:10px;font-weight:700;color:var(--dim,#5b6475);border:1px solid var(--line,#dde2ea);border-radius:4px;padding:0 3px;margin-left:4px;}
`;

let IDS = null, RECAPS = null, styled = false;
async function playerIds(){
  if(IDS) return IDS;
  const s = await getJSON("data/stats.json");
  IDS = new Map(((s && s.players) || []).map(p => Array.isArray(p) ? [fold(p[1]), p[0]] : [fold(p.name), p.id]));
  return IDS;
}
async function recaps(){
  if(RECAPS) return RECAPS;
  const m = await getJSON("data/morning.json");
  return RECAPS = (m && m.recaps) || {};
}

function close(){ const b = $("bxModal"); if(b){ b.classList.remove("open"); document.body.style.overflow = ""; } }

async function open(gid){
  if(!styled){ const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st); styled = true; }
  let box = $("bxModal");
  if(!box){
    box = document.createElement("div");
    box.id = "bxModal"; box.className = "bx-modal"; box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true");
    box.innerHTML = `<div class="bx-card"><button class="bx-x" aria-label="Close">✕</button><div id="bxBody"></div></div>`;
    document.body.appendChild(box);
    box.onclick = e => { if(e.target === box || e.target.classList.contains("bx-x")) close(); };
    document.addEventListener("keydown", e => { if(e.key === "Escape") close(); });
  }
  box.classList.add("open"); document.body.style.overflow = "hidden";
  $("bxBody").innerHTML = `<div class="bx-empty">Loading box score…</div>`;
  const [g, ids, rc] = await Promise.all([getJSON(`data/games/${encodeURIComponent(gid)}.json`), playerIds(), recaps()]);
  if(!g){ $("bxBody").innerHTML = `<div class="bx-empty">This box score isn't available yet. Box scores are added during the update after each game.</div>`; return; }
  const sides = [g.away, g.home];
  const score = t => g.teams[t].line[0];
  const when = new Date(g.date + "T12:00:00Z").toLocaleDateString("en-US", {weekday:"long", month:"long", day:"numeric", year:"numeric"});
  const ot = g.min > 48 ? ` · ${g.min === 53 ? "OT" : (g.min - 48) / 5 + "OT"}` : "";
  const table = t => {
    const T = TEAMS[t] || {n:t}, L = g.teams[t].line, rows = g.teams[t].players;
    let peSum = 0, cpeSum = 0, plusSum = 0;
    const body = rows.map((r, i) => {
      const [id, name, st, min, pts, ast, dreb, oreb, stl, blk, tov, fgm, fga, tpm, tpa, ftm, fta, pm, cl] = r;
      const pe = peOf(pts, ast, dreb + oreb, stl, blk, tov, min);
      if(pe != null) peSum += pe;
      const plus = plusOf(pts, ast, dreb + oreb, stl, blk, tov, fgm, fga, ftm, fta, min);
      if(plus != null) plusSum += plus;
      const cpe = clutchPE(cl);
      cpeSum += cpe;
      const clTip = cl && cl[0] ? `Crunch time: ${Math.round(cl[0] / 60 * 10) / 10} min, ${cl[1]} pts, ${cl[7]}-${cl[8]} FG, ${cl[2]} ast, ${cl[3]} reb, ${cl[4]} stl, ${cl[5]} blk, ${cl[6]} tov, ${cl[13] > 0 ? "+" : ""}${cl[13]}` : "No crunch-time minutes";
      const bid = ids.get(fold(name));
      const sep = i > 0 && rows[i-1][2] && !st ? ` class="bench"` : "";
      return `<tr${sep}><td class="l nm">${bid ? `<a href="pe.html#/player/${encodeURIComponent(bid)}">${esc(name)}</a>` : esc(name)}${st ? `<span class="tag">S</span>` : ""}</td>
        <td>${min}</td><td><b>${pts}</b></td><td>${dreb + oreb}</td><td>${ast}</td><td>${stl}</td><td>${blk}</td><td>${tov}</td>
        <td>${fgm}-${fga}</td><td>${tpm}-${tpa}</td><td>${ftm}-${fta}</td><td class="${pm >= 0 ? "pos" : "neg"}">${pm > 0 ? "+" : ""}${pm}</td>
        <td class="pe">${pe != null ? pe.toFixed(3) : "—"}</td><td class="pe plus">${plus != null ? plus.toFixed(3) : "—"}</td><td class="pe cpe${cl && cl[0] ? " hot" : ""}" title="${esc(clTip)}">${cpe.toFixed(3)}</td></tr>`;
    }).join("");
    const mins = rows.reduce((a, r) => a + r[3], 0);
    return `<h3 class="bx-team"><img src="${logo(t)}" alt="" onerror="this.remove()">${esc(T.n)} <span>${score(t)}</span></h3>
      <div class="bx-tw"><table class="bx"><thead><tr><th class="l">Player</th><th>MIN</th><th>PTS</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th><th>TOV</th><th>FG</th><th>3P</th><th>FT</th><th>+/-</th><th title="Pulse for this game">Pulse</th><th title="Pulse+: Pulse that also charges missed shots (−1 per missed field goal, −0.5 per missed free throw)">Pulse+</th><th title="Clutch Pulse: the Pulse formula using only stats from crunch time (last 5 minutes of the 4th or OT, score within 5), divided by crunch-time minutes. 0 if he didn't play in crunch time. Hover a number for the player's crunch-time line.">Clutch Pulse</th></tr></thead>
      <tbody>${body}<tr class="tot"><td class="l">Totals</td><td>${mins}</td><td>${L[I.pts]}</td><td>${L[I.oreb] + L[I.dreb]}</td><td>${L[I.ast]}</td><td>${L[I.stl]}</td><td>${L[I.blk]}</td><td>${L[I.tov]}</td>
        <td>${L[I.fgm]}-${L[I.fga]}</td><td>${L[I.fg3m]}-${L[I.fg3a]}</td><td>${L[I.ftm]}-${L[I.fta]}</td><td></td><td class="pe" title="All the players' Pulse added up">${peSum.toFixed(3)}</td><td class="pe plus" title="All the players' Pulse+ added up">${plusSum.toFixed(3)}</td><td class="pe cpe" title="All the players' Clutch Pulse added up">${cpeSum.toFixed(3)}</td></tr></tbody></table></div>`;
  };
  const winner = score(g.home) > score(g.away) ? g.home : g.away;
  const r = rc[gid];
  $("bxBody").innerHTML = `<div class="bx-head"><div class="bx-score">${sides.map(t => `<div class="${t === winner ? "win" : ""}"><img src="${logo(t)}" alt="" onerror="this.remove()"><b>${score(t)}</b><span>${esc(t)}</span></div>`).join(`<i>@</i>`)}</div>
    <div class="bx-note" style="text-align:center">Final${ot} · ${when}</div>
    ${r ? `<div class="bx-recap"><b>${r.u ? `<a href="${esc(r.u)}" target="_blank" rel="noopener">${esc(r.h)}</a>` : esc(r.h)}</b>${r.d && r.d !== r.h ? `<p>${esc(r.d)}</p>` : ""}</div>` : ""}</div>
    ${sides.map(table).join("")}
    <p class="bx-note" style="margin-top:10px">Pulse = (points + assists×2 + rebounds×2 + steals×4 + blocks − turnovers×4) ÷ minutes. Pulse+ also subtracts 1 per missed field goal and 0.5 per missed free throw. Clutch Pulse is the same formula using only stats from crunch time (last 5 minutes of the 4th or overtime with the score within 5), divided by crunch-time minutes; 0 means no crunch-time minutes, and a 🔥 number had crunch-time minutes (hover it for the line). S = starter.</p>`;
}
window.BoxScore = {open, close, peOf, plusOf, clutchPE};
})();
