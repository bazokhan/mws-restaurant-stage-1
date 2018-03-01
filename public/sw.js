const currentStaticCache = 'rr-static-v01';
const currentImageCache = 'rr-images-v01';
const currentCaches = [
  currentStaticCache,
  currentImageCache
]
const urlsToCache = [
  '/manifest.json',
  '/icons/favicon-16x16.png',
  '/icons/favicon-32x32.png',
  '/index.html',
  '/restaurant.html',
  '/js/dbhelper.js',
  '/js/main.js',
  '/js/restaurant_info.js',
  '/css/styles-base.css',
  '/css/styles-media-query.css',
  '/data/restaurants.json'
]

/**
 * Cache static assets
 */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(currentStaticCache)
      .then(cache => {
        return cache.addAll(urlsToCache)
      })
  );
});

/**
 * Delete old caches
 */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(cacheNames
          .filter(cacheName => !currentCaches.includes(cacheName))
          .map(cacheToDelete => caches.delete(cacheToDelete))
        )
      })
  );
})

/**
 * Respond to requests from cache first
 */
self.addEventListener('fetch', (event) => {

  const url = new URL(event.request.url);

  if (url.origin === location.origin) {

    // If home page is requested
    if (url.pathname === '/') {
      event.respondWith(getStaticCache('/index.html'));
    }

    // If restaurant page is requested
    else if (url.pathname === '/restaurant.html') {
      event.respondWith(getStaticCache('/restaurant.html'));
    }

    // If an image is requested
    else if (url.pathname.endsWith('.jpg')) {
      event.respondWith(getCachedImage(event.request.url));
    }

    else event.respondWith(getStaticCache(event.request));
  }
});

// Static assets
getStaticCache = (url) => {
  return caches.match(url)
    .then(response => {
      return response || fetch(url);
    })
    .catch(err => {
      if(err) {
        const res = new Response();
        res.headers = {'Content-Type': 'text/html'};
        res.body = '<h1>Error! Requested asset is neither in cache nor can be fetched!</h1>';
        return res;
      }
    })
}

// Images
getCachedImage = (url) => {

  // Remove size and extension from image url
  const storageUrl = url.replace(/-\d+\.jpg/,'');

  return caches.open(currentImageCache)
    .then(cache => {
      return cache.match(storageUrl)
        .then(image => {
          if (image) return image;
          return fetch(url)
            .then(fetchedImage => {
              cache.put(storageUrl, fetchedImage.clone());
              return fetchedImage;
            })
        })
    })
}

/**
 * Waiting SW takes control
 */
self.addEventListener('message', (event) => {
  if (event.data.action === 'skipWaiting') {
    self.skipWaiting();
  }
});
