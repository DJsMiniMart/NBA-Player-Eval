/* Jump tabs: a sticky row of buttons under the page header that skips to each section, highlighting the one in view.
   Targets: elements marked data-jump="Label"; with none marked, every visible <h2> in the page body (label = the
   heading, cut at ":" or "("). The bar rebuilds itself when the page redraws, hides when fewer than 2 targets are
   showing, and stays out of the way on views that have their own section tabs (player pages). */
(function(){
"use strict";
const css = document.createElement("style");
css.textContent = `
.jt{position:sticky;top:57px;z-index:30;background:var(--bg,#f2f4f8);border-bottom:1px solid var(--line,#dde2ea);}
.jt[hidden]{display:none;}
.jt-in{display:flex;gap:4px;overflow-x:auto;padding:8px 16px;max-width:1200px;margin:0 auto;scrollbar-width:none;}
.jt-in::-webkit-scrollbar{display:none;}
.jt a{white-space:nowrap;text-decoration:none;color:var(--dim,#5b6475);font:600 13px/1.4 Inter,system-ui,sans-serif;padding:6px 12px;border-radius:999px;}
.jt a:hover{color:var(--ink,#0f172a);background:var(--panel,#fff);text-decoration:none;}
.jt a.on{color:#fff;background:var(--accent,#C8102E);}
[data-jump-target]{scroll-margin-top:118px;}`;
document.head.appendChild(css);

const bar = document.createElement("nav");
bar.className = "jt"; bar.hidden = true; bar.setAttribute("aria-label", "Jump to a section");
bar.innerHTML = `<div class="jt-in"></div>`;
const inner = bar.firstChild;
let targets = [], sig = "";

const shown = el => el.getClientRects().length > 0 && !el.closest("[hidden]");
function place(){   // under the header that's showing (one-page apps swap headers between views)
  const after = [...document.querySelectorAll("[data-jumps-after], .nba-band, header.hero")].find(shown);
  if(!after) return bar.isConnected;
  if(after.nextElementSibling !== bar) after.after(bar);
  return true;
}
function label(el){
  if(el.dataset.jump) return el.dataset.jump;
  let t = (el.textContent || "").replace(/\s+/g, " ").trim();
  t = t.split(/:| \(/)[0].trim();
  return t.length > 28 ? t.slice(0, 26).trim() + "…" : t;
}
function find(){
  const own = [...document.querySelectorAll(".pp-jumps, #tabs.tabs-in, #jumps")].some(shown);
  if(own) return [];
  let list = [...document.querySelectorAll("[data-jump]")].filter(shown);
  if(!list.length) list = [...document.querySelectorAll("main h2, .wrap h2, #main h2")].filter(h => !h.closest(".nba-band, header, .jt, .modal") && shown(h));
  const seen = new Set();
  return list.filter(el => { const l = label(el); if(!l || seen.has(l)) return false; seen.add(l); return true; });
}
function build(){
  if(!place()) return;
  const list = find();
  const s = list.map(label).join("|");
  if(s === sig && list.every((el, i) => el === targets[i])) return;
  sig = s; targets = list;
  bar.hidden = list.length < 2;
  list.forEach(el => el.setAttribute("data-jump-target", ""));
  inner.innerHTML = list.map((el, i) => `<a href="#" data-i="${i}">${label(el).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"})[c])}</a>`).join("");
  inner.querySelectorAll("a").forEach(a => a.onclick = e => {   // scroll only: many pages route on the URL hash
    e.preventDefault();
    const el = targets[+a.dataset.i];
    if(el) el.scrollIntoView({behavior: "smooth", block: "start"});
  });
  mark();
}
function mark(){
  if(bar.hidden || !targets.length) return;
  let cur = 0;
  targets.forEach((el, i) => { if(el.getBoundingClientRect().top < 140) cur = i; });
  if(window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) cur = targets.length - 1;
  inner.querySelectorAll("a").forEach((a, i) => {
    const on = i === cur;
    if(on && !a.classList.contains("on")){
      const r = a.getBoundingClientRect(), b = inner.getBoundingClientRect();   // keep the lit button in view on phones
      if(r.left < b.left || r.right > b.right) inner.scrollTo({left: a.offsetLeft - 16, behavior: "smooth"});
    }
    a.classList.toggle("on", on);
  });
}
let timer = null;
const soon = () => { clearTimeout(timer); timer = setTimeout(build, 200); };
new MutationObserver(muts => { if(muts.some(m => !bar.contains(m.target))) soon(); })
  .observe(document.documentElement, {childList: true, subtree: true, attributes: true, attributeFilter: ["hidden", "style", "class"]});
window.addEventListener("scroll", () => requestAnimationFrame(mark), {passive: true});
window.addEventListener("resize", soon);
window.addEventListener("hashchange", soon);
if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", build); else build();
window.Jumps = {refresh: build};
})();
