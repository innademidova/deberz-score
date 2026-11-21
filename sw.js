// Офлайн: кладём весь сайт в кеш при установке, дальше отдаём из кеша.
const VERSION = 'deberz-v3';
const FILES = [
  './', './index.html', './style.css', './app.js', './scoring.js', './store.js',
  './manifest.webmanifest', './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png',
  './icons/icon-maskable-512.png', './icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((hit) => {
      if (hit) {
        // тихо обновляем кеш в фоне, если есть сеть
        fetch(e.request).then((r) => { if (r.ok) caches.open(VERSION).then((c) => c.put(e.request, r)); }).catch(() => {});
        return hit;
      }
      return fetch(e.request).catch(() => caches.match('./index.html'));
    }),
  );
});
