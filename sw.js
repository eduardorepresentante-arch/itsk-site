/* Guarda o básico do site para abrir rápido e funcionar sem internet.
   Peças e fotos do painel (/api, /fotos) sempre vêm da internet primeiro. */
const VERSAO = "itsk-v6";
const BASICO = ["./", "index.html", "estilo.css", "loja.js", "dados.js", "img/icone.svg", "img/itsk-fundo-poster.jpg"];
self.addEventListener("install", e => { e.waitUntil(caches.open(VERSAO).then(c => c.addAll(BASICO))); self.skipWaiting(); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSAO).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin || u.pathname.startsWith("/api/") || u.pathname.startsWith("/admin") || e.request.headers.has("range")) return;
  // rede primeiro; sem internet, usa a cópia guardada
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok && r.type === "basic" && !u.pathname.startsWith("/video/")) { const c = r.clone(); caches.open(VERSAO).then(x => x.put(e.request, c)); }
    return r;
  }).catch(() => caches.match(e.request).then(r => r || caches.match("index.html"))));
});
