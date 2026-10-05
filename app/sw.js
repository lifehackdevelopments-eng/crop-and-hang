/* Crop and Hang service worker.
   The page: opens instantly from the saved copy, then quietly checks for a newer one (you get it next time you open the app).
   Fonts, room photos, icons: saved on first use, cache first. */
const VERSION = 'v24';
const CORE = 'cah-core-' + VERSION;
const MUST = [
  './index.html', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png',
  'fonts/anton-latin.woff2', 'fonts/source-sans-3-latin.woff2'
];
const NICE = ['rooms/desk.jpg', 'rooms/r0.jpg', 'rooms/r1.jpg', 'rooms/r2.jpg', 'rooms/r3.jpg', 'rooms/r4.jpg', 'rooms/r5.jpg'];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CORE);
    await c.addAll(MUST);                                   // the app itself must be saved for it to install
    await Promise.all(NICE.map((u) => c.add(u).catch(() => {})));   // room photos are a bonus: never fail the install over one
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CORE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // The page: show the saved copy straight away, refresh it in the background.
  if (req.mode === 'navigate' || url.pathname.endsWith('/index.html')) {
    e.respondWith((async () => {
      const c = await caches.open(CORE);
      const hit = await c.match('./index.html');
      const net = fetch(req).then(async (res) => {
        if (res && res.ok) {
          const old = hit && hit.headers.get('content-length');
          await c.put('./index.html', res.clone());
          if (hit && old && res.headers.get('content-length') && old !== res.headers.get('content-length')) {
            (await self.clients.matchAll()).forEach((cl) => cl.postMessage('updated'));
          }
        }
        return res;
      });
      if (hit) { e.waitUntil(net.catch(() => {})); return hit; }
      return net.catch(() => caches.match('./index.html'));
    })());
    return;
  }

  // Our own files (fonts, rooms, icons, manifest): cache first.
  if (url.pathname.startsWith('/app/')) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res && res.ok) { const copy = res.clone(); caches.open(CORE).then((c) => c.put(req, copy)); }
        return res;
      }))
    );
  }
});
