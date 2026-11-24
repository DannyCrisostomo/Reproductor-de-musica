// js/library-view.js
// Vista "My library". Requiere js/library-store.js cargado antes.
// Al reproducir un ítem dispara el evento 'library:play' (detail = item).

(() => {
  'use strict';

  const lib = window.library;
  if (!lib) { console.warn('[library] falta js/library-store.js'); return; }

  const $ = (s, r = document) => r.querySelector(s);
  const main = $('.main');
  const tabs = $('.tabs');
  const content = $('#lib-content');
  const empty = $('#lib-empty');
  const toolbar = $('#lib-toolbar');
  const title = $('#lib-title');
  const back = $('#lib-back');
  const filters = $('#lib-filters');
  if (!main || !tabs || !content) return;

  let filter = 'favorites';
  let openPl = null;

  // ---------- utilidades ----------
  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const hue = (id) => [...String(id)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 0);

  const allItems = () => {
    const s = lib.getState();
    return [...s.favorites, ...s.recents, ...s.playlists.flatMap((p) => p.items)];
  };

  // ---------- plantillas ----------
  function card(item, mode) {
    const fav = lib.isFavorite(item.id);
    const letter = esc((item.title || '?').trim().charAt(0).toUpperCase());
    const img = item.cover
      ? `<img src="${esc(item.cover)}" alt="" loading="lazy" onerror="this.remove()">`
      : '';
    const side = mode === 'rm'
      ? `<button class="lib-btn left" data-act="rm" aria-label="Quitar de la playlist">✕</button>`
      : `<button class="lib-btn left" data-act="add" aria-label="Agregar a una playlist">＋</button>`;
    return `
      <article class="lib-card" data-id="${esc(item.id)}" tabindex="0" role="button"
               aria-label="Reproducir ${esc(item.title)}">
        <div class="lib-cover" style="--h:${hue(item.id)}">
          <span>${letter}</span>${img}
          ${side}
          <button class="lib-btn right fav" data-act="fav" aria-pressed="${fav}"
                  aria-label="Favorito">★</button>
        </div>
        <p>${esc(item.title)}</p>
        <span>${esc(item.subtitle)}</span>
      </article>`;
  }

  function playlistCard(pl) {
    return `
      <article class="lib-card lib-pl" data-pl="${esc(pl.id)}" tabindex="0" role="button"
               style="--h:${hue(pl.id)}" aria-label="Abrir playlist ${esc(pl.name)}">
        <button class="lib-btn right" data-act="del-pl" aria-label="Borrar playlist">✕</button>
        <h4>${esc(pl.name)}</h4>
        <small>${pl.items.length} elemento${pl.items.length === 1 ? '' : 's'}</small>
      </article>`;
  }

  // ---------- render ----------
  function render() {
    const s = lib.getState();

    filters.querySelectorAll('[data-filter]').forEach((b) => {
      const on = b.dataset.filter === filter;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on);
    });

    const pl = openPl && s.playlists.find((p) => p.id === openPl);
    if (openPl && !pl) openPl = null;

    let html = '';
    let msg = '';

    if (pl) {
      title.textContent = pl.name;
      html = pl.items.map((i) => card(i, 'rm')).join('');
      msg = 'Esta playlist está vacía. Agrega elementos con el botón ＋ de tus favoritos o recientes.';
    } else {
      title.textContent = 'My library';
      if (filter === 'playlists') {
        html = s.playlists.map(playlistCard).join('');
        msg = 'Aún no tienes playlists. Crea la primera con el botón de arriba.';
      } else if (filter === 'recents') {
        html = s.recents.map((i) => card(i)).join('');
        msg = 'Lo que escuches aparecerá aquí.';
      } else {
        html = s.favorites.map((i) => card(i)).join('');
        msg = 'Toca la ★ en una emisora o canción para guardarla aquí.';
      }
    }

    back.hidden = !pl;
    filters.hidden = !!pl;
    toolbar.hidden = !(filter === 'playlists' && !pl);
    content.innerHTML = html;
    empty.hidden = !!html;
    empty.textContent = msg;
  }

  // ---------- acciones ----------
  function play(item) {
    lib.addRecent(item);
    document.dispatchEvent(new CustomEvent('library:play', { detail: item }));
  }

  function pickPlaylist(item) {
    const s = lib.getState();
    const create = () => {
      const n = prompt('Nombre de la nueva playlist');
      if (n) lib.addToPlaylist(lib.createPlaylist(n), item);
    };
    if (!s.playlists.length) return create();

    const list = s.playlists.map((p, i) => `${i + 1}. ${p.name}`).join('\n');
    const r = prompt(`Agregar a:\n${list}\n\nEscribe el número (0 = nueva playlist)`);
    if (r === null) return;
    const n = parseInt(r, 10);
    if (n === 0) create();
    else if (s.playlists[n - 1]) lib.addToPlaylist(s.playlists[n - 1].id, item);
  }

  // ---------- eventos ----------
  filters.addEventListener('click', (e) => {
    const b = e.target.closest('[data-filter]');
    if (!b) return;
    filter = b.dataset.filter;
    openPl = null;
    render();
  });

  back.addEventListener('click', () => { openPl = null; render(); });

  $('#lib-new').addEventListener('click', () => {
    const n = prompt('Nombre de la playlist');
    if (n) lib.createPlaylist(n);
  });

  content.addEventListener('click', (e) => {
    const pc = e.target.closest('[data-pl]');
    if (pc) {
      if (e.target.closest('[data-act="del-pl"]')) {
        if (confirm('¿Borrar esta playlist?')) lib.deletePlaylist(pc.dataset.pl);
      } else {
        openPl = pc.dataset.pl;
        render();
      }
      return;
    }

    const c = e.target.closest('[data-id]');
    if (!c) return;
    const item = allItems().find((i) => i.id === c.dataset.id);
    if (!item) return;

    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'fav') lib.toggleFavorite(item);
    else if (act === 'add') pickPlaylist(item);
    else if (act === 'rm') lib.removeFromPlaylist(openPl, item.id);
    else play(item);
  });

  content.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.lib-card')) {
      e.preventDefault();
      e.target.click();
    }
  });

  // Pestaña "My library" (fase de captura: no choca con otros manejadores de pestañas)
  tabs.addEventListener('click', (e) => {
    const a = e.target.closest('a');
    if (!a) return;

    if (a.dataset.tab === 'library') {
      e.preventDefault();
      e.stopPropagation();
      tabs.querySelectorAll('a').forEach((t) => {
        const on = t === a;
        t.classList.toggle('on', on);
        on ? t.setAttribute('aria-current', 'page') : t.removeAttribute('aria-current');
      });
      main.classList.add('lib-open');
      render();
    } else {
      main.classList.remove('lib-open');
    }
  }, true);

  // Redibuja solo cuando algo cambia y la vista está abierta
  lib.subscribe(() => { if (main.classList.contains('lib-open')) render(); });
})();