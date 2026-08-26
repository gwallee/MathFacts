/* Math Facts service worker.
 *
 * Bump CACHE on every deploy that changes any cached file - that is the
 * only cache-busting mechanism here (same rule as Palabritas).
 *
 * config.js is network-first, so editing settings on github.com reaches the
 * phones on the very next open. Everything else is cache-first with a
 * background refresh, which means code changes land on the SECOND open.
 * That lag is normal; remember it when testing.
 */
const CACHE = 'mathfacts-v1';

const PRECACHE = [
  './',
  'index.html',
  'dashboard.html',
  'config.js',
  'manifest.webmanifest',
  'icon-192.png',
  'icon-512.png',
  'apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      Promise.all(PRECACHE.map((url) =>
        // no-cache so a redeploy never precaches a stale HTTP-cached copy
        fetch(new Request(url, { cache: 'no-cache' }))
          .then((res) => (res.ok ? cache.put(url, res) : null))
          .catch(() => null)
      ))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Never touch the Apps Script calls - scores and dashboard data must
  // always go to the network, and must never be served from a cache.
  if (url.origin !== self.location.origin) return;

  // Settings: network-first so an edit to config.js applies immediately.
  if (url.pathname.endsWith('/config.js')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // Everything else: cache-first, refresh in the background.
  event.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => hit);
      return hit || net;
    })
  );
});
