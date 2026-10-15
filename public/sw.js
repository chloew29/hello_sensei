// Offline shell cache. Bump VERSION whenever you change files in /public.
const VERSION = 'sb-v12';
const SHELL = [
  './', 'index.html', 'styles.css', 'app.js', 'gemini.js', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png',
  'assets/kit_open.png', 'assets/kit_closed.png', 'assets/hana_idle.jpg', 'assets/hana_hero.jpg',
  'assets/hana_step1.mp4', 'assets/hana_step2.mp4', 'assets/hana_step3.mp4', 'assets/hana_step4.mp4'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.pathname.startsWith('/api/') || url.origin !== location.origin) return;
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      if (res.ok && !url.pathname.endsWith('.mp4')) {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(e.request, copy));
      }
      return res;
    }))
  );
});
