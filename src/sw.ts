// Script and stylesheet names are content-hashed, so only the fixed-name files are precached.
const cacheName = 'epay-admin-v4'
const shell = ['/', '/manifest.json']

self.addEventListener('install', event => {
	;(event as ExtendableEvent).waitUntil(caches.open(cacheName).then(cache => cache.addAll(shell)))
})

self.addEventListener('activate', event => {
	;(event as ExtendableEvent).waitUntil(
		caches.keys().then(keys => Promise.all(keys.filter(key => key !== cacheName).map(key => caches.delete(key))))
	)
})

self.addEventListener('fetch', event => {
	const request = (event as FetchEvent).request
	if (request.method !== 'GET' || new URL(request.url).pathname.startsWith('/admin/api/')) return

	;(event as FetchEvent).respondWith(
		fetch(request).catch(() => caches.match(request).then(response => response ?? caches.match('/')) as Promise<Response>)
	)
})
