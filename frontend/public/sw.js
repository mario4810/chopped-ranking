// Chopped Scanner service worker
// Strategy:
//  - precache the app shell on install
//  - network-first for HTML/navigations (so updates ship fast)
//  - stale-while-revalidate for static assets
//  - never cache /rate or /health (API calls)

const VERSION = 'chopped-v1';
const SHELL_CACHE = `${VERSION}-shell`;
const RUNTIME_CACHE = `${VERSION}-runtime`;
const SHELL_URLS = ['/', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting())
      .catch(() => undefined),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => !k.startsWith(VERSION))
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

const isApiRequest = (url) => /\/(rate|health|docs|openapi\.json)/.test(url.pathname);

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (isApiRequest(url)) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(SHELL_CACHE);
          cache.put('/', fresh.clone()).catch(() => {});
          return fresh;
        } catch {
          const cached = await caches.match('/');
          return cached || Response.error();
        }
      })(),
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(RUNTIME_CACHE);
      const cached = await cache.match(req);
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            cache.put(req, res.clone()).catch(() => {});
          }
          return res;
        })
        .catch(() => undefined);
      return cached || (await network) || Response.error();
    })(),
  );
});
