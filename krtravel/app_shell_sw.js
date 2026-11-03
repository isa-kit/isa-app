// isan app-shell offline worker.
//
// WHY THIS FILE EXISTS: Flutter 3.44 deprecated its own caching service
// worker. The one `flutter build web` now generates
// (flutter_service_worker.js) is a self-unregistering TOMBSTONE — it caches
// nothing and actively unregisters itself on activate (confirmed by reading
// the generated file; see also flutter/flutter#156910). That is correct for
// Flutter's own freshness goals, but it left this app with ZERO offline
// capability: with no network, the very first navigation to the app fails
// before Flutter or any Dart code ever runs, so cached wikipick articles
// (stored locally in IndexedDB, already device-local) were unreachable
// because the app SHELL around them never booted. This file is a small,
// hand-rolled replacement scoped ONLY to that gap.
//
// STRATEGY — network-first, cache-as-you-go, no manifest/versioning:
//   - online:  always fetch the network and return it (so an online visitor
//              never sees stale content — this app's standing "deliberate
//              update, no silent staleness" stance holds exactly as before;
//              the in-app build_info/Reload-prompt flow is untouched and
//              still the source of truth for "a new version is ready").
//              Every successful GET response is written into one rolling
//              cache as a side effect.
//   - offline: fall back to whatever was last cached for that exact request;
//              a navigation request additionally falls back to the cached
//              app shell (index.html) if the exact URL was never cached, so
//              a deep link still boots the app offline.
// "Works offline" is therefore a byproduct of "was opened once online" —
// exactly the product promise (one online visit → offline boot after that).
//
// Deliberately excluded from caching: the app's own freshness probes
// (build_info.json / release_notes.json) already cache-bust themselves and
// must always reflect live truth when reachable — caching them here would
// fight that, not help it.
'use strict';

const CACHE = 'isan-app-shell-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  if (req.url.indexOf('build_info.json') !== -1 ||
      req.url.indexOf('release_notes.json') !== -1) {
    return;
  }
  event.respondWith(networkFirst(req));
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const fresh = await fetch(req);
    // Cache successful responses (opaque cross-origin CDN responses included
    // — e.g. maplibre-gl/canvaskit — `ok` reads true for opaque, this is the
    // normal no-cors caching pattern for third-party script/style/wasm).
    if (fresh && (fresh.ok || fresh.type === 'opaque')) {
      cache.put(req, fresh.clone());
    }
    return fresh;
  } catch (err) {
    const cached = await cache.match(req);
    if (cached) return cached;
    if (req.mode === 'navigate') {
      const shell = await cache.match(new Request(self.registration.scope));
      if (shell) return shell;
      const indexFallback = await cache.match(
        new URL('index.html', self.registration.scope).toString());
      if (indexFallback) return indexFallback;
    }
    throw err;
  }
}
