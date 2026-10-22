/* 2K-style hot-zone shot chart, shared by the player and team pages.
   ZoneChart.html(zones, league, opts) -> chart + table. zones/league: {zoneKey: [attempts, makes]}.
   Zones match espn_games.hot_zone: the corner three runs from the baseline up to the break (14.2 ft),
   wing vs. top is split by lines 24 degrees either side of straight out from the basket. */
(function(){
"use strict";
const ZONES = [
  // key, name, group, label position [x, y] (court drawn 10 px per foot, basket at the top)
  ["ra",    "Restricted area",       "Inside",    [250, 33]],
  ["paint", "Paint (non-RA)",        "Inside",    [250, 132]],
  ["mlb",   "Left baseline mid",     "Mid-range", [100, 58]],
  ["mlw",   "Left wing mid",         "Mid-range", [130, 210]],
  ["mtop",  "Top of the key mid",    "Mid-range", [250, 226]],
  ["mrw",   "Right wing mid",        "Mid-range", [370, 210]],
  ["mrb",   "Right baseline mid",    "Mid-range", [400, 58]],
  ["c3l",   "Left corner 3",         "Three",     [15, 71]],
  ["w3l",   "Left wing 3",           "Three",     [62, 318]],
  ["t3",    "Top of the key 3",      "Three",     [250, 370]],
  ["w3r",   "Right wing 3",          "Three",     [438, 318]],
  ["c3r",   "Right corner 3",        "Three",     [485, 71]],
  ["deep",  "Heaves (40+ ft)",       "Three",     null],
];
const BX = 250, BY = 52.5, BREAK = 142, T = 0.4452;   // basket, break (14.2 ft), tan(24°)
const ray = (y, s) => BX + s * T * (y - BY);
const poly = pts => pts.map(p => p.map(n => n.toFixed(1)).join(",")).join(" ");
const SHAPES = {
  side: {l: `0,0 250,0 250,${BREAK} 0,${BREAK}`, r: `250,0 500,0 500,${BREAK} 250,${BREAK}`},
  wing: {l: poly([[0, BREAK], [ray(BREAK, -1), BREAK], [ray(470, -1), 470], [0, 470]]),
         r: poly([[ray(BREAK, 1), BREAK], [500, BREAK], [500, 470], [ray(470, 1), 470]])},
  top: poly([[ray(BREAK, -1), BREAK], [ray(BREAK, 1), BREAK], [ray(470, 1), 470], [ray(470, -1), 470]]),
};
const RA = "M210,52.5 A40,40 0 1 1 290,52.5 A40,40 0 1 1 210,52.5 Z";
const ARC = "M30,0 L30,142 A237.5,237.5 0 0 0 470,142 L470,0 Z";

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const pct = (m, a) => a ? (100 * m / a).toFixed(1) + "%" : "—";
const rate = t => t && t[0] ? t[1] / t[0] : null;
const MIN_SAMPLE = 5;   // fewer attempts than this: colored faintly

function fill(d, a){
  if(!a) return "var(--zc-none)";
  const t = Math.min(1, Math.abs(d) / 0.10), al = (a < MIN_SAMPLE ? .12 + .18 * t : .22 + .63 * t).toFixed(2);
  return d >= 0 ? `rgba(224,49,49,${al})` : `rgba(28,126,214,${al})`;
}

let uid = 0, styled = false;
const css = `
.zc{--zc-none:var(--row,#f2f4f8);--zc-line:var(--panel,#fff);--zc-base:var(--panel,#fff);}
.zc-svg{width:100%;max-width:540px;display:block;margin:0 auto;}
.zc-svg .zone{stroke:var(--zc-line);stroke-width:3;}
.zc-svg .court{fill:none;stroke:var(--ink,#0f172a);stroke-width:2;opacity:.35;}
.zc-svg text{font:700 17px "Barlow Condensed",Inter,sans-serif;fill:var(--ink,#0f172a);text-anchor:middle;paint-order:stroke;stroke:var(--zc-line);stroke-width:3px;stroke-linejoin:round;}
.zc-svg text.s{font:600 11px Inter,sans-serif;fill:var(--dim,#5b6475);}
.zc-svg text.c{font:700 11.5px Inter,sans-serif;}
.zc-svg .zone:hover{stroke:var(--ink,#0f172a);}
.zc-key{display:flex;justify-content:center;gap:14px;flex-wrap:wrap;font-size:11.5px;color:var(--dim,#5b6475);margin:8px 0 4px;}
.zc-key span{display:inline-flex;align-items:center;gap:5px;}
.zc-key i{display:inline-block;width:14px;height:10px;border-radius:3px;}
.zc-tbl{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums;margin-top:10px;}
.zc-tbl th{font-size:10.5px;text-transform:uppercase;letter-spacing:.4px;color:var(--dim,#5b6475);text-align:right;padding:6px 7px;border-bottom:1px solid var(--line,#dde2ea);white-space:nowrap;}
.zc-tbl td{padding:5px 7px;border-bottom:1px solid var(--line,#dde2ea);text-align:right;white-space:nowrap;font-size:12.5px;}
.zc-tbl .l{text-align:left;}
.zc-tbl tr.g td{background:var(--row,#f6f8fb);font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:.4px;color:var(--dim,#5b6475);}
.zc-tbl tr.tot td{font-weight:700;border-top:2px solid var(--line,#dde2ea);}
.zc-tbl .sw{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:7px;vertical-align:-1px;}
.zc-tbl .hot{color:#d6336c;font-weight:700;} .zc-tbl .cold{color:#1c7ed6;font-weight:700;}
@media (prefers-color-scheme: dark){ .zc-tbl .hot{color:#ff6b6b;} .zc-tbl .cold{color:#74c0fc;} }
.zc-wrap{overflow-x:auto;}
`;

function html(zones, league, opts = {}){
  if(!styled){ const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st); styled = true; }
  zones = zones || {}; league = league || {};
  const id = "zc" + (++uid);
  const info = Object.fromEntries(ZONES.map(([k, name]) => {
    const t = zones[k] || [0, 0], lp = rate(league[k]), p = rate(t);
    return [k, {k, name, a: t[0], m: t[1], p, lp, d: p != null && lp != null ? p - lp : 0}];
  }));
  const tip = z => `${z.name}: ${z.m}/${z.a} (${pct(z.m, z.a)})${z.lp != null ? ` · league ${(z.lp * 100).toFixed(1)}%` : ""}${z.a && z.a < MIN_SAMPLE ? " · small sample" : ""}`;
  const shape = (k, inner) => `<g>${inner(fill(info[k].d, info[k].a))}<title>${esc(tip(info[k]))}</title></g>`;
  const P = (k, pts) => shape(k, f => `<polygon class="zone" points="${pts}" fill="${f}"/>`);
  const label = ([k, , , pos]) => {
    if(!pos) return "";
    const z = info[k], [x, y] = pos;
    if(k === "c3l" || k === "c3r"){
      const rot = k === "c3l" ? -90 : 90;
      return `<text class="c" x="${x}" y="${y}" transform="rotate(${rot} ${x} ${y})" dy="4">${z.a ? `${pct(z.m, z.a).replace(".0%", "%")} · ${z.m}/${z.a}` : "—"}</text>`;
    }
    const small = k === "ra";
    return `<text x="${x}" y="${y}"${small ? ` style="font-size:15px"` : ""}>${z.a ? pct(z.m, z.a) : "—"}</text>
      <text class="s" x="${x}" y="${y + (small ? 50 : 16)}">${z.a ? `${z.m}/${z.a}` : ""}</text>
      ${!small && z.lp != null ? `<text class="s" x="${x}" y="${y + 30}" style="font-size:10px">Lg ${(z.lp * 100).toFixed(1)}%</text>` : ""}`;
  };
  const svg = `<svg class="zc-svg" viewBox="-4 -4 508 478" role="img" aria-label="${esc(opts.label || "Shot zones")}">
    <defs>
      <clipPath id="${id}in"><path d="${ARC}"/></clipPath>
      <clipPath id="${id}out"><path clip-rule="evenodd" d="M0,0 H500 V470 H0 Z ${ARC}"/></clipPath>
    </defs>
    <rect x="0" y="0" width="500" height="470" fill="var(--zc-base)"/>
    <g clip-path="url(#${id}out)">${P("c3l", SHAPES.side.l)}${P("c3r", SHAPES.side.r)}${P("w3l", SHAPES.wing.l)}${P("w3r", SHAPES.wing.r)}${P("t3", SHAPES.top)}</g>
    <g clip-path="url(#${id}in)">${P("mlb", SHAPES.side.l)}${P("mrb", SHAPES.side.r)}${P("mlw", SHAPES.wing.l)}${P("mrw", SHAPES.wing.r)}${P("mtop", SHAPES.top)}</g>
    ${shape("paint", f => `<rect x="170" y="0" width="160" height="190" fill="var(--zc-base)"/><rect class="zone" x="170" y="0" width="160" height="190" fill="${f}"/>`)}
    ${shape("ra", f => `<path d="${RA}" fill="var(--zc-base)"/><path class="zone" d="${RA}" fill="${f}"/>`)}
    <g class="court">
      <rect x="0" y="0" width="500" height="470"/>
      <circle cx="250" cy="190" r="60"/>
      <line x1="220" y1="40" x2="280" y2="40"/>
      <circle cx="250" cy="52.5" r="7.5"/>
      <path d="M190 470 A60 60 0 0 1 310 470"/>
    </g>
    <g pointer-events="none">${ZONES.map(label).join("")}</g>
  </svg>`;

  const all = Object.values(info), tot = all.reduce((t, z) => [t[0] + z.a, t[1] + z.m], [0, 0]);
  const ltot = ZONES.reduce((t, [k]) => { const x = league[k] || [0, 0]; return [t[0] + x[0], t[1] + x[1]]; }, [0, 0]);
  const ranks = opts.ranks || null;
  const groups = ["Inside", "Mid-range", "Three"];
  const rows = groups.map(g => {
    const list = ZONES.filter(z => z[2] === g).map(([k]) => info[k]).filter(z => z.a || (league[z.k] && league[z.k][0] && z.k !== "deep"));
    const gs = list.reduce((t, z) => [t[0] + z.a, t[1] + z.m], [0, 0]);
    const gl = list.reduce((t, z) => { const x = league[z.k] || [0, 0]; return [t[0] + x[0], t[1] + x[1]]; }, [0, 0]);
    return `<tr class="g"><td class="l">${g}</td><td>${gs[1]}-${gs[0]}</td><td>${pct(gs[1], gs[0])}</td><td>${pct(gl[1], gl[0])}</td><td></td><td>${pct(gs[0], tot[0])}</td><td>${pct(gl[0], ltot[0])}</td>${ranks ? "<td></td>" : ""}</tr>` +
      list.map(z => {
        const d = z.a && z.lp != null ? z.p - z.lp : null;
        const lf = league[z.k] ? league[z.k][0] / (ltot[0] || 1) : null;
        const rk = ranks && ranks[z.k];
        return `<tr><td class="l"><span class="sw" style="background:${fill(z.d, z.a)}"></span>${esc(z.name)}</td><td>${z.m}-${z.a}</td><td><b>${pct(z.m, z.a)}</b></td>
          <td>${z.lp != null ? (z.lp * 100).toFixed(1) + "%" : "—"}</td>
          <td class="${d == null ? "" : d >= 0 ? "hot" : "cold"}">${d == null ? "—" : (d >= 0 ? "+" : "−") + Math.abs(d * 100).toFixed(1)}</td>
          <td>${pct(z.a, tot[0])}</td><td>${lf != null ? (lf * 100).toFixed(1) + "%" : "—"}</td>${ranks ? `<td title="FG% rank / attempts rank among the 30 teams">${rk ? `${rk[0]} / ${rk[1]}` : "—"}</td>` : ""}</tr>`;
      }).join("");
  }).join("");
  const table = `<div class="zc-wrap"><table class="zc-tbl"><thead><tr><th class="l">Zone</th><th>FGM-FGA</th><th>FG%</th><th>League</th><th title="Percentage points above (+) or below (−) league average">vs Lg</th><th title="Share of ${esc(opts.who || "their")} shots from this zone">Freq</th><th title="Share of all league shots from this zone">Lg freq</th>${ranks ? `<th title="FG% rank / attempts rank among the 30 teams (1 = best FG% and most attempts${opts.defense ? "; for opponents, 1 = lowest FG% allowed" : ""})">Rank</th>` : ""}</tr></thead>
    <tbody>${rows}<tr class="tot"><td class="l">All shots</td><td>${tot[1]}-${tot[0]}</td><td>${pct(tot[1], tot[0])}</td><td>${pct(ltot[1], ltot[0])}</td><td></td><td></td><td></td>${ranks ? "<td></td>" : ""}</tr></tbody></table></div>`;
  const key = `<div class="zc-key"><span><i style="background:rgba(224,49,49,.8)"></i>Hot: above league average</span><span><i style="background:rgba(28,126,214,.8)"></i>Cold: below league average</span><span><i style="background:rgba(120,120,120,.18)"></i>Faint = under ${MIN_SAMPLE} attempts</span></div>`;
  return `<div class="zc">${svg}${key}${opts.table === false ? "" : table}</div>`;
}
const has = z => z && Object.values(z).some(t => t && t[0]);
window.ZoneChart = {html, has, ZONES};
})();
