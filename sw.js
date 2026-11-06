/* Math Facts service worker.
 *
 * There is ONE version number to bump on a deploy: APP_VERSION in index.html
 * (shown small on the start screen). CACHE below is not a release number and
 * no longer changes on every deploy.
 *
 * Why that is safe now: config.js and the HTML pages are network-first (with a
 * 2.5s cutoff to the cache), so a deploy reaches the phones on the very NEXT
 * open, and every successful fetch overwrites the cached copy. Icons and
 * manifests are cache-first but refreshed in the background, so they land on
 * the open after. Bumping CACHE was only ever needed when everything was
 * cache-first. It used to be cache-first across the board, which meant code
 * landed on the second open - a lag that repeatedly looked like a broken
 * deploy. Do not put the pages back to cache-first.
 *
 * Change CACHE only when THIS file's caching scheme changes (or to throw the
 * whole cache away). Any edit to this file installs a new worker anyway.
 */
const CACHE = 'mathfacts-v15';

const PRECACHE = [
  './',
  'index.html',
  'dashboard.html',
  'config.js',
  'manifest.webmanifest',
  'caleb.webmanifest',
  'ellie.webmanifest',
  'daniel.webmanifest',
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
  // no-store matters — GitHub Pages serves config.js with max-age=600, and
  // without this the browser's own HTTP cache can hand back a copy up to ten
  // minutes stale, which is long enough to look like a broken deploy.
  //
  // It gets the same 2.5s cutoff as the pages. config.js is a blocking
  // <script> in <head>, so on a stalled connection with no cutoff the page
  // stayed blank until the request finally failed — tens of seconds.
  if (url.pathname.endsWith('/config.js')) {
    event.respondWith(networkFirst(new Request(req.url, { cache: 'no-store' }), req));
    return;
  }

  // Page loads carry a ?student=... tag, which would otherwise miss the cache
  // and break offline. Cache every navigation under its bare path instead.
  const isPage = (req.mode === 'navigate') || /\.html$/.test(url.pathname);
  const key = (req.mode === 'navigate')
    ? new Request(url.origin + url.pathname)
    : req;

  // The pages themselves are network-first with a short timeout. Cache-first
  // meant a code change only ran on the SECOND open, which repeatedly looked
  // like a broken deploy - a dashboard setting would save fine and the phone
  // would carry on ignoring it. Online, you now always get the current app;
  // offline (or on a stalled connection) it falls straight back to the cache.
  if (isPage) {
    event.respondWith(networkFirst(req, key));
    return;
  }

  // Everything else (icons, manifests): cache-first, refresh in the background.
  event.respondWith(
    caches.match(key).then((hit) => {
      const net = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(key, copy));
          }
          return res;
        })
        .catch(() => hit);
      return hit || net;
    })
  );
});

/**
 * Network first, but give up on a slow network after 2.5s and use the cache.
 * Only a successful response is cached, and an error response (a 404 mid-
 * deploy, a 500) falls back to the cached copy rather than replacing it.
 */
function networkFirst(netReq, key) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (res) => { if (!settled) { settled = true; resolve(res); } };

    const timer = setTimeout(() => {
      caches.match(key).then((hit) => { if (hit) done(hit); });
    }, 2500);

    fetch(netReq)
      .then((res) => {
        clearTimeout(timer);
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(key, copy));
          done(res);
        } else {
          caches.match(key).then((hit) => done(hit || res));
        }
      })
      .catch(() => {
        clearTimeout(timer);
        caches.match(key).then((hit) => done(hit || Response.error()));
      });
  });
}
