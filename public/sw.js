// Resonate Service Worker for Mobile PWA Background Audio & Offline caching
const CACHE_NAME = "resonate-v1";
const ASSETS = [
  "/",
  "/index.html",
  "/manifest.json",
  "/spotify.png",
  "/logo192.png",
  "/logo512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
          return null;
        })
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  // Network first, fallback to cache for offline support
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
