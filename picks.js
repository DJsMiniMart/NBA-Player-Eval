/* Which draft picks a team can trade, worked out from RealGM's future-picks text (picks.json / team_extra.json).
   Each RealGM cell lists what a team holds in one round of one draft, separated by ";" — e.g.
     "Own; DAL 3-30; MIA 15-30"     own pick, Dallas's pick if it lands 3-30, Miami's if 15-30
     "To OKC"                       the team's own pick is owed to OKC
     "1-5 Own; 6-30 to OKC"         keeps its pick only if it lands 1-5
     "Own or swap for MIN"          own pick, with a swap attached
     "Frozen (through 2027-28)"     the second-apron frozen pick: can't be traded
   Anything with "favorable"/"swap of"/"if (i)" is a multi-team swap the tool lists as "complex rights". */
(function(){
"use strict";
// RealGM's team codes -> the NBA's
const RG = {GOS:"GSW", SAN:"SAS", UTH:"UTA", PHL:"PHI", BRK:"BKN", PHO:"PHX", NOH:"NOP", CHO:"CHA", NJN:"BKN"};
const code = c => RG[c] || c;

/* split on ";" that aren't inside () or [] */
function parts(text){
  const out = []; let depth = 0, cur = "";
  for(const ch of String(text || "")){
    if(ch === "(" || ch === "[") depth++;
    if(ch === ")" || ch === "]") depth = Math.max(0, depth - 1);
    if(ch === ";" && depth === 0){ out.push(cur.trim()); cur = ""; } else cur += ch;
  }
  if(cur.trim()) out.push(cur.trim());
  return out.filter(Boolean);
}

/* one RealGM cell -> {assets:[...], ownOwed:bool, frozen:bool}
   asset: {orig, kind:"own"|"acquired"|"complex", range:"3-30"|null, cond:text|null, text} */
function cell(team, text){
  const res = {assets: [], ownOwed: false, frozen: false, forfeited: false, raw: text};
  const segs = parts(String(text || "").replace(/\s*---.*$/, ""));   // "--- unspecified pick" notes are dropped
  for(let seg of segs){
    seg = seg.replace(/\*+/g, "").trim();
    if(!seg) continue;
    const via = (seg.match(/\(via [^)]*\)/) || [""])[0];
    const bare = seg.replace(/\s*\(via [^)]*\)/g, "").replace(/\s*\[[^\]]*\]/g, "").trim();
    if(/^Frozen/i.test(bare)){ res.frozen = true; continue; }
    if(/^Forfeited/i.test(bare)){ if(/^Forfeited by \w+: (\w{3})$/.test(bare)) { const m = bare.match(/: (\w{3})$/); res.assets.push({orig: code(m[1]), kind:"acquired", range:null, cond:null, text: seg}); } else res.forfeited = true; continue; }
    if(/^To [A-Z]{3}\b/.test(bare)){ res.ownOwed = true; continue; }
    if(/favorable|swap of|\bif \(i\)|scenarios/i.test(bare)){
      // a multi-team swap. "A then other to X": the team gets A. "... to X" with no "then": it goes out.
      const mine = bare.split(/\s+then\s+/)[0];
      if(/\bto [A-Z]{3}\b/.test(mine)){ res.outgoing = true; continue; }
      res.assets.push({orig: team, kind:"complex", range:null, cond:null, text: seg});
      continue;
    }
    let m;
    if((m = bare.match(/^Own \(([^)]*)\)$/))){   // "Own (cannot be 1)"
      res.assets.push({orig: team, kind:"own", range:null, cond: m[1], text: seg});
      continue;
    }
    if((m = bare.match(/^Own(?: or (?:swap for |)([A-Z]{3})(?: [\d-]+)?)?$/))){
      res.assets.push({orig: team, kind:"own", range:null, cond:null, swapWith: m[1] ? code(m[1]) : null, text: seg});
      continue;
    }
    if((m = bare.match(/^(\d+-\d+) Own(?: or (?:swap for |)([A-Z]{3})[\s\d-]*)?$/)) || (m = bare.match(/^(\d+) Own$/))){
      res.assets.push({orig: team, kind:"own", range: m[1], cond:null, swapWith: m[2] ? code(m[2]) : null, text: seg});
      continue;
    }
    if((m = bare.match(/^(\d+-\d+) to ([A-Z]{3})/))){ continue; }   // the rest of a split pick, owed elsewhere
    if((m = bare.match(/^([A-Z]{3})(?: (\d+-\d+))?(?: (if .*))?$/))){
      res.assets.push({orig: code(m[1]), kind:"acquired", range: m[2] || null, cond: m[3] || null, text: seg});
      continue;
    }
    if((m = bare.match(/^(?:Own; )?(?:Own )?(\w{3}) (\d+-\d+)/))){
      res.assets.push({orig: code(m[1]), kind:"acquired", range: m[2], cond:null, text: seg});
      continue;
    }
    // anything else: keep it, so nothing the team holds is hidden
    res.assets.push({orig: team, kind:"complex", range:null, cond:null, text: seg});
  }
  if(!res.assets.some(a => a.kind === "own") && !res.ownOwed && !res.frozen && segs.length === 0) res.ownOwed = true;
  return res;
}

