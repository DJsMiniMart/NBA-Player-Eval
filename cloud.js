/* Cloud save: sign in (Google) to keep My team, The Rotation and its card game, My Picks and settings in your account,
   so they survive a cleared browser and follow you to any device. Optional: the site works the same without it.
   Firebase Authentication for sign-in; Firebase Realtime Database (REST) for one record per person at users/<uid>.
   The Firebase SDK only loads once someone signs in. Database rules let each person read and write only their own record. */
(function(){
"use strict";
if(window.FCCloud) return;   // loaded once per page
const CFG = {
  apiKey: "AIzaSyBqBhHI1dEPhHqaFitoo_aUcD3NcYySzv0",
  authDomain: "full-court-geek-press.firebaseapp.com",
  databaseURL: "https://full-court-geek-press-default-rtdb.firebaseio.com",
  projectId: "full-court-geek-press",
  storageBucket: "full-court-geek-press.firebasestorage.app",
  messagingSenderId: "154022059384",
  appId: "1:154022059384:web:5ac388fb68ea94ad99bc8d"
};
const SDK = "https://www.gstatic.com/firebasejs/10.12.2/";
const META = "cloud.meta";   // not one of the synced keys: {uid, email, at (last synced save), h (hash of what was synced)}
const toast = m => window.fcToast && fcToast(m);
const getMeta = () => { try{ return JSON.parse(localStorage.getItem(META) || "null"); }catch(_){ return null; } };
const setMeta = m => { try{ m ? localStorage.setItem(META, JSON.stringify(m)) : localStorage.removeItem(META); }catch(_){} };
const isKey = k => window.FCSync && FCSync.keys ? FCSync.keys(k) : /^fcgp/.test(k);
function snapshot(){
  const d = {}; try{ Object.keys(localStorage).filter(isKey).sort().forEach(k => d[k] = localStorage.getItem(k)); }catch(_){}
  return d;
}
/* only these count as "your setup" when deciding what changed: page states like a collapsed ticker or an open tab don't */
const MAIN = k => /^fcgp/.test(k) && k !== "fcgp.rotmode";
function hash(d){ d = Object.fromEntries(Object.entries(d).filter(([k, v]) => MAIN(k) && v !== "")); const s = JSON.stringify(d); let h = 5381; for(let i = 0; i < s.length; i++) h = (h * 33 ^ s.charCodeAt(i)) >>> 0; return h.toString(36) + ":" + s.length; }
const hasData = d => Object.entries(d).some(([k, v]) => MAIN(k) && v !== "" && v !== "[]" && v !== "{}");

let user = null, ready = null, timer = null, busy = false, paused = false;
const subs = [];
const emit = () => { subs.forEach(f => { try{ f(user); }catch(_){} }); document.dispatchEvent(new CustomEvent("cloud", {detail: {user}})); };

function script(src){ return new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => rej(new Error("Couldn't reach sign-in (offline?)")); document.head.appendChild(s); }); }
function load(){
  return ready || (ready = (async () => {
    await script(SDK + "firebase-app-compat.js"); await script(SDK + "firebase-auth-compat.js");
    if(!firebase.apps.length) firebase.initializeApp(CFG);
    const auth = firebase.auth();
    await new Promise(res => { const off = auth.onAuthStateChanged(u => { off(); res(); }); });
    auth.onAuthStateChanged(u => { const was = user && user.uid; user = u ? {uid: u.uid, email: u.email || "", name: u.displayName || ""} : null; if((user && user.uid) !== was){ if(user) firstSync(); emit(); } });
    return auth;
  })().catch(e => { ready = null; throw e; }));
}
async function token(){ const a = await load(); return a.currentUser ? a.currentUser.getIdToken() : null; }
const url = (uid, t) => `${CFG.databaseURL}/users/${encodeURIComponent(uid)}.json?auth=${encodeURIComponent(t)}`;
async function getRemote(){
  const t = await token(); if(!t) return null;
  const r = await fetch(url(user.uid, t)); if(!r.ok) throw new Error("Couldn't read your saved setup (" + r.status + ")");
  return r.json();   // null when nothing saved yet; else {at, code, dev}
}
async function putRemote(keepalive){
  if(deciding) return;   // waiting for the person to pick which setup to keep
  const t = await token(); if(!t) return;
  const d = snapshot(), h = hash(d), m = getMeta();
  if(m && m.uid === user.uid && m.h === h) return;   // nothing changed since the last save
  const code = await FCSync.pack(), at = Date.now();
  const r = await fetch(url(user.uid, t), {method: "PUT", body: JSON.stringify({at, code, dev: navigator.userAgent.slice(0, 120)}), keepalive: !!keepalive});
  if(!r.ok) throw new Error("Couldn't save to your account (" + r.status + ")");
  setMeta({uid: user.uid, email: user.email, at, h});
  emit();
}
function apply(rem){
  return FCSync.unpack(rem.code).then(o => {
    paused = true;
    try{ Object.keys(localStorage).filter(isKey).forEach(k => localStorage.removeItem(k)); Object.entries(o.d).forEach(([k, v]) => { if(isKey(k)) localStorage.setItem(k, v); }); }finally{ paused = false; }
    setMeta({uid: user.uid, email: user.email, at: rem.at, h: hash(snapshot())});
  });
}
/* after sign-in (or on each visit while signed in): line this device up with the account */
async function firstSync(){
  if(busy) return; busy = true;
  try{
    const rem = await getRemote(), m = getMeta(), d = snapshot(), mine = m && m.uid === user.uid;
    const localChanged = !mine || m.h !== hash(d), remoteChanged = rem && (!mine || rem.at > (m.at || 0));
    if(!rem){ await putRemote(); if(!mine) toast("Signed in · your setup is now saved to your account"); return; }
    if(!remoteChanged){ if(localChanged) await putRemote(); return; }
    if(!localChanged || !hasData(d)){ await apply(rem); toast("Loaded your saved setup"); setTimeout(() => location.reload(), 600); return; }
    choose(rem);   // both sides have changes: ask
  }catch(e){ toast(e.message || "Cloud save didn't work"); }
  finally{ busy = false; }
}
let deciding = false;
function choose(rem){
  deciding = true;
  const when = t => new Date(t).toLocaleString("en-US", {month: "short", day: "numeric", hour: "numeric", minute: "2-digit"});
  let d = document.getElementById("fcCloudPop");
  if(!d){ d = document.createElement("div"); d.id = "fcCloudPop"; d.className = "fc-pop"; document.body.appendChild(d); }
  d.innerHTML = `<div class="fc-sync" role="dialog" aria-label="Which setup to keep"><h3>Which setup should we keep?</h3>
    <p>Your account has a setup saved ${when(rem.at)}, and this device has a different one. Keep one; the other is replaced.</p>
    <button class="go" data-k="acct">Use my account's setup</button><button class="alt" data-k="dev">Keep this device's setup</button>
    <p>Tip: if you've been playing The Rotation on another phone, you probably want your account's setup.</p></div>`;
  d.hidden = false;
  d.querySelector('[data-k="acct"]').onclick = async () => { d.hidden = true; deciding = false; await apply(rem); toast("Loaded your account's setup"); setTimeout(() => location.reload(), 600); };
  d.querySelector('[data-k="dev"]').onclick = async () => { d.hidden = true; deciding = false; const m = getMeta(); setMeta(Object.assign({}, m, {uid: user.uid, h: "x"})); try{ await putRemote(); toast("Saved this device's setup to your account"); }catch(e){ toast(e.message); } };
}
/* save shortly after any change to a synced key, and right away when the page is hidden */
const set0 = Storage.prototype.setItem, rem0 = Storage.prototype.removeItem;
function changed(k){ if(paused || !user || !isKey(k)) return; clearTimeout(timer); timer = setTimeout(() => putRemote().catch(e => toast(e.message)), 2500); }
Storage.prototype.setItem = function(k, v){ set0.call(this, k, v); if(this === window.localStorage) changed(k); };
Storage.prototype.removeItem = function(k){ rem0.call(this, k); if(this === window.localStorage) changed(k); };
document.addEventListener("visibilitychange", () => { if(document.visibilityState === "hidden" && timer && user){ clearTimeout(timer); timer = null; putRemote(true).catch(() => {}); } });

async function signIn(){
  try{
    const auth = await load(), p = new firebase.auth.GoogleAuthProvider();
    p.setCustomParameters({prompt: "select_account"});
    await auth.signInWithPopup(p);
  }catch(e){
    if(e && /popup-closed|cancelled-popup/.test(e.code || "")) return;
    toast(e && e.code === "auth/unauthorized-domain" ? "Sign-in isn't turned on for this site yet" : e && e.code === "auth/popup-blocked" ? "Allow pop-ups for this site, then try again" : (e && e.message) || "Sign-in didn't work");
  }
}
async function signOut(){
  if(user) await putRemote().catch(() => {});
  const auth = await load(); await auth.signOut(); setMeta(null); user = null; emit();
  toast("Signed out · your setup stays on this device");
}
window.FCCloud = {signIn, signOut, user: () => user, saved: () => getMeta(), onChange: f => { subs.push(f); }, saveNow: () => putRemote()};
// signed in before on this device: load quietly and sync
const m = getMeta();
if(m && m.uid){ user = {uid: m.uid, email: m.email || ""}; emit(); load().then(a => { if(!a.currentUser){ user = null; setMeta(null); emit(); } else firstSync(); }).catch(() => {}); }
})();
