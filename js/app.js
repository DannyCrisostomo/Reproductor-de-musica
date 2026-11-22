(() => {
  const $ = s => document.querySelector(s);
  const A = new Audio();
  const songs = [];
  const pad = n => String(n).padStart(2, '0');
  const fmt = s => `${Math.floor(s / 60)}:${pad(Math.floor(s % 60))}`;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clean = v => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, '').trim() : '');
  const ico = (n, c = '') => `<svg class="i ${c}"><use href="#${n}"/></svg>`;
  const NO = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><defs><linearGradient id="g"><stop stop-color="#00ffde"/><stop offset="1" stop-color="#6a2cff"/></linearGradient></defs><rect width="1" height="1" fill="url(#g)"/></svg>');
  const img = (src, alt = '') => `<img src="${src || NO}" alt="${esc(alt)}" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='${NO}'">`;
  const status = m => { const el = $('#status'); if (el) el.textContent = m; };
  const wait = () => new Promise(r => setTimeout(r, 0));

  const store = {
    get: k => { try { return JSON.parse(localStorage.getItem(k)) } catch { return null } },
    set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch {} }
  };

  // ---------- Almacenamiento (IndexedDB) ----------
  let dbp;
  const openDB = () => dbp || (dbp = new Promise((res, rej) => {
    const r = indexedDB.open('playlist-db', 2);
    r.onupgradeneeded = () => {
      const d = r.result;
      if (!d.objectStoreNames.contains('files')) d.createObjectStore('files', { keyPath: 'id', autoIncrement: true });
      if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta');
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.onblocked = () => rej(new Error('blocked'));
  }));
  const tx = async (name, mode, fn) => {
    try {
      const d = await openDB();
      return await new Promise(res => {
        const q = fn(d.transaction(name, mode).objectStore(name));
        q.onsuccess = () => res(q.result); q.onerror = () => res(undefined);
      });
    } catch { return undefined; }
  };
  const idb = {
    all: async () => (await tx('files', 'readonly', s => s.getAll())) || [],
    add: file => tx('files', 'readwrite', s => s.add({ name: file.name, blob: file })),
    getMeta: k => tx('meta', 'readonly', s => s.get(k)),
    setMeta: (k, v) => tx('meta', 'readwrite', s => s.put(v, k)),
    clearAll: async () => { await tx('files', 'readwrite', s => s.clear()); await tx('meta', 'readwrite', s => s.clear()); }
  };

  // ---------- Canciones ----------
  const keys = new Set();
  const AUDIO_EXT = /\.(mp3|m4a|aac|wav|ogg|opus|flac|wma)$/i;

  const fromName = name => {
    const base = name.replace(/\.[^.]+$/, '').replace(/_/g, ' ').trim();
    const p = base.split(' - ');
    return p.length > 1 ? { artist: p[0].trim(), title: p.slice(1).join(' - ').trim() } : { artist: 'Mi música', title: base };
  };

  function addQuick(file) {
    const key = file.name + file.size;
    if (keys.has(key)) return false;
    keys.add(key);
    const n = fromName(file.name);
    songs.push({ key, title: n.title, artist: n.artist, cover: null, src: URL.createObjectURL(file), file, tagged: false });
    return true;
  }

  const readTags = file => new Promise(res => {
    const t = setTimeout(() => res({}), 3000);
    const done = v => { clearTimeout(t); res(v); };
    try {
      if (!window.jsmediatags) return done({});
      jsmediatags.read(file, {
        onSuccess: ({ tags }) => {
          let cover = null;
          try {
            if (tags.picture) {
              const { data, format } = tags.picture;
              cover = URL.createObjectURL(new Blob([new Uint8Array(data)], { type: format }));
            }
          } catch {}
          done({ title: clean(tags.title), artist: clean(tags.artist), cover });
        },
        onError: () => done({})
      });
    } catch { done({}); }
  });

  let enriching = false;
  async function enrich() {
    if (enriching) return;
    enriching = true;
    let c = 0;
    for (const s of songs) {
      if (s.tagged) continue;
      s.tagged = true;
      const t = await readTags(s.file);
      if (t.title) s.title = t.title;
      if (t.artist) s.artist = t.artist;
      if (t.cover) s.cover = t.cover;
      if (++c % 20 === 0) refresh();
    }
    refresh();
    enriching = false;
  }

  // ---------- Estado (se guarda por clave, no por posición) ----------
  let cur = 0, view = 'all', query = '', shuffle = false, repeat = false;
  let recent = store.get('recentK') || [];
  const liked = new Set(store.get('likedK') || []);

  const indexOfKey = k => songs.findIndex(s => s.key === k);

  const visible = () => {
    let ids = songs.map((_, i) => i);
    if (view === 'recent') ids = recent.map(indexOfKey).filter(i => i >= 0);
    if (view === 'rec') ids = ids.filter(i => !recent.includes(songs[i].key));
    const q = query.trim().toLowerCase();
    return q ? ids.filter(i => `${songs[i].title} ${songs[i].artist}`.toLowerCase().includes(q)) : ids;
  };

  // ---------- Dibujo ----------
  function renderList() {
    const L = $('#lista'), top = L.scrollTop, ids = visible();
    L.innerHTML = ids.length
      ? ids.map((i, k) => `<li data-i="${i}" class="${i === cur ? 'on' : ''}" tabindex="0" role="button" aria-label="Reproducir ${esc(songs[i].title)}">
          <span class="n"><span class="num">${pad(k + 1)}</span><i class="eq"><b></b><b></b><b></b></i></span>
          ${img(songs[i].cover)}<p>${esc(songs[i].title)}<br><span class="mut">${esc(songs[i].artist)}</span></p></li>`).join('')
      : '<li class="empty">No hay canciones para mostrar.</li>';
    L.scrollTop = top;
  }

  function renderRows() {
    const rank = s => (liked.has(s.key) ? 2 : 0) + (recent.includes(s.key) ? 1 : 0);
    const popular = songs.map((s, i) => i).sort((a, b) => rank(songs[b]) - rank(songs[a])).slice(0, 20);
    $('#songs').innerHTML = popular.map(i => `<button class="card ${i === cur ? 'on' : ''}" data-i="${i}">
      ${img(songs[i].cover, songs[i].title)}<p>${esc(songs[i].title)}</p><span>${esc(songs[i].artist)}</span></button>`).join('');

    const by = new Map();
    songs.forEach(s => { const o = by.get(s.artist) || { s, n: 0 }; o.n++; if (!o.s.cover && s.cover) o.s = s; by.set(s.artist, o); });
    const artists = [...by.values()].sort((a, b) => b.n - a.n).slice(0, 20);
    $('#artists').innerHTML = artists.map(({ s, n }) => `<button class="card art" data-artist="${esc(s.artist)}">
      ${img(s.cover, s.artist)}<p>${esc(s.artist)}</p><span>${n} ${n === 1 ? 'canción' : 'canciones'}</span></button>`).join('');
    updateArrows();
  }

  function setCovers(cover, alt) {
    $('#hCover').outerHTML = img(cover, alt).replace('<img', '<img id="hCover"');
    $('#pCover').outerHTML = img(cover, '').replace('<img', '<img id="pCover"');
    $('#hero').style.setProperty('--bg', `url("${cover || NO}")`);
  }

  function refresh() {
    renderList(); renderRows();
    const s = songs[cur];
    if (s) $('#hTitle').textContent = $('#pTitle').textContent = s.title, $('#hArtist').textContent = $('#pArtist').textContent = s.artist;
  }

  function centerActive() {
    const L = $('#lista'), li = L.querySelector('.on');
    if (li) L.scrollTop = li.offsetTop - L.clientHeight / 2 + li.clientHeight / 2;
  }

  // ---------- Reproducción ----------
  function load(i, go) {
    if (!songs.length) {
      setCovers(null, '');
      $('#hTitle').textContent = $('#pTitle').textContent = 'Añade tu música';
      $('#hArtist').textContent = $('#pArtist').textContent = 'Toca “Buscar música”';
      renderList(); renderRows();
      return;
    }
    cur = (i + songs.length) % songs.length;
    const s = songs[cur];
    A.src = s.src;
    setCovers(s.cover, `Portada de ${s.title}`);
    $('#hTitle').textContent = $('#pTitle').textContent = s.title;
    $('#hArtist').textContent = $('#pArtist').textContent = s.artist;
    document.title = `${s.title} · ${s.artist}`;
    store.set('lastK', s.key);
    if (go) {
      recent = [s.key, ...recent.filter(k => k !== s.key)].slice(0, 100);
      store.set('recentK', recent);
    }
    renderList(); renderRows(); syncLike(); centerActive();
    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: s.title, artist: s.artist, artwork: s.cover ? [{ src: s.cover }] : []
        });
      } catch {}
    }
    if (go) A.play().catch(() => {});
  }

  const step = d => {
    if (!songs.length) return;
    if (shuffle && songs.length > 1) { let r; do r = Math.floor(Math.random() * songs.length); while (r === cur); return load(r, true); }
    load(cur + d, true);
  };
  const toggle = () => { if (songs.length) A.paused ? A.play().catch(() => {}) : A.pause(); };
  const prev = () => A.currentTime > 3 ? (A.currentTime = 0) : step(-1);

  A.addEventListener('play', () => ui(true));
  A.addEventListener('pause', () => ui(false));
  A.addEventListener('ended', () => repeat ? (A.currentTime = 0, A.play()) : step(1));
  A.addEventListener('loadedmetadata', tick);
  A.addEventListener('timeupdate', tick);

  function ui(on) {
    document.body.classList.toggle('playing', on);
    $('#bPlay').innerHTML = ico(on ? 'pause' : 'play');
    $('#bPlay').setAttribute('aria-label', on ? 'Pausar' : 'Reproducir');
    $('#hPlay').innerHTML = `${ico(on ? 'pause' : 'play')}${on ? 'Pausar' : 'Play'}`;
  }

  function tick() {
    const d = A.duration, ok = isFinite(d) && d > 0;
    const p = ok ? A.currentTime / d * 1000 : 0;
    $('#seek').value = p; $('#seek').style.setProperty('--p', p / 10 + '%');
    $('#tCur').textContent = fmt(A.currentTime || 0);
    $('#tLeft').textContent = ok ? '-' + fmt(d - A.currentTime) : '-0:00';
  }

  function syncLike() {
    const on = !!songs[cur] && liked.has(songs[cur].key);
    $('#hLike').setAttribute('aria-pressed', on);
    $('#hLike').innerHTML = `${ico('heart')}${on ? 'Te gusta' : 'Me gusta'}`;
  }

  // ---------- Carruseles ----------
  function updateArrows() {
    ['songs', 'artists'].forEach(id => {
      const r = document.getElementById(id), max = r.scrollWidth - r.clientWidth - 2;
      document.querySelector(`[data-t="${id}"][data-d="-1"]`).disabled = r.scrollLeft <= 2;
      document.querySelector(`[data-t="${id}"][data-d="1"]`).disabled = r.scrollLeft >= max;
    });
  }
  document.querySelectorAll('[data-t]').forEach(b => b.addEventListener('click', () => {
    const r = document.getElementById(b.dataset.t);
    r.scrollBy({ left: b.dataset.d * r.clientWidth * .8 });
  }));
  ['songs', 'artists'].forEach(id => document.getElementById(id).addEventListener('scroll', updateArrows, { passive: true }));
  addEventListener('resize', updateArrows);

  // ---------- Buscar música ----------
  async function* walk(dir, depth = 0) {
    for await (const [name, h] of dir.entries()) {
      if (h.kind === 'file') { if (AUDIO_EXT.test(name)) yield h; }
      else if (depth < 6 && !name.startsWith('.')) yield* walk(h, depth + 1);
    }
  }

  async function scanFolder(dir) {
    const first = songs.length;
    let n = 0;
    status('Buscando canciones…');
    for await (const fh of walk(dir)) {
      try { if (addQuick(await fh.getFile())) n++; } catch {}
      if (n && n % 25 === 0) {
        status(`Encontradas ${n}…`);
        if (first === 0 && songs.length === 25) load(0, false);
        refresh(); await wait();
      }
    }
    if (first === 0 && songs.length) load(0, false); else refresh();
    status(n ? `Listo: ${n} canciones nuevas (${songs.length} en total).` : 'No se encontraron canciones nuevas.');
    enrich();
  }

  async function addPickedFiles(list) {
    const files = [...list].filter(f => f.type.startsWith('audio/') || AUDIO_EXT.test(f.name));
    if (!files.length) { status('No elegiste archivos de audio.'); return; }
    const first = songs.length;
    let n = 0;
    for (const f of files) {
      if (addQuick(f)) { n++; await idb.add(f); }
      if (n && n % 25 === 0) { status(`Cargando ${n} de ${files.length}…`); await wait(); }
    }
    if (first === 0 && songs.length) load(0, false); else refresh();
    status(`Listo: ${n} canciones nuevas (${songs.length} en total).`);
    enrich();
  }

  $('#scan').addEventListener('click', async () => {
    if (window.showDirectoryPicker) {
      try {
        let dir = await idb.getMeta('dir');
        if (dir) {
          const p = await dir.requestPermission({ mode: 'read' });
          if (p !== 'granted') dir = null;
        }
        if (!dir) {
          dir = await showDirectoryPicker({ mode: 'read' });
          await idb.setMeta('dir', dir);
        }
        await scanFolder(dir);
      } catch (e) {
        if (e.name !== 'AbortError') status('No se pudo leer la carpeta: ' + e.message);
      }
    } else {
      status('Elige tus canciones (usa “Seleccionar todo” en la categoría Audio).');
      $('#files').click();
    }
  });

  $('#files').addEventListener('change', async e => {
    try { await addPickedFiles(e.target.files); }
    catch (err) { status('Error: ' + err.message); }
    e.target.value = '';
  });

  $('#clearMine').addEventListener('click', async () => {
    if (confirm('¿Quitar toda la música que agregaste?')) { await idb.clearAll(); location.reload(); }
  });

  // ---------- Eventos ----------
  $('#lista').addEventListener('click', e => {
    const li = e.target.closest('li[data-i]'); if (!li) return;
    const i = +li.dataset.i;
    i === cur ? toggle() : load(i, true);
  });
  $('#lista').addEventListener('keydown', e => { if (e.key === 'Enter') e.target.click(); });
  $('#songs').addEventListener('click', e => {
    const c = e.target.closest('[data-i]'); if (c) +c.dataset.i === cur ? toggle() : load(+c.dataset.i, true);
  });
  $('#artists').addEventListener('click', e => {
    const c = e.target.closest('[data-artist]'); if (!c) return;
    $('#buscar').value = query = c.dataset.artist; view = 'all'; syncMenu(); renderList();
    $('#lista').scrollTop = 0;
    $('#lista').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  const syncMenu = () => document.querySelectorAll('.menu button').forEach(b => {
    const on = b.dataset.view === view; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on);
  });
  document.querySelectorAll('.menu button').forEach(b => b.addEventListener('click', () => { view = b.dataset.view; syncMenu(); renderList(); }));
  $('#buscar').addEventListener('input', e => { query = e.target.value; renderList(); });

  $('#bPlay').onclick = $('#hPlay').onclick = toggle;
  $('#bNext').onclick = () => step(1);
  $('#bPrev').onclick = prev;
  $('#bShuffle').onclick = e => { shuffle = !shuffle; e.currentTarget.setAttribute('aria-pressed', shuffle); };
  $('#bRepeat').onclick = e => { repeat = !repeat; e.currentTarget.setAttribute('aria-pressed', repeat); };
  $('#hLike').onclick = () => {
    const k = songs[cur]?.key; if (!k) return;
    liked.has(k) ? liked.delete(k) : liked.add(k);
    store.set('likedK', [...liked]); syncLike(); renderRows();
  };

  $('#seek').addEventListener('input', e => { if (isFinite(A.duration)) A.currentTime = e.target.value / 1000 * A.duration; });
  const vol = $('#volume');
  vol.addEventListener('input', () => { A.volume = +vol.value; vol.style.setProperty('--p', vol.value * 100 + '%'); store.set('vol', vol.value); });

  addEventListener('keydown', e => {
    if (/INPUT|TEXTAREA/.test(e.target.tagName) && e.target.type !== 'range') return;
    if (e.code === 'Space' && !/BUTTON|LABEL/.test(e.target.tagName)) { e.preventDefault(); toggle(); }
    if (e.code === 'ArrowRight' && e.target.type !== 'range') A.currentTime += 5;
    if (e.code === 'ArrowLeft' && e.target.type !== 'range') A.currentTime -= 5;
  });

  if ('mediaSession' in navigator) {
    const m = navigator.mediaSession;
    try {
      m.setActionHandler('play', toggle); m.setActionHandler('pause', toggle);
      m.setActionHandler('previoustrack', prev); m.setActionHandler('nexttrack', () => step(1));
    } catch {}
  }

  // ---------- Inicio ----------
  (async () => {
    vol.value = store.get('vol') ?? .7; vol.dispatchEvent(new Event('input'));
    ui(false);
    load(0, false);

    const restore = () => {
      const i = indexOfKey(store.get('lastK'));
      load(i >= 0 ? i : 0, false);
    };

    try {
      for (const r of await idb.all()) {
        const f = r.blob instanceof File ? r.blob : new File([r.blob], r.name, { type: r.blob.type });
        addQuick(f);
      }
      if (songs.length) { restore(); status(`${songs.length} canciones guardadas.`); enrich(); }

      const dir = await idb.getMeta('dir');
      if (dir) {
        if ((await dir.queryPermission({ mode: 'read' })) === 'granted') { await scanFolder(dir); restore(); }
        else status('Toca “Buscar música” para volver a cargar tu carpeta.');
      }
      if (navigator.storage?.persist) navigator.storage.persist();
    } catch (err) {
      status('Error al iniciar: ' + err.message);
    }
  })();
})();