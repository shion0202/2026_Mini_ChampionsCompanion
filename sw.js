const CACHE = 'champions-shell-v46';
const APP_FILES = [
  './',
  './index.html',
  './src/styles.css',
  './src/app.js',
  './src/app-view.js',
  './src/app-state.js',
  './src/html.js',
  './src/top-teams.js',
  './src/top-teams-view.js',
  './src/data.js',
  './src/api.js',
  './src/locale.js',
  './src/theme.js',
  './src/reference.js',
  './src/filters.js',
  './src/reference-view.js',
  './src/type-chart-view.js',
  './src/builds.js',
  './src/builds-view.js',
  './src/sync.js',
  './src/speed-calc.js',
  './src/calc-view.js',
  './src/calc.css',
  './src/item-exclusions.js',
  './src/trends.js',
  './src/trends-view.js',
  './src/trends.css',
  './src/damage-calc.js',
  './src/damage-view.js',
  './src/damage-catalog.js',
  './src/speed.js',
  './src/speed-catalog.js',
  './src/speed-view.js',
  './src/speed.css',
  './src/images.js',
  './src/artwork-data.js',
  './src/move-traits.js',
  './public/data/ko.json',
  './public/data/reference.json',
  './public/data/top-teams.json',
  './public/icons/icon.svg',
  './public/icons/icon-192.png',
  './public/icons/icon-512.png',
  './manifest.webmanifest',
];
self.addEventListener('install', event => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then(cache => cache.addAll(APP_FILES))
      .then(() => self.skipWaiting()),
  );
});
self.addEventListener('activate', event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(key => key.startsWith('champions-shell-') && key !== CACHE)
            .map(key => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return; // No API or sprite archive.
  // A selected Pokémon lives in the fragment; it is still the same app shell.
  url.hash = '';
  url.search = '';
  const allowed = APP_FILES.map(path => new URL(path, self.registration.scope).href);
  if (!allowed.includes(url.href)) return;
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response.ok) {
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE).then(cache => cache.put(url.href, copy)));
        }
        return response;
      })
      .catch(() => caches.match(url.href)),
  );
});