/* {team: {year: {1: cell(), 2: cell()}}} from picks.json-style data */
function parseAll(data){
  const out = {};
  Object.entries(data || {}).forEach(([team, t]) => {
    out[team] = {};
    ((t && t.rows) || []).forEach(r => {
      const y = +r[0];
      if(!y) return;
      out[team][y] = {1: cell(team, r[1]), 2: cell(team, r[2])};
    });
  });
  return out;
}
window.PickRights = {parseAll, cell, parts, code};
})();

/* ---------- Pick grades, 2K-style (A+ down to F), for every draft pick on the site ----------
   1. Where each team should finish: today's record + the rest of its 82 games at Pulse's win chance
      (its rating vs. an average team), worst record = pick 1.
   2. A pick further out is less certain: its expected slot drifts toward the middle (x0.6 per year out) and the spread
      widens, so a bad team's 2031 pick isn't graded like its 2027 one.
   3. Value of each slot from a draft value curve (No. 1 = 100, No. 10 ≈ 43, No. 30 ≈ 17; second-rounders 14 down to 6),
      averaged over where the pick could land, counting only the slots where it actually conveys (protections),
      and taking the better of the two picks for a swap.
   4. Value -> letter. */
(function(){
"use strict";
const NBA = {BRK:"BKN", CHO:"CHA", PHO:"PHX", GOS:"GSW", SAN:"SAS", UTH:"UTA", PHL:"PHI", NOH:"NOP", NJN:"BKN"};
const C = c => NBA[c] || c;
let SLOT = null;          // team -> projected pick (1 = worst record)
const get = u => fetch(u + "?t=" + Math.floor(Date.now() / 6e5)).then(r => r.ok ? r.json() : null).catch(() => null);
const ready = Promise.all([get("data/predictions.json"), get("data/teams/league.json")]).then(([P, L]) => {
  const rt = (P && P.ratings) || {}, scale = (P && P.model && P.model.scale) || 0.03;
  const R = {};
  Object.keys(rt).forEach(t => R[t] = {w: 0, l: 0});
  ((L && L.games) || []).forEach(g => { const [, , h, a, hl, al] = g; if(!hl || !al) return;
    (R[h] = R[h] || {w: 0, l: 0}); (R[a] = R[a] || {w: 0, l: 0});
    if(hl[0] > al[0]){ R[h].w++; R[a].l++; } else { R[a].w++; R[h].l++; } });
  const proj = Object.entries(R).map(([t, r]) => { const p = 1 / (1 + Math.exp(-scale * (rt[t] || 0))); const left = Math.max(0, 82 - r.w - r.l);
    return [t, (r.w + p * left) / 82 + Math.random() * 1e-9]; });
  proj.sort((a, b) => a[1] - b[1]);
  SLOT = Object.fromEntries(proj.map(([t], i) => [t, i + 1]));
  return SLOT;
});
const v1 = s => 15 + 85 * Math.exp(-0.13 * (s - 1));
const v2 = s => 4 + 10 * Math.exp(-0.06 * (s - 1));
const val = (s, round) => round === 1 ? v1(s) : v2(s);
const LETTERS = [[85,"A+"],[70,"A"],[58,"A-"],[48,"B+"],[40,"B"],[33,"B-"],[27,"C+"],[22,"C"],[18,"C-"],[14,"D+"],[9,"D"],[6,"D-"],[0,"F"]];
const letter = v => (LETTERS.find(([min]) => v >= min) || [0, "F"])[1];
function firstDraft(){ return (window.CAP_RULES && CAP_RULES.firstDraft) || (new Date().getUTCMonth() >= 6 ? new Date().getUTCFullYear() + 1 : new Date().getUTCFullYear()); }
function dist(team, year){
  const base = (SLOT && SLOT[C(team)]) || 15.5, yrs = Math.max(0, year - firstDraft());
  const m = 15.5 + (base - 15.5) * Math.pow(0.6, yrs), sd = 3.5 + 3 * yrs;
  const p = []; let tot = 0;
  for(let s = 1; s <= 30; s++){ const x = Math.exp(-((s - m) ** 2) / (2 * sd * sd)); p.push(x); tot += x; }
  return {p: p.map(x => x / tot), m};
}
function inRange(s, range){ if(!range) return true; const m = String(range).match(/^(\d+)(?:-(\d+))?$/); if(!m) return true; const a = +m[1], b = m[2] ? +m[2] : a; return s >= a && s <= b; }
/* grade one pick: orig team, draft year, round (1|2), opts: {range:"3-30" (conveys only there), swapWith:"MIN", slot: exact pick if known} */
function grade(orig, year, round, opts){
  opts = opts || {};
  if(opts.slot) { const v = val(opts.slot, round); return {letter: letter(v), value: v, slot: opts.slot, chance: 1}; }
  const A = dist(orig, year);
  let v = 0, chance = 0;
  if(opts.swapWith){
    const B = dist(opts.swapWith, year);
    for(let s = 1; s <= 30; s++) for(let t = 1; t <= 30; t++){ const q = A.p[s - 1] * B.p[t - 1]; v += q * val(Math.min(s, t), round); }
    chance = 1;
  } else {
    for(let s = 1; s <= 30; s++) if(inRange(s, opts.range)){ v += A.p[s - 1] * val(s, round); chance += A.p[s - 1]; }
  }
  return {letter: letter(v), value: v, slot: Math.round(A.m), chance};
}
/* grade a PickRights.cell asset ({orig, kind, range, swapWith}) */
function gradeAsset(asset, year, round){
  if(!asset || asset.kind === "complex") return null;
  return grade(asset.orig, year, round, {range: asset.range, swapWith: asset.swapWith});
}
const cls = l => l === "?" ? "pg-q" : "pg-" + l[0].toLowerCase();
function badge(g, extra){
  if(!g) return `<span class="pgrade pg-q" title="Multi-team swap or conditions too tangled to grade">?</span>`;
  const why = `Grade ${g.letter}: ${g.slot ? `projected around pick ${g.slot}` : ""}${g.chance < 0.995 ? `, ${Math.round(g.chance * 100)}% chance it conveys` : ""} · value ${Math.round(g.value)} on a 100-point scale (No. 1 pick = 100)${extra ? " · " + extra : ""}`;
  return `<span class="pgrade ${cls(g.letter)}" title="${why.replace(/"/g, "&quot;")}">${g.letter}</span>`;
}
const css = document.createElement("style");
css.textContent = `.pgrade{display:inline-flex;align-items:center;justify-content:center;min-width:26px;height:20px;padding:0 5px;border-radius:5px;font:800 11.5px/1 Inter,system-ui,sans-serif;color:#fff;margin-right:6px;vertical-align:1px;cursor:help;letter-spacing:.2px;}
.pg-a{background:#2f9e44;} .pg-b{background:#1c7ed6;} .pg-c{background:#e0a100;} .pg-d{background:#e8590c;} .pg-f{background:#c92a2a;} .pg-q{background:#868e96;}`;
document.head.appendChild(css);
window.PickGrade = {ready, grade, gradeAsset, badge, letter, value: val, slot: t => SLOT && SLOT[C(t)], firstDraft};
})();
