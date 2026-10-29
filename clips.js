/* Highlight clips (data/highlights.json, built by highlights.py from ESPN's game data). Clips open on ESPN.
   Clips.ready -> loaded; Clips.forGame(gid) -> [[id, headline, url, thumb, seconds]]; Clips.strip(list, opts) -> HTML. */
(function(){
"use strict";
let DATA = null;
const ready = fetch("data/highlights.json?t=" + Math.floor(Date.now() / 3e5)).then(r => r.ok ? r.json() : null).then(d => { DATA = d; return d; }).catch(() => null);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const dur = s => s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : "";
function forGame(gid){ const g = DATA && DATA.games && DATA.games[gid]; return g ? g.clips : []; }
function game(gid){ return DATA && DATA.games && DATA.games[gid] || null; }
/* list items: [id, headline, url, thumb, seconds] or {h, u, t, s, sub} */
function strip(list, opts){
  opts = opts || {};
  const items = (list || []).map(c => Array.isArray(c) ? {h: c[1], u: c[2], t: c[3], s: c[4], sub: opts.sub || ""} : c).filter(c => c.u);
  if(!items.length) return opts.empty || "";
  return `<div class="clips${opts.cls ? " " + opts.cls : ""}">${items.slice(0, opts.max || 12).map(c => `<a class="clip" href="${esc(c.u)}" target="_blank" rel="noopener" title="${esc(c.h)} (opens on ESPN)">
    <span class="th"${c.t ? ` style="background-image:url('${esc(c.t)}')"` : ""}><i>▶</i>${c.s ? `<em>${dur(c.s)}</em>` : ""}</span>
    <b>${esc(c.h)}</b>${c.sub ? `<small>${esc(c.sub)}</small>` : ""}</a>`).join("")}</div>`;
}
const css = document.createElement("style");
css.textContent = `.clips{display:flex;gap:10px;overflow-x:auto;padding:4px 2px 10px;scroll-snap-type:x proximity;}
.clip{flex:0 0 210px;scroll-snap-align:start;text-decoration:none;color:inherit;display:block;}
.clip .th{display:block;position:relative;aspect-ratio:16/9;border-radius:10px;background:#0b0b0d center/cover no-repeat;overflow:hidden;}
.clip .th i{position:absolute;inset:0;display:grid;place-items:center;font-style:normal;color:#fff;font-size:26px;text-shadow:0 2px 8px rgba(0,0,0,.6);background:linear-gradient(transparent 50%,rgba(0,0,0,.35));}
.clip .th em{position:absolute;right:6px;bottom:6px;font:600 11px Inter,sans-serif;font-style:normal;color:#fff;background:rgba(0,0,0,.7);padding:1px 6px;border-radius:4px;}
.clip b{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-size:13px;line-height:1.3;margin-top:6px;font-weight:600;}
.clip small{display:block;font-size:11.5px;color:var(--dim,#5b6475);margin-top:2px;}
.clip:hover b{text-decoration:underline;}
@media (max-width:560px){ .clip{flex-basis:170px;} }`;
document.head.appendChild(css);
window.Clips = {ready, forGame, game, strip, data: () => DATA};
})();
