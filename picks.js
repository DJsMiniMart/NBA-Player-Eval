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
