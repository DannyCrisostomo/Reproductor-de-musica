(() => {
  const $ = s => document.querySelector(s);
  const P = [new Audio(), new Audio()]; // dos reproductores para poder mezclar
  let act = 0;
  const cp = () => P[act];
  const songs = [];
  const pad = n => String(n).padStart(2, '0');
  const fmt = s => `${Math.floor(s / 60)}:${pad(Math.floor(s % 60))}`;
  const clamp = v => Math.min(1, Math.max(0, v));
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clean = v => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, '').trim() : '');
  const ico = (n, c = '') => `<svg class="i ${c}"><use href="#${n}"/></svg>`;
  const NO = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><defs><linearGradient id="g"><stop stop-color="#00ffde"/><stop offset="1" stop-color="#6a2cff"/></linearGradient></defs><rect width="1" height="1" fill="url(#g)"/></svg>');
  // Portada automática (color + inicial) para canciones sin imagen incrustada. Funciona sin internet.
  const genCache = new Map();
  const gen = (title, artist) => {
    const base = artist && artist !== 'Mi música' ? artist : (title || '?');
    if (genCache.has(base)) return genCache.get(base);
    let h = 0;
    for (const c of base) h = (h * 31 + c.charCodeAt(0)) % 360;
    const letra = ((base.match(/[A-Za-z0-9ÁÉÍÓÚÑáéíóúñ]/) || ['♪'])[0]).toUpperCase();
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${h},75%,48%)"/><stop offset="1" stop-color="hsl(${(h + 55) % 360},75%,28%)"/></linearGradient></defs><rect width="100" height="100" fill="url(#g)"/><text x="50" y="50" dy=".35em" text-anchor="middle" font-family="sans-serif" font-weight="700" font-size="46" fill="rgba(255,255,255,.88)">${letra}</text></svg>`;
    const uri = 'data:image/svg+xml,' + encodeURIComponent(svg);
    genCache.set(base, uri);
    return uri;
  };
  const img = (src, alt = '', fb) => `<img src="${src || fb || NO}" alt="${esc(alt)}" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='${fb || NO}'">`;
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

  // Lee título, artista y portada incrustados en el archivo.
  // Devuelve además una marca para saber qué pasó: leido | error | lento | sinLib
  const readTags = file => new Promise(res => {
    const t = setTimeout(() => res({ lento: true }), 8000);
    const done = v => { clearTimeout(t); res(v); };
    try {
      if (!window.jsmediatags) return done({ sinLib: true });
      jsmediatags.read(file, {
        onSuccess: ({ tags }) => {
          let cover = null;
          try {
            if (tags.picture) {
              const { data, format } = tags.picture;
              cover = URL.createObjectURL(new Blob([new Uint8Array(data)], { type: format }));
            }
          } catch {}
          done({ title: clean(tags.title), artist: clean(tags.artist), cover, leido: true });
        },
        onError: () => done({ error: true })
      });
    } catch { done({ error: true }); }
  });

  let enriching = false;
  async function enrich() {
    if (enriching) return;
    enriching = true;
    const r = { leidos: 0, portadas: 0, errores: 0, lentas: 0, sinLib: false };
    let c = 0;
    for (const s of songs) {
      if (s.tagged) continue;
      s.tagged = true;
      const t = await readTags(s.file);
      if (t.sinLib) r.sinLib = true;
      if (t.error) r.errores++;
      if (t.lento) r.lentas++;
      if (t.leido) r.leidos++;
      if (t.title) s.title = t.title;
      if (t.artist) s.artist = t.artist;
      if (t.cover) { s.cover = t.cover; r.portadas++; }
      if (++c % 20 === 0) { refresh(); status(`Leyendo datos… ${c} de ${songs.length}`); }
    }
    refresh();
    enriching = false;
    status(
      r.sinLib
        ? 'El lector de portadas NO cargó.'
        : `Leídas: ${r.leidos} · con portada: ${r.portadas} · errores: ${r.errores} · lentas: ${r.lentas}`
    );
  }

  // ---------- Estado ----------
  let cur = 0, view = 'all', query = '', repeat = false;
  let shuffle = !!store.get('shuf');
  let bag = [];          // canciones pendientes en modo aleatorio
  const hist = [];       // canciones ya reproducidas (para "anterior")
  let recent = store.get('recentK') || [];
  const liked = new Set(store.get('likedK') || []);
  const indexOfKey = k => songs.findIndex(s => s.key === k);

  // ---------- Mezcla entre canciones (crossfade) ----------
  const canFade = (() => { const t = new Audio(); t.volume = 0.5; return t.volume === 0.5; })();
  let userVol = 0.7;
  let xf = canFade ? Number(store.get('xf20') ?? 20) : 0;
  let xfading = false, xfDur = 20, fadeTimer = null;

  function nextIndex() {
    const n = songs.length;
    if (!n) return null;
    if (!shuffle || n === 1) return (cur + 1) % n;
    if (!bag.length) {
      bag = [...songs.keys()].filter(i => i !== cur);
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
    }
    let i = bag.pop();
    if (i === cur && bag.length) i = bag.pop();
    return i;
  }

  function applyFade() {
    if (!xfading) return;
    const old = P[1 - act], now = cp();
    const rem = old.duration - old.currentTime;
    if (!isFinite(rem)) return;
    if (rem <= 0.05) return endFade();
    const pr = clamp(1 - rem / xfDur);
    old.volume = clamp(userVol * Math.cos(pr * Math.PI / 2));
    now.volume = clamp(userVol * Math.sin(pr * Math.PI / 2));
  }

  function endFade() {
    clearInterval(fadeTimer);
    xfading = false;
    const old = P[1 - act];
    old.pause();
    try { old.currentTime = 0; } catch {}
    old.volume = userVol;
    cp().volume = userVol;
  }

  function checkFade(p) {
    if (xfading) return applyFade();
    const d = p.duration, rem = d - p.currentTime;
    if (xf > 0 && !repeat && !p.paused && songs.length > 1 && isFinite(d) && d >= xf * 2 && rem <= xf && rem > 0.3) startFade();
  }

  function startFade() {
    const n = nextIndex();
    if (n == null) return;
    const old = cp();
    xfDur = Math.max(0.5, Math.min(xf, old.duration - old.currentTime));
    hist.push(cur); if (hist.length > 200) hist.shift();
    act = 1 - act;
    xfading = true;
    showTrack(n, true);
    const p = cp();
    p.src = songs[cur].src;
    p.volume = 0;
    p.play().catch(() => {});
    clearInterval(fadeTimer);
    fadeTimer = setInterval(applyFade, 100);
  }

  // ---------- Dibujo ----------
  const visible = () => {
    let ids = songs.map((_, i) => i);
    if (view === 'recent') ids = recent.map(indexOfKey).filter(i => i >= 0);
    if (view === 'rec') ids = ids.filter(i => !recent.includes(songs[i].key));
    const q = query.trim().toLowerCase();
    return q ? ids.filter(i => `${songs[i].title} ${songs[i].artist}`.toLowerCase().includes(q)) : ids;
  };

  function renderList() {
    const L = $('#lista'), top = L.scrollTop, ids = visible();
    L.innerHTML = ids.length
      ? ids.map((i, k) => `<li data-i="${i}" class="${i === cur ? 'on' : ''}" tabindex="0" role="button" aria-label="Reproducir ${esc(songs[i].title)}">
          <span class="n"><span class="num">${pad(k + 1)}</span><i class="eq"><b></b><b></b><b></b></i></span>
          ${img(songs[i].cover, '', gen(songs[i].title, songs[i].artist))}<p>${esc(songs[i].title)}<br><span class="mut">${esc(songs[i].artist)}</span></p></li>`).join('')
      : '<li class="empty">No hay canciones para mostrar.</li>';
    L.scrollTop = top;
  }

  function renderRows() {
    const rank = s => (liked.has(s.key) ? 2 : 0) + (recent.includes(s.key) ? 1 : 0);
    const popular = songs.map((s, i) => i).sort((a, b) => rank(songs[b]) - rank(songs[a])).slice(0, 20);
    $('#songs').innerHTML = popular.map(i => `<button class="card ${i === cur ? 'on' : ''}" data-i="${i}">
      ${img(songs[i].cover, songs[i].title, gen(songs[i].title, songs[i].artist))}<p>${esc(songs[i].title)}</p><span>${esc(songs[i].artist)}</span></button>`).join('');

    const by = new Map();
    songs.forEach(s => { const o = by.get(s.artist) || { s, n: 0 }; o.n++; if (!o.s.cover && s.cover) o.s = s; by.set(s.artist, o); });
    const artists = [...by.values()].sort((a, b) => b.n - a.n).slice(0, 20);
    $('#artists').innerHTML = artists.map(({ s, n }) => `<button class="card art" data-artist="${esc(s.artist)}">
      ${img(s.cover, s.artist, gen(s.artist, s.artist))}<p>${esc(s.artist)}</p><span>${n} ${n === 1 ? 'canción' : 'canciones'}</span></button>`).join('');
    updateArrows();
  }

  function setCovers(cover, alt, fb) {
    $('#hCover').outerHTML = img(cover, alt, fb).replace('<img', '<img id="hCover"');
    $('#pCover').outerHTML = img(cover, '', fb).replace('<img', '<img id="pCover"');
    $('#hero').style.setProperty('--bg', `url("${cover || fb || NO}")`);
  }

  function refresh() {
    renderList(); renderRows();
    const s = songs[cur];
    if (s) { $('#hTitle').textContent = $('#pTitle').textContent = s.title; $('#hArtist').textContent = $('#pArtist').textContent = s.artist; }
  }

  function centerActive() {
    const L = $('#lista'), li = L.querySelector('.on');
    if (li) L.scrollTop = li.offsetTop - L.clientHeight / 2 + li.clientHeight / 2;
  }

  // Muestra la canción en pantalla (sin tocar el audio)
  function showTrack(i, played) {
    cur = (i + songs.length) % songs.length;
    const s = songs[cur];
    setCovers(s.cover, `Portada de ${s.title}`, gen(s.title, s.artist));
    $('#hTitle').textContent = $('#pTitle').textContent = s.title;
    $('#hArtist').textContent = $('#pArtist').textContent = s.artist;
    document.title = `${s.title} · ${s.artist}`;
    store.set('lastK', s.key);
    if (played) {
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
  }

  // ---------- Reproducción ----------
  function load(i, go, noHist) {
    if (!songs.length) {
      setCovers(null, '');
      $('#hTitle').textContent = $('#pTitle').textContent = 'Añade tu música';
      $('#hArtist').textContent = $('#pArtist').textContent = 'Toca “Buscar música”';
      renderList(); renderRows();
      return;
    }
    endFade();
    const target = (i + songs.length) % songs.length;
    if (go && !noHist && songs[cur] && target !== cur) { hist.push(cur); if (hist.length > 200) hist.shift(); }
    showTrack(target, go);
    const p = cp();
    p.src = songs[cur].src;
    p.volume = userVol;
    if (go) p.play().catch(() => {});
  }

  const step = d => {
    if (!songs.length) return;
    if (d > 0) {
      const n = nextIndex();
      if (n != null) load(n, true);
    } else {
      if (cp().currentTime > 3) { cp().currentTime = 0; return; }
      const h = hist.pop();
      load(h != null ? h : (cur - 1 + songs.length) % songs.length, true, true);
    }
  };

  const toggle = () => {
    if (!songs.length) return;
    const p = cp();
    if (p.paused) { p.play().catch(() => {}); if (xfading) P[1 - act].play().catch(() => {}); }
    else { P[0].pause(); P[1].pause(); }
  };

  P.forEach(p => {
    p.addEventListener('timeupdate', () => { if (p === cp()) { tick(); checkFade(p); } else applyFade(); });
    p.addEventListener('loadedmetadata', () => { if (p === cp()) tick(); });
    p.addEventListener('play', () => { if (p === cp()) ui(true); });
    p.addEventListener('pause', () => { if (p === cp()) ui(false); });
    p.addEventListener('ended', () => {
      if (p !== cp()) return endFade();
      if (repeat) { p.currentTime = 0; p.play(); } else step(1);
    });
  });

  function ui(on) {
    document.body.classList.toggle('playing', on);
    $('#bPlay').innerHTML = ico(on ? 'pause' : 'play');
    $('#bPlay').setAttribute('aria-label', on ? 'Pausar' : 'Reproducir');
    $('#hPlay').innerHTML = `${ico(on ? 'pause' : 'play')}${on ? 'Pausar' : 'Play'}`;
  }

  function tick() {
    const p = cp(), d = p.duration, ok = isFinite(d) && d > 0;
    const v = ok ? p.currentTime / d * 1000 : 0;
    $('#seek').value = v; $('#seek').style.setProperty('--p', v / 10 + '%');
    $('#tCur').textContent = fmt(p.currentTime || 0);
    $('#tLeft').textContent = ok ? '-' + fmt(d - p.currentTime) : '-0:00';
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
  $('#bPrev').onclick = () => step(-1);

  $('#bShuffle').setAttribute('aria-pressed', shuffle);
  $('#bShuffle').onclick = e => {
    shuffle = !shuffle; bag = [];
    store.set('shuf', shuffle);
    e.currentTarget.setAttribute('aria-pressed', shuffle);
    status(shuffle ? 'Modo aleatorio activado.' : 'Modo aleatorio desactivado.');
  };
  $('#bRepeat').onclick = e => { repeat = !repeat; e.currentTarget.setAttribute('aria-pressed', repeat); };

  const xsel = $('#xfade');
  xsel.value = String(xf);
  if (!canFade) { xsel.disabled = true; xsel.title = 'Tu navegador no permite cambiar el volumen por código.'; }
  xsel.addEventListener('change', () => { xf = Number(xsel.value); store.set('xf20', xf); });

  $('#hLike').onclick = () => {
    const k = songs[cur]?.key; if (!k) return;
    liked.has(k) ? liked.delete(k) : liked.add(k);
    store.set('likedK', [...liked]); syncLike(); renderRows();
  };

  $('#seek').addEventListener('input', e => {
    const p = cp();
    if (isFinite(p.duration)) p.currentTime = e.target.value / 1000 * p.duration;
  });

  const vol = $('#volume');
  vol.addEventListener('input', () => {
    userVol = +vol.value;
    vol.style.setProperty('--p', vol.value * 100 + '%');
    store.set('vol', vol.value);
    if (!xfading) cp().volume = userVol;
  });

  addEventListener('keydown', e => {
    if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) && e.target.type !== 'range') return;
    if (e.code === 'Space' && !/BUTTON|LABEL/.test(e.target.tagName)) { e.preventDefault(); toggle(); }
    if (e.code === 'ArrowRight' && e.target.type !== 'range') cp().currentTime += 5;
    if (e.code === 'ArrowLeft' && e.target.type !== 'range') cp().currentTime -= 5;
  });

  if ('mediaSession' in navigator) {
    const m = navigator.mediaSession;
    try {
      m.setActionHandler('play', toggle); m.setActionHandler('pause', toggle);
      m.setActionHandler('previoustrack', () => step(-1)); m.setActionHandler('nexttrack', () => step(1));
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