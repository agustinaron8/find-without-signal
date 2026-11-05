/// <reference lib="webworker" />
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';
import { MAP_CACHE_NAME } from './config';

declare const self: ServiceWorkerGlobalScope;

// Only touches Workbox's own precaches, so the map cache survives app updates.
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')));

registerRoute(
  ({ url }) => url.hostname === 'tiles.openfreemap.org',
  new CacheFirst({
    cacheName: MAP_CACHE_NAME,
    plugins: [new CacheableResponsePlugin({ statuses: [200] })],
  }),
);

// The update toast triggers this, so an update never interrupts Meet mode.
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
