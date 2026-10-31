/* TerraTone service worker — app-shell + dataset cache.
 * Versioned cache so updates activate cleanly; expired entries are purged.
 * No remote server is required for playback, visualization, or sonification. */
const APP_SHELL = 'terratone-shell-v6';
const DATA_CACHE = 'terratone-data-v3';
const SHELL_ASSETS = [
  '/', '/index.html', '/manifest.webmanifest', '/favicon.ico',
  '/icons/logo.png', '/icons/icon-192.png', '/icons/icon-512.png',
  '/intro/earth-day.jpg', '/intro/earth-clouds.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_SHELL).then((cache) => cache.addAll(SHELL_ASSETS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== APP_SHELL && k !== DATA_CACHE).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  );
});

// Network-first for navigations (fallback to cached shell offline),
// cache-first for GET data/assets with network update in background.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).then((res) => {
        const copy = res.clone();
        caches.open(APP_SHELL).then((c) => c.put('/index.html', copy));
        return res;
      }).catch(() => caches.match('/index.html').then((r) => r || caches.match('/'))),
    );
    return;
  }
  // Same-origin build assets (JS/CSS chunks incl. the lazy 3D simulator):
  // stale-while-revalidate so the tornado module works offline after first visit.
  if (url.origin === self.location.origin && url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then((hit) => {
        const update = fetch(request).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(APP_SHELL).then((c) => c.put(request, copy));
          }
          return res;
        }).catch(() => hit);
        return hit || update;
      }),
    );
    return;
  }
  if (url.origin === self.location.origin && (url.pathname.startsWith('/datasets/') || url.pathname.startsWith('/icons/'))) {
    event.respondWith(
      caches.match(request).then((hit) => {
        const update = fetch(request).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(DATA_CACHE).then((c) => c.put(request, copy));
          }
          return res;
        }).catch(() => hit);
        return hit || update;
      }),
    );
  }
});
