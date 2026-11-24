// Service worker: lets the game run with no network after the first visit.
//
// This is a template. The `serviceWorker` plugin in vite.config.ts fills in the version and the list
// of built files (see src/pwa/precache.ts) and writes dist/sw.js. Plain JS, no dependencies.
//
// - install: download every built file into a cache named after this version.
// - It does NOT call skipWaiting() by itself. A new version waits until the page asks for it
//   (the kid taps "New version ready" on the home screen, or at the next launch before they touch
//   anything), so the game never changes under a kid mid-session.
// - activate: delete older versions' caches, take control of open pages.
// - fetch: precached files come from the cache (falling back to the network); page loads get the
//   cached page (index.html) of this same version, so the HTML always matches its assets. Anything else
//   goes straight to the network untouched.

const VERSION = self.__SW_VERSION__;
const PRECACHE = self.__SW_PRECACHE__;
const PREFIX = 'nrp-precache-';
const CACHE = PREFIX + VERSION;

const toUrl = (path) => new URL(path, self.registration.scope).href;
const SCOPE = toUrl('./'); // the page itself (precached as "./": Pages redirects /index.html → /)
const INDEX = toUrl('index.html');
const PRECACHED = new Set(PRECACHE.map(toUrl));

/** Fetch one file into the cache. Any failure fails the install, and the old version stays. */
async function precache(cache, path) {
  // cache: 'reload' skips the HTTP cache, so we never precache a stale file.
  const res = await fetch(new Request(toUrl(path), { cache: 'reload' }));
  if (!res.ok) throw new Error(`precache ${path}: HTTP ${res.status}`);
  // Browsers refuse a redirected response as the answer to a page load, so store a clean copy.
  const clean = res.redirected ? new Response(await res.blob(), { status: res.status, statusText: res.statusText, headers: res.headers }) : res;
  await cache.put(toUrl(path), clean);
}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => Promise.all(PRECACHE.map((p) => precache(cache, p)))));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith(PREFIX) && key !== CACHE) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

/** The cached copy of `url` from this version, else the network. */
async function cachedOrNetwork(url, request) {
  try {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(url);
    if (hit) return hit;
  } catch {
    // Cache storage unavailable or evicted: fall through to the network.
  }
  return fetch(request);
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  url.hash = '';
  const bare = url.origin + url.pathname; // ignore ?debug and the like

  if (request.mode === 'navigate') {
    if (bare === SCOPE || bare === INDEX) event.respondWith(cachedOrNetwork(SCOPE, request));
    return;
  }
  if (PRECACHED.has(bare)) event.respondWith(cachedOrNetwork(bare, request));
});
