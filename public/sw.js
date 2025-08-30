// Service Worker for SunSetter PWA

const CACHE_NAME = 'sunsetter-pwa-v1';
const URLS_TO_CACHE = [
  '/SunSetter/',
  '/SunSetter/index.html',
  '/SunSetter/assets/main.js', // Vite compiled output
  '/SunSetter/manifest.json',
  '/SunSetter/icons/icon-192x192.png',
  '/SunSetter/icons/icon-512x512.png',
  '/SunSetter/icons/icon.svg'
];

self.addEventListener('install', (event) => {
  console.log('Service Worker: Install event');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Service Worker: Caching app shell');
        return cache.addAll(URLS_TO_CACHE);
      })
  );
  
  // Activate immediately
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activate event');
  
  event.waitUntil(
    caches.keys()
      .then((keyList) => {
        return Promise.all(
          keyList.map((key) => {
            if (key !== CACHE_NAME) {
              console.log('Service Worker: Removing old cache ', key);
              return caches.delete(key);
            }
          })
        );
      })
  );
  
  // Take control of all pages
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Return from cache if available
        if (response) {
          console.log('Service Worker: Hitting cache for ', event.request.url);
          return response;
        }
        
        // Fallback to network
        console.log('Service Worker: Fetching from network for ', event.request.url);
        return fetch(event.request)
          .then((networkResponse) => {
            // Cache new resources dynamically
            if (networkResponse.status === 200) {
              const responseClone = networkResponse.clone();
              caches.open(CACHE_NAME)
                .then((cache) => {
                  cache.put(event.request, responseClone);
                });
            }
            return networkResponse;
          });
      })
  );
});

// Periodic background sync for sun position updates (optional)
self.addEventListener('sync', (event) => {
  if (event.tag === 'sunsetter-sync') {
    console.log('Service Worker: Background sync for sun updates');
    // Add background sun position updates here if needed
  }
});
