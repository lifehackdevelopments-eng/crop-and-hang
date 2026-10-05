/* Crop and Hang service worker.
   Page itself: network first, so you always get the newest version when online.
   Room photos, icons: cache first. Fonts: stale-while-revalidate. */
const VERSION = 'v23';
const CORE = 'cah-core-' + VERSION;
const RUNTIME = 'cah-runtime-' + VERSION;
const PRECACHE = [
  './index.html', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png',
  'rooms/desk.jpg', 'rooms/r0.jpg', 'rooms/r1.jpg', 'rooms/r2.jpg', 'rooms/r3.jpg', 'rooms/r4.jpg', 'rooms/r5.jpg'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CORE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CORE && k !== RUNTIME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // The page: network first, fall back to cache when offline.
  if (url.origin === location.origin && (req.mode === 'navigate' || url.pathname.endsWith('/index.html'))) {
    e.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CORE).then((c) => c.put('./index.html', copy));
        return res;
      }).catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Our own files (rooms, icons, manifest): cache first.
  if (url.origin === location.origin && url.pathname.startsWith('/app/')) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CORE).then((c) => c.put(req, copy));
        return res;
      }))
    );
    return;
  }

  // Google Fonts: serve cached, refresh in background.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(
      caches.open(RUNTIME).then((c) => c.match(req).then((hit) => {
        const net = fetch(req).then((res) => { c.put(req, res.clone()); return res; }).catch(() => hit);
        return hit || net;
      }))
    );
  }
});
