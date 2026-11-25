/* Kids Learning Arcade — service worker (offline support)
   HTML: network-first (fresh when online, cached when offline).
   Assets (icons, manifest): cache-first.
   Bump CACHE when you add a game or change SW logic. */
var CACHE = 'family-arcade-v1';
var SHELL = [
  './', './index.html', './manifest.json', './arcade-tv.js',
  './icon-192.png', './icon-512.png', './icon-180.png',
  './david/index.html',
  './number-stackers/index.html',
  './sound-pop/index.html',
  './flip-find/index.html',
  './pattern-party/index.html',
  './trace-stars/index.html',
  './clock-coins/index.html',
  './wild-world/index.html',
  './world-hop/index.html',
  './tap-a-tune/index.html',
  './story-spinner/index.html',
  './brain-buddies/index.html',
  './feelings-friends/index.html',
  './type-quest/index.html',
  './type-quest/words/faith.json',
  './type-quest/words/family.json',
  './type-quest/words/history.json',
  './type-quest/words/arts.json',
  './type-quest/words/maths.json',
  './type-quest/words/english.json',
  './type-quest/words/comprehension.json'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) { return Promise.all(SHELL.map(function (u) { return c.add(u).catch(function () {}); })); })
      .then(function () { return self.skipWaiting(); })
      .catch(function () {})
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) { if (k !== CACHE) return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var isDoc = req.mode === 'navigate' || req.destination === 'document';

  if (isDoc) {
    e.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
        return res;
      }).catch(function () {
        return caches.match(req).then(function (r) { return r || caches.match('./index.html'); });
      })
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(function (hit) {
      if (hit) return hit;
      return fetch(req).then(function (res) {
        if (res && (res.status === 200 || res.type === 'opaque')) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () { return hit; });
    })
  );
});
