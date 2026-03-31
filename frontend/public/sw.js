/**
 * Minimal service worker: satisfies installability fetch-handler requirement
 * without caching. Socket.IO is left to the browser (no respondWith).
 */
self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (url.pathname.startsWith('/socket.io')) {
    return
  }
  event.respondWith(fetch(event.request))
})
