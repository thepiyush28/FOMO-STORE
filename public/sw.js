const CACHE_NAME = 'fomo-store-shell-v2';
const SHELL_ASSETS = ['/', '/index.html', '/manifest.webmanifest', '/brand/logo.jpeg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  // Never intercept or cache authenticated requests or API key requests
  if (request.headers.has('Authorization') || request.headers.has('apikey')) return;

  const url = new URL(request.url);
  // Never cache Supabase API, Auth, Storage, Realtime, or cross-origin requests
  if (url.origin !== self.location.origin) return;
  if (
    url.pathname.startsWith('/rest/') ||
    url.pathname.startsWith('/auth/') ||
    url.pathname.startsWith('/rpc/') ||
    url.pathname.startsWith('/storage/') ||
    url.pathname.startsWith('/realtime/')
  ) {
    return;
  }

  // Network-first for HTML navigation requests so SPA routes (/admin, /rider) stay fresh
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request))
  );
});
