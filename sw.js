/* Offline cache. Bump CACHE when shipping changes; pages update on the next launch. */
const CACHE = 'nrt-1.2.0';
const ASSETS = [
  './', './index.html', './styles.css', './app.js', './manifest.webmanifest',
  './icons/favicon.svg', './icons/apple-touch-icon.png', './icons/icon-192.png',
  './icons/icon-512.png', './icons/icon-maskable-512.png',
  // Null Signal Games symbols + faction glyphs (CC BY-ND 4.0)
  './assets/nsg/NSG_CLICK.svg', './assets/nsg/NSG_CLICK_SPENT.svg', './assets/nsg/NSG_CREDIT.svg',
  './assets/nsg/NSG_AGENDA.svg', './assets/nsg/NSG_BAD_PUBLICITY.svg', './assets/nsg/NSG_TAG.svg',
  './assets/nsg/NSG_CORE_DAMAGE.svg', './assets/nsg/NSG_RECURRING_CREDIT.svg',
  './assets/nsg/factions/NSG_HB.png', './assets/nsg/factions/NSG_JINTEKI.png',
  './assets/nsg/factions/NSG_NBN.svg', './assets/nsg/factions/NSG_WEYLAND.svg',
  './assets/nsg/factions/NSG_ANARCH.svg', './assets/nsg/factions/NSG_CRIMINAL.svg',
  './assets/nsg/factions/NSG_SHAPER.svg', './assets/nsg/factions/NSG_ADAM.svg',
  './assets/nsg/factions/NSG_APEX.svg', './assets/nsg/factions/NSG_SUNNY.svg',
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
// Cache first (instant + offline), refresh the cache in the background.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(async (cache) => {
    const key = req.mode === 'navigate' ? './index.html' : req;
    const cached = await cache.match(key, { ignoreSearch: true });
    const network = fetch(req).then((res) => {
      if (res && res.ok) cache.put(key, res.clone());
      return res;
    }).catch(() => cached);
    return cached || network;
  }));
});
