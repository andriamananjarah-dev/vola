// Service worker de Vola : fonctionnement hors connexion et mises à jour « tout ou rien ».
const V = '202610260633';
const CACHE = 'vola-' + V;
const ASSETS = ["./","index.html","app.js","app.css","manifest.webmanifest","fonts/archivo.woff2","icons/apple-touch-icon.png","icons/icon-192.png","icons/icon-512.png","icons/icon-maskable-512.png","icons/favicon-32.png"];
// Fichiers qui portent le numéro de version : s'ils ne correspondent pas, la mise à jour est refusée.
const STAMPED = ['./', 'index.html', 'app.js', 'app.css'];
const scopeURL = u => new URL(u, self.registration.scope).href;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    try {
      for (const u of ASSETS) {
        const key = scopeURL(u);
        // « ?v= » : adresse unique pour cette version, le cache du serveur ne peut pas servir un ancien fichier.
        const res = await fetch(key + (key.includes('?') ? '&' : '?') + 'v=' + V, { cache: 'reload' });
        if (!res.ok) throw new Error(`${u} : ${res.status}`);
        if (STAMPED.includes(u)) {
          const text = await res.clone().text();
          if (!text.includes(V)) throw new Error(`${u} ne correspond pas à la version ${V}`);
        }
        await cache.put(key, res);
      }
    } catch (e) {
      // Fichiers incomplets ou mélangés sur le serveur : on garde la version actuelle, intacte.
      await caches.delete(CACHE);
      throw e;
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('vola-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith((async () => {
    // Uniquement le cache de CETTE version : jamais un fichier d'une ancienne version.
    const cache = await caches.open(CACHE);
    if (req.mode === 'navigate') {
      const page = await cache.match(scopeURL('index.html'));
      if (page) return page;
      const res = await fetch(req);
      if (res && res.ok) cache.put(scopeURL('index.html'), res.clone());
      return res;
    }
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    const res = await fetch(req);
    if (res && res.ok && res.type === 'basic') cache.put(url.origin + url.pathname, res.clone());
    return res;
  })());
});
