/* Injury timetables and links (data/injuries.json, built hourly by injury_feed.py from ESPN's injury report).
   Injuries.ready -> loaded; Injuries.find(team, name) -> entry; Injuries.tag(entry) -> short timetable ("4–6 wks");
   Injuries.when(entry) -> "Out 4–6 weeks · back ~Nov 25–Dec 9". */
(function(){
"use strict";
let DATA = null;
const ready = fetch("data/injuries.json?t=" + Math.floor(Date.now() / 3e5)).then(r => r.ok ? r.json() : null).then(d => { DATA = d; return d; }).catch(() => null);
const fold = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z]/g, "");
const md = iso => { const d = new Date(String(iso).slice(0, 10) + "T12:00:00"); return isNaN(d) ? "" : d.toLocaleDateString("en-US", {month:"short", day:"numeric"}); };
function find(team, name){
  if(!DATA || !DATA.teams) return null;
  const k = fold(name), lists = team && DATA.teams[team] ? [DATA.teams[team]] : Object.values(DATA.teams);
  for(const l of lists){ const x = l.find(r => fold(r.name) === k); if(x) return x; }
  return null;
}
function tag(e){
  const t = e && e.tl; if(!t) return "";
  if(t.kind === "season") return "season";
  if(t.kind === "indef") return "indef.";
  if(t.kind === "range"){ const m = t.label.match(/(\d+)–(\d+) (day|week|month)/); return m ? `${m[1]}–${m[2]} ${m[3][0]}${m[3] === "month" ? "o" : ""}` : ""; }
  if(t.kind === "about"){ const m = t.label.match(/(\d+) (day|week|month)/); return m ? `~${m[1]} ${m[2][0]}${m[2] === "month" ? "o" : ""}` : ""; }
  if(t.kind === "reeval") return "re-eval " + md(t.reeval);
  if(t.kind === "est") return "~" + md(t.from);
  return "";
}
function when(e){
  const t = e && e.tl; if(!t) return "";
  let s = t.label;
  if(t.kind === "range" && t.from && t.to) s += ` · ${/^Re-eval/.test(t.label) ? "around" : "back ~"} ${md(t.from)}–${md(t.to)}`;
  else if(t.kind === "about" && t.from) s += ` · back ~${md(t.from)}`;
  if(t.reevalLabel && t.kind !== "reeval") s += ` · ${t.reevalLabel}`;
  return s;
}
window.Injuries = {ready, find, tag, when, data: () => DATA};
})();
