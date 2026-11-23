// Service worker del reproductor. Ponlo en la RAÍZ, junto a index.html.
// Cada vez que cambies tus archivos, sube la versión (v1 -> v2 -> v3...).
const VERSION = 'v1';
const CACHE = `playlist-${VERSION}`;
const CACHE_EXTERNO = 'playlist-externo';

// Rutas relativas: funcionan igual en la raíz del dominio o en una subcarpeta.
const PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/app.js',
  './js/jsmediatags.min.js',
  './musica.png',
  './img_estilos/fondo.png',
  './img_estilos/cursor.png',
  './img_estilos/user.jpg',
  './img/image1.jpg',
  './img/image2.jpg',
  './img/image3.jpg',
  './img/image4.jpg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // Uno por uno: si falta algún archivo, los demás igual se guardan.
      await Promise.allSettled(PRECACHE.map((url) => cache.add(url)));
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      const claves = await caches.keys();
      await Promise.all(
        claves.filter((k) => k.startsWith('playlist-') && k !== CACHE && k !== CACHE_EXTERNO).map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

const guardable = (res) => res && (res.ok || res.type === 'opaque');

// Con internet usa lo nuevo y lo guarda; sin internet usa lo guardado.
async function redPrimero(req, nombre) {
  try {
    const res = await fetch(req);
    if (guardable(res)) (await caches.open(nombre)).put(req, res.clone());
    return res;
  } catch {
    return caches.match(req);
  }
}

// Responde al instante con lo guardado y se actualiza en segundo plano.
async function guardadoPrimero(req, nombre) {
  const cache = await caches.open(nombre);
  const guardado = await cache.match(req);
  const actualizar = fetch(req)
    .then((res) => {
      if (guardable(res)) cache.put(req, res.clone());
      return res;
    })
    .catch(() => null);
  return guardado || (await actualizar) || Response.error();
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (!url.protocol.startsWith('http')) return;

  // Páginas: red primero; sin red, la página guardada
  if (req.mode === 'navigate') {
    e.respondWith(
      (async () => (await redPrimero(req, CACHE)) || (await caches.match('./index.html')) || Response.error())()
    );
    return;
  }

  // Tus archivos (css, js, imágenes)
  if (url.origin === self.location.origin) {
    e.respondWith(guardadoPrimero(req, CACHE));
    return;
  }

  // Librerías externas (por si aún cargas jsmediatags desde cdnjs)
  e.respondWith(guardadoPrimero(req, CACHE_EXTERNO));
});