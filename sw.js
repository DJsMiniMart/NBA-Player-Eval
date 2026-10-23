/* Service worker: makes the site installable as an app and keeps it working offline.
   Network first for everything (so updates show up right away); the saved copy is only used
   when there's no connection. Bump VERSION to clear old saved copies. */
const VERSION = "fcgp-v1";
self.addEventListener("install", e => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil((async () => {
  for(const k of await caches.keys()) if(k !== VERSION) await caches.delete(k);
  await self.clients.claim();
})()));
self.addEventListener("fetch", e => {
  const req = e.request;
  if(req.method !== "GET" || new URL(req.url).origin !== location.origin) return;   // logos, fonts, ESPN: browser handles them
  e.respondWith((async () => {
    const key = req.url.replace(/[?&]t=\d+/, "");       // pages add ?t=<time> to skip the browser cache; save one copy per file
    try{
      const res = await fetch(req);
      if(res.ok){ const c = await caches.open(VERSION); c.put(key, res.clone()); }
      return res;
    }catch(err){
      const hit = await caches.match(key) || (req.mode === "navigate" && await caches.match(new URL("./", location).href));
      if(hit) return hit;
      throw err;
    }
  })());
});
