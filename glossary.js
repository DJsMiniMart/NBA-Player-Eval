/* Glossary pop-ups: the site's own terms (Pulse, Pulse$, aprons, ATS...) get a dotted underline wherever they show up in
   headings, labels and table headers; tap or hover one for a short definition. Loaded on every page by nav.js. */
(function(){
"use strict";
const G = [
  ["Pulse$", "Value per dollar: Pulse production per $1M of salary. Shows who's outplaying (or underplaying) his contract.", "about.html"],
  ["Pulse+", "Pulse that also charges missed shots (−1 per missed field goal, −0.5 per missed free throw), so inefficient scoring nights cost a player.", "about.html"],
  ["Clutch Pulse", "Pulse using only crunch time: the last 5 minutes of the 4th quarter or overtime with the score within 5.", "about.html"],
  ["Pulse Wins", "Wins a player has added above a replacement-level player, from his Pulse production and his share of the team's defense.", "about.html"],
  ["Pulse pick", "Pulse's pick to win a game, from each team's Pulse margin plus home court, adjusted for who's injured or resting.", "about.html"],
  ["Pulse", "The site's all-in-one production stat: (PTS + AST×2 + REB×2 + STL×4 + BLK − TOV×4) ÷ minutes. Around 1.0 is a typical rotation player; 1.25+ is top 10% and 1.4+ is All-NBA level.", "about.html"],
  ["Value tracker", "What contract level a player is playing at this season: the median salary of the 15 qualified players whose production is closest to his.", null],
  ["Playing like", "What the league pays for a player producing what he's producing this season (median salary of the 15 closest qualified players).", null],
  ["Plays like", "What the league pays for a player producing what he's producing (median salary of the 15 closest qualified players).", null],
  ["Hot start check", "Is a player's start real? Blends this season with last season, weighting this season more as his minutes pile up. Tested on 20+ seasons.", null],
  ["Consistency", "How much a player's Pulse swings from game to game: his off nights, typical night and big nights.", null],
  ["On/off", "How the team does with a player on the floor vs on the bench, per 100 possessions.", null],
  ["Ripple effect", "How a trade changed every player's numbers: before the trade vs after, for players who stayed, arrived or left.", null],
  ["Against the spread", "Betting term: picking which team covers the point spread (wins by more than the line, or loses by less), not just who wins.", null],
  ["ATS", "Against the spread: whether a pick covered the point spread, not just who won.", null],
  ["Moneyline", "Betting odds to win the game outright. −200 means bet $200 to win $100; +170 means bet $100 to win $170.", null],
  ["O/U", "Over/under: the sportsbook's total points for both teams combined.", null],
  ["2nd apron", "A payroll line above the 1st apron (this season $221.7M). Teams over it can't combine salaries or send cash in trades, and their future picks can be frozen.", "team.html"],
  ["1st apron", "A payroll line above the tax (this season $209.0M). Teams over it can't take back more salary than they send out in trades and lose the full mid-level exception.", "team.html"],
  ["Apron", "Payroll lines above the luxury tax (this season $209.0M and $221.7M). The higher a team goes, the more trade and signing tools it loses.", "team.html"],
  ["Luxury tax", "A payroll line (this season $200.4M). Teams over it pay a tax on every dollar above, and repeat offenders pay more.", "team.html"],
  ["Salary cap", "The soft cap on team payroll (this season $165.0M). Teams under it can sign free agents with cap space; teams over it use exceptions.", "team.html"],
  ["Cap space", "How far a team's payroll is under the salary cap: money it can use to sign free agents or absorb players in trades.", "team.html"],
  ["Mid-level", "The mid-level exception: lets a team over the cap sign a free agent. The amount depends on whether the team is under the 1st apron.", "team.html"],
  ["Bi-annual", "The bi-annual exception: a smaller signing exception teams under the 1st apron can use every other year.", "team.html"],
  ["Team option", "The team decides whether to keep the player for that season.", null],
  ["Player option", "The player decides whether to stay for that season or become a free agent.", null],
  ["Play-in", "Seeds 7-10 in each conference play a mini-tournament for the last two playoff spots.", "playoffs.html"],
  ["Draft relegation", "Under the new 3-2-1 lottery, the three worst teams get two lottery balls instead of three, to discourage tanking.", "draft.html"],
  ["3-2-1", "The NBA's new draft lottery for 2027-29: non-play-in teams get 3 balls, the 3 worst teams and 9/10 seeds get 2, and the 7/8 play-in losers get 1. All 16 lottery picks are drawn.", "draft.html"],
  ["Pick grade", "A 2K-style letter grade for a draft pick: where it's projected to land, how far out it is, and any protections.", null],
  ["Big board", "A ranking of draft prospects from best to worst, regardless of team needs.", "draft.html"],
  ["Mock draft", "A prediction of which team takes which player, pick by pick.", "draft.html"],
  ["Crunch time", "The last 5 minutes of the 4th quarter or overtime with the score within 5.", null],
  ["Two-way", "A contract that splits a player between the NBA team and its G League team; doesn't count against the 15-man roster.", null],
];
const SEL = "h2,h3,h4,th,.k,.fact span,.pill,.tag,.capnums span,.ask-th,.pp-chip,.note b,.sub b";
const USED = {}, MAX = 3;   // underline each term at most 3 times a page
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const RX = new RegExp("(" + G.map(g => g[0].replace(/[$+/.()-]/g, m => "\\" + m)).join("|") + ")(?![\\w$+])", "i");
const find = t => G.find(g => g[0].toLowerCase() === t.toLowerCase());
const css = document.createElement("style");
css.textContent = `.gl{text-decoration:underline dotted;text-decoration-thickness:1px;text-underline-offset:3px;cursor:help;}
.gl-pop{position:fixed;z-index:140;max-width:300px;background:#0b0b0d;color:#fff;border-radius:10px;padding:10px 12px;font:13px/1.45 Inter,system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.35);text-transform:none;letter-spacing:0;font-weight:400;text-align:left;}
.gl-pop b{display:block;margin-bottom:3px;font-size:13.5px;} .gl-pop a{color:#9cc3ff;display:inline-block;margin-top:4px;}`;
document.head.appendChild(css);
function annotate(root){
  (root || document).querySelectorAll(SEL).forEach(el => {
    if(el.dataset.gl || el.closest(".sitenav,.gl-pop,a,button,select,label,summary,.fc-pop,.tk,[role=button],[data-inj],.trow") || el.matches("[data-k],[data-capyr],[data-sort],[onclick]")) return;
    el.dataset.gl = "1";
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const nodes = []; let n; while((n = walk.nextNode())) if(!n.parentElement.closest("a,button,.gl,select,option")) nodes.push(n);
    for(const t of nodes){
      const m = t.nodeValue.match(RX); if(!m) continue;
      const g = find(m[1]); if(!g || (USED[g[0]] || 0) >= MAX) continue;
      USED[g[0]] = (USED[g[0]] || 0) + 1;
      const span = document.createElement("span"); span.className = "gl"; span.dataset.term = g[0]; span.tabIndex = 0; span.textContent = m[1];
      const after = t.splitText(m.index); after.nodeValue = after.nodeValue.slice(m[1].length); t.parentNode.insertBefore(span, after);
      break;   // one per element
    }
  });
}
let pop = null;
function show(el){
  const g = find(el.dataset.term); if(!g) return;
  if(!pop){ pop = document.createElement("div"); pop.className = "gl-pop"; pop.setAttribute("role", "tooltip"); document.body.appendChild(pop); }
  pop.innerHTML = `<b>${esc(g[0])}</b>${esc(g[1])}${g[2] && !location.pathname.endsWith(g[2]) ? `<br><a href="${g[2]}">More →</a>` : ""}`;
  pop.hidden = false;
  const r = el.getBoundingClientRect(), w = Math.min(300, innerWidth - 16);
  pop.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left)) + "px";
  const below = r.bottom + 8 + pop.offsetHeight < innerHeight;
  pop.style.top = (below ? r.bottom + 6 : Math.max(8, r.top - pop.offsetHeight - 6)) + "px";
}
const hide = () => { if(pop) pop.hidden = true; };
document.addEventListener("click", e => { const el = e.target.closest && e.target.closest(".gl"), th = el && el.closest("th"); if(th && th.onclick){ hide(); return; } if(el){ e.preventDefault(); e.stopPropagation(); show(el); } else if(!(e.target.closest && e.target.closest(".gl-pop"))) hide(); }, true);
document.addEventListener("mouseover", e => { const el = e.target.closest && e.target.closest(".gl"); if(el && matchMedia("(hover: hover)").matches) show(el); });
document.addEventListener("mouseout", e => { const el = e.target.closest && e.target.closest(".gl"); if(el && matchMedia("(hover: hover)").matches && !(e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest(".gl-pop"))) hide(); });
document.addEventListener("keydown", e => { if(e.key === "Escape") hide(); if(e.key === "Enter" && e.target.classList && e.target.classList.contains("gl")) show(e.target); });
window.addEventListener("scroll", hide, {passive: true});
let t = null;
new MutationObserver(() => { clearTimeout(t); t = setTimeout(() => annotate(), 500); }).observe(document.body, {childList: true, subtree: true});
annotate();
window.Glossary = {terms: G, annotate};
})();
