const CACHE = "callot-v1";
const SHELL = [
  "./",
  "./css/style.css",
  "./js/script.js",
  "./icons/moon.svg",
  "./icons/sun.svg",
  "./icons/github.svg",
  "./icons/coffee.svg",
  "./icons/icon.svg",
  "./manifest.json",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  // Network-first for API calls so data is always fresh; cache-first for shell
  if (e.request.url.includes("api.cybai.re") || e.request.url.includes("fonts.")) {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
  } else {
    e.respondWith(
      caches.match(e.request).then((cached) => cached || fetch(e.request))
    );
  }
});
