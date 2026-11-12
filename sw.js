/* Service worker — Suivi Annualisation v3
   • Fichiers de l'application (HTML, JS, CSS) : réseau d'abord, cache en secours
     → toujours la dernière version en ligne, coquille disponible hors connexion.
   • Icônes et police : cache d'abord.
   • Tout le reste (Firebase, e-mails, CDN) n'est jamais intercepté. */
const CACHE = 'suivi-annualisation-v3.0.0';
const SHELL = [
  './', './index.html', './app.html', './manifest.json', './app.webmanifest',
  './css/app.css', './fonts/inter-latin.woff2',
  './js/app.js', './js/backend.js', './js/config.js', './js/core.js', './js/faq.js', './js/nav.js', './js/store.js', './js/ui.js',
  './js/views/absences.js', './js/views/alerts.js', './js/views/comms.js', './js/views/dashboard.js', './js/views/help.js',
  './js/views/people.js', './js/views/planning.js', './js/views/profile.js', './js/views/reports.js', './js/views/requests.js',
  './js/views/settings.js', './js/views/shared.js', './js/views/team.js', './js/views/van.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-192-maskable.png', './icons/icon-512-maskable.png',
  './icons/apple-touch-icon.png', './icons/favicon.png', './icons/favicon-32.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  const isStatic = /\/(icons|fonts)\//.test(url.pathname);
  if (isStatic) {
    event.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return res;
    })));
    return;
  }
  event.respondWith(fetch(req).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true }).then(hit => hit || caches.match('./index.html'))));
});
