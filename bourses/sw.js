/* 장학생 관리 — service worker : 인터넷 없이도 열리고, 인터넷이 되면 새 버전으로 바뀜 */
const VERSION = 'b1';
const CACHE = 'bourses-' + VERSION;
const FILES = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable-512.png', './favicon.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('bourses-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Réseau d'abord (8 s max) pour avoir la dernière version ; sinon la copie enregistrée.
// Si le réseau est lent, la copie enregistrée s'affiche, et la nouvelle version est téléchargée en arrière-plan :
// le programme propose alors de recharger.
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const netP = fetch(req, {cache: 'no-cache'}).then(async net => {
      if (net && net.ok) {
        const old = await cache.match(req, {ignoreSearch: true});
        const isPage = req.mode === 'navigate' || /index\.html$|\/$/.test(new URL(req.url).pathname);
        if (isPage && old) {
          const [a, b] = await Promise.all([old.clone().text(), net.clone().text()]);
          if (a !== b) { await cache.put(req, net.clone()); if (req.mode === 'navigate') await cache.put('./index.html', net.clone()); const cl = await self.clients.matchAll(); cl.forEach(c => c.postMessage('bourses-update')); return net; }
        }
        await cache.put(req, net.clone());
      }
      return net;
    });
    try {
      return await Promise.race([netP, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000))]);
    } catch (err) {
      e.waitUntil(netP.catch(() => {}));
      const hit = await cache.match(req, {ignoreSearch: true}) || (req.mode === 'navigate' ? await cache.match('./index.html') : null);
      return hit || new Response('Hors ligne', {status: 503, headers: {'Content-Type': 'text/plain; charset=utf-8'}});
    }
  })());
});
