// Service worker: caches the app shell so the app works offline (R27).
//
// IMPORTANT: bump CACHE_VERSION whenever you change any file in APP_SHELL, and
// add every new app file to APP_SHELL. Otherwise installed copies keep serving
// the old files, or fail offline when a module is missing from the cache.

const CACHE_VERSION = 'v22';
const CACHE_NAME = `mic-jaunt-${CACHE_VERSION}`;

// Paths are relative so the app also works from a sub-folder (e.g. GitHub Pages).
const APP_SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'js/app.js',
  'js/db.js',
  'js/ui.js',
  'js/update.js',
  'js/theme.js',
  'js/musicbrainz.js',
  'js/reminder.js',
  'js/lib/theme.js',
  'js/lib/musicbrainz.js',
  'js/lib/pick.js',
  'js/lib/night.js',
  'js/lib/search.js',
  'js/lib/song.js',
  'js/lib/csv.js',
  'js/lib/backup.js',
  'js/lib/stats.js',
  'js/lib/setlist.js',
  'js/lib/find.js',
  'js/views/songs.js',
  'js/views/setlists.js',
  'js/views/venues.js',
  'js/views/settings.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names
          .filter((name) => (name.startsWith('mic-jaunt-') || name.startsWith('karaoke-tracker-')) && name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      ))
      .then(() => self.clients.claim())
  );
});

// Cache first for our own files; anything else (e.g. a future MusicBrainz
// lookup, R35) goes straight to the network.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request, { ignoreSearch: true })
      .then((cached) => cached || fetch(event.request))
  );
});
