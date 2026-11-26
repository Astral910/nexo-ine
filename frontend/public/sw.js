// Service worker del catálogo de campo: guarda la aplicación para abrir /campo sin conexión.
// Los datos del catálogo los guarda la propia página en el dispositivo; la API nunca se guarda aquí.
const CACHE = "nexo-campo-v1";
const BASICOS = ["/campo", "/manifest.webmanifest", "/favicon.svg", "/iconos/icono-192.png", "/iconos/icono-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(BASICOS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// La página avisa qué archivos de /assets/ ya cargó, para tenerlos disponibles sin conexión.
self.addEventListener("message", (e) => {
  if (e.data?.tipo !== "precargar" || !Array.isArray(e.data.urls)) return;
  const urls = e.data.urls.filter((u) => new URL(u, self.location.origin).pathname.startsWith("/assets/"));
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(urls)).catch(() => {}));
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  if (req.mode === "navigate") {
    if (url.pathname !== "/campo") return;
    e.respondWith(fetch(req).then((r) => {
      const copia = r.clone();
      caches.open(CACHE).then((c) => c.put("/campo", copia));
      return r;
    }).catch(() => caches.match("/campo")));
    return;
  }
  if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/iconos/")) {
    e.respondWith(caches.match(req).then((g) => g || fetch(req).then((r) => {
      const copia = r.clone();
      caches.open(CACHE).then((c) => c.put(req, copia));
      return r;
    })));
  }
});
