// Service worker de Vola : fonctionnement hors connexion et mises à jour « tout ou rien ».
const V = '202610271506';
const CACHE = 'vola-' + V;
// Fichiers essentiels : ils portent le numéro de version et doivent tous correspondre, sinon la mise à jour est refusée.
const CORE = ['./', 'index.html', 'app.js', 'app.css'];
// Fichiers d'appoint (manifeste, police, icônes) : copiés s'ils sont publiés, sans jamais bloquer l'installation.
const EXTRA = ["manifest.webmanifest","archivo.woff2","apple-touch-icon.png","icon-192.png","icon-512.png","icon-maskable-512.png","favicon-32.png"];
const scopeURL = u => new URL(u, self.registration.scope).href;
// « ?v= » : adresse unique pour cette version, le cache du serveur ne peut pas servir un ancien fichier.
const versioned = key => key + (key.includes('?') ? '&' : '?') + 'v=' + V;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    try {
      for (const u of CORE) {
        const key = scopeURL(u);
        const res = await fetch(versioned(key), { cache: 'reload' });
        if (!res.ok) throw new Error(`${u} : ${res.status}`);
        const text = await res.clone().text();
        if (!text.includes(V)) throw new Error(`${u} ne correspond pas à la version ${V}`);
        await cache.put(key, res);
      }
    } catch (e) {
      // Fichiers essentiels absents ou mélangés sur le serveur : on garde la version actuelle, intacte.
      await caches.delete(CACHE);
      throw e;
    }
    // Police et icônes : la copie publiée, sinon celle de la version précédente, sinon rien.
    await Promise.all(EXTRA.map(async (u) => {
      const key = scopeURL(u);
      try {
        const res = await fetch(versioned(key), { cache: 'reload' });
        if (res.ok) { await cache.put(key, res); return; }
      } catch (e) { /* absent ou hors connexion */ }
      try { const old = await caches.match(key); if (old) await cache.put(key, old); } catch (e) { /* rien */ }
    }));
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
  if (url.searchParams.has('check')) return; // diagnostic : toujours le fichier publié sur le serveur
  event.respondWith((async () => {
    // D'abord le cache de CETTE version : jamais le fichier d'une autre version quand il existe ici.
    const cache = await caches.open(CACHE);
    const key = req.mode === 'navigate' ? scopeURL('index.html') : null;
    const hit = key ? await cache.match(key) : await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res && res.ok && res.type === 'basic' && !res.redirected) cache.put(key || url.origin + url.pathname, res.clone());
      return res;
    } catch (e) {
      // Hors connexion et fichier absent de ce cache : toute copie enregistrée plutôt qu'une page d'erreur.
      const any = await caches.match(key || req, { ignoreSearch: true });
      if (any) return any;
      throw e;
    }
  })());
});
