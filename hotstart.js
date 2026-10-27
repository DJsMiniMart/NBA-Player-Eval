/* Hot-start badges next to player names (data/hotstart.json, built by insights.py).
   This season's Pulse is blended with last season's by minutes / (minutes + 600): the mix that best predicted the
   rest of the season in every early window we tested (2004-05 on). A badge says what that blend expects:
     jump   / drop    the change is big enough to be real (blended change 8%+)
     cool   / bounce  a big start (15%+ either way) that the blend expects to mostly fade */
(function(){
"use strict";
const TXT = {
  jump:   ["🔥", "Real jump", "real", "His Pulse is up {raw} on last season, and enough of it holds up to expect about {proj} vs last season over the rest of the year."],
  drop:   ["🧊", "Real drop", "real", "His Pulse is down {raw} on last season, and enough of it holds up to expect about {proj} vs last season the rest of the way."],
  cool:   ["♨️", "Hot start", "fade", "Up {raw} on last season so far, but after only {g} games most of that usually fades: expect about {proj} vs last season."],
  bounce: ["🌱", "Slow start", "fade", "Down {raw} on last season so far, but after only {g} games most of that usually comes back: expect about {proj} vs last season."],
};
let DATA = null;
const ready = fetch("data/hotstart.json?t=" + Math.floor(Date.now() / 6e5)).then(r => r.ok ? r.json() : null).then(d => { DATA = d; return d; }).catch(() => null);
const pct = v => (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(Math.round(v * 100)) + "%";
function info(id){
  const h = DATA && DATA.players && DATA.players[id];
  if(!h) return null;
  const t = TXT[h[0]];
  return t ? {kind: h[0], icon: t[0], label: t[1], tone: t[2], raw: h[1], proj: h[2], games: h[3],
    text: t[3].replace("{raw}", Math.abs(Math.round(h[1] * 100)) + "%").replace("{proj}", pct(h[2])).replace("{g}", h[3])} : null;
}
function chip(id, opts){
  const b = info(id); if(!b) return "";
  const small = opts && opts.small;
  return `<span class="hs-chip hs-${b.kind}" title="${b.label}: ${b.text.replace(/"/g, "&quot;")}">${b.icon}${small ? "" : " " + b.label}</span>`;
}
const css = document.createElement("style");
css.textContent = `.hs-chip{display:inline-flex;align-items:center;gap:3px;margin-left:6px;padding:1px 7px;border-radius:999px;font:600 11px/1.6 Inter,system-ui,sans-serif;white-space:nowrap;vertical-align:2px;letter-spacing:0;text-transform:none;cursor:help;}
.hs-jump{background:rgba(47,158,68,.14);color:#2b8a3e;} .hs-drop{background:rgba(214,51,108,.13);color:#c2255c;}
.hs-cool{background:rgba(245,159,0,.16);color:#a15c00;} .hs-bounce{background:rgba(28,126,214,.13);color:#1864ab;}
@media (prefers-color-scheme: dark){ .hs-jump{color:#69db7c;} .hs-drop{color:#ff8cb0;} .hs-cool{color:#ffc34d;} .hs-bounce{color:#74c0fc;} }`;
document.head.appendChild(css);
window.HotStart = {ready, info, chip};
})();
