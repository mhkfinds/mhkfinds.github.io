/* ================================================
   MHKFINDS - SERVICE WORKER
   Bump CACHE_NAME version whenever you push new code
   ================================================ */

const CACHE_NAME = 'mhkfinds-v10';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/script.js',
  '/Logo.png',
  '/manifest.json'
];

// ── INSTALL: cache all static assets ──────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// ── ACTIVATE: delete old cache versions ───────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// ── FETCH: tiered caching strategy ────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Google Sheets CSV → network first, cache fallback (keep deals fresh)
  if (url.hostname === 'docs.google.com') {
    event.respondWith(networkFirst(request));
    return;
  }

  // HTML navigation → network first, fallback to cached index.html
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          updateCache(request, response.clone());
          return response;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Static assets (CSS, JS, images) → cache first, network fallback
  event.respondWith(cacheFirst(request));
});

// ── Helpers ───────────────────────────────────────────────────────────────────
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    updateCache(request, response.clone());
    return response;
  } catch {
    return caches.match(request);
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) updateCache(request, response.clone());
    return response;
  } catch {
    return new Response('Offline', { status: 503 });
  }
}

function updateCache(request, response) {
  caches.open(CACHE_NAME).then(cache => cache.put(request, response));
}
