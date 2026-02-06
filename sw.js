// sw.js  (PWA seguro para Firebase/Firestore)
const CACHE = "yukitas-pos-v3";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
];

// Instalación: cachea lo básico
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
});

// Activación: limpia caches viejos
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
});

// Fetch: NO cachear nada que no sea GET (Firestore usa POST/OPTIONS)
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") {
    e.respondWith(fetch(e.request));
    return;
  }

  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return cached;

      return fetch(e.request)
        .then((resp) => {
          // No cachear respuestas inválidas
          if (!resp || resp.status !== 200 || resp.type === "opaque") return resp;

          const copy = resp.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
          return resp;
        })
        .catch(() => caches.match("./index.html"));
    })
  );
});
async function syncCloud(){
  await window.cloud.save({
    stock: getStock(),
    clientes: getClientes(),
    recibos: getRecibos()
  });
}
