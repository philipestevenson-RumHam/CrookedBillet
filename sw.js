// Crooked Billet Quiz – offline cache.
// Bump CACHE_VERSION to force everyone to drop old cached files.
const CACHE_VERSION = 'cb-quiz-v1';
const SHELL = ['./', './index.html', './RumHam.png'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => Promise.allSettled(SHELL.map(u => cache.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const isFresh = url =>
  url.origin === self.location.origin &&
  (url.pathname.endsWith('/') || /\/(index\.html|questions\.json|answers[^/]*\.json)$/.test(url.pathname));

async function networkFirst(request) {
  const cache = await caches.open(CACHE_VERSION);
  try {
    const res = await fetch(request, { cache: 'no-cache' });
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(request, { ignoreSearch: true });
    if (hit) return hit;
    if (request.mode === 'navigate') {
      const page = await cache.match('./index.html');
      if (page) return page;
    }
    throw err;
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_VERSION);
  const hit = await cache.match(request);
  const refresh = fetch(request)
    .then(res => {
      if (res.ok || res.type === 'opaque') cache.put(request, res.clone());
      return res;
    })
    .catch(() => null);
  return hit || (await refresh) || Response.error();
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  if (req.headers.has('range')) return;                          // video/audio seeking
  if (req.destination === 'video' || req.destination === 'audio') return;

  const url = new URL(req.url);
  if (!/^https?:$/.test(url.protocol)) return;

  event.respondWith(isFresh(url) ? networkFirst(req) : staleWhileRevalidate(req));
});
