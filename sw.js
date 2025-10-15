self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(ASSETS.filter(Boolean)).catch(()=>{})));
});

self.addEventListener('activate', (e) => {
  clients.claim();
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
    return;
  }
  const url = new URL(e.request.url);
  if (url.origin === location.origin) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        const fetchPromise = fetch(e.request).then(res => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, copy)).catch(()=>{});
          return res;
        }).catch(()=>cached);
        return cached || fetchPromise;
      })
    );
  } else {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
  }
});

const CACHE_NAME = 'cf-static-v1';
const ASSETS = [
  '/', '/index.html', '/dashboard.html',
  '/styles.css', '/components.css', '/animations.css', '/responsive.css',
  '/dashboard.css', '/dashboard-marketplace.css', '/dashboard-analytics.css', '/dashboard-extras.css',
  '/app.js', '/dashboard.js', '/dashboard-core.js', '/news.js', '/ai.js', '/wallet.js',
  '/content-studio.js', '/seo-checker.js', '/marketplace.js', '/analytics.js', '/collaboration.js'
];