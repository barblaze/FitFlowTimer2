const CACHE = 'fitflow-pwa-v6';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/app.js',
  './js/store.js',
  './js/wake.js',
  './js/core/model.js',
  './js/core/planner.js',
  './js/core/engine.js',
  './js/core/format.js',
  './js/audio/beep.js',
  './js/audio/coach.js',
  './js/vendor/stb-vorbis.js',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon-192-maskable.png',
  './assets/icons/icon-512-maskable.png',
  './assets/icons/apple-touch-icon.png',
  './assets/coach/entrenador/work_started.ogg',
  './assets/coach/entrenador/halftime.ogg',
  './assets/coach/entrenador/rest_started.ogg',
  './assets/coach/entrenador/session_finished.ogg',
  './assets/coach/flaite/work_started.ogg',
  './assets/coach/flaite/rest_started.ogg',
  './assets/coach/flaite/session_finished.ogg',
  './assets/coach/normal/work_started.ogg',
  './assets/coach/normal/halftime.ogg',
  './assets/coach/normal/rest_started.ogg',
  './assets/coach/normal/session_finished.ogg',
  './assets/coach/memes/work_started.mp3'
];
const NETWORK_TIMEOUT_MS = 3500;
const PRECACHE_TIMEOUT_MS = 8000;
const scopeUrl = (path) => new URL(path, self.registration.scope).href;

async function precache() {
  const cache = await caches.open(CACHE);
  await Promise.all(SHELL.map(async (path) => {
    const url = scopeUrl(path);
    try {
      const response = await fetchWithTimeout(new Request(url, { cache: 'reload' }), PRECACHE_TIMEOUT_MS);
      if (response && response.ok) await cache.put(url, response);
    } catch {}
  }));
}

function fetchWithTimeout(request, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(request, { signal: controller.signal }).finally(() => clearTimeout(timer));
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  let response = null;
  try {
    response = await fetchWithTimeout(request, NETWORK_TIMEOUT_MS);
    if (response && response.ok) {
      await cache.put(request, response.clone());
      return response;
    }
  } catch {}
  return (await cache.match(request)) || (await cache.match(scopeUrl('./index.html'))) || response || Response.error();
}

function staleWhileRevalidate(event, request) {
  return caches.open(CACHE).then(async (cache) => {
    const cached = await cache.match(request);
    const network = fetch(request).then((response) => {
      if (response && response.ok) cache.put(request, response.clone());
      return response;
    }).catch(() => cached || Response.error());
    event.waitUntil(network.catch(() => {}));
    return cached || network;
  });
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    return Response.error();
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }
  if (url.pathname.includes('/assets/coach/') || url.pathname.includes('/assets/icons/')) {
    event.respondWith(cacheFirst(request));
    return;
  }
  if (url.pathname.endsWith('.js') || url.pathname.endsWith('.css') || url.pathname.endsWith('.webmanifest')) {
    event.respondWith(staleWhileRevalidate(event, request));
    return;
  }
  event.respondWith(cacheFirst(request));
});
