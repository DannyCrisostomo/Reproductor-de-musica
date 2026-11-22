(() => {
  const $ = s => document.querySelector(s);
  const A = new Audio();
  const pad = n => String(n).padStart(2, '0');
  const fmt = s => `${Math.floor(s / 60)}:${pad(Math.floor(s % 60))}`;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clean = v => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, '').trim() : '');
  const ico = (n, c = '') => `<svg class="i ${c}"><use href="#${n}"/></svg>`;
  const NO = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><defs><linearGradient id="g"><stop stop-color="#00ffde"/><stop offset="1" stop-color="#6a2cff"/></linearGradient></defs><rect width="1" height="1" fill="url(#g)"/></svg>');
  const img = (src, alt = '') => `<img src="${src || NO}" alt="${esc(alt)}" onerror="this.onerror=null;this.src='${NO}'">`;

  const store = {
    get: k => { try { return JSON.parse(localStorage.getItem(k)) } catch { return null } },
    set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch {} }
  };

  // ---------- Guardado de archivos en el celular (IndexedDB) ----------
  let dbp;
  const openDB = () => dbp || (dbp = new Promise((res, rej) => {
    const r = indexedDB.open('playlist-db', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('files', { keyPath: 'id', autoIncrement: true });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.onblocked = () => rej(new Error('blocked'));
  }));
  const idb = {
    async all() {
      try {
        const d = await openDB();
        return await new Promise(res => {
          const q = d.transaction('files').objectStore('files').getAll();
          q.onsuccess = () => res(q.result); q.onerror = () => res([]);
        });
      } catch { return []; }
    },
    async add(file) {
      try {
        const d = await openDB();
        return await new Promise(res => {
          const q = d.transaction('files', 'readwrite').objectStore('files').add({ name: file.name, blob: file });
          q.onsuccess = () => res(true); q.onerror = () => res(false);
        });
      } catch { return false; }
    },
    async clear() {
      try {
        const d = await openDB();
        await new Promise(res => {
          const q = d.transaction('files', 'readwrite').objectStore('files').clear();
          q.onsuccess = q.onerror = () => res();
        });
      } catch {}
    }
  };

  // ---------- Leer datos de cada archivo (con límite de tiempo) ----------
  const keys = new Set();
  const AUDIO_EXT = /\.(mp3|m4a|aac|wav|ogg|opus|flac|wma)$/i;

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

  const fromName = name => {
    const base = name.replace(/\.[^.]+$/, '').replace(/_/g, ' ').trim();
    const p = base.split(' - ');
    return p.length > 1 ? { artist: p[0].trim(), title: p.slice(1).join(' - ').trim() } : { artist: 'Mi música', title: base };
  };

  async function addFile(file) {
    const key = file.name + file.size;
    if (keys.has(key)) return false;
    keys.add(key);
    const t = await readTags(file);
    const n = fromName(file.name);
    songs.push({ title: t.title || n.title, artist: t.artist || n.artist, cover: t.cover || null, src: URL.createObjectURL(file), key });
    return true;
  }

  // ---------- Estado ----------
  let cur = 0, view = 'all', query = '', shuffle = false, repeat = false;
  let recent = [];
  const liked = new Set(store.get('liked') || []);

  // ---------- Lista ----------
  const visible = () => {
    let ids = songs.map((_, i) => i);
    if (view === 'recent') ids = recent.slice();
    if (view === 'rec') ids = ids.filter(i => !recent.includes(i));
    const q = query.trim().toLowerCase();
    return q ? ids.filter(i => `${songs[i].title} ${songs[i].artist}`.toLowerCase().includes(q)) : ids;
  };

  function renderList() {
    const ids = visible();
    $('#lista').innerHTML = ids.length
      ? ids.map((i, k) => `<li data-i="${i}" class="${i === cur ? 'on' : ''}" tabindex="0" role="button" aria-label="Reproducir ${esc(songs[i].title)}">
          <span class="n"><span class="num">${pad(k + 1)}</span><i class="eq"><b></b><b></b><b></b></i></span>
          ${img(songs[i].cover)}<p>${esc(songs[i].title)}<br><span class="mut">${esc(songs[i].artist)}</span></p></li>`).join('')
      : '<li class="empty">No hay canciones para mostrar.</li>';
  }

  function renderRows() {
    $('#songs').innerHTML = songs.map((s, i) => `<button class="card ${i === cur ? 'on' : ''}" data-i="${i}">
      ${img(s.cover, s.title)}<p>${esc(s.title)}</p><span>${esc(s.artist)}</span></button>`).join('');
    const artists = [...new Map(songs.map(s => [s.artist, s])).values()];
    $('#artists').innerHTML = artists.map(s => `<button class="card art" data-artist="${esc(s.artist)}">
      ${img(s.cover, s.artist)}<p>${esc(s.artist)}</p></button>`).join('');
    updateArrows();
  }

  function setCovers(cover, alt) {
    $('#hCover').outerHTML = img(cover, alt).replace('<img', '<img id="hCover"');
    $('#pCover').outerHTML = img(cover, '').replace('<img', '<img id="pCover"');
    $('#hero').style.setProperty('--bg', `url("${cover || NO}")`);
  }

  // ---------- Reproducción ----------
  function load(i, go) {
    if (!songs.length) {
      setCovers(null, '');
      $('#hTitle').textContent = $('#pTitle').textContent = 'Añade tu música';
      $('#hArtist').textContent = $('#pArtist').textContent = 'Toca “Añadir música del celular”';
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
    if (!recent.includes(cur) && go) recent.unshift(cur);
    renderList(); renderRows(); syncLike();
    $('#lista .on')?.scrollIntoView({ block: 'nearest' });
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

  // ---------- Me gusta ----------
  function syncLike() {
    const on = liked.has(cur);
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

  // ---------- Agregar música del celular ----------
  $('#files').addEventListener('change', async e => {
    const files = [...e.target.files].filter(f => f.type.startsWith('audio/') || AUDIO_EXT.test(f.name));
    const lbl = $('#addLbl');
    if (!files.length) return;
    let n = 0;
    try {
      for (const f of files) {
        lbl.textContent = `Cargando ${++n} de ${files.length}…`;
        if (await addFile(f)) {
          await idb.add(f);
          if (songs.length === 1) load(0, false);
        }
      }
    } catch (err) {
      console.error(err);
    }