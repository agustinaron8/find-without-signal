/// <reference lib="webworker" />
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';
import { MAP_CACHE_NAME, MAP_TILE_HOST } from './config';

declare const self: ServiceWorkerGlobalScope;

// Take control on first install, so a map downloaded right away already works offline.
clientsClaim();

// Only touches Workbox's own precaches, so the map cache survives app updates.
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')));

// The downloader uses `cache: 'reload'` to get fresh copies and stores them itself.
registerRoute(
  ({ url, request }) => url.hostname === MAP_TILE_HOST && request.cache !== 'reload',
  new CacheFirst({
    cacheName: MAP_CACHE_NAME,
    matchOptions: { ignoreVary: true },
    plugins: [new CacheableResponsePlugin({ statuses: [200] })],
  }),
);

// The update toast triggers this, so an update never interrupts Meet mode.
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
