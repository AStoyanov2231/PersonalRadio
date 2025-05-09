const CACHE_NAME = 'radio-app-v7';

// Define paths to cache - using relative paths for better compatibility
const urlsToCache = [
  './', // current directory (relative path)
  'index.html',
  'script.js',
  'styles/main.css',
  'styles/base.css',
  'styles/filters.css',
  'styles/lists.css',
  'styles/messages.css',
  'styles/navigation.css',
  'styles/player.css',
  'styles/responsive.css',
  'styles/search.css',
  'styles/views.css',
  'manifest.json',
  'offline.html',
  'icons/icon-192x192.png',
  'icons/icon-512x512.png'
];

// Install event - cache initial assets
self.addEventListener('install', event => {
  // Force the waiting service worker to become the active service worker
  self.skipWaiting();
  
  console.log('Service Worker installing - caching files for offline use');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Cache opened, adding files:', urlsToCache);
        // Cache all the files
        return cache.addAll(urlsToCache);
      })
      .catch(error => {
        console.error('Error during cache.addAll():', error);
      })
  );
});

// Helper function to normalize URLs
function normalizeUrl(url) {
  // Remove query parameters and hash
  return url.split('?')[0].split('#')[0];
}

// Fetch event - serve from cache, fall back to network, show offline page if both fail
self.addEventListener('fetch', event => {
  // For API requests that aren't to be cached (like the ping endpoint)
  if (event.request.url.includes('/ping')) {
    event.respondWith(
      fetch(event.request).catch(error => {
        console.log('Ping request failed - server offline');
        return new Response(JSON.stringify({ status: 'offline' }), {
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
          }
          
  // For HTML navigation requests
  if (event.request.mode === 'navigate' || 
      (event.request.method === 'GET' && 
       event.request.headers.get('accept')?.includes('text/html'))) {
    
    event.respondWith(
      fetch(event.request)
            .catch(() => {
          // Try to get the index.html from cache
          return caches.match('index.html')
            .then(cachedResponse => {
              if (cachedResponse) {
                console.log('Serving index.html from cache for offline navigation');
                return cachedResponse;
              }
              
              // If index.html isn't in cache, serve the offline.html
              console.log('No cached index.html, serving offline page');
              return caches.match('offline.html');
            });
        })
    );
    return;
  }
  
  // For all other requests (CSS, JS, images, etc.)
  event.respondWith(
    // Try the cache first - normalize URL for better cache hits
    caches.match(normalizeUrl(event.request.url))
      .then(cachedResponse => {
        // Return cached response if found
        if (cachedResponse) {
          console.log('Cache hit for:', event.request.url);
          return cachedResponse;
        }
        
        // Try cache again with the request object
        return caches.match(event.request)
          .then(cachedRequestResponse => {
            if (cachedRequestResponse) {
              console.log('Cache hit with request object for:', event.request.url);
              return cachedRequestResponse;
        }
        
        // No cache hit - try to fetch from network
        return fetch(event.request.clone())
          .then(networkResponse => {
            // Check if we received a valid response
                if (!networkResponse || networkResponse.status !== 200) {
              return networkResponse;
            }
            
            // Clone the response
            const responseToCache = networkResponse.clone();
            
                // Cache the fetched response for future use
            caches.open(CACHE_NAME)
              .then(cache => {
                console.log('Caching network response for:', event.request.url);
                cache.put(event.request, responseToCache);
              });
            
            return networkResponse;
          })
          .catch(error => {
            console.error('Fetch failed:', error);
                
                // Extract the filename from the URL
                const url = new URL(event.request.url);
                const pathname = url.pathname;
                const filename = pathname.substring(pathname.lastIndexOf('/') + 1);
            
            // For CSS files, try to serve a default if available
                if (pathname.endsWith('.css')) {
                  console.log('CSS file fetch failed, trying cache again');
              return caches.match('styles/main.css');
            }
            
            // For images, serve a placeholder if available
            if (event.request.destination === 'image') {
              console.log('Image fetch failed, serving placeholder');
              return caches.match('icons/icon-192x192.png');
            }
            
            // For scripts, serve a fall-through response
            if (event.request.destination === 'script') {
                  console.log('Script fetch failed, serving empty script');
              return new Response('console.log("Failed to load script: Offline mode");', {
                headers: { 'Content-Type': 'application/javascript' }
              });
            }
            
            // Otherwise just propagate the error
            throw error;
              });
          });
      })
  );
});

// Activate event - clean up old caches and take control immediately
self.addEventListener('activate', event => {
  console.log('Service Worker activating');
  
  // Take control of all clients immediately
  event.waitUntil(self.clients.claim());
  
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      console.log('Found caches:', cacheNames);
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Message event - handle messages from clients
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
}); 