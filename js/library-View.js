// js/library-view.js
// "Mi biblioteca" (estilo Spotify). Requiere js/library-store.js cargado antes.
// Eventos que dispara:
//   'library:play'  -> detail = item a reproducir
//   'library:queue' -> detail = { name, items } al pulsar "Reproducir" en una lista

(() => {
  'use strict';

  const lib = window.library;
  if (!lib) { console.warn('[library] falta js/library-store.js'); return; }

  const $ = (s, r = document) => r.querySelector(s);
  const main = $('.main');
  const tabs = $('.tabs');
  const content = $('#lib-content');
  const empty = $('#lib-empty');
  const title = $('#lib-title');
  const back = $('#lib-back');
  const filters = $('#lib-filters');
  const detail = $('#lib-detail');
  const headActions = $('#lib-head-actions');
  const layoutBtn = $('#lib-layout');
  const picker = $('#lib-picker');
  const pickList = $('#lib-pick-list');
  if (!main || !tabs || !content) return;

  const LAYOUT_KEY = 'playlist-app:library:layout';
  let filter = 'all';   // all | playlists | radios | songs
  let open = null;      // null | 'fav' | 'rec' | 'pl:<id>'
  let grid = false;
  try { grid = localStorage.getItem(LAYOUT_KEY) === 'grid'; } catch {}

  // ---------- utilidades ----------
  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const hue = (id) => [...String(id)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 0);
  const n = (k) => `${k} elemento${k === 1 ? '' : 's'}`;
  const letter = (t) => esc((t || '?').trim().charAt(0).toUpperCase());

  const SYS = {
    fav: { name: 'Tus favoritos', label: 'Favoritos', glyph: '★', get: (s) => s.favorites },
    rec: { name: 'Escuchado recientemente', label: 'Historial', glyph: '↺', get: (s) => s.recents },
  };

  const allItems = () => {
    const s = lib.getState();
    return [...s.favorites, ...s.recents, ...s.playlists.flatMap((p) => p.items)];
  };

  // ---------- miniaturas ----------
  const img = (src) => `<img src="${esc(src)}" alt="" loading="lazy" onerror="this.remove()">`;

  const itemThumb = (item) =>
    `<div class="lib-thumb" style="--h:${hue(item.id)}"><span>${letter(item.title)}</span>${item.cover ? img(item.cover) : ''}</div>`;

  const sysThumb = (key) => `<div class="lib-thumb sys ${key}"><span>${SYS[key].glyph}</span></div>`;

  function plThumb(pl) {
    const covers = pl.items.map((i) => i.cover).filter(Boolean);
    if (covers.length >= 4) {
      return `<div class="lib-thumb mosaic">${covers.slice(0, 4).map(img).join('')}</div>`;
    }
    return `<div class="lib-thumb" style="--h:${hue(pl.id)}"><span>♪</span>${covers[0] ? img(covers[0]) : ''}</div>`;
  }

  // ---------- filas ----------
  const collRow = (key, name, sub, thumb) => `
    <article class="lib-row" data-open="${esc(key)}" tabindex="0" role="button" aria-label="Abrir ${esc(name)}">
      ${thumb}
      <div class="lib-meta"><p>${esc(name)}</p><span>${esc(sub)}</span></div>
    </article>`;

  const sysRow = (key, s) =>
    collRow(key, SYS[key].name, `${SYS[key].label} · ${n(SYS[key].get(s).length)}`, sysThumb(key));

  const plRow = (pl) =>
    collRow('pl:' + pl.id, pl.name, `Playlist · ${n(pl.items.length)}`, plThumb(pl));

  function itemRow(item, inPlaylist) {
    const fav = lib.isFavorite(item.id);
    const act = inPlaylist
      ? `<button class="lib-icon" data-act="rm" aria-label="Quitar de la playlist">✕</button>`
      : `<button class="lib-icon" data-act="add" aria-label="Agregar a una playlist">＋</button>`;
    return `
      <article class="lib-row" data-id="${esc(item.id)}" tabindex="0" role="button"
               aria-label="Reproducir ${esc(item.title)}">
        ${itemThumb(item)}
        <div class="lib-meta"><p>${esc(item.title)}</p><span>${esc(item.subtitle)}</span></div>
        <div class="lib-acts">
          ${act}
          <button class="lib-icon fav" data-act="fav" aria-pressed="${fav}" aria-label="Favorito">★</button>
        </div>
      </article>`;
  }

  // ---------- colección abierta ----------
  function collection(s) {
    if (open === 'fav' || open === 'rec') {
      return { kind: 'sys', name: SYS[open].name, items: SYS[open].get(s), thumb: sysThumb(open) };
    }
    const pl = s.playlists.find((p) => 'pl:' + p.id === open);
    return pl ? { kind: 'pl', id: pl.id, name: pl.name, items: pl.items, thumb: plThumb(pl) } : null;
  }

  // ---------- render ----------
  function draw() {
    const s = lib.getState();
    const c = open ? collection(s) : null;
    if (open && !c) open = null;
    const home = !c;

    title.textContent = c ? c.name : 'Mi biblioteca';
    back.hidden = home;
    headActions.hidden = !home;
    filters.hidden = !home;
    detail.hidden = home;
    content.classList.toggle('is-grid', home && grid);
    layoutBtn.textContent = grid ? '☰' : '▦';
    layoutBtn.setAttribute('aria-label', grid ? 'Ver como lista' : 'Ver como cuadrícula');

    filters.querySelectorAll('[data-filter]').forEach((b) => {
      const on = b.dataset.filter === filter;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on);
    });

    let rows = [];
    let hint = '';

    if (c) {
      detail.innerHTML = `
        <div class="lib-hero">
          ${c.thumb}
          <div class="lib-hero-info">
            <span>${n(c.items.length)}</span>
            <div class="lib-hero-btns">
              <button class="lib-chip primary big" data-act="play-all" ${c.items.length ? '' : 'disabled'}>▶ Reproducir</button>
              ${c.kind === 'pl' ? '<button class="lib-chip big" data-act="open-picker">＋ Agregar música</button>' : ''}
            </div>
            ${c.kind === 'pl' ? `
              <div class="lib-hero-btns">
                <button class="lib-chip" data-act="rename">Renombrar</button>
                <button class="lib-chip" data-act="del-pl">Borrar</button>
              </div>` : ''}
          </div>
        </div>`;
      rows = c.items.map((i) => itemRow(i, c.kind === 'pl'));
      hint = c.kind === 'pl'
        ? 'Esta playlist está vacía. Toca ＋ Agregar música.'
        : open === 'fav'
          ? 'Aún no tienes favoritos. Toca la ★ en una emisora o canción.'
          : 'Lo que escuches aparecerá aquí.';
    } else if (filter === 'playlists') {
      rows = s.playlists.map(plRow);
      hint = 'Aún no tienes playlists. Crea la primera con el botón ＋.';
    } else if (filter === 'radios') {
      rows = s.favorites.filter((i) => i.type === 'radio').map((i) => itemRow(i));
      hint = 'Toca la ★ en una emisora para verla aquí.';
    } else if (filter === 'songs') {
      rows = s.favorites.filter((i) => i.type !== 'radio').map((i) => itemRow(i));
      hint = 'Toca la ★ en una canción para verla aquí.';
    } else {
      rows = [sysRow('fav', s), sysRow('rec', s), ...s.playlists.map(plRow)];
      hint = s.playlists.length ? '' : 'Crea tu primera playlist con el botón ＋.';
      if (rows.length) return finish(rows, hint);
    }
    finish(rows, rows.length && !(filter === 'all' && !c) ? '' : hint);
  }

  function finish(rows, hint) {
    content.innerHTML = rows.join('');
    empty.hidden = !hint;
    empty.textContent = hint;
  }

  function render() {
    draw();
    if (picker.open) renderPicker();
  }

  // ---------- selector "Agregar música" ----------
  function renderPicker() {
    const s = lib.getState();
    const pl = s.playlists.find((p) => 'pl:' + p.id === open);
    if (!pl) { picker.close(); return; }

    const seen = new Set();
    const cands = [...s.favorites, ...s.recents].filter((i) => !seen.has(i.id) && seen.add(i.id));

    pickList.innerHTML = cands.length
      ? cands.map((i) => {
          const inPl = pl.items.some((x) => x.id === i.id);
          return `
            <li data-id="${esc(i.id)}">
              <div class="lib-mini" style="--h:${hue(i.id)}">${letter(i.title)}</div>
              <div class="lib-pick-txt"><b>${esc(i.title)}</b><small>${esc(i.subtitle)}</small></div>
              <button class="lib-chip ${inPl ? '' : 'primary'}" data-act="pick" ${inPl ? 'disabled' : ''}>
                ${inPl ? '✓ Agregada' : '＋ Agregar'}
              </button>
            </li>`;
        }).join('')
      : `<li class="lib-pick-empty">Aún no tienes favoritos ni recientes.
         Marca la ★ en una emisora o reproduce algo y vuelve aquí.</li>`;
  }

  // ---------- acciones ----------
  function play(item) {
    lib.addRecent(item);
    document.dispatchEvent(new CustomEvent('library:play', { detail: item }));
  }

  function pickPlaylist(item) {
    const s = lib.getState();
    const create = () => {
      const name = prompt('Nombre de la nueva playlist');
      if (name) lib.addToPlaylist(lib.createPlaylist(name), item);
    };
    if (!s.playlists.length) return create();

    const list = s.playlists.map((p, i) => `${i + 1}. ${p.name}`).join('\n');
    const r = prompt(`Agregar a:\n${list}\n\nEscribe el número (0 = nueva playlist)`);
    if (r === null) return;
    const k = parseInt(r, 10);
    if (k === 0) create();
    else if (s.playlists[k - 1]) lib.addToPlaylist(s.playlists[k - 1].id, item);
  }

  // ---------- eventos ----------
  filters.addEventListener('click', (e) => {
    const b = e.target.closest('[data-filter]');
    if (!b) return;
    filter = filter === b.dataset.filter ? 'all' : b.dataset.filter; // tocar de nuevo = quitar filtro
    render();
  });

  back.addEventListener('click', () => { open = null; render(); });

  layoutBtn.addEventListener('click', () => {
    grid = !grid;
    try { localStorage.setItem(LAYOUT_KEY, grid ? 'grid' : 'list'); } catch {}
    render();
  });

  $('#lib-new').addEventListener('click', () => {
    const name = prompt('Nombre de la playlist');
    if (!name) return;
    open = 'pl:' + lib.createPlaylist(name);
    render();
  });

  content.addEventListener('click', (e) => {
    const o = e.target.closest('[data-open]');
    if (o) { open = o.dataset.open; render(); return; }

    const row = e.target.closest('[data-id]');
    if (!row) return;
    const item = allItems().find((i) => i.id === row.dataset.id);
    if (!item) return;

    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'fav') lib.toggleFavorite(item);
    else if (act === 'add') pickPlaylist(item);
    else if (act === 'rm') lib.removeFromPlaylist(open.slice(3), item.id);
    else play(item);
  });

  detail.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    const s = lib.getState();
    const c = open && collection(s);
    if (!act || !c) return;

    if (act === 'play-all' && c.items.length) {
      document.dispatchEvent(new CustomEvent('library:queue', { detail: { name: c.name, items: c.items } }));
      play(c.items[0]);
    } else if (act === 'open-picker') {
      renderPicker();
      picker.showModal();
    } else if (act === 'rename') {
      const name = prompt('Nuevo nombre', c.name);
      if (name && name.trim()) lib.renamePlaylist(c.id, name.trim());
    } else if (act === 'del-pl') {
      if (confirm('¿Borrar esta playlist?')) { lib.deletePlaylist(c.id); open = null; render(); }
    }
  });

  $('#lib-picker-close').addEventListener('click', () => picker.close());

  pickList.addEventListener('click', (e) => {
    if (!e.target.closest('[data-act="pick"]')) return;
    const li = e.target.closest('[data-id]');
    const item = allItems().find((i) => i.id === li.dataset.id);
    if (item && open && open.startsWith('pl:')) lib.addToPlaylist(open.slice(3), item);
  });

  content.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.lib-row')) {
      e.preventDefault();
      e.target.click();
    }
  });

  // Pestaña "Mi biblioteca" (fase de captura: no choca con otros manejadores de pestañas)
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