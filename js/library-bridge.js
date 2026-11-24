// js/library-bridge.js
// Conecta "Mi biblioteca" con el reproductor (app.js) y la radio (extras.js).
// Cargar DESPUÉS de extras.js y ANTES de library-view.js.
//
// Qué hace:
//  - Sincroniza ★ de emisoras y "Me gusta" de canciones con la biblioteca (en ambos sentidos).
//  - Guarda en "Escuchado recientemente" lo que vas reproduciendo.
//  - Reproduce lo que toques en Mi biblioteca (emisoras y canciones).
//  - Da a la vista de biblioteca los datos actuales de cada canción (título, artista, portada).

(() => {
  'use strict';

  const lib = window.library;
  const A = window.__player;
  const R = window.__radio;
  if (!lib || !A) { console.warn('[bridge] faltan library-store.js o app.js'); return; }
  if (!R) console.warn('[bridge] falta window.__radio en extras.js: la radio no se conectará');

  const $ = (s) => document.querySelector(s);
  const status = (m) => { const el = $('#status'); if (el) el.textContent = m; };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

  // ---------- formato de ítems ----------
  const findSong = (key) => A.songs.find((s) => s.key === key);
  const songItem = (s) => ({ id: s.key, type: 'song', title: s.title, subtitle: s.artist });
  const radioItem = (s) => ({
    id: 'radio:' + s.uuid,
    type: 'radio',
    title: s.name,
    subtitle: [s.country, s.bitrate ? s.bitrate + ' kbps' : ''].filter(Boolean).join(' · '),
    cover: s.logo && s.logo.startsWith('https') ? s.logo : '',
    station: { uuid: s.uuid, name: s.name, url: s.url, logo: s.logo, country: s.country, bitrate: s.bitrate },
  });

  // Datos "en vivo" para dibujar (las portadas de canciones cambian en cada sesión)
  window.libraryResolve = (item) => {
    if (item.type === 'song') {
      const s = findSong(item.id);
      return s ? { ...item, title: s.title, subtitle: s.artist, cover: s.cover || A.gen(s.title, s.artist) } : item;
    }
    return { ...item, cover: item.cover || A.gen(item.title, item.title) };
  };
  // Todas las canciones cargadas (para el buscador de "Agregar música")
  window.libraryCatalog = () => A.songs.map(songItem);

  // ---------- reproducir desde la biblioteca ----------
  document.addEventListener('library:play', (e) => {
    const item = e.detail;
    if (!item) return;

    if (item.type === 'radio') {
      if (!R) return status('La radio no está disponible.');
      const st = item.station;
      if (!st) return status('Esta emisora no tiene datos de conexión.');
      if (R.isRadio() && R.current().uuid === st.uuid) {
        const p = A.cp();
        p.paused ? p.play().catch(() => {}) : A.P.forEach((x) => x.pause());
      } else {
        R.play(st);
      }
      return;
    }

    const i = A.songs.findIndex((s) => s.key === item.id);
    if (i < 0) return status('Esa canción no está cargada. Pulsa “Buscar música”.');
    if (i === A.cur() && !(R && R.isRadio())) A.toggle();
    else A.load(i, true);
  });

  // ---------- favoritos: biblioteca -> app ----------
  const favMap = (s) => new Map(s.favorites.map((i) => [i.id, i]));
  let prev = favMap(lib.getState());

  const refreshStars = () =>
    document.querySelectorAll('#x-radio [data-fav]').forEach((b) =>
      b.setAttribute('aria-pressed', R.favs.some((f) => f.uuid === b.dataset.fav)));

  // Devuelve true si cambió algo en la app
  function applyToApp(item, on) {
    if (item.type === 'song') {
      if (A.liked.has(item.id) === on) return false;
      on ? A.liked.add(item.id) : A.liked.delete(item.id);
      save('likedK', [...A.liked]);
      return true;
    }
    if (item.type === 'radio' && R && item.station) {
      const i = R.favs.findIndex((f) => f.uuid === item.station.uuid);
      if (on && i < 0) R.favs.push(item.station);
      else if (!on && i >= 0) R.favs.splice(i, 1);
      else return false;
      save('radioFav', R.favs);
      refreshStars();
      return true;
    }
    return false;
  }

  lib.subscribe((s) => {
    const now = favMap(s);
    let songs = false;
    now.forEach((item, id) => { if (!prev.has(id) && applyToApp(item, true) && item.type === 'song') songs = true; });
    prev.forEach((item, id) => { if (!now.has(id) && applyToApp(item, false) && item.type === 'song') songs = true; });
    prev = now;
    if (songs) { A.syncLike && A.syncLike(); A.renderList && A.renderList(); A.renderRows && A.renderRows(); }
  });

  // ---------- favoritos: app -> biblioteca ----------
  // "Me gusta" de la canción actual
  $('#hLike')?.addEventListener('click', () => {
    const s = A.songs[A.cur()];
    if (s && A.liked.has(s.key) !== lib.isFavorite(s.key)) lib.toggleFavorite(songItem(s));
  });

  // ★ de las emisoras (el manejador de extras.js corre primero y actualiza R.favs)
  $('#x-radio')?.addEventListener('click', (e) => {
    if (!R || !e.target.closest('[data-fav]')) return;
    const uuids = new Set(R.favs.map((s) => s.uuid));
    R.favs.forEach((s) => { if (!lib.isFavorite('radio:' + s.uuid)) lib.toggleFavorite(radioItem(s)); });
    lib.getState().favorites
      .filter((i) => i.type === 'radio' && !uuids.has(i.station?.uuid))
      .forEach((i) => lib.toggleFavorite(i));
  });

  // Importa lo que ya tenías marcado antes de existir la biblioteca
  function importFromApp() {
    A.liked.forEach((k) => {
      const s = findSong(k);
      if (s && !lib.isFavorite(k)) lib.toggleFavorite(songItem(s));
    });
  }
  if (R) R.favs.forEach((s) => { if (!lib.isFavorite('radio:' + s.uuid)) lib.toggleFavorite(radioItem(s)); });
  importFromApp();

  // Las canciones se cargan poco a poco: se vuelve a importar cuando cambia la lista
  let t;
  new MutationObserver(() => {
    clearTimeout(t);
    t = setTimeout(() => {
      importFromApp();
      document.dispatchEvent(new Event('library:refresh'));
    }, 600);
  }).observe($('#songs'), { childList: true });

  // ---------- recientes ----------
  let lastRecent = null;
  A.P.forEach((p) => p.addEventListener('playing', () => {
    if (p !== A.cp()) return;
    let item = null;
    if (R && R.isRadio()) item = radioItem(R.current());
    else if (A.songs[A.cur()]) item = songItem(A.songs[A.cur()]);
    if (!item || item.id === lastRecent) return;
    lastRecent = item.id;
    lib.addRecent(item);
  }));
})();