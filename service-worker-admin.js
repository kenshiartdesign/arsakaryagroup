const CACHE_NAME = 'arsa-admin-shell-v2';
const SHELL_ASSETS = [
  './admin-install.html',
  './manifest-admin.json'
];

// Install: cache shell saja (JANGAN cache GAS - cross-origin)
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS))
  );
  self.skipWaiting();
});

// Activate: hapus cache lama
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: network-first untuk shell, GAS dilewati
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Jangan intercept request GAS (biarkan iframe handle sendiri)
  if (url.hostname.includes('script.google.com') ||
      url.hostname.includes('googleusercontent.com')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) =>
        cached || caches.match('./admin-install.html')
      ))
  );
});
